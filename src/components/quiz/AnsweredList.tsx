import type { Category } from "../../types";
import type { AnsweredMap } from "../../hooks/useAnsweredQuestions";

type AnsweredListProps = {
  categories: Category[];
  answered: AnsweredMap;
  onUnanswer: (questionId: string) => void;
  onClearAll: () => void;
};

export function AnsweredList({
  categories,
  answered,
  onUnanswer,
  onClearAll,
}: AnsweredListProps) {
  const answeredIds = Object.keys(answered);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900">
            Answered questions
          </h2>
          <p className="mt-1 text-neutral-600">
            Unanswer one to put it back in the pool — useful while testing.
          </p>
        </div>
        {answeredIds.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Clear all
          </button>
        )}
      </div>

      {answeredIds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
          Nothing's been answered yet.
        </p>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => {
            const qs = cat.questions.filter((q) => answered[q.id]);
            if (qs.length === 0) return null;
            return (
              <section key={cat.id}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {cat.name}
                </h3>
                <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  {qs.map((q) => {
                    const rec = answered[q.id];
                    return (
                      <li
                        key={q.id}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-neutral-900">
                            {q.question}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {rec.correct ? "Correct" : "Wrong"} ·{" "}
                            {new Date(rec.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUnanswer(q.id)}
                          className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          Unanswer
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
