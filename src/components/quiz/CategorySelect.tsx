import type { Category } from "../../types";
import type { AnsweredMap } from "../../hooks/useAnsweredQuestions";

type CategorySelectProps = {
  categories: Category[];
  answered: AnsweredMap;
  onPickCategory: (category: Category) => void;
  onViewAnswered: () => void;
};

export function CategorySelect({
  categories,
  answered,
  onPickCategory,
  onViewAnswered,
}: CategorySelectProps) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900">
            Pick a category
          </h2>
          <p className="mt-1 text-neutral-600">
            The contestant calls one out — click it to draw a random question.
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAnswered}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Answered ({Object.keys(answered).length})
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => {
          const total = cat.questions.length;
          const used = cat.questions.filter((q) => answered[q.id]).length;
          const exhausted = used >= total;
          return (
            <button
              key={cat.id}
              type="button"
              disabled={exhausted}
              onClick={() => onPickCategory(cat)}
              className="group rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition hover:border-neutral-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-neutral-900">
                  {cat.name}
                </h3>
                <span className="text-xs font-medium text-neutral-500">
                  {used} / {total}
                </span>
              </div>
              {cat.description && (
                <p className="text-sm text-neutral-600">{cat.description}</p>
              )}
              {exhausted && (
                <p className="mt-3 text-xs font-medium text-neutral-500">
                  All questions used
                </p>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
