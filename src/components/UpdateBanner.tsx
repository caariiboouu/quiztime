import { useEffect, useState } from "react";
import { watchForNewBuild } from "../lib/version";

/**
 * Last-resort prompt for a browser that is holding a stale app shell and did
 * not pick up the automatic reload in `watchForNewBuild`. Renders nothing in
 * the normal case.
 */
export function UpdateBanner() {
  const [staleBuild, setStaleBuild] = useState<string | null>(null);

  useEffect(() => watchForNewBuild(setStaleBuild), []);

  if (!staleBuild) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-900 shadow-lg">
      <span>
        You’re viewing an old cached copy of this page. Reload from origin to
        get the latest standings.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50"
      >
        Reload
      </button>
      <span className="text-xs text-amber-700">
        If that doesn’t help: Safari ⌘⌥R, Chrome ⌘/Ctrl+Shift+R.
      </span>
    </div>
  );
}
