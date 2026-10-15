/** Helpers for the host's question-set editor (see QuestionEditor.tsx). */
import {
  MAX_DEBATE_LEVELS,
  MIN_DEBATE_LEVELS,
  type ChoiceQuestion,
  type DebateQuestion,
  type PollQuestion,
  type Show,
  type ShowSegment,
} from "../../../shared/protocol";

export const MAX_PROMPT = 1000;
export const MAX_OPTION = 200;
export const MAX_OPTIONS = 4;
export const DEFAULT_POINTS = 100;
export const DEFAULT_SECONDS = 25;

export const MAX_LEVEL_LABEL = 60;
export const MAX_SIDE_NAME = 24;

export type Editable = ChoiceQuestion | PollQuestion | DebateQuestion;
export const isEditable = (s: ShowSegment): s is { kind: "question"; question: Editable } =>
  s.kind === "question" &&
  (s.question.type === "choice" || s.question.type === "poll" || s.question.type === "debate");

export const newId = () => `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const freeOptionId = (options: { id: string }[]) =>
  "abcdefghijklmnopqrstuvwxyz".split("").find((l) => !options.some((o) => o.id === l)) ?? newId();

export function blankQuestion(): ShowSegment {
  return {
    kind: "question",
    question: {
      type: "choice",
      id: newId(),
      prompt: "",
      options: [
        { id: "a", text: "" },
        { id: "b", text: "" },
        { id: "c", text: "" },
      ],
      correctId: "a",
      points: DEFAULT_POINTS,
      timeLimitSec: DEFAULT_SECONDS,
    },
  };
}

/** What's missing before the set can be saved (the server checks again). */
export function showProblems(show: Show): string[] {
  const out: string[] = [];
  if (!show.title.trim()) out.push("The set needs a title.");
  if (show.segments.length === 0) out.push("Add at least one question.");
  show.segments.forEach((s, i) => {
    if (!isEditable(s)) return;
    const q = s.question;
    if (!q.prompt.trim()) out.push(`Question ${i + 1} has no question text.`);
    if (q.type === "debate") {
      if (q.levels.length < MIN_DEBATE_LEVELS || q.levels.length > MAX_DEBATE_LEVELS) {
        out.push(`Question ${i + 1} needs ${MIN_DEBATE_LEVELS}–${MAX_DEBATE_LEVELS} verdicts.`);
      }
      if (q.levels.some((l) => !l.trim())) out.push(`Question ${i + 1} has an empty verdict.`);
      const seen = new Set(q.levels.map((l) => l.trim().toLowerCase()));
      if (seen.size !== q.levels.length) out.push(`Question ${i + 1} has the same verdict twice.`);
      if (q.sides && (!q.sides.for.trim() || !q.sides.against.trim())) {
        out.push(`Question ${i + 1} needs a name for both sides.`);
      }
      return;
    }
    if (q.options.some((o) => !o.text.trim())) out.push(`Question ${i + 1} has an empty answer.`);
    if (q.type === "choice" && !q.options.some((o) => o.id === q.correctId)) {
      out.push(`Question ${i + 1} needs a correct answer.`);
    }
  });
  return out;
}
