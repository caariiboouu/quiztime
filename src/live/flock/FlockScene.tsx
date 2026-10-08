import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import type { Dir } from "../../../shared/flock";
import { DuckModel } from "../mascot/DuckModel";
import type { MascotAnimation } from "../mascot/poses";
import type { DuckLook } from "../mascot/variants";
import { FitCamera } from "../minigames/three/Stage3D";
import {
  emote,
  holdWalker,
  makeWalker,
  pressWalker,
  scatter,
  updateFlock,
  type Bounds,
  type Walker,
} from "../../../shared/flock";
import { NameTag } from "./NameTag";
import { FeatherBursts, YouMarker, type FeatherApi } from "../effects/FeatherBursts";
import { placeDuck } from "../arena/placeDuck";
import { playDuckSound, type DuckSound } from "../effects/sound";
import type { DuckAnim } from "../../../shared/flock";

export type FlockMember = { id: string; name: string; look: DuckLook; crowned?: boolean };

/** Imperative handle for whoever owns the controls (keyboard, network…). */
export type FlockControl = {
  /** A fresh press: one step, with a very slight boost. */
  step: (id: string, dir: Dir) => void;
  /** The directions held down now (walk until let go); [] lets go. */
  hold: (id: string, dirs: Dir[]) => void;
  emote: (id: string, anim: MascotAnimation, seconds?: number) => void;
  /** Make every duck do something at once. */
  everyone: (anim: MascotAnimation, seconds?: number) => void;
};

export type FlockStats = { fps: number; calls: number; triangles: number; ducks: number };

type FlockSceneProps = {
  members: FlockMember[];
  /** Ducks steered by a player rather than wandering. */
  controlled?: string[];
  /** Highlighted name tag (e.g. "you"). */
  highlightId?: string;
  controlRef?: React.RefObject<FlockControl | null>;
  onStats?: (s: FlockStats) => void;
  detail?: "hero" | "crowd";
  className?: string;
  description: string;
  showTags?: boolean;
};

/**
 * Every player's duck in one canvas (browsers cap how many WebGL canvases a
 * page can have, so a crowd must share one). Ducks wander unless controlled;
 * new members waddle in from the front edge. Default export for lazy loading.
 */
export default function FlockScene({
  className = "aspect-[4/3] sm:aspect-video",
  description,
  ...props
}: FlockSceneProps) {
  const layout = useMemo(() => scatter(Math.max(8, props.members.length)), [props.members.length]);
  return (
    <div className={`relative w-full overflow-hidden rounded-3xl bg-emerald-200 shadow-inner ${className}`}>
      <Canvas aria-hidden dpr={[1, 1.75]} camera={{ fov: 38, near: 0.1, far: 200 }}>
        <color attach="background" args={["#bfe9c9"]} />
        <hemisphereLight args={["#ffffff", "#5b8a5b", 1.25]} />
        <directionalLight position={[4, 10, 6]} intensity={1.7} />
        {/* Generous margins: ducks stand ~1.4 tall with name tags above, and
            those nearest the camera loom larger than the fit assumes. */}
        <FitCamera
          width={layout.bounds.halfWidth * 2 + 3}
          depth={layout.bounds.halfDepth * 2 + 4.5}
          elevation={56}
        />
        <Field bounds={layout.bounds} />
        <FlockWorld {...props} layout={layout} />
      </Canvas>
      <p className="sr-only">{description}</p>
    </div>
  );
}

function Field({ bounds }: { bounds: Bounds }) {
  // Far bigger than the play area so its edges never show, whatever the aspect.
  const w = bounds.halfWidth * 2 + 80;
  const d = bounds.halfDepth * 2 + 80;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[w, d]} />
        <meshLambertMaterial color="#8fd694" />
      </mesh>
      {/* a pond along the back edge, for the ducks' sake */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -bounds.halfDepth - 1.6]} scale={[1, 0.35, 1]}>
        <circleGeometry args={[bounds.halfWidth * 0.8, 48]} />
        <meshLambertMaterial color="#5ec4ea" />
      </mesh>
    </group>
  );
}

function FlockWorld({
  members,
  controlled = [],
  highlightId,
  controlRef,
  onStats,
  detail = "crowd",
  showTags = true,
  layout,
}: Omit<FlockSceneProps, "className" | "description"> & { layout: ReturnType<typeof scatter> }) {
  const walkers = useRef(new Map<string, Walker>());
  const groups = useRef(new Map<string, Group>());
  const feathers = useRef<FeatherApi | null>(null);
  const lastAnim = useRef(new Map<string, DuckAnim>());
  const colorOf = useMemo(() => new Map(members.map((m) => [m.id, m.look.feather])), [members]);
  const clock = useThree((s) => s.clock);
  const gl = useThree((s) => s.gl);

  // Keep a walker per member. Newcomers waddle in from the front edge; when
  // the flock grows, everyone not under player control spreads out to the
  // bigger layout's spots.
  useEffect(() => {
    const map = walkers.current;
    const ids = new Set(members.map((m) => m.id));
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id);
    const firstFill = map.size === 0;
    members.forEach((m, i) => {
      const [sx, sz] = layout.spots[i % layout.spots.length];
      let w = map.get(m.id);
      if (!w) {
        w = firstFill ? makeWalker(m.id, sx, sz) : makeWalker(m.id, sx, layout.bounds.halfDepth);
        w.nextWander = clock.elapsedTime + 1 + Math.random() * 4;
        map.set(m.id, w);
      } else if (controlled.includes(m.id)) {
        return;
      }
      w.tx = sx;
      w.tz = sz;
    });
    // `controlled` is read, not reacted to: re-spreading on its own changes
    // would yank ducks away from their players.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, layout, clock]);

  const wanderers = useMemo(
    () => new Set(members.map((m) => m.id).filter((id) => !controlled.includes(id))),
    [members, controlled],
  );

  // The imperative API the page uses to drive ducks.
  useEffect(() => {
    if (!controlRef) return;
    const get = (id: string) => walkers.current.get(id);
    controlRef.current = {
      step: (id, dir) => {
        const w = get(id);
        if (w) pressWalker(w, dir, layout.bounds, clock.elapsedTime);
      },
      hold: (id, dirs) => {
        const w = get(id);
        if (w) holdWalker(w, dirs);
      },
      emote: (id, anim, seconds) => {
        const w = get(id);
        if (w) emote(w, anim, clock.elapsedTime, seconds);
      },
      everyone: (anim, seconds = 2.5) => {
        for (const w of walkers.current.values()) emote(w, anim, clock.elapsedTime, seconds);
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, layout, clock]);

  // One update for the whole flock, then place each duck.
  const stats = useRef({ frames: 0, since: 0 });
  useFrame((_, dt) => {
    const list = [...walkers.current.values()];
    updateFlock(list, dt, clock.elapsedTime, { bounds: layout.bounds, wanderers });
    for (const w of list) {
      const g = groups.current.get(w.id);
      if (!g) continue;
      placeDuck(g, w.x, w.air, w.z, w.heading);
      // Bumps and take-offs: feathers fly; every quack is heard from
      // where your duck stands (nearer is louder).
      const before = lastAnim.current.get(w.id);
      if (w.anim !== before) {
        lastAnim.current.set(w.id, w.anim);
        const color = colorOf.get(w.id) ?? "#ffffff";
        let sound: DuckSound | null = null;
        if (w.anim === "fly") {
          feathers.current?.burst(w.x, w.air + 0.8, w.z, color, 20);
          sound = "takeoff";
        } else if (before === "fly") {
          feathers.current?.burst(w.x, 0.4, w.z, color, 6);
        } else if (w.anim === "bump") {
          feathers.current?.burst(w.x, w.air + 0.8, w.z, color);
          sound = "bump";
        } else if (w.anim === "quack") {
          sound = "quack";
        }
        const ear = highlightId ? walkers.current.get(highlightId) : undefined;
        if (sound && ear && before !== undefined) playDuckSound(sound, { dx: w.x - ear.x, dz: w.z - ear.z });
      }
    }
    if (onStats) {
      const s = stats.current;
      s.frames++;
      const now = clock.elapsedTime;
      if (now - s.since >= 1) {
        onStats({
          fps: Math.round(s.frames / (now - s.since)),
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          ducks: list.length,
        });
        s.frames = 0;
        s.since = now;
      }
    }
  });

  const register = useCallback((id: string, g: Group | null) => {
    if (g) groups.current.set(id, g);
    else groups.current.delete(id);
  }, []);

  return (
    <>
      <FeatherBursts apiRef={feathers} />
      {members.map((m) => (
        <FlockDuck
          key={m.id}
          member={m}
          walkers={walkers}
          register={register}
          detail={detail}
          tag={showTags}
          highlight={m.id === highlightId}
        />
      ))}
    </>
  );
}

function FlockDuck({
  member,
  walkers,
  register,
  detail,
  tag,
  highlight,
}: {
  member: FlockMember;
  walkers: React.RefObject<Map<string, Walker>>;
  register: (id: string, g: Group | null) => void;
  detail: "hero" | "crowd";
  tag: boolean;
  highlight: boolean;
}) {
  // Read every frame by DuckModel, so the flock can change animations
  // without re-rendering React.
  const anim = () => walkers.current?.get(member.id)?.anim ?? "idle";
  // Bend the neck away from neighbours instead of clipping through them.
  const overlay = () => {
    const w = walkers.current?.get(member.id);
    return w ? { headYaw: w.neckYaw, headPitch: w.neckPitch } : null;
  };
  return (
    <group ref={(g) => register(member.id, g)}>
      {/* children[0]: everything that rises when the duck hops or flies */}
      <group>
        <DuckModel
          look={member.look}
          crowned={member.crowned}
          animation={anim}
          overlay={overlay}
          detail={detail}
          shadows={false}
        />
        {highlight && <YouMarker height={2.75} />}
        {tag && (
          <NameTag
            text={member.name}
            color={member.look.accent}
            highlight={highlight}
            height={highlight ? 0.4 : 0.3}
          />
        )}
      </group>
      {/* children[1]: cheap blob shadow, staying on the ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.05, 0.005, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#14532d" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {highlight && (
        // A ring on the ground so "you" are easy to find.
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.55, 0.68, 40]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
