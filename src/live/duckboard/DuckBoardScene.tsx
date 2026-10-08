import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import {
  emote,
  holdWalker,
  isMoving,
  makeWalker,
  pressWalker,
  updateFlock,
  type Bounds,
  type Dir,
  type DuckAnim,
  type Walker,
} from "../../../shared/flock";
import { placeDuck } from "../arena/placeDuck";
import { useControls } from "../controls";
import { FeatherBursts, type FeatherApi } from "../effects/FeatherBursts";
import { playDuckSound, type DuckSound } from "../effects/sound";
import { DuckModel } from "../mascot/DuckModel";
import type { MascotAnimation } from "../mascot/poses";
import type { DuckLook } from "../mascot/variants";
import type { OrthographicCamera } from "three";

/** One person on the board, in standings order. */
export type BoardEntry = {
  id: string;
  name: string;
  look: DuckLook;
  /** No attire chosen yet: just the duck. */
  bare: boolean;
  crowned: boolean;
  place: number;
  holding: boolean;
  /** "1185h 25m", ticking. */
  total: string;
  /** "½× rate", "holds the duck", "benched". */
  rate: string;
};

/** Gaps between ducks on the board (world units; a duck is ~1.3 long). */
const SX = 2.5;
const SZ = 3.1;
const ELEVATION = 60;
/** Ducks hold one of these poses… */
const POSES: MascotAnimation[] = ["idle", "dance", "quack", "flap", "waddle", "idle"];
/** …and now and then do one of these. */
const MOVES: MascotAnimation[] = ["dance", "celebrate", "quack", "flap", "waddle"];
const TILE = ["#f6c945", "#cfd4da", "#d99a5b"];

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Where each place stands. Read like a leaderboard, top to bottom: a podium
 * of three at the top (the far side), then rows coming towards the viewer.
 */
function layout(count: number, columns: number) {
  const spots: { x: number; z: number }[] = [];
  const rows = Math.ceil(Math.max(0, count - 3) / columns);
  const depth = (rows + 1) * SZ;
  const top = -depth / 2 + SZ / 2;
  for (let i = 0; i < Math.min(3, count); i++) {
    spots.push({ x: [0, -SX * 1.15, SX * 1.15][i], z: top - (i === 0 ? 0.35 : 0) });
  }
  for (let i = 3; i < count; i++) {
    const r = Math.floor((i - 3) / columns);
    const c = (i - 3) % columns;
    const inRow = Math.min(columns, count - 3 - r * columns);
    spots.push({ x: (c - (inRow - 1) / 2) * SX, z: top + SZ * (r + 1) });
  }
  const width = Math.max(3, columns) * SX;
  return { spots, width, depth, bounds: { halfWidth: width / 2 + 0.8, halfDepth: depth / 2 + 0.9 } as Bounds };
}

/**
 * The Ceramic Duck Hours board in 3D: everyone's duck on their own tile, in
 * standings order (a podium for the top three), each wearing their latest
 * attire, holding a pose and now and then breaking into a little animation.
 * Tags under the ducks open each entry. If this device is signed in as
 * someone on the board, the keys walk their duck about (bumped ducks wobble
 * and go back to their tiles). Default export, for lazy loading.
 */
export default function DuckBoardScene({
  entries,
  meId,
  onSelect,
  controls,
}: {
  entries: BoardEntry[];
  meId: string | null;
  onSelect: (id: string) => void;
  /** Keys walk your duck (off while a window is open). */
  controls: boolean;
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
  const columns = width < 520 ? 3 : width < 760 ? 4 : width < 1000 ? 5 : 6;
  const board = useMemo(() => layout(entries.length, columns), [entries.length, columns]);
  // An orthographic view (every row the same size), framed to fit exactly:
  // from just behind the podium's heads to the last row's tags.
  const el = (ELEVATION * Math.PI) / 180;
  const zMin = (board.spots[0]?.z ?? 0) - 1.4;
  const zMax = (board.spots.at(-1)?.z ?? 0) + 1.7;
  const zoom = width / (board.width + 1.4);
  const extent = (zMax - zMin) * Math.sin(el) + 1.6 * Math.cos(el);
  const height = Math.round(Math.min(4000, Math.max(320, zoom * extent)));
  const tagRefs = useRef(new Map<string, HTMLButtonElement>());

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-3xl bg-emerald-200 shadow-inner" style={{ height }}>
      <Canvas aria-hidden dpr={[1, 1.75]} orthographic camera={{ near: 0.1, far: 400, zoom }}>
        <color attach="background" args={["#bfe9c9"]} />
        <hemisphereLight args={["#ffffff", "#5b8a5b", 1.25]} />
        <directionalLight position={[4, 10, 6]} intensity={1.7} />
        <BoardCamera zoom={zoom} zCenter={(zMin + zMax) / 2} lift={(1.6 * Math.cos(el)) / 2} />
        <Board entries={entries} spots={board.spots} bounds={board.bounds} meId={meId} controls={controls} tagRefs={tagRefs} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0">
        {entries.map((e) => (
          <button
            key={e.id}
            type="button"
            ref={(el) => {
              if (el) tagRefs.current.set(e.id, el);
              else tagRefs.current.delete(e.id);
            }}
            onClick={() => onSelect(e.id)}
            aria-label={`${e.name}: ${e.place}${e.place === 1 ? "st" : e.place === 2 ? "nd" : e.place === 3 ? "rd" : "th"}, ${e.total}${e.holding ? ", holds the duck" : ""}`}
            className={`pointer-events-auto absolute left-0 top-0 max-w-[30%] rounded-lg border px-1.5 py-0.5 text-center shadow-sm backdrop-blur-sm hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 sm:max-w-[11rem] sm:px-2 ${
              e.holding ? "border-amber-400 bg-amber-50/95" : "border-white/70 bg-white/85"
            } ${e.id === meId ? "ring-2 ring-amber-400" : ""}`}
            style={{ visibility: "hidden" }}
          >
            <span className="block truncate text-[11px] font-bold leading-tight text-neutral-900 sm:text-sm">
              <span className="text-neutral-400">{e.place}</span> {e.name}
              {e.crowned && " 👑"}
              {e.holding && " 🦆"}
            </span>
            <span className="block truncate font-mono text-[10px] leading-tight text-neutral-600 sm:text-xs">
              {e.total}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Look down at the board from the front at ELEVATION degrees, centred on it. */
function BoardCamera({ zoom, zCenter, lift }: { zoom: number; zCenter: number; lift: number }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const camera = get().camera as OrthographicCamera;
    const el = (ELEVATION * Math.PI) / 180;
    const dist = 60;
    camera.zoom = zoom;
    camera.position.set(0, Math.sin(el) * dist, zCenter + Math.cos(el) * dist);
    camera.lookAt(0, 0, zCenter);
    // Nudge up by half a duck so the back row's heads fit too.
    camera.translateY(lift);
    camera.updateProjectionMatrix();
  }, [get, size, zoom, zCenter, lift]);
  return null;
}

function Board({
  entries,
  spots,
  bounds,
  meId,
  controls,
  tagRefs,
}: {
  entries: BoardEntry[];
  spots: { x: number; z: number }[];
  bounds: Bounds;
  meId: string | null;
  controls: boolean;
  tagRefs: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  const clock = useThree((s) => s.clock);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const walkers = useRef(new Map<string, Walker>());
  const homes = useRef(new Map<string, { x: number; z: number }>());
  const away = useRef(new Map<string, number>());
  const sched = useRef(new Map<string, { base: MascotAnimation; anim: MascotAnimation; held: boolean; until: number }>());
  const groups = useRef(new Map<string, Group>());
  const lastAnim = useRef(new Map<string, DuckAnim>());
  const feathers = useRef<FeatherApi | null>(null);
  const colorOf = useMemo(() => new Map(entries.map((e) => [e.id, e.look.feather])), [entries]);

  // Everyone's home tile follows their place; newcomers start on theirs.
  useEffect(() => {
    const ids = new Set(entries.map((e) => e.id));
    for (const id of [...walkers.current.keys()]) if (!ids.has(id)) walkers.current.delete(id);
    entries.forEach((e, i) => {
      const home = spots[i];
      if (!home) return;
      const was = homes.current.get(e.id);
      homes.current.set(e.id, home);
      let w = walkers.current.get(e.id);
      if (!w) {
        w = makeWalker(e.id, home.x, home.z);
        w.heading = -Math.PI / 2 + (((hash(e.id) % 100) / 100) * 1.1 - 0.55);
        walkers.current.set(e.id, w);
      } else if (e.id !== meId && (!was || was.x !== home.x || was.z !== home.z)) {
        // Moved up or down the standings: off to the new tile.
        w.tx = home.x;
        w.tz = home.z;
      }
      if (!sched.current.has(e.id)) {
        const base = POSES[hash(e.id) % POSES.length];
        sched.current.set(e.id, { base, anim: base, held: true, until: clock.elapsedTime + 2 + (hash(e.id) % 900) / 100 });
      }
    });
  }, [entries, spots, meId, clock]);

  // Your duck: keys walk it (one press = one step, hold to keep going).
  useControls(
    {
      onControl: (c) => {
        const w = meId ? walkers.current.get(meId) : undefined;
        if (!w) return;
        if (c === "action") emote(w, "quack", clock.elapsedTime, 1.2);
        else pressWalker(w, c as Dir, bounds, clock.elapsedTime);
      },
      onHeld: (dirs) => {
        const w = meId ? walkers.current.get(meId) : undefined;
        if (w) holdWalker(w, dirs as Dir[]);
      },
    },
    controls && Boolean(meId),
  );

  const p = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const t = clock.elapsedTime;
    const list = [...walkers.current.values()];
    updateFlock(list, dt, t, { bounds });
    const me = meId ? walkers.current.get(meId) : undefined;
    for (const w of list) {
      // Nudged off their tile: back they waddle after a moment.
      const home = homes.current.get(w.id);
      if (home && !isMoving(w) && !w.flying && w.air === 0) {
        const off = Math.hypot(w.x - home.x, w.z - home.z) > 0.15;
        const since = away.current.get(w.id);
        if (!off) away.current.delete(w.id);
        else if (since === undefined) away.current.set(w.id, t);
        else if (t - since > (w.id === meId ? 25 : 1.6)) {
          w.tx = home.x;
          w.tz = home.z;
          away.current.delete(w.id);
        }
      }
      const g = groups.current.get(w.id);
      if (g) placeDuck(g, w.x, w.air, w.z, w.heading);
      // Bumps and take-offs: feathers fly, and (if it's yours) quacks.
      const before = lastAnim.current.get(w.id);
      if (w.anim !== before) {
        lastAnim.current.set(w.id, w.anim);
        const color = colorOf.get(w.id) ?? "#ffffff";
        let sound: DuckSound | null = null;
        if (w.anim === "fly") {
          feathers.current?.burst(w.x, w.air + 0.8, w.z, color, 18);
          sound = "takeoff";
        } else if (w.anim === "bump") {
          feathers.current?.burst(w.x, w.air + 0.8, w.z, color);
          sound = "bump";
        } else if (w.anim === "quack") sound = "quack";
        if (sound && me && before !== undefined) playDuckSound(sound, { dx: (w.x - me.x) / 2, dz: w.z - me.z });
      }
      // Poses: hold one, now and then do a little something.
      const s = sched.current.get(w.id);
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
      // The tag sits just in front of the duck's feet.
      const tag = tagRefs.current?.get(w.id);
      if (tag) {
        p.set(w.x, 0, w.z + 0.75).project(camera);
        const x = (p.x * 0.5 + 0.5) * size.width;
        const y = (-p.y * 0.5 + 0.5) * size.height;
        tag.style.visibility = "visible";
        tag.style.transform = `translate(${x - tag.offsetWidth / 2}px, ${y}px)`;
      }
    }
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[bounds.halfWidth * 2 + 60, bounds.halfDepth * 2 + 60]} />
        <meshLambertMaterial color="#8fd694" />
      </mesh>
      {spots.slice(0, entries.length).map((s, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[s.x, 0, s.z]}>
          <circleGeometry args={[i < 3 ? 1 : 0.8, 40]} />
          <meshLambertMaterial color={TILE[i] ?? "#e9dfc8"} />
        </mesh>
      ))}
      <FeatherBursts apiRef={feathers} />
      {entries.map((e) => (
        <BoardDuck
          key={e.id}
          entry={e}
          register={(g) => {
            if (g) groups.current.set(e.id, g);
            else groups.current.delete(e.id);
          }}
          anim={() => {
            const w = walkers.current.get(e.id);
            if (w && w.anim !== w.rest) return w.anim;
            return sched.current.get(e.id)?.anim ?? "idle";
          }}
          hold={() => {
            const w = walkers.current.get(e.id);
            if (w && w.anim !== w.rest) return false;
            return sched.current.get(e.id)?.held ?? true;
          }}
          neck={() => {
            const w = walkers.current.get(e.id);
            return w ? { headYaw: w.neckYaw, headPitch: w.neckPitch } : null;
          }}
        />
      ))}
    </>
  );
}

function BoardDuck({
  entry,
  register,
  anim,
  hold,
  neck,
}: {
  entry: BoardEntry;
  register: (g: Group | null) => void;
  anim: () => MascotAnimation;
  hold: () => boolean;
  neck: () => { headYaw: number; headPitch: number } | null;
}) {
  return (
    <group ref={register}>
      {/* children[0]: everything that rises when the duck hops or flies */}
      <group>
        <DuckModel
          look={entry.look}
          bare={entry.bare}
          crowned={entry.crowned}
          animation={anim}
          hold={hold}
          overlay={neck}
          detail="crowd"
          shadows={false}
        />
      </group>
      {/* children[1]: blob shadow on the ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.05, 0.005, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#14532d" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}
