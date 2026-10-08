/**
 * The mascot's animations as pure functions of time → pose. `DuckModel`
 * applies a pose to the rig every frame and blends between animations, so
 * adding a move is just adding a function here.
 *
 * Conventions: the duck faces +x, up is +y. Angles are radians.
 */
import type { DuckAnim } from "../../../shared/flock";

export type Pose = {
  /** Whole-duck vertical offset (hops, bobbing). */
  y: number;
  /** Vertical squash & stretch: 1 = normal, >1 taller. */
  squash: number;
  /** Body lean side to side, nose up/down, and turn (spins). */
  roll: number;
  pitch: number;
  spin: number;
  /** Head: positive pitch lifts the bill; yaw looks left/right. */
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** Bill: 0 closed, 1 wide open. */
  bill: number;
  /** Wing raise per side: 0 folded, ~1.3 fully up. */
  wingL: number;
  wingR: number;
  /** Tail wag (yaw) and lift. */
  tail: number;
  /** Leg swing forward/back, and foot lift. */
  legL: number;
  legR: number;
  liftL: number;
  liftR: number;
  /** 1 eyes open, 0 closed. */
  eyes: number;
  /** 0 standing, 1 legs folded under (sitting / swimming). */
  tuck: number;
};

export const MASCOT_ANIMATIONS = [
  "idle",
  "waddle",
  "quack",
  "flap",
  "celebrate",
  "dance",
  "sad",
  "sleep",
  "swim",
  "bump",
  "fly",
] as const;

export type MascotAnimation = (typeof MASCOT_ANIMATIONS)[number];

// The flock simulation (shared with the server) names animations too; keep
// the two lists in step.
export type _SameAnimations = [MascotAnimation] extends [DuckAnim]
  ? [DuckAnim] extends [MascotAnimation]
    ? true
    : never
  : never;
const _check: _SameAnimations = true;
void _check;

export const REST: Pose = {
  y: 0,
  squash: 1,
  roll: 0,
  pitch: 0,
  spin: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  bill: 0,
  wingL: 0,
  wingR: 0,
  tail: 0,
  legL: 0,
  legR: 0,
  liftL: 0,
  liftR: 0,
  eyes: 1,
  tuck: 0,
};

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** A 0→1→0 hump over [a, b] of a 0–1 phase. */
const bump = (u: number, a: number, b: number) =>
  u < a || u > b ? 0 : Math.sin((Math.PI * (u - a)) / (b - a));

/** Eyes shut briefly every few seconds. */
function blink(t: number, every = 3.7): number {
  return t % every < 0.12 ? 0.1 : 1;
}

const ANIMATIONS: Record<MascotAnimation, (t: number) => Pose> = {
  idle: (t) => ({
    ...REST,
    y: 0.015 * Math.sin(t * 2),
    squash: 1 + 0.012 * Math.sin(t * 2),
    // Looks around now and then.
    headYaw: 0.35 * Math.sin(t * 0.6) * smooth(Math.sin(t * 0.3) * 2),
    headPitch: 0.06 * Math.sin(t * 1.3),
    tail: 0.12 * Math.sin(t * 3),
    eyes: blink(t),
  }),

  waddle: (t) => {
    const p = (t * TAU) / 0.6;
    const s = Math.sin(p);
    return {
      ...REST,
      y: 0.035 * Math.abs(s),
      roll: 0.13 * s,
      headPitch: 0.06 * Math.sin(2 * p),
      headRoll: -0.06 * s,
      tail: 0.3 * s,
      wingL: 0.08 + 0.06 * Math.max(0, s),
      wingR: 0.08 + 0.06 * Math.max(0, -s),
      legL: 0.45 * s,
      legR: -0.45 * s,
      liftL: 0.09 * Math.max(0, s),
      liftR: 0.09 * Math.max(0, -s),
      eyes: blink(t),
    };
  },

  quack: (t) => {
    // Two quacks, then a beat.
    const u = (t % 1.3) / 1.3;
    const q = bump(u, 0, 0.2) + bump(u, 0.28, 0.48);
    return {
      ...REST,
      squash: 1 + 0.05 * q,
      headPitch: 0.28 * q,
      bill: q,
      wingL: 0.25 * q,
      wingR: 0.25 * q,
      tail: 0.2 * q,
      eyes: blink(t, 2.9),
    };
  },

  flap: (t) => {
    const f = Math.sin(t * 18);
    return {
      ...REST,
      y: 0.08 + 0.04 * f,
      squash: 1.03,
      pitch: -0.08,
      headPitch: 0.15,
      bill: 0.3,
      wingL: 0.65 + 0.6 * f,
      wingR: 0.65 + 0.6 * f,
      tail: 0.15 * f,
      legL: 0.25,
      legR: 0.25,
      liftL: 0.05,
      liftR: 0.05,
    };
  },

  celebrate: (t) => {
    const u = (t % 1.5) / 1.5;
    const air = bump(u, 0.15, 0.75);
    const windup = bump(u, 0, 0.15);
    const land = bump(u, 0.75, 1);
    const flapping = air * (0.5 + 0.4 * Math.sin(t * 22));
    return {
      ...REST,
      y: 0.5 * air,
      squash: 1 - 0.16 * windup - 0.12 * land + 0.08 * air,
      spin: TAU * smooth((u - 0.2) / 0.5),
      headPitch: 0.3 * air,
      bill: 0.7 * air,
      wingL: 0.2 + flapping + 0.5 * air,
      wingR: 0.2 + flapping + 0.5 * air,
      tail: 0.3 * air,
      tuck: 0.6 * air,
    };
  },

  dance: (t) => {
    const p = (t * TAU) / 0.8;
    const s = Math.sin(p);
    return {
      ...REST,
      y: 0.07 * Math.abs(s),
      roll: 0.2 * s,
      headRoll: -0.28 * s,
      headYaw: 0.2 * Math.sin(p / 2),
      headPitch: 0.1 * Math.abs(s),
      bill: 0.25 * Math.max(0, Math.sin(2 * p)),
      wingL: 0.35 + 0.3 * Math.sin(2 * p),
      wingR: 0.35 - 0.3 * Math.sin(2 * p),
      tail: 0.45 * Math.sin(2 * p),
      liftL: 0.1 * Math.max(0, s),
      liftR: 0.1 * Math.max(0, -s),
      legL: 0.2 * s,
      legR: -0.2 * s,
      eyes: blink(t, 2.3),
    };
  },

  sad: (t) => ({
    ...REST,
    y: -0.03,
    squash: 0.95,
    roll: 0.05 * Math.sin(t * 0.8),
    pitch: 0.08,
    headPitch: -0.5 + 0.04 * Math.sin(t * 1.2),
    headYaw: 0.1 * Math.sin(t * 0.5),
    tail: -0.05,
    eyes: 0.5 * blink(t, 4.3),
  }),

  sleep: (t) => ({
    ...REST,
    y: -0.02,
    squash: 1 + 0.03 * Math.sin(t * 1.5),
    headPitch: -0.55,
    headYaw: 0.6,
    headRoll: 0.25,
    eyes: 0,
    tuck: 0.7,
  }),

  // Bumped in a crowd: a startled flap and an indignant honk, rocking back.
  bump: (t) => {
    const u = Math.min(1, t / 0.5);
    const hit = Math.sin(Math.PI * u); // 0 → 1 → 0 over the half second
    const flap = hit * (0.6 + 0.6 * Math.sin(t * 30));
    return {
      ...REST,
      y: 0.12 * hit,
      squash: 1 - 0.1 * Math.sin(Math.PI * Math.min(1, u * 3)) + 0.06 * hit,
      pitch: -0.18 * hit,
      headPitch: 0.45 * hit,
      bill: Math.min(1, hit * 1.4),
      wingL: flap + 0.4 * hit,
      wingR: flap + 0.4 * hit,
      tail: 0.3 * Math.sin(t * 25) * hit,
      eyes: 1,
    };
  },

  // Launched out of a crush: big flaps, feet tucked, bill up and honking.
  fly: (t) => {
    const f = Math.sin(t * 20);
    return {
      ...REST,
      squash: 1.04,
      pitch: -0.12,
      headPitch: 0.35,
      bill: 0.55 + 0.35 * Math.max(0, Math.sin(t * 9)),
      wingL: 0.75 + 0.65 * f,
      wingR: 0.75 + 0.65 * f,
      tail: 0.2 * f,
      tuck: 0.75,
      legL: -0.4,
      legR: -0.4,
    };
  },

  swim: (t) => ({
    ...REST,
    y: 0.025 * Math.sin(t * 2.5),
    roll: 0.05 * Math.sin(t * 2.5),
    pitch: 0.03 * Math.sin(t * 2.5 + 1),
    headPitch: 0.06 * Math.sin(t * 2.5),
    tail: 0.25 * Math.sin(t * 5),
    legL: 0.5 * Math.sin(t * 7),
    legR: -0.5 * Math.sin(t * 7),
    eyes: blink(t),
    tuck: 1,
  }),
};

export function poseAt(animation: MascotAnimation, t: number): Pose {
  return (ANIMATIONS[animation] ?? ANIMATIONS.idle)(t);
}

/**
 * A representative still for each animation, used when the viewer prefers
 * reduced motion: the duck still shows the mood, it just doesn't move.
 */
export const STILL_TIME: Record<MascotAnimation, number> = {
  idle: 0.5,
  waddle: 0.15,
  quack: 0.13,
  flap: 0.1,
  celebrate: 0.68,
  dance: 0.2,
  sad: 0,
  sleep: 0,
  swim: 0,
  bump: 0.25,
  fly: 0.1,
};

/** Wrap an angle into (-π, π] so blends take the short way round. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function blendPose(from: Pose, to: Pose, w: number): Pose {
  const k = smooth(w);
  const out = { ...to };
  for (const key of Object.keys(to) as (keyof Pose)[]) {
    const a = key === "spin" ? wrapAngle(from[key]) : from[key];
    const b = key === "spin" ? wrapAngle(to[key]) : to[key];
    const d = key === "spin" ? wrapAngle(b - a) : b - a;
    out[key] = a + d * k;
  }
  return out;
}
