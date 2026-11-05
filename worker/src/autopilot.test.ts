import { describe, expect, it } from "vitest";
import { factFits } from "../../shared/debateFacts";
import {
  PRACTICE_CODE,
  PRACTICE_HOUSE,
  PRACTICE_HOUSE_ARGUMENTS,
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
  playerView,
  presentation,
  scores,
  tick,
  validateSettings,
  validateShow,
  watchView,
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
      (t) => Object.values(room.players).filter((p) => p.teamId === t && !p.house).length,
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

describe("house ducks", () => {
  const debates = expandShow(PRACTICE_SHOW).flatMap((s) =>
    s.kind === "question" && s.question.type === "debate" ? [s.question] : [],
  );

  it("argue the show's debates, crediting facts that exist and fit their side", () => {
    const teams = new Set(PRACTICE_SETTINGS.teams.map((t) => t.id));
    for (const duck of PRACTICE_HOUSE) expect(teams.has(duck.teamId)).toBe(true);
    for (const [id, args] of Object.entries(PRACTICE_HOUSE_ARGUMENTS)) {
      const q = debates.find((d) => d.id === id);
      expect(q, id).toBeDefined();
      const facts = q!.facts ?? [];
      expect(new Set(args.map((a) => a.duck)).size).toBe(args.length);
      for (const a of args) {
        expect(PRACTICE_HOUSE[a.duck]).toBeDefined();
        expect(a.level).toBeGreaterThanOrEqual(0);
        expect(a.level).toBeLessThan(q!.levels.length);
        expect(a.text.length).toBeLessThanOrEqual(500);
        for (const f of a.uncovers ?? []) expect(facts[f] && factFits(facts[f], a.side), `${id} fact ${f}`).toBe(true);
        for (const f of a.bluffs ?? []) expect(facts[f], `${id} fact ${f}`).toBeDefined();
      }
    }
  });

  it("sit in with one person, argue without Jev, and turn the facts over", () => {
    const room = createPracticeRoom("hostkey", t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null, lookIndex: 0 }, "p1", "tok1", t0);
    const here = new Set(["p1"]);
    let now = until(room, t0, here, () => room.phase === "segment", true);
    const house = Object.values(room.players).filter((p) => p.house);
    expect(house.map((p) => p.name).sort()).toEqual(PRACTICE_HOUSE.map((d) => d.name).sort());
    expect(house.filter((p) => p.teamId === "mallards")).toHaveLength(2);
    const shown = playerView(room, "p1", here, now).players;
    expect(shown.every((p) => p.connected)).toBe(true);
    expect(shown.filter((p) => p.house)).toHaveLength(4);

    now = until(room, now, here, () => {
      const seg = currentSegment(room);
      return seg?.kind === "question" && seg.question.id === "d-hotdog" && room.run?.stage === "open";
    }, true);
    expect(Object.keys(room.run!.submissions).sort()).toEqual(["house-0", "house-1", "house-2", "house-3"]);
    // Only the house argued: nothing for Jev to judge, even with Jev on.
    now = until(room, now, here, () => room.run?.stage !== "open", true);
    expect(room.run?.stage).toBe("review");
    until(room, now, here, () => room.run?.stage === "revealed", true);
    // Sandwich found 1 of its 2 facts, Not a sandwich its only one.
    expect(room.run!.reveal!.debate).toMatchObject({ winner: "against", argued: { for: 2, against: 2 } });
    expect(room.run!.reveal!.facts?.map((f) => f.uncoveredBy)).toEqual([["house-1"], [], ["house-0"]]);
    // Pip argued it best, found a fact and won: the most points.
    expect(scores(room).get("house-0")).toBe(Math.max(...scores(room).values()));
  });

  it("are gone when the game ends, and a new game plays the latest questions", () => {
    const room = createPracticeRoom("hostkey", t0);
    // A room set up before the questions changed.
    room.segments = room.segments.slice(0, 2);
    room.title = "Old practice";
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null, lookIndex: 0 }, "p1", "tok1", t0);
    const here = new Set(["p1"]);
    const now = until(room, t0, here, () => room.phase === "segment");
    expect(room.title).toBe(PRACTICE_SHOW.title);
    expect(room.segments).toHaveLength(expandShow(PRACTICE_SHOW).length);
    until(room, now, here, () => room.phase === "lobby");
    expect(Object.keys(room.players)).toEqual(["p1"]);
  });
});

describe("projector screen", () => {
  it("sees a debate as players do: nobody's own answers, and facts only once turned over", () => {
    const room = createPracticeRoom("hostkey", t0);
    addPlayer(room, { name: "Ann", teamId: null, duckHolderId: null, lookIndex: 0 }, "p1", "tok1", t0);
    const here = new Set(["p1"]);
    const look = (now: number) => {
      const seen = watchView(room, here, now);
      const ann = playerView(room, "p1", here, now);
      expect(seen.segment).toEqual(ann.segment);
      expect(seen.players).toEqual(ann.players);
      const raw = JSON.stringify(seen);
      const tokens = Object.values(room.players).map((p) => p.token);
      for (const secret of [room.hostKey, ...tokens]) expect(raw).not.toContain(secret);
      for (const key of ['"me":', '"myAnswer":', '"myAward":', '"fullSegment":', '"submissions":']) {
        expect(raw).not.toContain(key);
      }
      return raw;
    };

    let now = until(room, t0, here, () => {
      const seg = currentSegment(room);
      return seg?.kind === "question" && seg.question.id === "d-hotdog" && room.run?.stage === "open";
    });
    const seg = currentSegment(room);
    const q = seg?.kind === "question" && seg.question.type === "debate" ? seg.question : null;
    const facts = q?.facts?.map((f) => f.text) ?? [];
    expect(facts.length).toBeGreaterThan(0);
    const argued = Object.values(room.run!.submissions).map((s) => (s.value.type === "debate" ? s.value.text : ""));
    expect(argued.length).toBeGreaterThan(0);
    // Open: the house have argued, but neither their words nor the facts show.
    let raw = look(now);
    for (const text of [...facts, ...argued]) expect(raw).not.toContain(text);
    // The house have answered and Ann hasn't: "4 / 5", not "4 / 1".
    const open = watchView(room, here, now).segment!;
    expect(open.answeredCount).toBe(argued.length);
    expect(open.eligibleCount).toBe(argued.length + 1);

    // Read out one at a time: a fact shows once an argument read so far turned it over.
    now = until(room, now, here, () => room.run?.stage === "revealed");
    let steps = 0;
    for (let p = presentation(room); p; p = presentation(room)) {
      raw = look(now);
      const read = new Set(p.order.slice(0, p.shown));
      room.run!.reveal!.facts?.forEach((f, i) => {
        if (!f.uncoveredBy.some((id) => read.has(id))) expect(raw, `step ${p!.shown}`).not.toContain(facts[i]);
      });
      steps++;
      const shown = p.shown;
      now = until(room, now, here, () => presentation(room)?.shown !== shown);
    }
    expect(steps).toBe(4);
    // The result is up: everything players see, still nothing of their own.
    raw = look(now);
    expect(raw).toContain(facts[0]);
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

  it("tells players when it moves on, and whether Jev is judging", () => {
    const room = practice();
    const here = new Set(["p1"]);
    run(room, t0, here);
    expect(playerView(room, "p1", here, t0, false).autopilot).toEqual({ nextAt: t0 + T.lobby * 1000, judged: false });
    expect(playerView(room, "p1", here, t0, true).autopilot?.judged).toBe(true);
    // A normal room has no autopilot.
    delete room.autopilot;
    expect(playerView(room, "p1", here, t0).autopilot).toBeNull();
  });

  it("tidies names, numbers a taken one, and picks one for a blank", () => {
    const room = practice();
    expect(practiceName(room, "  Dee \n  Dee ", () => "x")).toBe("Dee Dee");
    expect(practiceName(room, "ann", () => "x")).toBe("ann 2");
    expect(practiceName(room, "", () => "Puddles")).toBe("Puddles");
    expect(practiceName(room, 42, () => "Bob")).toBe("Bob 2");
  });
});
