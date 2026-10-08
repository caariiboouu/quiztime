import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { DuckStopControls, DuckStopHud } from "./DuckStop2D";
import { MISS_DISTANCE, useDuckStop } from "./logic/useDuckStop";
import { DuckModel } from "../mascot/DuckModel";
import type { MascotAnimation } from "../mascot/poses";
import { LilyPad, Ring, Water } from "./three/models";
import { Stage3D } from "./three/Stage3D";
import type { MinigameProps } from "./types";

/** Width of the duck's swim lane in world units (pond position 0–1 maps onto it). */
const LANE = 9;
const toX = (pos: number) => (pos - 0.5) * LANE;

type Game = ReturnType<typeof useDuckStop>;

export default function DuckStop3D(props: MinigameProps) {
  const game = useDuckStop(props);
  // The scene reads the latest game state each frame without re-rendering.
  const gameRef = useRef(game);
  useLayoutEffect(() => {
    gameRef.current = game;
  });
  const padX = toX(game.target);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4">
      <DuckStopHud round={game.round} total={game.total} />
      <Stage3D
        fit={{ width: LANE + 1.6, depth: 3.5 }}
        elevation={58}
        description="A ceramic duck swims left and right across a pond. Stop it on the lily pad."
      >
        <Water width={30} depth={24} />
        {/* Faint ring: anywhere inside it still scores something. */}
        <Ring position={[padX, 0.12, 0]} inner={MISS_DISTANCE * LANE - 0.06} outer={MISS_DISTANCE * LANE} color="#ffffff" opacity={0.5} />
        <LilyPad position={[padX, 0, 0]} radius={0.75} />
        <SwimmingDuck gameRef={gameRef} mood={reaction(game.lastScore)} />
        {game.stoppedAt !== null && <Splash key={`${game.round}`} x={toX(game.stoppedAt)} />}
      </Stage3D>
      <DuckStopControls
        feedback={game.feedback}
        disabled={game.stoppedAt !== null || game.over}
        onStop={game.stop}
      />
    </div>
  );
}

/** How the duck reacts to the stop just made (it swims otherwise). */
function reaction(score: number | null): MascotAnimation {
  if (score === null) return "swim";
  return score >= 90 ? "celebrate" : score > 0 ? "quack" : "sad";
}

function SwimmingDuck({ gameRef, mood }: { gameRef: React.RefObject<Game>; mood: MascotAnimation }) {
  const ref = useRef<Group>(null);
  const lastX = useRef(0);
  useFrame(() => {
    const duck = ref.current;
    const game = gameRef.current;
    if (!duck || !game) return;
    // Same clock the scoring uses, so what you see is what you score.
    const pos = game.stoppedAt ?? game.positionAt(performance.now());
    const x = toX(pos);
    const dx = x - lastX.current;
    lastX.current = x;
    duck.position.x = x;
    if (Math.abs(dx) > 1e-4) {
      const face = dx > 0 ? 0 : Math.PI;
      duck.rotation.y += (face - duck.rotation.y) * 0.25;
    }
  });
  // Sits low in the water while swimming; the mascot handles its own bobbing.
  return (
    <group ref={ref} position={[0, mood === "swim" ? -0.12 : 0, 0]}>
      <DuckModel animation={mood} scale={0.85} />
    </group>
  );
}

/** Expanding ring where the duck stopped. */
function Splash({ x }: { x: number }) {
  const mesh = useRef<Mesh>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    born.current ??= clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - born.current) / 0.9);
    mesh.current.scale.setScalar(0.4 + t * 2.2);
    (mesh.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - t);
  });
  return (
    <mesh ref={mesh} position={[x, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.45, 0.6, 40]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}
