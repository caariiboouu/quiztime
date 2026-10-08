import { useEffect, useState } from "react";
import { ROUNDS, useDuckStop } from "./logic/useDuckStop";
import type { MinigameProps } from "./types";

/** Flat fallback for Duck Stop (no WebGL, or the player chose simple graphics). */
export function DuckStop2D(props: MinigameProps) {
  const game = useDuckStop(props);
  const { positionAt, stoppedAt } = game;
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (stoppedAt !== null || game.over) return;
    let raf = 0;
    const tick = (t: number) => {
      setPos(positionAt(t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [positionAt, stoppedAt, game.over]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6">
      <DuckStopHud round={game.round} total={game.total} />
      <div
        className="relative h-28 w-full overflow-hidden rounded-3xl bg-sky-200 shadow-inner"
        role="img"
        aria-label="Pond with a lily pad and a moving duck"
      >
        <div
          className="absolute top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/80 ring-4 ring-emerald-700/40"
          style={{ left: `${game.target * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl"
          style={{ left: `${(stoppedAt ?? pos) * 100}%` }}
        >
          🦆
        </div>
      </div>
      <DuckStopControls feedback={game.feedback} disabled={stoppedAt !== null || game.over} onStop={game.stop} />
    </div>
  );
}

export function DuckStopHud({ round, total }: { round: number; total: number }) {
  return (
    <div className="flex w-full justify-between text-sm font-semibold text-neutral-600">
      <span>
        Round {Math.min(round + 1, ROUNDS)} / {ROUNDS}
      </span>
      <span className="tabular-nums">Score {total}</span>
    </div>
  );
}

export function DuckStopControls({
  feedback,
  disabled,
  onStop,
}: {
  feedback: string | null;
  disabled: boolean;
  onStop: () => void;
}) {
  return (
    <>
      <div className="h-8 text-xl font-bold" aria-live="polite">
        {feedback}
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={disabled}
        className="w-full max-w-sm rounded-2xl bg-amber-500 py-6 text-2xl font-black text-white shadow-lg hover:brightness-110 disabled:opacity-50"
      >
        STOP!
      </button>
    </>
  );
}
