import type { ArenaDuck, ArenaMove } from "./arenaSim";
import type { DuckOutfit } from "./outfit";

/**
 * Wire protocol and data model for the online ("live") quiz, shared by the
 * Cloudflare Worker (`worker/`) and the browser (`src/live/`).
 *
 * The Worker is authoritative: it owns the clock, scores every answer, and
 * sends each connection a *view* of the room that only contains what that
 * connection is allowed to see (players never receive correct answers before
 * the reveal).
 */

// ---------------------------------------------------------------------------
// Show content (authored ahead of time, uploaded by the host at room creation)
// ---------------------------------------------------------------------------

export type ChoiceOption = { id: string; text: string };

/**
 * How a choice question is scored:
 *  accuracy – a correct answer earns `points`, however long it took (Slido's
 *             default feel, and the default here)
 *  speed    – a correct answer also earns a bonus that shrinks the longer it
 *             took, from the full bonus at once down to 0 at the time limit
 *
 * Only choice questions can be speed-scored: every answer is a single
 * keypress, so speed measures knowing the answer, not how fast someone types.
 */
export type ScoringMode = "accuracy" | "speed";

/** Multiple choice / true-false. */
export type ChoiceQuestion = {
  type: "choice";
  id: string;
  prompt: string;
  /** 2–4 options; they map onto the four directions of the answer pad. */
  options: ChoiceOption[];
  correctId: string;
  points: number;
  timeLimitSec: number;
  /** Defaults to the room's `choiceScoring`. */
  scoring?: ScoringMode;
  /** Max speed bonus for this question; defaults to the room's `speedBonusMax`. */
  speedBonus?: number;
  /** Play it in the answer arena: players walk their ducks onto an answer. */
  arena?: boolean;
  factoid?: string;
};

/** Closest guess wins; points fall off by rank. */
export type NumericQuestion = {
  type: "numeric";
  id: string;
  prompt: string;
  answer: number;
  unit?: string;
  points: number;
  timeLimitSec: number;
  factoid?: string;
};

/**
 * Longform written answer, judged by Jev and confirmed by the host.
 *
 * Deliberately has no timer and no speed bonus: typing speed must never be
 * part of the score (some players type with one hand). Players can keep
 * editing until the host closes the question.
 */
export type WrittenQuestion = {
  type: "written";
  id: string;
  prompt: string;
  /** Optional model answer the judge compares against. */
  referenceAnswer?: string;
  /**
   * Atomic yes/no criteria, e.g. "names at least two survival priorities".
   * Each becomes its own Jev question; keep them to one idea apiece.
   */
  rubric: string[];
  points: number;
  maxLength?: number;
};

/** Slido-style poll. Unscored; results are shown after the host closes it. */
export type PollQuestion = {
  type: "poll";
  id: string;
  prompt: string;
  options: ChoiceOption[];
  /** Play it in the answer arena: players walk their ducks onto an answer. */
  arena?: boolean;
};

export type LiveQuestion =
  | ChoiceQuestion
  | NumericQuestion
  | WrittenQuestion
  | PollQuestion;

export type MinigameId = "duck-stop" | "pond-memory";

export type MinigameSegment = {
  kind: "minigame";
  id: string;
  game: MinigameId;
  /** Points for 1st place; lower places get a falling share. */
  points: number;
  durationSec: number;
};

/** A question inside a lightning round; timing and points come from the round. */
export type LightningQuestion = Pick<
  ChoiceQuestion,
  "id" | "prompt" | "options" | "correctId" | "factoid"
>;

/**
 * Lightning round: rapid-fire, speed-scored choice questions that run back to
 * back without the host pressing Next. A short "get ready" countdown precedes
 * the first question, each answer is revealed for `revealSec`, then the next
 * opens automatically. The host can still skip ahead or pause by showing the
 * leaderboard.
 */
export type LightningRound = {
  kind: "lightning";
  id: string;
  title?: string;
  timeLimitSec: number;
  /** Points for a correct answer. */
  points: number;
  /** Max extra points for an instant correct answer. */
  speedBonus: number;
  /** How long each answer is shown before the next question. Default 3. */
  revealSec?: number;
  questions: LightningQuestion[];
};

/** Where a question sits in a lightning round (set when the show is loaded). */
export type RoundInfo = {
  id: string;
  title: string;
  /** 0-based position within the round. */
  index: number;
  count: number;
  revealSec: number;
};

export type QuestionSegment = {
  kind: "question";
  question: LiveQuestion;
  round?: RoundInfo;
};

/** What actually gets played: lightning rounds are expanded into questions. */
export type Segment = QuestionSegment | MinigameSegment;

/** A segment as authored in a show file. */
export type ShowSegment = Segment | LightningRound;

export type Show = {
  title: string;
  segments: ShowSegment[];
};

export type Team = { id: string; name: string; color: string };

export type RoomSettings = {
  teamMode: boolean;
  teams: Team[];
  /** Scoring for choice questions that don't set their own. */
  choiceScoring: ScoringMode;
  /** Default max speed bonus for speed-scored choice questions. */
  speedBonusMax: number;
  /**
   * Play multiple-choice questions and polls in the answer arena unless a
   * question says otherwise (default: yes). Lightning rounds stay tap-to-answer.
   */
  arena?: boolean;
};

// ---------------------------------------------------------------------------
// Live state
// ---------------------------------------------------------------------------

/**
 *  open      – accepting answers
 *  closed    – answers locked, nothing revealed yet
 *  judging   – (written) Jev is scoring submissions
 *  review    – (written) host is checking Jev's suggested points
 *  revealed  – results shown and points awarded
 */
/**
 * "reading": arena questions start with just the question on screen for the
 * host to read out; their next press opens the arena with the answers.
 */
export type SegmentStage = "reading" | "open" | "closed" | "judging" | "review" | "revealed";

export type RoomPhase = "lobby" | "segment" | "leaderboard" | "ended";

export type AnswerValue =
  | { type: "choice"; optionId: string }
  | { type: "numeric"; value: number }
  | { type: "written"; text: string }
  | { type: "poll"; optionId: string }
  | { type: "minigame"; score: number };

export type Submission = {
  value: AnswerValue;
  /** Server receive time (ms since epoch). */
  at: number;
};

/** What Jev said about one written answer. */
export type JudgeResult = {
  status: "ok" | "error" | "skipped";
  /** Points Jev's rubric suggests, before host review. */
  suggestedPoints: number;
  /** Per-criterion probability that the answer meets it (0–1). */
  criteria: { text: string; p: number }[];
  /** 0–4 overall quality score, if available. */
  quality?: number;
  qualityConfidence?: number;
  /** Probability the answer tries to talk to/steer the grader. */
  manipulation?: number;
  /** Reasons this one deserves a human look. */
  flags: string[];
  error?: string;
};

export type ScoreKind = "base" | "speed" | "minigame" | "judge" | "adjust";

export type ScoreEvent = {
  playerId: string;
  segmentId: string;
  kind: ScoreKind;
  points: number;
};

export type QnaItem = {
  id: string;
  playerId: string;
  text: string;
  at: number;
  voters: string[];
  answered: boolean;
  hidden: boolean;
};

// ---------------------------------------------------------------------------
// Views sent to clients
// ---------------------------------------------------------------------------

export type PublicPlayer = {
  id: string;
  name: string;
  teamId: string | null;
  connected: boolean;
  score: number;
  /** Which duck this player is (join order); see src/live/mascot/variants.ts. */
  lookIndex: number;
  /** Their Ceramic Duck Hours entry, if linked (the leader wears the crown). */
  duckHolderId: string | null;
  /** The hat and neckpiece they picked (saved on their account). */
  outfit: DuckOutfit | null;
};

export type TeamStanding = Team & {
  /** Average score per member, so team size doesn't decide the winner. */
  score: number;
  members: number;
};

/** A question/minigame as players see it: no answers until revealed. */
export type PublicSegment = {
  index: number;
  total: number;
  id: string;
  kind: "question" | "minigame";
  stage: SegmentStage;
  openedAt: number;
  /** Answers are accepted (and speed is timed) from here; later than
   *  `openedAt` when there's a "get ready" countdown. */
  answersOpenAt: number;
  closesAt: number | null;
  /** Lightning rounds: when the next question opens by itself. */
  advanceAt: number | null;
  /** Whether a correct answer here earns a speed bonus. */
  speedScored: boolean;
  round?: RoundInfo;
  /** Answer arena: how many ducks it was laid out for (see shared/arena.ts). */
  arena?: { players: number };
  answeredCount: number;
  eligibleCount: number;
  question?: PublicQuestion;
  minigame?: { game: MinigameId; seed: number; durationSec: number; points: number };
  /** Filled once revealed. */
  reveal?: SegmentReveal;
};

export type PublicQuestion =
  | Omit<ChoiceQuestion, "correctId" | "factoid">
  | Omit<NumericQuestion, "answer" | "factoid">
  | Omit<WrittenQuestion, "referenceAnswer" | "rubric">
  | PollQuestion;

export type SegmentReveal = {
  correctId?: string;
  answer?: number;
  unit?: string;
  factoid?: string;
  referenceAnswer?: string;
  /** Option id → number of picks (choice and poll). */
  distribution?: Record<string, number>;
  /** Points awarded this segment, highest first. */
  awards: { playerId: string; name: string; points: number; detail?: string }[];
  /** On the last question of a lightning round: totals for the whole round. */
  roundTotals?: { playerId: string; name: string; points: number }[];
};

export type PlayerView = {
  role: "player";
  code: string;
  title: string;
  serverNow: number;
  phase: RoomPhase;
  settings: RoomSettings;
  me: PublicPlayer & { duckHolderId: string | null };
  players: PublicPlayer[];
  teams: TeamStanding[];
  segment: PublicSegment | null;
  myAnswer: AnswerValue | null;
  /** My points from the current segment, once revealed. */
  myAward: number | null;
  qna: PublicQna[];
};

export type PublicQna = {
  id: string;
  text: string;
  author: string;
  votes: number;
  votedByMe: boolean;
  answered: boolean;
};

export type HostSubmission = {
  playerId: string;
  name: string;
  value: AnswerValue;
  elapsedMs: number;
  judge?: JudgeResult;
  /** Host's final points for a written answer (defaults to Jev's suggestion). */
  finalPoints?: number;
};

export type HostView = {
  role: "host";
  /** There's a step to undo with "back". */
  canGoBack: boolean;
  code: string;
  title: string;
  serverNow: number;
  phase: RoomPhase;
  settings: RoomSettings;
  players: (PublicPlayer & { duckHolderId: string | null })[];
  teams: TeamStanding[];
  segment: PublicSegment | null;
  /** Full question including the answer. Hidden on screen until asked for. */
  fullSegment: Segment | null;
  submissions: HostSubmission[];
  /** Live tally for polls while they're open (host screen only, Slido-style). */
  liveDistribution: Record<string, number> | null;
  segments: { id: string; label: string }[];
  qna: (PublicQna & { hidden: boolean })[];
  judgeConfigured: boolean;
};

export type RoomView = PlayerView | HostView;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type HostMessage =
  | { t: "advance" }
  | { t: "close" }
  /** Undo the last advance, lock or end (pressed too early). */
  | { t: "back" }
  | { t: "showLeaderboard" }
  | { t: "end" }
  | { t: "setFinalPoints"; playerId: string; points: number }
  | { t: "rejudge" }
  | { t: "kick"; playerId: string }
  | { t: "qnaModerate"; id: string; answered?: boolean; hidden?: boolean };

export type PlayerMessage =
  | { t: "answer"; segmentId: string; value: AnswerValue }
  | { t: "move"; segmentId: string; move: ArenaMove }
  | { t: "qnaAsk"; text: string }
  | { t: "qnaVote"; id: string }
  /** Dress your duck (also saved on your account for next time). */
  | { t: "outfit"; outfit: DuckOutfit };

export type ClientMessage = HostMessage | PlayerMessage | { t: "ping" };

export type ServerMessage =
  | { t: "state"; view: RoomView }
  /** Answer arena positions, ~10× a second while an arena question is open. */
  | { t: "arena"; segmentId: string; at: number; ducks: ArenaDuck[] }
  | { t: "error"; message: string }
  | { t: "pong"; serverNow: number };

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export type CreateRoomRequest = {
  password: string;
  show: Show;
  settings: RoomSettings;
};

export type CreateRoomResponse = { code: string; hostKey: string };

/** Join a room as an account (your name, Duck Hours entry and outfit come from it). */
export type JoinRequest = {
  account: { id: string; token: string };
  teamId: string | null;
};

// ---------------------------------------------------------------------------
// Accounts: no sign-ups or emails. Players pick themselves from the Ceramic
// Duck Hours leaderboard (or add themselves as someone new) and guard that
// name with a four-digit PIN.
// ---------------------------------------------------------------------------

export type Account = {
  id: string;
  /** Duck Hours initials, or the name a new player chose. */
  name: string;
  /** Their Ceramic Duck Hours entry, if they claimed one. */
  holderId: string | null;
  outfit: DuckOutfit | null;
  /** The host reset their PIN: the next one they type becomes the new PIN. */
  needsPin?: boolean;
};

export type AccountList = { accounts: Account[] };

/** Claim a Duck Hours entry (holderId set, name = their initials) or add someone new. */
export type CreateAccountRequest = { name: string; holderId: string | null; pin: string };

export type LoginRequest = { pin: string };

/** What a device keeps to stay signed in as an account. */
export type AccountSession = { account: Account; token: string };

/** The host resets a forgotten PIN; the player sets a new one next time. */
export type ResetPinRequest = { password: string };

// ---------------------------------------------------------------------------
// The host's saved question set (behind the host password)
// ---------------------------------------------------------------------------

/** The question set every new game starts with, until the host edits it. */
export type SavedShow = { show: Show | null; updatedAt: number | null };
export type LoadShowRequest = { password: string };
export type SaveShowRequest = { password: string; show: Show };

export const PIN_RE = /^\d{4}$/;
/** Wrong PINs in a row before an account locks for a while. */
export const PIN_TRIES = 5;
export const PIN_LOCK_MINUTES = 15;

export type JoinResponse = { playerId: string; token: string };

/** Lobby info a player needs before joining (team list, title). */
export type RoomInfo = {
  code: string;
  title: string;
  phase: RoomPhase;
  settings: RoomSettings;
};

export const MAX_NAME_LENGTH = 32;
/** The arena feed id for the lobby's waddle-about area. */
export const LOBBY_FEED = "lobby";
/** Players see a 3-2-1 before a minigame starts. */
export const MINIGAME_COUNTDOWN_SEC = 3;
/** "Get ready" countdown before the first lightning-round question. */
export const LIGHTNING_INTRO_SEC = 3;
export const LIGHTNING_REVEAL_SEC = 3;
export const MAX_WRITTEN_LENGTH = 2000;
export const MAX_QNA_LENGTH = 280;
