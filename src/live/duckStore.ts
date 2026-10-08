/**
 * The Ceramic Duck Hours standings, as the app sees them: fetched from the
 * live-quiz server (where they're kept now), falling back to the copy bundled
 * with the site if the server can't be reached. One shared copy; anything
 * showing standings (the Duck Hours page, crowns, "Who are you?") reads it.
 */
import { useEffect, useSyncExternalStore } from "react";
import bundledDuck from "../data/duckHours.json";
import type { DuckHoursData } from "../types";
import { leaderOf, normalizeDuckData } from "../../shared/duckStandings";
import { API_BASE, liveConfigured } from "./api";

let current: DuckHoursData = normalizeDuckData(bundledDuck as DuckHoursData);
/** Who wears the crown: worked out when the standings change, and each minute (time accrues). */
let leader: string | null = leaderOf(current, Date.now());
/** True once the server's copy has arrived (false: showing the bundled one). */
let fromServer = false;
/** The server kept the standings from before the last change (host can undo). */
let undoable = false;
export const duckCanUndo = () => undoable;
let fetching: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const duckData = () => current;
const duckLeader = () => leader;

function notify() {
  listeners.forEach((fn) => fn());
}
export const duckDataIsLive = () => fromServer;

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Use these standings now (e.g. just saved them). */
export function setDuckData(data: DuckHoursData, live = true) {
  current = normalizeDuckData(data);
  fromServer = live;
  leader = leaderOf(current, Date.now());
  notify();
}

/** Fetch the latest standings from the server. */
export function refreshDuckData(): Promise<void> {
  if (!liveConfigured) return Promise.resolve();
  fetching ??= fetch(`${API_BASE}/api/duck-hours`)
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as { data: DuckHoursData; canUndo?: boolean };
      undoable = Boolean(body.canUndo);
      setDuckData(body.data);
    })
    .catch(() => undefined)
    .finally(() => {
      fetching = null;
    });
  return fetching;
}

let started = false;
/** The standings (live once loaded); re-renders when they change. */
export function useDuckData(): DuckHoursData {
  useEffect(() => {
    if (started) return;
    started = true;
    void refreshDuckData();
    // Someone can overtake the leader just by time passing.
    setInterval(() => {
      const next = leaderOf(current, Date.now());
      if (next !== leader) {
        leader = next;
        notify();
      }
    }, 60_000);
  }, []);
  return useSyncExternalStore(subscribe, duckData, duckData);
}

/** Whoever leads the standings (they wear the gold crown). */
export function useDuckLeader(): string | null {
  useDuckData();
  return useSyncExternalStore(subscribe, duckLeader, duckLeader);
}
