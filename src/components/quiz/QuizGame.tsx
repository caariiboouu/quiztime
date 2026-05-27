import { useMemo, useState } from "react";
import quizData from "../../data/quiz.json";
import type { Category, QuizData, Question } from "../../types";
import { useAnsweredQuestions } from "../../hooks/useAnsweredQuestions";
import { NavBar } from "../NavBar";
import { CategorySelect } from "./CategorySelect";
import { AnsweredList } from "./AnsweredList";
import { QuestionPlay } from "./QuestionPlay";

type View =
  | { kind: "categories" }
  | { kind: "answered" }
  | { kind: "play"; category: Category; question: Question };

type QuizGameProps = {
  onExit: () => void;
};

export function QuizGame({ onExit }: QuizGameProps) {
  const data = quizData as QuizData;
  const { answered, markAnswered, unanswer, clearAll } = useAnsweredQuestions(
    "quiztime.answered.quiz",
  );
  const [view, setView] = useState<View>({ kind: "categories" });

  const categories = useMemo(() => data.categories, [data]);

  const pickRandomQuestion = (cat: Category): Question | null => {
    const remaining = cat.questions.filter((q) => !answered[q.id]);
    if (remaining.length === 0) return null;
    return remaining[Math.floor(Math.random() * remaining.length)];
  };

  const handlePickCategory = (cat: Category) => {
    const q = pickRandomQuestion(cat);
    if (q) setView({ kind: "play", category: cat, question: q });
  };

  const handleQuestionComplete = (correct: boolean) => {
    if (view.kind !== "play") return;
    markAnswered(view.question.id, view.category.id, correct);
    setView({ kind: "categories" });
  };

  const headerTitle =
    view.kind === "play"
      ? "???"
      : view.kind === "answered"
        ? "Answered"
        : "???";

  const navBack =
    view.kind === "categories"
      ? onExit
      : () => setView({ kind: "categories" });

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
      {view.kind === "play" && (
        <QuestionPlay
          question={view.question}
          categoryName={view.category.name}
          onComplete={handleQuestionComplete}
          onCancel={() => setView({ kind: "categories" })}
        />
      )}
    </div>
  );
}
