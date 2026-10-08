import { ARROW, type Control } from "../controls";
import { DIRS, usePondMemory } from "./logic/usePondMemory";
import type { MinigameProps } from "./types";

const PAD_POS: Record<string, string> = {
  up: "col-start-2 row-start-1",
  left: "col-start-1 row-start-2",
  right: "col-start-3 row-start-2",
  down: "col-start-2 row-start-3",
};

/** Flat fallback for Pond Memory (no WebGL, or the player chose simple graphics). */
export function PondMemory2D(props: MinigameProps) {
  const game = usePondMemory(props);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
      <PondMemoryHud level={game.level} best={game.best} status={game.status} />
      <div className="grid w-full grid-cols-3 grid-rows-3 gap-3">
        {DIRS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => game.press(d)}
            disabled={!game.canPress}
            aria-label={`Lily pad ${d}`}
            className={`${PAD_POS[d]} flex aspect-square items-center justify-center rounded-full text-3xl font-black shadow-md transition ${
              game.lit === d
                ? "scale-105 bg-lime-300 text-emerald-900 ring-4 ring-lime-500"
                : "bg-emerald-600 text-white/80"
            }`}
          >
            {ARROW[d]}
          </button>
        ))}
        <div className="col-start-2 row-start-2 flex items-center justify-center text-4xl">🦆</div>
      </div>
    </div>
  );
}

export function PondMemoryHud({
  level,
  best,
  status,
}: {
  level: number;
  best: number;
  status: string;
}) {
  return (
    <>
      <div className="flex w-full justify-between text-sm font-semibold text-neutral-600">
        <span>Sequence of {level}</span>
        <span className="tabular-nums">Best {best}</span>
      </div>
      <div className="text-xl font-bold" aria-live="polite">
        {status}
      </div>
    </>
  );
}

/** Compact tap pad under the 3D scene (keys work too). */
export function DirectionPad({
  onPress,
  disabled,
  lit,
}: {
  onPress: (d: Control) => void;
  disabled: boolean;
  lit: Control | null;
}) {
  return (
    <div className="grid w-48 grid-cols-3 grid-rows-3 gap-1.5">
      {DIRS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onPress(d)}
          disabled={disabled}
          aria-label={`Lily pad ${d}`}
          className={`${PAD_POS[d]} flex aspect-square items-center justify-center rounded-xl text-2xl font-black shadow ${
            lit === d ? "bg-lime-300 text-emerald-900" : "bg-emerald-600 text-white"
          } disabled:opacity-60`}
        >
          {ARROW[d]}
        </button>
      ))}
    </div>
  );
}
