import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { NavBar } from "./NavBar";
import { useDuckData, useDuckLeader } from "../live/duckStore";
import { liveSeconds } from "../../shared/duckStandings";
import { lookSeedFor } from "../../shared/outfit";
import type { Account } from "../../shared/protocol";
import { lastAccountId, listAccounts, liveConfigured, loadSessions } from "../live/api";
import { EntryModal } from "../live/duckboard/EntryModal";
import type { BoardEntry } from "../live/duckboard/DuckBoardScene";
import { lookFor, lookForIndex } from "../live/mascot/variants";
import { hasWebGL } from "../live/minigames/three/fallbackContext";

const DuckBoardScene = lazy(() => import("../live/duckboard/DuckBoardScene"));
const ShelfBoard = lazy(() => import("../live/duckboard/ShelfBoard"));

/** Shelves (side-on, the default) or the garden (from above); remembered per device. */
type BoardView = "shelves" | "garden";
const VIEW_KEY = "quiztime.duckHours.view";
function savedView(): BoardView {
  try {
    return localStorage.getItem(VIEW_KEY) === "garden" ? "garden" : "shelves";
  } catch {
    return "shelves";
  }
}

export const DUCK_OVERRIDE_KEY = "quiztime.duckHours.override";

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

function rateText(rank: number | null): string {
  if (rank === 1) return "holds the duck";
  return rank ? `${ordinal(rank)} · ${fractionLabel(rank)} rate` : "benched";
}

/**
 * The Ceramic Duck Hours leaderboard, in 3D: everyone's own duck on their
 * tile in standings order, wearing their latest attire (the leader crowned).
 * Tap a duck to claim the entry, dress the duck, change the PIN or ask for a
 * name change.
 */
export function DuckHours({ onExit }: DuckHoursProps) {
  const data = useDuckData();

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
  const leader = useDuckLeader();

  // Who's claimed their entry, and each person's duck and attire.
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const loadAccounts = () =>
    listAccounts().then(
      (r) => setAccounts(r.accounts),
      () => setAccounts(null),
    );
  useEffect(() => {
    if (liveConfigured) void loadAccounts();
  }, []);
  const byHolder = useMemo(
    () => new Map((accounts ?? []).filter((a) => a.holderId).map((a) => [a.holderId!, a])),
    [accounts],
  );
  // The entry this device is signed in as (its duck answers to the keys).
  const meId = useMemo(() => {
    const sessions = loadSessions();
    const mine = (accounts ?? []).filter((a) => a.holderId && sessions[a.id]);
    const last = lastAccountId();
    return (mine.find((a) => a.id === last) ?? mine[0])?.holderId ?? null;
  }, [accounts]);

  const [selected, setSelected] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);

  const entries: BoardEntry[] = ranked.map((h, i) => {
    const account = byHolder.get(h.id);
    return {
      id: h.id,
      name: h.initials || "—",
      look: lookFor(account?.lookSeed ?? lookSeedFor(h.id), account?.outfit ?? null),
      bare: !account?.outfit,
      crowned: h.id === leader,
      place: i + 1,
      holding: h.rank === 1,
      total: formatDuration(liveSeconds(data, h.id, now), h.rank !== null && anyRunning),
      rate: rateText(h.rank),
    };
  });
  const chosen = entries.find((e) => e.id === selected);
  const chosenHolder = data.holders.find((h) => h.id === selected);
  const webgl = useMemo(() => hasWebGL(), []);
  const [boardView, setBoardView] = useState<BoardView>(savedView);
  const pickView = (v: BoardView) => {
    setBoardView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // fine: not remembered
    }
  };

  return (
    <div className="flex h-full flex-col">
      <NavBar title="Ceramic Duck Hours" onBack={onExit} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6 sm:py-10">
        <h2 className="mb-2 text-3xl font-semibold tracking-tight text-neutral-900">
          🦆 Ceramic Duck Hours Leaderboard
        </h2>
        <p className="mb-2 text-neutral-600">
          Duck-hours accumulate for everyone in the standings. The current
          holder (1st) earns the full rate; runners-up earn a fraction — 2nd
          earns ½×, 3rd ⅓×, and so on.
        </p>
        <p className="mb-6 text-sm text-neutral-500">
          Ranked by total time, so a steady runner-up can out-earn an occasional
          winner. Since meetings land on an irregular schedule, only the most
          recent 30 days since standings last changed count toward accrual.
        </p>

        {claimed && (
          <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            🔒 {claimed} is yours. This device remembers you; on another device, pick yourself and
            type your PIN when you join a live quiz.
          </p>
        )}

        {ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
            No participants yet.
          </div>
        ) : webgl ? (
          <>
            <div className="mb-3 flex justify-end">
              <div className="inline-flex rounded-full bg-neutral-200 p-1 text-sm font-semibold" role="group" aria-label="View">
                {(
                  [
                    ["shelves", "Shelves"],
                    ["garden", "Garden"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={boardView === v}
                    onClick={() => pickView(v)}
                    className={`rounded-full px-3 py-1 ${boardView === v ? "bg-white shadow" : "text-neutral-600"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Suspense
              fallback={<p className="py-24 text-center text-neutral-500">Gathering the ducks…</p>}
            >
              {boardView === "shelves" ? (
                <ShelfBoard entries={entries} meId={meId} onSelect={setSelected} controls={!selected} />
              ) : (
                <DuckBoardScene entries={entries} meId={meId} onSelect={setSelected} controls={!selected} />
              )}
            </Suspense>
            {/* The same standings as text, for screen readers. */}
            <ol className="sr-only">
              {entries.map((e) => (
                <li key={e.id}>
                  {e.place}. {e.name}, {e.total}, {e.rate}
                  {e.crowned ? ", most duck hours" : ""}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <ol className="space-y-2">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelected(e.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                    e.holding ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white"
                  }`}
                >
                  <span className="w-6 text-center font-semibold tabular-nums text-neutral-400">{e.place}</span>
                  <span className="min-w-0 flex-1 break-words font-bold">
                    {e.name} {e.crowned && "👑"} {e.holding && "🦆"}
                  </span>
                  <span className="font-mono text-sm tabular-nums">{e.total}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {ranked.length > 0 && liveConfigured && (
          <p className="mt-4 text-center text-sm text-neutral-500">
            Tap your duck to claim it, dress it up, change your PIN or ask for a name change.
          </p>
        )}
      </main>
      {selected && chosen && chosenHolder && (
        <EntryModal
          holder={chosenHolder}
          place={chosen.place}
          total={chosen.total}
          rate={chosen.rate}
          crowned={chosen.crowned}
          account={byHolder.get(selected) ?? null}
          baseLook={lookForIndex(byHolder.get(selected)?.lookSeed ?? lookSeedFor(selected))}
          onClose={() => setSelected(null)}
          onClaimed={() => {
            setClaimed(chosenHolder.initials);
            void loadAccounts();
          }}
          onAccount={(a) => setAccounts((all) => (all ?? []).map((x) => (x.id === a.id ? a : x)))}
        />
      )}
    </div>
  );
}
