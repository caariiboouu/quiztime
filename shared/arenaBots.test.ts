import { describe, expect, it } from "vitest";
import { createBots, thinkBots } from "./arenaBots";
import { createArenaSim, freezeArena, tickArena } from "./arenaSim";

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

describe("computer ducks", () => {
  it("pick answers, mostly the right one", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `b${i}`);
    const sim = createArenaSim(4, ids);
    const bots = createBots(ids, seeded(3));
    for (let i = 0; i < 120; i++) {
      thinkBots(sim, bots, 2);
      tickArena(sim, 0.1, i * 100);
    }
    const zones = ids.map((id) => sim.zones.get(id)?.zone);
    expect(zones.filter((z) => z !== null).length).toBeGreaterThan(15);
    const right = zones.filter((z) => z === 2).length;
    expect(right).toBeGreaterThan(zones.filter((z) => z === 0).length);
  });

  it("stop deciding once time's up", () => {
    const sim = createArenaSim(4, ["b"]);
    const bots = createBots(["b"], seeded(5));
    freezeArena(sim);
    for (let i = 0; i < 60; i++) {
      thinkBots(sim, bots, 1);
      tickArena(sim, 0.1, i * 100);
    }
    expect(sim.goals.size).toBe(0);
  });
});
