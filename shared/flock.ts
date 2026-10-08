/**
 * Movement for a flock of player ducks on a flat field: the groundwork for
 * minigames where each player steers their own duck. Runs in the browser
 * (local demos) and in the Worker (authoritative multiplayer).
 *
 * One-handed by design: hold a direction to keep walking, or tap it for one
 * waddle step (holding is never required). Each fresh press also gives a very
 * slight burst of speed and a little skip, but it's rationed and steps can
 * only queue a couple ahead, so mashing is at most a few percent faster than
 * holding.
 *
 * Collisions: ducks are long, so each body is a capsule along its heading
 * (tail to chest) rather than a circle; overlapping bodies are pushed apart,
 * so a waddling duck can nudge others aside. Heads stick out above other
 * ducks' bodies, so instead of colliding them, each duck bends its neck away
 * from whatever is near its head (turning aside, lifting the bill).
 *
 * Plain data and functions: no three.js, React or DOM.
 */

export type Dir = "up" | "down" | "left" | "right";

/** Must match MASCOT_ANIMATIONS in src/live/mascot/poses.ts. */
export type DuckAnim =
  | "idle"
  | "waddle"
  | "quack"
  | "flap"
  | "celebrate"
  | "dance"
  | "sad"
  | "sleep"
  | "swim"
  | "bump"
  | "fly";

export type Walker = {
  id: string;
  x: number;
  z: number;
  /** Facing, as the duck's rotation about y (0 = facing +x). */
  heading: number;
  /** Where it's waddling to. */
  tx: number;
  tz: number;
  /** One-off animation (quack, flap…) and when it ends, in seconds. */
  emote: DuckAnim | null;
  emoteUntil: number;
  /** What it does when standing still. */
  rest: DuckAnim;
  /** Wandering ducks: when to take their next stroll. */
  nextWander: number;
  /** Resolved each update: what the duck should be animating right now. */
  anim: DuckAnim;
  /** Neck bend to keep the head clear of neighbours (radians, smoothed). */
  neckYaw: number;
  neckPitch: number;
  /** Seconds spent pushing without getting anywhere. */
  stuck: number;
  /** Knock-back velocity from the last bump (decays quickly). */
  kx: number;
  kz: number;
  /** Clock time until which this duck can't be bumped again. */
  bumpCooldown: number;
  /** Height off the ground (hops and flights) and its vertical speed. */
  air: number;
  vy: number;
  /** Launched over the crowd, gliding this way until it lands. */
  flying: boolean;
  fx: number;
  fz: number;
  /** No second take-off before this. */
  flyCooldown: number;
  /** Who bumped this duck recently (the jostle meter). */
  bumpers: { id: string; at: number }[];
  /** Held direction(s), as a unit vector on the ground; null when nothing's held. */
  hold: { x: number; z: number } | null;
  /** A press's burst of speed lasts until this; the next one is ready at boostReady. */
  boostUntil: number;
  boostReady: number;
};

export type Bounds = { halfWidth: number; halfDepth: number };

/** One press moves the duck this far. */
export const STEP = 0.75;
/** Waddle speed, units per second. */
export const SPEED = 2.6;
/** At most this many steps can be queued ahead of the duck. */
const MAX_QUEUED_STEPS = 2;
/** While a direction is held, the duck aims this far ahead (so letting go stops it promptly). */
const HOLD_LEAD = 0.35;
/**
 * A fresh press: this much faster, this briefly, at most this often. Very
 * slight on purpose: tapping flat out beats holding by only ~7%.
 */
export const BOOST = 1.3;
export const BOOST_SECONDS = 0.12;
export const BOOST_COOLDOWN = 0.5;
/** …and a little skip to show it. */
const BOOST_HOP = 1.5;

/**
 * Body capsule in the duck's own frame (x forward), in world units: a segment
 * from the rump to the chest, fattened by the body's half-width. Matches the
 * mascot as rendered (sculpt.ts at its 0.85 scale).
 */
export const BODY = { back: -0.3, front: 0.18, radius: 0.32 };
/** The head sits this far ahead of the body origin (plus a little bill). */
export const HEAD = { forward: 0.62, radius: 0.22 };
/** Neighbours within this distance of a head make the neck bend away. */
const NECK_SENSE = 0.75;
const NECK_MAX_YAW = 0.95;
const NECK_MAX_PITCH = 0.35;
/** Collision passes per update: more = steadier crowds. */
const COLLISION_PASSES = 6;
/** A bump knocks ducks apart at this speed (units/s), fading fast. */
const BUMP_SPEED = 2.2;
const BUMP_DECAY = 7;
/** A bump needs ducks closing at least this fast (so jostling at rest doesn't count). */
const BUMP_MIN_CLOSING = 0.8;
/** No re-bumping the same duck for this long (seconds). */
const BUMP_COOLDOWN = 0.9;
const BUMP_SECONDS = 0.5;
/**
 * Jostling: bumps from *different* ducks within this window (seconds) build up. Each
 * bump makes a hop, higher the more ducks have bumped you; at FLY_AT distinct
 * bumpers you're launched over the crowd. Two ducks bumping each other only
 * ever count as one bumper, so a pair can never launch.
 */
const JOSTLE_WINDOW = 2;
export const FLY_AT = 3;
const HOP_SPEED = 2.0;
const HOP_PER_BUMPER = 0.5;
const HOP_GRAVITY = 14;
/** Take-off: up about 2.5 units, gliding ~4 units clear, for ~1.7 s. */
const FLY_LAUNCH = 6;
const FLY_GRAVITY = 7;
const FLY_GLIDE = 2.5;
const FLY_COOLDOWN = 3;
/** Above this height a duck clears the others' backs: no collisions. */
const FLY_CLEAR = 0.5;
/** A duck blocked within this distance of its goal settles where it is. */
const BLOCKED_GIVE_UP = 1.6;
/** …and any duck that's made no headway for this long gives up too. */
const STUCK_GIVE_UP = 0.5;

/** Kept for callers that want a simple "how close is too close" number. */
export const PERSONAL_SPACE = BODY.radius;

/** Screen-relative directions: up is away from the camera. */
const DIR: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function makeWalker(id: string, x: number, z: number, rest: DuckAnim = "idle"): Walker {
  return {
    id,
    x,
    z,
    heading: -Math.PI / 2, // facing the camera
    tx: x,
    tz: z,
    emote: null,
    emoteUntil: 0,
    rest,
    nextWander: 0,
    anim: rest,
    neckYaw: 0,
    neckPitch: 0,
    stuck: 0,
    kx: 0,
    kz: 0,
    bumpCooldown: 0,
    air: 0,
    vy: 0,
    flying: false,
    fx: 0,
    fz: 0,
    flyCooldown: 0,
    bumpers: [],
    hold: null,
    boostUntil: 0,
    boostReady: 0,
  };
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

export function isMoving(w: Walker): boolean {
  return Math.hypot(w.tx - w.x, w.tz - w.z) > 0.02;
}

/** Queue one step in a direction (ignored if already two steps behind). */
export function stepWalker(w: Walker, dir: Dir, bounds: Bounds): boolean {
  const d = DIR[dir];
  if (!d) return false;
  if (Math.hypot(w.tx - w.x, w.tz - w.z) > STEP * (MAX_QUEUED_STEPS - 0.5)) return false;
  w.tx = clamp(w.tx + d[0] * STEP, bounds.halfWidth);
  w.tz = clamp(w.tz + d[1] * STEP, bounds.halfDepth);
  return true;
}

/**
 * A fresh press of a direction (not auto-repeat): one step, plus a very
 * slight burst of speed if one's ready.
 */
export function pressWalker(w: Walker, dir: Dir, bounds: Bounds, now: number): boolean {
  const stepped = stepWalker(w, dir, bounds);
  if (DIR[dir] && now >= w.boostReady && !w.flying) {
    w.boostUntil = now + BOOST_SECONDS;
    w.boostReady = now + BOOST_COOLDOWN;
    if (w.air === 0) w.vy = Math.max(w.vy, BOOST_HOP);
  }
  return stepped;
}

/** The directions currently held (two at once walks diagonally); [] lets go. */
export function holdWalker(w: Walker, dirs: Dir[]) {
  let x = 0;
  let z = 0;
  for (const d of new Set(dirs)) {
    const v = DIR[d];
    if (!v) continue;
    x += v[0];
    z += v[1];
  }
  const len = Math.hypot(x, z);
  w.hold = len > 1e-6 ? { x: x / len, z: z / len } : null;
}

export function emote(w: Walker, anim: DuckAnim, now: number, seconds = 1.3) {
  w.emote = anim;
  w.emoteUntil = now + seconds;
}

/** Angle difference wrapped into (-π, π]. */
function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// --- geometry ---------------------------------------------------------------

type V = { x: number; z: number };

/** The duck's forward direction on the ground (heading 0 faces +x). */
export function forward(w: Walker): V {
  return { x: Math.cos(w.heading), z: -Math.sin(w.heading) };
}

/** The duck's left side (its local +z) on the ground. */
function side(w: Walker): V {
  return { x: Math.sin(w.heading), z: Math.cos(w.heading) };
}

export function bodySegment(w: Walker): [V, V] {
  const f = forward(w);
  return [
    { x: w.x + f.x * BODY.back, z: w.z + f.z * BODY.back },
    { x: w.x + f.x * BODY.front, z: w.z + f.z * BODY.front },
  ];
}

export function headPoint(w: Walker): V {
  const f = forward(w);
  return { x: w.x + f.x * HEAD.forward, z: w.z + f.z * HEAD.forward };
}

function closestOnSegment(p: V, a: V, b: V): V {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2)) : 0;
  return { x: a.x + abx * t, z: a.z + abz * t };
}

/** Where segments ab and cd cross, if they do. */
function intersection(a: V, b: V, c: V, d: V): V | null {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const denom = r.x * s.z - r.z * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / denom;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}

/** Closest points between segments ab and cd (2D). */
export function closestBetweenSegments(a: V, b: V, c: V, d: V): [V, V] {
  // Crossing segments touch at their intersection.
  const hit = intersection(a, b, c, d);
  if (hit) return [hit, hit];
  // Otherwise the closest pair always involves an endpoint.
  const candidates: [V, V][] = [
    [a, closestOnSegment(a, c, d)],
    [b, closestOnSegment(b, c, d)],
    [closestOnSegment(c, a, b), c],
    [closestOnSegment(d, a, b), d],
  ];
  let best = candidates[0];
  let bestD = Infinity;
  for (const [p, q] of candidates) {
    const dd = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = [p, q];
    }
  }
  return best;
}

/** Gap between two ducks' body capsules (negative = overlapping). */
export function bodyGap(a: Walker, b: Walker): number {
  const [a0, a1] = bodySegment(a);
  const [b0, b1] = bodySegment(b);
  const [p, q] = closestBetweenSegments(a0, a1, b0, b1);
  return Math.hypot(p.x - q.x, p.z - q.z) - BODY.radius * 2;
}

/**
 * How much of a bump a duck absorbs: a standing duck mostly holds its ground
 * (it gets only a slight nudge) and a waddling one slides around it; two
 * ducks on the move jostle evenly.
 */
const STANDING_SHARE = 0.35;

/** Push two ducks' bodies apart if they overlap. Returns true if they did. */
function separate(a: Walker, b: Walker, aStanding: boolean, bStanding: boolean): boolean {
  const [a0, a1] = bodySegment(a);
  const [b0, b1] = bodySegment(b);
  const [p, q] = closestBetweenSegments(a0, a1, b0, b1);
  let nx = q.x - p.x;
  let nz = q.z - p.z;
  let d = Math.hypot(nx, nz);
  const min = BODY.radius * 2;
  if (d >= min) return false;
  let overlap = min - d;
  if (d < 1e-5) {
    // Crossing or stacked: push centre from centre, by the full width.
    nx = b.x - a.x || 1;
    nz = b.z - a.z;
    d = Math.hypot(nx, nz);
    overlap = min;
  }
  const aShare = aStanding === bStanding ? 0.5 : aStanding ? STANDING_SHARE : 1 - STANDING_SHARE;
  const ux = nx / d;
  const uz = nz / d;
  a.x -= ux * overlap * aShare;
  a.z -= uz * overlap * aShare;
  b.x += ux * overlap * (1 - aShare);
  b.z += uz * overlap * (1 - aShare);
  return true;
}

function confine(w: Walker, bounds: Bounds, radius?: number) {
  w.x = clamp(w.x, bounds.halfWidth);
  w.z = clamp(w.z, bounds.halfDepth);
  if (radius !== undefined) {
    const r = Math.hypot(w.x, w.z);
    if (r > radius) {
      w.x *= radius / r;
      w.z *= radius / r;
    }
  }
}

/**
 * A real bump (ducks closing fast, not just resting shoulder to shoulder):
 * both get knocked back a little, flap and honk. Standing ducks take less of
 * the knock, as with pushes.
 */
function maybeBump(
  a: Walker,
  b: Walker,
  before: Map<Walker, { x: number; z: number }>,
  now: number,
  dt: number,
  idle: Set<Walker>,
) {
  if (bodyGap(a, b) > 0.02) return;
  if (now < a.bumpCooldown || now < b.bumpCooldown) return;
  const pa = before.get(a);
  const pb = before.get(b);
  if (!pa || !pb) return;
  let nx = b.x - a.x;
  let nz = b.z - a.z;
  const d = Math.hypot(nx, nz) || 1;
  nx /= d;
  nz /= d;
  // Closing speed along the line between them, from this step's movement.
  const va = { x: a.x - pa.x, z: a.z - pa.z };
  const vb = { x: b.x - pb.x, z: b.z - pb.z };
  const closing = ((va.x - vb.x) * nx + (va.z - vb.z) * nz) / Math.max(1e-3, dt);
  if (closing < BUMP_MIN_CLOSING) return;
  const aShare = idle.has(a) === idle.has(b) ? 0.5 : idle.has(a) ? STANDING_SHARE : 1 - STANDING_SHARE;
  a.kx -= nx * BUMP_SPEED * aShare * 2;
  a.kz -= nz * BUMP_SPEED * aShare * 2;
  b.kx += nx * BUMP_SPEED * (1 - aShare) * 2;
  b.kz += nz * BUMP_SPEED * (1 - aShare) * 2;
  for (const [w, other] of [
    [a, b],
    [b, a],
  ] as const) {
    emote(w, "bump", now, BUMP_SECONDS);
    w.bumpCooldown = now + BUMP_COOLDOWN;
    jostle(w, other.id, now);
  }
}

/** Distinct ducks that bumped this one within the jostle window. */
export function jostleLevel(w: Walker, now: number): number {
  return new Set(w.bumpers.filter((b) => now - b.at <= JOSTLE_WINDOW).map((b) => b.id)).size;
}

/** A bump lands: hop (higher with more bumpers), or take off over the crowd. */
function jostle(w: Walker, by: string, now: number) {
  w.bumpers = w.bumpers.filter((b) => now - b.at <= JOSTLE_WINDOW);
  w.bumpers.push({ id: by, at: now });
  if (w.flying) return;
  const level = jostleLevel(w, now);
  if (level >= FLY_AT && now >= w.flyCooldown) {
    // Launch away from the crush: the way the knock-back is already pushing.
    const kick = Math.hypot(w.kx, w.kz);
    const ux = kick > 1e-3 ? w.kx / kick : Math.cos(w.heading);
    const uz = kick > 1e-3 ? w.kz / kick : -Math.sin(w.heading);
    w.flying = true;
    w.vy = FLY_LAUNCH;
    w.fx = ux * FLY_GLIDE;
    w.fz = uz * FLY_GLIDE;
    w.kx = w.kz = 0;
    w.bumpers = [];
    return;
  }
  w.vy = Math.max(w.vy, HOP_SPEED * (1 + HOP_PER_BUMPER * (level - 1)));
}

/** How far ahead a waddling duck looks for someone to go round. */
const LOOK_AHEAD = 1.5;
const AVOID_STRENGTH = 1.6;

/**
 * Avoidance steering: start from the straight line to the target and bend it
 * away from ducks just ahead on that line (more for closer, more central
 * ones), like walking round people in a crowd. Ducks standing on the target
 * itself aren't dodged (that's "the spot's taken", handled by settling).
 */
function steer(w: Walker, all: Walker[], dx: number, dz: number, dist: number): [number, number] {
  const px = -dz; // perpendicular, to the duck's left of travel
  const pz = dx;
  const clearance = BODY.radius * 2 + 0.05;
  let ax = 0;
  let az = 0;
  for (const o of all) {
    if (o === w) continue;
    const rx = o.x - w.x;
    const rz = o.z - w.z;
    const ahead = rx * dx + rz * dz;
    if (ahead <= 0 || ahead > Math.min(LOOK_AHEAD, dist + BODY.radius)) continue;
    const lateral = rx * px + rz * pz;
    if (Math.abs(lateral) >= clearance) continue;
    // Go round on the side with more room; dead centre: keep left.
    const away = lateral > 0 ? -1 : 1;
    const urgency = (1 - ahead / LOOK_AHEAD) * (1 - Math.abs(lateral) / clearance);
    ax += px * away * urgency;
    az += pz * away * urgency;
  }
  const sx = dx + ax * AVOID_STRENGTH;
  const sz = dz + az * AVOID_STRENGTH;
  const len = Math.hypot(sx, sz) || 1;
  return [sx / len, sz / len];
}

// --- update -------------------------------------------------------------------

export type UpdateOptions = {
  bounds: Bounds;
  /** Ids that wander on their own (everyone except player-controlled ducks). */
  wanderers?: Set<string>;
  rand?: () => number;
  /** Keep ducks inside this circle as well as the bounds (arenas). */
  radius?: number;
};

/** Longest physics step: bigger ticks (e.g. the server's 10 Hz) are split up. */
const MAX_SUBSTEP = 1 / 30;

/** Advance the flock by `dt` seconds; `now` is the clock in seconds. */
export function updateFlock(walkers: Walker[], dt: number, now: number, opts: UpdateOptions) {
  const total = Math.min(dt, 0.25); // don't teleport after a stalled frame
  const n = Math.max(1, Math.ceil(total / MAX_SUBSTEP));
  for (let i = 0; i < n; i++) stepFlock(walkers, total / n, now - total + ((i + 1) * total) / n, opts);
}

function stepFlock(walkers: Walker[], step: number, now: number, opts: UpdateOptions) {
  const { bounds, wanderers, rand = Math.random, radius } = opts;
  const arrived = (w: Walker) => Math.hypot(w.tx - w.x, w.tz - w.z) < 1e-4;
  // Where each duck was, and how far from its target, before this update:
  // to tell "crowd at my goal" and "can't move at all" from sliding past someone.
  const before = new Map(
    walkers.map((w) => [w, { x: w.x, z: w.z, left: Math.hypot(w.tx - w.x, w.tz - w.z) }]),
  );

  for (const w of walkers) {
    // Wander: an occasional short stroll, sometimes a little emote.
    if (wanderers?.has(w.id) && now >= w.nextWander && !isMoving(w)) {
      w.nextWander = now + 1.5 + rand() * 4;
      if (rand() < 0.15) {
        emote(w, (["quack", "flap", "dance"] as const)[Math.floor(rand() * 3)], now, 1.4);
      } else {
        const dirs: Dir[] = ["up", "down", "left", "right"];
        const dir = dirs[Math.floor(rand() * 4)];
        stepWalker(w, dir, bounds);
        if (rand() < 0.5) stepWalker(w, dir, bounds);
      }
    }

    // Up in the air: hops fall back fast; flights glide, then land.
    if (w.air > 0 || w.vy > 0) {
      w.vy -= (w.flying ? FLY_GRAVITY : HOP_GRAVITY) * step;
      w.air += w.vy * step;
      if (w.flying) {
        w.x += w.fx * step;
        w.z += w.fz * step;
      }
      if (w.air <= 0) {
        w.air = 0;
        w.vy = 0;
        if (w.flying) {
          w.flying = false;
          w.flyCooldown = now + FLY_COOLDOWN;
          // Landed somewhere new: carry on from here.
          w.tx = w.x;
          w.tz = w.z;
        }
      }
    }

    // Holding a direction: keep the target just ahead, so the duck walks on
    // until it's let go (any step already queued that way still counts).
    if (w.hold && !w.flying) {
      const ahead = (w.tx - w.x) * w.hold.x + (w.tz - w.z) * w.hold.z;
      const lead = Math.max(ahead, HOLD_LEAD);
      w.tx = clamp(w.x + w.hold.x * lead, bounds.halfWidth);
      w.tz = clamp(w.z + w.hold.z * lead, bounds.halfDepth);
    }

    // Knock-back from a recent bump, fading out.
    if (w.kx !== 0 || w.kz !== 0) {
      w.x += w.kx * step;
      w.z += w.kz * step;
      const fade = Math.exp(-BUMP_DECAY * step);
      w.kx *= fade;
      w.kz *= fade;
      if (Math.hypot(w.kx, w.kz) < 0.02) w.kx = w.kz = 0;
    }

    // Waddle toward the target, veering round anyone in the way, and turn
    // to face where we're going.
    const dx = w.tx - w.x;
    const dz = w.tz - w.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-6 && !w.flying) {
      const [mx, mz] = steer(w, walkers, dx / dist, dz / dist, dist);
      // Finish the step exactly (the "moving" check uses a looser threshold).
      const speed = now < w.boostUntil ? SPEED * BOOST : SPEED;
      const move = Math.min(dist, speed * step);
      w.x += mx * move;
      w.z += mz * move;
      if (dist > 0.02) {
        const face = Math.atan2(-mz, mx);
        w.heading += angleDelta(w.heading, face) * Math.min(1, step * 12);
      }
    }
  }

  // Body collisions: capsules pushed apart over a few passes. Ducks standing
  // still settle where they're nudged; moving ducks keep pushing on.
  const idle = new Set(walkers.filter(arrived));
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    let any = false;
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i];
        const b = walkers[j];
        // Cheap reject: centres too far apart for the capsules to touch.
        const reach = (Math.max(-BODY.back, BODY.front) + BODY.radius) * 2;
        if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
        // Flying over everyone's backs.
        if (a.air > FLY_CLEAR || b.air > FLY_CLEAR) continue;
        if (pass === 0) maybeBump(a, b, before, now, step, idle);
        if (separate(a, b, idle.has(a), idle.has(b))) any = true;
      }
    }
    // Keep everyone inside as part of each pass, so the edge can't push
    // ducks back into each other afterwards.
    for (const w of walkers) confine(w, bounds, radius);
    if (!any) break;
  }

  for (const w of walkers) {
    confine(w, bounds, radius);
    // Settle: idle ducks stay where they were nudged, and a duck that's
    // blocked close to its goal (a crowd's already there) stops pushing.
    const left = Math.hypot(w.tx - w.x, w.tz - w.z);
    const was = before.get(w);
    const expected = SPEED * step;
    // Not getting closer (e.g. a crowd is already standing on the spot)…
    const noProgress = left > 1e-4 && was !== undefined && left >= was.left - expected * 0.2;
    // …or not moving at all (sliding round someone still counts as moving).
    const moved = was ? Math.hypot(w.x - was.x, w.z - was.z) : expected;
    w.stuck = left > 1e-4 && moved < expected * 0.3 ? w.stuck + step : 0;
    // (A duck whose player is holding a direction keeps pushing.)
    const givesUp = !w.hold && ((noProgress && left < BLOCKED_GIVE_UP) || w.stuck > STUCK_GIVE_UP);
    if (idle.has(w) || givesUp) {
      w.tx = w.x;
      w.tz = w.z;
      w.stuck = 0;
    }
    if (w.emote && now >= w.emoteUntil) w.emote = null;
    w.anim = w.flying ? "fly" : (w.emote ?? (isMoving(w) ? "waddle" : w.rest));
  }

  bendNecks(walkers, step);
}

/**
 * Bend each neck away from the nearest neighbour near its head: turn aside
 * (yaw) and lift the bill a little if the obstacle is dead ahead.
 */
function bendNecks(walkers: Walker[], dt: number) {
  const k = Math.min(1, dt * 8);
  for (const w of walkers) {
    const h = headPoint(w);
    const f = forward(w);
    const l = side(w);
    let best = NECK_SENSE;
    let lateral = 0;
    let ahead = 0;
    for (const o of walkers) {
      if (o === w) continue;
      if (Math.abs(o.x - w.x) > 2.2 || Math.abs(o.z - w.z) > 2.2) continue;
      const [o0, o1] = bodySegment(o);
      // Nearest bit of the other duck: its body or its head.
      const onBody = closestOnSegment(h, o0, o1);
      const oh = headPoint(o);
      const candidates: [V, number][] = [
        [onBody, BODY.radius],
        [oh, HEAD.radius],
      ];
      for (const [p, r] of candidates) {
        const dx = p.x - h.x;
        const dz = p.z - h.z;
        const d = Math.hypot(dx, dz) - r;
        if (d < best) {
          best = d;
          lateral = dx * l.x + dz * l.z;
          ahead = dx * f.x + dz * f.z;
        }
      }
    }
    let yaw = 0;
    let pitch = 0;
    if (best < NECK_SENSE) {
      const urgency = 1 - Math.max(0, best) / NECK_SENSE;
      // Obstacle on our left (+z side) → turn the bill right, and vice versa.
      const away = lateral >= 0 ? 1 : -1;
      yaw = away * NECK_MAX_YAW * urgency;
      // Something dead ahead: also lift the head up and over.
      if (ahead > 0) pitch = NECK_MAX_PITCH * urgency * Math.min(1, ahead / 0.4);
    }
    w.neckYaw += (yaw - w.neckYaw) * k;
    w.neckPitch += (pitch - w.neckPitch) * k;
  }
}

/** Starting spots: a loose grid, jittered so it doesn't look like a parade. */
export function scatter(count: number, spacing = 1.35, rand = Math.random) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.7)));
  const rows = Math.ceil(count / cols);
  const spots: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    spots.push([
      (c - (cols - 1) / 2) * spacing + (rand() - 0.5) * 0.4,
      (r - (rows - 1) / 2) * spacing + (rand() - 0.5) * 0.4,
    ]);
  }
  const bounds: Bounds = {
    halfWidth: ((cols - 1) / 2) * spacing + 1.2,
    halfDepth: ((rows - 1) / 2) * spacing + 1.2,
  };
  return { spots, bounds };
}
