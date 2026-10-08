/**
 * What a player can pick for their duck. Everything else about a duck (breed,
 * accessory colour, proportions) is handed out by join order so ducks stay
 * easy to tell apart; the hat and the neckpiece are theirs to choose, and
 * saved on their account.
 *
 * No crown here: the gold crown is reserved for whoever leads the Ceramic
 * Duck Hours standings, and it takes the hat's place.
 */
export const HATS = ["none", "beanie", "cap", "tophat", "party", "bucket", "flower"] as const;
export type Hat = (typeof HATS)[number];

/** Flair worn at the base of the neck, the mascot's bow among them. */
export const NECKPIECES = [
  "ribbon",
  "bowtie",
  "bandana",
  "scarf",
  "lei",
  "bell",
  "pearls",
  "medal",
  "necktie",
] as const;
export type Neckpiece = (typeof NECKPIECES)[number];

/** A player's picks; null keeps the one their duck was given. */
export type DuckOutfit = { hat: Hat | null; neckpiece: Neckpiece | null };

/** A valid outfit from untrusted input, or null. */
export function cleanOutfit(x: unknown): DuckOutfit | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const hat = (HATS as readonly unknown[]).includes(o.hat) ? (o.hat as Hat) : null;
  const neckpiece = (NECKPIECES as readonly unknown[]).includes(o.neckpiece)
    ? (o.neckpiece as Neckpiece)
    : null;
  return hat === null && neckpiece === null ? null : { hat, neckpiece };
}

/**
 * Which duck someone is (breed, colour, proportions): a stable number from
 * an id, so a person keeps the same duck in every game and on the Ceramic
 * Duck Hours board. (FNV-1a, kept positive and under a million.)
 */
export function lookSeedFor(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1_000_000;
}
