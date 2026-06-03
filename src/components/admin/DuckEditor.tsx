import type { DuckHolder, DuckHoursData } from "../../types";

type DuckEditorProps = {
  data: DuckHoursData;
  onChange: (data: DuckHoursData) => void;
};

function newHolderId(): string {
  return `duck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Seconds the current holder has accrued since picking up the duck. */
function pendingElapsed(data: DuckHoursData): number {
  if (!data.currentHolderId || !data.heldSince) return 0;
  const since = Date.parse(data.heldSince);
  if (Number.isNaN(since)) return 0;
  return Math.max(0, (Date.now() - since) / 1000);
}

/** Bank the current holder's live elapsed time back into their total. */
function bankCurrent(data: DuckHoursData): DuckHolder[] {
  const elapsed = pendingElapsed(data);
  if (!elapsed) return data.holders;
  return data.holders.map((h) =>
    h.id === data.currentHolderId
      ? { ...h, accumulatedSeconds: h.accumulatedSeconds + elapsed }
      : h,
  );
}

export function DuckEditor({ data, onChange }: DuckEditorProps) {
  const setHolder = (id: string | null) => {
    if (id === data.currentHolderId) return;
    onChange({
      holders: bankCurrent(data),
      currentHolderId: id,
      heldSince: id ? new Date().toISOString() : null,
    });
  };

  const addHolder = () => {
    onChange({
      ...data,
      holders: [
        ...data.holders,
        { id: newHolderId(), initials: "", accumulatedSeconds: 0 },
      ],
    });
  };

  const removeHolder = (id: string) => {
    if (!confirm("Remove this holder?")) return;
    onChange({
      holders: data.holders.filter((h) => h.id !== id),
      currentHolderId: data.currentHolderId === id ? null : data.currentHolderId,
      heldSince: data.currentHolderId === id ? null : data.heldSince,
    });
  };

  const updateInitials = (id: string, initials: string) => {
    onChange({
      ...data,
      holders: data.holders.map((h) => (h.id === id ? { ...h, initials } : h)),
    });
  };

  // Editing a holder's total sets it exactly "as of now"; for the current
  // holder we also reset heldSince so the live clock continues from the edit.
  const updateSeconds = (id: string, seconds: number) => {
    const safe = Math.max(0, Math.round(seconds));
    const isCurrent = id === data.currentHolderId;
    onChange({
      holders: data.holders.map((h) =>
        h.id === id ? { ...h, accumulatedSeconds: safe } : h,
      ),
      currentHolderId: data.currentHolderId,
      heldSince: isCurrent ? new Date().toISOString() : data.heldSince,
    });
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Ceramic Duck Hours
          </h2>
          <p className="text-sm text-neutral-600">
            {data.holders.length} holder{data.holders.length === 1 ? "" : "s"} ·
            select who's holding the duck to start their clock
          </p>
        </div>
        <button
          type="button"
          onClick={addHolder}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          + Holder
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-sm font-medium text-neutral-700">
          Who is holding the duck?
        </span>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="radio"
            name="duck-holder"
            checked={data.currentHolderId === null}
            onChange={() => setHolder(null)}
          />
          Nobody right now
        </label>
      </div>

      {data.holders.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500">
          No holders yet. Use “+ Holder” to add the first entry.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.holders.map((h) => {
            const hours = Math.floor(h.accumulatedSeconds / 3600);
            const minutes = Math.floor((h.accumulatedSeconds % 3600) / 60);
            const isCurrent = h.id === data.currentHolderId;
            return (
              <li
                key={h.id}
                className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${
                  isCurrent
                    ? "border-amber-400 bg-amber-50"
                    : "border-neutral-200 bg-white"
                }`}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                  <input
                    type="radio"
                    name="duck-holder"
                    checked={isCurrent}
                    onChange={() => setHolder(h.id)}
                  />
                  Holding {isCurrent && <span>🦆</span>}
                </label>

                <input
                  type="text"
                  value={h.initials}
                  placeholder="Initials"
                  maxLength={4}
                  onChange={(e) =>
                    updateInitials(h.id, e.target.value.toUpperCase())
                  }
                  className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm font-semibold uppercase tracking-wide text-neutral-900 focus:border-neutral-500 focus:outline-none"
                />

                <div className="ml-auto flex items-center gap-1 text-sm text-neutral-700">
                  <input
                    type="number"
                    min={0}
                    value={hours}
                    onChange={(e) =>
                      updateSeconds(
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
                      updateSeconds(
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

      {data.currentHolderId !== null && (
        <p className="mt-4 text-xs text-neutral-500">
          The current holder’s clock is running. Switching the holder banks their
          elapsed time automatically. Remember to <strong>Save to repo</strong> so
          everyone sees the change.
        </p>
      )}
    </main>
  );
}
