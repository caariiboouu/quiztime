/**
 * Ceramic Duck Hours: the standings rules, shared by the site and the
 * live-quiz server (which now keeps the standings; see worker/src/standings.ts).
 *
 * Everyone in the standings accrues duck-time while it's running: the holder
 * (rank 1) at the full rate, 2nd at ½×, 3rd at ⅓×, and so on; benched people
 * (no rank) earn nothing. After a quiz the ranks are reset from its results:
 * time so far is banked and the clock restarts at the new rates.
 */
import type { DuckHolder, DuckHoursData } from "../src/types";

/** Rate at which a given rank earns duck-time. 1st = 1×, 2nd = ½×, 3rd = ⅓×… */
export function rankFraction(rank: number | null): number {
  return rank && rank >= 1 ? 1 / rank : 0;
}

/**
 * Cap on how much time counts toward accrual since the standings last
 * changed. Meetings land on an irregular schedule, so without a cap
 * whoever goes the longest between quizzes would rack up an unfair lead;
 * capping at 30 days keeps a single stretch worth at most a month.
 */
export const MAX_ACCRUAL_MS = 30 * 24 * 60 * 60 * 1000;

/** Milliseconds elapsed since `heldSince`, clamped to [0, MAX_ACCRUAL_MS]. */
export function cappedElapsedMs(
  heldSince: string | null,
  now: number,
): number {
  if (!heldSince) return 0;
  const since = Date.parse(heldSince);
  if (Number.isNaN(since)) return 0;
  return Math.min(Math.max(0, now - since), MAX_ACCRUAL_MS);
}

/**
 * Accept both the current shape and the older { currentHolderId } shape so
 * previously-saved data keeps working.
 */
export function normalizeDuckData(
  raw: DuckHoursData & { currentHolderId?: string | null },
): DuckHoursData {
  const currentHolderId = raw.currentHolderId ?? null;
  const holders: DuckHolder[] = (raw.holders ?? []).map((h) => ({
    id: h.id,
    initials: h.initials ?? "",
    accumulatedSeconds: h.accumulatedSeconds ?? 0,
    rank:
      h.rank !== undefined && h.rank !== null
        ? h.rank
        : currentHolderId === h.id
          ? 1
          : null,
  }));
  return {
    holders,
    heldSince: raw.heldSince ?? null,
    bonusLog: raw.bonusLog ?? [],
  };
}

/** Banked seconds plus, for ranked holders, live elapsed time at their rate. */
export function liveSeconds(
  data: DuckHoursData,
  holderId: string,
  now: number,
): number {
  const holder = data.holders.find((h) => h.id === holderId);
  if (!holder) return 0;
  const elapsedSeconds = cappedElapsedMs(data.heldSince, now) / 1000;
  return holder.accumulatedSeconds + elapsedSeconds * rankFraction(holder.rank);
}

/** Bank everyone's live time (at their rate) into their totals, as of `now`. */
export function bankAll(data: DuckHoursData, now: number): DuckHolder[] {
  const elapsed = cappedElapsedMs(data.heldSince, now) / 1000;
  if (!elapsed) return data.holders;
  return data.holders.map((h) => ({
    ...h,
    accumulatedSeconds: h.accumulatedSeconds + elapsed * rankFraction(h.rank),
  }));
}

/** Whoever has the most duck-time right now (they wear the crown). */
export function leaderOf(data: DuckHoursData, now: number): string | null {
  let best: string | null = null;
  let bestSeconds = -1;
  for (const h of data.holders) {
    const s = liveSeconds(data, h.id, now);
    if (s > bestSeconds) {
      bestSeconds = s;
      best = h.id;
    }
  }
  return best;
}

/** One quiz player's new standing: by Duck Hours entry, or someone new to add. */
export type QuizStanding = {
  /** Their Duck Hours entry, or null to add them to the board. */
  holderId: string | null;
  name: string;
  rank: number;
};

/**
 * New ranks from a quiz's final scores: 1st holds the duck, ties share a
 * place (1, 2, 2, 4…).
 */
export function ranksFromScores<T extends { score: number }>(players: T[]): (T & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
    return { ...p, rank };
  });
}

let created = 0;
const newHolderId = (now: number) =>
  `duck-${now.toString(36)}-${(created++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * After a quiz: bank everyone's time, give the players their new ranks (adding
 * anyone new to the board), and bench everyone who didn't play, then restart
 * the clock. Returns the new standings and the entries it created.
 */
export function applyQuizStandings(
  data: DuckHoursData,
  standings: QuizStanding[],
  now: number,
): { data: DuckHoursData; createdIds: (string | null)[] } {
  const holders = bankAll(normalizeDuckData(data), now).map((h) => ({ ...h, rank: null as number | null }));
  const byId = new Map(holders.map((h) => [h.id, h]));
  const createdIds = standings.map((s) => {
    const existing = s.holderId ? byId.get(s.holderId) : undefined;
    if (existing) {
      existing.rank = s.rank;
      return null;
    }
    const id = newHolderId(now);
    const holder: DuckHolder = { id, initials: s.name, accumulatedSeconds: 0, rank: s.rank };
    holders.push(holder);
    byId.set(id, holder);
    return id;
  });
  return {
    data: { ...data, holders, heldSince: new Date(now).toISOString(), bonusLog: data.bonusLog ?? [] },
    createdIds,
  };
}

/** A valid standings document from untrusted input, or an error. */
export function standingsError(x: unknown): string | null {
  const d = x as DuckHoursData;
  if (!d || typeof d !== "object" || !Array.isArray(d.holders)) return "Standings need a list of holders";
  if (d.holders.length > 500) return "Up to 500 holders";
  const ids = new Set<string>();
  for (const h of d.holders) {
    if (typeof h?.id !== "string" || !h.id || h.id.length > 64) return "Every holder needs an id";
    if (ids.has(h.id)) return `Duplicate holder id ${h.id}`;
    ids.add(h.id);
    if (typeof h.initials !== "string" || h.initials.length > 64) return "Names must be up to 64 characters";
    if (typeof h.accumulatedSeconds !== "number" || !Number.isFinite(h.accumulatedSeconds) || h.accumulatedSeconds < 0) {
      return `Bad total for ${h.initials || h.id}`;
    }
    if (h.rank !== null && (!Number.isInteger(h.rank) || h.rank < 1 || h.rank > 500)) {
      return `Bad rank for ${h.initials || h.id}`;
    }
  }
  if (d.heldSince !== null && (typeof d.heldSince !== "string" || Number.isNaN(Date.parse(d.heldSince)))) {
    return "heldSince must be a date or null";
  }
  if (d.bonusLog !== undefined && (!Array.isArray(d.bonusLog) || d.bonusLog.length > 5000)) {
    return "bonusLog must be a list";
  }
  return null;
}
