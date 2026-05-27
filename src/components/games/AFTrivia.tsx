import { useEffect, useMemo } from "react";
import bundledTrivia from "../../data/afTrivia.json";
import type { Question, TriviaData } from "../../types";
import { useAnsweredQuestions } from "../../hooks/useAnsweredQuestions";
import { useOverridableJson } from "../../hooks/useOverridableJson";
import { usePersistentState } from "../../hooks/usePersistentState";

export const TRIVIA_OVERRIDE_KEY = "quiztime.af-trivia.content";
import { NavBar } from "../NavBar";
import { QuestionPlay } from "../quiz/QuestionPlay";
import { AnsweredList } from "../quiz/AnsweredList";

type View =
  | { kind: "ready" }
  | { kind: "answered" }
  | { kind: "play"; questionId: string };

type AFTriviaProps = {
  onExit: () => void;
};

const PSEUDO_CATEGORY_ID = "af-trivia";
const VIEW_KEY = "quiztime.af-trivia.view";

export function AFTrivia({ onExit }: AFTriviaProps) {
  const { data } = useOverridableJson<TriviaData>(
    TRIVIA_OVERRIDE_KEY,
    bundledTrivia as TriviaData,
  );
  const { answered, markAnswered, unanswer, clearAll } = useAnsweredQuestions(
    "quiztime.answered.af-trivia",
  );
  const [view, setView] = usePersistentState<View>(VIEW_KEY, { kind: "ready" });

  const remaining = useMemo(
    () => data.questions.filter((q) => !answered[q.id]),
    [data, answered],
  );

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

  const activeQuestion: Question | null = useMemo(() => {
    if (view.kind !== "play") return null;
    return data.questions.find((q) => q.id === view.questionId) ?? null;
  }, [view, data]);

  useEffect(() => {
    if (view.kind === "play" && !activeQuestion) {
      setView({ kind: "ready" });
    }
  }, [view, activeQuestion, setView]);

  const pickRandom = () => {
    if (remaining.length === 0) return;
    const q = remaining[Math.floor(Math.random() * remaining.length)];
    setView({ kind: "play", questionId: q.id });
  };

  const handleQuestionComplete = (correct: boolean) => {
    if (!activeQuestion) return;
    markAnswered(activeQuestion.id, PSEUDO_CATEGORY_ID, correct);
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
      {activeQuestion && (
        <QuestionPlay
          key={activeQuestion.id}
          question={activeQuestion}
          categoryName="AF Trivia"
          stateKey={`quiztime.af-trivia.play.${activeQuestion.id}`}
          onComplete={handleQuestionComplete}
          onCancel={() => setView({ kind: "ready" })}
        />
      )}
    </div>
  );
}
