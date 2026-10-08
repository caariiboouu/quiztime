import { HATS, NECKPIECES, type DuckOutfit, type Hat, type Neckpiece } from "../../../shared/outfit";

const HAT_LABELS: Record<Hat, string> = {
  none: "🚫 No hat",
  beanie: "🧶 Beanie",
  cap: "🧢 Cap",
  tophat: "🎩 Top hat",
  party: "🥳 Party hat",
  bucket: "🪣 Bucket hat",
  flower: "🌼 Flower",
};

const NECK_LABELS: Record<Neckpiece, string> = {
  ribbon: "🎀 Ribbon",
  bowtie: "🤵 Bow tie",
  bandana: "🤠 Bandana",
  scarf: "🧣 Scarf",
  lei: "🌺 Flower lei",
  bell: "🔔 Bell",
  pearls: "📿 Pearls",
  medal: "🏅 Medal",
  necktie: "👔 Tie",
};

/**
 * Dress your duck: a hat and something for the neck. Whoever leads the
 * Ceramic Duck Hours wears the gold crown where a hat would go, so they pick
 * from the neckpieces (which sit clear of the crown) instead.
 */
export function OutfitPicker({
  hat,
  neckpiece,
  crowned,
  onChange,
}: {
  /** What the duck is wearing now. */
  hat: Hat;
  neckpiece: Neckpiece;
  crowned: boolean;
  onChange: (outfit: DuckOutfit) => void;
}) {
  return (
    <div className="space-y-3 text-left">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-neutral-700">On your head</legend>
        {crowned ? (
          <p className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            👑 The Ceramic Duck Hours crown. As the leader, it's yours to wear.
          </p>
        ) : (
          <Chips
            options={HATS}
            labels={HAT_LABELS}
            value={hat}
            onPick={(h) => onChange({ hat: h, neckpiece })}
          />
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-neutral-700">Round your neck</legend>
        <Chips
          options={NECKPIECES}
          labels={NECK_LABELS}
          value={neckpiece}
          onPick={(n) => onChange({ hat: crowned ? null : hat, neckpiece: n })}
        />
      </fieldset>
    </div>
  );
}

function Chips<T extends string>({
  options,
  labels,
  value,
  onPick,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onPick(o)}
          className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
            o === value
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400"
          }`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
