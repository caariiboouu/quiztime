import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { Vector3 } from "three";
import type { ArenaLayout } from "../../../shared/arena";
import { ZONE_COLORS, zoneBadge } from "./colors";

/** Space kept between pinned cards and the edge of the view (px). */
const EDGE = 8;

/**
 * The answers as cards over the 3D view, each tied to its zone: just outside
 * the zone's rim when there's room (so it never hides the ducks standing on
 * it), otherwise pinned to the edge of the screen in its direction (with an
 * arrow), sliding along as you walk, until it comes into view. Plain page
 * text, so a full sentence wraps cleanly.
 */
export function ZoneCards({
  options,
  layout,
  refs,
  current,
  reveal,
}: {
  options: { id: string; text: string }[];
  layout: ArenaLayout;
  refs: React.RefObject<(HTMLDivElement | null)[]>;
  /** The answer your duck is standing on. */
  current?: number | null;
  reveal?: { correctIndex: number | null } | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {options.map((o, i) => {
        const zone = layout.zones[i];
        if (!zone) return null;
        const color = ZONE_COLORS[i % ZONE_COLORS.length];
        const correct = reveal?.correctIndex === i;
        const dim = reveal != null && reveal.correctIndex !== null && !correct;
        return (
          <div
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`absolute left-0 top-0 rounded-xl border-[3px] bg-white/95 px-1.5 py-1 shadow-lg transition-opacity sm:px-2.5 sm:py-1.5 ${
              current === i ? "ring-4 ring-amber-400" : ""
            } ${dim ? "opacity-40" : ""} ${correct ? "scale-105" : ""}`}
            style={{ borderColor: color, maxWidth: "min(17rem, 44%)", visibility: "hidden" }}
          >
            {/* points toward the zone while the card is pinned to an edge */}
            <span
              data-arrow
              className="absolute left-1/2 top-1/2 h-0 w-0"
              style={{
                borderTop: "9px solid transparent",
                borderBottom: "9px solid transparent",
                borderLeft: `14px solid ${color}`,
                opacity: 0,
              }}
            />
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-xs font-black text-white"
                style={{ background: color }}
              >
                {zoneBadge(i, zone.angle)}
              </span>
              {/* Small screens: one line here, full text in the list below the arena. */}
              <span className="line-clamp-1 text-[11px] font-semibold leading-snug text-neutral-900 sm:line-clamp-5 sm:text-sm">
                {correct && "✓ "}
                {o.text}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Gap between a card and the rim of its zone (px). */
const GAP = 6;
/** Anchors sit at about duck-head height, so cards clear the ducks' heads. */
const ANCHOR_HEIGHT = 1;

/**
 * Inside the canvas: each frame, put each answer card just outside the rim of
 * its zone, pushed outward (away from the arena's middle) so it never covers
 * the ducks standing on that answer, and you can see your own duck there. If
 * there isn't room on screen, the card is pinned to the edge in its zone's
 * direction instead, with an arrow.
 */
export function ZoneCardTracker({
  layout,
  refs,
  safeBottom = 0,
}: {
  layout: ArenaLayout;
  refs: React.RefObject<(HTMLDivElement | null)[]>;
  /** Keep cards above this many px at the bottom (on-screen controls live there). */
  safeBottom?: number;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const anchors = useMemo(() => {
    const r = layout.radius + 0.2;
    return layout.zones.map(
      (z) => new Vector3(Math.cos(z.angle) * r, ANCHOR_HEIGHT, -Math.sin(z.angle) * r),
    );
  }, [layout]);
  const middle = useMemo(() => new Vector3(0, ANCHOR_HEIGHT, 0), []);
  const p = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const W = size.width;
    // Cards live in the area above any on-screen controls.
    const H = Math.max(120, size.height - safeBottom);
    const cx = W / 2;
    const cy = H / 2;
    const toScreen = (v: Vector3): [number, number, boolean] => {
      p.copy(v).project(camera);
      return [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * size.height, p.z > 1];
    };
    const [ox, oy] = toScreen(middle);
    anchors.forEach((anchor, i) => {
      const el = refs.current?.[i];
      if (!el) return;
      const [px, py, behind] = toScreen(anchor);
      let sx = px;
      let sy = py;
      // Behind the camera: flip so the direction still makes sense.
      if (behind) {
        sx = cx - (sx - cx) * 1000;
        sy = cy - (sy - cy) * 1000;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Outward on screen: from the arena's middle through the rim.
      let ux = sx - ox;
      let uy = sy - oy;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len;
      uy /= len;
      // Far enough out that the card's nearest edge just clears the rim.
      const reach = (Math.abs(ux) * w) / 2 + (Math.abs(uy) * h) / 2 + GAP;
      const halfX = Math.max(1, W / 2 - EDGE - w / 2);
      const halfY = Math.max(1, H / 2 - EDGE - h / 2);
      const dx = sx + ux * reach - cx;
      const dy = sy + uy * reach - cy;
      const inside = Math.abs(dx) <= halfX && Math.abs(dy) <= halfY;
      let x = cx + dx;
      let y = cy + dy;
      if (!inside) {
        // No room: slide in along the line toward the zone until on screen.
        const t = Math.min(halfX / Math.max(1e-6, Math.abs(dx)), halfY / Math.max(1e-6, Math.abs(dy)));
        x = cx + dx * t;
        y = cy + dy * t;
      }
      el.style.visibility = "visible";
      el.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px)`;
      const arrow = el.querySelector<HTMLElement>("[data-arrow]");
      if (arrow) {
        const angle = Math.atan2(dy, dx);
        const ax = Math.cos(angle) * (w / 2 + 4);
        const ay = Math.sin(angle) * (h / 2 + 4);
        arrow.style.opacity = inside ? "0" : "1";
        arrow.style.transform = `translate(${ax - 7}px, ${ay - 9}px) rotate(${angle}rad)`;
      }
    });
  });
  return null;
}
