import { describe, expect, it } from "vitest";
import type { DuckHoursData } from "../src/types";
import { applyQuizStandings, leaderOf, liveSeconds, ranksFromScores, standingsError } from "./duckStandings";

const HOUR = 3600;
const t0 = Date.parse("2026-10-01T12:00:00Z");
const data: DuckHoursData = {
  holders: [
    { id: "ann", initials: "Ann", accumulatedSeconds: 10 * HOUR, rank: 1 },
    { id: "bob", initials: "Bob", accumulatedSeconds: 12 * HOUR, rank: 2 },
    { id: "cy", initials: "Cy", accumulatedSeconds: 1 * HOUR, rank: null },
  ],
  heldSince: new Date(t0).toISOString(),
  bonusLog: [],
};

describe("Duck Hours standings", () => {
  it("ranks a quiz by score, ties sharing a place", () => {
    const r = ranksFromScores([
      { id: "a", score: 50 },
      { id: "b", score: 120 },
      { id: "c", score: 50 },
      { id: "d", score: 10 },
    ]);
    expect(r.map((p) => [p.id, p.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });

  it("after a quiz: banks everyone's time, sets the new ranks, benches who didn't play, adds newcomers", () => {
    const now = t0 + 10 * HOUR * 1000; // 10 h later
    const { data: next, createdIds } = applyQuizStandings(
      data,
      [
        { holderId: "cy", name: "Cy", rank: 1 },
        { holderId: null, name: "Dee", rank: 2 },
      ],
      now,
    );
    const by = Object.fromEntries(next.holders.map((h) => [h.initials, h]));
    // Banked at their old rates: Ann 1×, Bob ½×, Cy benched.
    expect(by.Ann.accumulatedSeconds).toBeCloseTo(20 * HOUR);
    expect(by.Bob.accumulatedSeconds).toBeCloseTo(17 * HOUR);
    expect(by.Cy.accumulatedSeconds).toBeCloseTo(1 * HOUR);
    // New ranks; Ann and Bob didn't play, so they're benched.
    expect([by.Cy.rank, by.Dee.rank, by.Ann.rank, by.Bob.rank]).toEqual([1, 2, null, null]);
    expect(createdIds[0]).toBeNull();
    expect(createdIds[1]).toBe(by.Dee.id);
    expect(next.heldSince).toBe(new Date(now).toISOString());
    // The clock restarts at the new rates: an hour later Cy has gained an hour.
    expect(liveSeconds(next, "cy", now + HOUR * 1000)).toBeCloseTo(2 * HOUR);
    expect(liveSeconds(next, "ann", now + HOUR * 1000)).toBeCloseTo(20 * HOUR);
  });

  it("the crown goes to whoever has the most time", () => {
    expect(leaderOf(data, t0)).toBe("bob");
    expect(leaderOf(data, t0 + 5 * HOUR * 1000)).toBe("ann"); // 15 h vs 14.5 h
  });

  it("checks standings sent to the server", () => {
    expect(standingsError(data)).toBeNull();
    expect(standingsError({ holders: "x" })).toMatch(/holders/);
    expect(standingsError({ ...data, holders: [{ id: "a", initials: "A", accumulatedSeconds: -1, rank: 1 }] })).toMatch(/total/);
    expect(standingsError({ ...data, holders: [...data.holders, data.holders[0]] })).toMatch(/Duplicate/);
  });
});
