import { useState } from "react";
import type { Question, TriviaData } from "../../types";
import { QuestionEditor, blankQuestion } from "./QuestionEditor";

type TriviaEditorProps = {
  data: TriviaData;
  onChange: (data: TriviaData) => void;
};

type EditTarget =
  | { kind: "list" }
  | { kind: "question"; question: Question; isNew: boolean };

export function TriviaEditor({ data, onChange }: TriviaEditorProps) {
  const [target, setTarget] = useState<EditTarget>({ kind: "list" });

  const upsert = (q: Question) => {
    onChange({
      questions: data.questions.some((x) => x.id === q.id)
        ? data.questions.map((x) => (x.id === q.id ? q : x))
        : [...data.questions, q],
    });
  };

  const remove = (id: string) => {
    if (!confirm("Delete this question?")) return;
    onChange({ questions: data.questions.filter((q) => q.id !== id) });
  };

  if (target.kind === "question") {
    return (
      <QuestionEditor
        initial={target.question}
        title={target.isNew ? "New AF Trivia question" : "Edit AF Trivia question"}
        onSave={(q) => {
          upsert(q);
          setTarget({ kind: "list" });
        }}
        onCancel={() => setTarget({ kind: "list" })}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
            AF Trivia questions
          </h2>
          <p className="text-sm text-neutral-600">
            {data.questions.length} question{data.questions.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setTarget({ kind: "question", question: blankQuestion("af"), isNew: true })
          }
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          + Question
        </button>
      </div>

      <ul className="space-y-2">
        {data.questions.map((q) => (
          <li
            key={q.id}
            className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
              {q.question || <em className="text-neutral-400">empty</em>}
            </span>
            <button
              type="button"
              onClick={() => setTarget({ kind: "question", question: q, isNew: false })}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => remove(q.id)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
