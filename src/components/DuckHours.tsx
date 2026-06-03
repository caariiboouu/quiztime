import { useEffect, useState } from "react";
import bundledDuck from "../data/duckHours.json";
import type { DuckHoursData } from "../types";
import { useOverridableJson } from "../hooks/useOverridableJson";
import { NavBar } from "./NavBar";

export const DUCK_OVERRIDE_KEY = "quiztime.duckHours.override";

/** Seconds a holder has banked plus, for the current holder, live elapsed time. */
export function liveSeconds(
  data: DuckHoursData,
  holderId: string,
  now: number,
): number {
  const holder = data.holders.find((h) => h.id === holderId);
  if (!holder) return 0;
  let total = holder.accumulatedSeconds;
  if (data.currentHolderId === holderId && data.heldSince) {
    const since = Date.parse(data.heldSince);
    if (!Number.isNaN(since)) total += Math.max(0, (now - since) / 1000);
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
  const { data } = useOverridableJson<DuckHoursData>(
    DUCK_OVERRIDE_KEY,
    bundledDuck as DuckHoursData,
  );

  // Re-render once a second so the current holder's clock ticks live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
        <p className="mb-8 text-neutral-600">
          Hours accumulated while holding the trophy. The clock ticks for
          whoever holds the duck right now.
        </p>

        {ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
            No holders yet. Add some from the admin panel.
          </div>
        ) : (
          <ol className="space-y-3">
            {ranked.map((holder, index) => {
              const isHolding = data.currentHolderId === holder.id;
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
                  <span className="flex-1 text-2xl font-bold tracking-wide text-neutral-900">
                    {holder.initials || "—"}
                    {isHolding && (
                      <span className="ml-3 align-middle text-xl">🦆</span>
                    )}
                  </span>
                  {isHolding && (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      holding now
                    </span>
                  )}
                  <span
                    className={`text-xl font-semibold tabular-nums ${
                      isHolding ? "text-amber-900" : "text-neutral-700"
                    }`}
                  >
                    {formatDuration(total, isHolding)}
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
