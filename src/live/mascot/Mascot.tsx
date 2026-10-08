import { Suspense, lazy, useEffect, useState } from "react";
import { GameErrorBoundary } from "../minigames/GameErrorBoundary";
import { hasWebGL } from "../minigames/three/fallbackContext";
import { useGraphicsPref } from "../minigames/useGraphicsPref";
import type { MascotAnimation } from "./poses";
import type { DuckLook } from "./variants";

const MascotCanvas = lazy(() => import("./MascotCanvas"));

type MascotProps = {
  animation: MascotAnimation;
  /** A player's duck; defaults to the brand mascot. */
  look?: DuckLook;
  /** Wearing the Ceramic Duck Hours crown. */
  crowned?: boolean;
  /** Square size in px. */
  size?: number;
  className?: string;
};

/**
 * The 3D duck mascot for DOM pages. Purely decorative (hidden from screen
 * readers): tap it to make it quack. Shows the 🦆 emoji while three.js loads,
 * without WebGL, or when the player chose simple 2D graphics.
 */
export function Mascot({ animation, look, crowned, size = 160, className = "" }: MascotProps) {
  const [graphics] = useGraphicsPref();
  const [quacking, setQuacking] = useState(false);
  useEffect(() => {
    if (!quacking) return;
    const t = setTimeout(() => setQuacking(false), 1300);
    return () => clearTimeout(t);
  }, [quacking]);

  const emoji = (
    <span className="flex h-full w-full items-center justify-center" style={{ fontSize: size * 0.55 }}>
      🦆
    </span>
  );
  const box = (child: React.ReactNode, onTap?: () => void) => (
    <div
      aria-hidden
      onPointerDown={onTap}
      className={`mx-auto select-none ${onTap ? "cursor-pointer" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      {child}
    </div>
  );

  if (graphics === "2d" || !hasWebGL()) return box(emoji);

  const quack = () => setQuacking(true);
  return box(
    <GameErrorBoundary fallback={emoji}>
      <Suspense fallback={emoji}>
        <MascotCanvas animation={quacking ? "quack" : animation} look={look} crowned={crowned} />
      </Suspense>
    </GameErrorBoundary>,
    quack,
  );
}
