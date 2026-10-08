import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { REST, poseAt } from "./poses";
import { applyPose, buildDuckRig, loft, skinKnots, type Ring } from "./sculpt";
import { HATS, MASCOT_LOOK, NECKPIECES, PATTERNS } from "./variants";
import { BREED_IDS } from "./breeds";

const TUBE: Ring[] = [
  { x: -1, y: 0, rz: 0.2, up: 0.2, down: 0.2 },
  { x: 0, y: 0.3, rz: 0.5, up: 0.4, down: 0.6 },
  { x: 1, y: 0, rz: 0.2, up: 0.2, down: 0.2 },
];

describe("loft", () => {
  it("builds a closed surface with one ring per sample plus two caps", () => {
    const g = loft(TUBE, { samples: 10, radial: 12 });
    expect(g.attributes.position.count).toBe(11 * 12 + 2);
    // Two triangles per quad, plus a fan at each end.
    expect(g.index!.count).toBe(10 * 12 * 6 + 12 * 6);
  });

  it("faces outward: normals point away from the spine", () => {
    const g = loft(TUBE, { samples: 20, radial: 16 });
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    // Check the middle ring, where the spine is at its high point.
    const ring = 10;
    const p = new Vector3();
    const n = new Vector3();
    const center = new Vector3();
    for (let j = 0; j < 16; j++) center.add(p.fromBufferAttribute(pos, ring * 16 + j));
    center.divideScalar(16);
    for (let j = 0; j < 16; j++) {
      p.fromBufferAttribute(pos, ring * 16 + j);
      n.fromBufferAttribute(nrm, ring * 16 + j);
      expect(n.dot(p.clone().sub(center))).toBeGreaterThan(0);
    }
  });

  it("makes bellies fuller than backs when asked", () => {
    const g = loft(TUBE, { samples: 20, radial: 16 });
    const ys = Array.from({ length: 16 }, (_, j) => g.attributes.position.getY(10 * 16 + j));
    const spineY = (Math.max(...ys) + Math.min(...ys)) / 2;
    expect(spineY).toBeLessThan(0.3); // centre of the section sits below the spine
  });

  it("writes skin weights that sum to 1", () => {
    const g = loft(TUBE, { samples: 10, radial: 8, skin: skinKnots([[0, 0], [2, 1]]) });
    const w = g.attributes.skinWeight;
    for (let i = 0; i < w.count; i++) {
      expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1);
    }
  });
});

describe("duck rig", () => {
  it("builds, poses every animation, and disposes", () => {
    const rig = buildDuckRig();
    expect(rig.root.children.length).toBeGreaterThan(0);
    for (const anim of ["idle", "celebrate", "sleep", "swim"] as const) {
      applyPose(rig, poseAt(anim, 0.7));
    }
    applyPose(rig, REST);
    expect(rig.bones.head.rotation.z).toBeCloseTo(0);
    rig.dispose();
  });

  it("bends the neck in a curve when the head lifts", () => {
    const rig = buildDuckRig();
    applyPose(rig, { ...REST, headPitch: 0.5 });
    const { neckBase, neckMid, head } = rig.bones;
    for (const b of [neckBase, neckMid, head]) expect(b.rotation.z).toBeGreaterThan(0);
    rig.dispose();
  });
});

describe("flair", () => {
  it("builds every hat, neckpiece, print, breed, and the champion's crown", () => {
    for (const hat of HATS) buildDuckRig({ ...MASCOT_LOOK, hat }).dispose();
    for (const neckpiece of NECKPIECES)
      for (const pattern of PATTERNS) buildDuckRig({ ...MASCOT_LOOK, neckpiece, pattern }).dispose();
    for (const breed of BREED_IDS) buildDuckRig({ ...MASCOT_LOOK, breed }, { detail: "crowd" }).dispose();
    const crowned = buildDuckRig({ ...MASCOT_LOOK, hat: "tophat" }, { crowned: true });
    const plain = buildDuckRig({ ...MASCOT_LOOK, hat: "tophat" });
    const count = (r: ReturnType<typeof buildDuckRig>) => {
      let n = 0;
      r.root.traverse(() => n++);
      return n;
    };
    // The crown replaces the hat (and has more pieces than a top hat).
    expect(count(crowned)).toBeGreaterThan(count(plain));
    crowned.dispose();
    plain.dispose();
  });

  it("paints breed patterns as vertex colours", () => {
    const rig = buildDuckRig({ ...MASCOT_LOOK, breed: "mallard" }, { detail: "crowd" });
    let colors = 0;
    rig.root.traverse((o) => {
      const geo = (o as { geometry?: { attributes?: Record<string, unknown> } }).geometry;
      if (geo?.attributes?.color) colors++;
    });
    expect(colors).toBeGreaterThanOrEqual(3); // body + both wings
    rig.dispose();
  });
});
