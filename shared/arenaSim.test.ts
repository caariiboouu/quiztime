import { describe, expect, it } from "vitest";
import { zoneAt } from "./arena";
import {
  HOLD_LEASE,
  freezeArena,
  arenaMove,
  arenaSnapshot,
  createArenaSim,
  ensureDuck,
  isArenaMove,
  tickArena,
} from "./arenaSim";
import { bodyGap } from "./flock";

const run = (sim: ReturnType<typeof createArenaSim>, seconds: number, startMs = 0) => {
  let changed = false;
  for (let i = 0; i < seconds * 10; i++) changed = tickArena(sim, 0.1, startMs + i * 100) || changed;
  return changed;
};

describe("arena sim", () => {
  it("spawns everyone in the middle, answering nothing", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const sim = createArenaSim(4, ids);
    run(sim, 0.5);
    for (const id of ids) expect(sim.zones.get(id)?.zone).toBeNull();
  });

  it("stepping into a wedge answers that option", () => {
    const sim = createArenaSim(4, ["a"]);
    // 4 options: up is option 0. Step up until out of the middle.
    for (let i = 0; i < 16; i++) {
      arenaMove(sim, "a", { dir: "up" });
      run(sim, 0.4);
    }
    expect(sim.zones.get("a")?.zone).toBe(0);
  });

  it("'go to zone N' waddles there", () => {
    const sim = createArenaSim(3, ["a", "b", "c"]);
    arenaMove(sim, "a", { zone: 0 });
    arenaMove(sim, "b", { zone: 1 });
    arenaMove(sim, "c", { zone: 2 });
    const changed = run(sim, 8);
    expect(changed).toBe(true);
    expect(["a", "b", "c"].map((id) => sim.zones.get(id)?.zone)).toEqual([0, 1, 2]);
    // and remembers when each arrived (for speed scoring)
    expect(sim.zones.get("a")!.since).toBeGreaterThan(0);
  });

  it("a crowd rushing one answer jostles without overlapping", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `p${i}`);
    const sim = createArenaSim(4, ids);
    for (const id of ids) arenaMove(sim, id, { zone: 2 });
    run(sim, 10);
    const ws = [...sim.walkers.values()];
    let worst = Infinity;
    for (let i = 0; i < ws.length; i++)
      for (let j = i + 1; j < ws.length; j++) worst = Math.min(worst, bodyGap(ws[i], ws[j]));
    expect(worst).toBeGreaterThan(-0.08);
    const inZone = ws.filter((w) => zoneAt(sim.layout, w.x, w.z) === 2).length;
    expect(inZone).toBeGreaterThan(20);
  });

  it("'go to N' keeps trying until the duck is on its answer, even in a crush", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const sim = createArenaSim(4, ids);
    // Everyone presses "1" at once: one quarter of the arena, 30 ducks.
    for (const id of ids) arenaMove(sim, id, { zone: 0 });
    run(sim, 15);
    const onIt = ids.filter((id) => sim.zones.get(id)?.zone === 0).length;
    expect(onIt).toBe(ids.length);
  });

  it("steering by hand cancels 'go to N'", () => {
    const sim = createArenaSim(4, ["a"]);
    arenaMove(sim, "a", { zone: 0 });
    arenaMove(sim, "a", { dir: "down" });
    expect(sim.goals.has("a")).toBe(false);
  });

  it("holding a direction walks until let go", () => {
    const sim = createArenaSim(4, ["a"]);
    arenaMove(sim, "a", { held: ["down"] });
    run(sim, 1);
    const w = sim.walkers.get("a")!;
    expect(w.z).toBeGreaterThan(2);
    arenaMove(sim, "a", { held: [] });
    run(sim, 0.5, 1000);
    const z = w.z;
    run(sim, 1, 1500);
    expect(w.z).toBeCloseTo(z, 3);
  });

  it("a hold lapses unless renewed (e.g. the player's connection dropped)", () => {
    const sim = createArenaSim(4, ["a", "b"]);
    arenaMove(sim, "a", { held: ["left"] });
    arenaMove(sim, "b", { held: ["right"] });
    // b keeps renewing; a goes quiet.
    for (let i = 0; i < (HOLD_LEASE + 1) * 10; i++) {
      if (i % 4 === 0) arenaMove(sim, "b", { held: ["right"] });
      tickArena(sim, 0.1, i * 100);
    }
    expect(sim.walkers.get("a")!.hold).toBeNull();
    expect(sim.walkers.get("b")!.hold).not.toBeNull();
  });

  it("holding a direction cancels 'go to N'", () => {
    const sim = createArenaSim(4, ["a"]);
    arenaMove(sim, "a", { zone: 0 });
    arenaMove(sim, "a", { held: ["down"] });
    expect(sim.goals.has("a")).toBe(false);
  });

  it("stays inside the arena", () => {
    const sim = createArenaSim(2, ["a"]);
    for (let i = 0; i < 30; i++) {
      arenaMove(sim, "a", { dir: "right" });
      run(sim, 0.3);
    }
    const w = sim.walkers.get("a")!;
    expect(Math.hypot(w.x, w.z)).toBeLessThanOrEqual(sim.layout.radius);
  });

  it("adds late joiners and rejects bad moves", () => {
    const sim = createArenaSim(2, ["a"], 2);
    ensureDuck(sim, "late");
    expect(sim.walkers.has("late")).toBe(true);
    expect(arenaMove(sim, "nobody", { dir: "up" })).toBe(false);
    expect(arenaMove(sim, "a", { zone: 7 })).toBe(false);
    expect(isArenaMove({ dir: "up" })).toBe(true);
    expect(isArenaMove({ dir: "sideways" })).toBe(false);
    expect(isArenaMove({ zone: 1 })).toBe(true);
    expect(isArenaMove({ held: ["up", "left"] })).toBe(true);
    expect(isArenaMove({ held: [] })).toBe(true);
    expect(isArenaMove({ held: ["up", "jump"] })).toBe(false);
    expect(isArenaMove({ held: "up" })).toBe(false);
    expect(isArenaMove({ quack: true })).toBe(true);
    expect(isArenaMove(null)).toBe(false);
  });

  it("snapshots compactly", () => {
    const sim = createArenaSim(2, ["a", "b"]);
    const snap = arenaSnapshot(sim);
    expect(snap).toHaveLength(2);
    expect(snap[0]).toHaveLength(8);
    expect(JSON.stringify(snap).length).toBeLessThan(200);
  });
});

describe("time's up", () => {
  it("freezing stops every duck dead, mid-walk, mid-hold and mid-flight, and ignores moves", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const sim = createArenaSim(4, ids);
    for (const id of ids) arenaMove(sim, id, { zone: 1 });
    arenaMove(sim, "p0", { held: ["up"] });
    run(sim, 1.5);
    const flyer = sim.walkers.get("p1")!;
    Object.assign(flyer, { flying: true, air: 1.5, vy: 2, fx: 2, fz: 0 });
    const zonesBefore = ids.map((id) => sim.zones.get(id)!.zone);
    freezeArena(sim);
    const at = ids.map((id) => {
      const w = sim.walkers.get(id)!;
      return [w.x, w.z];
    });
    expect(arenaMove(sim, "p2", { dir: "left" })).toBe(false);
    expect(arenaMove(sim, "p3", { zone: 0 })).toBe(false);
    run(sim, 3, 1500);
    ids.forEach((id, i) => {
      const w = sim.walkers.get(id)!;
      expect(w.x).toBe(at[i][0]);
      expect(w.z).toBe(at[i][1]);
      expect(w.air).toBe(0);
      expect(w.anim).toBe("idle");
    });
    expect(ids.map((id) => sim.zones.get(id)!.zone)).toEqual(zonesBefore);
  });
});

describe("arena crowds", () => {
  it("in a real crush a few ducks get bumped enough to fly, not most", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const sim = createArenaSim(4, ids);
    for (const id of ids) arenaMove(sim, id, { zone: 0 });
    const flew = new Set<string>();
    for (let i = 0; i < 150; i++) {
      tickArena(sim, 0.1, i * 100);
      for (const w of sim.walkers.values()) if (w.flying) flew.add(w.id);
    }
    expect(flew.size).toBeGreaterThanOrEqual(1);
    expect(flew.size).toBeLessThan(15);
  });
});
