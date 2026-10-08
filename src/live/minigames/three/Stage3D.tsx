import { Canvas, useThree } from "@react-three/fiber";
import { useContext, useLayoutEffect } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { Fallback3DContext } from "./fallbackContext";

type Stage3DProps = {
  children: React.ReactNode;
  /** World-space width × depth that must stay in view on any screen shape. */
  fit: { width: number; depth: number };
  /** Camera elevation in degrees: 90 is straight down. */
  elevation?: number;
  /** What the scene shows, for screen readers (the canvas itself is hidden). */
  description: string;
  className?: string;
};

/**
 * Shared 3D stage for minigames: lights, soft shadows, and a camera that keeps
 * the play area fully in frame from phone-portrait to widescreen.
 *
 * The canvas is presentation only. Game state, scoring and controls live in
 * the game's logic hook and the DOM around the canvas, so the game stays
 * accessible and plays the same with the 2D fallback.
 */
export function Stage3D({
  children,
  fit,
  elevation = 55,
  description,
  className = "aspect-[4/3] sm:aspect-video",
}: Stage3DProps) {
  const fail = useContext(Fallback3DContext);
  return (
    <div className={`relative w-full overflow-hidden rounded-3xl bg-sky-200 shadow-inner ${className}`}>
      <Canvas
        aria-hidden
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.1, far: 100 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            fail();
          });
        }}
      >
        <color attach="background" args={["#bae6fd"]} />
        <hemisphereLight args={["#f0f9ff", "#0c4a6e", 0.9]} />
        <directionalLight
          position={[4, 9, 5]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
        />
        <FitCamera width={fit.width} depth={fit.depth} elevation={elevation} />
        {children}
      </Canvas>
      <p className="sr-only">{description}</p>
    </div>
  );
}

/** Position the camera so a width × depth area at the origin fills the view. */
export function FitCamera({ width, depth, elevation }: { width: number; depth: number; elevation: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const el = (elevation * Math.PI) / 180;
    // Depth seen at an angle shrinks by sin(elevation).
    const visibleDepth = depth * Math.sin(el) + 0.5;
    const dist = Math.max(width / 2 / Math.tan(hfov / 2), visibleDepth / 2 / Math.tan(vfov / 2)) + 1;
    camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    camera.lookAt(new Vector3(0, 0, 0));
    camera.updateProjectionMatrix();
  }, [camera, size, width, depth, elevation]);
  return null;
}
