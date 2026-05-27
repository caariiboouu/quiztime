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

export type GameId = "cookie-face" | "carrot-in-a-box" | "af-trivia" | "mystery-quiz";

export type TriviaData = {
  questions: Question[];
};

export type Game = {
  id: GameId;
  name: string;
  description: string;
  available: boolean;
};
