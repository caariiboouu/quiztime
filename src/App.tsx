import { useState } from "react";
import { Hub } from "./components/Hub";
import { QuizGame } from "./components/quiz/QuizGame";
import { AFTrivia } from "./components/games/AFTrivia";
import { CookieFace } from "./components/games/CookieFace";
import { CarrotInABox } from "./components/games/CarrotInABox";
import type { GameId } from "./types";

function App() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const goHome = () => setActiveGame(null);

  switch (activeGame) {
    case "cookie-face":
      return <CookieFace onExit={goHome} />;
    case "carrot-in-a-box":
      return <CarrotInABox onExit={goHome} />;
    case "af-trivia":
      return <AFTrivia onExit={goHome} />;
    case "mystery-quiz":
      return <QuizGame onExit={goHome} />;
    default:
      return <Hub onSelectGame={setActiveGame} />;
  }
}

export default App;
