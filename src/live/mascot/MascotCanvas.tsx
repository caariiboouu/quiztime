import { Canvas } from "@react-three/fiber";
import { DuckModel } from "./DuckModel";
import type { MascotAnimation } from "./poses";
import type { DuckLook } from "./variants";

/**
 * A small transparent canvas with just the mascot, for DOM pages. Default
 * export so `Mascot` can lazy-load it (and three.js with it).
 */
export default function MascotCanvas({
  animation,
  look,
  crowned,
}: {
  animation: MascotAnimation;
  look?: DuckLook;
  crowned?: boolean;
}) {
  return (
    <Canvas
      aria-hidden
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ fov: 32, position: [1.3, 1.4, 4.5], near: 0.1, far: 50 }}
      onCreated={({ camera }) => camera.lookAt(0.2, 0.98, 0)}
    >
      <hemisphereLight args={["#ffffff", "#cbd5e1", 1.4]} />
      <directionalLight position={[3, 5, 4]} intensity={2} />
      {/* soft contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.05, 0.002, 0]}>
        <circleGeometry args={[0.62, 40]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <DuckModel animation={animation} look={look} crowned={crowned} rotation={[0, -0.35, 0]} />
    </Canvas>
  );
}
