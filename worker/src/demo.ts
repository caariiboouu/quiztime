/**
 * The public practice arena: one shared Durable Object ("demo") where anyone
 * who opens #/live/arena gets a duck to steer. Questions loop on a timer
 * (walk to an answer, time's up, reveal, next), no host needed, and computer
 * ducks top the crowd up so it's never empty.
 *
 * Everything lives in memory: the loop only runs while someone's connected,
 * and a fresh visitor after a quiet spell simply starts a new round.
 */
import { DurableObject } from "cloudflare:workers";
import { addBot, createBots, thinkBots, type Bots } from "../../shared/arenaBots";
import {
  arenaMove,
  arenaSnapshot,
  createArenaSim,
  ensureDuck,
  freezeArena,
  isArenaMove,
  removeDuck,
  tickArena,
  type ArenaSim,
} from "../../shared/arenaSim";
import {
  DEMO_FILL,
  DEMO_MAX_PLAYERS,
  DEMO_NAMES,
  DEMO_OPEN_SEC,
  DEMO_QUESTIONS,
  DEMO_REVEAL_SEC,
  demoSegmentId,
  type DemoClientMessage,
  type DemoDuck,
  type DemoServerMessage,
  type DemoState,
} from "../../shared/demo";
import type { Env } from "./index";
import { logEvent } from "./log";

const TICK_MS = 100;
/** Per connection: more messages than this in a second are dropped. */
const MAX_MESSAGES_PER_SEC = 40;
/** Names people type for their practice duck. */
const MAX_PRACTICE_NAME = 20;

type Visitor = { ws: WebSocket; duck: DemoDuck; window: number; count: number };

export class Demo extends DurableObject<Env> {
  private visitors = new Map<string, Visitor>();
  private bots: DemoDuck[] = [];
  private brain: Bots = createBots([]);
  private sim: ArenaSim | null = null;
  private round = 0;
  private question = Math.floor(Math.random() * DEMO_QUESTIONS.length);
  private phase: "open" | "reveal" = "open";
  private endsAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private nextLook = 0;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    if (this.visitors.size >= DEMO_MAX_PLAYERS) {
      logEvent("practice_full", { people: this.visitors.size });
      this.send(server, { t: "full" });
      server.close(4002, "Practice arena is full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const asked = new URL(request.url).searchParams.get("name");
    const duck: DemoDuck = {
      id: crypto.randomUUID(),
      name: this.nameFor(asked),
      lookIndex: this.nextLook++,
      bot: false,
    };
    const visitor: Visitor = { ws: server, duck, window: 0, count: 0 };
    this.visitors.set(duck.id, visitor);
    server.addEventListener("message", (ev) => this.onMessage(visitor, ev.data));
    const leave = () => this.leave(duck.id);
    server.addEventListener("close", leave);
    server.addEventListener("error", leave);
    logEvent("practice_join", { people: this.visitors.size, named: Boolean(asked?.trim()) });

    if (!this.timer) {
      this.startRound(Date.now());
      this.last = Date.now();
      this.timer = setInterval(() => this.tick(), TICK_MS);
    } else if (this.sim) {
      // Joining mid-round: a duck in the huddle straight away.
      ensureDuck(this.sim, duck.id);
      this.sendSnapshot();
    }
    this.broadcastState();
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(v: Visitor, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    const now = Date.now();
    if (now - v.window > 1000) {
      v.window = now;
      v.count = 0;
    }
    if (++v.count > MAX_MESSAGES_PER_SEC) return;
    let msg: DemoClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.t !== "move" || msg.round !== this.round || !this.sim || !isArenaMove(msg.move)) return;
    arenaMove(this.sim, v.duck.id, msg.move);
  }

  private leave(id: string) {
    if (!this.visitors.delete(id)) return;
    if (this.sim) removeDuck(this.sim, id);
    logEvent("practice_leave", { people: this.visitors.size });
    if (this.visitors.size === 0) {
      // Nobody watching: stop until the next visitor.
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.sim = null;
      return;
    }
    this.broadcastState();
  }

  private taken(): Set<string> {
    const names = new Set([...this.visitors.values()].map((v) => v.duck.name.toLowerCase()));
    for (const b of this.bots) names.add(b.name.toLowerCase());
    return names;
  }

  /** The name they typed (tidied, and numbered if someone has it), or a random duck name. */
  private nameFor(asked: string | null): string {
    const clean = (asked ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_PRACTICE_NAME)
      .trim();
    if (!clean) return this.freeName();
    const taken = this.taken();
    if (!taken.has(clean.toLowerCase())) return clean;
    for (let n = 2; ; n++) {
      const numbered = `${clean.slice(0, MAX_PRACTICE_NAME - 3)} ${n}`;
      if (!taken.has(numbered.toLowerCase())) return numbered;
    }
  }

  private freeName(): string {
    const taken = this.taken();
    const free = DEMO_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    if (free.length) return free[Math.floor(Math.random() * free.length)];
    return `Duck ${this.nextLook + 1}`;
  }

  /** A new question: fresh arena, and computer ducks to make up the numbers. */
  private startRound(now: number) {
    this.round++;
    this.question = (this.question + 1) % DEMO_QUESTIONS.length;
    this.phase = "open";
    this.endsAt = now + DEMO_OPEN_SEC * 1000;

    const want = Math.max(0, DEMO_FILL - this.visitors.size);
    this.bots = this.bots.slice(0, want);
    while (this.bots.length < want) {
      this.bots.push({
        id: `bot-${this.nextLook}`,
        name: this.freeName(),
        lookIndex: this.nextLook++,
        bot: true,
      });
    }
    const people = [...this.visitors.keys()];
    const ids = [...people, ...this.bots.map((b) => b.id)];
    this.sim = createArenaSim(DEMO_QUESTIONS[this.question].options.length, ids);
    this.brain = createBots([]);
    for (const b of this.bots) addBot(this.brain, b.id, 0);
    logEvent("practice_round", { round: this.round, people: people.length, bots: this.bots.length });
    this.broadcastState();
  }

  private tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const sim = this.sim;
    if (!sim) return;
    if (this.phase === "open") {
      thinkBots(sim, this.brain, DEMO_QUESTIONS[this.question].correct);
      tickArena(sim, dt, now);
      if (now >= this.endsAt) {
        // Time's up: everyone stops dead where they stand.
        freezeArena(sim);
        this.phase = "reveal";
        this.endsAt = now + DEMO_REVEAL_SEC * 1000;
        this.broadcastState();
      }
      this.sendSnapshot();
    } else if (now >= this.endsAt) {
      this.startRound(now);
      this.sendSnapshot();
    }
  }

  private sendSnapshot() {
    if (!this.sim) return;
    const payload = JSON.stringify({
      t: "arena",
      segmentId: demoSegmentId(this.round),
      at: Date.now(),
      ducks: arenaSnapshot(this.sim),
    } satisfies DemoServerMessage);
    for (const v of this.visitors.values()) this.sendRaw(v.ws, payload);
  }

  private broadcastState() {
    const q = DEMO_QUESTIONS[this.question];
    const ducks = [...[...this.visitors.values()].map((v) => v.duck), ...this.bots];
    const base: Omit<DemoState, "you"> = {
      t: "demo",
      round: this.round,
      question: { prompt: q.prompt, options: q.options },
      phase: this.phase,
      endsAt: this.endsAt,
      serverNow: Date.now(),
      correct: this.phase === "reveal" ? q.correct : null,
      layoutPlayers: this.sim?.expected ?? ducks.length,
      ducks,
    };
    for (const v of this.visitors.values()) this.send(v.ws, { ...base, you: v.duck.id });
  }

  private send(ws: WebSocket, msg: DemoServerMessage) {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private sendRaw(ws: WebSocket, payload: string) {
    try {
      ws.send(payload);
    } catch {
      // closing; the close handler cleans up
    }
  }
}
