import { Kbd } from "./Kbd";

/** Legend of the three one-handed key clusters. */
export function ControlsHint({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-neutral-500 ${className}`}
    >
      <span>
        <Kbd>W</Kbd>
        <Kbd>A</Kbd>
        <Kbd>S</Kbd>
        <Kbd>D</Kbd> + <Kbd>Space</Kbd>
      </span>
      <span>
        <Kbd>←</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>→</Kbd>
        <Kbd>↓</Kbd> + <Kbd>Enter</Kbd>
      </span>
      <span>
        numpad <Kbd>8</Kbd>
        <Kbd>4</Kbd>
        <Kbd>6</Kbd>
        <Kbd>2</Kbd> + <Kbd>0</Kbd>
      </span>
    </div>
  );
}
