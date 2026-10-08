import { lazy } from "react";
import type { MinigameId } from "../../../shared/protocol";
import { DuckStop2D } from "./DuckStop2D";
import { PondMemory2D } from "./PondMemory2D";
import type { MinigameDef } from "./types";

const loadDuckStop = () => import("./DuckStop3D");
const loadPondMemory = () => import("./PondMemory3D");

/**
 * Every minigame the live quiz can run. To add one, see ./README.md; the id
 * also has to be added to `MinigameId` in shared/protocol.ts and to
 * `MINIGAMES` in worker/src/engine.ts.
 */
export const MINIGAMES: Record<MinigameId, MinigameDef> = {
  "duck-stop": {
    id: "duck-stop",
    name: "Duck Stop",
    howTo: "Stop the duck on the lily pad. Five rounds, each a little faster.",
    uses: "action",
    Scene3D: lazy(loadDuckStop),
    preload: loadDuckStop,
    Fallback: DuckStop2D,
  },
  "pond-memory": {
    id: "pond-memory",
    name: "Pond Memory",
    howTo: "Watch the lily pads light up, then repeat the pattern.",
    uses: "directions",
    Scene3D: lazy(loadPondMemory),
    preload: loadPondMemory,
    Fallback: PondMemory2D,
  },
};
