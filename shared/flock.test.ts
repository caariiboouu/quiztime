import { describe, expect, it } from "vitest";
import {
  BODY,
  SPEED,
  STEP,
  bodyGap,
  emote,
  holdWalker,
  isMoving,
  makeWalker,
  pressWalker,
  scatter,
  stepWalker,
  updateFlock,
  type Walker,
} from "./flock";

const bounds = { halfWidth: 8, halfDepth: 8 };
const run = (walkers: Walker[], seconds: number, opts = {}) => {
  for (let t = 0; t < seconds; t += 1 / 60) updateFlock(walkers, 1 / 60, t, { bounds, ...opts });
};
const facing = (w: Walker, heading: number) => {
  w.heading = heading;
  return w;
};

describe("flock movement", () => {
  it("one press is one step, in screen directions", () => {
    const w = makeWalker("a", 0, 0);
    stepWalker(w, "right", bounds);
    run([w], 1);
    expect(w.x).toBeCloseTo(STEP, 2);
    stepWalker(w, "up", bounds);
    run([w], 1);
    expect(w.z).toBeCloseTo(-STEP, 2);
    expect(isMoving(w)).toBe(false);
  });

  it("caps queued steps, so mashing doesn't help", () => {
    const w = makeWalker("a", 0, 0);
    let accepted = 0;
    for (let i = 0; i < 10; i++) if (stepWalker(w, "right", bounds)) accepted++;
    expect(accepted).toBe(2);
  });

  it("faces where it waddles and animates accordingly", () => {
    const w = makeWalker("a", 0, 0);
    stepWalker(w, "left", bounds);
    updateFlock([w], 1 / 60, 0, { bounds });
    expect(w.anim).toBe("waddle");
    run([w], 1);
    expect(Math.abs(Math.cos(w.heading) + 1)).toBeLessThan(0.05); // facing -x
    expect(w.anim).toBe("idle");
  });

  it("stays inside the field, and inside an arena circle", () => {
    const w = makeWalker("a", 7.9, 0);
    stepWalker(w, "right", bounds);
    run([w], 1);
    expect(w.x).toBeLessThanOrEqual(8);
    const c = makeWalker("c", 3, 0);
    stepWalker(c, "right", bounds);
    run([c], 1, { radius: 3 });
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(3 + 1e-9);
  });

  it("plays emotes, then goes back to resting", () => {
    const w = makeWalker("a", 0, 0, "idle");
    emote(w, "quack", 0, 1);
    updateFlock([w], 1 / 60, 0.5, { bounds });
    expect(w.anim).toBe("quack");
    updateFlock([w], 1 / 60, 1.1, { bounds });
    expect(w.anim).toBe("idle");
  });

  it("wanderers stroll on their own; others don't", () => {
    const wanderer = makeWalker("w", -3, 0);
    const still = makeWalker("s", 3, 0);
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    run([wanderer, still], 20, { wanderers: new Set(["w"]), rand });
    expect(Math.hypot(wanderer.x + 3, wanderer.z)).toBeGreaterThan(0.1);
    expect(still.x).toBeCloseTo(3);
  });

  it("scatters a crowd inside its bounds", () => {
    const { spots, bounds: b } = scatter(64);
    expect(spots).toHaveLength(64);
    for (const [x, z] of spots) {
      expect(Math.abs(x)).toBeLessThan(b.halfWidth);
      expect(Math.abs(z)).toBeLessThan(b.halfDepth);
    }
  });
});

describe("holding and tapping", () => {
  const big = { halfWidth: 50, halfDepth: 50 };
  const walk = (w: Walker, seconds: number, t0 = 0, each?: (t: number) => void) => {
    let t = t0;
    for (; t < t0 + seconds - 1e-9; t += 1 / 60) {
      each?.(t);
      updateFlock([w], 1 / 60, t, { bounds: big });
    }
    return t;
  };

  it("holding a direction keeps walking, and letting go stops promptly", () => {
    const w = makeWalker("a", 0, 0);
    holdWalker(w, ["right"]);
    walk(w, 2);
    expect(w.x).toBeGreaterThan(SPEED * 2 * 0.95);
    expect(w.anim).toBe("waddle");
    const at = w.x;
    holdWalker(w, []);
    walk(w, 1, 2);
    expect(w.x - at).toBeLessThan(0.4);
    expect(isMoving(w)).toBe(false);
  });

  it("holding two directions walks diagonally", () => {
    const w = makeWalker("a", 0, 0);
    holdWalker(w, ["up", "right"]);
    walk(w, 1);
    expect(w.x).toBeGreaterThan(1);
    expect(w.z).toBeCloseTo(-w.x, 1);
  });

  it("a single tap is still one step", () => {
    const w = makeWalker("a", 0, 0);
    pressWalker(w, "right", big, 0);
    walk(w, 1);
    expect(w.x).toBeCloseTo(STEP, 2);
  });

  it("tapping flat out is only very slightly faster than holding", () => {
    const held = makeWalker("h", 0, 0);
    holdWalker(held, ["right"]);
    walk(held, 4);
    const tapper = makeWalker("t", 0, 0);
    let next = 0;
    walk(tapper, 4, 0, (t) => {
      if (t >= next) {
        pressWalker(tapper, "right", big, t);
        next = t + 1 / 10; // 10 taps a second
      }
    });
    const ratio = tapper.x / held.x;
    expect(ratio).toBeGreaterThan(1.01); // a boost you can feel…
    expect(ratio).toBeLessThan(1.1); // …but only just
  });

  it("a held duck keeps pushing into a crowd instead of giving up", () => {
    const w = makeWalker("a", -1, 0);
    const wall = [0, 0.7, -0.7].map((z, i) => facing(makeWalker(`w${i}`, 0.3, z), Math.PI / 2));
    holdWalker(w, ["right"]);
    for (let t = 0; t < 2; t += 1 / 60) updateFlock([w, ...wall], 1 / 60, t, { bounds });
    expect(w.anim === "waddle" || w.anim === "bump").toBe(true);
    expect(isMoving(w)).toBe(true);
  });
});

describe("collisions", () => {
  it("pushes overlapping bodies apart (side by side)", () => {
    const a = facing(makeWalker("a", 0, 0), 0);
    const b = facing(makeWalker("b", 0, 0.3), 0);
    run([a, b], 0.3);
    expect(bodyGap(a, b)).toBeGreaterThanOrEqual(-1e-3);
  });

  it("treats ducks as long, not round: nose-to-tail needs more room than side-by-side", () => {
    // Centres 0.9 apart: fine side by side, overlapping nose to tail.
    const sideA = facing(makeWalker("a", 0, 0), 0);
    const sideB = facing(makeWalker("b", 0, 0.9), 0);
    expect(bodyGap(sideA, sideB)).toBeGreaterThan(0);
    const lineA = facing(makeWalker("c", 0, 0), 0);
    const lineB = facing(makeWalker("d", 0.9, 0), 0);
    expect(bodyGap(lineA, lineB)).toBeLessThan(0);
  });

  it("a waddling duck nudges a standing one slightly, rather than passing through", () => {
    const mover = makeWalker("m", -1.5, 0);
    const stander = facing(makeWalker("s", 0, 0.05), Math.PI / 2);
    // Heading for a spot on the far side of the standing duck.
    mover.tx = 1.5;
    let minGap = Infinity;
    for (let t = 0; t < 2.5; t += 1 / 60) {
      updateFlock([mover, stander], 1 / 60, t, { bounds });
      minGap = Math.min(minGap, bodyGap(mover, stander));
    }
    expect(minGap).toBeGreaterThan(-0.05);
    const nudge = Math.hypot(stander.x, stander.z - 0.05);
    expect(nudge).toBeGreaterThan(0.01); // felt the bump…
    expect(nudge).toBeLessThan(0.5); // …but mostly held its ground
    expect(mover.x).toBeGreaterThan(1); // and the mover slid round and carried on
  });

  it("keeps a crowd of 40 from overlapping", () => {
    const ducks: Walker[] = [];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) ducks.push(facing(makeWalker(`d${i}`, rand() * 3 - 1.5, rand() * 3 - 1.5), rand() * 6));
    run(ducks, 2, { rand });
    let worst = Infinity;
    for (let i = 0; i < ducks.length; i++)
      for (let j = i + 1; j < ducks.length; j++) worst = Math.min(worst, bodyGap(ducks[i], ducks[j]));
    expect(worst).toBeGreaterThan(-BODY.radius * 0.1);
  });
});

describe("neck bending", () => {
  it("turns the head away from a neighbour on its left, and the other way on its right", () => {
    // Facing +x; local +z is the duck's left. Neighbour beside the head.
    const a = facing(makeWalker("a", 0, 0), 0);
    const left = facing(makeWalker("l", 0.65, 0.85), 0);
    run([a, left], 1);
    expect(a.neckYaw).toBeGreaterThan(0.2);

    const b = facing(makeWalker("b", 0, 0), 0);
    const right = facing(makeWalker("r", 0.65, -0.85), 0);
    run([b, right], 1);
    expect(b.neckYaw).toBeLessThan(-0.2);
  });

  it("lifts the bill over something dead ahead", () => {
    const a = facing(makeWalker("a", 0, 0), 0);
    const ahead = facing(makeWalker("h", 1.55, 0), Math.PI / 2);
    run([a, ahead], 1);
    expect(a.neckPitch).toBeGreaterThan(0.05);
  });

  it("relaxes when there's room", () => {
    const a = facing(makeWalker("a", 0, 0), 0);
    const far = makeWalker("f", 5, 5);
    run([a, far], 1);
    expect(Math.abs(a.neckYaw)).toBeLessThan(0.01);
    expect(Math.abs(a.neckPitch)).toBeLessThan(0.01);
  });
});

describe("bumps", () => {
  const headOn = () => {
    const a = makeWalker("a", -1.2, 0);
    const b = makeWalker("b", 1.2, 0.1);
    a.tx = 3;
    b.tx = -3;
    return [a, b];
  };

  it("ducks that walk into each other bump: knocked back, flap and honk", () => {
    const [a, b] = headOn();
    let bumped = false;
    let knock = 0;
    for (let t = 0; t < 1.2; t += 1 / 60) {
      updateFlock([a, b], 1 / 60, t, { bounds });
      if (a.anim === "bump" && b.anim === "bump") bumped = true;
      knock = Math.max(knock, Math.hypot(a.kx, a.kz));
    }
    expect(bumped).toBe(true);
    expect(knock).toBeGreaterThan(0.5);
  });

  it("one bump at a time: the cooldown stops a honking frenzy", () => {
    const [a, b] = headOn();
    let starts = 0;
    let prev = a.anim;
    for (let t = 0; t < 0.8; t += 1 / 60) {
      updateFlock([a, b], 1 / 60, t, { bounds });
      if (a.anim === "bump" && prev !== "bump") starts++;
      prev = a.anim;
    }
    expect(starts).toBe(1);
  });

  it("ducks resting shoulder to shoulder don't bump", () => {
    const a = facing(makeWalker("a", 0, 0), 0);
    const b = facing(makeWalker("b", 0, 0.7), 0);
    for (let t = 0; t < 1; t += 1 / 60) updateFlock([a, b], 1 / 60, t, { bounds });
    expect(a.anim).not.toBe("bump");
    expect(b.anim).not.toBe("bump");
  });
});

describe("flying out of a crowd", () => {
  it("two ducks bumping each other over and over never take off", () => {
    const a = makeWalker("a", 0, 0);
    const b = makeWalker("b", 0, 0);
    let maxAir = 0;
    let bumps = 0;
    let t = 0;
    for (let round = 0; round < 10; round++) {
      // Line them up nose to nose, charging straight through each other.
      Object.assign(a, { x: -0.75, z: 0, tx: 2, tz: 0, heading: 0 });
      Object.assign(b, { x: 0.75, z: 0, tx: -2, tz: 0, heading: Math.PI });
      for (let i = 0; i < 72; i++, t += 1 / 60) {
        const before = a.anim;
        updateFlock([a, b], 1 / 60, t, { bounds });
        if (a.anim === "bump" && before !== "bump") bumps++;
        maxAir = Math.max(maxAir, a.air, b.air);
        expect(a.flying || b.flying).toBe(false);
      }
    }
    expect(bumps).toBeGreaterThanOrEqual(8); // they really did keep bumping
    expect(maxAir).toBeLessThan(0.5); // only little hops
  });

  it("bumps from three different ducks launch a duck over the crowd, and it lands", () => {
    const victim = makeWalker("v", 0, 0);
    const bullies = ["x", "y", "z"].map((id, i) => {
      const a = (i / 3) * Math.PI * 2;
      const d = makeWalker(id, Math.cos(a) * 2, Math.sin(a) * 2);
      return d;
    });
    let peak = 0;
    let flew = false;
    let landed = false;
    for (let t = 0; t < 8; t += 1 / 60) {
      // Each bully charges in turn, a second apart.
      bullies.forEach((d, i) => {
        if (Math.abs(t - (0.2 + i * 1.0)) < 1 / 120) {
          d.tx = victim.x;
          d.tz = victim.z;
        }
      });
      updateFlock([victim, ...bullies], 1 / 60, t, { bounds });
      peak = Math.max(peak, victim.air);
      if (victim.flying) flew = true;
      if (flew && !victim.flying && victim.air === 0) landed = true;
    }
    expect(flew).toBe(true);
    expect(peak).toBeGreaterThan(1.8); // well over everyone's heads (~1.4)
    expect(landed).toBe(true);
  });

  it("a flying duck sails over others instead of colliding", () => {
    const flyer = makeWalker("f", -2, 0);
    flyer.flying = true;
    flyer.vy = 6;
    flyer.fx = 2.5;
    const stander = makeWalker("s", 0, 0);
    for (let t = 0; t < 1.5; t += 1 / 60) updateFlock([flyer, stander], 1 / 60, t, { bounds });
    expect(flyer.x).toBeGreaterThan(1); // passed right over
    expect(Math.hypot(stander.x, stander.z)).toBeLessThan(0.05); // undisturbed
  });
});
