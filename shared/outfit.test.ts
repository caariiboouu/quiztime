import { describe, expect, it } from "vitest";
import { cleanOutfit } from "./outfit";

describe("outfits", () => {
  it("keeps real items and drops anything else", () => {
    expect(cleanOutfit({ hat: "cap", neckpiece: "lei" })).toEqual({ hat: "cap", neckpiece: "lei" });
    expect(cleanOutfit({ hat: "crown", neckpiece: "lei" })).toEqual({ hat: null, neckpiece: "lei" });
    expect(cleanOutfit({ hat: "crown" })).toBeNull();
    expect(cleanOutfit("tophat")).toBeNull();
    expect(cleanOutfit(null)).toBeNull();
  });
});
