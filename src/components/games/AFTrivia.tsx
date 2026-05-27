import { useMemo, useState } from "react";
import triviaData from "../../data/afTrivia.json";
import type { Question, TriviaData } from "../../types";
import { useAnsweredQuestions } from "../../hooks/useAnsweredQuestions";
import { NavBar } from "../NavBar";
import { QuestionPlay } from "../quiz/QuestionPlay";
import { AnsweredList } from "../quiz/AnsweredList";

type View =
  | { kind: "ready" }
  | { kind: "answered" }
  | { kind: "play"; question: Question };

type AFTriviaProps = {
  onExit: () => void;
};

const PSEUDO_CATEGORY_ID = "af-trivia";

export function AFTrivia({ onExit }: AFTriviaProps) {
  const data = triviaData as TriviaData;
  const { answered, markAnswered, unanswer, clearAll } = useAnsweredQuestions(
    "quiztime.answered.af-trivia",
  );
  const [view, setView] = useState<View>({ kind: "ready" });

  const remaining = useMemo(
    () => data.questions.filter((q) => !answered[q.id]),
    [data, answered],
  );

  // Wrap the flat question list in a single fake category so the answered list
  // and unanswer flow can reuse the same components.
  const wrappedCategories = useMemo(
    () => [
      {
        id: PSEUDO_CATEGORY_ID,
        name: "AF Trivia",
        questions: data.questions,
      },
    ],
    [data],
  );

  const pickRandom = () => {
    if (remaining.length === 0) return;
    const q = remaining[Math.floor(Math.random() * remaining.length)];
    setView({ kind: "play", question: q });
  };

  const handleQuestionComplete = (correct: boolean) => {
    if (view.kind !== "play") return;
    markAnswered(view.question.id, PSEUDO_CATEGORY_ID, correct);
    setView({ kind: "ready" });
  };

  const navBack =
    view.kind === "ready" ? onExit : () => setView({ kind: "ready" });

  return (
    <div className="flex h-full flex-col">
      <NavBar
        title={view.kind === "answered" ? "Answered" : "AF Trivia"}
        onBack={navBack}
      />
      {view.kind === "ready" && (
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
          <h2 className="mb-2 text-4xl font-semibold tracking-tight text-neutral-900">
            AF Trivia
          </h2>
          <p className="mb-10 text-neutral-600">
            {remaining.length === data.questions.length
              ? `${data.questions.length} questions ready.`
              : `${remaining.length} of ${data.questions.length} questions left.`}
          </p>
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              disabled={remaining.length === 0}
              onClick={pickRandom}
              className="rounded-lg bg-neutral-900 px-6 py-3 text-lg font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {remaining.length === 0 ? "All questions used" : "Pull a random question"}
            </button>
            <button
              type="button"
              onClick={() => setView({ kind: "answered" })}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Answered ({Object.keys(answered).length})
            </button>
          </div>
        </main>
      )}
      {view.kind === "answered" && (
        <AnsweredList
          categories={wrappedCategories}
          answered={answered}
          onUnanswer={unanswer}
          onClearAll={clearAll}
        />
      )}
      {view.kind === "play" && (
        <QuestionPlay
          question={view.question}
          categoryName="AF Trivia"
          onComplete={handleQuestionComplete}
          onCancel={() => setView({ kind: "ready" })}
        />
      )}
    </div>
  );
}
