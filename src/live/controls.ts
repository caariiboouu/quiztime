import { useEffect, useRef } from "react";

/**
 * One-handed input for live games and minigames.
 *
 * Every interaction is reachable from any of three clusters, so a player
 * using only their left or only their right hand never has to choose a
 * scheme or reach across the keyboard:
 *
 *   left hand    W A S D  + Space
 *   right hand   ← ↑ → ↓  + Enter
 *   numpad       8 4 6 2  + 0 / 5 / Enter
 *
 * Rules every minigame must follow (see src/live/minigames/README.md):
 *   - never *require* holding, chords or modifier keys: a tap always works
 *   - holding is an optional convenience (e.g. hold to keep walking), reported
 *     separately via onHeld; auto-repeat never counts as extra presses
 *   - a click/tap on screen does everything a key does
 */
export type Control = "up" | "down" | "left" | "right" | "action";

const KEYMAP: Record<string, Control> = {
  KeyW: "up",
  ArrowUp: "up",
  Numpad8: "up",
  KeyS: "down",
  ArrowDown: "down",
  Numpad2: "down",
  KeyA: "left",
  ArrowLeft: "left",
  Numpad4: "left",
  KeyD: "right",
  ArrowRight: "right",
  Numpad6: "right",
  Space: "action",
  Enter: "action",
  NumpadEnter: "action",
  Numpad0: "action",
  Numpad5: "action",
};

const DIGITS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

type Handlers = {
  /** A fresh press (never auto-repeat). */
  onControl?: (c: Control) => void;
  /**
   * The directions now held down, whenever that changes (pressed, let go, or
   * the window lost focus). Optional: for "hold to keep walking".
   */
  onHeld?: (dirs: Control[]) => void;
  /** Top-row 1–4, for picking an answer by number. */
  onDigit?: (index: number) => void;
};

/**
 * Listen for one-handed controls. Ignored while typing in a field, and while
 * a button has focus the action keys are left to the button itself, so Space
 * and Enter never fire twice.
 */
export function useControls(handlers: Handlers, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    // Direction keys down right now, by key (W and ↑ can both be held).
    const down = new Map<string, Control>();
    const reportHeld = () => ref.current.onHeld?.([...new Set(down.values())]);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      const control = KEYMAP[e.code];
      if (control) {
        const onButton = (e.target as HTMLElement | null)?.tagName === "BUTTON";
        if (control === "action" && onButton) return;
        if (!ref.current.onControl) return;
        e.preventDefault();
        if (e.repeat) return;
        ref.current.onControl(control);
        if (control !== "action" && !down.has(e.code)) {
          down.set(e.code, control);
          reportHeld();
        }
        return;
      }
      if (e.repeat) return;
      const digit = DIGITS[e.code];
      if (digit !== undefined && ref.current.onDigit) {
        e.preventDefault();
        ref.current.onDigit(digit);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (down.delete(e.code)) reportHeld();
    };
    // Switching away mid-hold: no keyup will come, so let go of everything.
    const letGo = () => {
      if (down.size === 0) return;
      down.clear();
      reportHeld();
    };
    const onVisibility = () => document.hidden && letGo();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", onVisibility);
      letGo();
    };
  }, [enabled]);
}

export const ARROW: Record<Control, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  action: "●",
};
