/**
 * Duck variations: every player gets their own duck. A look is a few
 * independent choices (accessory colour, hat, neckpiece, feather tone, and
 * small proportion tweaks) so a room of 30+ ducks are all recognisably the
 * mascot yet each easy to tell apart.
 *
 * Looks are picked by a stable `lookIndex` the server hands out at join, so
 * everyone sees the same duck for a player, and the (colour, hat) pair is
 * unique for the first PALETTE × HATS players.
 */
import { seededRandom } from "../minigames/types";
import { BREEDS, pickBreed, type BreedId } from "./breeds";
import { HATS, NECKPIECES, type DuckOutfit, type Hat, type Neckpiece } from "../../../shared/outfit";

export { HATS, NECKPIECES, type Hat, type Neckpiece } from "../../../shared/outfit";

/** Print on fabric flair (ribbons, ties, scarves…). */
export const PATTERNS = ["solid", "polka", "stripes"] as const;
export type FabricPattern = (typeof PATTERNS)[number];

/** Accessory colours: distinct from each other, the white body and the orange bill. */
export const PALETTE = [
  { name: "red", hex: "#dc2626" },
  { name: "blue", hex: "#2563eb" },
  { name: "green", hex: "#16a34a" },
  { name: "purple", hex: "#7c3aed" },
  { name: "pink", hex: "#ec4899" },
  { name: "teal", hex: "#0d9488" },
  { name: "gold", hex: "#eab308" },
  { name: "navy", hex: "#1e3a8a" },
  { name: "lime", hex: "#84cc16" },
  { name: "brown", hex: "#92400e" },
  { name: "black", hex: "#1f2937" },
  { name: "sky", hex: "#38bdf8" },
] as const;

/** Proportion multipliers around 1. Kept subtle so every duck is still the mascot. */
export type DuckShape = {
  plump: number;
  neck: number;
  head: number;
  bill: number;
  legs: number;
  tail: number;
};

export type DuckLook = {
  /** Plumage pattern, bill and feet colours (see breeds.ts). */
  breed: BreedId;
  /** Main feather colour, for things that can't be patterned (e.g. a crest). */
  feather: string;
  bill: string;
  feet: string;
  accent: string;
  accentName: string;
  hat: Hat;
  neckpiece: Neckpiece;
  /** Print on the neckpiece's fabric. */
  pattern: FabricPattern;
  shape: DuckShape;
};

export const NEUTRAL_SHAPE: DuckShape = { plump: 1, neck: 1, head: 1, bill: 1, legs: 1, tail: 1 };

/** The brand mascot: a white Pekin with a navy, white-polka-dot bow. No player gets this look. */
export const MASCOT_LOOK: DuckLook = {
  breed: "pekin",
  feather: "#ffffff",
  bill: "#f7931e",
  feet: "#f7931e",
  accent: "#1e3a8a",
  accentName: "navy",
  hat: "none",
  neckpiece: "ribbon",
  pattern: "polka",
  shape: NEUTRAL_SHAPE,
};

/** All (colour, hat) pairs in a fixed shuffled order, skipping the mascot's own. */
const COMBOS: { color: number; hat: number }[] = (() => {
  const all: { color: number; hat: number }[] = [];
  for (let hat = 0; hat < HATS.length; hat++) {
    for (let color = 0; color < PALETTE.length; color++) {
      if (PALETTE[color].hex === MASCOT_LOOK.accent && HATS[hat] === "none") continue;
      all.push({ color, hat });
    }
  }
  // Fixed seed: the order must never change between builds, or players'
  // ducks would change on the next deploy.
  const rand = seededRandom(0xd0c5);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
})();

/** How many players get a guaranteed-unique (colour, hat) pair. */
export const UNIQUE_LOOKS = COMBOS.length;

const cache = new Map<number, DuckLook>();

/**
 * The duck for the player with this join-order index. Cached, so the same
 * index always returns the same object (handy as a React dependency).
 */
export function lookForIndex(index: number): DuckLook {
  const i = Math.max(0, Math.floor(index));
  let look = cache.get(i);
  if (!look) {
    look = makeLook(i);
    cache.set(i, look);
  }
  return look;
}

const outfitted = new Map<string, DuckLook>();

/**
 * A player's duck with the hat and neckpiece they picked (if any). Also
 * cached, so it's a stable React dependency.
 */
export function lookFor(index: number, outfit: DuckOutfit | null | undefined): DuckLook {
  const base = lookForIndex(index);
  if (!outfit || (outfit.hat === null && outfit.neckpiece === null)) return base;
  const key = `${index}|${outfit.hat}|${outfit.neckpiece}`;
  let look = outfitted.get(key);
  if (!look) {
    look = { ...base, hat: outfit.hat ?? base.hat, neckpiece: outfit.neckpiece ?? base.neckpiece };
    outfitted.set(key, look);
  }
  return look;
}

function makeLook(i: number): DuckLook {
  const combo = COMBOS[i % COMBOS.length];
  const rand = seededRandom(0x5eed ^ Math.imul(i + 1, 0x9e3779b1));
  const vary = (amount: number) => 1 + (rand() * 2 - 1) * amount;
  const palette = PALETTE[combo.color];
  const breed = BREEDS[pickBreed(rand())];
  return {
    breed: breed.id,
    feather: breed.body({ u: 5, up: 0, side: 1, n: 0.3 }),
    bill: breed.bill,
    feet: breed.feet,
    accent: palette.hex,
    accentName: palette.name,
    hat: HATS[combo.hat],
    // Past the unique range, the neckpiece keeps repeats apart.
    neckpiece: NECKPIECES[(Math.floor(rand() * NECKPIECES.length) + Math.floor(i / COMBOS.length)) % NECKPIECES.length],
    pattern: (["solid", "solid", "polka", "stripes"] as const)[Math.floor(rand() * 4)],
    shape: {
      plump: vary(0.1),
      neck: vary(0.14),
      head: vary(0.08),
      bill: vary(0.15),
      legs: vary(0.15),
      tail: vary(0.25),
    },
  };
}

const HAT_WORDS: Record<Hat, string> = {
  none: "",
  beanie: "beanie",
  cap: "cap",
  tophat: "top hat",
  party: "party hat",
  bucket: "bucket hat",
  flower: "flower",
};
const NECK_WORDS: Record<Neckpiece, string> = {
  ribbon: "ribbon",
  bowtie: "bow tie",
  bandana: "bandana",
  scarf: "scarf",
  lei: "flower lei",
  bell: "bell collar",
  pearls: "pearls",
  medal: "medal",
  necktie: "tie",
};
/** Neckpieces made of patterned fabric (the others are flowers, pearls, metal…). */
export const FABRIC_NECKPIECES: ReadonlySet<Neckpiece> = new Set([
  "ribbon",
  "bowtie",
  "bandana",
  "scarf",
  "medal",
  "necktie",
]);
const PATTERN_WORDS: Record<FabricPattern, string> = { solid: "", polka: "polka-dot ", stripes: "striped " };

/** "the Rouen with the red top hat", for screen readers and captions. */
export function describeLook(look: DuckLook): string {
  const breed = BREEDS[look.breed]?.name ?? "duck";
  const print = FABRIC_NECKPIECES.has(look.neckpiece) ? PATTERN_WORDS[look.pattern] : "";
  return look.hat === "none"
    ? `the ${breed} with the ${look.accentName} ${print}${NECK_WORDS[look.neckpiece]}`
    : `the ${breed} with the ${look.accentName} ${HAT_WORDS[look.hat]}`;
}
