import { useEffect } from "react";
import { Hub } from "./components/Hub";
import { QuizGame } from "./components/quiz/QuizGame";
import { AFTrivia } from "./components/games/AFTrivia";
import { CookieFace } from "./components/games/CookieFace";
import { CarrotInABox } from "./components/games/CarrotInABox";
import { GAMES } from "./data/games";
import type { GameId } from "./types";
import { usePersistentState } from "./hooks/usePersistentState";

const VALID_IDS = new Set<string>(GAMES.map((g) => g.id));

function App() {
  const [activeGame, setActiveGame] = usePersistentState<GameId | null>(
    "quiztime.activeGame",
    null,
  );
  const goHome = () => setActiveGame(null);

  // Drop a stale active game if its id no longer exists in the registry.
  useEffect(() => {
    if (activeGame && !VALID_IDS.has(activeGame)) setActiveGame(null);
  }, [activeGame, setActiveGame]);

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
