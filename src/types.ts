export type Answer = {
  id: string;
  text: string;
  image?: string;
};

export type Question = {
  id: string;
  question: string;
  image?: string;
  answers: Answer[];
  correctAnswerId: string;
  factoid?: string;
  factoidImage?: string;
};

export type Category = {
  id: string;
  name: string;
  description?: string;
  questions: Question[];
};

export type QuizData = {
  categories: Category[];
};

export type GameId =
  | "cookie-face"
  | "carrot-in-a-box"
  | "af-trivia"
  | "mystery-quiz";

export type DuckHolder = {
  id: string;
  initials: string;
  accumulatedSeconds: number;
  /**
   * Current standing: 1 = holds the duck (full rate), 2 = ½ rate, 3 = ⅓, etc.
   * null = benched (earns nothing right now).
   */
  rank: number | null;
};

export type BonusAward = {
  /** ISO timestamp of when the bonus was awarded. */
  at: string;
  holderId: string;
  /** Seconds added to the holder's total. */
  seconds: number;
  reason?: string;
};

export type DuckHoursData = {
  holders: DuckHolder[];
  /** ISO timestamp of when the current standings took effect, or null. */
  heldSince: string | null;
  /** History of manually-awarded bonus hours. */
  bonusLog?: BonusAward[];
};

export type TriviaData = {
  questions: Question[];
};

export type Game = {
  id: GameId;
  name: string;
  description: string;
  available: boolean;
};
