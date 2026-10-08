/**
 * Duck portraits: each player's duck drawn once into a small picture, with
 * one shared offscreen renderer, so lists (leaderboards, final standings) can
 * show everyone's duck without a 3D canvas per row (browsers cap those).
 * Lazy-loaded: three.js stays out of the main bundle.
 */
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { poseAt } from "./poses";
import { applyPose, buildDuckRig } from "./sculpt";
import type { DuckLook } from "./variants";

const SIZE = 160;
let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function setup() {
  if (renderer) return;
  renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  scene = new Scene();
  scene.add(new HemisphereLight("#ffffff", "#8a9a8a", 1.2));
  scene.add(new AmbientLight("#ffffff", 0.25));
  const sun = new DirectionalLight("#ffffff", 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  // Head and shoulders, three-quarter view (the duck faces +x and stands
  // about 1.4 tall; a crown adds a little), so hats and crowns show.
  camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(1.2, 1.32, 2.05);
  camera.lookAt(0.34, 1.06, 0);
}

function draw(look: DuckLook, crowned: boolean): string {
  setup();
  const rig = buildDuckRig(look, { detail: "hero", shadows: false, crowned });
  applyPose(rig, poseAt("idle", 0));
  scene!.add(rig.root);
  rig.root.updateMatrixWorld(true);
  renderer!.render(scene!, camera!);
  const url = renderer!.domElement.toDataURL("image/png");
  scene!.remove(rig.root);
  rig.dispose();
  return url;
}

/** A picture of this duck (cached; drawn one at a time). */
export function duckPortrait(look: DuckLook, crowned: boolean): Promise<string> {
  const key = `${JSON.stringify(look)}|${crowned}`;
  let url = cache.get(key);
  if (!url) {
    url = queue.then(() => draw(look, crowned));
    queue = url.catch(() => undefined);
    cache.set(key, url);
  }
  return url;
}
