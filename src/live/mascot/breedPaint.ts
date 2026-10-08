/**
 * Turning a breed's painter (breeds.ts) into vertex colours. Kept apart from
 * the breed data because it needs three.js, which only loads with the 3D
 * scenes.
 */
import { Color } from "three";
import type { Painter } from "./breeds";

// --- noise --------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in 0–1. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * A vertex painter for the lofter: converts the breed's colours to linear RGB
 * (what vertex colours expect) and caches them, since there are few colours
 * but thousands of vertices.
 */
export function makeVertexPainter(painter: Painter, seed: number, noiseScale = [1.6, 2.6]) {
  const cache = new Map<string, [number, number, number]>();
  return (u: number, theta: number): [number, number, number] => {
    // Noise wraps cleanly around the section by sampling on a circle.
    const n = valueNoise(u * noiseScale[0] + Math.cos(theta) * 1.3, Math.sin(theta) * noiseScale[1] + 5, seed);
    const hex = painter({ u, up: Math.sin(theta), side: Math.cos(theta), n });
    let rgb = cache.get(hex);
    if (!rgb) {
      const c = new Color(hex);
      rgb = [c.r, c.g, c.b];
      cache.set(hex, rgb);
    }
    return rgb;
  };
}

