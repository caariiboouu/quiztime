/**
 * What judging with Jev costs. Jev bills input tokens only (output is free),
 * per https://docs.typesafe.ai/models.md as read on 2026-10-15: jev-1.13 and
 * jev-1.14 are both $0.042 per million input tokens. Update this table when
 * the price or the model changes; an unlisted model shows "price unknown"
 * rather than a guess.
 */
export const JEV_USD_PER_MTOK_INPUT: Record<string, number> = {
  "jev-1.13": 0.042,
  "jev-1.14": 0.042,
};

/** One successful Jev call, as its response reported it. */
export type JevCall = {
  model: string;
  /** Null when the response didn't say (then it can't be priced). */
  inputTokens: number | null;
  outputTokens: number | null;
};

/** Jev spend added up: for one question, or the whole game. */
export type JevSpend = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Cost of the calls we could price. */
  usd: number;
  /** Calls without a price (no usage reported, or a model not in the table). */
  unpriced: number;
};

export const NO_SPEND: JevSpend = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, unpriced: 0 };

/** $ per million input tokens for a model name like "jev-1.13.0", if known. */
export function jevPrice(model: string): number | null {
  const m = /^(jev-\d+\.\d+)(?:\.|$)/.exec(model);
  return (m && JEV_USD_PER_MTOK_INPUT[m[1]]) ?? null;
}

export function addCall(spend: JevSpend, call: JevCall): JevSpend {
  const price = jevPrice(call.model);
  const priced = price !== null && call.inputTokens !== null;
  return {
    calls: spend.calls + 1,
    inputTokens: spend.inputTokens + (call.inputTokens ?? 0),
    outputTokens: spend.outputTokens + (call.outputTokens ?? 0),
    usd: spend.usd + (priced ? (call.inputTokens! * price) / 1_000_000 : 0),
    unpriced: spend.unpriced + (priced ? 0 : 1),
  };
}

export function sumSpend(list: JevSpend[]): JevSpend {
  return list.reduce(
    (a, b) => ({
      calls: a.calls + b.calls,
      inputTokens: a.inputTokens + b.inputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
      usd: a.usd + b.usd,
      unpriced: a.unpriced + b.unpriced,
    }),
    NO_SPEND,
  );
}

/**
 * Dollars, readable at any size: a call is about $0.00001, so small amounts
 * keep two significant figures ("$0.000013", "$0.0012") instead of rounding
 * to "$0.00" (and never in exponent form).
 */
export function formatUsd(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd >= 0.995) return `$${usd.toFixed(2)}`;
  // Enough decimals for two significant figures, capped at 8 ($0.00000001).
  const decimals = Math.min(8, Math.max(2, 1 - Math.floor(Math.log10(usd))));
  const s = usd.toFixed(decimals);
  if (Number(s) === 0) return "<$0.00000001";
  // Trailing zeros go, but cents keep both digits ("$0.05", "$0.50").
  return `$${s.replace(/(\.\d\d\d*?)0+$/, "$1")}`;
}

/** Token counts, short: 950, 1.2k, 12k, 3.1M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
