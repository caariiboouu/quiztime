import { tickArena, type ArenaSim } from "../../../shared/arenaSim";
import { createBots, thinkBots } from "../../../shared/arenaBots";
import type { ArenaSource } from "./source";

/**
 * Run an arena locally (no server): the same simulation the Worker runs,
 * with computer ducks that pick answers, sometimes change their minds, and
 * quack. Used by the offline practice arena.
 */
export function localArenaSource(
  sim: ArenaSim,
  opts: {
    bots: string[];
    favourite?: number | null;
    rand?: () => number;
  },
): ArenaSource {
  const bots = createBots(opts.bots, opts.rand);
  return {
    update: (dt: number) => {
      thinkBots(sim, bots, opts.favourite ?? null);
      tickArena(sim, dt, performance.now());
    },
    get: (id: string) => {
      const w = sim.walkers.get(id);
      return (
        w && { x: w.x, z: w.z, y: w.air, heading: w.heading, anim: w.anim, neckYaw: w.neckYaw, neckPitch: w.neckPitch }
      );
    },
  };
}
