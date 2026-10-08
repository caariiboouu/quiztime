import { describe, expect, it } from "vitest";
import { DUCK_LENGTH, MIN_TRAVEL_DUCKS, arenaLayout, spawnPoint, zoneAt, zoneTarget } from "./arena";

import type { ArenaLayout } from "./arena";

// Screen directions on the ground (up is −z), halfway out into the zones.
const mid = (l: ArenaLayout) => (l.neutral + l.radius) / 2;
const UP = (l: ArenaLayout) => zoneAt(l, 0, -mid(l));
const DOWN = (l: ArenaLayout) => zoneAt(l, 0, mid(l));
const LEFT = (l: ArenaLayout) => zoneAt(l, -mid(l), 0);
const RIGHT = (l: ArenaLayout) => zoneAt(l, mid(l), 0);

describe("arena layout", () => {
  it("matches the answer pad: 2 → left/right", () => {
    const l = arenaLayout(2, 10);
    expect(LEFT(l)).toBe(0);
    expect(RIGHT(l)).toBe(1);
  });

  it("matches the answer pad: 3 → left/up/right", () => {
    const l = arenaLayout(3, 10);
    expect(LEFT(l)).toBe(0);
    expect(UP(l)).toBe(1);
    expect(RIGHT(l)).toBe(2);
  });

  it("matches the answer pad: 4 → up/left/right/down", () => {
    const l = arenaLayout(4, 10);
    expect([UP, LEFT, RIGHT, DOWN].map((f) => f(l))).toEqual([0, 1, 2, 3]);
  });

  it("the middle is no answer", () => {
    const l = arenaLayout(4, 10);
    expect(zoneAt(l, 0, 0)).toBeNull();
    expect(zoneAt(l, l.neutral * 0.9, 0)).toBeNull();
    expect(zoneAt(l, l.neutral * 1.1, 0)).toBe(2);
  });

  it("wedges tile the full circle for any number of options", () => {
    for (let n = 2; n <= 8; n++) {
      const l = arenaLayout(n, 20);
      const total = l.zones.reduce((s, z) => s + z.span, 0);
      expect(total).toBeCloseTo(Math.PI * 2);
      // Each zone's label sits inside its own zone.
      for (const z of l.zones) expect(zoneAt(l, z.label.x, z.label.z)).toBe(z.index);
    }
  });

  it("grows the middle so a big crowd fits", () => {
    expect(arenaLayout(4, 64).neutral).toBeGreaterThan(arenaLayout(4, 4).neutral);
  });

  it("scales the middle with the crowd: small groups walk less, big crowds get more room", () => {
    const n = (players: number) => arenaLayout(4, players).neutral;
    expect(n(4)).toBeLessThan(n(12));
    expect(n(12)).toBeLessThan(n(30));
    expect(n(30)).toBeLessThan(n(60));
    expect(n(30)).toBeCloseTo(7.2, 1);
  });

  it("always leaves a walk of a couple of duck lengths from the huddle", () => {
    for (const players of [1, 4, 12, 30, 64, 120]) {
      const l = arenaLayout(4, players);
      expect(l.neutral - l.spawn).toBeGreaterThanOrEqual(MIN_TRAVEL_DUCKS * DUCK_LENGTH - 1e-9);
    }
  });

  it("spawns everyone in the central huddle, spread out", () => {
    const l = arenaLayout(4, 30);
    const spots = Array.from({ length: 30 }, (_, i) => spawnPoint(l, i, 30));
    for (const s of spots) expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(l.spawn);
    let closest = Infinity;
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++)
        closest = Math.min(closest, Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z));
    expect(closest).toBeGreaterThan(0.3);
  });

  it("zone targets land in their zone", () => {
    const l = arenaLayout(3, 12);
    for (let i = 0; i < 3; i++) {
      for (const j of [-1, 0, 1]) {
        const t = zoneTarget(l, i, j * 0.5);
        expect(zoneAt(l, t.x, t.z)).toBe(i);
      }
    }
  });
});
