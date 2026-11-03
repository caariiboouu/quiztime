/**
 * The debate & teams practice room (#/live/test): a real game room, run by
 * the server on a timer instead of by a host, that anyone can join with just
 * a name. It plays one of every question type in team mode, then starts over.
 * Like the duck arena practice, it's for trying things out with whoever else
 * has the page open.
 */
import isItPie from "../src/data/isItPie.json";
import { DEFAULT_DEBATE_LEVELS, type DebateSide, type RoomSettings, type Show, type ShowSegment } from "./protocol";

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
  /** Each debate argument on screen, read out one at a time. */
  argument: 9,
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
        sides: { for: "Sandwich", against: "Not a sandwich" },
        // Checked against Merriam-Webster's 2016 "hot dog is a sandwich" post and
        // the Council's November 2015 ruling (as reported by Mental Floss and others).
        facts: [
          {
            text: "Merriam-Webster said in 2016 that a hot dog is a sandwich: its definition of a sandwich includes a split roll with a filling.",
            side: "for",
          },
          {
            text: "Hot dogs were once called \"frankfurter sandwiches\" or \"Coney Island sandwiches\".",
            side: "for",
          },
          {
            text: "In 2015 the National Hot Dog and Sausage Council ruled that a hot dog is not a sandwich but a category of its own.",
            side: "against",
          },
        ],
        winBonus: 100,
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
    // From the Is it pie? set, so its facts stay in one place.
    pieDebate("pie-pumpkin"),
  ],
};

function pieDebate(id: string): ShowSegment {
  const seg = (isItPie as Show).segments.find((s) => s.kind === "question" && s.question.id === id);
  if (!seg) throw new Error(`The Is it pie? set has no ${id}`);
  return seg;
}

/**
 * House ducks: the practice room's own, who sit in on every game and argue
 * the debates (nothing else), so there's a back and forth to read out and
 * facts turning over even with one person here. Their verdicts and facts are
 * written down below rather than judged, so they cost nothing and work with
 * Jev off. Two on each team.
 */
export const PRACTICE_HOUSE: readonly { name: string; teamId: string; lookIndex: number }[] = [
  { name: "Pip (house)", teamId: "mallards", lookIndex: 200 },
  { name: "Juniper (house)", teamId: "canvasbacks", lookIndex: 201 },
  { name: "Biscuit (house)", teamId: "mallards", lookIndex: 202 },
  { name: "Pickles (house)", teamId: "canvasbacks", lookIndex: 203 },
];

export type HouseArgument = {
  /** Which house duck (index into PRACTICE_HOUSE). */
  duck: number;
  side: DebateSide;
  text: string;
  /** Its verdict, as an index into the question's levels (0 is the best). */
  level: number;
  /** Facts it brings up (by index), and facts it contradicts. Every other fact: not mentioned. */
  uncovers?: number[];
  bluffs?: number[];
};

/** What the house ducks argue, by debate id, in the order they argue it. */
export const PRACTICE_HOUSE_ARGUMENTS: Record<string, readonly HouseArgument[]> = {
  "d-hotdog": [
    {
      duck: 1,
      side: "for",
      text: "Merriam-Webster said in 2016 that a hot dog is a sandwich, because a sandwich can be a split roll with a filling. Case closed.",
      level: 1,
      uncovers: [0],
    },
    {
      duck: 0,
      side: "against",
      text: "The National Hot Dog and Sausage Council ruled in 2015 that a hot dog is not a sandwich. It's a category of its own, and they'd know.",
      level: 0,
      uncovers: [2],
    },
    {
      duck: 3,
      side: "for",
      text: "A sub roll is joined at the back too, and nobody says a sub isn't a sandwich.",
      level: 2,
    },
    {
      duck: 2,
      side: "against",
      text: "You can't cut a hot dog into triangles, so it can't be a sandwich.",
      level: 3,
    },
  ],
  "d-horse-duck": [
    {
      duck: 2,
      side: "for",
      text: "One big duck is one target. A hundred tiny horses come at you from every side, and you can't dodge four hundred hooves.",
      level: 1,
    },
    {
      duck: 3,
      side: "against",
      text: "A tiny horse is the size of a duck. A horse-sized duck has a beak the size of a car door and it is angry.",
      level: 1,
    },
  ],
  "pie-pumpkin": [
    {
      duck: 0,
      side: "for",
      text: "Illinois made pumpkin pie its official state pie in 2015. A state doesn't pass a law naming a pudding its state pie.",
      level: 0,
      uncovers: [0],
    },
    {
      duck: 1,
      side: "against",
      text: "The British Pie Awards say a pie has to be wholly encased in pastry. Pumpkin pie has no top crust, so it's an open tart at best.",
      level: 1,
      uncovers: [3],
    },
    {
      duck: 2,
      side: "for",
      text: "The first American cookbook, American Cookery from 1796, bakes its pumpkin filling in a crust. Filling in a crust is a pie.",
      level: 1,
      uncovers: [1],
    },
    {
      duck: 3,
      side: "against",
      text: "Pumpkin pie only got a crust in the 1950s. Before that it was always baked in a mould, like a flan.",
      level: 3,
      bluffs: [1],
    },
  ],
};
