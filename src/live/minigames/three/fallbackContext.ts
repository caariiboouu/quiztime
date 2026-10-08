import { createContext } from "react";

/** Lets a 3D scene ask to be swapped for its 2D fallback (e.g. WebGL context lost). */
export const Fallback3DContext = createContext<() => void>(() => {});

let webgl: boolean | null = null;

/** Whether this browser can create a WebGL context at all. */
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    webgl = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Decorative motion (waves, bobbing) is skipped for people who ask for less. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
