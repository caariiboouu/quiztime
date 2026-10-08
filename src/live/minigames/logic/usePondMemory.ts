import { useEffect, useMemo, useState } from "react";
import { useControls, type Control } from "../../controls";
import { seededRandom, type MinigameProps } from "../types";

/**
 * Pond Memory rules, shared by the 3D scene and the 2D fallback.
 *
 * Lily pads light up in a sequence; repeat it with the direction keys. Each
 * success adds one step. Score is the longest sequence completed, so pressing
 * faster doesn't earn more, it only buys more tries.
 */
export const DIRS: Control[] = ["up", "left", "right", "down"];
const START_LENGTH = 3;
const MAX_LENGTH = 40;
const LIT_MS = 600;
const GAP_MS = 220;
const PAUSE_MS = 1000;

export type PondPhase = "show" | "input" | "success" | "oops";

export function usePondMemory({ seed, active, onScore }: MinigameProps) {
  const sequence = useMemo(() => {
    const rand = seededRandom(seed ^ 0x5eed);
    return Array.from({ length: MAX_LENGTH }, () => DIRS[Math.floor(rand() * 4)]);
  }, [seed]);

  const [level, setLevel] = useState(START_LENGTH);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<PondPhase>("show");
  const [lit, setLit] = useState<Control | null>(null);
  const [step, setStep] = useState(0);
  const over = !active;

  // Play the sequence for this level.
  useEffect(() => {
    if (phase !== "show") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < level; i++) {
      const start = 400 + i * (LIT_MS + GAP_MS);
      timers.push(setTimeout(() => setLit(sequence[i]), start));
      timers.push(setTimeout(() => setLit(null), start + LIT_MS));
    }
    timers.push(
      setTimeout(() => {
        setStep(0);
        setPhase("input");
      }, 400 + level * (LIT_MS + GAP_MS)),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, level, sequence]);

  // Brief pause after success or a slip, then replay.
  useEffect(() => {
    if (phase !== "success" && phase !== "oops") return;
    const t = setTimeout(() => setPhase("show"), PAUSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const canPress = phase === "input" && !over;

  const press = (dir: Control) => {
    if (!canPress || !DIRS.includes(dir)) return;
    setLit(dir);
    setTimeout(() => setLit((l) => (l === dir ? null : l)), 180);
    if (sequence[step] !== dir) {
      setPhase("oops");
      return;
    }
    if (step + 1 < level) {
      setStep(step + 1);
      return;
    }
    const newBest = Math.max(best, level);
    setBest(newBest);
    onScore(newBest);
    setLevel(Math.min(MAX_LENGTH, level + 1));
    setPhase("success");
  };

  useControls({ onControl: press }, canPress);

  const status =
    phase === "show"
      ? "Watch…"
      : phase === "input"
        ? `Your turn: ${step} / ${level}`
        : phase === "success"
          ? "Nice! One more…"
          : "Oops! Watch again…";

  return { level, best, phase, lit, step, press, canPress, status };
}
