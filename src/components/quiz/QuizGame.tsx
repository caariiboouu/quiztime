import { useEffect, useMemo } from "react";
import bundledQuiz from "../../data/quiz.json";
import type { Category, QuizData, Question } from "../../types";
import { useAnsweredQuestions } from "../../hooks/useAnsweredQuestions";
import { useOverridableJson } from "../../hooks/useOverridableJson";
import { usePersistentState } from "../../hooks/usePersistentState";

export const QUIZ_OVERRIDE_KEY = "quiztime.quiz.content";
import { NavBar } from "../NavBar";
import { CategorySelect } from "./CategorySelect";
import { AnsweredList } from "./AnsweredList";
import { QuestionPlay } from "./QuestionPlay";

type View =
  | { kind: "categories" }
  | { kind: "answered" }
  | { kind: "play"; categoryId: string; questionId: string };

type QuizGameProps = {
  onExit: () => void;
};

const VIEW_KEY = "quiztime.quiz.view";

export function QuizGame({ onExit }: QuizGameProps) {
  const { data } = useOverridableJson<QuizData>(
    QUIZ_OVERRIDE_KEY,
    bundledQuiz as QuizData,
  );
  const { answered, markAnswered, unanswer, clearAll } = useAnsweredQuestions(
    "quiztime.answered.quiz",
  );
  const [view, setView] = usePersistentState<View>(VIEW_KEY, {
    kind: "categories",
  });

  const categories = useMemo(() => data.categories, [data]);

  // Resolve persisted ids back to live objects, gracefully falling back to
  // the category screen if the question/category was removed from JSON.
  const playState: { category: Category; question: Question } | null = useMemo(() => {
    if (view.kind !== "play") return null;
    const cat = categories.find((c) => c.id === view.categoryId);
    if (!cat) return null;
    const q = cat.questions.find((q) => q.id === view.questionId);
    if (!q) return null;
    return { category: cat, question: q };
  }, [view, categories]);

  useEffect(() => {
    if (view.kind === "play" && !playState) {
      setView({ kind: "categories" });
    }
  }, [view, playState, setView]);

  const pickRandomQuestion = (cat: Category): Question | null => {
    const remaining = cat.questions.filter((q) => !answered[q.id]);
    if (remaining.length === 0) return null;
    return remaining[Math.floor(Math.random() * remaining.length)];
  };

  const handlePickCategory = (cat: Category) => {
    const q = pickRandomQuestion(cat);
    if (q) setView({ kind: "play", categoryId: cat.id, questionId: q.id });
  };

  const handleQuestionComplete = (correct: boolean) => {
    if (!playState) return;
    markAnswered(playState.question.id, playState.category.id, correct);
    setView({ kind: "categories" });
  };

  const headerTitle =
    view.kind === "play" ? "???" : view.kind === "answered" ? "Answered" : "???";

  const navBack =
    view.kind === "categories" ? onExit : () => setView({ kind: "categories" });

  return (
    <div className="flex h-full flex-col">
      <NavBar title={headerTitle} onBack={navBack} />
      {view.kind === "categories" && (
        <CategorySelect
          categories={categories}
          answered={answered}
          onPickCategory={handlePickCategory}
          onViewAnswered={() => setView({ kind: "answered" })}
        />
      )}
      {view.kind === "answered" && (
        <AnsweredList
          categories={categories}
          answered={answered}
          onUnanswer={unanswer}
          onClearAll={clearAll}
        />
      )}
      {playState && (
        <QuestionPlay
          key={playState.question.id}
          question={playState.question}
          categoryName={playState.category.name}
          stateKey={`quiztime.quiz.play.${playState.question.id}`}
          onComplete={handleQuestionComplete}
          onCancel={() => setView({ kind: "categories" })}
        />
      )}
    </div>
  );
}
