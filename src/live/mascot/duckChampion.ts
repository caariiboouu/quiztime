import bundledDuck from "../../data/duckHours.json";
import { liveSeconds, normalizeDuckData } from "../../components/DuckHours";
import type { DuckHoursData } from "../../types";

/**
 * Whoever leads the Ceramic Duck Hours standings right now (by live total),
 * from the published standings. Their linked duck wears the gold crown.
 */
export function duckHoursLeader(now = Date.now()): string | null {
  const data = normalizeDuckData(bundledDuck as DuckHoursData);
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
