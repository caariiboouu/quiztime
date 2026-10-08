/**
 * Duck breeds: plumage patterns painted onto the sculpted body as vertex
 * colours, plus breed bill/feet colours and a few shape quirks.
 *
 * Patterns are based on breed descriptions (Livestock Conservancy heritage
 * breed guide, breed standards): e.g. the Mallard drake's green head, white
 * neck ring and chestnut breast; the Swedish Blue's slate body and white bib;
 * the Magpie's black cap and back; the Muscovy's red facial caruncles.
 *
 * Plain data (no three.js), so player looks can use it without loading 3D;
 * breedPaint.ts turns a painter into vertex colours.
 *
 * A painter is called for every vertex of the body (or wing) with:
 *   u     position along the spine in ring-index space (see sculpt.ts):
 *         0 tail tip … 2 rump … 4 mid-body … 6 chest … 8 neck base …
 *         10 neck top … 12 crown … 14 bill base
 *   up    sin θ around the section: +1 along the back/top, −1 the belly
 *         (on the neck, −1 faces forward)
 *   side  cos θ: +1 the duck's left flank, −1 its right
 *   n     smooth noise in 0–1, seeded per duck, for mottling and spots
 */

export type PaintSample = { u: number; up: number; side: number; n: number };
export type Painter = (s: PaintSample) => string;

export type Breed = {
  id: BreedId;
  name: string;
  body: Painter;
  /** u runs 0 (shoulder) → 4 (wingtip); up/side as for the body. */
  wing: Painter;
  bill: string;
  feet: string;
  /** Multiplied into the duck's proportions. */
  shape?: Partial<{ plump: number; neck: number; head: number; bill: number; legs: number }>;
  /** Crested ducks wear a pom of feathers on the head. */
  crest?: boolean;
  /** How often this breed turns up among players. */
  weight: number;
};

export const BREED_IDS = [
  "pekin",
  "mallard",
  "mallardHen",
  "rouen",
  "swedishBlue",
  "khakiCampbell",
  "buff",
  "magpie",
  "ancona",
  "muscovy",
  "call",
  "crested",
  "welshHarlequin",
  "silverAppleyard",
] as const;
export type BreedId = (typeof BREED_IDS)[number];

// --- painting helpers -----------------------------------------------------------

const HEAD = 10.4; // u from here on is the head
const between = (u: number, a: number, b: number) => u >= a && u < b;
const solid = (hex: string): Painter => () => hex;

/** Mallard-pattern drake (Mallard, Rouen): shared, with tweakable greys. */
function mallardDrake(body: string, back: string): Painter {
  return ({ u, up, n }) => {
    if (u >= HEAD) return up > 0.45 + n * 0.1 ? "#164a2c" : "#1f6b3a"; // iridescent green
    if (between(u, 9.35, 10.05)) return "#f4f4f0"; // white neck ring
    if (u < 0.55) return "#efefea"; // pale tail edge
    if (u < 2.3) return up > -0.2 ? "#1b1b1d" : "#2a2a2c"; // black rump and curl
    if ((between(u, 6.4, 9.35) && up < 0.2) || between(u, 8, 9.35)) return "#7a3b1e"; // chestnut breast
    if (up > 0.55) return back;
    return body;
  };
}

/** Mallard-type wing: grey-brown with a blue speculum edged in white. */
function speculumWing(base: string, speculum = "#3b4fc4"): Painter {
  return ({ u, up, side }) => {
    const outer = Math.abs(side) < 0.95;
    if (outer && between(u, 1.3, 2.9) && up < -0.05) {
      if (up < -0.75 || between(u, 1.3, 1.45) || between(u, 2.75, 2.9)) return "#f2f2f2";
      return speculum;
    }
    return base;
  };
}

/** Mottled brown (Mallard hen): streaky noise over tan, dark crown and eye line. */
const henBody: Painter = ({ u, up, n }) => {
  if (u >= HEAD) {
    if (up > 0.55) return "#5a3e26"; // dark crown
    if (between(u, 11.2, 13.6) && up > 0.05 && up < 0.3) return "#4e3622"; // eye stripe
    return "#b9966b";
  }
  return n > 0.56 ? "#6b4a2b" : n > 0.42 ? "#8d6640" : "#a98154";
};

export const BREEDS: Record<BreedId, Breed> = {
  pekin: {
    id: "pekin",
    name: "Pekin",
    body: solid("#ffffff"),
    wing: solid("#eef2f8"),
    bill: "#f7931e",
    feet: "#f7931e",
    weight: 3,
  },
  mallard: {
    id: "mallard",
    name: "Mallard",
    body: mallardDrake("#c9c9c3", "#9a8f7a"),
    wing: speculumWing("#8f8676"),
    bill: "#c8c24a",
    feet: "#f28c28",
    weight: 2,
  },
  mallardHen: {
    id: "mallardHen",
    name: "Mallard hen",
    body: henBody,
    wing: speculumWing("#7c5a39"),
    bill: "#c77d2e",
    feet: "#f08a2a",
    weight: 2,
  },
  rouen: {
    id: "rouen",
    name: "Rouen",
    body: mallardDrake("#a9a9a2", "#7f7563"),
    wing: speculumWing("#776e5f", "#3446b5"),
    bill: "#c9c04a",
    feet: "#e8822a",
    shape: { plump: 1.12, legs: 1.05 },
    weight: 1,
  },
  swedishBlue: {
    id: "swedishBlue",
    name: "Swedish Blue",
    body: ({ u, up }) => {
      if (between(u, 6.2, 9.4) && up < -0.15) return "#f4f4f2"; // white bib
      if (u >= HEAD) return "#4f5d70";
      return "#6e7f95";
    },
    wing: ({ u }) => (u > 3.1 ? "#f0f0f0" : "#62728a"), // white flight tips
    bill: "#56706a",
    feet: "#7a4a2e",
    weight: 1,
  },
  khakiCampbell: {
    id: "khakiCampbell",
    name: "Khaki Campbell",
    body: ({ u }) => (u >= HEAD || u < 2.3 ? "#6a6440" : "#b39566"), // bronze head & rump
    wing: solid("#9c7f55"),
    bill: "#4f5a2c",
    feet: "#d47f2a",
    weight: 1,
  },
  buff: {
    id: "buff",
    name: "Buff Orpington",
    body: ({ u }) => (u >= HEAD ? "#c99a55" : "#e0b16a"),
    wing: solid("#d6a35f"),
    bill: "#e3a43a",
    feet: "#f08a24",
    weight: 1,
  },
  magpie: {
    id: "magpie",
    name: "Magpie",
    body: ({ u, up }) => {
      if (u >= 10.6 && up > 0.35) return "#18181b"; // black cap
      if (u < 1.6) return "#18181b"; // tail
      if (between(u, 1.2, 6.8) && up > 0.4) return "#18181b"; // back saddle
      return "#ffffff";
    },
    wing: solid("#1c1c20"),
    bill: "#f0a030",
    feet: "#f28c28",
    weight: 1,
  },
  ancona: {
    id: "ancona",
    name: "Ancona",
    body: ({ n }) => (n > 0.6 ? "#1f2023" : "#ffffff"), // broken black-and-white
    wing: ({ n }) => (n > 0.55 ? "#1f2023" : "#f4f4f4"),
    bill: "#e9a13b",
    feet: "#f28c28",
    weight: 1,
  },
  muscovy: {
    id: "muscovy",
    name: "Muscovy",
    body: ({ u, up, side, n }) => {
      // Red, bumpy caruncles around the eyes and bill base.
      if (between(u, 12.1, 14.2) && Math.abs(side) > 0.3 && up > -0.45 && up < 0.55) {
        return n > 0.5 ? "#b8202f" : "#d0303e";
      }
      if (between(u, 1.4, 7) && up > 0.35) return "#1a1f1c"; // dark back
      if (u < 1.4) return "#1a1f1c";
      return "#ffffff";
    },
    wing: ({ u }) => (u > 3 ? "#ffffff" : "#1d2420"),
    bill: "#f1b3a6",
    feet: "#e2b04a",
    shape: { plump: 1.1, neck: 0.9 },
    weight: 1,
  },
  call: {
    id: "call",
    name: "Call",
    body: ({ up, n }) => (up > 0.5 && n > 0.5 ? "#d9d9d6" : "#f1f1ef"), // snowy
    wing: solid("#e6e8ec"),
    bill: "#f39a2c",
    feet: "#f39a2c",
    // Small and round: big head, stubby bill.
    shape: { head: 1.18, bill: 0.7, neck: 0.85, plump: 0.95 },
    weight: 1,
  },
  crested: {
    id: "crested",
    name: "Crested",
    body: solid("#ffffff"),
    wing: solid("#eef2f8"),
    bill: "#f39a2c",
    feet: "#f39a2c",
    crest: true,
    weight: 1,
  },
  welshHarlequin: {
    id: "welshHarlequin",
    name: "Welsh Harlequin",
    body: ({ u, up, n }) => {
      if (u >= HEAD) return up > 0.5 ? "#a98a68" : "#efe2c8";
      // Fawn and chestnut flecks over cream, heaviest on the back and breast.
      const flecky = up > 0.3 || (between(u, 5.5, 9) && up < 0);
      if (flecky && n > 0.5) return n > 0.68 ? "#8a5a36" : "#b9855a";
      return "#efe2c8";
    },
    wing: speculumWing("#cbb08c", "#5a6b3a"),
    bill: "#8c8a4a",
    feet: "#f08a2a",
    weight: 1,
  },
  silverAppleyard: {
    id: "silverAppleyard",
    name: "Silver Appleyard",
    body: ({ u, up, n }) => {
      if (u >= HEAD) return up > 0.2 ? "#3f5a48" : "#7d8f80"; // frosted green head
      if (between(u, 9.35, 10.05)) return "#f6f6f2";
      if (between(u, 6.4, 9.35) && up < 0.2) return n > 0.45 ? "#a8613a" : "#d9a283"; // frosted breast
      return "#ebe9e4";
    },
    wing: speculumWing("#d8d5cc"),
    bill: "#e3c34a",
    feet: "#f08a2a",
    weight: 1,
  },
};

export function pickBreed(r: number): BreedId {
  const total = BREED_IDS.reduce((s, id) => s + BREEDS[id].weight, 0);
  let x = r * total;
  for (const id of BREED_IDS) {
    x -= BREEDS[id].weight;
    if (x < 0) return id;
  }
  return "pekin";
}
