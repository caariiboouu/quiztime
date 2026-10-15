import { describe, expect, it } from "vitest";
import {
  PRACTICE_CODE,
  PRACTICE_JEV_CALLS_PER_DAY,
  PRACTICE_SETTINGS,
  PRACTICE_SHOW,
  PRACTICE_TIMING as T,
} from "../../shared/practice";
import {
  autopilotDeadline,
  autopilotStep,
  createPracticeRoom,
  practiceJevLeft,
  practiceName,
  spendPracticeJev,
} from "./autopilot";
import {
  addPlayer,
  currentSegment,
  expandShow,
  finishJudging,
  nextDeadline,
  playerAction,
  scores,
  tick,
  validateSettings,
  validateShow,
  type Effects,
  type RoomState,
} from "./engine";

const t0 = Date.UTC(2026, 9, 15, 12);

function practice() {
  const room = createPracticeRoom("hostkey", t0);
  addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null, lookIndex: 0 }, "p1", "tok1", t0);
  addPlayer(room, { name: "Bob", teamId: null, duckHolderId: null, lookIndex: 1 }, "p2", "tok2", t0);
  addPlayer(room, { name: "Cat", teamId: "mallards", duckHolderId: null, lookIndex: 2 }, "p3", "tok3", t0);
  return room;
}

/** What the Room object does: deadlines first, then the autopilot until it's settled. */
function run(room: RoomState, now: number, connected: Set<string>, judge = false): Effects[] {
  const ctx = { now, seed: 7, judgeAvailable: judge, connected };
  const out: Effects[] = [];
  const deadline = nextDeadline(room);
  if (deadline !== null && now >= deadline) out.push(tick(room, ctx));
  for (let i = 0; i < 4; i++) {
    const e = autopilotStep(room, ctx);
    if (!e) break;
    out.push(e);
  }
  return out;
}

/** Step the clock a second at a time until `done`, or give up. */
function until(room: RoomState, from: number, connected: Set<string>, done: () => boolean, judge = false) {
  for (let now = from; now < from + 30 * 60_000; now += 1000) {
    run(room, now, connected, judge);
    if (done()) return now;
  }
  throw new Error(`stuck at ${room.phase} ${room.run?.stage}`);
}

describe("practice show", () => {
  it("is a valid show with one of each question type, in team mode", () => {
    expect(validateShow(PRACTICE_SHOW)).toBeNull();
    expect(validateSettings(PRACTICE_SETTINGS)).toBeNull();
    const types = new Set(
      expandShow(PRACTICE_SHOW).map((s) => (s.kind === "question" ? s.question.type : s.kind)),
    );
    expect([...types].sort()).toEqual(["choice", "debate", "numeric", "poll", "written"]);
    expect(PRACTICE_SETTINGS.teamMode).toBe(true);
  });

  it("has a code no host can be given (real codes have no I or O)", () => {
    expect(PRACTICE_CODE).toMatch(/^[A-Z]{4}$/);
    expect(PRACTICE_CODE).toMatch(/[IO]/);
  });
});

describe("autopilot", () => {
  it("waits in the lobby until someone's here", () => {
    const room = practice();
    run(room, t0, new Set());
    expect(autopilotDeadline(room)).toBeNull();
    run(room, t0 + 5000, new Set(["p1"]));
    expect(autopilotDeadline(room)).toBe(t0 + 5000 + T.lobby * 1000);
    // Everyone left before it started: back to waiting.
    run(room, t0 + 6000, new Set());
    expect(autopilotDeadline(room)).toBeNull();
    expect(room.phase).toBe("lobby");
  });

  it("evens out the teams, then starts, dropping whoever's gone", () => {
    const room = practice();
    const here = new Set(["p1", "p2", "p3"]);
    run(room, t0, here);
    // p1 and p2 walked into the same corner as p3.
    room.players.p1.teamId = "mallards";
    room.players.p2.teamId = "mallards";
    const effects = run(room, t0 + T.lobby * 1000, here);
    expect(effects[0].teamMoves?.length).toBe(1);
    const sizes = ["mallards", "canvasbacks"].map(
      (t) => Object.values(room.players).filter((p) => p.teamId === t).length,
    );
    expect(sizes.sort()).toEqual([1, 2]);
    expect(room.phase).toBe("lobby");
    run(room, t0 + (T.lobby + T.balance) * 1000, here);
    expect(room.phase).toBe("segment");
    expect(room.cursor).toBe(0);
  });

  it("plays the whole show by itself and starts over", () => {
    const room = practice();
    const here = new Set(["p1", "p2"]);
    const seen = new Set<string>();
    let now = t0;
    run(room, now, here);
    now = until(room, now, here, () => room.phase === "segment");
    // The first poll and the first debate get a clock even though they have none of their own.
    now = until(room, now, here, () => {
      if (room.phase === "segment" && room.run) seen.add(`${room.cursor}:${room.run.stage}`);
      return room.phase === "ended";
    });
    const last = expandShow(PRACTICE_SHOW).length - 1;
    for (let i = 0; i <= last; i++) expect(seen.has(`${i}:revealed`)).toBe(true);
    // p3 never had the page open: dropped at the start. A new game starts with who's left.
    expect(room.players.p3).toBeUndefined();
    now = until(room, now, here, () => room.phase === "lobby");
    expect(room.cursor).toBe(-1);
    expect(room.events).toEqual([]);
    expect(Object.keys(room.players).sort()).toEqual(["p1", "p2"]);
    expect(room.autopilot?.touchedAt).toBe(now);
  });

  it("gives an untimed debate a clock, and closes early once everyone here has argued", () => {
    const room = practice();
    const here = new Set(["p1", "p2"]);
    let now = until(room, t0, here, () => currentSegment(room)?.kind === "question" && room.run?.stage === "open"
      && (currentSegment(room) as { question: { type: string } }).question.type === "debate");
    const seg = currentSegment(room)!;
    const segId = seg.kind === "question" ? seg.question.id : "";
    expect(room.run!.closesAt).toBe(now + T.debate * 1000);
    const argue = (pid: string, text: string) =>
      playerAction(
        room,
        pid,
        { t: "answer", segmentId: segId, value: { type: "debate", side: "for", text } },
        { now, connected: here, judgeAvailable: true, newId: `n-${pid}` },
      );
    argue("p1", "Bread in a fold around a filling: a sandwich.");
    run(room, now, here);
    expect(room.run!.closesAt).toBe(now + T.debate * 1000);
    argue("p2", "A hinged roll is still a roll.");
    run(room, now, here);
    expect(room.run!.closesAt).toBe(now + T.allIn * 1000);
    // Without Jev it goes to review and is revealed, everyone in the middle.
    now = until(room, now, here, () => room.run?.stage === "revealed");
    expect(scores(room).get("p1")).toBe(scores(room).get("p2"));
  });

  it("waits for Jev, but not forever", () => {
    const room = practice();
    const here = new Set(["p1"]);
    let now = until(room, t0, here, () => {
      const seg = currentSegment(room);
      return seg?.kind === "question" && seg.question.type === "debate" && room.run?.stage === "open";
    }, true);
    const seg = currentSegment(room)!;
    const segId = seg.kind === "question" ? seg.question.id : "";
    playerAction(
      room,
      "p1",
      { t: "answer", segmentId: segId, value: { type: "debate", side: "against", text: "No." } },
      { now, connected: here, judgeAvailable: true, newId: "n" },
    );
    now = until(room, now, here, () => room.run?.stage === "judging", true);
    const judgingFrom = now;
    // Jev never answers: after the wait, it's scored with what's there.
    now = until(room, now, here, () => room.run?.stage !== "judging", true);
    expect(now - judgingFrom).toBeGreaterThanOrEqual(T.judging * 1000);
    expect(room.run?.stage).toBe("review");
    until(room, now, here, () => room.run?.stage === "revealed", true);

    // And when Jev does answer, the reveal follows straight on.
    const room2 = practice();
    let t = until(room2, t0, here, () => {
      const s = currentSegment(room2);
      return s?.kind === "question" && s.question.type === "debate" && room2.run?.stage === "open";
    }, true);
    playerAction(
      room2,
      "p1",
      { t: "answer", segmentId: segId, value: { type: "debate", side: "against", text: "No." } },
      { now: t, connected: here, judgeAvailable: true, newId: "n" },
    );
    t = until(room2, t, here, () => room2.run?.stage === "judging", true);
    finishJudging(room2, segId);
    run(room2, t + 1000, here, true);
    run(room2, t + 1000 + T.review * 1000, here, true);
    expect(room2.run?.stage).toBe("revealed");
  });
});

describe("practice room odds and ends", () => {
  it("keeps to a daily Jev budget", () => {
    const room = practice();
    expect(practiceJevLeft(room, t0)).toBe(PRACTICE_JEV_CALLS_PER_DAY);
    spendPracticeJev(room, t0, PRACTICE_JEV_CALLS_PER_DAY - 5);
    expect(practiceJevLeft(room, t0)).toBe(5);
    spendPracticeJev(room, t0, 30);
    expect(practiceJevLeft(room, t0)).toBe(0);
    // A new day, a new budget.
    const tomorrow = t0 + 24 * 60 * 60 * 1000;
    expect(practiceJevLeft(room, tomorrow)).toBe(PRACTICE_JEV_CALLS_PER_DAY);
    spendPracticeJev(room, tomorrow, 3);
    expect(practiceJevLeft(room, tomorrow)).toBe(PRACTICE_JEV_CALLS_PER_DAY - 3);
  });

  it("tidies names, numbers a taken one, and picks one for a blank", () => {
    const room = practice();
    expect(practiceName(room, "  Dee \n  Dee ", () => "x")).toBe("Dee Dee");
    expect(practiceName(room, "ann", () => "x")).toBe("ann 2");
    expect(practiceName(room, "", () => "Puddles")).toBe("Puddles");
    expect(practiceName(room, 42, () => "Bob")).toBe("Bob 2");
  });
});
