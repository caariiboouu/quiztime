import { useEffect, useRef, useState } from "react";
import type { ArenaLayout } from "../../../shared/arena";
import { HOLD_REFRESH, type ArenaMove } from "../../../shared/arenaSim";
import type { Dir } from "../../../shared/flock";
import { ARROW, useControls } from "../controls";
import { preloadSounds, setSoundOn, soundOn } from "../effects/sound";
import { ZONE_COLORS, zoneBadge } from "./colors";
import { TOUCH_CONTROLS_HEIGHT } from "./touch";

const DIRS: Dir[] = ["up", "left", "right", "down"];
const PAD_POS: Record<Dir, string> = {
  up: "col-start-2 row-start-1",
  left: "col-start-1 row-start-2",
  right: "col-start-3 row-start-2",
  down: "col-start-2 row-start-3",
};

const SWAP_KEY = "quiztime.live.padRight";
function readSwapped(): boolean {
  try {
    return localStorage.getItem(SWAP_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Steering for the answer arena, one-handed: hold a direction to keep
 * walking, or tap it for a single waddle step (WASD, arrows, numpad, or the
 * on-screen pad). Each fresh tap adds a very slight boost. Space/Enter quacks,
 * and number keys (or the numbered buttons) waddle straight to an answer.
 *
 * `overlay`: phone layout, laid over the bottom corners of the arena like a
 * handheld console: arrows on one side, answer buttons and quack on the other
 * (either set alone is enough to play; ⇄ swaps sides).
 */
export function ArenaControls({
  onMove,
  layout,
  disabled = false,
  overlay = false,
}: {
  onMove: (m: ArenaMove) => void;
  layout: ArenaLayout;
  disabled?: boolean;
  overlay?: boolean;
}) {
  const options = layout.options;
  const send = useRef(onMove);
  useEffect(() => {
    send.current = onMove;
  });
  // Held directions from the keyboard and from the pad, sent as one set.
  const keys = useRef<Dir[]>([]);
  const pad = useRef<Dir[]>([]);
  const [lit, setLit] = useState<Dir[]>([]);
  const sendHeld = () => {
    const dirs = [...new Set([...keys.current, ...pad.current])];
    setLit(dirs);
    send.current({ held: dirs });
  };

  // The server lets go of a hold unless reminded, in case we drop offline.
  useEffect(() => {
    if (disabled) return;
    const timer = setInterval(() => {
      const dirs = [...new Set([...keys.current, ...pad.current])];
      if (dirs.length) send.current({ held: dirs });
    }, HOLD_REFRESH * 1000);
    return () => clearInterval(timer);
  }, [disabled]);

  // Have the quacks ready before the first press.
  useEffect(() => preloadSounds(), []);

  // Let go when the controls go away (e.g. time's up mid-hold).
  useEffect(
    () => () => {
      if (keys.current.length || pad.current.length) send.current({ held: [] });
    },
    [],
  );
  useEffect(() => {
    if (!disabled) return;
    if (keys.current.length || pad.current.length) {
      keys.current = [];
      pad.current = [];
      send.current({ held: [] });
    }
  }, [disabled]);

  useControls(
    {
      onControl: (c) => (c === "action" ? onMove({ quack: true }) : onMove({ dir: c as Dir })),
      onHeld: (dirs) => {
        keys.current = dirs as Dir[];
        sendHeld();
      },
      onDigit: (i) => i < options && onMove({ zone: i }),
    },
    !disabled,
  );

  const press = (d: Dir) => {
    onMove({ dir: d });
    pad.current = [...pad.current.filter((x) => x !== d), d];
    sendHeld();
  };
  const release = (d: Dir) => {
    if (!pad.current.includes(d)) return;
    pad.current = pad.current.filter((x) => x !== d);
    sendHeld();
  };

  const [swapped, setSwapped] = useState(readSwapped);
  const swap = () => {
    setSwapped(!swapped);
    try {
      localStorage.setItem(SWAP_KEY, swapped ? "0" : "1");
    } catch {
      // fine: just not remembered
    }
  };

  const dpad = (
    <div
      className={`grid touch-none select-none grid-cols-3 grid-rows-3 ${
        overlay ? "w-[9.5rem] gap-1" : "w-48 gap-1.5"
      }`}
    >
      {DIRS.map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          aria-label={`Waddle ${d}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press(d);
          }}
          onPointerUp={() => release(d)}
          onPointerCancel={() => release(d)}
          onLostPointerCapture={() => release(d)}
          // Keyboard activation of a focused pad button (pointer presses
          // are handled above): one step.
          onClick={(e) => e.detail === 0 && onMove({ dir: d })}
          onContextMenu={(e) => e.preventDefault()}
          className={`${PAD_POS[d]} flex aspect-square items-center justify-center rounded-xl text-2xl font-black shadow ${
            lit.includes(d)
              ? "bg-lime-300 text-emerald-900"
              : overlay
                ? "bg-emerald-700/75 text-white backdrop-blur-sm"
                : "bg-emerald-600 text-white"
          } disabled:opacity-60`}
        >
          {ARROW[d]}
        </button>
      ))}
    </div>
  );

  const quack = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onMove({ quack: true })}
      className={`touch-manipulation rounded-2xl bg-amber-500 font-black text-white shadow hover:brightness-110 disabled:opacity-50 ${
        overlay ? "px-4 py-2.5 text-base" : "px-6 py-4 text-lg"
      }`}
    >
      Quack!
    </button>
  );

  if (overlay) {
    return (
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 ${
          swapped ? "flex-row-reverse" : ""
        }`}
        style={{ height: TOUCH_CONTROLS_HEIGHT }}
      >
        <div className="pointer-events-auto">{dpad}</div>
        <div className={`pointer-events-auto flex flex-col gap-1.5 ${swapped ? "items-start" : "items-end"}`}>
          <div className={`grid gap-1.5 ${options > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
            {layout.zones.map((z) => (
              <button
                key={z.index}
                type="button"
                disabled={disabled}
                aria-label={`Waddle to answer ${z.index + 1}`}
                onClick={() => onMove({ zone: z.index })}
                className="h-12 min-w-12 touch-manipulation rounded-xl px-2 text-sm font-black text-white shadow disabled:opacity-60"
                style={{ background: ZONE_COLORS[z.index % ZONE_COLORS.length] }}
              >
                {zoneBadge(z.index, z.angle)}
              </button>
            ))}
          </div>
          <div className={`flex items-center gap-1.5 ${swapped ? "flex-row-reverse" : ""}`}>
            <button
              type="button"
              onClick={swap}
              aria-label="Swap the controls to the other side"
              className="h-10 w-10 touch-manipulation rounded-xl bg-white/80 text-lg font-bold text-neutral-700 shadow"
            >
              ⇄
            </button>
            {quack}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      {dpad}
      <div className="flex flex-col items-center gap-2">
        {quack}
        <p className="max-w-[12rem] text-center text-xs text-neutral-500">
          Hold a direction to walk, tap for a step. Or press 1–{options} to waddle straight to an
          answer.
        </p>
        <SoundToggle />
      </div>
    </div>
  );
}

/** Quacks on or off (remembered on this device). */
export function SoundToggle() {
  const [on, setOn] = useState(soundOn);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        setSoundOn(!on);
        setOn(!on);
      }}
      className="text-xs font-semibold text-neutral-600 underline"
    >
      {on ? "🔊 Quacks on" : "🔇 Quacks off"}
    </button>
  );
}
