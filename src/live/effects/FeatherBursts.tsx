import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
} from "three";

/** Fire a puff of feathers at a point, in a colour. */
export type FeatherApi = { burst: (x: number, y: number, z: number, color: string, count?: number) => void };

const POOL = 240;
const LIFE = 1.5;

type Feather = {
  alive: boolean;
  age: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rot: number;
  phase: number;
};

/** A little feather silhouette: a curved vane with a pointed tip. */
function featherGeometry() {
  const s = new Shape();
  s.moveTo(0, -0.09);
  s.quadraticCurveTo(0.045, -0.02, 0.012, 0.09);
  s.quadraticCurveTo(-0.03, 0.02, 0, -0.09);
  return new ShapeGeometry(s, 6);
}

/**
 * Feathers that burst out of a bump, then sway and tumble down and fade. One
 * instanced mesh for all of them, so a crowd of bumping ducks stays cheap.
 */
export function FeatherBursts({ apiRef }: { apiRef: React.RefObject<FeatherApi | null> }) {
  const mesh = useRef<InstancedMesh>(null);
  const feathers = useRef<Feather[]>(
    Array.from({ length: POOL }, () => ({
      alive: false,
      age: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      rot: 0,
      phase: 0,
    })),
  );
  const next = useRef(0);
  const geometry = useMemo(() => featherGeometry(), []);
  const material = useMemo(() => new MeshLambertMaterial({ side: DoubleSide, transparent: true }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    const color = new Color();
    apiRef.current = {
      burst: (x, y, z, hex, count = 9) => {
        const m = mesh.current;
        if (!m) return;
        color.set(hex);
        for (let i = 0; i < count; i++) {
          const k = next.current;
          next.current = (k + 1) % POOL;
          const f = feathers.current[k];
          const a = Math.random() * Math.PI * 2;
          const speed = 1.2 + Math.random() * 1.6;
          Object.assign(f, {
            alive: true,
            age: 0,
            x,
            y,
            z,
            vx: Math.cos(a) * speed,
            vz: Math.sin(a) * speed,
            vy: 1.5 + Math.random() * 1.8,
            spin: (Math.random() - 0.5) * 12,
            rot: Math.random() * Math.PI,
            phase: Math.random() * 6,
          });
          // A few lighter feathers in every puff, as real down is paler.
          m.setColorAt(k, i % 3 === 0 ? new Color(hex).lerp(new Color("#ffffff"), 0.6) : color);
        }
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  const dummy = useMemo(() => new Object3D(), []);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const d = Math.min(dt, 0.05);
    let any = false;
    feathers.current.forEach((f, i) => {
      if (f.alive) {
        f.age += d;
        if (f.age > LIFE) f.alive = false;
      }
      if (!f.alive) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        return;
      }
      any = true;
      // Burst outward, then drift: drag, gentle gravity, a side-to-side sway.
      const drag = Math.exp(-3 * d);
      f.vx *= drag;
      f.vz *= drag;
      f.vy = f.vy * Math.exp(-2.5 * d) - 2.2 * d;
      f.x += (f.vx + Math.sin(f.age * 7 + f.phase) * 0.35) * d;
      f.z += f.vz * d;
      f.y = Math.max(0.02, f.y + f.vy * d);
      f.rot += f.spin * d;
      const fade = 1 - Math.max(0, (f.age - LIFE * 0.6) / (LIFE * 0.4));
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(Math.sin(f.age * 5 + f.phase) * 0.8, f.rot, f.rot * 0.5);
      dummy.scale.setScalar(1.6 * fade);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.visible = any;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, POOL]} frustumCulled={false} />;
}

/** A bobbing gold arrow over "your" duck, so you can find yourself in a crowd. */
export function YouMarker({ height = 2.55 }: { height?: number }) {
  const ref = useRef<Object3D>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = height + Math.sin(clock.elapsedTime * 4) * 0.12;
      ref.current.rotation.y = clock.elapsedTime * 1.5;
    }
  });
  return (
    <group ref={ref} position={[0, height, 0]}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.2, 0.36, 4]} />
        <meshLambertMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}
