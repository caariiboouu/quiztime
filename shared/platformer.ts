/**
 * Side-on platform movement for ducks: the 2D counterpart of flock.ts. Ducks
 * stand on horizontal platforms (shelves, podium steps, the floor), walk left
 * and right, jump up to a platform above, drop through to one below, and bump
 * each other. Used by the shelf view of the Ceramic Duck Hours board, and
 * meant for side-on minigames (platformers, races, King of the Hill…).
 *
 * One-handed like everything else: hold ←/→ to walk or tap for one step
 * (with flock.ts's step size), ↑ to jump, ↓ to drop down.
 *
 * Plain data and functions: no three.js, React or DOM. Units match the 3D
 * ducks (about 1.4 tall, 1.3 nose to tail).
 */
import { STEP } from "./flock";

/** A walkable surface: its top is at height `y`, from `x0` to `x1`. */
export type Platform = { x0: number; x1: number; y: number; solid?: boolean };

export type SideAnim = "idle" | "waddle" | "flap" | "bump" | "fly" | "quack";

export type SideBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which way it's facing: 1 = right, -1 = left. */
  facing: 1 | -1;
  /** The platform it's standing on (index), or null in the air. */
  ground: number | null;
  /** Held direction: walk until let go. */
  hold: -1 | 0 | 1;
  /** A tapped step: walk to here. */
  tx: number | null;
  /** Falling through the platform it stood on, until this time. */
  dropUntil: number;
  dropFrom: number | null;
  /** Knock-back from a bump (units/s, fading). */
  kx: number;
  bumpCooldown: number;
  emote: SideAnim | null;
  emoteUntil: number;
  /** Carried back to a spot in an arc (e.g. knocked off its shelf). */
  flight: { fromX: number; fromY: number; toX: number; toY: number; ground: number; start: number; dur: number } | null;
  anim: SideAnim;
};

export const SIDE_SPEED = 2.6;
const GRAVITY = 22;
/** Enough to clear a shelf this high above (see SHELF_GAP in the board). */
export const JUMP_HEIGHT = 3.0;
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
/** Ducks are this wide side by side (they stand facing the viewer). */
export const SIDE_WIDTH = 0.95;
const BUMP_MIN_CLOSING = 1.2;
const BUMP_KNOCK = 3.2;
const BUMP_DECAY = 6;
const BUMP_COOLDOWN = 0.8;

export function makeSideBody(id: string, x: number, platforms: Platform[], ground: number): SideBody {
  return {
    id,
    x,
    y: platforms[ground]?.y ?? 0,
    vx: 0,
    vy: 0,
    facing: 1,
    ground,
    hold: 0,
    tx: null,
    dropUntil: 0,
    dropFrom: null,
    kx: 0,
    bumpCooldown: 0,
    emote: null,
    emoteUntil: 0,
    flight: null,
    anim: "idle",
  };
}

/** Tap ←/→: one step that way. */
export function sideStep(b: SideBody, dir: -1 | 1) {
  if (b.flight) return;
  b.tx = (b.tx ?? b.x) + dir * STEP;
  b.facing = dir;
}

/** Hold ←/→ (0 lets go). */
export function sideHold(b: SideBody, dir: -1 | 0 | 1) {
  b.hold = dir;
  if (dir !== 0) {
    b.facing = dir;
    b.tx = null;
  }
}

/** ↑: jump, if standing on something. */
export function sideJump(b: SideBody): boolean {
  if (b.ground === null || b.flight) return false;
  b.vy = JUMP_SPEED;
  b.ground = null;
  return true;
}

/** ↓: drop through the platform underfoot (not a solid one, like the floor). */
export function sideDrop(b: SideBody, platforms: Platform[], now: number): boolean {
  if (b.ground === null || b.flight || platforms[b.ground]?.solid) return false;
  b.dropFrom = b.ground;
  b.dropUntil = now + 0.35;
  b.ground = null;
  b.vy = -1;
  return true;
}

export function sideEmote(b: SideBody, anim: SideAnim, now: number, seconds = 1.2) {
  b.emote = anim;
  b.emoteUntil = now + seconds;
}

/** Fly back to a spot on a platform in a little arc (knocked off, say). */
export function sideFlyTo(b: SideBody, x: number, platforms: Platform[], ground: number, now: number) {
  const dist = Math.hypot(x - b.x, (platforms[ground]?.y ?? 0) - b.y);
  b.flight = {
    fromX: b.x,
    fromY: b.y,
    toX: x,
    toY: platforms[ground]?.y ?? 0,
    ground,
    start: now,
    dur: Math.min(1.4, 0.5 + dist * 0.12),
  };
  b.tx = null;
  b.hold = 0;
  b.kx = 0;
  b.facing = x >= b.x ? 1 : -1;
}

export type SideBounds = { minX: number; maxX: number };

/** Advance everyone by `dt` seconds (`now` is the clock in seconds). */
export function stepSide(bodies: SideBody[], platforms: Platform[], dt: number, now: number, bounds: SideBounds) {
  const total = Math.min(dt, 0.1);
  const n = Math.max(1, Math.ceil(total / (1 / 60)));
  for (let i = 0; i < n; i++) step(bodies, platforms, total / n, now - total + ((i + 1) * total) / n, bounds);
}

function step(bodies: SideBody[], platforms: Platform[], dt: number, now: number, bounds: SideBounds) {
  const before = new Map(bodies.map((b) => [b, b.x]));
  for (const b of bodies) {
    // Carried home in an arc.
    if (b.flight) {
      const f = b.flight;
      const t = Math.min(1, (now - f.start) / f.dur);
      b.x = f.fromX + (f.toX - f.fromX) * t;
      b.y = f.fromY + (f.toY - f.fromY) * t + Math.sin(Math.PI * t) * 1.6;
      if (t >= 1) {
        b.flight = null;
        b.ground = f.ground;
        b.y = f.toY;
        b.vy = 0;
      }
      continue;
    }

    // Walking: held direction, or a tapped step.
    let vx = 0;
    if (b.hold !== 0) vx = b.hold * SIDE_SPEED;
    else if (b.tx !== null) {
      const d = b.tx - b.x;
      if (Math.abs(d) < 1e-3) b.tx = null;
      else vx = Math.sign(d) * Math.min(SIDE_SPEED, Math.abs(d) / dt);
    }
    b.vx = vx;
    b.x += (vx + b.kx) * dt;
    if (b.kx !== 0) {
      b.kx *= Math.exp(-BUMP_DECAY * dt);
      if (Math.abs(b.kx) < 0.05) b.kx = 0;
    }
    b.x = Math.max(bounds.minX, Math.min(bounds.maxX, b.x));
    if (b.tx !== null) b.tx = Math.max(bounds.minX, Math.min(bounds.maxX, b.tx));

    // Walked off the edge of what it was standing on.
    if (b.ground !== null) {
      const p = platforms[b.ground];
      if (!p || b.x < p.x0 - 0.15 || b.x > p.x1 + 0.15) b.ground = null;
      else b.y = p.y;
    }

    // In the air: fall, and land on whatever's underneath.
    if (b.ground === null) {
      const prevY = b.y;
      b.vy -= GRAVITY * dt;
      b.y += b.vy * dt;
      if (b.vy <= 0) {
        let land: number | null = null;
        platforms.forEach((p, i) => {
          if (b.x < p.x0 - 0.15 || b.x > p.x1 + 0.15) return;
          if (i === b.dropFrom && now < b.dropUntil) return;
          if (prevY >= p.y - 1e-6 && b.y <= p.y && (land === null || p.y > platforms[land].y)) land = i;
        });
        if (land !== null) {
          b.ground = land;
          b.y = platforms[land].y;
          b.vy = 0;
          b.dropFrom = null;
        }
      }
      // Never through the bottom.
      const floor = Math.min(...platforms.map((p) => p.y));
      if (b.y < floor - 3) {
        b.y = floor;
        b.vy = 0;
      }
    }
  }

  // Side by side on the same level: push apart, and bump if closing fast.
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const c = bodies[j];
      if (a.flight || c.flight) continue;
      if (Math.abs(a.y - c.y) > 0.8) continue;
      const dx = c.x - a.x;
      const overlap = SIDE_WIDTH - Math.abs(dx);
      if (overlap <= 0) continue;
      const dir = dx >= 0 ? 1 : -1;
      const va = (a.x - (before.get(a) ?? a.x)) / dt;
      const vc = (c.x - (before.get(c) ?? c.x)) / dt;
      const closing = (va - vc) * dir;
      const aStill = Math.abs(va) < 0.05;
      const cStill = Math.abs(vc) < 0.05;
      // A standing duck mostly holds its ground, as in flock.ts.
      const aShare = aStill === cStill ? 0.5 : aStill ? 0.3 : 0.7;
      a.x -= dir * overlap * aShare;
      c.x += dir * overlap * (1 - aShare);
      if (closing > BUMP_MIN_CLOSING && now >= a.bumpCooldown && now >= c.bumpCooldown) {
        a.kx -= dir * BUMP_KNOCK * aShare * 2;
        c.kx += dir * BUMP_KNOCK * (1 - aShare) * 2;
        for (const b of [a, c]) {
          b.bumpCooldown = now + BUMP_COOLDOWN;
          sideEmote(b, "bump", now, 0.5);
          if (b.ground !== null) {
            b.vy = 3.5;
            b.ground = null;
          }
        }
      }
    }
  }

  for (const b of bodies) {
    b.x = Math.max(bounds.minX, Math.min(bounds.maxX, b.x));
    if (b.emote && now >= b.emoteUntil) b.emote = null;
    const walking = Math.abs(b.vx) > 0.05;
    b.anim = b.flight ? "fly" : (b.emote ?? (b.ground === null ? "flap" : walking ? "waddle" : "idle"));
  }
}

/** Standing still on its own two feet (not walking, falling or flying). */
export function sideSettled(b: SideBody): boolean {
  return b.ground !== null && !b.flight && b.hold === 0 && b.tx === null && b.kx === 0;
}
