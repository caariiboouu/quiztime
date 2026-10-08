/**
 * The shelf view of the Ceramic Duck Hours board: a leaderboard you read top
 * to bottom, side-on. A stepped podium at the top (1st tallest in the middle,
 * 2nd left, 3rd right) on a stage, then shelves of ducks in standings order,
 * and the floor at the bottom (where anyone who falls off ends up).
 */
import type { StageHome, StagePlatform, StageView } from "../sideview/SideStage";

/** Between ducks on a shelf, and between shelves (a jump clears it). */
const DX = 1.9;
export const SHELF_GAP = 2.7;
const PODIUM = [1.25, 0.85, 0.55];
const PODIUM_COLORS = ["#f2c84b", "#c9cfd6", "#d69a5c"];

export function shelfColumns(width: number): number {
  return width < 520 ? 3 : width < 800 ? 5 : width < 1100 ? 6 : 7;
}

export function shelfLayout(ids: string[], columns: number) {
  const rest = Math.max(0, ids.length - 3);
  const shelves = Math.ceil(rest / columns);
  const shelfWidth = Math.max(columns, 3) * DX + 0.6;
  const half = shelfWidth / 2;
  const platforms: StagePlatform[] = [{ x0: -half - 0.6, x1: half + 0.6, y: 0, solid: true, style: "floor" }];
  const homes = new Map<string, StageHome>();

  // Shelves, bottom one first in the list but filled from the top.
  const shelfY = (k: number) => SHELF_GAP * (shelves - k);
  const shelfIndex: number[] = [];
  for (let k = 0; k < shelves; k++) {
    shelfIndex.push(platforms.length);
    platforms.push({ x0: -half, x1: half, y: shelfY(k), style: "plank" });
  }
  // The podium's stage above the top shelf, and the three steps on it.
  const stageY = SHELF_GAP * (shelves + 1);
  platforms.push({ x0: -DX * 1.6, x1: DX * 1.6, y: stageY, style: "plank", color: "#b07a45" });
  const order = [1, 0, 2]; // left to right: 2nd, 1st, 3rd
  const podiumIndex: number[] = [];
  order.forEach((place, slot) => {
    const x = (slot - 1) * DX;
    podiumIndex[place] = platforms.length;
    platforms.push({
      x0: x - DX / 2 + 0.05,
      x1: x + DX / 2 - 0.05,
      y: stageY + PODIUM[place],
      base: stageY,
      solid: true,
      style: "block",
      color: PODIUM_COLORS[place],
    });
  });

  ids.forEach((id, i) => {
    if (i < 3) {
      const ground = podiumIndex[i];
      const p = platforms[ground];
      homes.set(id, { x: (p.x0 + p.x1) / 2, ground });
      return;
    }
    const k = Math.floor((i - 3) / columns);
    const c = (i - 3) % columns;
    const inRow = Math.min(columns, rest - k * columns);
    homes.set(id, { x: (c - (inRow - 1) / 2) * DX, ground: shelfIndex[k] });
  });

  const view: StageView = {
    minX: -half - 0.7,
    maxX: half + 0.7,
    minY: -0.9,
    maxY: stageY + PODIUM[0] + 1.9,
  };
  return { platforms, homes, view };
}
