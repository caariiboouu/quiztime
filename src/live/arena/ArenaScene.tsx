import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Color, type Group, type PerspectiveCamera } from "three";
import { zoneAt, type ArenaLayout } from "../../../shared/arena";
import type { DuckAnim } from "../../../shared/flock";
import { NameTag } from "../flock/NameTag";
import { DuckModel } from "../mascot/DuckModel";
import type { DuckLook } from "../mascot/variants";
import { FitCamera } from "../minigames/three/Stage3D";
import { ZONE_COLORS } from "./colors";
import type { ArenaSource } from "./source";
import { ZoneCardTracker, ZoneCards } from "./ZoneCards";
import { placeDuck } from "./placeDuck";
import { FeatherBursts, YouMarker, type FeatherApi } from "../effects/FeatherBursts";
import { playDuckSound, type DuckSound } from "../effects/sound";

export type ArenaMember = { id: string; name: string; look: DuckLook; crowned?: boolean };

type ArenaSceneProps = {
  layout: ArenaLayout;
  options: { id: string; text: string }[];
  members: ArenaMember[];
  source: ArenaSource;
  youId?: string;
  /** After the reveal: the right zone lights up (null for polls: no right answer). */
  reveal?: { correctIndex: number | null } | null;
  /** Follow this duck with the camera (players); otherwise show the whole arena. */
  follow?: string | null;
  /** The answer "you" are standing on (its card is highlighted). */
  current?: number | null;
  /** Px at the bottom covered by on-screen controls: answer cards keep clear. */
  safeBottom?: number;
  className?: string;
  description: string;
};

/**
 * The answer arena: answer wedges around a neutral middle, every player's
 * duck, and each answer floating over its zone. Default export for lazy loading.
 */
export default function ArenaScene({
  layout,
  className = "aspect-square sm:aspect-[4/3]",
  description,
  safeBottom = 0,
  ...props
}: ArenaSceneProps) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  return (
    <div className={`relative w-full overflow-hidden rounded-3xl bg-emerald-200 shadow-inner ${className}`}>
      <Canvas aria-hidden dpr={[1, 1.75]} camera={{ fov: 38, near: 0.1, far: 200 }}>
        <color attach="background" args={["#bfe9c9"]} />
        <hemisphereLight args={["#ffffff", "#5b8a5b", 1.25]} />
        <directionalLight position={[4, 10, 6]} intensity={1.7} />
        {props.follow ? (
          <FollowCamera source={props.source} id={props.follow} />
        ) : (
          <FitCamera width={layout.radius * 2 + 1.2} depth={layout.radius * 2 + 3.2} elevation={62} />
        )}
        <ArenaGround layout={layout} reveal={props.reveal ?? null} />
        <ZoneCardTracker layout={layout} refs={cardRefs} safeBottom={safeBottom} />
        <ArenaDucks layout={layout} {...props} />
      </Canvas>
      <ZoneCards
        options={props.options}
        layout={layout}
        refs={cardRefs}
        current={props.current}
        reveal={props.reveal}
      />
      <p className="sr-only">{description}</p>
    </div>
  );
}

/** How much ground the follow camera shows across (about 11 duck lengths). */
const FOLLOW_VIEW = 14;

/** Keeps one duck in the middle of the view, gliding after it. */
function FollowCamera({ source, id }: { source: ArenaSource; id: string }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const focus = useRef({ x: 0, z: 0, ready: false });
  useFrame((_, dt) => {
    const s = source.get(id);
    const f = focus.current;
    if (s) {
      if (!f.ready) {
        f.x = s.x;
        f.z = s.z;
        f.ready = true;
      }
      const k = 1 - Math.exp(-dt * 4);
      f.x += (s.x - f.x) * k;
      f.z += (s.z - f.z) * k;
    }
    const aspect = size.width / Math.max(1, size.height);
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = Math.max(FOLLOW_VIEW / 2 / Math.tan(hfov / 2), (FOLLOW_VIEW * 0.55) / Math.tan(vfov / 2)) + 1;
    const el = (56 * Math.PI) / 180;
    camera.position.set(f.x, Math.sin(el) * dist, f.z + Math.cos(el) * dist);
    camera.lookAt(f.x, 0.6, f.z);
  });
  return null;
}

function tint(hex: string, toward: string, amount: number): string {
  return `#${new Color(hex).lerp(new Color(toward), amount).getHexString()}`;
}

function ArenaGround({
  layout,
  reveal,
}: {
  layout: ArenaLayout;
  reveal: { correctIndex: number | null } | null;
}) {
  const flat: [number, number, number] = [-Math.PI / 2, 0, 0];
  return (
    <group>
      <mesh rotation={flat} position={[0, -0.02, 0]}>
        <planeGeometry args={[layout.radius * 2 + 80, layout.radius * 2 + 80]} />
        <meshLambertMaterial color="#8fd694" />
      </mesh>
      {/* the arena floor */}
      <mesh rotation={flat} position={[0, -0.01, 0]}>
        <circleGeometry args={[layout.radius + 0.35, 72]} />
        <meshLambertMaterial color="#e9dfc8" />
      </mesh>
      {layout.zones.map((z) => {
        const base = ZONE_COLORS[z.index % ZONE_COLORS.length];
        const correct = reveal?.correctIndex === z.index;
        const wrong = reveal != null && reveal.correctIndex !== null && !correct;
        const color = correct ? tint(base, "#ffffff", 0.15) : wrong ? "#d6d3cd" : tint(base, "#ffffff", 0.55);
        return (
          <mesh key={z.index} rotation={flat} position={[0, correct ? 0.02 : 0, 0]}>
            <ringGeometry args={[layout.neutral + 0.06, layout.radius, 64, 1, z.start, z.span]} />
            <meshLambertMaterial color={color} />
          </mesh>
        );
      })}
      {/* white lines: round the middle, and between zones */}
      <mesh rotation={flat} position={[0, 0.01, 0]}>
        <ringGeometry args={[layout.neutral - 0.05, layout.neutral + 0.05, 72]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {layout.zones.map((z) => {
        const len = layout.radius - layout.neutral;
        const mid = (layout.radius + layout.neutral) / 2;
        return (
          <mesh
            key={`line-${z.index}`}
            rotation={[-Math.PI / 2, 0, z.start]}
            position={[Math.cos(z.start) * mid, 0.01, -Math.sin(z.start) * mid]}
          >
            <planeGeometry args={[len, 0.1]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        );
      })}
    </group>
  );
}

/** Reveal animations for ducks on the right answer (anything but asleep). */
const HAPPY: DuckAnim[] = ["celebrate", "dance", "flap", "quack"];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return h >>> 0;
}

function ArenaDucks({
  layout,
  members,
  source,
  youId,
  reveal,
}: Omit<ArenaSceneProps, "className" | "description" | "options"> & { layout: ArenaLayout }) {
  const groups = useRef(new Map<string, Group>());
  const feathers = useRef<FeatherApi | null>(null);
  const lastAnim = useRef(new Map<string, DuckAnim>());
  const colorOf = useMemo(() => new Map(members.map((m) => [m.id, m.look.feather])), [members]);
  const duckEvent = (id: string, anim: DuckAnim, before: DuckAnim | undefined, x: number, y: number, z: number) => {
    const color = colorOf.get(id) ?? "#ffffff";
    let sound: DuckSound | null = null;
    if (anim === "fly") {
      feathers.current?.burst(x, y + 0.8, z, color, 20);
      sound = "takeoff";
    } else if (before === "fly") {
      feathers.current?.burst(x, 0.4, z, color, 6); // landing puff
    } else if (anim === "bump") {
      feathers.current?.burst(x, y + 0.8, z, color);
      sound = "bump";
    } else if (anim === "quack") {
      sound = "quack";
    }
    // Every duck is heard from where yours stands: nearer is louder. (The
    // presenter's screen has no duck of its own, so it stays quiet.)
    const ear = youId ? source.get(youId) : undefined;
    if (sound && ear && before !== undefined) playDuckSound(sound, { dx: x - ear.x, dz: z - ear.z });
  };
  // Read every frame without re-rendering.
  const revealRef = useRef(reveal ?? null);
  useLayoutEffect(() => {
    revealRef.current = reveal ?? null;
  }, [reveal]);

  useFrame((_, dt) => {
    source.update?.(dt);
    for (const [id, g] of groups.current) {
      const s = source.get(id);
      g.visible = !!s;
      if (!s) continue;
      placeDuck(g, s.x, s.y, s.z, s.heading);
      // Bumps and take-offs: feathers fly; every quack is heard.
      const before = lastAnim.current.get(id);
      if (s.anim !== before) {
        lastAnim.current.set(id, s.anim);
        duckEvent(id, s.anim, before, s.x, s.y, s.z);
      }
    }
  });

  const register = useCallback((id: string, g: Group | null) => {
    if (g) groups.current.set(id, g);
    else groups.current.delete(id);
  }, []);

  const animFor = useMemo(
    () =>
      (id: string): DuckAnim => {
        const s = source.get(id);
        if (!s) return "idle";
        const r = revealRef.current;
        if (!r) return s.anim;
        const zone = zoneAt(layout, s.x, s.z);
        // Right answer (or, for a poll, any answer): a happy move, picked per
        // duck so every screen shows the same one. Everyone else dozes off.
        const happy = r.correctIndex === null ? zone !== null : zone === r.correctIndex;
        return happy ? HAPPY[hashId(id) % HAPPY.length] : "sleep";
      },
    [source, layout],
  );

  return (
    <>
      <FeatherBursts apiRef={feathers} />
      {members.map((m) => (
        <group key={m.id} ref={(g) => register(m.id, g)}>
          {/* children[0]: everything that rises when the duck hops or flies */}
          <group>
            <DuckModel
              look={m.look}
              crowned={m.crowned}
              detail="crowd"
              shadows={false}
              animation={() => animFor(m.id)}
              overlay={() => {
                const s = source.get(m.id);
                return s ? { headYaw: s.neckYaw, headPitch: s.neckPitch } : null;
              }}
            />
            {m.id === youId && <YouMarker height={2.75} />}
            <NameTag
              text={m.id === youId ? `${m.name} (you)` : m.name}
              color={m.look.accent}
              highlight={m.id === youId}
              height={m.id === youId ? 0.36 : 0.26}
            />
          </group>
          {/* children[1]: the shadow stays on the ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.05, 0.005, 0]}>
            <circleGeometry args={[0.48, 24]} />
            <meshBasicMaterial color="#3f3a2e" transparent opacity={0.16} depthWrite={false} />
          </mesh>
          {m.id === youId && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
              <ringGeometry args={[0.55, 0.7, 40]} />
              <meshBasicMaterial color="#f59e0b" transparent opacity={0.95} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}
