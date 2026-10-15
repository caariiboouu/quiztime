/**
 * What Jev has cost across games: an all-time total plus the last few games,
 * kept by the server after each game's room is gone. Each game reports its
 * whole spend so far (not each call), so a retried or repeated report never
 * counts twice.
 */
import { NO_SPEND, sumSpend, type JevSpend } from "./jevCost";

/** How many recent games the history keeps; older ones fold into one total. */
export const RECENT_GAMES = 20;

/** One game's Jev spend. */
export type JevGameSpend = {
  /** Room code and start time: codes are reused once a room expires. */
  key: string;
  code: string;
  title: string;
  startedAt: number;
  spend: JevSpend;
};

/** The stored document. */
export type JevLedgerData = {
  /** Newest first, at most RECENT_GAMES. */
  games: JevGameSpend[];
  /** Games that fell off the history, added up. */
  older: JevSpend;
  olderGames: number;
  /** When the first game was recorded. */
  since: number | null;
};

/** What the host sees. */
export type JevLedgerSummary = {
  total: JevSpend;
  games: number;
  since: number | null;
  recent: JevGameSpend[];
};

export const EMPTY_LEDGER: JevLedgerData = { games: [], older: NO_SPEND, olderGames: 0, since: null };

export function gameKey(code: string, startedAt: number): string {
  return `${code}-${startedAt}`;
}

/**
 * A game's spend so far: replaces what that game last reported (a game's
 * spend only grows, so a late, smaller report is ignored). A game that has
 * already fallen off the history would count again; with rooms lasting a
 * day, that needs more than RECENT_GAMES games started in one day.
 */
export function recordGame(ledger: JevLedgerData, game: JevGameSpend): JevLedgerData {
  if (game.spend.calls === 0) return ledger;
  const existing = ledger.games.find((g) => g.key === game.key);
  if (existing && existing.spend.calls >= game.spend.calls) return ledger;
  const games = [game, ...ledger.games.filter((g) => g.key !== game.key)].sort((a, b) => b.startedAt - a.startedAt);
  const dropped = games.slice(RECENT_GAMES);
  return {
    games: games.slice(0, RECENT_GAMES),
    older: sumSpend([ledger.older, ...dropped.map((g) => g.spend)]),
    olderGames: ledger.olderGames + dropped.length,
    since: Math.min(ledger.since ?? game.startedAt, game.startedAt),
  };
}

export function ledgerSummary(ledger: JevLedgerData): JevLedgerSummary {
  return {
    total: sumSpend([ledger.older, ...ledger.games.map((g) => g.spend)]),
    games: ledger.olderGames + ledger.games.length,
    since: ledger.since,
    recent: ledger.games,
  };
}
