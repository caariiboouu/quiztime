import { leaderOf } from "../../../shared/duckStandings";
import { duckData } from "../duckStore";

/**
 * Whoever leads the Ceramic Duck Hours standings right now (by live total).
 * Their linked duck wears the gold crown. Components should prefer
 * useDuckLeader() (re-renders when the live standings arrive).
 */
export function duckHoursLeader(now = Date.now()): string | null {
  return leaderOf(duckData(), now);
}
