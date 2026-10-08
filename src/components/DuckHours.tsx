import { useEffect, useMemo, useState } from "react";
import { NavBar } from "./NavBar";
import { useDuckData, useDuckLeader } from "../live/duckStore";
import { liveSeconds } from "../../shared/duckStandings";
import { lookSeedFor } from "../../shared/outfit";
import type { Account } from "../../shared/protocol";
import { listAccounts, liveConfigured } from "../live/api";
import { ClaimPanel, PinOptions } from "../live/account/HolderAccount";
import { recentlyRequested as askedToday, sendKeeperRequest } from "../live/account/keeperRequests";
import { DuckAvatar } from "../live/mascot/DuckAvatar";
import { lookForIndex } from "../live/mascot/variants";
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

export function DuckHours({ onExit }: DuckHoursProps) {
  // The live standings from the quiz server (the bundled copy until they load).
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

  // Self-serve name change: email the keeper a request (no server / token).
  const [showForm, setShowForm] = useState(false);
  const [selId, setSelId] = useState("");
  const [newName, setNewName] = useState("");

  const selHolder = data.holders.find((h) => h.id === selId);
  const trimmedName = newName.replace(/\s+/g, " ").trim();
  const recentlyRequested = !!selId && askedToday("Rename", selId, now);
  const canSend =
    !!selId &&
    trimmedName.length > 0 &&
    trimmedName !== selHolder?.initials &&
    !recentlyRequested;

  const sendRequest = () => {
    if (!canSend) return;
    sendKeeperRequest("Rename", selId, "Ceramic Duck — name change request", [
      "Please update my Ceramic Duck leaderboard entry.",
      "",
      `Current name: ${selHolder?.initials || "(blank)"}`,
      `Requested new name: ${trimmedName}`,
      `Entry ID: ${selId}`,
      `Requested at: ${new Date(now).toISOString()}`,
    ]);
  };

  // Who's claimed their entry (with a PIN), and each person's own duck.
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
  const leader = useDuckLeader();
  // The entry whose claim / PIN panel is open.
  const [open, setOpen] = useState<{ id: string; mode: "claim" | "pin" } | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <NavBar title="Ceramic Duck Hours" onBack={onExit} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
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
            🔒 {claimed} is yours. This device remembers you; on another device, pick yourself
            and type your PIN when you join a live quiz.
          </p>
        )}
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
              const account = byHolder.get(holder.id);
              // Their own duck, plain (the leader wears the crown); the same
              // duck they play as in the live quiz.
              const look = lookForIndex(account?.lookSeed ?? lookSeedFor(holder.id));
              const panel = open?.id === holder.id ? open.mode : null;
              return (
                <li
                  key={holder.id}
                  className={`rounded-xl border p-4 shadow-sm ${
                    isHolding
                      ? "border-amber-400 bg-amber-50"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="w-6 text-center text-lg font-semibold tabular-nums text-neutral-400 sm:w-8">
                      {index + 1}
                    </span>
                    <DuckAvatar
                      look={look}
                      bare
                      crowned={holder.id === leader}
                      size={48}
                      label={`${holder.initials || "This entry"}'s duck`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 break-words text-xl font-bold leading-tight tracking-wide text-neutral-900">
                          {holder.initials || "—"}
                        </span>
                        {isHolding && <span className="text-xl">🦆</span>}
                      </span>
                      {accounts && (
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
                          {account ? (
                            <>
                              <span className="text-neutral-500">🔒 Claimed</span>
                              <button
                                type="button"
                                onClick={() => setOpen(panel === "pin" ? null : { id: holder.id, mode: "pin" })}
                                className="font-medium text-amber-700 underline"
                              >
                                PIN options
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpen(panel === "claim" ? null : { id: holder.id, mode: "claim" })}
                              className="font-semibold text-amber-700 underline"
                            >
                              This is me: claim it
                            </button>
                          )}
                        </span>
                      )}
                    </span>
                    {isRanked ? (
                      <span
                        className={`hidden whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${
                          isHolding
                            ? "bg-amber-200 text-amber-900"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {isHolding ? "holding" : ordinal(holder.rank!)} ·{" "}
                        {fractionLabel(holder.rank)}
                      </span>
                    ) : (
                      <span className="hidden whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-400 sm:inline">
                        benched
                      </span>
                    )}
                    <span
                      className={`text-right text-lg font-semibold tabular-nums sm:w-36 sm:text-xl ${
                        isHolding ? "text-amber-900" : "text-neutral-700"
                      }`}
                    >
                      {formatDuration(total, isRanked && anyRunning)}
                    </span>
                  </div>
                  {panel && (
                    <div className="mt-4 border-t border-neutral-200 pt-4">
                      {panel === "claim" ? (
                        <ClaimPanel
                          holder={holder}
                          onCancel={() => setOpen(null)}
                          onDone={() => {
                            setOpen(null);
                            setClaimed(holder.initials);
                            void loadAccounts();
                          }}
                        />
                      ) : (
                        account && <PinOptions holder={holder} account={account} onClose={() => setOpen(null)} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {data.holders.length > 0 && (
          <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-600">
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className="font-medium text-amber-700 underline hover:text-amber-800"
              >
                Request a name change
              </button>
            </p>
            {showForm && (
              <>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block text-neutral-700">
                      Your entry
                    </span>
                    <select
                      value={selId}
                      onChange={(e) => setSelId(e.target.value)}
                      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                    >
                      <option value="">Select…</option>
                      {data.holders.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.initials || "—"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block text-neutral-700">New name</span>
                    <input
                      type="text"
                      maxLength={32}
                      value={newName}
                      placeholder="What it should say"
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={sendRequest}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send request
                  </button>
                </div>
                {recentlyRequested && (
                  <p className="mt-2 text-sm text-amber-700">
                    You already requested a change for this entry today.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
