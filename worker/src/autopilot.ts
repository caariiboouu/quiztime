/**
 * Autopilot: runs a room with nobody hosting, for the debate & teams practice
 * room (shared/practice.ts). Each step waits a set time and then presses what
 * a host would (balance the teams, next, show the scores), and a finished
 * game starts over with whoever's still there. The game itself is the normal
 * engine; this only decides when to move it on.
 */
import {
  PRACTICE_CODE,
  PRACTICE_JEV_CALLS_PER_DAY,
  PRACTICE_MAX_NAME,
  PRACTICE_SETTINGS,
  PRACTICE_SHOW,
  PRACTICE_TIMING as T,
} from "../../shared/practice";
import { createRoom, currentSegment, hostAction, isJudged, type Effects, type RoomState } from "./engine";

export type Autopilot = {
  /** Where the game was when `at` was set (phase, question, stage). */
  mark: string;
  /** When to move it on; null while waiting (nobody here, or on the question's own clock). */
  at: number | null;
  /** Lobby: the teams have been evened out and the game's about to start. */
  balanced: boolean;
  /** Last time a game started or someone joined; the room's cleared a day after. */
  touchedAt: number;
  /** Jev calls made on `jevDay` (UTC, YYYY-MM-DD), for the daily cap. */
  jevDay: string;
  jevCalls: number;
  /** The next joiner's duck. */
  nextLook: number;
};

export type AutopilotContext = {
  now: number;
  seed: number;
  judgeAvailable: boolean;
  /** Players with the page open right now. */
  connected: Set<string>;
};

export function createPracticeRoom(hostKey: string, now: number): RoomState {
  const room = createRoom(PRACTICE_CODE, hostKey, { show: PRACTICE_SHOW, settings: PRACTICE_SETTINGS }, now);
  room.autopilot = {
    mark: "",
    at: null,
    balanced: false,
    touchedAt: now,
    jevDay: utcDay(now),
    jevCalls: 0,
    nextLook: 0,
  };
  return room;
}

function markOf(state: RoomState): string {
  if (state.phase === "lobby") return `lobby:${state.autopilot?.balanced ? "balanced" : "open"}`;
  return `${state.phase}:${state.cursor}:${state.run?.stage ?? ""}`;
}

function here(state: RoomState, connected: Set<string>): string[] {
  return [...connected].filter((id) => state.players[id] && !state.players[id].kicked);
}

/**
 * Move the game on if its time's up. Returns what the room should do when a
 * step was taken, else null. Either way it may update its own timer (and an
 * untimed question's deadline), so save the room afterwards.
 */
export function autopilotStep(state: RoomState, ctx: AutopilotContext): Effects | null {
  const ap = state.autopilot;
  if (!ap) return null;
  const mark = markOf(state);
  if (mark !== ap.mark) {
    ap.mark = mark;
    ap.at = null;
  }
  if (ap.at === null) ap.at = due(state, ctx);
  else if (state.phase === "lobby" && here(state, ctx.connected).length === 0) ap.at = null;
  if (state.phase === "segment" && state.run?.stage === "open") closeEarlyIfAllIn(state, ctx);
  if (ap.at === null || ctx.now < ap.at) return null;
  ap.at = null;
  return act(state, ctx);
}

/** When the current step should end, or null to wait. */
function due(state: RoomState, ctx: AutopilotContext): number | null {
  const now = ctx.now;
  switch (state.phase) {
    case "lobby":
      // Nobody here: wait for someone.
      if (here(state, ctx.connected).length === 0) return null;
      return now + (state.autopilot?.balanced ? T.balance : T.lobby) * 1000;
    case "leaderboard":
      return now + T.leaderboard * 1000;
    case "ended":
      return now + T.ended * 1000;
    case "segment":
      break;
  }
  const run = state.run;
  const seg = currentSegment(state);
  if (!run || !seg) return null;
  switch (run.stage) {
    case "reading":
      return now + T.reading * 1000;
    case "open":
      // Polls, written answers and debates have no clock of their own: give
      // them one. The room's own deadline then closes the question.
      if (run.closesAt === null && seg.kind === "question") {
        const t = seg.question.type;
        const sec = t === "poll" ? T.poll : t === "written" ? T.written : t === "debate" ? T.debate : null;
        if (sec !== null) run.closesAt = Math.max(run.answersOpenAt, now) + sec * 1000;
      }
      return null;
    case "closed":
      return now + T.closed * 1000;
    case "judging":
      return now + T.judging * 1000;
    case "review":
      return now + T.review * 1000;
    case "revealed":
      // Lightning rounds move themselves on.
      return run.advanceAt !== null ? null : now + T.revealed * 1000;
  }
}

/** Written answers and debates: once everyone here has written something, a short while to finish. */
function closeEarlyIfAllIn(state: RoomState, ctx: AutopilotContext) {
  const run = state.run!;
  const seg = currentSegment(state);
  if (seg?.kind !== "question" || !isJudged(seg.question) || run.closesAt === null) return;
  const ids = here(state, ctx.connected);
  if (ids.length === 0) return;
  const allIn = ids.every((id) => {
    const v = run.submissions[id]?.value;
    return (v?.type === "written" || v?.type === "debate") && v.text.trim() !== "";
  });
  if (allIn) run.closesAt = Math.min(run.closesAt, ctx.now + T.allIn * 1000);
}

function act(state: RoomState, ctx: AutopilotContext): Effects | null {
  const ap = state.autopilot!;
  const press = (t: "advance" | "showLeaderboard" | "balanceTeams") =>
    hostAction(state, { t }, { now: ctx.now, seed: ctx.seed, judgeAvailable: ctx.judgeAvailable });
  switch (state.phase) {
    case "lobby": {
      if (here(state, ctx.connected).length === 0) {
        ap.balanced = false;
        return null;
      }
      if (!ap.balanced) {
        // Whoever's gone since doesn't count toward the teams.
        dropAbsent(state, ctx.connected);
        ap.balanced = true;
        return press("balanceTeams");
      }
      ap.balanced = false;
      return press("advance");
    }
    case "segment":
      return state.run?.stage === "revealed" ? press("showLeaderboard") : press("advance");
    case "leaderboard":
      return press("advance");
    case "ended":
      restartGame(state, ctx);
      return {};
  }
}

function dropAbsent(state: RoomState, connected: Set<string>) {
  for (const [id, p] of Object.entries(state.players)) {
    if (p.kicked || !connected.has(id)) delete state.players[id];
  }
}

/** A fresh game in the same room, with whoever's still here (scores back to zero). */
export function restartGame(state: RoomState, ctx: Pick<AutopilotContext, "now" | "connected">) {
  dropAbsent(state, ctx.connected);
  state.phase = "lobby";
  state.cursor = -1;
  state.run = null;
  state.events = [];
  state.qna = [];
  state.undo = [];
  state.duckHours = null;
  const ap = state.autopilot!;
  ap.balanced = false;
  ap.mark = "";
  ap.at = null;
  ap.touchedAt = ctx.now;
}

/** When the room's next autopilot step is due, if it's waiting on one. */
export function autopilotDeadline(state: RoomState): number | null {
  return state.autopilot?.at ?? null;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Jev calls the practice room can still make today. */
export function practiceJevLeft(state: RoomState, now: number): number {
  const ap = state.autopilot;
  if (!ap) return Infinity;
  if (ap.jevDay !== utcDay(now)) return PRACTICE_JEV_CALLS_PER_DAY;
  return Math.max(0, PRACTICE_JEV_CALLS_PER_DAY - ap.jevCalls);
}

/** Count Jev calls against today's budget (before making them, so failures count too). */
export function spendPracticeJev(state: RoomState, now: number, calls: number) {
  const ap = state.autopilot;
  if (!ap) return;
  const day = utcDay(now);
  if (ap.jevDay !== day) {
    ap.jevDay = day;
    ap.jevCalls = 0;
  }
  ap.jevCalls += calls;
}

/** The name they typed (tidied, and numbered if someone has it), or a duck name. */
export function practiceName(state: RoomState, asked: unknown, fallback: () => string): string {
  const clean = (typeof asked === "string" ? asked : "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PRACTICE_MAX_NAME)
    .trim();
  const taken = new Set(Object.values(state.players).map((p) => p.name.toLowerCase()));
  const base = clean || fallback();
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const numbered = `${base.slice(0, PRACTICE_MAX_NAME - 3)} ${n}`;
    if (!taken.has(numbered.toLowerCase())) return numbered;
  }
}
