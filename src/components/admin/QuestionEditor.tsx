import { useState } from "react";
import type { Answer, Question } from "../../types";
import { ImageInput } from "./ImageInput";

type QuestionEditorProps = {
  initial: Question;
  title: string;
  onSave: (q: Question) => void;
  onCancel: () => void;
};

function makeAnswer(letter: number): Answer {
  return { id: String.fromCharCode(97 + letter), text: "" };
}

export function QuestionEditor({
  initial,
  title,
  onSave,
  onCancel,
}: QuestionEditorProps) {
  const [draft, setDraft] = useState<Question>(initial);

  const updateAnswer = (id: string, patch: Partial<Answer>) => {
    setDraft((d) => ({
      ...d,
      answers: d.answers.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  };

  const addAnswer = () => {
    setDraft((d) => ({
      ...d,
      answers: [...d.answers, makeAnswer(d.answers.length)],
    }));
  };

  const removeAnswer = (id: string) => {
    setDraft((d) => {
      const answers = d.answers.filter((a) => a.id !== id);
      return {
        ...d,
        answers,
        correctAnswerId: d.correctAnswerId === id ? (answers[0]?.id ?? "") : d.correctAnswerId,
      };
    });
  };

  const canSave =
    draft.question.trim() !== "" &&
    draft.answers.length >= 2 &&
    draft.answers.every((a) => a.text.trim() !== "") &&
    draft.answers.some((a) => a.id === draft.correctAnswerId);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-900">
        {title}
      </h2>

      <div className="space-y-6 rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
            Question
          </label>
          <textarea
            value={draft.question}
            onChange={(e) =>
              setDraft((d) => ({ ...d, question: e.target.value }))
            }
            rows={3}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <ImageInput
          label="Question image (optional)"
          value={draft.image}
          onChange={(v) => setDraft((d) => ({ ...d, image: v }))}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Answers (mark one correct)
            </label>
            <button
              type="button"
              onClick={addAnswer}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              + Add answer
            </button>
          </div>
          <div className="space-y-3">
            {draft.answers.map((answer, idx) => (
              <div
                key={answer.id}
                className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
              >
                <div className="flex items-start gap-3">
                  <label className="mt-2 flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="radio"
                      name="correct"
                      checked={draft.correctAnswerId === answer.id}
                      onChange={() =>
                        setDraft((d) => ({ ...d, correctAnswerId: answer.id }))
                      }
                    />
                    {String.fromCharCode(65 + idx)}
                  </label>
                  <input
                    value={answer.text}
                    onChange={(e) =>
                      updateAnswer(answer.id, { text: e.target.value })
                    }
                    placeholder="Answer text"
                    className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
                  />
                  {draft.answers.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeAnswer(answer.id)}
                      className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-3">
                  <ImageInput
                    label="Answer image (optional)"
                    value={answer.image}
                    onChange={(v) => updateAnswer(answer.id, { image: v })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
            Factoid (shown after the answer)
          </label>
          <textarea
            value={draft.factoid ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                factoid: e.target.value || undefined,
              }))
            }
            rows={3}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <ImageInput
          label="Factoid image (optional)"
          value={draft.factoidImage}
          onChange={(v) => setDraft((d) => ({ ...d, factoidImage: v }))}
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave(draft)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </main>
  );
}

export function blankQuestion(idPrefix: string): Question {
  return {
    id: `${idPrefix}-${Date.now().toString(36)}`,
    question: "",
    answers: [makeAnswer(0), makeAnswer(1), makeAnswer(2), makeAnswer(3)],
    correctAnswerId: "a",
  };
}
