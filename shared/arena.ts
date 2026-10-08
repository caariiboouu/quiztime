/**
 * The answer arena: a multiple-choice question played by walking. Every
 * player's duck starts in a neutral circle in the middle; each answer owns a
 * wedge of ground around it, and wherever your duck stands when time runs out
 * is your answer.
 *
 * Wedges point the same way as the answer pad (2 options: left/right;
 * 3: left/up/right; 4: up/left/right/down), so "up" means option 1 whether
 * you tap the pad or waddle. More options are spaced evenly.
 *
 * Angles are on the ground, measured with screen-right = 0 and screen-up
 * (away from the camera, −z) = +π/2.
 */
import type { Bounds, Dir } from "./flock";

export type ArenaZone = {
  /** Option index this zone answers. */
  index: number;
  /** Centre direction of the wedge. */
  angle: number;
  /** The wedge runs counter-clockwise from `start` for `span` radians. */
  start: number;
  span: number;
  /** Where its label floats, and a good spot to waddle to. */
  label: { x: number; z: number };
};

export type ArenaLayout = {
  options: number;
  /** Everyone starts huddled inside this radius. */
  spawn: number;
  /** No-answer circle in the middle: the huddle plus a walk to any answer. */
  neutral: number;
  /** Outer edge of the arena. */
  radius: number;
  zones: ArenaZone[];
  bounds: Bounds;
};

/** Same directions as the answer pad (src/live/components.tsx). */
const PAD_DIRS: Record<number, Dir[]> = {
  2: ["left", "right"],
  3: ["left", "up", "right"],
  4: ["up", "left", "right", "down"],
};
const DIR_ANGLE: Record<Dir, number> = {
  right: 0,
  up: Math.PI / 2,
  left: Math.PI,
  down: -Math.PI / 2,
};

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;
/** Smallest absolute difference between two angles. */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(norm(a) - norm(b));
  return Math.min(d, TAU - d);
}

/**
 * The waiting room: an open pond-side patch with no answers, where everyone
 * who's joined can waddle about and get used to the controls before the
 * game starts. Fixed size, so server and clients agree however many join.
 */
export const LOBBY_RADIUS = 7;
export function lobbyLayout(): ArenaLayout {
  return {
    options: 0,
    spawn: 2.6,
    neutral: LOBBY_RADIUS,
    radius: LOBBY_RADIUS,
    zones: [],
    bounds: { halfWidth: LOBBY_RADIUS, halfDepth: LOBBY_RADIUS },
  };
}

/** Nose to tail, roughly, at the size ducks are drawn. */
export const DUCK_LENGTH = 1.3;
/** Every answer is at least this many duck lengths' waddle from the huddle. */
export const MIN_TRAVEL_DUCKS = 2;
/**
 * Size of the neutral middle, by crowd: grows with the square root of the
 * number of players (the huddle's area grows with the crowd), so a handful
 * of players have a short walk and a full room more room to jostle. About
 * 7.2 across the radius for 30 players, 6 for 12, 5.1 for 4.
 */
const NEUTRAL_BASE = 3.9;
const NEUTRAL_PER_ROOT_PLAYER = 0.6;
/** Zone depth: how far from the neutral circle to the arena's edge. */
const ZONE_DEPTH = 3.8;

export function arenaLayout(options: number, players: number): ArenaLayout {
  const n = Math.max(2, Math.floor(options));
  // A huddle just big enough for everyone, then a proper walk to any answer.
  const spawn = Math.max(1.0, Math.sqrt(Math.max(1, players)) * 0.46);
  const neutral = Math.max(
    NEUTRAL_BASE + NEUTRAL_PER_ROOT_PLAYER * Math.sqrt(Math.max(1, players)),
    // Always a little walk from the huddle to any answer.
    spawn + MIN_TRAVEL_DUCKS * DUCK_LENGTH,
  );
  const radius = neutral + ZONE_DEPTH;
  const angles = PAD_DIRS[n]
    ? PAD_DIRS[n].map((d) => DIR_ANGLE[d])
    : Array.from({ length: n }, (_, i) => Math.PI / 2 - (i * TAU) / n);

  // Each wedge runs between the midpoints to its angular neighbours.
  const order = angles.map((a, i) => ({ a: norm(a), i })).sort((x, y) => x.a - y.a);
  const zones: ArenaZone[] = new Array(n);
  order.forEach(({ a, i }, k) => {
    const prev = order[(k - 1 + n) % n].a;
    const next = order[(k + 1) % n].a;
    const gapPrev = norm(a - prev) || TAU;
    const gapNext = norm(next - a) || TAU;
    const start = norm(a - gapPrev / 2);
    const span = gapPrev / 2 + gapNext / 2;
    const mid = (neutral + radius) / 2;
    zones[i] = {
      index: i,
      angle: angles[i],
      start,
      span,
      label: { x: Math.cos(angles[i]) * mid, z: -Math.sin(angles[i]) * mid },
    };
  });

  return {
    options: n,
    spawn,
    neutral,
    radius,
    zones,
    bounds: { halfWidth: radius, halfDepth: radius },
  };
}

/** Which option a duck standing at (x, z) is answering, or null in the middle. */
export function zoneAt(layout: ArenaLayout, x: number, z: number): number | null {
  if (Math.hypot(x, z) < layout.neutral) return null;
  const a = Math.atan2(-z, x);
  let best = 0;
  let bestD = Infinity;
  for (const zone of layout.zones) {
    const d = angleBetween(a, zone.angle);
    if (d < bestD) {
      bestD = d;
      best = zone.index;
    }
  }
  return best;
}

/**
 * Starting spots in the central huddle: a sunflower spiral, so any number of
 * ducks spread evenly. Spot i is stable as more players are added.
 */
export function spawnPoint(layout: ArenaLayout, i: number, total: number): { x: number; z: number } {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const r = layout.spawn * Math.sqrt((i + 0.5) / Math.max(1, total));
  const a = i * golden;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/**
 * A spot well inside a zone, for "waddle straight to answer N". Jitters in
 * −0.5…0.5 spread ducks across the wedge (depth, then sideways) so a crowd
 * heading for the same answer doesn't pile onto one point.
 */
export function zoneTarget(
  layout: ArenaLayout,
  index: number,
  jitter = 0,
  sideways = jitter,
): { x: number; z: number } {
  const zone = layout.zones[index];
  const depth = layout.radius - layout.neutral;
  const r = (layout.neutral + layout.radius) / 2 + jitter * depth * 0.6;
  const a = zone.angle + sideways * Math.min(zone.span, Math.PI) * 0.6;
  return { x: Math.cos(a) * r, z: -Math.sin(a) * r };
}
