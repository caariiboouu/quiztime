import { describe, expect, it } from "vitest";
import {
  JUMP_HEIGHT,
  SIDE_SPEED,
  makeSideBody,
  sideDrop,
  sideFlyTo,
  sideHold,
  sideJump,
  sideSettled,
  sideStep,
  stepSide,
  type Platform,
} from "./platformer";
import { STEP } from "./flock";

// The floor, and a shelf above it.
const platforms: Platform[] = [
  { x0: -10, x1: 10, y: 0, solid: true },
  { x0: -3, x1: 3, y: 2.4 },
];
const bounds = { minX: -10, maxX: 10 };
const run = (bodies: ReturnType<typeof makeSideBody>[], seconds: number, t0 = 0) => {
  let t = t0;
  for (; t < t0 + seconds; t += 1 / 60) stepSide(bodies, platforms, 1 / 60, t, bounds);
  return t;
};

describe("side-on platform movement", () => {
  it("a tap is one step; holding keeps walking", () => {
    const b = makeSideBody("a", 0, platforms, 0);
    sideStep(b, 1);
    run([b], 1);
    expect(b.x).toBeCloseTo(STEP, 2);
    sideHold(b, -1);
    run([b], 1);
    expect(b.x).toBeCloseTo(STEP - SIDE_SPEED, 1);
    sideHold(b, 0);
    expect(sideSettled(b)).toBe(true);
  });

  it("jumps up onto the shelf above and lands on it", () => {
    expect(JUMP_HEIGHT).toBeGreaterThan(2.4);
    const b = makeSideBody("a", 0, platforms, 0);
    sideJump(b);
    run([b], 1.5);
    expect(b.ground).toBe(1);
    expect(b.y).toBeCloseTo(2.4);
  });

  it("drops through a shelf, but not through the floor", () => {
    const b = makeSideBody("a", 0, platforms, 1);
    expect(sideDrop(b, platforms, 0)).toBe(true);
    run([b], 1.2);
    expect(b.ground).toBe(0);
    expect(sideDrop(b, platforms, 2)).toBe(false);
  });

  it("walks off the end of a shelf and falls to the floor", () => {
    const b = makeSideBody("a", 2.5, platforms, 1);
    sideHold(b, 1);
    run([b], 1.5);
    expect(b.ground).toBe(0);
    expect(b.x).toBeGreaterThan(3);
  });

  it("walking into someone bumps them, and they don't overlap", () => {
    const a = makeSideBody("a", -2, platforms, 0);
    const b = makeSideBody("b", 0, platforms, 0);
    sideHold(a, 1);
    let bumped = false;
    let worst = Infinity;
    for (let t = 0; t < 2; t += 1 / 60) {
      stepSide([a, b], platforms, 1 / 60, t, bounds);
      if (b.anim === "bump") bumped = true;
      if (Math.abs(a.y - b.y) < 0.5) worst = Math.min(worst, Math.abs(b.x - a.x));
    }
    expect(bumped).toBe(true);
    expect(worst).toBeGreaterThan(0.8);
  });

  it("flies back to a spot in an arc", () => {
    const b = makeSideBody("a", 6, platforms, 0);
    sideFlyTo(b, 1, platforms, 1, 0);
    let peak = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      stepSide([b], platforms, 1 / 60, t, bounds);
      peak = Math.max(peak, b.y);
    }
    expect(b.ground).toBe(1);
    expect(b.x).toBeCloseTo(1);
    expect(peak).toBeGreaterThan(2.4);
  });
});
