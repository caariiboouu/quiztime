import { useState } from "react";
import type { Show, ShowSegment } from "../../../shared/protocol";
import {
  DEFAULT_POINTS,
  DEFAULT_SECONDS,
  MAX_OPTION,
  MAX_OPTIONS,
  MAX_PROMPT,
  blankQuestion,
  freeOptionId,
  isEditable,
  type Editable,
} from "./questionSet";

/**
 * Edit the saved question set: title, and for each multiple-choice question
 * or poll its text, 2–4 answers (pick the correct one), points and seconds.
 * Other kinds of segment (minigames, lightning rounds, typed answers) come
 * from show files; here they can be moved or removed.
 */
export function QuestionEditor({
  show,
  onChange,
  label,
}: {
  show: Show;
  onChange: (show: Show) => void;
  /** Describes a non-editable segment (e.g. "🎮 Duck Stop"). */
  label: (s: ShowSegment) => string;
}) {
  const setSegments = (segments: ShowSegment[]) => onChange({ ...show, segments });
  const update = (i: number, seg: ShowSegment) =>
    setSegments(show.segments.map((s, j) => (j === i ? seg : s)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= show.segments.length) return;
    const next = [...show.segments];
    [next[i], next[j]] = [next[j], next[i]];
    setSegments(next);
  };
  const remove = (i: number) => setSegments(show.segments.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-neutral-700">Name of this set</span>
        <input
          value={show.title}
          maxLength={120}
          onChange={(e) => onChange({ ...show, title: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 font-semibold"
        />
      </label>
      <ol className="space-y-3">
        {show.segments.map((seg, i) => (
          <li key={isEditable(seg) ? seg.question.id : `${i}-${seg.kind}`}>
            <SegmentCard
              index={i}
              total={show.segments.length}
              onMove={(by) => move(i, by)}
              onRemove={() => remove(i)}
              title={isEditable(seg) ? (seg.question.type === "poll" ? "Poll" : "Multiple choice") : label(seg)}
            >
              {isEditable(seg) && (
                <QuestionFields
                  q={seg.question}
                  onChange={(question) => update(i, { ...seg, question })}
                />
              )}
            </SegmentCard>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => setSegments([...show.segments, blankQuestion()])}
        className="w-full rounded-xl border-2 border-dashed border-neutral-300 bg-white py-3 font-semibold text-neutral-700 hover:border-neutral-500"
      >
        ＋ Add a question
      </button>
    </div>
  );
}

function SegmentCard({
  index,
  total,
  title,
  onMove,
  onRemove,
  children,
}: {
  index: number;
  total: number;
  title: string;
  onMove: (by: number) => void;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-500">
          {index + 1}. {title}
        </p>
        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            aria-label={`Move question ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="rounded px-2 py-1 hover:bg-neutral-100 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move question ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="rounded px-2 py-1 hover:bg-neutral-100 disabled:opacity-30"
          >
            ↓
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                onClick={onRemove}
                className="rounded bg-rose-600 px-2 py-1 font-semibold text-white"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="px-1 underline">
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label={`Remove question ${index + 1}`}
              onClick={() => setConfirming(true)}
              className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function QuestionFields({ q, onChange }: { q: Editable; onChange: (q: Editable) => void }) {
  const setType = (type: "choice" | "poll") => {
    if (type === q.type) return;
    if (type === "poll") {
      onChange({ type: "poll", id: q.id, prompt: q.prompt, options: q.options, arena: q.arena });
    } else {
      onChange({
        type: "choice",
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        arena: q.arena,
        correctId: q.options[0].id,
        points: DEFAULT_POINTS,
        timeLimitSec: DEFAULT_SECONDS,
      });
    }
  };
  const setOption = (id: string, text: string) =>
    onChange({ ...q, options: q.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  const removeOption = (id: string) => {
    const options = q.options.filter((o) => o.id !== id);
    if (q.type === "choice" && q.correctId === id) onChange({ ...q, options, correctId: options[0].id });
    else onChange({ ...q, options });
  };
  const addOption = () => onChange({ ...q, options: [...q.options, { id: freeOptionId(q.options), text: "" }] });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`type-${q.id}`}
            checked={q.type === "choice"}
            onChange={() => setType("choice")}
          />
          Multiple choice (one right answer)
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`type-${q.id}`}
            checked={q.type === "poll"}
            onChange={() => setType("poll")}
          />
          Poll (no right answer)
        </label>
      </div>
      <label className="block">
        <span className="sr-only">Question</span>
        <textarea
          value={q.prompt}
          maxLength={MAX_PROMPT}
          rows={3}
          placeholder="Question"
          onChange={(e) => onChange({ ...q, prompt: e.target.value })}
          // Grows to fit the question where browsers support it.
          className="min-h-20 w-full rounded-md border border-neutral-300 px-3 py-2 [field-sizing:content]"
        />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs text-neutral-500">
          Answers{q.type === "choice" && " (tick the right one)"}
        </legend>
        {q.options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2">
            {q.type === "choice" ? (
              <input
                type="radio"
                name={`correct-${q.id}`}
                aria-label={`Answer ${i + 1} is correct`}
                checked={q.correctId === o.id}
                onChange={() => onChange({ ...q, correctId: o.id })}
              />
            ) : (
              <span className="w-[13px]" />
            )}
            <input
              value={o.text}
              maxLength={MAX_OPTION}
              placeholder={`Answer ${i + 1}`}
              aria-label={`Answer ${i + 1}`}
              onChange={(e) => setOption(o.id, e.target.value)}
              className={`min-w-0 flex-1 rounded-md border px-3 py-1.5 ${
                q.type === "choice" && q.correctId === o.id
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-neutral-300"
              }`}
            />
            {q.options.length > 2 && (
              <button
                type="button"
                aria-label={`Remove answer ${i + 1}`}
                onClick={() => removeOption(o.id)}
                className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {q.options.length < MAX_OPTIONS && (
          <button type="button" onClick={addOption} className="ml-5 text-sm text-neutral-600 underline">
            + Add an answer
          </button>
        )}
      </fieldset>
      {q.type === "choice" && (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            Points
            <input
              type="number"
              min={0}
              max={10000}
              value={q.points}
              onChange={(e) => onChange({ ...q, points: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })}
              className="w-24 rounded-md border border-neutral-300 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            Seconds to answer
            <input
              type="number"
              min={3}
              max={300}
              value={q.timeLimitSec}
              onChange={(e) =>
                onChange({ ...q, timeLimitSec: Math.max(3, Math.min(300, Number(e.target.value) || 3)) })
              }
              className="w-20 rounded-md border border-neutral-300 px-2 py-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}
