import { useMemo, useState } from "react";
import { useControls } from "../controls";
import { Mascot } from "./Mascot";
import { BREEDS, BREED_IDS, type BreedId } from "./breeds";
import { MASCOT_ANIMATIONS, type MascotAnimation } from "./poses";
import {
  HATS,
  MASCOT_LOOK,
  NECKPIECES,
  PALETTE,
  PATTERNS,
  type FabricPattern,
  type Hat,
  type Neckpiece,
} from "./variants";

function Picker<T extends string>({
  label,
  items,
  value,
  onPick,
  name = (v: T) => v,
}: {
  label: string;
  items: readonly T[];
  value: T;
  onPick: (v: T) => void;
  name?: (v: T) => string;
}) {
  return (
    <div className="flex max-w-3xl flex-wrap items-center justify-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      {items.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => onPick(v)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            v === value ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white hover:bg-neutral-100"
          }`}
        >
          {name(v)}
        </button>
      ))}
    </div>
  );
}

/** Preview of the mascot and every animation, at #/live/mascot. */
export function MascotGallery({ onExit }: { onExit: () => void }) {
  const [anim, setAnim] = useState<MascotAnimation>("idle");
  const [breed, setBreed] = useState<BreedId>("pekin");
  const [neckpiece, setNeckpiece] = useState<Neckpiece>(MASCOT_LOOK.neckpiece);
  const [pattern, setPattern] = useState<FabricPattern>(MASCOT_LOOK.pattern);
  const [hat, setHat] = useState<Hat>("none");
  const [color, setColor] = useState<string>("navy");
  const [crowned, setCrowned] = useState(false);
  const look = useMemo(() => {
    const b = BREEDS[breed];
    const accent = PALETTE.find((p) => p.name === color) ?? PALETTE[7];
    return {
      ...MASCOT_LOOK,
      breed,
      bill: b.bill,
      feet: b.feet,
      feather: b.body({ u: 5, up: 0, side: 1, n: 0.3 }),
      neckpiece,
      pattern,
      hat,
      accent: accent.hex,
      accentName: accent.name,
    };
  }, [breed, neckpiece, pattern, hat, color]);
  const step = (d: number) => {
    const i = MASCOT_ANIMATIONS.indexOf(anim);
    setAnim(MASCOT_ANIMATIONS[(i + d + MASCOT_ANIMATIONS.length) % MASCOT_ANIMATIONS.length]);
  };
  useControls({
    onControl: (c) => (c === "left" ? step(-1) : c === "right" ? step(1) : undefined),
  });

  return (
    <div className="flex min-h-full flex-col items-center gap-6 bg-gradient-to-b from-sky-50 to-amber-50 px-4 py-8">
      <h1 className="text-3xl font-black tracking-tight">Meet the mascot</h1>
      <Mascot animation={anim} look={look} crowned={crowned} size={340} />
      <p className="text-sm text-neutral-500">
        Tap the duck to make it quack. ← / → (or A / D) to change animation.
      </p>
      <div className="flex max-w-xl flex-wrap justify-center gap-2" role="group" aria-label="Animation">
        {MASCOT_ANIMATIONS.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={a === anim}
            onClick={() => setAnim(a)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${
              a === anim
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white hover:bg-neutral-100"
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="flex max-w-2xl flex-wrap justify-center gap-2" role="group" aria-label="Breed">
        {BREED_IDS.map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={b === breed}
            onClick={() => setBreed(b)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              b === breed
                ? "border-amber-600 bg-amber-500 text-white"
                : "border-neutral-300 bg-white hover:bg-neutral-100"
            }`}
          >
            {BREEDS[b].name}
          </button>
        ))}
      </div>
      <Picker label="Flair" items={NECKPIECES} value={neckpiece} onPick={setNeckpiece} />
      <Picker label="Print" items={PATTERNS} value={pattern} onPick={setPattern} />
      <Picker label="Colour" items={PALETTE.map((p) => p.name)} value={color} onPick={setColor} />
      <Picker label="Hat" items={HATS} value={hat} onPick={setHat} />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={crowned} onChange={(e) => setCrowned(e.target.checked)} />
        👑 Duck Hours champion's crown
      </label>
      <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
        Back
      </button>
    </div>
  );
}
