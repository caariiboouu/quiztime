import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { Control } from "../controls";
import { DIRS, usePondMemory, type PondPhase } from "./logic/usePondMemory";
import { DirectionPad, PondMemoryHud } from "./PondMemory2D";
import { DuckModel } from "../mascot/DuckModel";
import type { MascotAnimation } from "../mascot/poses";
import { LilyPad, Water } from "./three/models";
import { Stage3D } from "./three/Stage3D";
import type { MinigameProps } from "./types";

const SPREAD = 2.3;
/** Pads sit where the arrow keys point: up = far, down = near. */
const PAD_AT: Record<string, [number, number, number]> = {
  up: [0, 0, -SPREAD],
  left: [-SPREAD, 0, 0],
  right: [SPREAD, 0, 0],
  down: [0, 0, SPREAD],
};
/** Duck yaw (it faces +x at 0) to look toward each pad. */
const FACE: Record<string, number> = {
  right: 0,
  up: Math.PI / 2,
  left: Math.PI,
  down: -Math.PI / 2,
};

export default function PondMemory3D(props: MinigameProps) {
  const game = usePondMemory(props);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4">
      <PondMemoryHud level={game.level} best={game.best} status={game.status} />
      <Stage3D
        fit={{ width: SPREAD * 2 + 2, depth: SPREAD * 2 + 2 }}
        elevation={62}
        className="aspect-square sm:aspect-[4/3]"
        description="Four lily pads around a ceramic duck. Pads light up in a pattern to repeat with the arrow keys."
      >
        <Water width={24} depth={24} />
        {DIRS.map((d) => (
          <group key={d}>
            <LilyPad
              position={PAD_AT[d]}
              radius={0.9}
              glow={game.lit === d}
              rotation={FACE[d]}
              onClick={() => game.press(d)}
            />
            <ArrowMarker dir={d} />
          </group>
        ))}
        <CenterDuck lit={game.lit} phase={game.phase} />
      </Stage3D>
      <DirectionPad onPress={game.press} disabled={!game.canPress} lit={game.lit} />
    </div>
  );
}

/** White arrow on the water just outside each pad, pointing its way. */
function ArrowMarker({ dir }: { dir: Control }) {
  const [x, , z] = PAD_AT[dir];
  const out = 1.25;
  return (
    <mesh
      position={[x * out, 0.1, z * out]}
      rotation={[-Math.PI / 2, 0, FACE[dir] - Math.PI / 2]}
    >
      <circleGeometry args={[0.22, 3]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
    </mesh>
  );
}

function CenterDuck({ lit, phase }: { lit: Control | null; phase: PondPhase }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const duck = ref.current;
    if (!duck) return;
    // Turn (the short way round) to face the lit pad.
    const target = lit ? FACE[lit] : -Math.PI / 2;
    let diff = target - duck.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    duck.rotation.y += diff * Math.min(1, dt * 10);
  });
  const mood: MascotAnimation =
    phase === "success" ? "celebrate" : phase === "oops" ? "sad" : lit ? "quack" : "idle";
  return (
    <group ref={ref}>
      <DuckModel animation={mood} scale={1.1} />
    </group>
  );
}
