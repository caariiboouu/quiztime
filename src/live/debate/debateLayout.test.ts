import { describe, expect, it } from "vitest";
import { TOP_PEDESTAL, debateLayout, debateNames, type DebateDuck } from "./debateLayout";

const ducks = (spec: string): DebateDuck[] =>
  [...spec].map((c, i) => ({ id: `d${i}`, side: c === "f" ? "for" : c === "a" ? "against" : null }));

describe("debateLayout", () => {
  it("puts for on the left, against on the right, and the undecided in the middle", () => {
    const { homes } = debateLayout(ducks("fa.f"));
    expect(homes.get("d0")!.x).toBeLessThan(0);
    expect(homes.get("d3")!.x).toBeLessThan(homes.get("d0")!.x); // fills outwards
    expect(homes.get("d1")!.x).toBeGreaterThan(0);
    expect(homes.get("d2")!.x).toBe(0);
  });

  it("keeps a whole room on one side on the floor and in view", () => {
    for (const n of [10, 30, 60]) {
      const { homes, half, platforms } = debateLayout(ducks("f".repeat(n)), {}, 5);
      const xs = [...homes.values()].map((h) => h.x).sort((a, b) => a - b);
      expect(xs[0]).toBeGreaterThanOrEqual(-half);
      expect(xs[xs.length - 1]).toBeLessThan(0);
      // Pedestals side by side never overlap.
      const blocks = platforms.slice(1).sort((a, b) => a.x0 - b.x0);
      for (let i = 1; i < blocks.length; i++) expect(blocks[i].x0).toBeGreaterThan(blocks[i - 1].x1);
    }
  });

  it("raises each argued duck on a pedestal as tall as its verdict; the worst stays on the floor", () => {
    const { platforms, homes } = debateLayout(ducks("ffa."), { d0: 0, d1: 4, d2: 2 }, 5);
    // Floor, plus one block per argued duck (not the undecided one).
    expect(platforms).toHaveLength(4);
    const top = platforms[homes.get("d0")!.ground];
    expect(top.y).toBeCloseTo(TOP_PEDESTAL);
    expect(top.base).toBe(0);
    expect(platforms[homes.get("d2")!.ground].y).toBeCloseTo(TOP_PEDESTAL / 2);
    expect(homes.get("d1")!.ground).toBe(0);
    expect(homes.get("d3")!.ground).toBe(0);
  });

  it("has no pedestals before the reveal", () => {
    const { platforms } = debateLayout(ducks("ffa"));
    expect(platforms).toHaveLength(1);
  });
});

describe("debateNames", () => {
  it("defaults to For and Against", () => {
    expect(debateNames()).toEqual({ for: "For", against: "Against" });
    expect(debateNames({ for: "Ducks", against: "" })).toEqual({ for: "Ducks", against: "Against" });
  });
});
