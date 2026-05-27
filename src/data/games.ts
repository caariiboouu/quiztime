import type { Game } from "../types";

export const GAMES: Game[] = [
  {
    id: "quiz",
    name: "Quiz Show",
    description: "Pick a category, answer a random question, win a chance at glory.",
    available: true,
  },
  {
    id: "placeholder",
    name: "Coming Soon",
    description: "Another game slot — drop a new component in to plug it in.",
    available: false,
  },
];
