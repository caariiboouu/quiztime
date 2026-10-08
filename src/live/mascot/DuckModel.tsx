import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { prefersReducedMotion } from "../minigames/three/fallbackContext";
import { REST, STILL_TIME, blendPose, poseAt, type MascotAnimation, type Pose } from "./poses";
import { applyPose, buildDuckRig, type DuckRig, type RigOptions } from "./sculpt";
import { MASCOT_LOOK, type DuckLook } from "./variants";

/**
 * The quiz mascot: a white duck with an orange bill and feet and a blue
 * ribbon at the base of its neck, sculpted as one continuous skinned body →
 * neck → head (see sculpt.ts) and animated by poses.ts.
 *
 * Faces +x, feet on y = 0, about 1.4 units tall. Drop it into any R3F scene.
 * `look` turns it into any player's duck (see variants.ts).
 */
type DuckModelProps = Omit<ThreeElements["group"], "ref"> & {
  /** An animation, or a getter read every frame (lets crowds switch without re-rendering). */
  animation?: MascotAnimation | (() => MascotAnimation);
  /** Which duck. Pass a stable object (e.g. from lookForIndex); a new one rebuilds the rig. */
  look?: DuckLook;
  detail?: RigOptions["detail"];
  shadows?: boolean;
  /** The Ceramic Duck Hours leader wears the gold crown. */
  crowned?: boolean;
  /**
   * Added on top of the animation every frame, e.g. a neck bend to keep the
   * head clear of a neighbour (see shared/flock.ts).
   */
  overlay?: () => Partial<Pose> | null;
  /** While true, hold the animation's signature pose instead of moving (read every frame). */
  hold?: () => boolean;
  /** Just the duck: no hat or neckpiece. */
  bare?: boolean;
};

const BLEND_SEC = 0.35;

export function DuckModel({
  animation = "idle",
  look = MASCOT_LOOK,
  detail = "hero",
  shadows = true,
  crowned = false,
  overlay,
  hold,
  bare = false,
  ...group
}: DuckModelProps) {
  const holder = useRef<Group>(null);
  const rig = useRef<DuckRig | null>(null);
  const state = useRef<{ name: MascotAnimation | null; held: boolean; start: number; from: Pose; now: Pose }>({
    name: null,
    held: false,
    start: 0,
    from: REST,
    now: REST,
  });
  const still = useMemo(() => prefersReducedMotion(), []);

  // Build the rig imperatively (it's a skinned mesh with bones) and tear it
  // down with the component.
  useLayoutEffect(() => {
    const parent = holder.current;
    if (!parent) return;
    const built = buildDuckRig(look, { detail, shadows, crowned, bare });
    parent.add(built.root);
    rig.current = built;
    return () => {
      parent.remove(built.root);
      built.dispose();
      rig.current = null;
    };
  }, [look, detail, shadows, crowned, bare]);

  useFrame(({ clock }) => {
    const r = rig.current;
    if (!r) return;
    const s = state.current;
    const now = clock.elapsedTime;
    const anim = typeof animation === "function" ? animation() : animation;
    const held = hold?.() ?? false;
    if (s.name !== anim || s.held !== held) {
      s.from = s.now;
      s.name = anim;
      s.held = held;
      s.start = now;
    }
    const target = poseAt(anim, still || held ? STILL_TIME[anim] : now - s.start);
    const w = still ? 1 : (now - s.start) / BLEND_SEC;
    const p = w >= 1 ? target : blendPose(s.from, target, w);
    s.now = p;
    const extra = overlay?.();
    if (extra) {
      const sum = { ...p };
      for (const [k, v] of Object.entries(extra) as [keyof Pose, number][]) sum[k] += v;
      applyPose(r, sum);
    } else {
      applyPose(r, p);
    }
  });

  return <group ref={holder} {...group} />;
}
