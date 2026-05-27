import { useCallback, useEffect, useState } from "react";

export type AnsweredRecord = {
  questionId: string;
  categoryId: string;
  correct: boolean;
  timestamp: number;
};

export type AnsweredMap = Record<string, AnsweredRecord>;

function load(storageKey: string): AnsweredMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    return JSON.parse(raw) as AnsweredMap;
  } catch {
    return {};
  }
}

function save(storageKey: string, map: AnsweredMap) {
  localStorage.setItem(storageKey, JSON.stringify(map));
}

export function useAnsweredQuestions(storageKey: string) {
  const [answered, setAnswered] = useState<AnsweredMap>(() => load(storageKey));

  useEffect(() => {
    save(storageKey, answered);
  }, [storageKey, answered]);

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
