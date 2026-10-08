import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomView, ServerMessage } from "../../shared/protocol";
import { getRoomInfo, socketUrl } from "./api";
import type { ArenaDuck } from "../../shared/arenaSim";

/** Answer-arena position snapshots, newest last (local receive time in ms). */
export type ArenaFeed = {
  segmentId: string | null;
  snaps: { at: number; ducks: Map<string, ArenaDuck> }[];
};

export type RoomStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  /** The room no longer exists. */
  | "gone"
  | "kicked"
  /** The room exists but won't accept these credentials. */
  | "rejected";

type Cred = { host: string } | { token: string };

/**
 * Keeps a WebSocket to the room open (reconnecting with backoff) and exposes
 * the latest view the server sent. `offsetMs` converts local time to server
 * time, so countdowns agree across devices.
 */
export function useRoom<V extends RoomView>(code: string, cred: Cred) {
  const [view, setView] = useState<V | null>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  // Arena positions arrive ~10×/s; keep them out of React state.
  const arenaRef = useRef<ArenaFeed>({ segmentId: null, snaps: [] });
  const credKey = "host" in cred ? `h:${cred.host}` : `t:${cred.token}`;

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let everOpened = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      const ws = new WebSocket(socketUrl(code, cred));
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        everOpened = true;
        setStatus("open");
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"t":"ping"}');
        }, 25_000);
      };
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === "arena") {
          const feed = arenaRef.current;
          if (feed.segmentId !== msg.segmentId) {
            feed.segmentId = msg.segmentId;
            feed.snaps = [];
          }
          feed.snaps.push({ at: performance.now(), ducks: new Map(msg.ducks.map((d) => [d[0], d])) });
          if (feed.snaps.length > 4) feed.snaps.shift();
          return;
        }
        if (msg.t === "state") {
          setOffsetMs(msg.view.serverNow - Date.now());
          setView(msg.view as V);
        } else if (msg.t === "error") {
          setError(msg.message);
        }
      };
      ws.onclose = async (ev) => {
        clearInterval(pingTimer);
        if (stopped) return;
        if (ev.code === 4001) {
          setStatus("kicked");
          return;
        }
        attempt++;
        // After a few failures, check whether the room still exists at all.
        if (attempt >= 3) {
          try {
            await getRoomInfo(code);
            // Room is there but we've never gotten in: our seat is gone.
            if (!everOpened) {
              setStatus("rejected");
              return;
            }
          } catch (err) {
            if ((err as { status?: number }).status === 404) {
              setStatus("gone");
              return;
            }
          }
        }
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt));
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      wsRef.current?.close();
    };
    // credKey captures cred's identity; cred itself is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, credKey]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    setError("Not connected — reconnecting…");
    return false;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { view, status, error, clearError, send, offsetMs, arenaRef };
}

/** Server-time "now", re-rendering every `intervalMs`. */
export function useServerNow(offsetMs: number, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => clearInterval(id);
  }, [offsetMs, intervalMs]);
  return now;
}
