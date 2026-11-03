import { useEffect, useRef, useState } from "react";
import type { DebateSide } from "../../../shared/protocol";
import { useControls } from "../controls";
import { Kbd } from "../Kbd";
import { useDraft } from "../useDraft";

/**
 * Argue for or against: pick a side (your duck hops over to it straight away),
 * then make your case. The argument saves itself as you type, and Enter saves
 * it now. No timer and no speed bonus. One-handed: ←/→ (or 1/2) pick a side
 * and jump to the box; Esc leaves the box so the arrows work again.
 */
export function DebateInput({
  segmentId,
  openedAt,
  names,
  maxLength,
  disabled,
  submitted,
  onSend,
  board,
}: {
  segmentId: string;
  openedAt: number;
  names: { for: string; against: string };
  maxLength: number;
  disabled: boolean;
  submitted: { side: DebateSide; text: string } | null;
  onSend: (side: DebateSide, text: string) => void;
  /** What's at stake beyond the verdict: the hidden facts each side has, and the win bonus. */
  board?: { counts?: Record<DebateSide, number>; factPoints: number; winBonus: number };
}) {
  const [side, setSide] = useState<DebateSide | null>(submitted?.side ?? null);
  const [text, setText] = useDraft(segmentId, openedAt, submitted?.text ?? "");
  const box = useRef<HTMLTextAreaElement>(null);

  // Keep the server up to date as they type (a pause is enough).
  const sendRef = useRef(onSend);
  useEffect(() => {
    sendRef.current = onSend;
  });
  useEffect(() => {
    if (disabled || !side) return;
    if (submitted && submitted.side === side && submitted.text === text) return;
    const t = setTimeout(() => sendRef.current(side, text), 900);
    return () => clearTimeout(t);
  }, [side, text, disabled, submitted]);

  const pick = (s: DebateSide) => {
    if (disabled) return;
    setSide(s);
    onSend(s, text);
    box.current?.focus();
  };
  useControls(
    {
      onControl: (c) => {
        if (c === "left") pick("for");
        else if (c === "right") pick("against");
        else if (side) box.current?.focus();
      },
      onDigit: (d) => {
        if (d === 0) pick("for");
        else if (d === 1) pick("against");
      },
    },
    !disabled,
  );

  const saved = submitted !== null && submitted.side === side && submitted.text === text && text.trim() !== "";
  const save = () => !disabled && side && onSend(side, text);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Your side">
        {(["for", "against"] as const).map((s, i) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            disabled={disabled}
            onClick={() => pick(s)}
            className={`rounded-2xl border-4 px-4 py-4 text-xl font-black transition disabled:opacity-60 ${
              side === s
                ? s === "for"
                  ? "border-sky-700 bg-sky-600 text-white"
                  : "border-rose-700 bg-rose-600 text-white"
                : s === "for"
                  ? "border-sky-200 bg-white text-sky-700"
                  : "border-rose-200 bg-white text-rose-700"
            }`}
          >
            {s === "for" ? "← " : ""}
            {s === "for" ? names.for : names.against}
            {s === "against" ? " →" : ""}
            <span className="ml-2 align-middle text-xs font-normal opacity-70">
              <Kbd>{i + 1}</Kbd>
            </span>
          </button>
        ))}
      </div>
      {side ? (
        <>
          <textarea
            ref={box}
            disabled={disabled}
            value={text}
            maxLength={maxLength}
            rows={5}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") box.current?.blur();
            }}
            placeholder={`Make the case ${side === "for" ? "for" : "against"}…`}
            aria-label={`Your argument, ${side === "for" ? names.for : names.against}`}
            className="w-full rounded-xl border border-neutral-300 bg-white p-4 text-lg focus:border-neutral-600 focus:outline-none disabled:bg-neutral-100"
          />
          <div className="flex items-center justify-between gap-3 text-sm text-neutral-500">
            <span aria-live="polite">
              {saved ? (disabled ? "✓ Submitted" : "✓ Saved. Keep editing until answers close.") : "Saves as you type."}
            </span>
            <span className="tabular-nums">
              {text.length}/{maxLength}
            </span>
          </div>
          {!disabled && <Stakes side={side} board={board} />}
          <p className="text-center text-xs text-neutral-500">
            Changed your mind? <Kbd>Esc</Kbd> then <Kbd>←</Kbd>/<Kbd>→</Kbd>, or tap the other side.
          </p>
        </>
      ) : (
        <>
          <p className="text-center text-sm text-neutral-600">
            Pick a side and your duck goes over to it. Then make your case: no timer, no speed bonus.
          </p>
          {!disabled && <Stakes side={null} board={board} />}
        </>
      )}
    </div>
  );
}

/** The hidden facts on your side and the bonus for the side that wins, in a line. */
function Stakes({
  side,
  board,
}: {
  side: DebateSide | null;
  board?: { counts?: Record<DebateSide, number>; factPoints: number; winBonus: number };
}) {
  if (!board) return null;
  const total = (board.counts?.for ?? 0) + (board.counts?.against ?? 0);
  const n = side ? (board.counts?.[side] ?? 0) : total;
  const parts: string[] = [];
  if (n > 0) {
    parts.push(
      side
        ? `${n} hidden fact${n === 1 ? "" : "s"} on your side: +${board.factPoints} for each one your argument gets right.`
        : "Each side has hidden facts to uncover by getting them right in your argument.",
      `Say something that contradicts a fact and it costs ${board.factPoints}.`,
    );
  }
  if (board.winBonus > 0) {
    parts.push(
      total > 0
        ? `The side that uncovers more of its facts wins +${board.winBonus}.`
        : `The side with the better arguments wins +${board.winBonus}.`,
    );
  }
  if (!parts.length) return null;
  return <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-900">{parts.join(" ")}</p>;
}
