import { useState } from "react";
import type { BonusAward, DuckHolder, DuckHoursData } from "../../types";
import {
  formatDuration,
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

  const bonusLog = data.bonusLog ?? [];

  const commit = (holders: DuckHolder[], newAwards?: BonusAward[]) => {
    const anyRanked = holders.some((h) => h.rank !== null);
    onChange({
      holders,
      heldSince: anyRanked ? new Date().toISOString() : null,
      bonusLog: newAwards ? [...bonusLog, ...newAwards] : bonusLog,
    });
  };

  // Bank elapsed time at the *current* rates, apply the change, then restart
  // the clock from now. Running every mutation through here keeps totals exact
  // no matter how often the standings are edited.
  const repaint = (mutate: (holders: DuckHolder[]) => DuckHolder[]) => {
    const banked = bankAll(data, Date.now());
    commit(mutate(banked.map((h) => ({ ...h }))));
  };

  const awardBonus = (id: string, seconds: number, reason: string) => {
    if (seconds <= 0) return;
    const banked = bankAll(data, Date.now()).map((h) => ({ ...h }));
    const target = banked.find((h) => h.id === id);
    if (!target) return;
    target.accumulatedSeconds += seconds;
    commit(banked, [
      {
        at: new Date().toISOString(),
        holderId: id,
        seconds,
        ...(reason ? { reason } : {}),
      },
    ]);
  };

  const clearBonusLog = () => {
    if (
      !confirm(
        "Clear the bonus log? Awarded hours stay in the totals; only the history is removed.",
      )
    )
      return;
    onChange({
      holders: data.holders,
      heldSince: data.heldSince,
      bonusLog: [],
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

                <BonusControl
                  onAward={(seconds, reason) =>
                    awardBonus(h.id, seconds, reason)
                  }
                />

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

      {bonusLog.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700">
              Bonus log ({bonusLog.length})
            </h3>
            <button
              type="button"
              onClick={clearBonusLog}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Clear log
            </button>
          </div>
          <ul className="space-y-1 text-sm">
            {[...bonusLog].reverse().map((b, i) => {
              const who =
                data.holders.find((h) => h.id === b.holderId)?.initials ||
                "(removed)";
              return (
                <li
                  key={`${b.at}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-3 rounded-md border border-neutral-200 bg-white px-3 py-1.5"
                >
                  <span className="tabular-nums text-neutral-400">
                    {b.at.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="font-medium text-neutral-800">{who}</span>
                  <span className="tabular-nums font-semibold text-emerald-700">
                    +{formatDuration(b.seconds)}
                  </span>
                  {b.reason && (
                    <span className="text-neutral-500">— {b.reason}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
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

/** Per-row control to add bonus duck-hours on top of a participant's total. */
function BonusControl({
  onAward,
}: {
  onAward: (seconds: number, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const [reason, setReason] = useState("");
  const seconds = (Number(h) || 0) * 3600 + (Number(m) || 0) * 60;

  const reset = () => {
    setH("");
    setM("");
    setReason("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
      >
        + Bonus
      </button>
    );
  }

  return (
    <div className="mt-2 flex basis-full flex-wrap items-center gap-2 border-t border-neutral-200 pt-2">
      <span className="text-xs font-medium text-neutral-600">Award bonus:</span>
      <input
        type="number"
        min={0}
        value={h}
        placeholder="0"
        onChange={(e) => setH(e.target.value)}
        className="w-14 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-neutral-500 focus:outline-none"
      />
      <span className="text-sm text-neutral-700">h</span>
      <input
        type="number"
        min={0}
        max={59}
        value={m}
        placeholder="0"
        onChange={(e) => setM(e.target.value)}
        className="w-14 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-neutral-500 focus:outline-none"
      />
      <span className="text-sm text-neutral-700">m</span>
      <input
        type="text"
        maxLength={60}
        value={reason}
        placeholder="reason (optional)"
        onChange={(e) => setReason(e.target.value)}
        className="min-w-[8rem] flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-500 focus:outline-none"
      />
      <button
        type="button"
        disabled={seconds <= 0}
        onClick={() => {
          onAward(seconds, reason.trim());
          reset();
        }}
        className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
      >
        Cancel
      </button>
    </div>
  );
}
