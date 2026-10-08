import { useCallback, useState } from "react";

export type GraphicsPref = "3d" | "2d";
const KEY = "quiztime.live.graphics";

function read(): GraphicsPref {
  try {
    return localStorage.getItem(KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

/** Per-device choice between 3D minigames and the simple 2D versions. */
export function useGraphicsPref(): [GraphicsPref, (p: GraphicsPref) => void] {
  const [pref, setPref] = useState<GraphicsPref>(read);
  const set = useCallback((p: GraphicsPref) => {
    setPref(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      // Not persisted; still applies for this page.
    }
  }, []);
  return [pref, set];
}
