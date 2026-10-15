import { describe, expect, it } from "vitest";
import { addCall, formatTokens, formatUsd, jevPrice, NO_SPEND, sumSpend } from "./jevCost";

describe("jevPrice", () => {
  it("knows the listed models by version, whatever the patch", () => {
    expect(jevPrice("jev-1.13.0")).toBe(0.042);
    expect(jevPrice("jev-1.14.2")).toBe(0.042);
    expect(jevPrice("jev-1.13")).toBe(0.042);
  });
  it("doesn't guess for anything else", () => {
    expect(jevPrice("jev-2.0.0")).toBeNull();
    expect(jevPrice("jev-latest")).toBeNull();
    expect(jevPrice("")).toBeNull();
  });
});

describe("addCall", () => {
  it("prices input tokens only", () => {
    const s = addCall(NO_SPEND, { model: "jev-1.13.0", inputTokens: 1_000_000, outputTokens: 500 });
    expect(s).toEqual({ calls: 1, inputTokens: 1_000_000, outputTokens: 500, usd: 0.042, unpriced: 0 });
  });
  it("counts calls it can't price, without making up a cost", () => {
    let s = addCall(NO_SPEND, { model: "jev-1.13.0", inputTokens: null, outputTokens: null });
    s = addCall(s, { model: "mystery-9", inputTokens: 300, outputTokens: 20 });
    expect(s).toEqual({ calls: 2, inputTokens: 300, outputTokens: 20, usd: 0, unpriced: 2 });
  });
  it("adds up", () => {
    const a = addCall(NO_SPEND, { model: "jev-1.13.0", inputTokens: 300, outputTokens: 20 });
    expect(sumSpend([a, a, NO_SPEND])).toEqual({ calls: 2, inputTokens: 600, outputTokens: 40, usd: a.usd * 2, unpriced: 0 });
  });
});

describe("formatUsd", () => {
  it("keeps tiny amounts readable", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0000126)).toBe("$0.000013");
    expect(formatUsd(0.00123)).toBe("$0.0012");
    expect(formatUsd(0.0000995)).toBe("$0.0001");
    expect(formatUsd(1e-12)).toBe("<$0.00000001");
    expect(String(formatUsd(3e-7))).not.toContain("e");
  });
  it("shows cents as cents", () => {
    expect(formatUsd(0.05)).toBe("$0.05");
    expect(formatUsd(0.5)).toBe("$0.50");
    expect(formatUsd(0.123)).toBe("$0.12");
    expect(formatUsd(2.5)).toBe("$2.50");
  });
});

describe("formatTokens", () => {
  it("shortens big counts", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_400)).toBe("12k");
    expect(formatTokens(1_240)).toBe("1.2k");
    expect(formatTokens(3_100_000)).toBe("3.1M");
  });
});
