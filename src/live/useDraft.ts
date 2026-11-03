import { useEffect, useState } from "react";

/**
 * A typed answer that saves itself as you go, so a reload doesn't lose it.
 * It's kept for this asking of the question only (`openedAt`): the practice
 * room plays the same show every game, and last game's words shouldn't be
 * waiting in the box. Falls back to what the server already has.
 */
export function useDraft(segmentId: string, openedAt: number, fallback: string) {
  const key = `quiztime.live.draft.${segmentId}`;
  const [text, setText] = useState(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      if (
        saved &&
        typeof saved === "object" &&
        "openedAt" in saved &&
        saved.openedAt === openedAt &&
        "text" in saved &&
        typeof saved.text === "string"
      ) {
        return saved.text;
      }
    } catch {
      // A draft from before they were stamped, or no storage: start from the server's copy.
    }
    return fallback;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ openedAt, text }));
    } catch {
      // Drafts are a convenience only.
    }
  }, [key, openedAt, text]);
  return [text, setText] as const;
}
