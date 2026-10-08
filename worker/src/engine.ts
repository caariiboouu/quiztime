/**
 * The live-quiz room as a plain state machine. No Cloudflare APIs in here:
 * the Durable Object (`room.ts`) owns sockets, storage, alarms and Jev calls,
 * and drives this module, which keeps the game rules unit-testable.
 */
import {
  LIGHTNING_INTRO_SEC,
  LIGHTNING_REVEAL_SEC,
  MAX_NAME_LENGTH,
  MINIGAME_COUNTDOWN_SEC,
  MAX_QNA_LENGTH,
  MAX_WRITTEN_LENGTH,
  type AnswerValue,
  type ChoiceQuestion,
  type CreateRoomRequest,
  type HostMessage,
  type HostSubmission,
  type HostView,
  type JudgeResult,
  type LightningRound,
  type LiveQuestion,
  type MinigameId,
  type PlayerMessage,
  type PlayerView,
  type PublicPlayer,
  type PublicQna,
  type PublicQuestion,
  type PublicSegment,
  type QnaItem,
  type RoomInfo,
  type RoomPhase,
  type RoomSettings,
  type ScoreEvent,
  type QuestionSegment,
  type Segment,
  type SegmentReveal,
  type SegmentStage,
  type Show,
  type ShowSegment,
  type Submission,
  type DuckHoursResult,
} from "../../shared/protocol";
import { cleanOutfit, type DuckOutfit } from "../../shared/outfit";
import { ranksFromScores } from "../../shared/duckStandings";
import {
  numericAwards,
  placementAwards,
  speedBonus,
  teamStandings,
} from "../../shared/scoring";

/** Who's joining: from their account (the Durable Object checks it first). */
export type PlayerJoin = {
  name: string;
  teamId: string | null;
  duckHolderId: string | null;
  accountId?: string | null;
  outfit?: DuckOutfit | null;
};

export const MINIGAMES: readonly MinigameId[] = ["duck-stop", "pond-memory"];

/** Slack after a minigame ends for the last scores to arrive. */
export const MINIGAME_GRACE_SEC = 4;

export type PlayerRecord = {
  id: string;
  name: string;
  /** Join order, which picks the player's duck. Never reused, even after a kick. */
  lookIndex?: number;
  teamId: string | null;
  duckHolderId: string | null;
  /** The account they joined as (one seat per account per room). */
  accountId?: string | null;
  /** The hat and neckpiece they picked. */
  outfit?: DuckOutfit | null;
  token: string;
  joinedAt: number;
  kicked: boolean;
};

export type SegmentRun = {
  index: number;
  stage: SegmentStage;
  openedAt: number;
  /** Answers accepted (and speed timed) from here; see PublicSegment. */
  answersOpenAt: number;
  closesAt: number | null;
  /** Lightning rounds: when to open the next question automatically. */
  advanceAt: number | null;
  /** Answer arena questions: ducks it was laid out for. */
  arena?: { players: number } | null;
  seed: number;
  submissions: Record<string, Submission>;
  judge: Record<string, JudgeResult>;
  /** Host-confirmed points for written answers. */
  finalPoints: Record<string, number>;
  reveal: SegmentReveal | null;
};

/**
 * Bump when RoomState's shape changes, and teach `loadRoom` to upgrade the old
 * shape: rooms live for a day in Durable Object storage, so a deploy can land
 * while a game is in progress.
 */
export const ROOM_SCHEMA = 2;

export type RoomState = {
  schema: number;
  code: string;
  hostKey: string;
  createdAt: number;
  title: string;
  settings: RoomSettings;
  /** The show with lightning rounds expanded into individual questions. */
  segments: Segment[];
  players: Record<string, PlayerRecord>;
  phase: RoomPhase;
  /** Index of the segment most recently opened; -1 before the first. */
  cursor: number;
  run: SegmentRun | null;
  events: ScoreEvent[];
  qna: QnaItem[];
  /** Game progress before each recent host step, newest last, for "back". */
  undo?: UndoStep[];
  /** Set once this game's results have gone into the Duck Hours standings. */
  duckHours?: DuckHoursResult | null;
};

/**
 * What "back" restores: where the game was and the scores, not who's in it
 * (players who joined since stay, and so do Q&A questions).
 */
export type UndoStep = {
  phase: RoomPhase;
  cursor: number;
  run: SegmentRun | null;
  events: ScoreEvent[];
  /** When the step was taken, to give back the time that passed since. */
  at: number;
};

/** How many presses "back" can undo in a row. */
export const UNDO_LIMIT = 5;

/** What the Durable Object should do after a state change. */
export type Effects = {
  /** Kick off Jev judging for the current written question. */
  startJudging?: boolean;
  /** An open arena came back via "back": carry on with its ducks where they stood. */
  resumeArena?: { segmentId: string; pausedMs: number };
  /** Close the socket(s) for this player. */
  disconnect?: string;
};

export class RuleError extends Error {}

// ---------------------------------------------------------------------------
// Validation of host-uploaded content
// ---------------------------------------------------------------------------

const SCORING_MODES = ["accuracy", "speed"];

const isStr = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function questionError(q: LiveQuestion, where: string): string | null {
  if (!isStr(q.id, 64)) return `${where}: missing id`;
  if (!isStr(q.prompt, 1000)) return `${where}: prompt must be 1–1000 characters`;
  switch (q.type) {
    case "choice":
    case "poll": {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
        return `${where}: needs 2–4 options`;
      }
      const ids = new Set<string>();
      for (const o of q.options) {
        if (!isStr(o?.id, 32) || !isStr(o?.text, 200)) {
          return `${where}: each option needs an id and 1–200 characters of text`;
        }
        if (ids.has(o.id)) return `${where}: duplicate option id ${o.id}`;
        ids.add(o.id);
      }
      if (q.arena !== undefined && typeof q.arena !== "boolean") {
        return `${where}: arena must be true or false`;
      }
      if (q.type === "choice") {
        if (!ids.has(q.correctId)) return `${where}: correctId must be one of the options`;
        if (!isNum(q.points, 0, 10000)) return `${where}: points must be 0–10000`;
        if (!isNum(q.timeLimitSec, 3, 300)) return `${where}: timeLimitSec must be 3–300`;
        if (q.scoring !== undefined && !SCORING_MODES.includes(q.scoring)) {
          return `${where}: scoring must be "accuracy" or "speed"`;
        }
        if (q.speedBonus !== undefined && !isNum(q.speedBonus, 0, 10000)) {
          return `${where}: speedBonus must be 0–10000`;
        }
      }
      return null;
    }
    case "numeric":
      if (!isNum(q.answer, -1e15, 1e15)) return `${where}: answer must be a number`;
      if (!isNum(q.points, 0, 10000)) return `${where}: points must be 0–10000`;
      if (!isNum(q.timeLimitSec, 5, 300)) return `${where}: timeLimitSec must be 5–300`;
      return null;
    case "written":
      if (!Array.isArray(q.rubric) || q.rubric.length > 10) {
        return `${where}: rubric must be a list of up to 10 criteria`;
      }
      if (!q.rubric.every((c) => isStr(c, 300))) {
        return `${where}: each rubric criterion must be 1–300 characters`;
      }
      if (!isNum(q.points, 0, 10000)) return `${where}: points must be 0–10000`;
      return null;
    default:
      return `${where}: unknown question type`;
  }
}

function lightningError(r: LightningRound, where: string, ids: Set<string>): string | null {
  if (!isStr(r.id, 64)) return `${where}: missing id`;
  if (r.title !== undefined && !isStr(r.title, 80)) return `${where}: title must be ≤80 characters`;
  if (!isNum(r.timeLimitSec, 3, 60)) return `${where}: timeLimitSec must be 3–60`;
  if (!isNum(r.points, 0, 10000)) return `${where}: points must be 0–10000`;
  if (!isNum(r.speedBonus, 0, 10000)) return `${where}: speedBonus must be 0–10000`;
  if (r.revealSec !== undefined && !isNum(r.revealSec, 1, 30)) {
    return `${where}: revealSec must be 1–30`;
  }
  if (!Array.isArray(r.questions) || r.questions.length < 1 || r.questions.length > 30) {
    return `${where}: a lightning round needs 1–30 questions`;
  }
  for (const [i, q] of r.questions.entries()) {
    const err = questionError(
      { ...q, type: "choice", points: r.points, timeLimitSec: r.timeLimitSec },
      `${where}, question ${i + 1}`,
    );
    if (err) return err;
    if (ids.has(q.id)) return `${where}, question ${i + 1}: duplicate id ${q.id}`;
    ids.add(q.id);
  }
  return null;
}

/** Flatten lightning rounds into speed-scored choice questions. */
/**
 * Multiple-choice questions and polls are played in the answer arena unless
 * the question says otherwise (or the host turned the arena off). Lightning
 * rounds stay tap-to-answer: they're too quick for walking.
 */
export function withArenaDefault(segments: Segment[], arena: boolean): Segment[] {
  return segments.map((seg) => {
    if (seg.kind !== "question" || seg.round) return seg;
    const q = seg.question;
    if ((q.type !== "choice" && q.type !== "poll") || q.arena !== undefined) return seg;
    return { ...seg, question: { ...q, arena } };
  });
}

export function expandShow(show: Show): Segment[] {
  return show.segments.flatMap((seg: ShowSegment): Segment[] => {
    if (seg.kind !== "lightning") return [seg];
    const revealSec = seg.revealSec ?? LIGHTNING_REVEAL_SEC;
    return seg.questions.map((q, index) => {
      const question: ChoiceQuestion = {
        type: "choice",
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        correctId: q.correctId,
        factoid: q.factoid,
        points: seg.points,
        timeLimitSec: seg.timeLimitSec,
        scoring: "speed",
        speedBonus: seg.speedBonus,
      };
      return {
        kind: "question",
        question,
        round: {
          id: seg.id,
          title: seg.title ?? "Lightning round",
          index,
          count: seg.questions.length,
          revealSec,
        },
      };
    });
  });
}

export function validateShow(show: unknown): string | null {
  const s = show as Show;
  if (!s || typeof s !== "object") return "Show must be an object";
  if (!isStr(s.title, 120)) return "Show needs a title (≤120 characters)";
  if (!Array.isArray(s.segments) || s.segments.length === 0 || s.segments.length > 100) {
    return "Show needs 1–100 segments";
  }
  if (s.segments.some((seg) => seg?.kind === "lightning" && !seg.id)) {
    return "Every lightning round needs an id";
  }
  const ids = new Set<string>();
  for (const [i, seg] of s.segments.entries()) {
    const where = `Segment ${i + 1}`;
    let id: string;
    if (seg?.kind === "question") {
      const err = questionError(seg.question, where);
      if (err) return err;
      id = seg.question.id;
    } else if (seg?.kind === "lightning") {
      const err = lightningError(seg, where, ids);
      if (err) return err;
      id = seg.id;
    } else if (seg?.kind === "minigame") {
      if (!isStr(seg.id, 64)) return `${where}: missing id`;
      if (!MINIGAMES.includes(seg.game)) return `${where}: unknown minigame ${seg.game}`;
      if (!isNum(seg.points, 0, 10000)) return `${where}: points must be 0–10000`;
      if (!isNum(seg.durationSec, 10, 120)) return `${where}: durationSec must be 10–120`;
      id = seg.id;
    } else {
      return `${where}: kind must be "question", "lightning" or "minigame"`;
    }
    if (ids.has(id)) return `${where}: duplicate id ${id}`;
    ids.add(id);
  }
  return null;
}

export function validateSettings(settings: unknown): string | null {
  const s = settings as RoomSettings;
  if (!s || typeof s !== "object") return "Settings must be an object";
  if (typeof s.teamMode !== "boolean") return "teamMode must be true or false";
  if (!SCORING_MODES.includes(s.choiceScoring)) return 'choiceScoring must be "accuracy" or "speed"';
  if (!isNum(s.speedBonusMax, 0, 10000)) return "speedBonusMax must be 0–10000";
  if (s.arena !== undefined && typeof s.arena !== "boolean") return "arena must be true or false";
  if (!Array.isArray(s.teams) || s.teams.length > 8) return "Up to 8 teams";
  if (s.teamMode && s.teams.length < 2) return "Team mode needs at least 2 teams";
  const ids = new Set<string>();
  for (const t of s.teams) {
    if (!isStr(t?.id, 32) || !isStr(t?.name, 24)) return "Each team needs an id and a name (≤24)";
    if (typeof t.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(t.color)) {
      return "Team colors must be #rrggbb";
    }
    if (ids.has(t.id)) return `Duplicate team id ${t.id}`;
    ids.add(t.id);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Construction and joining
// ---------------------------------------------------------------------------

export function createRoom(
  code: string,
  hostKey: string,
  req: Pick<CreateRoomRequest, "show" | "settings">,
  now: number,
): RoomState {
  return {
    schema: ROOM_SCHEMA,
    code,
    hostKey,
    createdAt: now,
    title: req.show.title,
    settings: req.settings,
    segments: withArenaDefault(expandShow(req.show), req.settings.arena !== false),
    players: {},
    phase: "lobby",
    cursor: -1,
    run: null,
    events: [],
    qna: [],
  };
}

/** Rooms saved before schema 2 (no lightning rounds or scoring modes). */
type RoomStateV1 = Omit<RoomState, "schema" | "segments"> & {
  schema?: undefined;
  show: Show;
  segments?: undefined;
};

/** Read a stored room, upgrading older shapes. Unknown shapes come back null. */
export function loadRoom(raw: unknown): RoomState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RoomState | RoomStateV1;
  if (r.schema === ROOM_SCHEMA) return r as RoomState;
  if (r.schema !== undefined || !("show" in r) || !r.show) return null;

  // v1 → v2. Speed bonuses used to be on unless a question opted out.
  const { show, ...rest } = r;
  const segments = expandShow(show).map((seg) => {
    if (seg.kind !== "question" || seg.question.type !== "choice") return seg;
    const legacy = (seg.question as { speedBonus?: unknown }).speedBonus;
    if (typeof legacy !== "boolean") return seg;
    const { speedBonus: _old, ...question } = seg.question;
    void _old;
    return { ...seg, question: { ...question, scoring: legacy ? "speed" : "accuracy" } } as Segment;
  });
  return {
    ...rest,
    schema: ROOM_SCHEMA,
    settings: { ...rest.settings, choiceScoring: rest.settings.choiceScoring ?? "speed" },
    segments,
    run: rest.run && {
      ...rest.run,
      answersOpenAt: rest.run.answersOpenAt ?? rest.run.openedAt,
      advanceAt: rest.run.advanceAt ?? null,
    },
  };
}

export function roomInfo(state: RoomState): RoomInfo {
  return {
    code: state.code,
    title: state.title,
    phase: state.phase,
    settings: state.settings,
  };
}

export function cleanName(raw: unknown): string {
  return typeof raw === "string"
    ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH)
    : "";
}

export function addPlayer(
  state: RoomState,
  req: PlayerJoin,
  id: string,
  token: string,
  now: number,
): PlayerRecord {
  const name = cleanName(req.name);
  if (!name) throw new RuleError("Please enter a name");
  const active = Object.values(state.players).filter((p) => !p.kicked);
  if (active.length >= 60) throw new RuleError("This room is full");
  if (active.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new RuleError("Someone already has that name");
  }
  let teamId: string | null = null;
  if (state.settings.teamMode) {
    if (!state.settings.teams.some((t) => t.id === req.teamId)) {
      throw new RuleError("Pick a team");
    }
    teamId = req.teamId;
  }
  const duckHolderId =
    typeof req.duckHolderId === "string" && req.duckHolderId.length <= 64
      ? req.duckHolderId
      : null;
  const player: PlayerRecord = {
    id,
    name,
    lookIndex: Object.keys(state.players).length,
    teamId,
    duckHolderId,
    accountId: req.accountId ?? null,
    outfit: cleanOutfit(req.outfit),
    token,
    joinedAt: now,
    kicked: false,
  };
  state.players[id] = player;
  return player;
}

export function playerByToken(state: RoomState, token: string): PlayerRecord | null {
  return (
    Object.values(state.players).find((p) => !p.kicked && p.token === token) ?? null
  );
}

// ---------------------------------------------------------------------------
// Segment flow
// ---------------------------------------------------------------------------

export function currentSegment(state: RoomState): Segment | null {
  return state.run ? state.segments[state.run.index] ?? null : null;
}

export function segmentId(seg: Segment): string {
  return seg.kind === "question" ? seg.question.id : seg.id;
}

function closesAtFor(seg: Segment, answersOpenAt: number): number | null {
  if (seg.kind === "minigame") {
    return answersOpenAt + (MINIGAME_COUNTDOWN_SEC + seg.durationSec + MINIGAME_GRACE_SEC) * 1000;
  }
  const q = seg.question;
  return q.type === "choice" || q.type === "numeric"
    ? answersOpenAt + q.timeLimitSec * 1000
    : null;
}

export function isArena(seg: Segment | null): boolean {
  return (
    seg?.kind === "question" &&
    (seg.question.type === "choice" || seg.question.type === "poll") &&
    seg.question.arena === true &&
    !seg.round
  );
}

/** The open answer arena, if there is one: what the Durable Object simulates. */
export function openArena(
  state: RoomState,
): { segmentId: string; options: { id: string }[]; players: number } | null {
  const seg = currentSegment(state);
  const run = state.run;
  if (state.phase !== "segment" || !run || run.stage !== "open" || !seg || !isArena(seg)) return null;
  const q = (seg as QuestionSegment).question as { options: { id: string }[] };
  return { segmentId: segmentId(seg), options: q.options, players: run.arena?.players ?? 1 };
}

/**
 * Answer arena: replace answers with where everyone's duck is standing.
 * `since` (ms) is when the duck entered that zone, so speed scoring rewards
 * getting there first. Returns true if anyone's answer changed.
 */
export function setArenaAnswers(
  state: RoomState,
  zones: Map<string, { zone: number | null; since: number }>,
): boolean {
  const arena = openArena(state);
  const run = state.run;
  const seg = currentSegment(state);
  if (!arena || !run || seg?.kind !== "question") return false;
  const type = seg.question.type as "choice" | "poll";
  const next: Record<string, Submission> = {};
  let changed = false;
  for (const [pid, { zone, since }] of zones) {
    const p = state.players[pid];
    if (!p || p.kicked || zone === null) continue;
    const optionId = arena.options[zone]?.id;
    if (!optionId) continue;
    next[pid] = { value: { type, optionId } as AnswerValue, at: Math.max(since, run.answersOpenAt) };
    const prev = run.submissions[pid]?.value;
    if (!prev || !("optionId" in prev) || prev.optionId !== optionId) changed = true;
  }
  for (const pid of Object.keys(run.submissions)) if (!next[pid]) changed = true;
  run.submissions = next;
  return changed;
}

/** Whether a correct answer to this segment earns a speed bonus. */
export function isSpeedScored(seg: Segment, settings: RoomSettings): boolean {
  return (
    seg.kind === "question" &&
    seg.question.type === "choice" &&
    (seg.question.scoring ?? settings.choiceScoring) === "speed"
  );
}

function openSegment(state: RoomState, index: number, now: number, seed: number) {
  const seg = state.segments[index];
  // The first question of a lightning round gets a "get ready" countdown so
  // nobody's speed bonus depends on noticing the round started.
  const intro = seg.kind === "question" && seg.round?.index === 0 ? LIGHTNING_INTRO_SEC * 1000 : 0;
  const answersOpenAt = now + intro;
  state.phase = "segment";
  state.cursor = index;
  // Arena questions start with just the question up, for the host to read
  // out; answers (and the clock) come when they press next.
  const reading = isArena(seg);
  state.run = {
    index,
    stage: reading ? "reading" : "open",
    openedAt: now,
    answersOpenAt,
    closesAt: reading ? null : closesAtFor(seg, answersOpenAt),
    advanceAt: null,
    arena: isArena(seg)
      ? { players: Object.values(state.players).filter((p) => !p.kicked).length }
      : null,
    seed,
    submissions: {},
    judge: {},
    finalPoints: {},
    reveal: null,
  };
}

/**
 * The new Duck Hours ranks this finished game would set: everyone who played
 * as an account (or with a Duck Hours entry), by final score, ties sharing a
 * place. Players without an entry get added to the board.
 */
export function duckHoursProposal(
  state: RoomState,
): { playerId: string; holderId: string | null; name: string; rank: number }[] {
  const s = scores(state);
  const players = Object.values(state.players)
    .filter((p) => !p.kicked && (p.accountId || p.duckHolderId))
    .map((p) => ({ playerId: p.id, holderId: p.duckHolderId, name: p.name, score: s.get(p.id) ?? 0 }));
  return ranksFromScores(players).map(({ playerId, holderId, name, rank }) => ({ playerId, holderId, name, rank }));
}

/** Note where the game is before a host step, so "back" can undo it. */
function remember(state: RoomState, now: number) {
  const step: UndoStep = structuredClone({
    phase: state.phase,
    cursor: state.cursor,
    run: state.run,
    events: state.events,
    at: now,
  });
  state.undo = [...(state.undo ?? []), step].slice(-UNDO_LIMIT);
}

/**
 * Undo the last host step (pressed too early). The clock stood still in the
 * meantime: an open question gets back the time it had left, and answers
 * already given keep their speed.
 */
function goBack(state: RoomState, now: number): Effects {
  const step = state.undo?.pop();
  if (!step) throw new RuleError("Nothing to go back to");
  state.phase = step.phase;
  state.cursor = step.cursor;
  state.run = step.run;
  state.events = step.events;
  const run = state.run;
  if (!run) return {};
  const paused = Math.max(0, now - step.at);
  if (run.stage === "open") {
    run.openedAt += paused;
    run.answersOpenAt += paused;
    if (run.closesAt !== null) run.closesAt += paused;
    for (const s of Object.values(run.submissions)) s.at += paused;
  }
  if (run.advanceAt !== null) run.advanceAt += paused;
  const seg = currentSegment(state);
  if (state.phase === "segment" && run.stage === "open" && seg && isArena(seg)) {
    return { resumeArena: { segmentId: segmentId(seg), pausedMs: paused } };
  }
  return {};
}

/** After the read-out: show the answers, start the clock, lay out the arena for who's here now. */
function openAnswers(state: RoomState, now: number) {
  const run = state.run;
  const seg = currentSegment(state);
  if (!run || !seg || run.stage !== "reading") return;
  run.stage = "open";
  run.answersOpenAt = now;
  run.closesAt = closesAtFor(seg, now);
  if (run.arena) run.arena.players = Object.values(state.players).filter((p) => !p.kicked).length;
}

function openNextOrEnd(state: RoomState, now: number, seed: number) {
  const next = state.cursor + 1;
  if (next < state.segments.length) {
    openSegment(state, next, now, seed);
  } else {
    state.phase = "ended";
  }
}

/**
 * Lock answers. Written questions go on to judging (or straight to review);
 * lightning questions reveal at once and schedule the next question.
 */
export function closeSegment(state: RoomState, judgeAvailable: boolean, now: number): Effects {
  const run = state.run;
  const seg = currentSegment(state);
  if (!run || !seg || run.stage !== "open") return {};
  run.stage = "closed";
  run.closesAt = null;
  if (seg.kind === "question" && seg.round) {
    revealSegment(state);
    if (seg.round.index + 1 < seg.round.count) {
      run.advanceAt = now + seg.round.revealSec * 1000;
    }
    return {};
  }
  if (seg.kind === "question" && seg.question.type === "written") {
    const hasText = Object.values(run.submissions).some(
      (s) => s.value.type === "written" && s.value.text.trim(),
    );
    if (judgeAvailable && hasText) {
      run.stage = "judging";
      return { startJudging: true };
    }
    run.stage = "review";
  }
  return {};
}

/**
 * Alarm handler: close the current segment if its deadline has passed, or
 * move a lightning round on to its next question.
 */
export function tick(
  state: RoomState,
  ctx: { now: number; seed: number; judgeAvailable: boolean },
): Effects {
  const run = state.run;
  if (!run || state.phase !== "segment") return {};
  if (run.stage === "open" && run.closesAt !== null && ctx.now >= run.closesAt) {
    return closeSegment(state, ctx.judgeAvailable, ctx.now);
  }
  if (run.stage === "revealed" && run.advanceAt !== null && ctx.now >= run.advanceAt) {
    openNextOrEnd(state, ctx.now, ctx.seed);
  }
  return {};
}

/** The next time `tick` has something to do, if any. */
export function nextDeadline(state: RoomState): number | null {
  const run = state.run;
  if (!run || state.phase !== "segment") return null;
  if (run.stage === "open") return run.closesAt;
  if (run.stage === "revealed") return run.advanceAt;
  return null;
}

export function applyJudgeResult(state: RoomState, segId: string, playerId: string, result: JudgeResult) {
  const seg = currentSegment(state);
  if (!state.run || !seg || segmentId(seg) !== segId) return;
  state.run.judge[playerId] = result;
}

export function finishJudging(state: RoomState, segId: string) {
  const seg = currentSegment(state);
  if (state.run?.stage === "judging" && seg && segmentId(seg) === segId) {
    state.run.stage = "review";
  }
}

function nameOf(state: RoomState, id: string): string {
  return state.players[id]?.name ?? "?";
}

/** Score the current segment and record its events (idempotent). */
export function revealSegment(state: RoomState) {
  const run = state.run;
  const seg = currentSegment(state);
  if (!run || !seg) return;
  const segId = segmentId(seg);
  state.events = state.events.filter((e) => e.segmentId !== segId);

  const subs = Object.entries(run.submissions).filter(
    ([pid]) => state.players[pid] && !state.players[pid].kicked,
  );
  const awards: SegmentReveal["awards"] = [];
  const award = (playerId: string, points: number, detail?: string) => {
    awards.push({ playerId, name: nameOf(state, playerId), points, detail });
  };
  const reveal: SegmentReveal = { awards };

  if (seg.kind === "minigame") {
    const scores = subs.flatMap(([id, s]) =>
      s.value.type === "minigame" ? [{ id, metric: s.value.score }] : [],
    );
    for (const [id, pts] of placementAwards(scores, seg.points)) {
      state.events.push({ playerId: id, segmentId: segId, kind: "minigame", points: pts });
      const score = scores.find((s) => s.id === id)!.metric;
      award(id, pts, `scored ${score}`);
    }
  } else {
    const q = seg.question;
    switch (q.type) {
      case "choice": {
        reveal.correctId = q.correctId;
        reveal.factoid = q.factoid;
        reveal.distribution = Object.fromEntries(q.options.map((o) => [o.id, 0]));
        const limitMs = q.timeLimitSec * 1000;
        const maxBonus = isSpeedScored(seg, state.settings)
          ? (q.speedBonus ?? state.settings.speedBonusMax)
          : 0;
        for (const [pid, s] of subs) {
          if (s.value.type !== "choice") continue;
          reveal.distribution[s.value.optionId] =
            (reveal.distribution[s.value.optionId] ?? 0) + 1;
          if (s.value.optionId !== q.correctId) continue;
          const bonus = speedBonus(s.at - run.answersOpenAt, limitMs, maxBonus);
          state.events.push({ playerId: pid, segmentId: segId, kind: "base", points: q.points });
          if (bonus) {
            state.events.push({ playerId: pid, segmentId: segId, kind: "speed", points: bonus });
          }
          award(pid, q.points + bonus, bonus ? `+${bonus} speed` : undefined);
        }
        break;
      }
      case "numeric": {
        reveal.answer = q.answer;
        reveal.unit = q.unit;
        reveal.factoid = q.factoid;
        const guesses = subs.flatMap(([id, s]) =>
          s.value.type === "numeric" ? [{ id, value: s.value.value }] : [],
        );
        for (const [id, pts] of numericAwards(guesses, q.answer, q.points)) {
          state.events.push({ playerId: id, segmentId: segId, kind: "base", points: pts });
          award(id, pts, `guessed ${guesses.find((g) => g.id === id)!.value}`);
        }
        break;
      }
      case "written": {
        reveal.referenceAnswer = q.referenceAnswer;
        for (const [pid] of subs) {
          const pts = writtenPoints(run, pid);
          state.events.push({ playerId: pid, segmentId: segId, kind: "judge", points: pts });
          award(pid, pts);
        }
        break;
      }
      case "poll": {
        reveal.distribution = Object.fromEntries(q.options.map((o) => [o.id, 0]));
        for (const [, s] of subs) {
          if (s.value.type !== "poll") continue;
          reveal.distribution[s.value.optionId] =
            (reveal.distribution[s.value.optionId] ?? 0) + 1;
        }
        break;
      }
    }
  }

  awards.sort((a, b) => b.points - a.points);
  if (seg.kind === "question" && seg.round && seg.round.index + 1 === seg.round.count) {
    reveal.roundTotals = roundTotals(state, seg.round.id);
  }
  run.reveal = reveal;
  run.stage = "revealed";
}

function roundTotals(state: RoomState, roundId: string): SegmentReveal["roundTotals"] {
  const inRound = new Set(
    state.segments.flatMap((s) =>
      s.kind === "question" && s.round?.id === roundId ? [s.question.id] : [],
    ),
  );
  const totals = new Map<string, number>();
  for (const e of state.events) {
    if (inRound.has(e.segmentId)) totals.set(e.playerId, (totals.get(e.playerId) ?? 0) + e.points);
  }
  return [...totals]
    .filter(([id]) => state.players[id] && !state.players[id].kicked)
    .map(([playerId, points]) => ({ playerId, name: nameOf(state, playerId), points }))
    .sort((a, b) => b.points - a.points);
}

function writtenPoints(run: SegmentRun, playerId: string): number {
  return run.finalPoints[playerId] ?? run.judge[playerId]?.suggestedPoints ?? 0;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function hostAction(
  state: RoomState,
  msg: HostMessage,
  ctx: { now: number; seed: number; judgeAvailable: boolean },
): Effects {
  switch (msg.t) {
    case "advance": {
      if (state.phase === "ended") return {};
      remember(state, ctx.now);
      if (state.phase === "lobby" || state.phase === "leaderboard") {
        // From the leaderboard, resume where we were: reveal or move on.
        if (state.run && state.run.stage !== "revealed") {
          state.phase = "segment";
          return {};
        }
        openNextOrEnd(state, ctx.now, ctx.seed);
        return {};
      }
      const run = state.run!;
      switch (run.stage) {
        case "reading":
          openAnswers(state, ctx.now);
          return {};
        case "open":
          return closeSegment(state, ctx.judgeAvailable, ctx.now);
        case "closed":
        case "review":
          revealSegment(state);
          return {};
        case "judging":
          // Waiting on Jev; the host can skip ahead to review what's back.
          run.stage = "review";
          return {};
        case "revealed":
          openNextOrEnd(state, ctx.now, ctx.seed);
          return {};
      }
      return {};
    }
    case "close":
      if (state.run?.stage === "open") remember(state, ctx.now);
      return closeSegment(state, ctx.judgeAvailable, ctx.now);
    case "back":
      return goBack(state, ctx.now);
    case "applyDuckHours":
      // Talks to the standings, so the Durable Object handles it (room.ts).
      return {};
    case "showLeaderboard":
      if (state.phase === "segment") state.phase = "leaderboard";
      return {};
    case "end":
      if (state.phase !== "ended") remember(state, ctx.now);
      state.phase = "ended";
      if (state.run) {
        state.run.closesAt = null;
        state.run.advanceAt = null;
      }
      return {};
    case "setFinalPoints": {
      const run = state.run;
      const seg = currentSegment(state);
      if (!run || !seg || seg.kind !== "question" || seg.question.type !== "written") {
        throw new RuleError("Not on a written question");
      }
      if (run.stage !== "review" && run.stage !== "revealed") {
        throw new RuleError("Wait for judging to finish");
      }
      if (!run.submissions[msg.playerId]) throw new RuleError("No answer from that player");
      run.finalPoints[msg.playerId] = Math.round(
        Math.min(seg.question.points, Math.max(0, Number(msg.points) || 0)),
      );
      // Adjusting after the reveal re-scores so the leaderboard stays right.
      if (run.stage === "revealed") revealSegment(state);
      return {};
    }
    case "rejudge": {
      const run = state.run;
      const seg = currentSegment(state);
      if (!ctx.judgeAvailable) throw new RuleError("Jev isn't configured");
      if (run?.stage !== "review" || seg?.kind !== "question" || seg.question.type !== "written") {
        throw new RuleError("Nothing to re-judge");
      }
      run.judge = {};
      run.stage = "judging";
      return { startJudging: true };
    }
    case "kick": {
      const p = state.players[msg.playerId];
      if (!p) return {};
      p.kicked = true;
      return { disconnect: p.id };
    }
    case "qnaModerate": {
      const item = state.qna.find((q) => q.id === msg.id);
      if (!item) return {};
      if (typeof msg.answered === "boolean") item.answered = msg.answered;
      if (typeof msg.hidden === "boolean") item.hidden = msg.hidden;
      return {};
    }
  }
}

function validAnswer(seg: Segment, value: AnswerValue): AnswerValue {
  if (seg.kind === "minigame") {
    if (value?.type !== "minigame" || !isNum(value.score, 0, 1e6)) {
      throw new RuleError("Invalid minigame score");
    }
    return { type: "minigame", score: Math.round(value.score) };
  }
  const q = seg.question;
  if (isArena(seg)) throw new RuleError("Walk your duck onto an answer!");
  if (value?.type !== q.type) throw new RuleError("Wrong answer type");
  switch (value.type) {
    case "choice":
    case "poll": {
      const options = (q as { options: { id: string }[] }).options;
      if (!options.some((o) => o.id === value.optionId)) throw new RuleError("Unknown option");
      return { type: value.type, optionId: value.optionId } as AnswerValue;
    }
    case "numeric":
      if (!isNum(value.value, -1e15, 1e15)) throw new RuleError("Enter a number");
      return { type: "numeric", value: value.value };
    case "written": {
      if (typeof value.text !== "string") throw new RuleError("Invalid answer");
      const max = (q.type === "written" && q.maxLength) || MAX_WRITTEN_LENGTH;
      return { type: "written", text: value.text.slice(0, max) };
    }
    default:
      throw new RuleError("Invalid answer");
  }
}

/** Connected players who could still answer; used to close early. */
export function eligiblePlayers(state: RoomState, connected: Set<string>): string[] {
  return Object.values(state.players)
    .filter((p) => !p.kicked && connected.has(p.id))
    .map((p) => p.id);
}

export function playerAction(
  state: RoomState,
  playerId: string,
  msg: PlayerMessage,
  ctx: { now: number; connected: Set<string>; judgeAvailable: boolean; newId: string },
): Effects {
  const player = state.players[playerId];
  if (!player || player.kicked) throw new RuleError("You're not in this room");

  switch (msg.t) {
    case "answer": {
      const run = state.run;
      const seg = currentSegment(state);
      if (state.phase !== "segment" || !run || !seg || segmentId(seg) !== msg.segmentId) {
        throw new RuleError("That question isn't open");
      }
      if (run.stage !== "open") throw new RuleError("Answers are locked");
      if (ctx.now < run.answersOpenAt) throw new RuleError("Not yet! Get ready…");
      run.submissions[playerId] = { value: validAnswer(seg, msg.value), at: ctx.now };

      // Everyone's in: no need to wait out the clock. Written answers stay
      // open so people can keep editing until the host closes them.
      const isWritten = seg.kind === "question" && seg.question.type === "written";
      if (!isWritten && !isArena(seg)) {
        const eligible = eligiblePlayers(state, ctx.connected);
        if (eligible.length > 0 && eligible.every((id) => run.submissions[id])) {
          return closeSegment(state, ctx.judgeAvailable, ctx.now);
        }
      }
      return {};
    }
    case "qnaAsk": {
      const text = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_QNA_LENGTH) : "";
      if (!text) throw new RuleError("Type a question first");
      if (state.qna.length >= 300) throw new RuleError("The question board is full");
      const mine = state.qna.filter((q) => q.playerId === playerId && !q.answered && !q.hidden);
      if (mine.length >= 5) throw new RuleError("You have 5 open questions already");
      state.qna.push({
        id: ctx.newId,
        playerId,
        text,
        at: ctx.now,
        voters: [],
        answered: false,
        hidden: false,
      });
      return {};
    }
    case "move":
      // Arena movement is simulated by the Durable Object (room.ts), not here.
      return {};
    case "outfit": {
      const p = state.players[playerId];
      if (!p) return {};
      // Anything not on the lists is ignored rather than refused.
      p.outfit = cleanOutfit(msg.outfit);
      return {};
    }
    case "qnaVote": {
      const item = state.qna.find((q) => q.id === msg.id && !q.hidden);
      if (!item) return {};
      const i = item.voters.indexOf(playerId);
      if (i >= 0) item.voters.splice(i, 1);
      else item.voters.push(playerId);
      return {};
    }
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export function scores(state: RoomState): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of state.events) out.set(e.playerId, (out.get(e.playerId) ?? 0) + e.points);
  return out;
}

/** Rooms saved before looks existed fall back to join order. */
function lookIndexOf(state: RoomState, p: PlayerRecord): number {
  return p.lookIndex ?? Object.keys(state.players).indexOf(p.id);
}

function publicPlayers(state: RoomState, connected: Set<string>): PublicPlayer[] {
  const s = scores(state);
  return Object.values(state.players)
    .filter((p) => !p.kicked)
    .map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      connected: connected.has(p.id),
      score: s.get(p.id) ?? 0,
      lookIndex: lookIndexOf(state, p),
      duckHolderId: p.duckHolderId,
      outfit: p.outfit ?? null,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function publicQuestion(q: LiveQuestion): PublicQuestion {
  switch (q.type) {
    case "choice": {
      const { correctId: _c, factoid: _f, ...rest } = q;
      void _c;
      void _f;
      return rest;
    }
    case "numeric": {
      const { answer: _a, factoid: _f, ...rest } = q;
      void _a;
      void _f;
      return rest;
    }
    case "written": {
      const { referenceAnswer: _r, rubric: _ru, ...rest } = q;
      void _r;
      void _ru;
      return rest;
    }
    case "poll":
      return q;
  }
}

function publicSegment(state: RoomState, connected: Set<string>): PublicSegment | null {
  const run = state.run;
  const seg = currentSegment(state);
  if (!run || !seg) return null;
  const eligible = eligiblePlayers(state, connected);
  return {
    index: run.index,
    total: state.segments.length,
    id: segmentId(seg),
    kind: seg.kind,
    stage: run.stage,
    openedAt: run.openedAt,
    answersOpenAt: run.answersOpenAt,
    closesAt: run.closesAt,
    advanceAt: run.advanceAt,
    speedScored: isSpeedScored(seg, state.settings),
    round: seg.kind === "question" ? seg.round : undefined,
    arena: run.arena ?? undefined,
    answeredCount: Object.keys(run.submissions).filter(
      (id) => state.players[id] && !state.players[id].kicked,
    ).length,
    eligibleCount: eligible.length,
    question: seg.kind === "question" ? publicQuestion(seg.question) : undefined,
    minigame:
      seg.kind === "minigame"
        ? { game: seg.game, seed: run.seed, durationSec: seg.durationSec, points: seg.points }
        : undefined,
    reveal: run.reveal ?? undefined,
  };
}

function publicQna(state: RoomState, viewerId: string | null): PublicQna[] {
  return state.qna
    .filter((q) => !q.hidden)
    .map((q) => ({
      id: q.id,
      text: q.text,
      author: nameOf(state, q.playerId),
      votes: q.voters.length,
      votedByMe: viewerId !== null && q.voters.includes(viewerId),
      answered: q.answered,
    }))
    .sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes);
}

export function playerView(
  state: RoomState,
  playerId: string,
  connected: Set<string>,
  now: number,
): PlayerView {
  const players = publicPlayers(state, connected);
  const p = state.players[playerId];
  const me = players.find((x) => x.id === playerId) ?? {
    id: playerId,
    name: p?.name ?? "?",
    teamId: p?.teamId ?? null,
    connected: false,
    score: 0,
    lookIndex: p ? lookIndexOf(state, p) : 0,
    duckHolderId: p?.duckHolderId ?? null,
    outfit: p?.outfit ?? null,
  };
  const seg = currentSegment(state);
  const segId = seg ? segmentId(seg) : null;
  const revealed = state.run?.stage === "revealed";
  return {
    role: "player",
    duckHours: state.duckHours ?? null,
    code: state.code,
    title: state.title,
    serverNow: now,
    phase: state.phase,
    settings: state.settings,
    me: { ...me, duckHolderId: p?.duckHolderId ?? null },
    players,
    teams: teamStandings(state.settings.teams, players),
    segment: publicSegment(state, connected),
    myAnswer: state.run?.submissions[playerId]?.value ?? null,
    myAward: revealed
      ? state.events
          .filter((e) => e.playerId === playerId && e.segmentId === segId)
          .reduce((s, e) => s + e.points, 0)
      : null,
    qna: publicQna(state, playerId),
  };
}

/**
 * Slido-style live results: the host sees poll votes as they come in, and
 * arena answer counts (everyone can see where the ducks are standing anyway).
 */
function livePollDistribution(state: RoomState): Record<string, number> | null {
  const seg = currentSegment(state);
  if (!state.run || seg?.kind !== "question") return null;
  if (seg.question.type !== "poll" && !isArena(seg)) return null;
  if (seg.question.type !== "poll" && seg.question.type !== "choice") return null;
  const out = Object.fromEntries(seg.question.options.map((o) => [o.id, 0]));
  for (const [pid, sub] of Object.entries(state.run.submissions)) {
    if ((sub.value.type === "poll" || sub.value.type === "choice") && !state.players[pid]?.kicked) {
      out[sub.value.optionId]++;
    }
  }
  return out;
}

export function hostView(
  state: RoomState,
  connected: Set<string>,
  now: number,
  judgeConfigured: boolean,
): HostView {
  const canGoBack = (state.undo?.length ?? 0) > 0;
  const s = scores(state);
  const players = Object.values(state.players)
    .filter((p) => !p.kicked)
    .map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      duckHolderId: p.duckHolderId,
      connected: connected.has(p.id),
      score: s.get(p.id) ?? 0,
      lookIndex: lookIndexOf(state, p),
      outfit: p.outfit ?? null,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const run = state.run;
  const submissions: HostSubmission[] = run
    ? Object.entries(run.submissions)
        .filter(([pid]) => state.players[pid] && !state.players[pid].kicked)
        .map(([pid, sub]) => ({
          playerId: pid,
          name: nameOf(state, pid),
          value: sub.value,
          elapsedMs: sub.at - run.answersOpenAt,
          judge: run.judge[pid],
          finalPoints: run.finalPoints[pid],
        }))
        .sort((a, b) => a.elapsedMs - b.elapsedMs)
    : [];
  return {
    role: "host",
    duckHours: state.duckHours ?? null,
    duckPreview:
      state.phase === "ended" && !state.duckHours
        ? duckHoursProposal(state).map((p) => ({
            playerId: p.playerId,
            name: p.name,
            rank: p.rank,
            isNew: p.holderId === null,
          }))
        : null,
    code: state.code,
    title: state.title,
    serverNow: now,
    phase: state.phase,
    settings: state.settings,
    players,
    teams: teamStandings(state.settings.teams, players),
    segment: publicSegment(state, connected),
    fullSegment: currentSegment(state),
    submissions,
    liveDistribution: livePollDistribution(state),
    segments: state.segments.map((seg, i) => ({
      id: segmentId(seg),
      label:
        seg.kind === "minigame"
          ? `${i + 1}. Minigame: ${seg.game}`
          : `${i + 1}. ${seg.round ? "⚡ " : ""}${seg.question.type}: ${seg.question.prompt.slice(0, 60)}`,
    })),
    qna: state.qna
      .map((q) => ({
        id: q.id,
        text: q.text,
        author: nameOf(state, q.playerId),
        votes: q.voters.length,
        votedByMe: false,
        answered: q.answered,
        hidden: q.hidden,
      }))
      .sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes),
    judgeConfigured,
    canGoBack,
  };
}
