import type { ComponentType, LazyExoticComponent } from "react";
import type { MinigameId } from "../../../shared/protocol";

export type MinigameProps = {
  /** Same for every player in the round, so everyone gets the same course. */
  seed: number;
  /** False once time is up; stop accepting input. */
  active: boolean;
  /** Report the score so far; the latest value is submitted at the end. */
  onScore: (score: number) => void;
  /** Call when the game is over before time runs out. */
  onDone: () => void;
};

export type MinigameDef = {
  id: MinigameId;
  name: string;
  howTo: string;
  /** Which inputs the game needs: just the action key, or directions too. */
  uses: "action" | "directions";
  /** The 3D scene, lazy-loaded so three.js only downloads when a game starts. */
  Scene3D: LazyExoticComponent<ComponentType<MinigameProps>>;
  /** Start downloading the 3D scene early (e.g. during the countdown). */
  preload: () => Promise<unknown>;
  /** Flat version for devices without WebGL, or players who prefer it. */
  Fallback: ComponentType<MinigameProps>;
};

/** mulberry32: tiny, fast, deterministic PRNG returning [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
