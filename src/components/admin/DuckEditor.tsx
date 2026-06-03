import type { DuckHolder, DuckHoursData } from "../../types";
import {
  fractionLabel,
  normalizeDuckData,
  ordinal,
  rankFraction,
} from "../DuckHours";

type DuckEditorProps = {
  data: DuckHoursData;
  onChange: (data: DuckHoursData) => void;
};

function newHolderId(): string {
  return `duck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Bank each ranked holder's live elapsed time (at their rate) into their total. */
function bankAll(data: DuckHoursData, nowMs: number): DuckHolder[] {
  if (!data.heldSince) return data.holders;
  const since = Date.parse(data.heldSince);
  if (Number.isNaN(since)) return data.holders;
  const elapsed = Math.max(0, (nowMs - since) / 1000);
  if (!elapsed) return data.holders;
  return data.holders.map((h) => ({
    ...h,
    accumulatedSeconds: h.accumulatedSeconds + elapsed * rankFraction(h.rank),
  }));
}

export function DuckEditor({ data: rawData, onChange }: DuckEditorProps) {
  const data = normalizeDuckData(rawData);

  // Bank elapsed time at the *current* rates, apply the change, then restart
  // the clock from now. Running every mutation through here keeps totals exact
  // no matter how often the standings are edited.
  const repaint = (mutate: (holders: DuckHolder[]) => DuckHolder[]) => {
    const banked = bankAll(data, Date.now());
    const next = mutate(banked.map((h) => ({ ...h })));
    const anyRanked = next.some((h) => h.rank !== null);
    onChange({
      holders: next,
      heldSince: anyRanked ? new Date().toISOString() : null,
    });
  };

  const setRank = (id: string, rank: number | null) =>
    repaint((hs) => hs.map((h) => (h.id === id ? { ...h, rank } : h)));

  const setName = (id: string, initials: string) =>
    repaint((hs) => hs.map((h) => (h.id === id ? { ...h, initials } : h)));

  const setSeconds = (id: string, seconds: number) =>
    repaint((hs) =>
      hs.map((h) =>
        h.id === id
          ? { ...h, accumulatedSeconds: Math.max(0, Math.round(seconds)) }
          : h,
      ),
    );

  const addHolder = () =>
    repaint((hs) => [
      ...hs,
      { id: newHolderId(), initials: "", accumulatedSeconds: 0, rank: null },
    ]);

  const removeHolder = (id: string) => {
    if (!confirm("Remove this participant?")) return;
    repaint((hs) => hs.filter((h) => h.id !== id));
  };

  const clearStandings = () => {
    if (!confirm("Clear everyone's rank? Banked hours are kept; the clock stops."))
      return;
    repaint((hs) => hs.map((h) => ({ ...h, rank: null })));
  };

  const anyRanked = data.holders.some((h) => h.rank !== null);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Ceramic Duck Hours
          </h2>
          <p className="text-sm text-neutral-600">
            {data.holders.length} participant
            {data.holders.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearStandings}
            disabled={!anyRanked}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear standings
          </button>
          <button
            type="button"
            onClick={addHolder}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            + Participant
          </button>
        </div>
      </div>

      <p className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
        After a quiz, set each person's <strong>rank</strong> (1 = holds the
        duck). Rank 1 earns the full rate, 2nd earns ½×, 3rd ⅓×, and so on. Leave
        the rank blank to bench someone. Changing ranks banks the time earned so
        far and restarts the clock at the new rates.
      </p>

      {data.holders.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500">
          No participants yet. Use “+ Participant” to add the first entry.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.holders.map((h) => {
            const hours = Math.floor(h.accumulatedSeconds / 3600);
            const minutes = Math.floor((h.accumulatedSeconds % 3600) / 60);
            const isHolding = h.rank === 1;
            return (
              <li
                key={h.id}
                className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${
                  isHolding
                    ? "border-amber-400 bg-amber-50"
                    : "border-neutral-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={h.rank ?? ""}
                    placeholder="—"
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setRank(h.id, Number.isNaN(n) || n < 1 ? null : n);
                    }}
                    className="w-14 rounded-md border border-neutral-300 bg-white px-2 py-1 text-center text-sm tabular-nums focus:border-neutral-500 focus:outline-none"
                    title="Rank (1 = holds the duck)"
                  />
                  <span className="w-12 text-xs text-neutral-500">
                    {h.rank ? fractionLabel(h.rank) : "bench"}
                  </span>
                </div>

                <input
                  type="text"
                  value={h.initials}
                  placeholder="Name"
                  maxLength={32}
                  onChange={(e) => setName(h.id, e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm font-medium text-neutral-900 focus:border-neutral-500 focus:outline-none"
                />

                {isHolding && <span className="text-lg">🦆</span>}

                <div className="ml-auto flex items-center gap-1 text-sm text-neutral-700">
                  <input
                    type="number"
                    min={0}
                    value={hours}
                    onChange={(e) =>
                      setSeconds(
                        h.id,
                        (Number(e.target.value) || 0) * 3600 + minutes * 60,
                      )
                    }
                    className="w-16 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right tabular-nums focus:border-neutral-500 focus:outline-none"
                  />
                  <span>h</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(e) =>
                      setSeconds(
                        h.id,
                        hours * 3600 + (Number(e.target.value) || 0) * 60,
                      )
                    }
                    className="w-16 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right tabular-nums focus:border-neutral-500 focus:outline-none"
                  />
                  <span>m</span>
                </div>

                <button
                  type="button"
                  onClick={() => removeHolder(h.id)}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {anyRanked && (
        <p className="mt-4 text-xs text-neutral-500">
          The clock is running. Remember to <strong>Save to repo</strong> so
          everyone sees the standings. The current holder is whoever is ranked{" "}
          {ordinal(1)}.
        </p>
      )}
    </main>
  );
}
