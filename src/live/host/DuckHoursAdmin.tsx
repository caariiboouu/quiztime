import { useState } from "react";
import type { DuckHoursData } from "../../types";
import { DuckEditor } from "../../components/admin/DuckEditor";
import { saveDuckStandings, undoDuckStandings } from "../api";
import { Banner } from "../components";
import { duckCanUndo, duckDataIsLive, refreshDuckData, setDuckData, useDuckData } from "../duckStore";

/**
 * For the host: edit the Ceramic Duck Hours standings (the same editor the
 * admin panel used), saved straight to the quiz server, so the Duck Hours
 * page and every crown update at once. Behind the host password.
 */
export function DuckHoursAdmin({ password }: { password: string }) {
  const live = useDuckData();
  const [draft, setDraft] = useState<DuckHoursData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const data = draft ?? live;
  const dirty = draft !== null;
  // Not on the server yet: the first save puts the site's copy there.
  const seeding = !duckDataIsLive();

  const undo = async () => {
    if (!confirm("Put back the Duck Hours standings from before the last change?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await undoDuckStandings(password);
      setDuckData(res.data);
      setDraft(null);
      await refreshDuckData();
      setMessage({ kind: "info", text: "Done: the standings are back to how they were before the last change." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await saveDuckStandings(password, data);
      setDuckData(res.data);
      setDraft(null);
      await refreshDuckData();
      setMessage({ kind: "info", text: "Saved. The Duck Hours page shows it now." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold">🦆 Ceramic Duck Hours standings</summary>
      <p className="mt-2 text-sm text-neutral-600">
        A finished live quiz updates the ranks for you (from its final page). Edit them here
        any time; saving updates the Duck Hours page straight away.
      </p>
      {seeding && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          These are the standings bundled with the site; they aren't on the quiz server yet.
          Save once to move them there.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || (!dirty && !seeding)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : seeding && !dirty ? "Move them to the server" : "Save standings"}
        </button>
        {dirty && (
          <button type="button" onClick={() => setDraft(null)} className="text-sm text-neutral-600 underline">
            Discard changes
          </button>
        )}
        {dirty && <span className="text-sm font-semibold text-amber-700">Unsaved changes</span>}
        {!dirty && duckCanUndo() && (
          <button
            type="button"
            onClick={() => void undo()}
            disabled={busy}
            title="e.g. a test game was applied by mistake"
            className="text-sm text-neutral-600 underline"
          >
            Undo the last change
          </button>
        )}
      </div>
      {message && (
        <div className="mt-3">
          <Banner kind={message.kind}>{message.text}</Banner>
        </div>
      )}
      <div className="-mx-4 mt-3">
        <DuckEditor data={data} onChange={setDraft} />
      </div>
    </details>
  );
}
