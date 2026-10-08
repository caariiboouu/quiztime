import type { BonusAward } from "../src/types";
import type { HostView } from "./protocol";

/**
 * A Duck Hours bonus the host can choose to grant after a live session.
 * Mirrors `BonusAward` minus the timestamp, which is set when it's granted.
 */
export type ProposedDuckBonus = Omit<BonusAward, "at"> & {
  /** Display name of the player who earned it, for the host's review list. */
  playerName: string;
};

/**
 * STUB — the rules for turning a live session into Ceramic Duck Hours are
 * still being decided, so this proposes nothing yet.
 *
 * Ideas on the table (none implemented):
 *  - fastest correct answer on a choice question
 *  - top Jev-judged written answer (never time-based)
 *  - minigame winners
 *  - winning team
 *
 * Inputs available: `view.players` (each with an optional `duckHolderId`
 * linked at join), `view.teams`, and per-segment results. Only players who
 * linked a duck entry can receive a bonus. Whatever this returns is shown to
 * the host for approval; granting writes `BonusAward`s into
 * `src/data/duckHours.json` through the existing admin "Save to repo" flow.
 */
export function proposeDuckBonuses(view: HostView): ProposedDuckBonus[] {
  void view;
  return [];
}
