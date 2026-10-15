import { describe, expect, it } from "vitest";
import { addCall, NO_SPEND, type JevSpend } from "./jevCost";
import { EMPTY_LEDGER, gameKey, ledgerSummary, RECENT_GAMES, recordGame, type JevGameSpend } from "./jevLedger";

const call = { model: "jev-1.13.0", inputTokens: 1000, outputTokens: 20 };

function spendOf(calls: number): JevSpend {
  let s = NO_SPEND;
  for (let i = 0; i < calls; i++) s = addCall(s, call);
  return s;
}

function game(code: string, startedAt: number, calls: number, title = `Show ${code}`): JevGameSpend {
  return { key: gameKey(code, startedAt), code, title, startedAt, spend: spendOf(calls) };
}

describe("the all-time Jev ledger", () => {
  it("adds up two games, and keeps them through a reload", () => {
    let ledger = recordGame(EMPTY_LEDGER, game("ABCD", 1_000, 3, "Monday quiz"));
    ledger = recordGame(ledger, game("WXYZ", 2_000, 2, "Tuesday quiz"));
    const summary = ledgerSummary(ledger);
    expect(summary.total).toMatchObject({ calls: 5, inputTokens: 5000, outputTokens: 100, unpriced: 0 });
    expect(summary.total.usd).toBeCloseTo((5000 * 0.042) / 1_000_000, 12);
    expect(summary.games).toBe(2);
    expect(summary.since).toBe(1_000);
    expect(summary.recent.map((g) => [g.title, g.spend.calls])).toEqual([
      ["Tuesday quiz", 2],
      ["Monday quiz", 3],
    ]);

    // Storage holds it as structured data; a fresh load gives the same totals.
    const reloaded = JSON.parse(JSON.stringify(ledger));
    expect(ledgerSummary(reloaded)).toEqual(summary);
    // …and the next game adds on top of what was saved.
    const third = ledgerSummary(recordGame(reloaded, game("QRST", 3_000, 1)));
    expect(third.total.calls).toBe(6);
    expect(third.games).toBe(3);
  });

  it("takes a game's latest total instead of adding each report", () => {
    let ledger = recordGame(EMPTY_LEDGER, game("ABCD", 1_000, 2));
    ledger = recordGame(ledger, game("ABCD", 1_000, 5)); // more judging later in the game
    ledger = recordGame(ledger, game("ABCD", 1_000, 5)); // reported again
    ledger = recordGame(ledger, game("ABCD", 1_000, 4)); // a stale report arriving late
    const summary = ledgerSummary(ledger);
    expect(summary.total.calls).toBe(5);
    expect(summary.games).toBe(1);
  });

  it("counts a reused room code as a new game", () => {
    let ledger = recordGame(EMPTY_LEDGER, game("ABCD", 1_000, 2));
    ledger = recordGame(ledger, game("ABCD", 90_000_000, 3));
    expect(ledgerSummary(ledger)).toMatchObject({ games: 2, total: { calls: 5 } });
  });

  it("skips games that never called Jev", () => {
    expect(recordGame(EMPTY_LEDGER, game("ABCD", 1_000, 0))).toBe(EMPTY_LEDGER);
  });

  it("keeps a short history without losing older games from the total", () => {
    let ledger = EMPTY_LEDGER;
    for (let i = 0; i < RECENT_GAMES + 5; i++) ledger = recordGame(ledger, game(`G${i}`, 1_000 + i, 1));
    const summary = ledgerSummary(ledger);
    expect(summary.recent).toHaveLength(RECENT_GAMES);
    expect(summary.recent[0].code).toBe(`G${RECENT_GAMES + 4}`);
    expect(summary.total.calls).toBe(RECENT_GAMES + 5);
    expect(summary.games).toBe(RECENT_GAMES + 5);
    expect(summary.since).toBe(1_000);
  });
});
