import { useEffect, useRef, useState } from "react";
import type { Account } from "../../../shared/protocol";
import type { DuckOutfit } from "../../../shared/outfit";
import { ApiError, loadSessions, loginAccount, saveSession, setAccountOutfit } from "../api";
import { Banner } from "../components";
import { ClaimPanel, PinOptions } from "../account/HolderAccount";
import { OutfitPicker } from "../account/OutfitPicker";
import { PinStep } from "../account/WhoAreYou";
import { recentlyRequested, sendKeeperRequest } from "../account/keeperRequests";
import { Mascot } from "../mascot/Mascot";
import { lookFor, type DuckLook } from "../mascot/variants";

type Tab = "claim" | "duck" | "pin" | "name";

/**
 * Everything you can do with an entry on the Ceramic Duck Hours board, in a
 * window: claim it, dress its duck, change or reset the PIN, ask for a new
 * name.
 */
export function EntryModal({
  holder,
  place,
  total,
  rate,
  crowned,
  account,
  baseLook,
  onClose,
  onClaimed,
  onAccount,
}: {
  holder: { id: string; initials: string };
  place: number;
  total: string;
  rate: string;
  crowned: boolean;
  account: Account | null;
  /** Their duck before attire. */
  baseLook: DuckLook;
  onClose: () => void;
  onClaimed: () => void;
  /** Their account changed (e.g. new attire). */
  onAccount: (a: Account) => void;
}) {
  const [picked, setTab] = useState<Tab>(account ? "duck" : "claim");
  // Just claimed it: on to dressing the duck.
  const tab: Tab = account && picked === "claim" ? "duck" : picked;
  const panel = useRef<HTMLDivElement>(null);

  // Esc closes; focus starts inside the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs: [Tab, string][] = account
    ? [
        ["duck", "My duck"],
        ["pin", "PIN"],
        ["name", "Name"],
      ]
    : [
        ["claim", "This is me"],
        ["name", "Name"],
      ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={holder.initials || "Entry"}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl focus:outline-none sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-400">#{place}</p>
            <h2 className="text-2xl font-black leading-tight">
              {holder.initials || "—"} {crowned && "👑"}
            </h2>
            <p className="text-sm text-neutral-600">
              <span className="font-mono">{total}</span> · {rate}
              {account && " · 🔒 claimed"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-neutral-500 hover:bg-neutral-100" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-4 flex gap-2" role="tablist">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                tab === t ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {tab === "claim" && !account && (
            <ClaimPanel
              holder={holder}
              onCancel={onClose}
              onDone={() => {
                onClaimed();
              }}
            />
          )}
          {tab === "duck" && account && (
            <DressDuck account={account} baseLook={baseLook} crowned={crowned} onAccount={onAccount} />
          )}
          {tab === "pin" && account && <PinOptions holder={holder} account={account} onClose={onClose} />}
          {tab === "name" && <NameRequest holder={holder} />}
        </div>
      </div>
    </div>
  );
}

/** Pick a hat and neckpiece (this device must be signed in as them: else the PIN). */
function DressDuck({
  account,
  baseLook,
  crowned,
  onAccount,
}: {
  account: Account;
  baseLook: DuckLook;
  crowned: boolean;
  onAccount: (a: Account) => void;
}) {
  const [token, setToken] = useState<string | null>(() => loadSessions()[account.id]?.token ?? null);
  const [error, setError] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<DuckOutfit | null>(account.outfit);
  const look = lookFor(account.lookSeed, outfit);

  if (!token) {
    return (
      <PinStep
        title="Dress your duck"
        prompt={`Enter ${account.name}'s PIN first.`}
        onPin={async (pin) => {
          const s = await loginAccount(account.id, pin);
          saveSession(s);
          setToken(s.token);
        }}
      />
    );
  }
  const save = async (next: DuckOutfit) => {
    setOutfit(next);
    setError(null);
    try {
      onAccount(await setAccountOutfit(account.id, token, next));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setToken(null);
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <Mascot animation="dance" look={outfit ? look : baseLook} crowned={crowned} size={150} />
      </div>
      <OutfitPicker hat={look.hat} neckpiece={look.neckpiece} crowned={crowned} onChange={(o) => void save(o)} />
      <p className="text-xs text-neutral-500">Saved as you pick, for the board and every game.</p>
      {error && <Banner kind="error">{error}</Banner>}
    </div>
  );
}

/** Ask the keeper for a new name (they approve it by hand). */
function NameRequest({ holder }: { holder: { id: string; initials: string } }) {
  const [name, setName] = useState("");
  const clean = name.replace(/\s+/g, " ").trim();
  const asked = recentlyRequested("Rename", holder.id);
  const canSend = clean.length > 0 && clean !== holder.initials && !asked;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        sendKeeperRequest("Rename", holder.id, "Ceramic Duck — name change request", [
          "Please update my Ceramic Duck leaderboard entry.",
          "",
          `Current name: ${holder.initials || "(blank)"}`,
          `Requested new name: ${clean}`,
          `Entry ID: ${holder.id}`,
          `Requested at: ${new Date().toISOString()}`,
        ]);
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">New name</span>
        <input
          maxLength={32}
          value={name}
          placeholder="What it should say"
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2.5"
        />
      </label>
      <button
        type="submit"
        disabled={!canSend}
        className="w-full rounded-xl bg-neutral-900 py-3 font-semibold text-white disabled:opacity-40"
      >
        Email the request
      </button>
      <p className="text-xs text-neutral-500">The board's keeper approves name changes by hand.</p>
      {asked && <p className="text-sm text-amber-700">You already asked for a change for this entry today.</p>}
    </form>
  );
}
