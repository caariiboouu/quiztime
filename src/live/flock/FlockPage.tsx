import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { Dir } from "../../../shared/flock";
import { useControls } from "../controls";
import { ControlsHint } from "../ControlsHint";
import { UNIQUE_LOOKS, describeLook, lookForIndex } from "../mascot/variants";
import type { MascotAnimation } from "../mascot/poses";
import { hasWebGL } from "../minigames/three/fallbackContext";
import type { FlockControl, FlockMember, FlockStats } from "./FlockScene";
import { ArenaPractice } from "../arena/ArenaDemo";
import { SoundToggle } from "../arena/ArenaControls";
import { preloadSounds } from "../effects/sound";

const FlockScene = lazy(() => import("./FlockScene"));

const NAMES = [
  "You", "Puddles", "Waddles", "Quackers", "Dabble", "Mallory", "Bill", "Webster",
  "Nibbles", "Drake", "Splash", "Pebble", "Biscuit", "Paddle", "Maple", "Noodle",
  "Pickle", "Ducky", "Bubbles", "Feathers", "Sunny", "Ripple", "Dumpling", "Mochi",
  "Pippin", "Clover", "Juniper", "Muffin", "Ziggy", "Wobble", "Tofu", "Sprout",
  "Basil", "Peanut", "Rocket", "Marble", "Captain", "Fennel", "Doodle", "Waffles",
  "Olive", "Truffle", "Gizmo", "Button", "Cosmo", "Hazel", "Poppy", "Socks",
  "Taco", "Bean", "Kiwi", "Sprinkles", "Nugget", "Ginger", "Pudding", "Smudge",
  "Zuko", "Echo", "Frodo", "Lemon", "Mango", "Nacho", "Oreo", "Pesto",
];

const COUNTS = [16, 32, 48, 64];
const YOU = "duck-0";
/** Shows off the Ceramic Duck Hours crown (in the game, the real leader wears it). */
const CHAMP = 2;

/**
 * Flock test page (#/live/flock): every duck variation in one scene, one of
 * them yours to steer. Used to check that 30+ unique ducks render together
 * and to try the one-handed movement minigames will use.
 */
export function FlockPage({ onExit }: { onExit: () => void }) {
  const [count, setCount] = useState(32);
  const [detail, setDetail] = useState<"crowd" | "hero">("crowd");
  const [stats, setStats] = useState<FlockStats | null>(null);
  const [mode, setMode] = useState<"roam" | "arena">("roam");
  const control = useRef<FlockControl | null>(null);

  const members: FlockMember[] = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: `duck-${i}`,
        name: i === CHAMP ? "Champ 👑" : (NAMES[i] ?? `Duck ${i + 1}`),
        look: lookForIndex(i),
        crowned: i === CHAMP,
      })),
    [count],
  );
  const controlled = useMemo(() => [YOU], []);
  useEffect(() => preloadSounds(), []);

  useControls(
    {
      onControl: (c) =>
        c === "action" ? control.current?.emote(YOU, "quack") : control.current?.step(YOU, c as Dir),
      onHeld: (dirs) => control.current?.hold(YOU, dirs as Dir[]),
    },
    mode === "roam",
  );

  const everyone = (anim: MascotAnimation) => control.current?.everyone(anim);
  const combos = new Set(members.map((m) => `${m.look.accent}/${m.look.hat}`)).size;

  return (
    <div className="min-h-full bg-gradient-to-b from-sky-50 to-emerald-50 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">The flock</h1>
            <p className="text-sm text-neutral-600">
              {count} unique ducks, one canvas. Steer <strong>You</strong>: hold a direction to walk, tap for a step;
              Space to quack.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SoundToggle />
            <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
              Back
            </button>
          </div>
        </header>

        <div className="flex gap-2" role="group" aria-label="Mode">
          {(
            [
              ["roam", "Free roam"],
              ["arena", "Answer arena (practice)"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-xl border px-4 py-2 font-semibold ${
                mode === m ? "border-amber-600 bg-amber-500 text-white" : "border-neutral-300 bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-600">Ducks:</span>
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === count}
              onClick={() => setCount(n)}
              className={`rounded-full border px-3 py-1 font-semibold ${
                n === count ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
              }`}
            >
              {n}
            </button>
          ))}
          <span className="ml-3 text-neutral-600">Detail:</span>
          {(["crowd", "hero"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === detail}
              onClick={() => setDetail(d)}
              className={`rounded-full border px-3 py-1 font-semibold capitalize ${
                d === detail ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
              }`}
            >
              {d}
            </button>
          ))}
          <span className="ml-3 text-neutral-600">Everyone:</span>
          {(["dance", "celebrate", "quack", "flap", "sleep"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => everyone(a)}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 font-semibold capitalize hover:bg-neutral-100"
            >
              {a}
            </button>
          ))}
        </div>

        {mode === "arena" ? (
          <ArenaPractice offlineMembers={members} />
        ) : hasWebGL() ? (
          <Suspense fallback={<p className="py-24 text-center text-neutral-500">Gathering the flock…</p>}>
            <FlockScene
              key={detail}
              members={members}
              controlled={controlled}
              highlightId={YOU}
              controlRef={control}
              onStats={setStats}
              detail={detail}
              description={`A field with ${count} ducks, each with its own hat or neckpiece. One of them is yours.`}
            />
          </Suspense>
        ) : (
          <p className="rounded-xl bg-white p-6 text-center text-neutral-600">
            This device can't show 3D graphics.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="font-mono text-neutral-700" aria-live="off">
            {stats
              ? `${stats.fps} fps · ${stats.calls} draw calls · ${(stats.triangles / 1000).toFixed(0)}k triangles · ${stats.ducks} ducks`
              : "measuring…"}
          </p>
          <p className="text-neutral-600">
            {combos} / {count} distinct colour + hat combos (unique up to {UNIQUE_LOOKS} players)
          </p>
        </div>
        <ControlsHint />

        <details className="rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold">Who's who</summary>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.look.accent }} />
                <span className="font-semibold">{m.name}</span>
                <span className="truncate text-neutral-500">{describeLook(m.look).replace("the duck with the ", "")}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
