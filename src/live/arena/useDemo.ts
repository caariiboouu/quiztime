import { useCallback, useEffect, useRef, useState } from "react";
import type { ArenaMove } from "../../../shared/arenaSim";
import type { DemoClientMessage, DemoServerMessage, DemoState } from "../../../shared/demo";
import { API_BASE, liveConfigured } from "../api";
import type { ArenaFeed } from "../useRoom";

export type DemoStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  /** Couldn't reach the server: practise offline instead. */
  | "offline"
  | "full";

/**
 * Join the shared practice arena on the Worker: you get a duck as soon as
 * you connect, called `name` if given (otherwise a random duck name). If the
 * server can't be reached at all, status goes "offline" so the page can fall
 * back to the local practice arena.
 */
export function useDemo(name?: string) {
  const [status, setStatus] = useState<DemoStatus>(liveConfigured ? "connecting" : "offline");
  const [state, setState] = useState<DemoState | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const roundRef = useRef(0);
  // Positions arrive ~10×/s; kept out of React state.
  const feed = useRef<ArenaFeed>({ segmentId: null, snaps: [] });

  useEffect(() => {
    if (!liveConfigured) return;
    let stopped = false;
    let everOpened = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const q = name ? `?name=${encodeURIComponent(name)}` : "";
      const ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/api/demo/ws${q}`);
      wsRef.current = ws;
      ws.onopen = () => {
        everOpened = true;
        attempt = 0;
        setStatus("open");
      };
      ws.onmessage = (ev) => {
        let msg: DemoServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === "arena") {
          const f = feed.current;
          if (f.segmentId !== msg.segmentId) {
            f.segmentId = msg.segmentId;
            f.snaps = [];
          }
          f.snaps.push({ at: performance.now(), ducks: new Map(msg.ducks.map((d) => [d[0], d])) });
          if (f.snaps.length > 4) f.snaps.shift();
        } else if (msg.t === "demo") {
          roundRef.current = msg.round;
          setOffsetMs(msg.serverNow - Date.now());
          setState(msg);
        } else if (msg.t === "full") {
          stopped = true;
          setStatus("full");
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        // Never got through at all: practise offline rather than spin.
        if (!everOpened && attempt >= 1) {
          setStatus("offline");
          return;
        }
        attempt++;
        setStatus(everOpened ? "reconnecting" : "connecting");
        retry = setTimeout(connect, Math.min(8000, 600 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [name]);

  const move = useCallback((m: ArenaMove) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ t: "move", round: roundRef.current, move: m } satisfies DemoClientMessage));
  }, []);

  return { status, state, offsetMs, feed, move };
}
