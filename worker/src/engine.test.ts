import { describe, expect, it } from "vitest";
import { DEFAULT_DEBATE_LEVELS, type RoomSettings, type Show } from "../../shared/protocol";
import {
  RuleError,
  addPlayer,
  applyJudgeResult,
  balanceTeams,
  createRoom,
  finishJudging,
  hostAction,
  hostView,
  loadRoom,
  openArena,
  playerAction,
  playerView,
  recordJevUsage,
  scores,
  seededRng,
  setArenaAnswers,
  setLobbyTeams,
  tick,
  validateSettings,
  UNDO_LIMIT,
  validateShow,
  type RoomState,
} from "./engine";
import { addCall, NO_SPEND } from "../../shared/jevCost";
import { EMPTY_LEDGER, ledgerSummary, recordGame } from "../../shared/jevLedger";

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
  it("rejects duplicate names; in team mode, lobby joiners pick a team later and late joiners get one", () => {
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
    // In the lobby they walk into a team's corner, so no team yet.
    expect(addPlayer(room, { name: "Cat", teamId: null, duckHolderId: null }, "p3", "t3", t0).teamId).toBeNull();
    expect(addPlayer(room, { name: "Dot", teamId: "blue", duckHolderId: null }, "p4", "t4", t0).teamId).toBe("blue");
    // Once the game's going, a newcomer joins the smallest team.
    room.phase = "segment";
    expect(addPlayer(room, { name: "Eve", teamId: null, duckHolderId: null }, "p5", "t5", t0).teamId).toBe("red");
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

describe("debate question", () => {
  const DEBATE_SHOW: Show = {
    title: "Debate",
    segments: [
      {
        kind: "question",
        question: {
          type: "debate",
          id: "d1",
          prompt: "Ducks are better than geese",
          levels: [...DEFAULT_DEBATE_LEVELS],
          points: 100,
          sides: { for: "Ducks", against: "Geese" },
        },
      },
    ],
  };
  function open(judge = true) {
    const t0 = 1_000_000;
    const room = createRoom("ABCD", "hostkey", { show: DEBATE_SHOW, settings: SETTINGS }, t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null }, "p1", "tok1", t0);
    addPlayer(room, { name: "Bob", teamId: null, duckHolderId: null }, "p2", "tok2", t0);
    hostAction(room, { t: "advance" }, { now: t0, seed: 1, judgeAvailable: judge });
    return { room, t0 };
  }
  const verdict = (level: number) => ({
    status: "ok" as const,
    suggestedPoints: 0,
    criteria: [],
    flags: [],
    level,
  });

  it("validates its verdicts", () => {
    expect(validateShow(DEBATE_SHOW)).toBeNull();
    const few = structuredClone(DEBATE_SHOW);
    (few.segments[0] as { question: { levels: string[] } }).question.levels = ["Good", "Bad"];
    expect(validateShow(few)).toMatch(/3–8 verdicts/);
    const dup = structuredClone(DEBATE_SHOW);
    (dup.segments[0] as { question: { levels: string[] } }).question.levels = ["Good", "good", "Bad"];
    expect(validateShow(dup)).toMatch(/different/);
  });

  it("has no timer, shows sides (not arguments) to players, and trims long arguments", () => {
    const { room, t0 } = open();
    expect(room.run?.closesAt).toBeNull();
    answer(room, "p1", "d1", { type: "debate", side: "for", text: "Ducks quack" }, t0);
    answer(room, "p2", "d1", { type: "debate", side: "against", text: "x".repeat(900) }, t0);
    expect(room.run?.stage).toBe("open");
    const sub = room.run?.submissions.p2.value;
    expect(sub?.type === "debate" && sub.text.length).toBe(500);

    const pv = playerView(room, "p2", both, t0);
    expect(pv.segment?.sides).toEqual({ p1: "for", p2: "against" });
    // Nobody sees the others' arguments or the verdict labels before the reveal.
    expect(JSON.stringify(pv)).not.toContain("Ducks quack");
    expect(JSON.stringify(pv)).not.toContain("Very good argument");
  });

  it("rejects an answer without a side", () => {
    const { room, t0 } = open();
    expect(() => answer(room, "p1", "d1", { type: "debate", side: "maybe", text: "hm" }, t0)).toThrow(
      /side/,
    );
  });

  it("scores by verdict: Jev suggests, the host can change it, even after the reveal", () => {
    const { room, t0 } = open();
    answer(room, "p1", "d1", { type: "debate", side: "for", text: "Ducks are calmer" }, t0);
    answer(room, "p2", "d1", { type: "debate", side: "against", text: "Geese guard farms" }, t0);
    expect(host(room, { t: "advance" }, t0).startJudging).toBe(true);
    applyJudgeResult(room, "d1", "p1", verdict(0));
    applyJudgeResult(room, "d1", "p2", verdict(3));
    finishJudging(room, "d1");
    expect(room.run?.stage).toBe("review");

    host(room, { t: "setLevel", playerId: "p2", level: 1 }, t0);
    host(room, { t: "advance" }, t0);
    expect(room.run?.stage).toBe("revealed");
    expect(room.run?.reveal?.levels).toEqual({ p1: 0, p2: 1 });
    expect(room.run?.reveal?.levelCount).toBe(5);
    // The pedestals show it; the verdicts themselves aren't put into words.
    expect(JSON.stringify(room.run?.reveal)).not.toContain("argument");
    expect(scores(room).get("p1")).toBe(100);
    expect(scores(room).get("p2")).toBe(75);

    // Changing a verdict after the reveal re-scores it (no double counting).
    host(room, { t: "setLevel", playerId: "p1", level: 4 }, t0);
    expect(room.run?.reveal?.levels?.p1).toBe(4);
    expect(scores(room).get("p1") ?? 0).toBe(0);
    expect(() => host(room, { t: "setLevel", playerId: "p1", level: 5 }, t0)).toThrow(/verdict/);
  });

  it("puts a blank argument on the ground, and an unjudged one in the middle", () => {
    const { room, t0 } = open(false);
    answer(room, "p1", "d1", { type: "debate", side: "for", text: "  " }, t0);
    answer(room, "p2", "d1", { type: "debate", side: "against", text: "Honk" }, t0);
    hostAction(room, { t: "advance" }, { now: t0, seed: 1, judgeAvailable: false });
    expect(room.run?.stage).toBe("review");
    host(room, { t: "advance" }, t0);
    expect(room.run?.reveal?.levels).toEqual({ p1: 4, p2: 2 });
    expect(scores(room).get("p2")).toBe(50);
  });

  it("keeps a running Jev cost for the host that back and re-judging don't undo", () => {
    const { room, t0 } = open();
    const call = { model: "jev-1.13.0", inputTokens: 1000, outputTokens: 20 };
    const spend = () => hostView(room, both, t0, true).jevSpend;
    expect(spend()).toEqual({
      question: null,
      game: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, unpriced: 0 },
      allTime: null,
      gameKey: `${room.code}-${room.createdAt}`,
    });

    answer(room, "p1", "d1", { type: "debate", side: "for", text: "Ducks are calmer" }, t0);
    answer(room, "p2", "d1", { type: "debate", side: "against", text: "Geese guard farms" }, t0);
    host(room, { t: "advance" }, t0);
    recordJevUsage(room, "d1", call);
    recordJevUsage(room, "d1", call);
    finishJudging(room, "d1");
    // Re-judging pays again.
    expect(host(room, { t: "rejudge" }, t0).startJudging).toBe(true);
    recordJevUsage(room, "d1", call);
    finishJudging(room, "d1");
    expect(spend().question).toMatchObject({ calls: 3, inputTokens: 3000, outputTokens: 60, unpriced: 0 });
    expect(spend().question?.usd).toBeCloseTo((3000 * 0.042) / 1_000_000, 12);

    host(room, { t: "advance" }, t0);
    host(room, { t: "back" }, t0);
    expect(spend().game.calls).toBe(3);
    // …and it's saved with the room, so a restart doesn't lose it.
    const reloaded = loadRoom(JSON.parse(JSON.stringify(room)))!;
    expect(hostView(reloaded, both, t0, true).jevSpend.game.calls).toBe(3);

    // A call that lands after the game moved on still counts toward the game.
    recordJevUsage(room, "an-earlier-question", { model: "jev-1.13.0", inputTokens: null, outputTokens: null });
    expect(spend().question?.calls).toBe(3);
    expect(spend().game).toMatchObject({ calls: 4, unpriced: 1 });

    // Players never see it.
    const pv = JSON.stringify(playerView(room, "p1", both, t0));
    expect(pv).not.toContain("jevSpend");
    expect(pv).not.toContain("inputTokens");
  });

  it("shows the host the all-time Jev spend it's given, and players never", () => {
    const { room, t0 } = open();
    const spend = addCall(NO_SPEND, { model: "jev-1.13.0", inputTokens: 1000, outputTokens: 20 });
    const ledger = ledgerSummary(
      recordGame(EMPTY_LEDGER, { key: "OLDS-1", code: "OLDS", title: "Last week's show", startedAt: 1, spend }),
    );
    expect(hostView(room, both, t0, true, ledger).jevSpend.allTime).toEqual(ledger);
    const pv = JSON.stringify(playerView(room, "p1", both, t0));
    expect(pv).not.toContain("allTime");
    expect(pv).not.toContain("Last week's show");
  });
});

describe("team mode", () => {
  const TEAMS: RoomSettings = {
    ...SETTINGS,
    teamMode: true,
    teams: [
      { id: "red", name: "Red", color: "#ff0000" },
      { id: "blue", name: "Blue", color: "#0000ff" },
    ],
  };
  function lobby(n: number) {
    const t0 = 1_000_000;
    const room = createRoom("ABCD", "hostkey", { show: SHOW, settings: TEAMS }, t0);
    for (let i = 1; i <= n; i++) {
      addPlayer(room, { name: `P${i}`, teamId: null, duckHolderId: null }, `p${i}`, `t${i}`, t0);
    }
    return { room, t0 };
  }
  const sizes = (room: RoomState) =>
    ["red", "blue"].map((t) => Object.values(room.players).filter((p) => p.teamId === t).length);

  it("puts a duck on whichever team's corner it stands in", () => {
    const { room } = lobby(3);
    expect(setLobbyTeams(room, new Map([["p1", 0], ["p2", 1], ["p3", null]]))).toBe(true);
    expect([room.players.p1.teamId, room.players.p2.teamId, room.players.p3.teamId]).toEqual([
      "red",
      "blue",
      null,
    ]);
    // Standing still changes nothing.
    expect(setLobbyTeams(room, new Map([["p1", 0]]))).toBe(false);
    // Walking back to the middle leaves the team.
    setLobbyTeams(room, new Map([["p1", null]]));
    expect(room.players.p1.teamId).toBeNull();
  });

  it("auto-balance moves random ducks until the teams are even, and seats anyone without a team", () => {
    const { room } = lobby(7);
    setLobbyTeams(room, new Map(["p1", "p2", "p3", "p4", "p5", "p6"].map((p) => [p, 0])));
    const moves = balanceTeams(room, seededRng(3));
    const [red, blue] = sizes(room);
    expect(red + blue).toBe(7);
    expect(Math.abs(red - blue)).toBeLessThanOrEqual(1);
    // Every move is reported so the ducks can be flown across.
    for (const m of moves) expect(room.players[m.playerId].teamId).toBe(m.teamId);
    expect(moves.some((m) => m.playerId === "p7")).toBe(true);
    // Already even: nothing moves.
    expect(balanceTeams(room, seededRng(4))).toEqual([]);
  });

  it("only balances in the lobby, through the host's button", () => {
    const { room, t0 } = lobby(2);
    expect(host(room, { t: "balanceTeams" }, t0).teamMoves).toHaveLength(2);
    host(room, { t: "advance" }, t0);
    expect(() => host(room, { t: "balanceTeams" }, t0)).toThrow(/lobby/);
  });

  it("seats anyone still without a team when the game starts", () => {
    const { room, t0 } = lobby(3);
    setLobbyTeams(room, new Map([["p1", 0]]));
    host(room, { t: "advance" }, t0);
    expect(sizes(room).sort()).toEqual([1, 2]);
  });

  it("adds every member's points to the team by default, or averages them", () => {
    const { room, t0 } = lobby(3);
    setLobbyTeams(room, new Map([["p1", 0], ["p2", 0], ["p3", 1]]));
    host(room, { t: "advance" }, t0);
    const three = new Set(["p1", "p2", "p3"]);
    const say = (pid: string, id: string) =>
      playerAction(
        room,
        pid,
        { t: "answer", segmentId: "q1", value: { type: "choice", optionId: id } },
        { now: t0, connected: three, judgeAvailable: true, newId: pid },
      );
    say("p1", "b");
    say("p2", "b");
    say("p3", "b");
    host(room, { t: "advance" }, t0); // reveal
    const view = hostView(room, three, t0, true);
    const team = (id: string) => view.teams.find((t) => t.id === id)!.score;
    expect(team("red")).toBe(2 * team("blue"));

    room.settings.teamScoring = "average";
    const avg = hostView(room, three, t0, true);
    expect(avg.teams[0].score).toBe(avg.teams[1].score);
  });
});
