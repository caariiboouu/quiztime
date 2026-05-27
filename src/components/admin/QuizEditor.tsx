import { useState } from "react";
import type { Category, Question, QuizData } from "../../types";
import { QuestionEditor, blankQuestion } from "./QuestionEditor";

type QuizEditorProps = {
  data: QuizData;
  onChange: (data: QuizData) => void;
};

type EditTarget =
  | { kind: "list" }
  | { kind: "question"; categoryId: string; question: Question; isNew: boolean };

export function QuizEditor({ data, onChange }: QuizEditorProps) {
  const [target, setTarget] = useState<EditTarget>({ kind: "list" });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const upsertQuestion = (categoryId: string, q: Question) => {
    onChange({
      ...data,
      categories: data.categories.map((c) =>
        c.id !== categoryId
          ? c
          : {
              ...c,
              questions: c.questions.some((x) => x.id === q.id)
                ? c.questions.map((x) => (x.id === q.id ? q : x))
                : [...c.questions, q],
            },
      ),
    });
  };

  const deleteQuestion = (categoryId: string, questionId: string) => {
    if (!confirm("Delete this question?")) return;
    onChange({
      ...data,
      categories: data.categories.map((c) =>
        c.id !== categoryId
          ? c
          : { ...c, questions: c.questions.filter((q) => q.id !== questionId) },
      ),
    });
  };

  const addCategory = () => {
    const name = prompt("New category name?");
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
    onChange({
      ...data,
      categories: [
        ...data.categories,
        { id, name, description: "", questions: [] },
      ],
    });
  };

  const updateCategory = (categoryId: string, patch: Partial<Category>) => {
    onChange({
      ...data,
      categories: data.categories.map((c) =>
        c.id === categoryId ? { ...c, ...patch } : c,
      ),
    });
  };

  const deleteCategory = (categoryId: string) => {
    if (!confirm("Delete this entire category and all its questions?")) return;
    onChange({
      ...data,
      categories: data.categories.filter((c) => c.id !== categoryId),
    });
  };

  if (target.kind === "question") {
    return (
      <QuestionEditor
        initial={target.question}
        title={target.isNew ? "New question" : "Edit question"}
        onSave={(q) => {
          upsertQuestion(target.categoryId, q);
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
            Categories
          </h2>
          <p className="text-sm text-neutral-600">
            {data.categories.length} categor{data.categories.length === 1 ? "y" : "ies"} ·{" "}
            {data.categories.reduce((n, c) => n + c.questions.length, 0)} questions
          </p>
        </div>
        <button
          type="button"
          onClick={addCategory}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          + Category
        </button>
      </div>

      <div className="space-y-3">
        {data.categories.map((cat) => (
          <div
            key={cat.id}
            className="rounded-lg border border-neutral-200 bg-white"
          >
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="flex-1 space-y-2">
                <input
                  value={cat.name}
                  onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                  className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-neutral-900 hover:border-neutral-200 focus:border-neutral-300 focus:bg-white focus:outline-none"
                />
                <input
                  value={cat.description ?? ""}
                  onChange={(e) =>
                    updateCategory(cat.id, { description: e.target.value })
                  }
                  placeholder="Description (optional)"
                  className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-neutral-600 hover:border-neutral-200 focus:border-neutral-300 focus:bg-white focus:outline-none"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-medium text-neutral-500">
                  {cat.questions.length} q
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [cat.id]: !e[cat.id] }))
                  }
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  {expanded[cat.id] ? "Collapse" : "Expand"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteCategory(cat.id)}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
            {expanded[cat.id] && (
              <div className="border-t border-neutral-100 px-4 py-3">
                <ul className="space-y-2">
                  {cat.questions.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                        {q.question || <em className="text-neutral-400">empty</em>}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setTarget({
                            kind: "question",
                            categoryId: cat.id,
                            question: q,
                            isNew: false,
                          })
                        }
                        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteQuestion(cat.id, q.id)}
                        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() =>
                    setTarget({
                      kind: "question",
                      categoryId: cat.id,
                      question: blankQuestion(cat.id),
                      isNew: true,
                    })
                  }
                  className="mt-3 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  + Add question
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
