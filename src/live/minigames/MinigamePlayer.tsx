import { Suspense, useState } from "react";
import { GameErrorBoundary } from "./GameErrorBoundary";
import { Fallback3DContext, hasWebGL } from "./three/fallbackContext";
import type { MinigameDef, MinigameProps } from "./types";
import type { GraphicsPref } from "./useGraphicsPref";

/**
 * Runs a minigame in 3D when the device can, falling back to the flat
 * version without WebGL, if the 3D scene fails, or if the player picked
 * "simple graphics". Both share one logic hook, so scoring is identical.
 */
export function MinigamePlayer({
  def,
  graphics,
  ...props
}: MinigameProps & { def: MinigameDef; graphics: GraphicsPref }) {
  const [failed, setFailed] = useState(false);
  const { Scene3D, Fallback } = def;

  if (failed || graphics === "2d" || !hasWebGL()) return <Fallback {...props} />;
  return (
    <Fallback3DContext.Provider value={() => setFailed(true)}>
      <GameErrorBoundary fallback={<Fallback {...props} />}>
        <Suspense
          fallback={<p className="py-16 text-center text-neutral-500">Loading the pond…</p>}
        >
          <Scene3D {...props} />
        </Suspense>
      </GameErrorBoundary>
    </Fallback3DContext.Provider>
  );
}
