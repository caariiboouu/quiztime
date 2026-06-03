import { useEffect, useState } from "react";
import bundledDuck from "../data/duckHours.json";
import type { DuckHolder, DuckHoursData } from "../types";
import { useOverridableJson } from "../hooks/useOverridableJson";
import { NavBar } from "./NavBar";

export const DUCK_OVERRIDE_KEY = "quiztime.duckHours.override";

/** Rate at which a given rank earns duck-time. 1st = 1×, 2nd = ½×, 3rd = ⅓×… */
export function rankFraction(rank: number | null): number {
  return rank && rank >= 1 ? 1 / rank : 0;
}

const FRACTION_GLYPH: Record<number, string> = {
  1: "1×",
  2: "½×",
  3: "⅓×",
  4: "¼×",
  5: "⅕×",
  6: "⅙×",
  7: "⅐×",
  8: "⅛×",
};

export function fractionLabel(rank: number | null): string {
  if (!rank || rank < 1) return "—";
  return FRACTION_GLYPH[rank] ?? `1⁄${rank}×`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
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
  return { holders, heldSince: raw.heldSince ?? null };
}

/** Banked seconds plus, for ranked holders, live elapsed time at their rate. */
export function liveSeconds(
  data: DuckHoursData,
  holderId: string,
  now: number,
): number {
  const holder = data.holders.find((h) => h.id === holderId);
  if (!holder) return 0;
  let total = holder.accumulatedSeconds;
  if (data.heldSince) {
    const since = Date.parse(data.heldSince);
    if (!Number.isNaN(since)) {
      total += Math.max(0, (now - since) / 1000) * rankFraction(holder.rank);
    }
  }
  return total;
}

/** "12h 04m" or, with seconds, "12h 04m 33s". */
export function formatDuration(totalSeconds: number, withSeconds = false): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${hours}h ${pad(minutes)}m`;
  return withSeconds ? `${base} ${pad(secs)}s` : base;
}

type DuckHoursProps = {
  onExit: () => void;
};

export function DuckHours({ onExit }: DuckHoursProps) {
  const { data: raw } = useOverridableJson<DuckHoursData>(
    DUCK_OVERRIDE_KEY,
    bundledDuck as DuckHoursData,
  );
  const data = normalizeDuckData(raw);

  // Re-render once a second so the live clock ticks.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const anyRunning = data.heldSince !== null;
  const ranked = [...data.holders].sort(
    (a, b) => liveSeconds(data, b.id, now) - liveSeconds(data, a.id, now),
  );

  return (
    <div className="flex h-full flex-col">
      <NavBar title="Ceramic Duck Hours" onBack={onExit} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h2 className="mb-2 text-3xl font-semibold tracking-tight text-neutral-900">
          🦆 The Ceramic Duck
        </h2>
        <p className="mb-2 text-neutral-600">
          Duck-hours accumulate for everyone in the standings. The current
          holder (1st) earns the full rate; runners-up earn a fraction — 2nd
          earns ½×, 3rd ⅓×, and so on.
        </p>
        <p className="mb-8 text-sm text-neutral-500">
          Ranked by total time, so a steady runner-up can out-earn an occasional
          winner.
        </p>

        {ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
            No participants yet. Add some from the admin panel.
          </div>
        ) : (
          <ol className="space-y-3">
            {ranked.map((holder, index) => {
              const isHolding = holder.rank === 1;
              const isRanked = holder.rank !== null;
              const total = liveSeconds(data, holder.id, now);
              return (
                <li
                  key={holder.id}
                  className={`flex items-center gap-4 rounded-xl border p-4 shadow-sm ${
                    isHolding
                      ? "border-amber-400 bg-amber-50"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <span className="w-8 text-center text-lg font-semibold tabular-nums text-neutral-400">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="truncate text-xl font-bold tracking-wide text-neutral-900">
                      {holder.initials || "—"}
                    </span>
                    {isHolding && <span className="text-xl">🦆</span>}
                  </span>
                  {isRanked ? (
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isHolding
                          ? "bg-amber-200 text-amber-900"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {isHolding ? "holding" : ordinal(holder.rank!)} ·{" "}
                      {fractionLabel(holder.rank)}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-400">
                      benched
                    </span>
                  )}
                  <span
                    className={`w-28 text-right text-xl font-semibold tabular-nums ${
                      isHolding ? "text-amber-900" : "text-neutral-700"
                    }`}
                  >
                    {formatDuration(total, isHolding && anyRunning)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}
