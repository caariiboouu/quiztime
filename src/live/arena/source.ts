import type { DuckAnim } from "../../../shared/flock";
import type { ArenaFeed } from "../useRoom";

/** Where a duck is and what it's doing, as the arena scene draws it. */
export type DuckState = {
  x: number;
  z: number;
  /** Height off the ground (hops and flights). */
  y: number;
  heading: number;
  anim: DuckAnim;
  neckYaw: number;
  neckPitch: number;
};

/** Anything that can say where each duck is right now (network or local sim). */
export type ArenaSource = {
  /** Called once per frame before drawing. */
  update?: (dt: number) => void;
  get: (id: string) => DuckState | undefined;
};

/** Render this far in the past so there are always two snapshots to blend. */
const INTERP_DELAY_MS = 140;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Smoothly interpolated ducks from the server's ~10 Hz arena snapshots. */
export function networkSource(feed: { current: ArenaFeed }): ArenaSource {
  let renderAt = 0;
  return {
    update: () => {
      renderAt = performance.now() - INTERP_DELAY_MS;
    },
    get: (id) => {
      const snaps = feed.current.snaps;
      if (snaps.length === 0) return undefined;
      // Find the pair straddling renderAt (or hold the nearest end).
      let i = snaps.length - 1;
      while (i > 0 && snaps[i - 1].at > renderAt) i--;
      const b = snaps[i];
      const a = i > 0 ? snaps[i - 1] : b;
      const da = a.ducks.get(id);
      const db = b.ducks.get(id) ?? da;
      if (!db) return undefined;
      const from = da ?? db;
      const t = b.at === a.at ? 1 : Math.min(1, Math.max(0, (renderAt - a.at) / (b.at - a.at)));
      return {
        x: lerp(from[1], db[1], t),
        z: lerp(from[2], db[2], t),
        y: lerp(from[7] ?? 0, db[7] ?? 0, t),
        heading: lerpAngle(from[3], db[3], t),
        anim: db[4],
        neckYaw: lerp(from[5], db[5], t),
        neckPitch: lerp(from[6], db[6], t),
      };
    },
  };
}
