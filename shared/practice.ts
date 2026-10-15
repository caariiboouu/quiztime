/**
 * The debate & teams practice room (#/live/test): a real game room, run by
 * the server on a timer instead of by a host, that anyone can join with just
 * a name. It plays one of every question type in team mode, then starts over.
 * Like the duck arena practice, it's for trying things out with whoever else
 * has the page open.
 */
import { DEFAULT_DEBATE_LEVELS, type RoomSettings, type Show } from "./protocol";

/**
 * The practice room's code. It has an O and an I in it, which real room codes
 * never do, so a host can never be handed it.
 */
export const PRACTICE_CODE = "OINK";

/** At most this many people in the practice room at once. */
export const PRACTICE_MAX_PLAYERS = 30;
/** Practice names, like the arena's. */
export const PRACTICE_MAX_NAME = 20;

/**
 * Jev calls the practice room may make in a day (each argument or written
 * answer is one call, a few hundredths of a cent each). Past this, answers
 * that day all score the middle instead of being judged.
 */
export const PRACTICE_JEV_CALLS_PER_DAY = 400;

/** How long each step lasts with nobody hosting, in seconds. */
export const PRACTICE_TIMING = {
  /** Waddle into a team corner; the teams are evened out at the end. */
  lobby: 40,
  /** Then the auto-balance, with ducks flying over, before the first question. */
  balance: 5,
  /** Arena questions: just the question up first. */
  reading: 6,
  /** Questions with no time limit of their own. */
  poll: 30,
  written: 120,
  debate: 150,
  /** Once everyone here has written something, this long to finish editing. */
  allIn: 15,
  /** Locked, then the answers. */
  closed: 2,
  /** Longest wait for Jev before scoring what's back. */
  judging: 45,
  review: 1,
  /** Results on screen, then the team scores. */
  revealed: 12,
  leaderboard: 8,
  /** The podium, then a fresh game. */
  ended: 25,
} as const;

/** What joining the practice room gives back. */
export type PracticeJoinResponse = {
  code: string;
  playerId: string;
  token: string;
  /** False when the server has no Jev key (or the day's Jev budget is spent). */
  judged: boolean;
};

export const PRACTICE_SETTINGS: RoomSettings = {
  teamMode: true,
  teams: [
    { id: "mallards", name: "Mallards", color: "#16a34a" },
    { id: "canvasbacks", name: "Canvasbacks", color: "#c2410c" },
  ],
  teamScoring: "average",
  // Right answers count, not fast fingers.
  choiceScoring: "accuracy",
  speedBonusMax: 0,
  arena: true,
};

export const PRACTICE_SHOW: Show = {
  title: "Practice: debates & teams",
  segments: [
    {
      kind: "question",
      question: {
        type: "poll",
        id: "p-saturday",
        prompt: "Warm-up: where would your duck rather spend a Saturday?",
        options: [
          { id: "pond", text: "A quiet pond at sunrise" },
          { id: "fountain", text: "A busy city fountain" },
          { id: "bath", text: "Someone's bubble bath" },
          { id: "golf", text: "A golf course water hazard" },
        ],
      },
    },
    {
      kind: "question",
      question: {
        type: "debate",
        id: "d-hotdog",
        prompt: "This house believes a hot dog is a sandwich.",
        levels: DEFAULT_DEBATE_LEVELS,
        points: 200,
      },
    },
    {
      kind: "question",
      question: {
        type: "choice",
        id: "c-imprint",
        prompt: "Ducklings follow the first moving thing they see after hatching. What's that called?",
        options: [
          { id: "a", text: "Imprinting" },
          { id: "b", text: "Mirroring" },
          { id: "c", text: "Nest-locking" },
          { id: "d", text: "Flocking" },
        ],
        correctId: "a",
        points: 100,
        timeLimitSec: 25,
        factoid:
          "Konrad Lorenz famously had goslings imprint on him in the 1930s; they followed him around like he was their mother.",
      },
    },
    {
      kind: "question",
      question: {
        type: "debate",
        id: "d-horse-duck",
        prompt: "This house would rather fight one horse-sized duck than a hundred duck-sized horses.",
        levels: DEFAULT_DEBATE_LEVELS,
        points: 200,
        sides: { for: "One big duck", against: "100 tiny horses" },
      },
    },
    {
      kind: "question",
      question: {
        type: "numeric",
        id: "n-hatch",
        prompt: "Roughly how many days does a mallard egg take to hatch?",
        answer: 28,
        unit: "days",
        points: 100,
        timeLimitSec: 30,
        factoid: "Usually 26 to 30 days, and the whole clutch hatches within a day of each other.",
      },
    },
    {
      kind: "question",
      question: {
        type: "written",
        id: "w-bread",
        prompt: "In a sentence or two: why is feeding ducks bread a bad idea?",
        referenceAnswer:
          "Bread fills ducks up without the nutrients they need, which can lead to malnutrition and a wing deformity called angel wing, and leftover bread rots in the water, feeding algae and attracting rats.",
        rubric: [
          "Says bread has little nutritional value for ducks, or fills them up without what they need.",
          "Names a harm to the ducks themselves, such as malnutrition or the wing deformity called angel wing.",
          "Names a harm to the pond or its surroundings, such as rotting leftovers, algae, or attracting rats.",
        ],
        points: 150,
      },
    },
    {
      kind: "question",
      question: {
        type: "choice",
        id: "c-real-duck",
        prompt: "Which of these is a real duck?",
        options: [
          { id: "a", text: "Bufflehead" },
          { id: "b", text: "Puddlenose" },
          { id: "c", text: "Velvet waddler" },
          { id: "d", text: "Snorkel teal" },
        ],
        correctId: "a",
        points: 100,
        timeLimitSec: 25,
        factoid: "Buffleheads are small diving ducks; the name comes from 'buffalo head', for the male's puffy head.",
      },
    },
    {
      kind: "question",
      question: {
        type: "debate",
        id: "d-pineapple",
        prompt: "This house believes pineapple belongs on pizza.",
        levels: DEFAULT_DEBATE_LEVELS,
        points: 200,
      },
    },
  ],
};
