/**
 * The public practice arena (#/live/arena): one shared room on the Worker
 * where anyone who opens the page gets a duck. Questions loop on a timer, no
 * host needed; computer ducks fill in so it's never empty. The same questions
 * and timings drive the offline practice when the server can't be reached.
 */
import type { ArenaDuck, ArenaMove } from "./arenaSim";

export type DemoQuestion = { prompt: string; options: string[]; correct: number };

export const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    prompt: "You're stranded somewhere cold. What should you do first?",
    options: [
      "Get out of the wind and build a shelter, because exposure is the fastest danger.",
      "Start walking right away to look for help before it gets dark.",
      "Eat as much of your food as you can so your body stays warm.",
      "Take off any damp layers and wait in the open where rescuers can see you.",
    ],
    correct: 0,
  },
  {
    prompt: "Which of these is a real domestic duck breed?",
    options: ["Magpie", "Sparrowhawk", "Pelican", "Puffin"],
    correct: 0,
  },
  {
    prompt: "True or false: Cayuga ducks have black feathers with a green sheen.",
    options: ["True", "False"],
    correct: 0,
  },
  {
    prompt: "A group of ducks floating on water is called a…",
    options: ["Raft", "Herd", "Parliament"],
    correct: 0,
  },
  {
    prompt: "Why do ducks' feathers stay dry when they swim?",
    options: [
      "They spread oil from a gland near the tail over their feathers when they preen.",
      "Their feathers are hollow, so water slides straight off.",
      "They shake every few seconds, too fast for us to see.",
      "Their skin is warm enough to dry the water as it lands.",
    ],
    correct: 0,
  },
];

/** Seconds to walk to an answer, then to look at the result. */
export const DEMO_OPEN_SEC = 20;
export const DEMO_REVEAL_SEC = 7;
/** Computer ducks top the crowd up to this many. */
export const DEMO_FILL = 12;
/** At most this many people at once. */
export const DEMO_MAX_PLAYERS = 40;

export const DEMO_NAMES = [
  "Puddles", "Waddles", "Quackers", "Dabble", "Mallory", "Bill", "Webster",
  "Nibbles", "Drake", "Splash", "Pebble", "Biscuit", "Paddle", "Maple", "Noodle",
  "Pickle", "Ducky", "Bubbles", "Feathers", "Sunny", "Ripple", "Dumpling", "Mochi",
  "Pippin", "Clover", "Juniper", "Muffin", "Ziggy", "Wobble", "Tofu", "Sprout",
  "Basil", "Peanut", "Rocket", "Marble", "Captain", "Fennel", "Doodle", "Waffles",
  "Olive", "Truffle", "Gizmo", "Button", "Cosmo", "Hazel", "Poppy", "Socks",
];

export type DemoDuck = { id: string; name: string; lookIndex: number; bot: boolean };

export type DemoState = {
  t: "demo";
  /** Your duck. */
  you: string;
  /** Increments every question; moves must quote it. */
  round: number;
  question: { prompt: string; options: string[] };
  phase: "open" | "reveal";
  /** Server clock (ms) when this phase ends, and the server's clock now. */
  endsAt: number;
  serverNow: number;
  /** Only once revealed. */
  correct: number | null;
  /** How many ducks the arena was laid out for (fixed for the round). */
  layoutPlayers: number;
  ducks: DemoDuck[];
};

export type DemoServerMessage =
  | DemoState
  | { t: "arena"; segmentId: string; at: number; ducks: ArenaDuck[] }
  | { t: "full" };

export type DemoClientMessage = { t: "move"; round: number; move: ArenaMove };

/** The arena feed id for a round (what the snapshots are tagged with). */
export const demoSegmentId = (round: number) => `demo-${round}`;
