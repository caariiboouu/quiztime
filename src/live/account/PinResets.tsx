import { useState } from "react";
import type { Account } from "../../../shared/protocol";
import { ApiError, listAccounts, resetAccountPin } from "../api";
import { Banner } from "../components";

/**
 * For the host: reset a player's forgotten PIN (with the host password).
 * Their devices are signed out and the next PIN they type becomes the new one.
 */
export function PinResets({ password }: { password: string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    listAccounts().then(
      (r) => setAccounts(r.accounts),
      (err: Error) => setMessage({ kind: "error", text: err.message }),
    );

  const reset = async (a: Account) => {
    if (!password) {
      setMessage({ kind: "error", text: "Type the host password above first." });
      return;
    }
    setBusy(a.id);
    setMessage(null);
    try {
      await resetAccountPin(a.id, password);
      setMessage({ kind: "info", text: `${a.name}'s PIN is reset. They choose a new one next time they join.` });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Couldn't reset it." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <details
      className="rounded-xl border border-neutral-200 bg-white p-4"
      onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && !accounts && void load()}
    >
      <summary className="cursor-pointer font-semibold">Forgotten PINs</summary>
      <p className="mt-2 text-sm text-neutral-600">
        Reset someone's PIN and they'll choose a new one the next time they join.
      </p>
      {message && (
        <div className="mt-2">
          <Banner kind={message.kind}>{message.text}</Banner>
        </div>
      )}
      {accounts && accounts.length === 0 && <p className="mt-2 text-sm text-neutral-500">No players yet.</p>}
      {accounts && accounts.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="font-medium">
                {a.name}
                {a.needsPin && <span className="ml-2 text-xs text-neutral-500">(waiting for a new PIN)</span>}
              </span>
              <button
                type="button"
                disabled={busy !== null || a.needsPin}
                onClick={() => void reset(a)}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40"
              >
                {busy === a.id ? "Resetting…" : "Reset PIN"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
