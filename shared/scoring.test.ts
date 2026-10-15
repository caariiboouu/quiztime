import { describe, expect, it } from "vitest";
import {
  numericAwards,
  placementAwards,
  placementPoints,
  rankBy,
  speedBonus,
  levelPoints,
  teamStandings,
} from "./scoring";

describe("speedBonus", () => {
  it("is full at 0ms and zero at the limit", () => {
    expect(speedBonus(0, 20_000, 50)).toBe(50);
    expect(speedBonus(10_000, 20_000, 50)).toBe(25);
    expect(speedBonus(20_000, 20_000, 50)).toBe(0);
  });
  it("clamps late or negative times", () => {
    expect(speedBonus(30_000, 20_000, 50)).toBe(0);
    expect(speedBonus(-500, 20_000, 50)).toBe(50);
  });
});

describe("rankBy", () => {
  it("gives ties the better place", () => {
    const r = rankBy([
      { id: "a", metric: 5 },
      { id: "b", metric: 9 },
      { id: "c", metric: 5 },
      { id: "d", metric: 1 },
    ]);
    expect([r.get("b"), r.get("a"), r.get("c"), r.get("d")]).toEqual([1, 2, 2, 4]);
  });
});

describe("placement", () => {
  it("everyone who plays earns something", () => {
    expect(placementPoints(1, 4, 100)).toBe(100);
    expect(placementPoints(4, 4, 100)).toBe(25);
  });
  it("awards by metric", () => {
    const a = placementAwards(
      [
        { id: "x", metric: 10 },
        { id: "y", metric: 30 },
      ],
      100,
    );
    expect(a.get("y")).toBe(100);
    expect(a.get("x")).toBe(50);
  });
});

describe("numericAwards", () => {
  it("closest guess wins, over or under", () => {
    const a = numericAwards(
      [
        { id: "over", value: 110 },
        { id: "under", value: 95 },
        { id: "far", value: 10 },
      ],
      100,
      90,
    );
    expect(a.get("under")).toBe(90);
    expect(a.get("over")).toBe(60);
    expect(a.get("far")).toBe(30);
  });
});

describe("teamStandings", () => {
  it("adds up members by default, or averages them", () => {
    const teams = [
      { id: "big", name: "Big", color: "#000000" },
      { id: "small", name: "Small", color: "#ffffff" },
      { id: "empty", name: "Empty", color: "#123456" },
    ];
    const p = (id: string, teamId: string, score: number) => ({
      id,
      name: id,
      teamId,
      connected: true,
      score,
      lookIndex: 0,
      duckHolderId: null,
      outfit: null,
    });
    const players = [p("a", "big", 10), p("b", "big", 10), p("c", "big", 10), p("d", "small", 25)];
    // By default every member's points count toward the team.
    expect(teamStandings(teams, players).map((t) => [t.id, t.score, t.members])).toEqual([
      ["big", 30, 3],
      ["small", 25, 1],
      ["empty", 0, 0],
    ]);
    // Averaged, the bigger team doesn't win on numbers alone.
    expect(teamStandings(teams, players, "average").map((t) => [t.id, t.score, t.members])).toEqual([
      ["small", 25, 1],
      ["big", 10, 3],
      ["empty", 0, 0],
    ]);
  });
});

describe("levelPoints", () => {
  it("spreads points evenly from the top level down to zero", () => {
    expect([0, 1, 2, 3, 4].map((l) => levelPoints(l, 5, 100))).toEqual([100, 75, 50, 25, 0]);
    expect([0, 1, 2].map((l) => levelPoints(l, 3, 90))).toEqual([90, 45, 0]);
  });
  it("clamps out-of-range levels", () => {
    expect(levelPoints(-1, 5, 100)).toBe(100);
    expect(levelPoints(9, 5, 100)).toBe(0);
  });
});
