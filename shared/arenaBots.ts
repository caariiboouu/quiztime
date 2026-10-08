/**
 * Computer ducks for practice arenas: they pick answers (leaning toward the
 * right one, but not all of them), sometimes change their minds, and quack.
 * Shared by the offline practice (browser) and the public demo (Worker).
 */
import { arenaMove, type ArenaSim } from "./arenaSim";

export type Bots = {
  /** When each bot next thinks (sim seconds). */
  next: Map<string, number>;
  rand: () => number;
};

export function createBots(ids: string[], rand: () => number = Math.random): Bots {
  const bots: Bots = { next: new Map(), rand };
  for (const id of ids) addBot(bots, id, 0);
  return bots;
}

/** A bot joins (or rejoins a new round): it waits a moment before deciding. */
export function addBot(bots: Bots, id: string, now: number) {
  bots.next.set(id, now + 0.4 + bots.rand() * 2.5);
}

export function removeBot(bots: Bots, id: string) {
  bots.next.delete(id);
}

/** Let each bot whose turn it is make a move. `favourite` is the right answer, if any. */
export function thinkBots(sim: ArenaSim, bots: Bots, favourite: number | null) {
  if (sim.frozen) return;
  const { rand } = bots;
  for (const [id, at] of bots.next) {
    if (sim.t < at) continue;
    bots.next.set(id, sim.t + 2 + rand() * 5);
    if (rand() < 0.12) {
      arenaMove(sim, id, { quack: true });
    } else {
      const zone =
        favourite != null && rand() < 0.55 ? favourite : Math.floor(rand() * sim.layout.options);
      arenaMove(sim, id, { zone });
    }
  }
}
