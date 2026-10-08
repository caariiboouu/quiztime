/**
 * A running answer arena: the ducks, their moves and which zone each is
 * standing in. Shared by the Worker (authoritative multiplayer) and the
 * browser (local demo), so both play by exactly the same rules.
 */
import { arenaLayout, spawnPoint, zoneAt, zoneTarget, type ArenaLayout } from "./arena";
import {
  emote,
  holdWalker,
  isMoving,
  makeWalker,
  pressWalker,
  updateFlock,
  type Dir,
  type DuckAnim,
  type Walker,
} from "./flock";

/**
 * What a player can do in the arena: press a direction (one step, with a very
 * slight boost), say which directions are held down (walk until let go),
 * quack, or head straight for an answer.
 */
export type ArenaMove = { dir: Dir } | { held: Dir[] } | { quack: true } | { zone: number };

/**
 * Held directions are a lease: clients re-send them while still held, so a
 * player whose connection drops mid-hold doesn't walk into the wall forever.
 */
export const HOLD_LEASE = 1.2;
/** How often clients should re-send held directions (seconds). */
export const HOLD_REFRESH = 0.4;

/** Compact per-duck state sent ~10×/s: [id, x, z, heading, anim, neckYaw, neckPitch, height]. */
export type ArenaDuck = [string, number, number, number, DuckAnim, number, number, number];

export type ArenaSim = {
  layout: ArenaLayout;
  walkers: Map<string, Walker>;
  /** Current zone per duck and since when (ms), for speed scoring. */
  zones: Map<string, { zone: number | null; since: number }>;
  /** Spawn slots handed out so far (late joiners get the next one). */
  spawned: number;
  expected: number;
  /** Sim clock in seconds (for emotes). */
  t: number;
  /** Ducks sent to an answer with "go to N": they keep trying until they're on it. */
  goals: Map<string, number>;
  /** When each held direction lapses (sim seconds) unless refreshed. */
  holds: Map<string, number>;
  /** Answers are in: every duck stays exactly where it is. */
  frozen: boolean;
};

export function createArenaSim(options: number, playerIds: string[], expected = playerIds.length): ArenaSim {
  const sim: ArenaSim = {
    layout: arenaLayout(options, expected),
    walkers: new Map(),
    zones: new Map(),
    spawned: 0,
    expected: Math.max(expected, playerIds.length),
    t: 0,
    goals: new Map(),
    holds: new Map(),
    frozen: false,
  };
  for (const id of playerIds) ensureDuck(sim, id);
  return sim;
}

/** Add a duck for this player if they don't have one yet (e.g. joined late). */
export function ensureDuck(sim: ArenaSim, id: string): Walker {
  let w = sim.walkers.get(id);
  if (!w) {
    const spot = spawnPoint(sim.layout, sim.spawned % sim.expected, sim.expected);
    sim.spawned++;
    w = makeWalker(id, spot.x, spot.z);
    sim.walkers.set(id, w);
    sim.zones.set(id, { zone: null, since: 0 });
  }
  return w;
}

export function removeDuck(sim: ArenaSim, id: string) {
  sim.walkers.delete(id);
  sim.zones.delete(id);
  sim.goals.delete(id);
  sim.holds.delete(id);
}

/** Deterministic −0.5…0.5 per duck and attempt, so retries pick fresh spots. */
function jitterFor(id: string, salt: number): number {
  let h = salt | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

function aimAt(sim: ArenaSim, w: Walker, zone: number) {
  const salt = Math.floor(sim.t * 7);
  const target = zoneTarget(sim.layout, zone, jitterFor(w.id, salt), jitterFor(w.id, salt + 99));
  w.tx = target.x;
  w.tz = target.z;
}

export function arenaMove(sim: ArenaSim, id: string, move: ArenaMove): boolean {
  const w = sim.walkers.get(id);
  if (!w || sim.frozen) return false;
  if ("dir" in move) {
    // Steering by hand takes over from "go to N".
    sim.goals.delete(id);
    return pressWalker(w, move.dir, sim.layout.bounds, sim.t);
  }
  if ("held" in move) {
    holdWalker(w, move.held);
    if (w.hold) {
      sim.goals.delete(id);
      sim.holds.set(id, sim.t + HOLD_LEASE);
    } else {
      sim.holds.delete(id);
    }
    return true;
  }
  if ("quack" in move) {
    emote(w, "quack", sim.t, 1.2);
    return true;
  }
  if ("zone" in move) {
    if (!Number.isInteger(move.zone) || move.zone < 0 || move.zone >= sim.layout.options) return false;
    sim.goals.set(id, move.zone);
    aimAt(sim, w, move.zone);
    return true;
  }
  return false;
}

/**
 * Advance the arena. Returns true if any duck changed zone (worth telling
 * everyone about: it changes answer counts).
 */
export function tickArena(sim: ArenaSim, dtSec: number, nowMs: number): boolean {
  sim.t += dtSec;
  if (sim.frozen) return false;
  for (const [id, until] of sim.holds) {
    if (sim.t < until) continue;
    sim.holds.delete(id);
    const w = sim.walkers.get(id);
    if (w) holdWalker(w, []);
  }
  const list = [...sim.walkers.values()];
  updateFlock(list, dtSec, sim.t, { bounds: sim.layout.bounds, radius: sim.layout.radius - 0.3 });
  let changed = false;
  for (const w of list) {
    const zone = zoneAt(sim.layout, w.x, w.z);
    // "Go to N" means "stay on N": settled (or bumped) anywhere else, head
    // back to a fresh spot in that zone. The goal lasts until the player
    // steers by hand or picks another answer.
    const goal = sim.goals.get(w.id);
    if (goal !== undefined && zone !== goal && !isMoving(w)) aimAt(sim, w, goal);
    const prev = sim.zones.get(w.id);
    if (!prev || prev.zone !== zone) {
      sim.zones.set(w.id, { zone, since: nowMs });
      changed = true;
    }
  }
  return changed;
}

/**
 * Time's up: stop every duck where it stands (mid-step, mid-bump, mid-air:
 * flyers drop straight down), forget goals and held keys, and ignore any
 * further moves. Zones don't change, so the answers stand as they were.
 */
export function freezeArena(sim: ArenaSim) {
  sim.frozen = true;
  sim.goals.clear();
  sim.holds.clear();
  for (const w of sim.walkers.values()) {
    w.tx = w.x;
    w.tz = w.z;
    w.hold = null;
    w.kx = w.kz = 0;
    w.fx = w.fz = 0;
    w.flying = false;
    w.air = 0;
    w.vy = 0;
    w.boostUntil = 0;
    w.emote = null;
    w.anim = w.rest;
  }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function arenaSnapshot(sim: ArenaSim): ArenaDuck[] {
  return [...sim.walkers.values()].map((w) => [
    w.id,
    r3(w.x),
    r3(w.z),
    r3(w.heading),
    w.anim,
    r3(w.neckYaw),
    r3(w.neckPitch),
    r3(w.air),
  ]);
}

export function isArenaMove(m: unknown): m is ArenaMove {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  const isDir = (d: unknown) => d === "up" || d === "down" || d === "left" || d === "right";
  if ("dir" in o) return isDir(o.dir);
  if ("held" in o) return Array.isArray(o.held) && o.held.length <= 4 && o.held.every(isDir);
  if ("quack" in o) return o.quack === true;
  if ("zone" in o) return typeof o.zone === "number";
  return false;
}
