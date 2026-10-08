import { useSyncExternalStore } from "react";

/**
 * Height (px) the on-screen controls take at the bottom of the arena on a
 * touch screen: answer cards keep clear of it.
 */
export const TOUCH_CONTROLS_HEIGHT = 180;

/** True on phones and tablets (a finger is the main pointer). */
export function useTouchScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(pointer: coarse)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}
