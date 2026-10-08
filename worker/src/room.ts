/**
 * One Durable Object per live room. It holds the authoritative state, every
 * player's WebSocket, the question deadlines (as alarms), and the Jev calls,
 * and delegates the actual game rules to `engine.ts`.
 */
import { DurableObject } from "cloudflare:workers";
import type {
  ClientMessage,
  CreateRoomRequest,
  HostMessage,
  JoinRequest,
  JoinResponse,
  PlayerMessage,
  RoomInfo,
  ServerMessage,
  WrittenQuestion,
} from "../../shared/protocol";
import { LOBBY_FEED } from "../../shared/protocol";
import {
  RuleError,
  addPlayer,
  applyJudgeResult,
  createRoom,
  currentSegment,
  finishJudging,
  hostAction,
  hostView,
  loadRoom,
  nextDeadline,
  openArena,
  duckHoursProposal,
  setArenaAnswers,
  playerAction,
  playerByToken,
  playerView,
  roomInfo,
  segmentId,
  tick,
  type Effects,
  type RoomState,
} from "./engine";
import { judgeAll, type JevConfig } from "./jev";
import {
  arenaMove,
  arenaSnapshot,
  createArenaSim,
  createLobbySim,
  ensureDuck,
  freezeArena,
  removeDuck,
  unfreezeArena,
  isArenaMove,
  tickArena,
  type ArenaSim,
} from "../../shared/arenaSim";
import { accountsStub } from "./accounts";
import { standingsStub } from "./standings";
import type { Env } from "./index";
import { randomToken, timingSafeEqual } from "./secrets";
import { logEvent } from "./log";

/** Rooms are for one session; storage is wiped a day after creation. */
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
/** Answer arena: simulate and send positions this often. */
const ARENA_TICK_MS = 100;
/** …but full room state (answer counts) at most this often. */
const ARENA_STATE_MS = 300;

type Attachment = { role: "host" } | { role: "player"; playerId: string };

const HOST_MESSAGES = new Set<string>([
  "advance",
  "back",
  "close",
  "showLeaderboard",
  "end",
  "setFinalPoints",
  "rejudge",
  "kick",
  "qnaModerate",
]);
const PLAYER_MESSAGES = new Set<string>(["answer", "qnaAsk", "qnaVote", "outfit"]);

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

type RunningArena = {
  segmentId: string;
  sim: ArenaSim;
  timer: ReturnType<typeof setInterval>;
  last: number;
  lastState: number;
  dirty: boolean;
};

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  /** The answer arena being simulated, if one is open (kept in memory only). */
  private arena: RunningArena | null = null;
  /** The last arena that stopped, kept in case the host goes back into it. */
  private parked: RunningArena | null = null;
  /** Set by "back": resume the parked arena instead of starting afresh. */
  private resume: Effects["resumeArena"] | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = loadRoom(await ctx.storage.get("room"));
    });
    // Answer keep-alive pings without waking the object from hibernation.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'),
    );
  }

  // ---- RPC from the Worker -------------------------------------------------

  /** Returns false if this code is already taken. */
  async init(code: string, hostKey: string, req: CreateRoomRequest): Promise<boolean> {
    if (this.room) return false;
    this.room = createRoom(code, hostKey, req, Date.now());
    logEvent("room_created", { code, segments: req.show.segments.length });
    await this.save();
    return true;
  }

  async info(): Promise<RoomInfo | null> {
    return this.room ? roomInfo(this.room) : null;
  }

  async join(req: JoinRequest): Promise<JoinResponse | { error: string }> {
    if (!this.room) return { error: "Room not found" };
    if (this.room.phase === "ended") return { error: "This game has ended" };
    const account = await accountsStub(this.env).verify(
      String(req?.account?.id ?? ""),
      String(req?.account?.token ?? ""),
    );
    if (!account) return { error: "Please pick yourself again and enter your PIN." };
    // One seat per account: joining again (another device, cleared storage)
    // gets the same seat back.
    const seat = Object.values(this.room.players).find((p) => p.accountId === account.id);
    if (seat?.kicked) return { error: "The host removed you from this game." };
    if (seat) {
      seat.outfit = account.outfit;
      await this.save();
      this.broadcast();
      return { playerId: seat.id, token: seat.token };
    }
    try {
      const player = addPlayer(
        this.room,
        {
          name: account.name,
          teamId: req.teamId,
          duckHolderId: account.holderId,
          accountId: account.id,
          outfit: account.outfit,
          lookIndex: account.lookSeed,
        },
        crypto.randomUUID(),
        randomToken(),
        Date.now(),
      );
      await this.save();
      this.broadcast();
      logEvent("room_join", {
        code: this.room.code,
        players: Object.values(this.room.players).filter((p) => !p.kicked).length,
      });
      return { playerId: player.id, token: player.token };
    } catch (err) {
      if (err instanceof RuleError) return { error: err.message };
      throw err;
    }
  }

  // ---- WebSockets ----------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    if (!this.room) return new Response("Room not found", { status: 404 });

    const url = new URL(request.url);
    const hostKey = url.searchParams.get("host");
    const token = url.searchParams.get("token");
    let attachment: Attachment;
    if (hostKey && timingSafeEqual(hostKey, this.room.hostKey)) {
      attachment = { role: "host" };
    } else if (token) {
      const player = playerByToken(this.room, token);
      if (!player) return new Response("Unknown player", { status: 403 });
      attachment = { role: "player", playerId: player.id };
    } else {
      return new Response("Missing credentials", { status: 401 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    // Joining mid-arena: give them a duck.
    if (attachment.role === "player" && this.arena) ensureDuck(this.arena.sim, attachment.playerId);
    this.syncArena();
    // Everyone else sees this player come online.
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.room || typeof raw !== "string" || raw.length > 10_000) return;
    const who = ws.deserializeAttachment() as Attachment;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === "ping") {
      this.send(ws, { t: "pong", serverNow: Date.now() });
      return;
    }
    if (msg.t === "applyDuckHours") {
      if (who.role === "host") await this.applyDuckHours(ws);
      return;
    }
    if (msg.t === "move") {
      // Arena steps are applied to the live simulation, not stored.
      const arena = this.arena;
      if (who.role !== "player" || !arena || msg.segmentId !== arena.segmentId) return;
      if (!isArenaMove(msg.move)) return;
      ensureDuck(arena.sim, who.playerId);
      arenaMove(arena.sim, who.playerId, msg.move);
      return;
    }

    let effects: Effects;
    try {
      if (who.role === "host" && HOST_MESSAGES.has(msg.t)) {
        effects = hostAction(this.room, msg as HostMessage, {
          now: Date.now(),
          seed: randomSeed(),
          judgeAvailable: this.judgeAvailable,
        });
      } else if (who.role === "player" && PLAYER_MESSAGES.has(msg.t)) {
        effects = playerAction(this.room, who.playerId, msg as PlayerMessage, {
          now: Date.now(),
          connected: this.connected(),
          judgeAvailable: this.judgeAvailable,
          newId: crypto.randomUUID(),
        });
      } else {
        return;
      }
    } catch (err) {
      if (err instanceof RuleError) {
        this.send(ws, { t: "error", message: err.message });
        return;
      }
      throw err;
    }
    await this.commit(effects);
    // Outfits live on the account too, so they come along to the next game.
    if (msg.t === "outfit" && who.role === "player") {
      const p = this.room?.players[who.playerId];
      if (p?.accountId) await accountsStub(this.env).setOutfit(p.accountId, p.outfit ?? null);
    }
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {
      // already closed
    }
    this.leftSocket(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.leftSocket(ws);
  }

  /** A connection went away: let go of their keys; in the lobby, their duck leaves too. */
  private leftSocket(ws: WebSocket) {
    const who = ws.deserializeAttachment() as Attachment | null;
    const arena = this.arena;
    if (who?.role === "player" && arena?.sim.walkers.has(who.playerId)) {
      arenaMove(arena.sim, who.playerId, { held: [] });
      // (Unless they're still here in another tab.)
      if (arena.segmentId === LOBBY_FEED && !this.connected().has(who.playerId)) {
        removeDuck(arena.sim, who.playerId);
      }
    }
    this.broadcast();
    this.syncArena();
  }

  // ---- Alarms: question deadlines and room expiry --------------------------

  async alarm() {
    if (!this.room) return;
    const now = Date.now();
    if (now >= this.room.createdAt + ROOM_TTL_MS) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Room expired");
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    if (this.arena) {
      tickArena(this.arena.sim, 0, now);
      setArenaAnswers(this.room, this.arena.sim.zones);
    }
    await this.commit(
      tick(this.room, { now, seed: randomSeed(), judgeAvailable: this.judgeAvailable }),
    );
  }

  // ---- Internals -----------------------------------------------------------

  private get judgeAvailable(): boolean {
    return Boolean(this.env.JEV_API_KEY);
  }

  private async commit(effects: Effects) {
    await this.save();
    if (effects.disconnect) {
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment;
        if (a.role === "player" && a.playerId === effects.disconnect) {
          ws.close(4001, "Removed by host");
        }
      }
    }
    this.broadcast();
    this.resume = effects.resumeArena ?? null;
    this.syncArena();
    this.resume = null;
    if (effects.startJudging) {
      this.ctx.waitUntil(this.runJudging());
    }
  }

  private async save() {
    if (!this.room) return;
    await this.ctx.storage.put("room", this.room);
    await this.ctx.storage.setAlarm(nextDeadline(this.room) ?? this.room.createdAt + ROOM_TTL_MS);
  }

  private async runJudging() {
    const room = this.room;
    const seg = room && currentSegment(room);
    if (!room?.run || seg?.kind !== "question" || seg.question.type !== "written") return;
    const segId = segmentId(seg);
    const question: WrittenQuestion = seg.question;
    const items = Object.entries(room.run.submissions).flatMap(([playerId, s]) =>
      s.value.type === "written" ? [{ playerId, text: s.value.text }] : [],
    );
    const cfg: JevConfig = {
      apiKey: this.env.JEV_API_KEY!,
      url: this.env.JEV_API_URL,
      model: this.env.JEV_MODEL,
    };
    await judgeAll(cfg, question, items, async (playerId, result) => {
      if (!this.room) return;
      applyJudgeResult(this.room, segId, playerId, result);
      await this.save();
      this.broadcast();
    });
    if (!this.room) return;
    finishJudging(this.room, segId);
    await this.save();
    this.broadcast();
  }

  /**
   * The game's over: its final standings become the new Ceramic Duck Hours
   * ranks (time banked, newcomers added to the board, absentees benched).
   * Once per game.
   */
  private applyingDuckHours = false;
  private async applyDuckHours(ws: WebSocket) {
    const room = this.room;
    if (!room) return;
    const refuse = (message: string) => this.send(ws, { t: "error", message });
    if (room.phase !== "ended") return refuse("Finish the game first.");
    if (room.duckHours || this.applyingDuckHours) return refuse("This game is already in the Duck Hours standings.");
    const ranked = duckHoursProposal(room);
    if (ranked.length === 0) return refuse("Nobody here to rank.");
    this.applyingDuckHours = true;
    try {
      const now = Date.now();
      const res = await standingsStub(this.env).applyQuiz(
        ranked.map(({ holderId, name, rank }) => ({ holderId, name, rank })),
        now,
      );
      if ("error" in res) return refuse(res.error);
      // Newcomers now have an entry on the board: link it to them.
      await Promise.all(
        res.holderIds.map(async (holderId, i) => {
          const p = room.players[ranked[i].playerId];
          if (!p || p.duckHolderId) return;
          p.duckHolderId = holderId;
          if (p.accountId) await accountsStub(this.env).setHolder(p.accountId, holderId);
        }),
      );
      room.duckHours = { appliedAt: now, ranks: ranked.map(({ playerId, rank }) => ({ playerId, rank })) };
      logEvent("duck_hours_applied", { code: room.code, players: ranked.length });
      await this.save();
      this.broadcast();
    } finally {
      this.applyingDuckHours = false;
    }
  }

  /** Start or stop the arena simulation to match the room. */
  private syncArena() {
    const room = this.room;
    const open = room ? openArena(room) : null;
    // In the lobby, whoever's connected waddles about an open patch to get
    // used to the controls.
    const connected = this.connected();
    const lobby = !open && room?.phase === "lobby" && connected.size > 0;
    const want = open ? open.segmentId : lobby ? LOBBY_FEED : null;
    if (this.arena && this.arena.segmentId !== want) {
      // Answers are in: every duck stops dead where it stands, and one last
      // snapshot tells everyone (otherwise they'd keep waddling on screen).
      clearInterval(this.arena.timer);
      freezeArena(this.arena.sim);
      this.sendSnapshot(this.arena, Date.now());
      this.parked = this.arena.segmentId === LOBBY_FEED ? null : this.arena;
      this.arena = null;
    }
    if (!want || this.arena || !room) return;
    // Spawn ducks for everyone connected, in join order so spots are stable.
    const ids = Object.values(room.players)
      .filter((p) => !p.kicked && connected.has(p.id))
      .sort((a, b) => (a.lookIndex ?? 0) - (b.lookIndex ?? 0))
      .map((p) => p.id);
    const now = Date.now();
    // Back into an arena that was locked too early: everyone where they stood.
    const parked = this.parked;
    if (this.resume && parked && parked.segmentId === want && this.resume.segmentId === want) {
      unfreezeArena(parked.sim, this.resume.pausedMs);
      for (const id of ids) ensureDuck(parked.sim, id);
      parked.last = now;
      parked.timer = setInterval(() => this.arenaTick(), ARENA_TICK_MS);
      this.arena = parked;
      this.parked = null;
      return;
    }
    this.arena = {
      segmentId: want,
      sim: open ? createArenaSim(open.options.length, ids, open.players) : createLobbySim(ids),
      timer: setInterval(() => this.arenaTick(), ARENA_TICK_MS),
      last: now,
      lastState: now,
      dirty: false,
    };
  }

  private arenaTick() {
    const arena = this.arena;
    const room = this.room;
    if (!arena || !room) return;
    const now = Date.now();
    const dt = Math.min(0.25, (now - arena.last) / 1000);
    arena.last = now;
    if (tickArena(arena.sim, dt, now)) {
      // Answers follow the ducks; persisted when the question closes.
      if (setArenaAnswers(room, arena.sim.zones)) arena.dirty = true;
    }
    this.sendSnapshot(arena, now);
    if (arena.dirty && now - arena.lastState >= ARENA_STATE_MS) {
      arena.dirty = false;
      arena.lastState = now;
      this.broadcast();
    }
  }

  private sendSnapshot(arena: RunningArena, now: number) {
    const payload = JSON.stringify({
      t: "arena",
      segmentId: arena.segmentId,
      at: now,
      ducks: arenaSnapshot(arena.sim),
    } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(payload);
      } catch {
        // closing; cleaned up elsewhere
      }
    }
  }

  private connected(): Set<string> {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (a.role === "player" && ws.readyState === WebSocket.OPEN) ids.add(a.playerId);
    }
    return ids;
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket already closing; it will be cleaned up.
    }
  }

  private broadcast() {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    const connected = this.connected();
    let hostPayload: string | null = null;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const a = ws.deserializeAttachment() as Attachment;
      if (a.role === "host") {
        hostPayload ??= JSON.stringify({
          t: "state",
          view: hostView(room, connected, now, this.judgeAvailable),
        } satisfies ServerMessage);
        ws.send(hostPayload);
      } else {
        this.send(ws, { t: "state", view: playerView(room, a.playerId, connected, now) });
      }
    }
  }
}
