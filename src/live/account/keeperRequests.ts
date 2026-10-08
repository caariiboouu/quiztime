/**
 * Requests to whoever keeps the Ceramic Duck Hours board (name changes,
 * forgotten PINs): an email they approve by hand, at most one per entry per
 * day from this device. No server or token needed.
 */
export const REQUEST_EMAIL = "joel@cuthriell.com";
const GUARD_MS = 24 * 60 * 60 * 1000;

const key = (kind: string, holderId: string) => `quiztime.duck${kind}.${holderId}`;

/** Already asked for this today (from this device)? */
export function recentlyRequested(kind: "Rename" | "PinReset", holderId: string, now = Date.now()): boolean {
  try {
    const ts = Number(localStorage.getItem(key(kind, holderId)));
    return ts > 0 && now - ts < GUARD_MS;
  } catch {
    return false;
  }
}

/** Open an email to the keeper, and remember that we asked. */
export function sendKeeperRequest(kind: "Rename" | "PinReset", holderId: string, subject: string, lines: string[]) {
  try {
    localStorage.setItem(key(kind, holderId), String(Date.now()));
  } catch {
    // ignore
  }
  window.location.href = `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    lines.join("\n"),
  )}`;
}
