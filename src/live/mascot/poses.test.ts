import { describe, expect, it } from "vitest";
import { MASCOT_ANIMATIONS, REST, STILL_TIME, blendPose, poseAt, wrapAngle } from "./poses";

describe("mascot poses", () => {
  it("every animation produces a complete, finite pose over time", () => {
    for (const anim of MASCOT_ANIMATIONS) {
      for (let t = 0; t < 6; t += 0.037) {
        const pose = poseAt(anim, t);
        expect(Object.keys(pose).sort()).toEqual(Object.keys(REST).sort());
        for (const [k, v] of Object.entries(pose)) {
          expect(Number.isFinite(v), `${anim}.${k} at ${t}`).toBe(true);
        }
      }
      expect(STILL_TIME[anim]).toBeTypeOf("number");
    }
  });

  it("keeps the eyes and bill within range", () => {
    for (const anim of MASCOT_ANIMATIONS) {
      for (let t = 0; t < 6; t += 0.05) {
        const p = poseAt(anim, t);
        expect(p.eyes).toBeGreaterThanOrEqual(0);
        expect(p.eyes).toBeLessThanOrEqual(1);
        expect(p.bill).toBeGreaterThanOrEqual(0);
        expect(p.bill).toBeLessThanOrEqual(1.01);
      }
    }
  });

  it("blends from one pose to another", () => {
    const a = poseAt("idle", 1);
    const b = poseAt("sad", 1);
    expect(blendPose(a, b, 0).headPitch).toBeCloseTo(a.headPitch);
    expect(blendPose(a, b, 1).headPitch).toBeCloseTo(b.headPitch);
    const mid = blendPose(a, b, 0.5).headPitch;
    expect(mid).toBeLessThan(Math.max(a.headPitch, b.headPitch));
    expect(mid).toBeGreaterThan(Math.min(a.headPitch, b.headPitch));
  });

  it("blends spins the short way round", () => {
    const from = { ...REST, spin: Math.PI * 2 - 0.1 };
    const mid = blendPose(from, REST, 0.5).spin;
    expect(Math.abs(wrapAngle(mid))).toBeLessThan(0.1);
  });
});
