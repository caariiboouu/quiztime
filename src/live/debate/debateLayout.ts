import type { DebateSide } from "../../../shared/protocol";
import type { StageHome, StagePlatform, StageView } from "../sideview/SideStage";

/** Ducks this far apart, side by side (a bit more than SIDE_WIDTH). */
const GAP = 1.1;
/**
 * A crowded side squeezes up, shoulder to shoulder, rather than spilling off
 * the floor. The floor grows 0.62 per duck, so even a whole room on one side
 * fits at about this spacing.
 */
const MIN_GAP = 0.6;
/** The best argument's pedestal is this tall. */
export const TOP_PEDESTAL = 2.4;
const FLOOR = { x0: 0, x1: 0, y: 0, solid: true, style: "floor" as const, color: "#cfe3c8" };

export type DebateDuck = { id: string; side: DebateSide | null };

/**
 * The debate floor side-on: "for" ducks on the left, "against" on the right,
 * the undecided in the middle, each side filling outwards from the middle.
 * Once revealed, every argued duck gets a pedestal under its feet, as tall as
 * its argument was good (`levels`, 0 = best of `levelCount`); the worst stays
 * on the floor. The view is sized for the whole room, so it doesn't jump about
 * as ducks change sides.
 */
export function debateLayout(
  ducks: DebateDuck[],
  levels?: Record<string, number>,
  levelCount = 0,
): { platforms: StagePlatform[]; homes: Map<string, StageHome>; view: StageView; half: number } {
  const half = Math.max(5.5, 1.6 + ducks.length * 0.62);
  const mid = ducks.filter((d) => !d.side);
  const sides = { for: ducks.filter((d) => d.side === "for"), against: ducks.filter((d) => d.side === "against") };

  const homes = new Map<string, StageHome>();
  const midGap = Math.min(GAP, mid.length > 1 ? (2 * half - 1) / (mid.length - 1) : GAP);
  mid.forEach((d, i) => homes.set(d.id, { x: (i - (mid.length - 1) / 2) * midGap, ground: 0 }));
  // The sides start just past the undecided, and squeeze up if they run out of room.
  const start = Math.min(half / 2, mid.length ? ((mid.length - 1) * midGap) / 2 + 0.95 : 0.7);
  const room = half - 0.55 - start;
  const xs = new Map<string, number>();
  const gaps = { for: GAP, against: GAP };
  for (const [side, dir] of [["for", -1], ["against", 1]] as const) {
    const list = sides[side];
    const gap = list.length > 1 ? Math.max(MIN_GAP, Math.min(GAP, room / (list.length - 1))) : GAP;
    gaps[side] = gap;
    list.forEach((d, i) => xs.set(d.id, dir * (start + i * gap)));
  }

  const platforms: StagePlatform[] = [{ ...FLOOR, x0: -half, x1: half }];
  const revealed = levels && levelCount > 1;
  const step = revealed ? TOP_PEDESTAL / (levelCount - 1) : 0;
  for (const d of [...sides.for, ...sides.against]) {
    const x = xs.get(d.id)!;
    if (!revealed) {
      homes.set(d.id, { x, ground: 0 });
      continue;
    }
    // One pedestal per argued duck, in a steady order, so a changed verdict just
    // grows or shrinks the same block.
    const level = Math.max(0, Math.min(levelCount - 1, levels[d.id] ?? levelCount - 1));
    const height = (levelCount - 1 - level) * step;
    // Squeezed-up ducks get narrower pedestals, so neighbours never overlap.
    const w = Math.min(0.47, gaps[d.side!] / 2 - 0.03);
    platforms.push({
      x0: x - w,
      x1: x + w,
      y: height,
      base: 0,
      rise: 0.5 + height * 0.45,
      riseDelay: 1.1,
      style: "block",
      color: d.side === "for" ? "#7cc4f0" : "#f6a3b4",
    });
    homes.set(d.id, { x, ground: height > 0 ? platforms.length - 1 : 0 });
  }
  return { platforms, homes, view: { minX: -half, maxX: half, minY: -1.1, maxY: TOP_PEDESTAL + 2.1 }, half };
}

/** What the two sides are called on screen. */
export function debateNames(sides?: { for: string; against: string }) {
  return { for: sides?.for || "For", against: sides?.against || "Against" };
}
