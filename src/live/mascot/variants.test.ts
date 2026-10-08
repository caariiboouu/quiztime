import { describe, expect, it } from "vitest";
import { HATS, MASCOT_LOOK, PALETTE, UNIQUE_LOOKS, describeLook, lookForIndex } from "./variants";

describe("duck variants", () => {
  it("gives the first UNIQUE_LOOKS players distinct colour + hat pairs", () => {
    expect(UNIQUE_LOOKS).toBe(PALETTE.length * HATS.length - 1);
    const seen = new Set<string>();
    for (let i = 0; i < UNIQUE_LOOKS; i++) {
      const l = lookForIndex(i);
      seen.add(`${l.accent}/${l.hat}`);
    }
    expect(seen.size).toBe(UNIQUE_LOOKS);
  });

  it("never hands a player the mascot's own look", () => {
    for (let i = 0; i < UNIQUE_LOOKS * 2; i++) {
      const l = lookForIndex(i);
      expect(l.accent === MASCOT_LOOK.accent && l.hat === "none").toBe(false);
    }
  });

  it("is stable: same index, same duck", () => {
    expect(lookForIndex(7)).toEqual(lookForIndex(7));
    expect(lookForIndex(7)).not.toEqual(lookForIndex(8));
  });

  it("keeps proportions subtle", () => {
    for (let i = 0; i < 200; i++) {
      for (const v of Object.values(lookForIndex(i).shape)) {
        expect(v).toBeGreaterThan(0.7);
        expect(v).toBeLessThan(1.3);
      }
    }
  });

  it("describes a duck in words", () => {
    expect(describeLook({ ...MASCOT_LOOK, breed: "rouen", hat: "tophat", accentName: "red" })).toBe(
      "the Rouen with the red top hat",
    );
    expect(describeLook(MASCOT_LOOK)).toBe("the Pekin with the navy polka-dot ribbon");
  });
});

describe("breeds", () => {
  it("spreads players across many breeds", () => {
    const breeds = new Set(Array.from({ length: 60 }, (_, i) => lookForIndex(i).breed));
    expect(breeds.size).toBeGreaterThanOrEqual(10);
  });
});
