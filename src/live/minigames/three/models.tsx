import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from "three";
import { prefersReducedMotion } from "./fallbackContext";

/** Pond surface with gentle low-poly waves (still if reduced motion is on). */
export function Water({ width, depth }: { width: number; depth: number }) {
  const ref = useRef<Mesh>(null);
  const still = useMemo(() => prefersReducedMotion(), []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (still || !mesh) return;
    const t = clock.elapsedTime;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 1.3 + t * 1.2) * 0.04 + Math.cos(y * 1.7 + t) * 0.03);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry
        args={[width, depth, Math.min(64, Math.round(width * 3)), Math.min(48, Math.round(depth * 3))]}
      />
      <meshStandardMaterial color="#38bdf8" roughness={0.35} metalness={0.05} flatShading />
    </mesh>
  );
}

/** A lily pad (with the classic notch). `glow` lifts it and lights it up. */
export function LilyPad({
  position,
  radius = 0.7,
  glow = false,
  rotation = 0,
  onClick,
}: {
  position: [number, number, number];
  radius?: number;
  glow?: boolean;
  rotation?: number;
  onClick?: () => void;
}) {
  const group = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    if (!group.current || !mat.current) return;
    const k = Math.min(1, dt * 14);
    group.current.position.y += ((glow ? 0.28 : 0.04) - group.current.position.y) * k;
    mat.current.emissiveIntensity += ((glow ? 0.9 : 0) - mat.current.emissiveIntensity) * k;
  });
  return (
    <group ref={group} position={position} rotation={[0, rotation, 0]}>
      {/* Flat on the water, so it only receives shadows (casting causes acne). */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
        <circleGeometry args={[radius, 40, 0.35, Math.PI * 2 - 0.5]} />
        <meshStandardMaterial
          ref={mat}
          color={glow ? "#bef264" : "#16a34a"}
          emissive="#a3e635"
          emissiveIntensity={0}
          roughness={0.6}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** Flat ring on the water, e.g. a target zone or a splash. */
export function Ring({
  position,
  inner,
  outer,
  color,
  opacity = 1,
}: {
  position: [number, number, number];
  inner: number;
  outer: number;
  color: string;
  opacity?: number;
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[inner, outer, 48]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
