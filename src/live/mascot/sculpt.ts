/**
 * Procedural sculpting for the mascot: smooth "lofted" surfaces swept along a
 * curved spine (like a sculptor's armature), and the skinned rig that lets the
 * body, neck and head bend as one continuous form, in the spirit of the
 * Untitled Goose Game goose.
 *
 * Everything here is plain three.js (no React), so it can be unit tested.
 * The duck faces +x, up is +y, feet on y = 0.
 */
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Bone,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  RedFormat,
  Shape,
  Skeleton,
  SkinnedMesh,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
  SphereGeometry,
} from "three";
import type { Pose } from "./poses";
import { BREEDS } from "./breeds";
import { makeVertexPainter } from "./breedPaint";
import {
  MASCOT_LOOK,
  type DuckLook,
  type DuckShape,
  type FabricPattern,
  type Hat,
  type Neckpiece,
} from "./variants";

// ---------------------------------------------------------------------------
// Lofting
// ---------------------------------------------------------------------------

/**
 * One cross-section of a lofted surface: an egg shape centred on the spine
 * at (x, y), `rz` wide on each side, `up` tall above the spine and `down`
 * below it (so bellies can be fuller than backs).
 */
export type Ring = { x: number; y: number; rz: number; up: number; down: number };

/** Bone influences for a point along the spine (index space of the rings). */
export type SkinFn = (u: number) => { a: number; b: number; wb: number };

function catmullRom(values: number[], u: number): number {
  const n = values.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
  const t = u - i;
  const p0 = values[Math.max(0, i - 1)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Sweep egg-shaped cross-sections along a smooth spine through `rings`,
 * capping both ends. Optionally adds skin weights so it can be a SkinnedMesh.
 */
export function loft(
  rings: Ring[],
  {
    samples = 60,
    radial = 24,
    skin,
    paint,
  }: {
    samples?: number;
    radial?: number;
    skin?: SkinFn;
    /** Vertex colour (linear RGB) at ring-index `u` and angle `theta` round the section. */
    paint?: (u: number, theta: number) => [number, number, number];
  } = {},
): BufferGeometry {
  const curve = new CatmullRomCurve3(
    rings.map((r) => new Vector3(r.x, r.y, 0)),
    false,
    "centripetal",
  );
  const field = (k: keyof Ring) => rings.map((r) => r[k]);
  const rz = field("rz");
  const up = field("up");
  const down = field("down");

  const pos: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const colors: number[] = [];
  const pushColor = (u: number, theta: number) => {
    if (paint) colors.push(...paint(u, theta));
  };
  const centers: Vector3[] = [];
  const pushSkin = (u: number) => {
    if (!skin) return;
    const { a, b, wb } = skin(u);
    skinIndex.push(a, b, 0, 0);
    skinWeight.push(1 - wb, wb, 0, 0);
  };

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = t * (rings.length - 1);
    const c = curve.getPoint(t);
    const tan = curve.getTangent(t);
    // "Up" for this ring: perpendicular to the spine, in the side-view plane.
    const ux = -tan.y;
    const uy = tan.x;
    const r = Math.max(0.002, catmullRom(rz, u));
    const ru = Math.max(0.002, catmullRom(up, u));
    const rd = Math.max(0.002, catmullRom(down, u));
    centers.push(c);
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const s = Math.sin(th);
      const v = s > 0 ? ru * s : rd * s;
      pos.push(c.x + ux * v, c.y + uy * v, r * Math.cos(th));
      pushSkin(u);
      pushColor(u, th);
    }
  }

  const index: number[] = [];
  const at = (i: number, j: number) => i * radial + (j % radial);
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < radial; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      index.push(a, b, c, b, d, c);
    }
  }

  // End caps: a fan from the spine's end points.
  const capStart = pos.length / 3;
  const c0 = centers[0];
  pos.push(c0.x, c0.y, 0);
  pushSkin(0);
  pushColor(0, Math.PI / 2);
  const capEnd = pos.length / 3;
  const cn = centers[centers.length - 1];
  pos.push(cn.x, cn.y, 0);
  pushSkin(rings.length - 1);
  pushColor(rings.length - 1, Math.PI / 2);
  for (let j = 0; j < radial; j++) {
    index.push(capStart, at(0, j), at(0, j + 1));
    index.push(capEnd, at(samples, j + 1), at(samples, j));
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  if (skin) {
    g.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute("skinWeight", new Float32BufferAttribute(skinWeight, 4));
  }
  if (paint) g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Linear blend between bones placed at ring indices. */
export function skinKnots(knots: [u: number, bone: number][]): SkinFn {
  return (u) => {
    if (u <= knots[0][0]) return { a: knots[0][1], b: knots[0][1], wb: 0 };
    for (let k = 0; k < knots.length - 1; k++) {
      const [u0, b0] = knots[k];
      const [u1, b1] = knots[k + 1];
      if (u <= u1) return { a: b0, b: b1, wb: (u - u0) / (u1 - u0) };
    }
    const last = knots[knots.length - 1][1];
    return { a: last, b: last, wb: 0 };
  };
}

// ---------------------------------------------------------------------------
// The duck
// ---------------------------------------------------------------------------

/** Hip height when standing, and how far tucking (sitting/swimming) lowers the body. */
export const HIP = 0.38;
export const TUCK_DROP = 0.3;
/** The body bone sits this far above the hips. */
const BODY_ABOVE_HIP = 0.2;
/** Folded wings flare out this far (radians) to sit on the body's curve. */
const WING_REST = 0.3;

/**
 * Side-view profile of body → neck → head, tail tip first. `up`/`down` are
 * the back/belly thickness, `rz` the half-width.
 */
const BODY_RINGS: Ring[] = [
  { x: -0.8, y: 0.8, rz: 0.015, up: 0.015, down: 0.015 }, // 0 tail tip
  { x: -0.7, y: 0.72, rz: 0.1, up: 0.05, down: 0.05 }, // 1 tail
  { x: -0.56, y: 0.64, rz: 0.25, up: 0.13, down: 0.15 }, // 2 rump
  { x: -0.34, y: 0.59, rz: 0.39, up: 0.24, down: 0.28 }, // 3 back
  { x: -0.08, y: 0.57, rz: 0.45, up: 0.3, down: 0.33 }, // 4 widest
  { x: 0.18, y: 0.58, rz: 0.43, up: 0.3, down: 0.33 }, // 5 belly
  { x: 0.38, y: 0.66, rz: 0.35, up: 0.27, down: 0.29 }, // 6 chest
  { x: 0.5, y: 0.8, rz: 0.24, up: 0.21, down: 0.21 }, // 7 chest → neck
  { x: 0.55, y: 0.96, rz: 0.17, up: 0.165, down: 0.165 }, // 8 neck base (neckpiece)
  { x: 0.53, y: 1.12, rz: 0.148, up: 0.145, down: 0.145 }, // 9 neck (S-curve back)
  { x: 0.56, y: 1.27, rz: 0.152, up: 0.15, down: 0.15 }, // 10 neck top
  { x: 0.63, y: 1.39, rz: 0.19, up: 0.19, down: 0.17 }, // 11 back of head
  { x: 0.75, y: 1.44, rz: 0.21, up: 0.2, down: 0.18 }, // 12 crown
  { x: 0.87, y: 1.42, rz: 0.17, up: 0.15, down: 0.14 }, // 13 face
  { x: 0.94, y: 1.39, rz: 0.11, up: 0.085, down: 0.085 }, // 14 bill base
  { x: 0.97, y: 1.385, rz: 0.03, up: 0.02, down: 0.02 }, // 15 cap (hidden in bill)
];
const TAIL_RINGS = [0, 1];
const BODY_SECTION = [2, 3, 4, 5, 6];
const HEAD_RINGS = [11, 12, 13, 14, 15];

/** Bone joints (in the same space as the rings). */
const BONES = {
  body: new Vector3(0, HIP + BODY_ABOVE_HIP, 0),
  tail: new Vector3(-0.52, 0.63, 0),
  neckBase: new Vector3(0.52, 0.86, 0),
  neckMid: new Vector3(0.54, 1.1, 0),
  head: new Vector3(0.6, 1.33, 0),
};
const B = { body: 0, tail: 1, neckBase: 2, neckMid: 3, head: 4 };
const BODY_SKIN = skinKnots([
  [1, B.tail],
  [3, B.body],
  [6, B.body],
  [8, B.neckBase],
  [9, B.neckMid],
  [11, B.head],
]);

const WING_RINGS: Ring[] = [
  { x: 0.04, y: -0.06, rz: 0.015, up: 0.05, down: 0.05 },
  { x: -0.08, y: -0.12, rz: 0.045, up: 0.12, down: 0.12 },
  { x: -0.3, y: -0.13, rz: 0.05, up: 0.13, down: 0.12 },
  { x: -0.5, y: -0.08, rz: 0.035, up: 0.08, down: 0.07 },
  { x: -0.66, y: 0.0, rz: 0.012, up: 0.015, down: 0.015 },
];

const BILL_UPPER: Ring[] = [
  { x: -0.04, y: 0.0, rz: 0.125, up: 0.1, down: 0.025 },
  { x: 0.08, y: 0.0, rz: 0.125, up: 0.075, down: 0.025 },
  { x: 0.2, y: -0.015, rz: 0.115, up: 0.05, down: 0.022 },
  { x: 0.28, y: -0.03, rz: 0.095, up: 0.035, down: 0.02 },
  { x: 0.32, y: -0.04, rz: 0.04, up: 0.018, down: 0.012 },
];
const BILL_LOWER: Ring[] = [
  { x: -0.02, y: 0.0, rz: 0.11, up: 0.015, down: 0.06 },
  { x: 0.08, y: 0.0, rz: 0.108, up: 0.012, down: 0.05 },
  { x: 0.2, y: -0.005, rz: 0.095, up: 0.01, down: 0.032 },
  { x: 0.27, y: -0.01, rz: 0.04, up: 0.008, down: 0.012 },
];

const LEG_RINGS: Ring[] = [
  { x: 0, y: 0.06, rz: 0.08, up: 0.08, down: 0.08 },
  { x: -0.035, y: -0.14, rz: 0.072, up: 0.072, down: 0.072 },
  { x: 0.01, y: -0.3, rz: 0.06, up: 0.06, down: 0.06 },
  { x: 0.02, y: -0.36, rz: 0.055, up: 0.055, down: 0.055 },
];

/** A chunky webbed foot with three rounded toes, laid flat, toes toward +x. */
function footGeometry(detail: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-0.08, 0);
  s.quadraticCurveTo(-0.07, 0.08, 0.06, 0.11);
  s.quadraticCurveTo(0.22, 0.19, 0.23, 0.12);
  s.quadraticCurveTo(0.17, 0.065, 0.22, 0.045);
  s.quadraticCurveTo(0.29, 0, 0.22, -0.045);
  s.quadraticCurveTo(0.17, -0.065, 0.23, -0.12);
  s.quadraticCurveTo(0.22, -0.19, 0.06, -0.11);
  s.quadraticCurveTo(-0.07, -0.08, -0.08, 0);
  const g = new ExtrudeGeometry(s, {
    depth: 0.03,
    curveSegments: Math.max(4, Math.round(10 * detail)),
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.022,
    bevelSegments: detail < 1 ? 1 : 3,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

// --- proportions ------------------------------------------------------------

const NECK_BASE_Y = 0.96;
const NECK_TOP_Y = 1.27;
const HEAD_CENTER = new Vector3(0.75, 1.42, 0);
const TAIL_ROOT = new Vector3(-0.56, 0.64, 0);

/**
 * Map a point of the base sculpt onto this duck's proportions: the neck
 * stretches between its base and top (everything above just moves up), and
 * head parts scale about the head's centre.
 */
function makeWarp(shape: DuckShape) {
  const neckY = (y: number) =>
    y <= NECK_BASE_Y
      ? y
      : y <= NECK_TOP_Y
        ? NECK_BASE_Y + (y - NECK_BASE_Y) * shape.neck
        : y + (NECK_TOP_Y - NECK_BASE_Y) * (shape.neck - 1);
  return (p: Vector3, part: "head" | "tail" | "body" = "body") => {
    const q = p.clone();
    if (part === "head") q.sub(HEAD_CENTER).multiplyScalar(shape.head).add(HEAD_CENTER);
    if (part === "tail") q.sub(TAIL_ROOT).multiplyScalar(shape.tail).add(TAIL_ROOT);
    q.y = neckY(q.y);
    return q;
  };
}

function shapedBodyRings(shape: DuckShape, warp: ReturnType<typeof makeWarp>): Ring[] {
  return BODY_RINGS.map((r, i) => {
    const part = TAIL_RINGS.includes(i) ? "tail" : HEAD_RINGS.includes(i) ? "head" : "body";
    const c = warp(new Vector3(r.x, r.y, 0), part);
    const k = BODY_SECTION.includes(i) ? shape.plump : part === "head" ? shape.head : 1;
    return { x: c.x, y: c.y, rz: r.rz * k, up: r.up * (1 + (k - 1) * 0.6), down: r.down * k };
  });
}

// --- materials ----------------------------------------------------------------

let sharedRamp: DataTexture | null = null;
/** Soft three-tone ramp: gentle, flat-looking toon shading. Shared by all ducks. */
function ramp(): DataTexture {
  if (!sharedRamp) {
    sharedRamp = new DataTexture(new Uint8Array([212, 240, 255]), 3, 1, RedFormat);
    sharedRamp.minFilter = NearestFilter;
    sharedRamp.magFilter = NearestFilter;
    sharedRamp.needsUpdate = true;
  }
  return sharedRamp;
}

/**
 * Toon material coloured per vertex (breed patterns). Its glow is scaled by
 * the vertex colour, so whites stay bright without lifting blacks to grey.
 */
function paintedToon(glow: number) {
  const mat = new MeshToonMaterial({
    color: "#ffffff",
    vertexColors: true,
    gradientMap: ramp(),
    emissive: "#ffffff",
    emissiveIntensity: glow,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif",
    );
  };
  return mat;
}

// --- fabric prints -----------------------------------------------------------

const fabricCache = new Map<string, DataTexture>();

/**
 * A tiling print (white polka dots or stripes on the accent colour), built
 * from raw pixels so it works without a DOM. Cached and shared by all ducks.
 */
function fabricTexture(hex: string, pattern: FabricPattern, repeat: [number, number]): DataTexture | null {
  if (pattern === "solid") return null;
  const key = `${hex}|${pattern}|${repeat.join("x")}`;
  const hit = fabricCache.get(key);
  if (hit) return hit;
  const size = 64;
  // Pixel data is sRGB, same as the hex.
  const rgb = new Color(hex).getHex();
  const [br, bg, bb] = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Polka: staggered dots (one in the middle, quarters at the corners).
      // Stripes: diagonal bands.
      const d = (cx: number, cy: number) => Math.hypot(x - cx, y - cy);
      const white =
        pattern === "polka"
          ? Math.min(d(32, 32), d(0, 0), d(64, 0), d(0, 64), d(64, 64)) < 10
          : (x + y) % 32 < 10;
      const i = (y * size + x) * 4;
      data[i] = white ? 250 : br;
      data[i + 1] = white ? 250 : bg;
      data[i + 2] = white ? 245 : bb;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  fabricCache.set(key, tex);
  return tex;
}

function makeMaterials(look: DuckLook) {
  const toon = (color: string | Color, glow = 0) =>
    new MeshToonMaterial({ color, gradientMap: ramp(), emissive: color, emissiveIntensity: glow });
  /** Fabric in the accent colour, printed if the look says so. */
  const fabric = (repeat: [number, number]) => {
    const map = fabricTexture(look.accent, look.pattern, repeat);
    return map ? new MeshToonMaterial({ color: "#ffffff", map, gradientMap: ramp() }) : toon(look.accent);
  };
  const accentDouble = toon(look.accent);
  accentDouble.side = DoubleSide;
  const goldDouble = toon("#f5c518", 0.25);
  goldDouble.side = DoubleSide;
  return {
    /** Long bands (round the neck): the print repeats along the length. */
    fabricBand: fabric([10, 1.5]),
    /** Small shapes (bows, knots, flaps). */
    fabricBlob: fabric([3, 2]),
    gold: toon("#f5c518", 0.25),
    goldDouble,
    pearl: toon("#ecd9c6", 0.22), // a little pink, so pearls show on white ducks
    ruby: toon("#c81e3a", 0.2),
    sapphire: toon("#1d4ed8", 0.2),
    velvet: toon("#9f1239"),
    feather: paintedToon(0.18),
    wing: paintedToon(0.12),
    crest: toon(look.feather, 0.18),
    bill: toon(look.bill),
    feet: toon(look.feet),
    accent: toon(look.accent),
    accentDouble,
    dark: toon("#111827"),
    white: toon("#ffffff", 0.15),
    eye: new MeshBasicMaterial({ color: "#111827" }),
    shine: new MeshBasicMaterial({ color: "#ffffff" }),
  };
}

export type DuckRig = {
  root: Group;
  squash: Group;
  spinner: Group;
  bones: { body: Bone; tail: Bone; neckBase: Bone; neckMid: Bone; head: Bone };
  billUp: Object3D;
  billLo: Object3D;
  wingL: Object3D;
  wingR: Object3D;
  legL: Object3D;
  legR: Object3D;
  eyeL: Object3D;
  eyeR: Object3D;
  dispose: () => void;
};

export type RigOptions = {
  /** "crowd" uses lighter meshes for scenes with dozens of ducks. */
  detail?: "hero" | "crowd";
  /** Cast real shadows (crowd scenes use cheap blob shadows instead). */
  shadows?: boolean;
  /** The Ceramic Duck Hours leader: wears the gold crown instead of a hat. */
  crowned?: boolean;
};

/**
 * Build a duck: a skinned, sculpted body plus bill, wings, legs, neckpiece
 * and hat, shaped and coloured by `look`.
 */
export function buildDuckRig(look: DuckLook = MASCOT_LOOK, opts: RigOptions = {}): DuckRig {
  const detail = opts.detail === "crowd" ? 0.55 : 1;
  const shadows = opts.shadows ?? true;
  const seg = (n: number) => Math.max(6, Math.round(n * detail));
  const breed = BREEDS[look.breed] ?? BREEDS.pekin;
  const shape: DuckShape = { ...look.shape };
  for (const [k, v] of Object.entries(breed.shape ?? {}) as [keyof DuckShape, number][]) {
    shape[k] *= v;
  }
  const warp = makeWarp(shape);
  // Seed the mottling from the look so each duck's markings are its own.
  const seed = Math.round((look.shape.plump * 7919 + look.shape.neck * 104729) * 1000);

  const m = makeMaterials(look);
  const geometries: BufferGeometry[] = [];
  const geo = <T extends BufferGeometry>(g: T) => {
    geometries.push(g);
    return g;
  };
  const mesh = (g: BufferGeometry, mat: Mesh["material"], shadow = true) => {
    const x = new Mesh(geo(g), mat);
    x.castShadow = shadow && shadows;
    return x;
  };
  const sphere = (r: number, w = 16, h = 12) => new SphereGeometry(r, seg(w), seg(h));

  const root = new Group();
  // Overall size: about 1.4 units tall at the crown.
  root.scale.setScalar(0.85);
  const squash = new Group();
  const spinner = new Group();
  root.add(squash);
  squash.add(spinner);

  // --- skeleton: body → tail, body → neck base → neck mid → head
  const at = {
    body: BONES.body,
    tail: warp(BONES.tail, "tail"),
    neckBase: BONES.neckBase,
    neckMid: warp(BONES.neckMid),
    head: warp(BONES.head),
  };
  const bone = (pos: Vector3, parent?: Bone, parentPos?: Vector3) => {
    const b = new Bone();
    b.position.copy(parentPos ? pos.clone().sub(parentPos) : pos);
    parent?.add(b);
    return b;
  };
  const body = bone(at.body);
  const tail = bone(at.tail, body, at.body);
  const neckBase = bone(at.neckBase, body, at.body);
  const neckMid = bone(at.neckMid, neckBase, at.neckBase);
  const head = bone(at.head, neckMid, at.neckMid);

  const bodyGeo = loft(shapedBodyRings(shape, warp), {
    samples: seg(110),
    radial: seg(32),
    skin: BODY_SKIN,
    paint: makeVertexPainter(breed.body, seed),
  });
  const skinned = new SkinnedMesh(geo(bodyGeo), m.feather);
  skinned.castShadow = shadows;
  // The bound pose's bounding sphere doesn't follow animation; never cull.
  skinned.frustumCulled = false;
  skinned.add(body);
  skinned.bind(new Skeleton([body, tail, neckBase, neckMid, head]));
  spinner.add(skinned);

  // Attach rigid parts to bones, positioned in base-sculpt space.
  const attach = <T extends Object3D>(child: T, parent: Bone, parentPos: Vector3, pos: Vector3): T => {
    child.position.copy(pos.clone().sub(parentPos));
    parent.add(child);
    return child;
  };
  const onHead = <T extends Object3D>(child: T, x: number, y: number, z = 0): T =>
    attach(child, head, at.head, warp(new Vector3(x, y, z), "head"));

  // --- bill: upper and lower halves hinge at the base
  const stretchBill = (rings: Ring[]) => rings.map((r) => ({ ...r, x: r.x * shape.bill }));
  const billUp = onHead(new Group(), 0.92, 1.4);
  billUp.add(mesh(loft(stretchBill(BILL_UPPER), { samples: seg(24), radial: seg(20) }), m.bill));
  const billLo = onHead(new Group(), 0.92, 1.375);
  billLo.add(mesh(loft(stretchBill(BILL_LOWER), { samples: seg(20), radial: seg(18) }), m.bill));
  billUp.scale.setScalar(shape.head);
  billLo.scale.setScalar(shape.head);

  // --- eyes: little black dots with a glint
  const eye = (side: 1 | -1) => {
    const g = onHead(new Group(), 0.82, 1.48, side * 0.165);
    const dot = mesh(sphere(0.046), m.eye, false);
    dot.scale.set(1, 1.15, 0.6);
    const glint = mesh(sphere(0.014, 8, 6), m.shine, false);
    glint.position.set(0.017, 0.02, side * 0.022);
    g.add(dot, glint);
    g.scale.setScalar(shape.head);
    return g;
  };
  const eyeL = eye(1);
  const eyeR = eye(-1);

  // --- neckpiece and hat
  const neck = attach(new Group(), neckBase, at.neckBase, new Vector3(0.55, 0.95, 0));
  neck.rotation.z = -0.12;
  buildNeckpiece(look.neckpiece, neck, { mesh, sphere, m, seg });
  const hat = onHead(new Group(), 0.73, 1.6);
  hat.rotation.z = 0.12;
  hat.scale.setScalar(shape.head);
  if (opts.crowned) buildRoyalCrown(hat, { mesh, sphere, m, seg });
  else buildHat(look.hat, hat, { mesh, sphere, m, seg });
  if (breed.crest && look.hat === "none" && !opts.crowned) {
    // A pom of feathers on the crown (hats sit where it would be).
    const crest = new Group();
    hat.add(crest);
    // A fluffy ball sitting toward the back of the crown, like the breed's.
    crest.position.set(-0.1, 0.02, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const puff = mesh(sphere(0.1, 12, 10), m.crest);
      puff.position.set(Math.cos(a) * 0.09, 0.02 + (i % 2) * 0.05, Math.sin(a) * 0.09);
      crest.add(puff);
    }
    const top = mesh(sphere(0.12, 12, 10), m.crest);
    top.position.set(0, 0.1, 0);
    crest.add(top);
  }

  // --- wings, hinged along their top edge so they lift outward
  const wingOut = 0.41 * (1 + (shape.plump - 1) * 0.9);
  const wing = (side: 1 | -1) => {
    const pivot = attach(new Group(), body, at.body, new Vector3(0.22, 0.86, side * wingOut));
    const w = mesh(
      loft(WING_RINGS, {
        samples: seg(40),
        radial: seg(18),
        paint: makeVertexPainter(breed.wing, seed + side, [2.2, 2]),
      }),
      m.wing,
    );
    w.rotation.y = side * -0.08; // tips hug the body toward the tail
    pivot.add(w);
    return pivot;
  };
  const wingL = wing(1);
  const wingR = wing(-1);

  // --- legs: thick, slightly bent, chunky feet
  const legRings = LEG_RINGS.map((r) => ({
    ...r,
    rz: r.rz * shape.legs,
    up: r.up * shape.legs,
    down: r.down * shape.legs,
  }));
  const leg = (side: 1 | -1) => {
    const g = new Group();
    g.position.set(0.05, HIP, side * 0.17 * shape.plump);
    g.add(mesh(loft(legRings, { samples: seg(16), radial: seg(16) }), m.feet));
    const foot = mesh(footGeometry(detail), m.feet);
    foot.position.set(0.03, -0.375, 0);
    foot.scale.setScalar(0.9 + 0.1 * shape.legs);
    g.add(foot);
    spinner.add(g);
    return g;
  };
  const legL = leg(1);
  const legR = leg(-1);

  return {
    root,
    squash,
    spinner,
    bones: { body, tail, neckBase, neckMid, head },
    billUp,
    billLo,
    wingL,
    wingR,
    legL,
    legR,
    eyeL,
    eyeR,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const mat of Object.values(m)) mat.dispose();
    },
  };
}

type Kit = {
  mesh: (g: BufferGeometry, mat: Mesh["material"], shadow?: boolean) => Mesh;
  sphere: (r: number, w?: number, h?: number) => SphereGeometry;
  m: ReturnType<typeof makeMaterials>;
  seg: (n: number) => number;
};

/** Neckpieces sit on the neck-base bone; the origin is the neck's centre line. */
function buildNeckpiece(kind: Neckpiece, g: Group, { mesh, sphere, m, seg }: Kit) {
  const band = (tube: number, mat: Mesh["material"] = m.fabricBand) => {
    const b = mesh(new TorusGeometry(0.18, tube, seg(12), seg(44)), mat);
    b.rotation.x = Math.PI / 2;
    g.add(b);
  };
  /** Something hanging at the front of the neck (bows, medals, bells…). */
  const front = (y = -0.01) => {
    const f = new Group();
    f.position.set(0.19, y, 0);
    g.add(f);
    return f;
  };
  switch (kind) {
    case "ribbon": {
      band(0.04);
      const bow = front();
      bow.add(mesh(sphere(0.045, 14, 10), m.fabricBlob));
      for (const side of [1, -1]) {
        const loop = mesh(sphere(0.09), m.fabricBlob);
        loop.position.set(0.02, 0.02, side * 0.085);
        loop.rotation.x = side * 0.45;
        loop.scale.set(0.35, 0.6, 1);
        const end = mesh(sphere(0.06, 12, 8), m.fabricBlob);
        end.position.set(0.03, -0.09, side * 0.045);
        end.rotation.x = side * -0.35;
        end.scale.set(0.3, 1.2, 0.5);
        bow.add(loop, end);
      }
      return;
    }
    case "bowtie": {
      band(0.022);
      const tie = front(-0.02);
      tie.add(mesh(sphere(0.035, 12, 8), m.fabricBlob));
      for (const side of [1, -1]) {
        // Two cones pointing at the knot make the classic bow-tie wings.
        const wingPiece = mesh(new ConeGeometry(0.07, 0.13, seg(16)), m.fabricBlob);
        wingPiece.rotation.x = side * (Math.PI / 2);
        wingPiece.position.z = side * 0.07;
        wingPiece.scale.set(0.45, 1, 1);
        tie.add(wingPiece);
      }
      return;
    }
    case "bandana": {
      band(0.03);
      const flap = mesh(new ConeGeometry(0.17, 0.26, 3), m.fabricBlob);
      flap.rotation.set(0, Math.PI / 2, Math.PI - 0.35);
      flap.position.set(0.16, -0.1, 0);
      flap.scale.set(1, 1, 0.22);
      g.add(flap);
      return;
    }
    case "scarf": {
      band(0.065);
      const end = mesh(new CapsuleGeometry(0.055, 0.2, seg(6), seg(12)), m.fabricBlob);
      end.position.set(0.1, -0.16, 0.12);
      end.rotation.set(0.25, 0, -0.2);
      end.scale.set(1, 1, 0.45);
      g.add(end);
      return;
    }
    case "necktie": {
      band(0.02);
      const tie = front(-0.03);
      tie.add(mesh(sphere(0.04, 12, 8), m.fabricBlob)); // knot
      const blade = mesh(new CapsuleGeometry(0.045, 0.2, seg(6), seg(12)), m.fabricBlob);
      blade.position.set(0.04, -0.16, 0);
      blade.rotation.z = 0.35; // lies against the chest
      blade.scale.set(0.35, 1, 1);
      tie.add(blade);
      return;
    }
    case "lei": {
      // A ring of little flowers, accent petals with sunny centres.
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const flower = mesh(sphere(0.062, 10, 8), i % 2 ? m.accent : m.white);
        flower.position.set(Math.cos(a) * 0.19, Math.sin(i * 1.7) * 0.015, Math.sin(a) * 0.19);
        flower.scale.set(1, 0.7, 1);
        const centre = mesh(sphere(0.018, 8, 6), m.gold, false);
        centre.position.set(Math.cos(a) * 0.235, flower.position.y, Math.sin(a) * 0.235);
        g.add(flower, centre);
      }
      return;
    }
    case "bell": {
      band(0.03, m.accent);
      const bell = front(-0.05);
      const body = mesh(sphere(0.078, 16, 12), m.gold);
      body.scale.set(1, 1.1, 1);
      const lip = mesh(new TorusGeometry(0.05, 0.012, seg(8), seg(20)), m.gold);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = -0.045;
      const slot = mesh(new CylinderGeometry(0.012, 0.012, 0.13, seg(8)), m.dark, false);
      slot.rotation.x = Math.PI / 2;
      slot.position.set(0.035, -0.02, 0);
      slot.scale.set(1, 1, 0.3);
      bell.add(body, lip, slot);
      return;
    }
    case "pearls": {
      // A string of pearls with a little pendant in the accent colour.
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const pearl = mesh(sphere(0.034, 10, 8), m.pearl, false);
        pearl.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
        g.add(pearl);
      }
      const pendant = front(-0.05);
      const gem = mesh(sphere(0.04, 12, 8), m.accent);
      gem.scale.set(0.6, 1.2, 1);
      pendant.add(gem);
      return;
    }
    case "medal": {
      band(0.025);
      const medal = front(-0.08);
      const ribbonDrop = mesh(new CylinderGeometry(0.035, 0.035, 0.08, seg(6)), m.fabricBlob);
      ribbonDrop.position.y = 0.05;
      ribbonDrop.scale.set(0.3, 1, 1);
      const disk = mesh(new CylinderGeometry(0.085, 0.085, 0.02, seg(24)), m.gold);
      disk.rotation.z = Math.PI / 2;
      const star = mesh(new ConeGeometry(0.04, 0.02, 5), m.white, false);
      star.rotation.z = -Math.PI / 2;
      star.position.x = 0.012;
      medal.add(ribbonDrop, disk, star);
      return;
    }
  }
}

/** Hats sit on the head bone; the origin is the top of the crown. */
function buildHat(kind: Hat, g: Group, { mesh, sphere, m, seg }: Kit) {
  const dome = (r: number) =>
    new SphereGeometry(r, seg(24), seg(12), 0, Math.PI * 2, 0, Math.PI / 2);
  switch (kind) {
    case "none":
      return;
    case "beanie": {
      const cap = mesh(dome(0.2), m.accent);
      cap.position.y = -0.06;
      cap.scale.y = 0.9;
      const cuff = mesh(new TorusGeometry(0.19, 0.04, seg(10), seg(32)), m.accent);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.05;
      const pom = mesh(sphere(0.06), m.white);
      pom.position.y = 0.13;
      g.add(cap, cuff, pom);
      return;
    }
    case "cap": {
      const crown = mesh(dome(0.19), m.accent);
      crown.position.y = -0.05;
      crown.scale.y = 0.75;
      const brim = mesh(new CylinderGeometry(0.15, 0.15, 0.02, seg(24)), m.accent);
      brim.position.set(0.16, -0.045, 0);
      brim.scale.set(1.3, 1, 1);
      const button = mesh(sphere(0.025, 8, 6), m.accent);
      button.position.y = 0.09;
      g.add(crown, brim, button);
      return;
    }
    case "tophat": {
      const brim = mesh(new CylinderGeometry(0.21, 0.21, 0.025, seg(32)), m.accent);
      brim.position.y = -0.02;
      const tube = mesh(new CylinderGeometry(0.13, 0.135, 0.26, seg(28)), m.accent);
      tube.position.y = 0.12;
      const band = mesh(new CylinderGeometry(0.137, 0.137, 0.05, seg(28)), m.dark);
      band.position.y = 0.03;
      g.add(brim, tube, band);
      return;
    }
    case "party": {
      const cone = mesh(new ConeGeometry(0.12, 0.32, seg(24)), m.accent);
      cone.position.y = 0.12;
      const pom = mesh(sphere(0.045), m.white);
      pom.position.y = 0.29;
      g.add(cone, pom);
      g.rotation.x = 0.2;
      return;
    }
    case "bucket": {
      const top = mesh(new CylinderGeometry(0.15, 0.17, 0.12, seg(24)), m.accent);
      top.position.y = 0.0;
      const brim = mesh(new CylinderGeometry(0.17, 0.25, 0.05, seg(28), 1, true), m.accentDouble);
      brim.position.y = -0.075;
      const band = mesh(new CylinderGeometry(0.172, 0.172, 0.03, seg(24)), m.dark);
      band.position.y = -0.04;
      g.add(top, brim, band);
      return;
    }
    case "flower": {
      const flower = new Group();
      flower.position.set(-0.04, 0, 0.12);
      flower.rotation.set(-0.5, 0, 0.2);
      g.add(flower);
      const center = mesh(sphere(0.04), m.accent);
      center.scale.y = 0.6;
      flower.add(center);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const petal = mesh(sphere(0.05, 10, 8), m.white);
        petal.position.set(Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075);
        petal.rotation.y = -a;
        petal.scale.set(1.3, 0.35, 0.7);
        flower.add(petal);
      }
      return;
    }
  }
}

/**
 * The Ceramic Duck Hours champion's crown: gold, five points tipped with
 * pearls, rubies and sapphires round the band, red velvet inside.
 */
function buildRoyalCrown(g: Group, { mesh, sphere, m, seg }: Kit) {
  const crown = new Group();
  crown.position.y = 0.02;
  crown.rotation.z = -0.05;
  g.add(crown);
  const velvet = mesh(
    new SphereGeometry(0.15, seg(20), seg(10), 0, Math.PI * 2, 0, Math.PI / 2),
    m.velvet,
  );
  velvet.position.y = -0.02;
  velvet.scale.y = 0.8;
  const band = mesh(new CylinderGeometry(0.17, 0.16, 0.11, seg(32), 1, true), m.goldDouble);
  band.position.y = 0.02;
  const rim = mesh(new TorusGeometry(0.165, 0.016, seg(8), seg(32)), m.gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.035;
  crown.add(velvet, band, rim);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const point = mesh(new ConeGeometry(0.045, 0.13, seg(10)), m.gold);
    point.position.set(Math.cos(a) * 0.165, 0.13, Math.sin(a) * 0.165);
    const tip = mesh(sphere(0.022, 10, 8), m.pearl, false);
    tip.position.set(Math.cos(a) * 0.165, 0.205, Math.sin(a) * 0.165);
    const b = a + Math.PI / 5;
    const gem = mesh(sphere(0.024, 10, 8), i % 2 ? m.sapphire : m.ruby, false);
    gem.position.set(Math.cos(b) * 0.172, 0.02, Math.sin(b) * 0.172);
    gem.scale.set(1, 1.2, 1);
    crown.add(point, tip, gem);
  }
  crown.scale.setScalar(1.15);
}

/** Put the rig into a pose (see poses.ts for what each field means). */
export function applyPose(rig: DuckRig, p: Pose) {
  rig.squash.position.y = p.y;
  rig.squash.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
  rig.spinner.rotation.y = p.spin;

  const { body, tail, neckBase, neckMid, head } = rig.bones;
  const hip = HIP - p.tuck * TUCK_DROP;
  body.position.y = hip + BODY_ABOVE_HIP;
  body.rotation.set(p.roll, 0, -p.pitch);
  tail.rotation.set(0, p.tail, p.tail * 0.15);
  // Spread head movement down the neck so it bends in a smooth curve.
  neckBase.rotation.set(0, p.headYaw * 0.2, p.headPitch * 0.3);
  neckMid.rotation.set(p.headRoll * 0.3, p.headYaw * 0.35, p.headPitch * 0.35);
  head.rotation.set(p.headRoll * 0.7, p.headYaw * 0.45, p.headPitch * 0.4);

  rig.billUp.rotation.set(0, 0, p.bill * 0.3);
  rig.billLo.rotation.set(0, 0, -p.bill * 0.55);
  // Swing out from the body and lift the tips, so a flap reads from any angle.
  rig.wingL.rotation.set(-(WING_REST + p.wingL), 0, -0.6 * p.wingL);
  rig.wingR.rotation.set(WING_REST + p.wingR, 0, -0.6 * p.wingR);

  const legScale = 1 - 0.85 * p.tuck;
  for (const [leg, swing, lift] of [
    [rig.legL, p.legL, p.liftL],
    [rig.legR, p.legR, p.liftR],
  ] as const) {
    leg.position.y = hip + lift;
    leg.rotation.z = swing;
    leg.scale.y = legScale;
  }
  const eyes = Math.max(0.08, p.eyes);
  rig.eyeL.scale.set(1, eyes, 1);
  rig.eyeR.scale.set(1, eyes, 1);
}
