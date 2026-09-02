/**
 * Stale-shell detection.
 *
 * GitHub Pages serves index.html with `cache-control: max-age=600` and gives
 * us no way to set headers, so a browser that stops revalidating — a pinned
 * Safari tab, a home-screen shortcut — can keep serving a months-old shell
 * and its hashed bundle out of disk cache. The hashed filenames bust the
 * cache correctly on the wire; they do nothing for a client that never asks.
 *
 * So the running app asks instead: it compares the build it was compiled from
 * against an unhashed version.json fetched with `no-store`, and reloads
 * through a cache-missing URL when the two diverge.
 */

/** Injected by the `define` block in vite.config.ts. */
declare const __BUILD_ID__: string;

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

/** Query param used to force a fresh index.html on the recovery reload. */
const BUST_PARAM = "v";

/** Remembers which build we already reloaded for, so we cannot loop. */
const RELOAD_MARK = "quiztime.reloadAttemptedFor";

const POLL_MS = 30 * 60 * 1000;

export const CURRENT_BUILD_ID = __BUILD_ID__;

async function fetchLatestBuildId(): Promise<string | null> {
  try {
    // The `no-store` covers well-behaved caches; the query param covers the
    // ones that ignore it.
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const id = (body as { buildId?: unknown })?.buildId;
    return typeof id === "string" ? id : null;
  } catch {
    // Offline, or the dev server has no version.json. Nothing to do.
    return null;
  }
}

function alreadyTried(buildId: string): boolean {
  try {
    return sessionStorage.getItem(RELOAD_MARK) === buildId;
  } catch {
    // No sessionStorage means no loop guard, so decline to auto-reload.
    return true;
  }
}

function markTried(buildId: string) {
  try {
    sessionStorage.setItem(RELOAD_MARK, buildId);
  } catch {
    // ignore
  }
}

/**
 * Reload via a URL the browser has no cache entry for. A plain reload() can
 * be answered from disk cache by the very shell we are trying to escape.
 */
function reloadFresh(buildId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(BUST_PARAM, buildId);
  window.location.replace(url.toString());
}

/** Drops the recovery param once it has done its job, to keep URLs clean. */
function stripBustParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(BUST_PARAM)) return;
  url.searchParams.delete(BUST_PARAM);
  window.history.replaceState(null, "", url.toString());
}

/**
 * Starts watching for a newer build: on load, whenever the tab is brought
 * back to the foreground, and every half hour. `onStale` fires only when an
 * automatic reload has already been tried and did not take, so the user can
 * be asked to reload by hand.
 *
 * Returns a teardown function.
 */
export function watchForNewBuild(onStale: (buildId: string) => void): () => void {
  stripBustParam();

  let stopped = false;

  const check = async () => {
    if (stopped) return;
    const latest = await fetchLatestBuildId();
    if (stopped || latest === null || latest === CURRENT_BUILD_ID) return;

    if (alreadyTried(latest)) {
      onStale(latest);
      return;
    }
    markTried(latest);
    reloadFresh(latest);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void check();
  };

  void check();
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(() => void check(), POLL_MS);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
