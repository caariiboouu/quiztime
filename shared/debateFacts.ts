/**
 * The hidden fact board for debates. The host writes a few true facts for
 * each side; an argument that brings one up for its own side, and gets it
 * right, uncovers it (worth `factPoints`), and one that contradicts any fact
 * is a bluff (costs the same). Jev makes the first call on every fact in every
 * argument and the host can overrule it.
 *
 * The side that uncovers the bigger share of its facts wins the debate and
 * everyone who argued for it gets `winBonus`; a tie goes to the side with the
 * better arguments on average, and past that it's a draw. Verdict points for
 * a good argument count whichever side wins.
 */
import {
  type DebateFact,
  type DebateQuestion,
  type DebateResult,
  type DebateSide,
  type FactMark,
  type JudgeResult,
} from "./protocol";

export const MAX_DEBATE_FACTS = 6;
export const MAX_FACT_LENGTH = 200;
export const DEFAULT_FACT_POINTS = 25;
export const DEBATE_SIDES: readonly DebateSide[] = ["for", "against"];

/** Jev's probability above which a fact counts as used (or contradicted). */
export const FACT_THRESHOLD = 0.5;

/** Whether someone arguing `side` can uncover this fact. */
export function factFits(fact: DebateFact, side: DebateSide): boolean {
  return !fact.side || fact.side === side;
}

/** How many facts each side can uncover (a fact for either side counts for both). */
export function factCounts(facts: DebateFact[]): Record<DebateSide, number> {
  return {
    for: facts.filter((f) => factFits(f, "for")).length,
    against: facts.filter((f) => factFits(f, "against")).length,
  };
}

/** Jev's call on one fact in one argument; undefined if Jev didn't judge it. */
export function jevFactMark(judge: JudgeResult | undefined, i: number): FactMark | undefined {
  if (judge?.status !== "ok") return undefined;
  const f = judge.facts?.[i];
  if (!f) return undefined;
  if (f.contradicts > FACT_THRESHOLD) return "bluff";
  if ((f.used ?? 0) > FACT_THRESHOLD) return "uncovered";
  return "none";
}

/**
 * The call that counts: the host's, else Jev's (undefined: nobody checked).
 * A fact only uncovers for its own side, whoever says otherwise.
 */
export function factMark(
  fact: DebateFact,
  i: number,
  side: DebateSide,
  judge: JudgeResult | undefined,
  override: FactMark | undefined,
): FactMark | undefined {
  const mark = override ?? jevFactMark(judge, i);
  return mark === "uncovered" && !factFits(fact, side) ? "none" : mark;
}

export type Argued = {
  playerId: string;
  side: DebateSide;
  /** Verdict points for the argument alone. */
  verdictPoints: number;
};

/**
 * Who won: the bigger share of its own facts uncovered, then the better
 * average verdict among those who argued. A side nobody argued for can't win.
 */
export function debateWinner(
  q: DebateQuestion,
  argued: Argued[],
  uncovered: Record<DebateSide, Set<number>>,
): DebateResult {
  const facts = q.facts ?? [];
  const totals = factCounts(facts);
  const result: DebateResult = {
    winner: null,
    facts: {
      for: { uncovered: uncovered.for.size, total: totals.for },
      against: { uncovered: uncovered.against.size, total: totals.against },
    },
    bonus: q.winBonus ?? 0,
    argued: {
      for: argued.filter((a) => a.side === "for").length,
      against: argued.filter((a) => a.side === "against").length,
    },
  };
  const rank = (side: DebateSide): [number, number] => {
    const mine = argued.filter((a) => a.side === side);
    if (!mine.length) return [-1, -1];
    const share = totals[side] ? uncovered[side].size / totals[side] : 0;
    return [share, mine.reduce((s, a) => s + a.verdictPoints, 0) / mine.length];
  };
  const [a, b] = [rank("for"), rank("against")];
  if (a[0] !== b[0]) result.winner = a[0] > b[0] ? "for" : "against";
  else if (a[1] !== b[1]) result.winner = a[1] > b[1] ? "for" : "against";
  return result;
}
