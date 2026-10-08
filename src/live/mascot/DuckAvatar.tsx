import { useEffect, useState } from "react";
import { hasWebGL } from "../minigames/three/fallbackContext";
import type { DuckLook } from "./variants";

/**
 * A player's duck as a little picture (drawn once, see portrait.ts), for
 * lists. Shows a plain duck while it's drawn or where 3D isn't available.
 */
export function DuckAvatar({
  look,
  crowned = false,
  bare = false,
  size = 40,
  label,
}: {
  look: DuckLook;
  crowned?: boolean;
  /** Just the duck: no hat or neckpiece. */
  bare?: boolean;
  size?: number;
  /** For screen readers, e.g. "Ann's duck". */
  label?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!hasWebGL()) return;
    let live = true;
    import("./portrait")
      .then((m) => m.duckPortrait(look, crowned, bare))
      .then((url) => live && setSrc(url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [look, crowned, bare]);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100"
      style={{ width: size, height: size, borderColor: bare ? "#d4d4d4" : look.accent, borderWidth: 2 }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {src ? (
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.55 }}>🦆</span>
      )}
    </span>
  );
}
