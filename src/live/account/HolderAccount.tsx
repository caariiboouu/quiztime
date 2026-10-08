import { useState } from "react";
import { PIN_RE, type Account } from "../../../shared/protocol";
import { ApiError, changeAccountPin, createAccount, saveSession } from "../api";
import { Banner } from "../components";
import { recentlyRequested, sendKeeperRequest } from "./keeperRequests";
import { PinField, PinStep } from "./WhoAreYou";

/**
 * "This is me": claim a Ceramic Duck Hours entry by choosing a four-digit
 * PIN (the same claim a player makes when joining a live quiz). The device
 * stays signed in as them.
 */
export function ClaimPanel({
  holder,
  onDone,
  onCancel,
}: {
  holder: { id: string; initials: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <PinStep
      title={`Claim ${holder.initials}`}
      prompt="Choose a four-digit PIN. You'll use it to be you in the live quiz, on any device."
      confirm
      onBack={onCancel}
      onPin={async (pin) => {
        saveSession(await createAccount({ name: holder.initials, holderId: holder.id, pin }));
        onDone();
      }}
    />
  );
}

/** For a claimed entry: change your PIN, or ask for a reset if it's forgotten. */
export function PinOptions({
  holder,
  account,
  onClose,
}: {
  holder: { id: string; initials: string };
  account: Account;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"change" | "forgot">("change");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const asked = recentlyRequested("PinReset", holder.id);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) {
      setMessage({ kind: "error", text: "Those new PINs don't match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      saveSession(await changeAccountPin(account.id, current, next));
      setMessage({ kind: "info", text: "Done: your PIN is changed." });
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Couldn't change it." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm" role="tablist">
        {(
          [
            ["change", "Change my PIN"],
            ["forgot", "I forgot my PIN"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 font-semibold ${
              mode === m ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={onClose} className="ml-auto text-neutral-500 underline">
          Close
        </button>
      </div>
      {mode === "change" ? (
        <form onSubmit={change} className="space-y-3">
          <PinField label="Current PIN" value={current} onChange={setCurrent} autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <PinField label="New PIN" value={next} onChange={setNext} />
            <PinField label="New PIN again" value={again} onChange={setAgain} />
          </div>
          <button
            type="submit"
            disabled={busy || !PIN_RE.test(current) || !PIN_RE.test(next) || !PIN_RE.test(again)}
            className="w-full rounded-xl bg-amber-500 py-3 font-bold text-white disabled:opacity-40"
          >
            {busy ? "Changing…" : "Change my PIN"}
          </button>
        </form>
      ) : (
        <div className="space-y-2 text-sm text-neutral-700">
          <p>
            Ask the keeper of the board to reset it. Once they have, the next PIN you type (when
            you join a live quiz) becomes your new one.
          </p>
          <button
            type="button"
            disabled={asked}
            onClick={() =>
              sendKeeperRequest("PinReset", holder.id, "Ceramic Duck — PIN reset request", [
                "Please reset the PIN for my Ceramic Duck entry.",
                "",
                `Name: ${holder.initials || "(blank)"}`,
                `Entry ID: ${holder.id}`,
                `Requested at: ${new Date().toISOString()}`,
                "",
                "(Live quiz host page → Forgotten PINs → Reset PIN.)",
              ])
            }
            className="rounded-md bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-40"
          >
            Email a reset request
          </button>
          {asked && <p className="text-amber-700">You already asked for a reset for this entry today.</p>}
        </div>
      )}
      {message && <Banner kind={message.kind}>{message.text}</Banner>}
    </div>
  );
}
