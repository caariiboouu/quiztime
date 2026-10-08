import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Vector3, type Group, type OrthographicCamera } from "three";
import {
  makeSideBody,
  sideDrop,
  sideEmote,
  sideFlyTo,
  sideHold,
  sideJump,
  sideSettled,
  sideStep,
  stepSide,
  type Platform,
  type SideAnim,
  type SideBody,
} from "../../../shared/platformer";
import { useControls } from "../controls";
import { FeatherBursts, type FeatherApi } from "../effects/FeatherBursts";
import { playDuckSound, type DuckSound } from "../effects/sound";
import { DuckModel } from "../mascot/DuckModel";
import type { MascotAnimation } from "../mascot/poses";
import type { DuckLook } from "../mascot/variants";

/** A platform as drawn: a shelf plank, a podium block, or the floor. */
export type StagePlatform = Platform & {
  style: "plank" | "block" | "floor";
  color?: string;
  /** Blocks: where the bottom is (they stand on something). */
  base?: number;
};

export type StageDuck = { id: string; look: DuckLook; bare?: boolean; crowned?: boolean };

/** Where a duck belongs: a spot on a platform (it goes back there if knocked off). */
export type StageHome = { x: number; ground: number };

export type StageView = { minX: number; maxX: number; minY: number; maxY: number };

/** Looking at the ducks nearly side-on, a touch from above. */
const TILT = (9 * Math.PI) / 180;
const PLANK_DEPTH = 1.5;
/** Held poses: all with feet on the ground ("celebrate" holds mid-jump, so it only plays). */
const POSES: MascotAnimation[] = ["idle", "dance", "quack", "flap", "idle", "waddle"];
const MOVES: MascotAnimation[] = ["dance", "celebrate", "quack", "flap", "waddle"];

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A side-on stage: ducks on platforms seen almost face-on (orthographic, so
 * every level is the same size), with tags under them. The 2D counterpart of
 * the arena: shared/platformer.ts does the moving. Ducks hold poses and now
 * and then animate; knocked off their spot, they hop back. If `meId` is set
 * and `controls` on, the keys move that duck (←/→ walk, ↑ jump, ↓ drop,
 * Space quack). Default export, for lazy loading.
 */
export default function SideStage({
  platforms,
  ducks,
  homes,
  view,
  meId = null,
  controls = false,
  renderTag,
  onSelect,
  tagLabel,
  className = "",
}: {
  platforms: StagePlatform[];
  ducks: StageDuck[];
  homes: Map<string, StageHome>;
  view: StageView;
  meId?: string | null;
  controls?: boolean;
  /** What each duck's tag says (no tag if left out). */
  renderTag?: (id: string) => React.ReactNode;
  onSelect?: (id: string) => void;
  tagLabel?: (id: string) => string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const zoom = width / (view.maxX - view.minX);
  const height = Math.round(Math.max(240, zoom * (view.maxY - view.minY) * Math.cos(TILT)));
  const tagRefs = useRef(new Map<string, HTMLButtonElement>());

  return (
    <div ref={box} className={`relative w-full overflow-hidden ${className}`} style={{ height }}>
      <Canvas aria-hidden dpr={[1, 1.75]} orthographic camera={{ near: 0.1, far: 400, zoom }}>
        <color attach="background" args={["#e8f4ec"]} />
        <hemisphereLight args={["#ffffff", "#8a9a8a", 1.3]} />
        <directionalLight position={[3, 8, 10]} intensity={1.6} />
        <StageCamera zoom={zoom} view={view} />
        <Stage
          platforms={platforms}
          ducks={ducks}
          homes={homes}
          view={view}
          meId={meId}
          controls={controls}
          tagRefs={tagRefs}
        />
      </Canvas>
      {renderTag && (
        <div className="pointer-events-none absolute inset-0">
          {ducks.map((d) => (
            <button
              key={d.id}
              type="button"
              ref={(el) => {
                if (el) tagRefs.current.set(d.id, el);
                else tagRefs.current.delete(d.id);
              }}
              onClick={() => onSelect?.(d.id)}
              aria-label={tagLabel?.(d.id)}
              className="pointer-events-auto absolute left-0 top-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              style={{ visibility: "hidden" }}
            >
              {renderTag(d.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StageCamera({ zoom, view }: { zoom: number; view: StageView }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const camera = get().camera as OrthographicCamera;
    const cx = (view.minX + view.maxX) / 2;
    const cy = (view.minY + view.maxY) / 2;
    const dist = 80;
    camera.zoom = zoom;
    camera.position.set(cx, cy + Math.sin(TILT) * dist, Math.cos(TILT) * dist);
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix();
  }, [get, size, zoom, view]);
  return null;
}

function Stage({
  platforms,
  ducks,
  homes,
  view,
  meId,
  controls,
  tagRefs,
}: {
  platforms: StagePlatform[];
  ducks: StageDuck[];
  homes: Map<string, StageHome>;
  view: StageView;
  meId: string | null;
  controls: boolean;
  tagRefs: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  const clock = useThree((s) => s.clock);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const bodies = useRef(new Map<string, SideBody>());
  const headings = useRef(new Map<string, number>());
  const away = useRef(new Map<string, number>());
  const sched = useRef(new Map<string, { base: MascotAnimation; anim: MascotAnimation; held: boolean; until: number }>());
  const groups = useRef(new Map<string, Group>());
  const lastAnim = useRef(new Map<string, SideAnim>());
  const feathers = useRef<FeatherApi | null>(null);
  const lastHomes = useRef(new Map<string, StageHome>());
  const colorOf = useMemo(() => new Map(ducks.map((d) => [d.id, d.look.feather])), [ducks]);
  const bounds = useMemo(() => ({ minX: view.minX + 0.4, maxX: view.maxX - 0.4 }), [view]);

  // Everyone starts at home; when their home moves (standings changed), off they go.
  useEffect(() => {
    const ids = new Set(ducks.map((d) => d.id));
    for (const id of [...bodies.current.keys()]) if (!ids.has(id)) bodies.current.delete(id);
    for (const d of ducks) {
      const home = homes.get(d.id);
      if (!home) continue;
      const was = lastHomes.current.get(d.id);
      lastHomes.current.set(d.id, home);
      let b = bodies.current.get(d.id);
      if (!b) {
        b = makeSideBody(d.id, home.x, platforms, home.ground);
        bodies.current.set(d.id, b);
      } else if (d.id !== meId && was && (was.x !== home.x || was.ground !== home.ground)) {
        sideFlyTo(b, home.x, platforms, home.ground, clock.elapsedTime);
      }
      if (!sched.current.has(d.id)) {
        const base = POSES[hash(d.id) % POSES.length];
        sched.current.set(d.id, { base, anim: base, held: true, until: clock.elapsedTime + 2 + (hash(d.id) % 900) / 100 });
      }
    }
  }, [ducks, homes, platforms, meId, clock]);

  const me = () => (meId ? bodies.current.get(meId) : undefined);
  const heldDirs = useRef<string[]>([]);
  useControls(
    {
      onControl: (c) => {
        const b = me();
        if (!b) return;
        if (c === "left") sideStep(b, -1);
        else if (c === "right") sideStep(b, 1);
        else if (c === "up") sideJump(b);
        else if (c === "down") sideDrop(b, platforms, clock.elapsedTime);
        else sideEmote(b, "quack", clock.elapsedTime, 1.2);
      },
      onHeld: (dirs) => {
        heldDirs.current = dirs;
        const b = me();
        if (!b) return;
        const right = dirs.includes("right");
        const left = dirs.includes("left");
        sideHold(b, right && !left ? 1 : left && !right ? -1 : 0);
      },
    },
    controls && Boolean(meId),
  );

  const p = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const t = clock.elapsedTime;
    const list = [...bodies.current.values()];
    stepSide(list, platforms, dt, t, bounds);
    const mine = me();
    for (const b of list) {
      // Knocked off their spot: back they go after a moment.
      const home = homes.get(b.id);
      if (home && sideSettled(b)) {
        const off = b.ground !== home.ground || Math.abs(b.x - home.x) > 0.15;
        const since = away.current.get(b.id);
        if (!off) away.current.delete(b.id);
        else if (since === undefined) away.current.set(b.id, t);
        else if (t - since > (b.id === meId ? 25 : 1.6)) {
          away.current.delete(b.id);
          if (b.ground === home.ground) b.tx = home.x;
          else sideFlyTo(b, home.x, platforms, home.ground, t);
        }
      }
      // Face the viewer, turned a little the way they last went; side-on
      // while walking.
      const walking = b.anim === "waddle" || b.anim === "fly";
      const target = walking ? (b.facing === 1 ? -0.2 : -Math.PI + 0.2) : -Math.PI / 2 + b.facing * 0.45;
      let h = headings.current.get(b.id) ?? -Math.PI / 2 + (((hash(b.id) % 100) / 100) * 0.8 - 0.4);
      h += Math.atan2(Math.sin(target - h), Math.cos(target - h)) * Math.min(1, dt * 8);
      headings.current.set(b.id, h);
      const g = groups.current.get(b.id);
      if (g) {
        g.position.set(b.x, b.y, 0);
        const duck = g.children[0];
        if (duck) duck.rotation.y = h;
      }
      // Bumps and flights: feathers fly, and quacks are heard from your duck.
      const before = lastAnim.current.get(b.id);
      if (b.anim !== before) {
        lastAnim.current.set(b.id, b.anim);
        const color = colorOf.get(b.id) ?? "#ffffff";
        let sound: DuckSound | null = null;
        if (b.anim === "bump") {
          feathers.current?.burst(b.x, b.y + 0.8, 0, color);
          sound = "bump";
        } else if (b.anim === "fly") sound = "takeoff";
        else if (b.anim === "quack") sound = "quack";
        if (sound && mine && before !== undefined) playDuckSound(sound, { dx: (b.x - mine.x) / 2, dz: (b.y - mine.y) / 2 });
      }
      // Poses: hold one, now and then do a little something.
      const s = sched.current.get(b.id);
      if (s && t > s.until) {
        if (s.held) {
          s.held = false;
          s.anim = MOVES[Math.floor(Math.random() * MOVES.length)];
          s.until = t + 2.4;
        } else {
          s.held = true;
          s.anim = s.base;
          s.until = t + 6 + Math.random() * 12;
        }
      }
      // The tag hangs on the front edge, just under the duck's feet.
      const tag = tagRefs.current?.get(b.id);
      if (tag) {
        p.set(b.x, b.y - 0.08, PLANK_DEPTH / 2).project(camera);
        const x = (p.x * 0.5 + 0.5) * size.width;
        const y = (-p.y * 0.5 + 0.5) * size.height;
        tag.style.visibility = "visible";
        tag.style.transform = `translate(${x - tag.offsetWidth / 2}px, ${y}px)`;
      }
    }
  });

  return (
    <>
      {platforms.map((pl, i) => (
        <PlatformMesh key={i} p={pl} />
      ))}
      <FeatherBursts apiRef={feathers} />
      {ducks.map((d) => (
        <group
          key={d.id}
          ref={(g) => {
            if (g) groups.current.set(d.id, g);
            else groups.current.delete(d.id);
          }}
        >
          <group>
            <DuckModel
              look={d.look}
              bare={d.bare}
              crowned={d.crowned}
              detail="crowd"
              shadows={false}
              animation={() => {
                const b = bodies.current.get(d.id);
                if (b && b.anim !== "idle") return b.anim as MascotAnimation;
                return sched.current.get(d.id)?.anim ?? "idle";
              }}
              hold={() => {
                const b = bodies.current.get(d.id);
                if (b && b.anim !== "idle") return false;
                return sched.current.get(d.id)?.held ?? true;
              }}
            />
          </group>
        </group>
      ))}
    </>
  );
}

function PlatformMesh({ p }: { p: StagePlatform }) {
  const w = p.x1 - p.x0;
  const cx = (p.x0 + p.x1) / 2;
  if (p.style === "block") {
    // A podium block, from its base up to its top.
    const h = Math.max(0.2, p.y - (p.base ?? p.y - 1));
    return (
      <mesh position={[cx, p.y - h / 2, 0]}>
        <boxGeometry args={[w, h, PLANK_DEPTH]} />
        <meshLambertMaterial color={p.color ?? "#e8c25a"} />
      </mesh>
    );
  }
  if (p.style === "floor") {
    return (
      <mesh position={[cx, p.y - 0.5, 0]}>
        <boxGeometry args={[w, 1, PLANK_DEPTH * 1.6]} />
        <meshLambertMaterial color={p.color ?? "#8fd694"} />
      </mesh>
    );
  }
  return (
    <mesh position={[cx, p.y - 0.14, 0]}>
      <boxGeometry args={[w, 0.28, PLANK_DEPTH]} />
      <meshLambertMaterial color={p.color ?? "#c8955a"} />
    </mesh>
  );
}
