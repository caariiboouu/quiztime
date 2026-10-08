import type { PublicPlayer, Team, TeamStanding } from "./protocol";

/**
 * Speed bonus for a correct choice answer: the full `max` for an instant
 * answer, falling linearly to 0 at the time limit. Only ever applied to
 * choice questions, where every answer is a single keypress for everyone.
 */
export function speedBonus(
  elapsedMs: number,
  timeLimitMs: number,
  max: number,
): number {
  if (timeLimitMs <= 0 || max <= 0) return 0;
  const remaining = 1 - Math.max(0, elapsedMs) / timeLimitMs;
  return Math.round(max * Math.min(1, Math.max(0, remaining)));
}

/**
 * Competition ranking ("1224"): equal metrics share the better place.
 * Higher metric is better. Returns 1-based ranks keyed by id.
 */
export function rankBy(
  entries: { id: string; metric: number }[],
): Map<string, number> {
  const sorted = [...entries].sort((a, b) => b.metric - a.metric);
  const ranks = new Map<string, number>();
  sorted.forEach((e, i) => {
    const prev = sorted[i - 1];
    ranks.set(e.id, prev && prev.metric === e.metric ? ranks.get(prev.id)! : i + 1);
  });
  return ranks;
}

/**
 * Mario Party-style placement points: 1st gets `max`, and each later place
 * gets one n-th less, so last place among n still earns max/n for taking part.
 */
export function placementPoints(rank: number, n: number, max: number): number {
  if (n <= 0 || rank < 1) return 0;
  return Math.round(max * (1 - (rank - 1) / n));
}

/** Placement points for every entry, ties sharing the better place. */
export function placementAwards(
  entries: { id: string; metric: number }[],
  max: number,
): Map<string, number> {
  const ranks = rankBy(entries);
  const out = new Map<string, number>();
  for (const [id, rank] of ranks) {
    out.set(id, placementPoints(rank, entries.length, max));
  }
  return out;
}

/** Numeric questions: closest guess places first. */
export function numericAwards(
  guesses: { id: string; value: number }[],
  answer: number,
  max: number,
): Map<string, number> {
  return placementAwards(
    guesses.map((g) => ({ id: g.id, metric: -Math.abs(g.value - answer) })),
    max,
  );
}

/**
 * Team standings use the average score per member so a team of 8 doesn't
 * automatically beat a team of 5. Empty teams score 0.
 */
export function teamStandings(
  teams: Team[],
  players: PublicPlayer[],
): TeamStanding[] {
  return teams
    .map((team) => {
      const members = players.filter((p) => p.teamId === team.id);
      const total = members.reduce((sum, p) => sum + p.score, 0);
      return {
        ...team,
        members: members.length,
        score: members.length ? Math.round(total / members.length) : 0,
      };
    })
    .sort((a, b) => b.score - a.score);
}
