import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useControls } from "../../controls";
import { seededRandom, type MinigameProps } from "../types";

/**
 * Duck Stop rules, shared by the 3D scene and the 2D fallback.
 *
 * A duck paddles back and forth; stop it on the lily pad. One button, five
 * rounds, each a little faster. Score is accuracy (0–100 per round), never
 * how fast you press. The position is a pure function of time, so whichever
 * renderer is showing, a press at the same moment scores the same.
 */
export const ROUNDS = 5;
/** Seconds for one full left-to-right sweep, per round. */
const SWEEP_SEC = [2.2, 1.9, 1.6, 1.35, 1.1];
/** At this distance (fraction of the pond) a stop scores 0; dead-center scores 100. */
export const MISS_DISTANCE = 0.2;
const RESULT_PAUSE_MS = 1100;

function sweep(x: number): number {
  const u = ((x % 2) + 2) % 2;
  return u <= 1 ? u : 2 - u;
}

export function useDuckStop({ seed, active, onScore, onDone }: MinigameProps) {
  const course = useMemo(() => {
    const rand = seededRandom(seed);
    return Array.from({ length: ROUNDS }, () => ({
      target: 0.2 + rand() * 0.6,
      offset: rand() * 2,
    }));
  }, [seed]);

  const [round, setRound] = useState(0);
  const [results, setResults] = useState<number[]>([]);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const roundStart = useRef(0);
  const over = round >= ROUNDS || !active;
  const current = course[Math.min(round, ROUNDS - 1)];

  useEffect(() => {
    roundStart.current = performance.now();
  }, [round]);

  /** Duck position along the pond (0–1) at a `performance.now()` time. */
  const positionAt = useCallback(
    (t: number) => {
      const r = Math.min(round, ROUNDS - 1);
      return sweep((t - roundStart.current) / 1000 / SWEEP_SEC[r] + course[r].offset);
    },
    [round, course],
  );

  const stop = () => {
    if (stoppedAt !== null || over) return;
    const pos = positionAt(performance.now());
    const acc = Math.max(0, Math.round(100 * (1 - Math.abs(pos - current.target) / MISS_DISTANCE)));
    const next = [...results, acc];
    setResults(next);
    setStoppedAt(pos);
    onScore(next.reduce((s, n) => s + n, 0));
    setTimeout(() => {
      setStoppedAt(null);
      setRound((r) => r + 1);
      if (round + 1 >= ROUNDS) onDone();
    }, RESULT_PAUSE_MS);
  };

  useControls({ onControl: (c) => c === "action" && stop() }, !over);

  const last = results[results.length - 1];
  return {
    round,
    target: current.target,
    stoppedAt,
    positionAt,
    stop,
    over,
    total: results.reduce((s, n) => s + n, 0),
    /** Score of the stop just made, while it's on screen. */
    lastScore: stoppedAt === null ? null : last,
    /** Feedback for the stop just made, while it's on screen. */
    feedback:
      stoppedAt === null
        ? null
        : last >= 90
          ? `Perfect! +${last}`
          : last > 0
            ? `+${last}`
            : "Splash! +0",
  };
}
