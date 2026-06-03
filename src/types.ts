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
};

export type DuckHoursData = {
  holders: DuckHolder[];
  /** id of the holder currently holding the ceramic duck, or null if nobody. */
  currentHolderId: string | null;
  /** ISO timestamp of when the current holder picked up the duck, or null. */
  heldSince: string | null;
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
