import { describe, expect, it } from "vitest";
import type { RoomSettings, Show } from "../../shared/protocol";
import {
  RuleError,
  addPlayer,
  applyJudgeResult,
  createRoom,
  finishJudging,
  hostAction,
  hostView,
  loadRoom,
  openArena,
  playerAction,
  playerView,
  scores,
  setArenaAnswers,
  tick,
  validateSettings,
  UNDO_LIMIT,
  validateShow,
  type RoomState,
} from "./engine";

const SHOW: Show = {
  title: "Test show",
  segments: [
    {
      kind: "question",
      question: {
        type: "choice",
        id: "q1",
        prompt: "Pick B",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correctId: "b",
        points: 100,
        timeLimitSec: 20,
        scoring: "speed",
        factoid: "B is best",
      },
    },
    {
      kind: "question",
      question: {
        type: "written",
        id: "w1",
        prompt: "Explain",
        referenceAnswer: "Because",
        rubric: ["mentions because"],
        points: 200,
      },
    },
    { kind: "minigame", id: "m1", game: "duck-stop", points: 50, durationSec: 20 },
  ],
};

// Most tests here are about tap-to-answer; the arena has its own tests below.
const SETTINGS: RoomSettings = {
  teamMode: false,
  teams: [],
  choiceScoring: "accuracy",
  speedBonusMax: 50,
  arena: false,
};

function setup(): { room: RoomState; t0: number } {
  const t0 = 1_000_000;
  const room = createRoom("ABCD", "hostkey", { show: SHOW, settings: SETTINGS }, t0);
  addPlayer(room, { name: "Ann", teamId: null, duckHolderId: "duck-1" }, "p1", "tok1", t0);
  addPlayer(room, { name: "Bob", teamId: null, duckHolderId: null }, "p2", "tok2", t0);
  return { room, t0 };
}

const host = (room: RoomState, t: Parameters<typeof hostAction>[1], now: number, judge = true) =>
  hostAction(room, t, { now, seed: 42, judgeAvailable: judge });

const both = new Set(["p1", "p2"]);
const answer = (room: RoomState, pid: string, segId: string, value: unknown, now: number) =>
  playerAction(
    room,
    pid,
    { t: "answer", segmentId: segId, value: value as never },
    { now, connected: both, judgeAvailable: true, newId: `id-${now}` },
  );

describe("validation", () => {
  it("accepts the sample", () => {
    expect(validateShow(SHOW)).toBeNull();
    expect(validateSettings(SETTINGS)).toBeNull();
  });
  it("rejects a correctId that isn't an option", () => {
    const bad = structuredClone(SHOW);
    (bad.segments[0] as { question: { correctId: string } }).question.correctId = "z";
    expect(validateShow(bad)).toMatch(/correctId/);
  });
  it("rejects duplicate ids and unknown minigames", () => {
    const dup = structuredClone(SHOW);
    (dup.segments[2] as { id: string }).id = "q1";
    expect(validateShow(dup)).toMatch(/duplicate/);
    const game = structuredClone(SHOW);
    (game.segments[2] as { game: string }).game = "nope";
    expect(validateShow(game)).toMatch(/unknown minigame/);
  });
  it("rejects bad team colors", () => {
    expect(
      validateSettings({
        ...SETTINGS,
        teamMode: true,
        teams: [
          { id: "a", name: "A", color: "red" },
          { id: "b", name: "B", color: "#00ff00" },
        ],
      }),
    ).toMatch(/colors/);
  });
});

describe("joining", () => {
  it("rejects duplicate names and requires a team in team mode", () => {
    const { room, t0 } = setup();
    expect(() =>
      addPlayer(room, { name: " ann ", teamId: null, duckHolderId: null }, "p3", "t3", t0),
    ).toThrow(RuleError);
    room.settings = {
      ...SETTINGS,
      teamMode: true,
      teams: [
        { id: "red", name: "Red", color: "#ff0000" },
        { id: "blue", name: "Blue", color: "#0000ff" },
      ],
    };
    expect(() =>
      addPlayer(room, { name: "Cat", teamId: null, duckHolderId: null }, "p3", "t3", t0),
    ).toThrow(/team/);
  });
});

describe("choice question", () => {
  it("scores correct answers with a speed bonus and hides the answer until reveal", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0);
    expect(room.run?.closesAt).toBe(t0 + 20_000);

    // Players must not see the correct answer or factoid while it's open.
    const pv = playerView(room, "p1", both, t0);
    expect(JSON.stringify(pv)).not.toContain("correctId");
    expect(JSON.stringify(pv)).not.toContain("B is best");

    answer(room, "p1", "q1", { type: "choice", optionId: "b" }, t0 + 5_000);
    expect(room.run?.stage).toBe("open");
    // Last player answering closes it early.
    answer(room, "p2", "q1", { type: "choice", optionId: "a" }, t0 + 6_000);
    expect(room.run?.stage).toBe("closed");

    host(room, { t: "advance" }, t0 + 7_000);
    expect(room.run?.stage).toBe("revealed");
    const s = scores(room);
    // 100 base + 50 * (1 - 5/20) = 137.5 → 38 speed bonus (rounded)
    expect(s.get("p1")).toBe(100 + 38);
    expect(s.get("p2") ?? 0).toBe(0);
    expect(room.run?.reveal?.distribution).toEqual({ a: 1, b: 1 });
    expect(playerView(room, "p1", both, t0).myAward).toBe(138);
  });

  it("rejects answers after the deadline closes it", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0);
    tick(room, { now: t0 + 20_000, seed: 1, judgeAvailable: true });
    expect(() => answer(room, "p1", "q1", { type: "choice", optionId: "b" }, t0 + 21_000)).toThrow(
      /locked/,
    );
  });

  it("rejects options that don't exist", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0);
    expect(() => answer(room, "p1", "q1", { type: "choice", optionId: "zz" }, t0)).toThrow(
      /Unknown option/,
    );
  });
});

describe("written question", () => {
  function toWritten() {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0); // open q1
    host(room, { t: "advance" }, t0); // close
    host(room, { t: "advance" }, t0); // reveal
    host(room, { t: "advance" }, t0); // open w1
    return { room, t0 };
  }

  it("has no deadline, stays open when everyone answers, and has no speed bonus", () => {
    const { room, t0 } = toWritten();
    expect(room.run?.closesAt).toBeNull(); // no clock running yet
    answer(room, "p1", "w1", { type: "written", text: "Because reasons" }, t0 + 1);
    answer(room, "p2", "w1", { type: "written", text: "dunno" }, t0 + 999_999);
    expect(room.run?.stage).toBe("open");
    // Editing is allowed while open.
    answer(room, "p2", "w1", { type: "written", text: "Because, actually" }, t0 + 1_000_000);

    const effects = host(room, { t: "advance" }, t0);
    expect(effects.startJudging).toBe(true);
    expect(room.run?.stage).toBe("judging");

    const ok = (pts: number) => ({ status: "ok" as const, suggestedPoints: pts, criteria: [], flags: [] });
    applyJudgeResult(room, "w1", "p1", ok(150));
    applyJudgeResult(room, "w1", "p2", ok(150));
    finishJudging(room, "w1");
    expect(room.run?.stage).toBe("review");

    // Host overrides one; clamped to the question's max.
    host(room, { t: "setFinalPoints", playerId: "p2", points: 9999 }, t0);
    host(room, { t: "advance" }, t0);
    const s = scores(room);
    // Same judged quality → same points no matter who typed faster.
    expect(s.get("p1")).toBe(150);
    expect(room.events.filter((e) => e.segmentId === "w1" && e.playerId === "p2")[0].points).toBe(
      200,
    );
    expect(room.events.some((e) => e.segmentId === "w1" && e.kind === "speed")).toBe(false);
  });

  it("goes straight to review when Jev isn't configured", () => {
    const { room, t0 } = toWritten();
    answer(room, "p1", "w1", { type: "written", text: "x" }, t0);
    const effects = hostAction(room, { t: "advance" }, { now: t0, seed: 1, judgeAvailable: false });
    expect(effects.startJudging).toBeUndefined();
    expect(room.run?.stage).toBe("review");
  });

  it("never sends the rubric or reference answer to players", () => {
    const { room, t0 } = toWritten();
    const pv = JSON.stringify(playerView(room, "p1", both, t0));
    expect(pv).not.toContain("mentions because");
    expect(pv).not.toContain("referenceAnswer");
    expect(JSON.stringify(hostView(room, both, t0, true))).toContain("mentions because");
  });
});

describe("minigame", () => {
  it("awards placement points by score", () => {
    const { room, t0 } = setup();
    for (let i = 0; i < 7; i++) host(room, { t: "advance" }, t0);
    expect(room.run?.index).toBe(2);
    expect(room.run?.seed).toBe(42);
    answer(room, "p1", "m1", { type: "minigame", score: 80 }, t0);
    answer(room, "p2", "m1", { type: "minigame", score: 120 }, t0);
    expect(room.run?.stage).toBe("closed");
    host(room, { t: "advance" }, t0);
    const awards = room.run!.reveal!.awards;
    expect(awards.map((a) => [a.playerId, a.points])).toEqual([
      ["p2", 50],
      ["p1", 25],
    ]);
    host(room, { t: "advance" }, t0);
    expect(room.phase).toBe("ended");
  });
});

describe("Q&A", () => {
  it("toggles votes and hides moderated questions from players", () => {
    const { room, t0 } = setup();
    const ctx = { now: t0, connected: both, judgeAvailable: true, newId: "qa1" };
    playerAction(room, "p1", { t: "qnaAsk", text: "  Is lunch provided?  " }, ctx);
    playerAction(room, "p2", { t: "qnaVote", id: "qa1" }, ctx);
    expect(playerView(room, "p2", both, t0).qna[0]).toMatchObject({
      text: "Is lunch provided?",
      votes: 1,
      votedByMe: true,
    });
    playerAction(room, "p2", { t: "qnaVote", id: "qa1" }, ctx);
    expect(playerView(room, "p2", both, t0).qna[0].votes).toBe(0);
    host(room, { t: "qnaModerate", id: "qa1", hidden: true }, t0);
    expect(playerView(room, "p2", both, t0).qna).toHaveLength(0);
    expect(hostView(room, both, t0, true).qna).toHaveLength(1);
  });
});

describe("kick", () => {
  it("removes the player from views and scoring", () => {
    const { room, t0 } = setup();
    const fx = host(room, { t: "kick", playerId: "p2" }, t0);
    expect(fx.disconnect).toBe("p2");
    expect(hostView(room, both, t0, true).players.map((p) => p.id)).toEqual(["p1"]);
    expect(() =>
      playerAction(room, "p2", { t: "qnaAsk", text: "hi" }, {
        now: t0,
        connected: both,
        judgeAvailable: true,
        newId: "x",
      }),
    ).toThrow(RuleError);
  });
});

describe("scoring modes", () => {
  function oneQuestion(scoring: "accuracy" | "speed" | undefined, roomScoring: "accuracy" | "speed") {
    const t0 = 1_000_000;
    const show: Show = {
      title: "S",
      segments: [
        {
          kind: "question",
          question: {
            type: "choice",
            id: "q",
            prompt: "?",
            options: [
              { id: "a", text: "A" },
              { id: "b", text: "B" },
            ],
            correctId: "a",
            points: 100,
            timeLimitSec: 10,
            ...(scoring ? { scoring } : {}),
          },
        },
      ],
    };
    const room = createRoom("ABCD", "k", { show, settings: { ...SETTINGS, choiceScoring: roomScoring } }, t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null }, "p1", "t", t0);
    host(room, { t: "advance" }, t0);
    answer(room, "p1", "q", { type: "choice", optionId: "a" }, t0 + 1_000);
    host(room, { t: "advance" }, t0 + 2_000);
    return { points: scores(room).get("p1"), view: playerView(room, "p1", both, t0) };
  }

  it("defaults to accuracy only: same points no matter how fast", () => {
    expect(oneQuestion(undefined, "accuracy").points).toBe(100);
    expect(oneQuestion(undefined, "accuracy").view.segment?.speedScored).toBe(false);
  });
  it("room-wide speed scoring adds a bonus", () => {
    // 50 * (1 - 1/10) = 45
    expect(oneQuestion(undefined, "speed").points).toBe(145);
  });
  it("a question can override the room setting either way", () => {
    expect(oneQuestion("speed", "accuracy").points).toBe(145);
    expect(oneQuestion("accuracy", "speed").points).toBe(100);
  });
});

describe("lightning round", () => {
  const LIGHTNING: Show = {
    title: "L",
    segments: [
      {
        kind: "lightning",
        id: "zap",
        title: "Zap!",
        timeLimitSec: 8,
        points: 50,
        speedBonus: 40,
        revealSec: 2,
        questions: ["l1", "l2", "l3"].map((id) => ({
          id,
          prompt: id,
          options: [
            { id: "t", text: "True" },
            { id: "f", text: "False" },
          ],
          correctId: "t",
        })),
      },
      { kind: "minigame", id: "after", game: "duck-stop", points: 10, durationSec: 10 },
    ],
  };

  function start() {
    const t0 = 1_000_000;
    const room = createRoom("ABCD", "k", { show: LIGHTNING, settings: SETTINGS }, t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null }, "p1", "t1", t0);
    addPlayer(room, { name: "Bob", teamId: null, duckHolderId: null }, "p2", "t2", t0);
    host(room, { t: "advance" }, t0);
    return { room, t0 };
  }
  const T = (room: RoomState, now: number) => tick(room, { now, seed: 7, judgeAvailable: true });

  it("expands into speed-scored choice questions with round info", () => {
    const { room } = start();
    expect(room.segments).toHaveLength(4);
    const seg = room.segments[1];
    expect(seg.kind === "question" && seg.round).toMatchObject({ id: "zap", index: 1, count: 3 });
    expect(seg.kind === "question" && seg.question).toMatchObject({
      type: "choice",
      scoring: "speed",
      points: 50,
      timeLimitSec: 8,
    });
  });

  it("has a get-ready countdown before the first question, and times speed from it", () => {
    const { room, t0 } = start();
    expect(room.run?.answersOpenAt).toBe(t0 + 3_000);
    expect(room.run?.closesAt).toBe(t0 + 3_000 + 8_000);
    expect(() => answer(room, "p1", "l1", { type: "choice", optionId: "t" }, t0 + 1_000)).toThrow(
      /Not yet/,
    );
    answer(room, "p1", "l1", { type: "choice", optionId: "t" }, t0 + 3_000 + 2_000);
    answer(room, "p2", "l1", { type: "choice", optionId: "f" }, t0 + 3_000 + 2_000);
    // Everyone answered → closes and reveals itself, no host needed.
    expect(room.run?.stage).toBe("revealed");
    // 50 + 40 * (1 - 2/8) = 80
    expect(scores(room).get("p1")).toBe(80);
    expect(room.run?.advanceAt).toBe(t0 + 5_000 + 2_000);
  });

  it("runs itself: deadline → reveal → next question, then stops after the round", () => {
    const { room, t0 } = start();
    T(room, t0 + 11_000); // first question times out
    expect(room.run?.stage).toBe("revealed");
    T(room, t0 + 12_999);
    expect(room.run?.index).toBe(0); // still showing the answer
    T(room, t0 + 13_000);
    expect(room.run).toMatchObject({ index: 1, stage: "open" });
    // No intro after the first question.
    expect(room.run?.answersOpenAt).toBe(t0 + 13_000);

    answer(room, "p1", "l2", { type: "choice", optionId: "t" }, t0 + 13_000);
    T(room, t0 + 21_000);
    T(room, t0 + 23_000);
    expect(room.run).toMatchObject({ index: 2, stage: "open" });
    answer(room, "p1", "l3", { type: "choice", optionId: "t" }, t0 + 23_000);
    answer(room, "p2", "l3", { type: "choice", optionId: "t" }, t0 + 27_000);

    // Last question: round totals, and the host takes over again.
    expect(room.run?.advanceAt).toBeNull();
    expect(room.run?.reveal?.roundTotals).toEqual([
      { playerId: "p1", name: "Ann", points: 180 },
      { playerId: "p2", name: "Bob", points: 70 },
    ]);
    T(room, t0 + 60_000);
    expect(room.run?.index).toBe(2);
    host(room, { t: "advance" }, t0 + 60_000);
    expect(room.run?.index).toBe(3);
  });

  it("pauses while the host shows the leaderboard, and the host can skip ahead", () => {
    const { room, t0 } = start();
    host(room, { t: "advance" }, t0 + 4_000); // lock early → auto-reveal
    expect(room.run?.stage).toBe("revealed");
    host(room, { t: "showLeaderboard" }, t0 + 4_000);
    T(room, t0 + 60_000);
    expect(room.run?.index).toBe(0);
    host(room, { t: "advance" }, t0 + 60_000);
    expect(room.run).toMatchObject({ index: 1, stage: "open" });
  });

  it("validates rounds", () => {
    const bad = structuredClone(LIGHTNING);
    (bad.segments[0] as { timeLimitSec: number }).timeLimitSec = 1;
    expect(validateShow(bad)).toMatch(/timeLimitSec/);
    const dup = structuredClone(LIGHTNING);
    (dup.segments[1] as { id: string }).id = "l2";
    expect(validateShow(dup)).toMatch(/duplicate/);
    expect(validateShow(LIGHTNING)).toBeNull();
  });
});

describe("live poll results", () => {
  it("tallies poll votes for the host while open, but not for players", () => {
    const t0 = 1_000_000;
    const show: Show = {
      title: "P",
      segments: [
        {
          kind: "question",
          question: {
            type: "poll",
            id: "p",
            prompt: "?",
            options: [
              { id: "x", text: "X" },
              { id: "y", text: "Y" },
            ],
          },
        },
      ],
    };
    const room = createRoom("ABCD", "k", { show, settings: SETTINGS }, t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null }, "p1", "t1", t0);
    addPlayer(room, { name: "Bob", teamId: null, duckHolderId: null }, "p2", "t2", t0);
    host(room, { t: "advance" }, t0);
    answer(room, "p1", "p", { type: "poll", optionId: "y" }, t0);
    expect(hostView(room, both, t0, true).liveDistribution).toEqual({ x: 0, y: 1 });
    expect(playerView(room, "p2", both, t0).segment?.reveal).toBeUndefined();
  });
});

describe("stored room upgrades", () => {
  it("upgrades a schema-1 room saved mid-game", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0);
    // Recreate what an older deploy wrote to storage.
    const { schema: _s, segments: _seg, ...rest } = structuredClone(room);
    void _s;
    void _seg;
    const show = structuredClone(SHOW);
    const q = show.segments[0] as { question: Record<string, unknown> };
    delete q.question.scoring;
    q.question.speedBonus = true;
    const { choiceScoring: _c, ...oldSettings } = rest.settings;
    void _c;
    const { answersOpenAt: _a, advanceAt: _b, ...oldRun } = rest.run!;
    void _a;
    void _b;
    const v1 = { ...rest, settings: oldSettings, show, run: oldRun };

    const up = loadRoom(v1)!;
    expect(up.schema).toBe(2);
    expect(up.segments).toHaveLength(3);
    expect(up.run).toMatchObject({ answersOpenAt: t0, advanceAt: null, index: 0 });
    expect(up.settings.choiceScoring).toBe("speed");
    expect(up.segments[0].kind === "question" && up.segments[0].question).toMatchObject({
      scoring: "speed",
    });
    // And it still plays.
    answer(up, "p1", "q1", { type: "choice", optionId: "b" }, t0 + 5_000);
    expect(() => playerView(up, "p1", both, t0)).not.toThrow();
  });

  it("passes current rooms through and rejects unknown shapes", () => {
    const { room } = setup();
    expect(loadRoom(room)).toBe(room);
    expect(loadRoom({ schema: 99 })).toBeNull();
    expect(loadRoom(undefined)).toBeNull();
  });
});

describe("player ducks", () => {
  it("gives each player a stable, never-reused look index in join order", () => {
    const { room, t0 } = setup();
    addPlayer(room, { name: "Cy", teamId: null, duckHolderId: null }, "p3", "t3", t0);
    hostAction(room, { t: "kick", playerId: "p2" }, { now: t0, seed: 1, judgeAvailable: true });
    addPlayer(room, { name: "Di", teamId: null, duckHolderId: null }, "p4", "t4", t0);
    const looks = Object.fromEntries(
      hostView(room, both, t0, true).players.map((p) => [p.name, p.lookIndex]),
    );
    // Bob (1) was kicked; Di gets a fresh index rather than Bob's duck.
    expect(looks).toEqual({ Ann: 0, Cy: 2, Di: 3 });
    expect(playerView(room, "p4", both, t0).me.lookIndex).toBe(3);
  });

  it("falls back to join order for rooms saved before looks existed", () => {
    const { room, t0 } = setup();
    for (const p of Object.values(room.players)) delete p.lookIndex;
    const view = playerView(room, "p2", both, t0);
    expect(view.me.lookIndex).toBe(1);
  });

  it("joins with the outfit saved on the account, and players can change it", () => {
    const { room, t0 } = setup();
    addPlayer(
      room,
      { name: "Cy", teamId: null, duckHolderId: null, accountId: "acc-cy", outfit: { hat: "tophat", neckpiece: null } },
      "p3",
      "t3",
      t0,
    );
    const ctx = { now: t0, connected: both, judgeAvailable: true, newId: "x" };
    expect(playerView(room, "p3", both, t0).me.outfit).toEqual({ hat: "tophat", neckpiece: null });
    playerAction(room, "p1", { t: "outfit", outfit: { hat: "party", neckpiece: "scarf" } }, ctx);
    expect(hostView(room, both, t0, true).players.find((p) => p.id === "p1")?.outfit).toEqual({
      hat: "party",
      neckpiece: "scarf",
    });
    expect(playerView(room, "p2", both, t0).players.find((p) => p.id === "p1")?.outfit).toEqual({
      hat: "party",
      neckpiece: "scarf",
    });
  });

  it("ignores made-up outfit items", () => {
    const { room, t0 } = setup();
    const ctx = { now: t0, connected: both, judgeAvailable: true, newId: "x" };
    playerAction(room, "p1", { t: "outfit", outfit: { hat: "crown", neckpiece: "cape" } as never }, ctx);
    expect(playerView(room, "p1", both, t0).me.outfit).toBeNull();
    playerAction(room, "p1", { t: "outfit", outfit: { hat: "crown", neckpiece: "bell" } as never }, ctx);
    expect(playerView(room, "p1", both, t0).me.outfit).toEqual({ hat: null, neckpiece: "bell" });
  });
});

describe("answer arena", () => {
  const ARENA: Show = {
    title: "Arena",
    segments: [
      {
        kind: "question",
        question: {
          type: "choice",
          id: "a1",
          prompt: "Walk to B",
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
            { id: "c", text: "C" },
          ],
          correctId: "b",
          points: 100,
          timeLimitSec: 20,
          scoring: "speed",
          arena: true,
        },
      },
    ],
  };
  const start = () => {
    const t0 = 1_000_000;
    const room = createRoom("ABCD", "k", { show: ARENA, settings: SETTINGS }, t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null }, "p1", "t1", t0);
    addPlayer(room, { name: "Bob", teamId: null, duckHolderId: null }, "p2", "t2", t0);
    host(room, { t: "advance" }, t0); // the question, read out
    host(room, { t: "advance" }, t0); // the answers: into the arena
    return { room, t0 };
  };

  it("starts with just the question for the host to read out, then opens the arena", () => {
    const t0 = 1_000_000;
    const room = createRoom("ABCD", "k", { show: ARENA, settings: SETTINGS }, t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null }, "p1", "t1", t0);
    host(room, { t: "advance" }, t0);
    expect(room.run?.stage).toBe("reading");
    expect(openArena(room)).toBeNull(); // no ducks moving yet
    expect(room.run?.closesAt).toBeNull(); // no clock running yet
    // Someone joins while it's being read out: the arena is laid out for them too.
    addPlayer(room, { name: "Bob", teamId: null, duckHolderId: null }, "p2", "t2", t0 + 5000);
    host(room, { t: "advance" }, t0 + 9000);
    expect(room.run?.stage).toBe("open");
    expect(room.run?.answersOpenAt).toBe(t0 + 9000);
    expect(room.run?.closesAt).toBe(t0 + 9000 + 20_000);
    expect(openArena(room)).toMatchObject({ segmentId: "a1", players: 2 });
  });

  it("lays out for everyone and tells players it's an arena", () => {
    const { room, t0 } = start();
    expect(openArena(room)).toMatchObject({ segmentId: "a1", players: 2 });
    expect(playerView(room, "p1", both, t0).segment?.arena).toEqual({ players: 2 });
  });

  it("answers come from where ducks stand, not from answer messages", () => {
    const { room, t0 } = start();
    expect(() => answer(room, "p1", "a1", { type: "choice", optionId: "b" }, t0)).toThrow(/Walk your duck/);
    const changed = setArenaAnswers(
      room,
      new Map([
        ["p1", { zone: 1, since: t0 + 2_000 }],
        ["p2", { zone: null, since: t0 }],
      ]),
    );
    expect(changed).toBe(true);
    expect(playerView(room, "p1", both, t0).myAnswer).toEqual({ type: "choice", optionId: "b" });
    expect(playerView(room, "p2", both, t0).myAnswer).toBeNull();
    // Same positions again: nothing changed.
    expect(
      setArenaAnswers(room, new Map([["p1", { zone: 1, since: t0 + 2_000 }], ["p2", { zone: null, since: t0 }]])),
    ).toBe(false);
    // Host sees live counts (the ducks are visible anyway).
    expect(hostView(room, both, t0, true).liveDistribution).toEqual({ a: 0, b: 1, c: 0 });
  });

  it("scores the zone you end in, with speed from when you got there", () => {
    const { room, t0 } = start();
    setArenaAnswers(room, new Map([["p1", { zone: 0, since: t0 + 1_000 }]]));
    // Changes mind: walks to B at 5s.
    setArenaAnswers(room, new Map([["p1", { zone: 1, since: t0 + 5_000 }], ["p2", { zone: 1, since: t0 + 15_000 }]]));
    host(room, { t: "advance" }, t0 + 16_000); // lock
    host(room, { t: "advance" }, t0 + 16_000); // reveal
    const s = scores(room);
    // 50 * (1 - 5/20) = 37.5 → 38 ; 50 * (1 - 15/20) = 12.5 → 13
    expect(s.get("p1")).toBe(138);
    expect(s.get("p2")).toBe(113);
  });

  it("doesn't close early when everyone's in a zone (they may still move)", () => {
    const { room, t0 } = start();
    setArenaAnswers(room, new Map([["p1", { zone: 1, since: t0 }], ["p2", { zone: 0, since: t0 }]]));
    expect(room.run?.stage).toBe("open");
    expect(openArena(room)).not.toBeNull();
    host(room, { t: "advance" }, t0);
    expect(openArena(room)).toBeNull();
  });
});

describe("arena by default", () => {
  const show: Show = {
    title: "Defaults",
    segments: [
      { kind: "question", question: { type: "choice", id: "c1", prompt: "?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctId: "a", points: 100 } },
      { kind: "question", question: { type: "poll", id: "p1", prompt: "?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] } },
      { kind: "question", question: { type: "choice", id: "c2", prompt: "?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctId: "a", points: 100, arena: false } },
      { kind: "question", question: { type: "numeric", id: "n1", prompt: "?", answer: 3, points: 100 } },
    ],
  } as Show;
  const arenaFlags = (room: RoomState) =>
    room.segments.map((s) => (s.kind === "question" && "arena" in s.question ? s.question.arena : "n/a"));

  it("plays multiple-choice questions and polls in the arena unless a question opts out", () => {
    const room = createRoom("ABCD", "k", { show, settings: { ...SETTINGS, arena: undefined } }, 0);
    expect(arenaFlags(room)).toEqual([true, true, false, "n/a"]);
  });

  it("the host can turn the arena off for the whole game", () => {
    const room = createRoom("ABCD", "k", { show, settings: { ...SETTINGS, arena: false } }, 0);
    expect(arenaFlags(room)).toEqual([false, false, false, "n/a"]);
  });

  it("refuses a non-boolean arena setting", () => {
    expect(validateSettings({ ...SETTINGS, arena: "yes" })).toMatch(/arena/);
  });
});


describe("going back a step (pressed too early)", () => {
  it("a lock pressed too early: answers reopen with the time that was left, speeds unchanged", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0); // q1 open, 20 s
    answer(room, "p1", "q1", { type: "choice", optionId: "b" }, t0 + 5_000);
    host(room, { t: "advance" }, t0 + 8_000); // lock: oops
    expect(room.run?.stage).toBe("closed");
    expect(hostView(room, both, t0 + 8_000, true).canGoBack).toBe(true);
    host(room, { t: "back" }, t0 + 30_000); // 22 s later
    expect(room.run?.stage).toBe("open");
    // 12 s were left at the lock; still 12 s left now.
    expect(room.run?.closesAt).toBe(t0 + 30_000 + 12_000);
    answer(room, "p2", "q1", { type: "choice", optionId: "b" }, t0 + 31_000); // 9 s in, really
    host(room, { t: "advance" }, t0 + 32_000);
    host(room, { t: "advance" }, t0 + 32_000); // reveal
    const s = scores(room);
    expect(s.get("p1")).toBe(100 + 38); // answered 5 s in, same as without the pause
    expect(s.get("p2")).toBe(100 + 28); // 9 s in: 50 × (1 − 9/20) ≈ 28
  });

  it("a reveal pressed too early: the points come off again", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0);
    answer(room, "p1", "q1", { type: "choice", optionId: "b" }, t0 + 5_000);
    host(room, { t: "advance" }, t0 + 6_000); // lock
    host(room, { t: "advance" }, t0 + 7_000); // reveal
    expect(scores(room).get("p1")).toBeGreaterThan(0);
    host(room, { t: "back" }, t0 + 8_000);
    expect(room.run?.stage).toBe("closed");
    expect(scores(room).get("p1") ?? 0).toBe(0);
  });

  it("next pressed too early: back to the previous question's reveal, and newcomers stay", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0);
    host(room, { t: "advance" }, t0 + 1_000); // lock
    host(room, { t: "advance" }, t0 + 2_000); // reveal
    host(room, { t: "advance" }, t0 + 3_000); // next: the written question
    expect(room.cursor).toBe(1);
    addPlayer(room, { name: "Cy", teamId: null, duckHolderId: null }, "p3", "t3", t0 + 3_500);
    host(room, { t: "back" }, t0 + 4_000);
    expect(room.cursor).toBe(0);
    expect(room.run?.stage).toBe("revealed");
    expect(room.players.p3).toBeDefined();
  });

  it("can undo a few steps in a row, then there's nothing left to undo", () => {
    const { room, t0 } = setup();
    host(room, { t: "advance" }, t0); // open
    host(room, { t: "advance" }, t0 + 1); // locked
    host(room, { t: "back" }, t0 + 2);
    host(room, { t: "back" }, t0 + 3);
    expect(room.phase).toBe("lobby");
    expect(hostView(room, both, t0, true).canGoBack).toBe(false);
    expect(() => host(room, { t: "back" }, t0 + 4)).toThrow(/Nothing to go back to/);
  });

  it("only remembers the last few steps", () => {
    const { room, t0 } = setup();
    for (let i = 0; i < 9; i++) host(room, { t: "advance" }, t0 + i);
    expect(room.undo).toHaveLength(UNDO_LIMIT);
  });
});
