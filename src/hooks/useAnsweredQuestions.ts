import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "quiztime.answered";

export type AnsweredRecord = {
  questionId: string;
  categoryId: string;
  correct: boolean;
  timestamp: number;
};

export type AnsweredMap = Record<string, AnsweredRecord>;

function load(): AnsweredMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AnsweredMap;
  } catch {
    return {};
  }
}

function save(map: AnsweredMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function useAnsweredQuestions() {
  const [answered, setAnswered] = useState<AnsweredMap>(() => load());

  useEffect(() => {
    save(answered);
  }, [answered]);

  const markAnswered = useCallback(
    (questionId: string, categoryId: string, correct: boolean) => {
      setAnswered((prev) => ({
        ...prev,
        [questionId]: {
          questionId,
          categoryId,
          correct,
          timestamp: Date.now(),
        },
      }));
    },
    [],
  );

  const unanswer = useCallback((questionId: string) => {
    setAnswered((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setAnswered({}), []);

  return { answered, markAnswered, unanswer, clearAll };
}
