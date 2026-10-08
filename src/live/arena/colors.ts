/** Zone colours, matching the answer pad's option colours (components.tsx). */
export const ZONE_COLORS = ["#0284c7", "#f59e0b", "#059669", "#e11d48", "#7c3aed", "#0d9488"];

const ARROWS: [number, string][] = [
  [0, "→"],
  [Math.PI / 2, "↑"],
  [Math.PI, "←"],
  [-Math.PI / 2, "↓"],
];

/** "↑1": the arrow that walks you there (if it's a straight direction) and the number key. */
export function zoneBadge(index: number, angle: number): string {
  const hit = ARROWS.find(([a]) => Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a))) < 0.01);
  return hit ? `${hit[1]}${index + 1}` : `${index + 1}`;
}
