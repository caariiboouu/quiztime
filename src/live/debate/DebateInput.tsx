import { useEffect, useRef, useState } from "react";
import type { DebateSide } from "../../../shared/protocol";
import { useControls } from "../controls";
import { Kbd } from "../Kbd";

/**
 * Argue for or against: pick a side (your duck hops over to it straight away),
 * then make your case. The argument saves itself as you type, and Enter saves
 * it now. No timer and no speed bonus. One-handed: ←/→ (or 1/2) pick a side
 * and jump to the box; Esc leaves the box so the arrows work again.
 */
export function DebateInput({
  segmentId,
  names,
  maxLength,
  disabled,
  submitted,
  onSend,
}: {
  segmentId: string;
  names: { for: string; against: string };
  maxLength: number;
  disabled: boolean;
  submitted: { side: DebateSide; text: string } | null;
  onSend: (side: DebateSide, text: string) => void;
}) {
  const draftKey = `quiztime.live.draft.${segmentId}`;
  const [side, setSide] = useState<DebateSide | null>(submitted?.side ?? null);
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? submitted?.text ?? "";
    } catch {
      return submitted?.text ?? "";
    }
  });
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, text);
    } catch {
      // Drafts are a convenience only.
    }
  }, [draftKey, text]);

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
          <p className="text-center text-xs text-neutral-500">
            Changed your mind? <Kbd>Esc</Kbd> then <Kbd>←</Kbd>/<Kbd>→</Kbd>, or tap the other side.
          </p>
        </>
      ) : (
        <p className="text-center text-sm text-neutral-600">
          Pick a side and your duck goes over to it. Then make your case: no timer, no speed bonus.
        </p>
      )}
    </div>
  );
}
