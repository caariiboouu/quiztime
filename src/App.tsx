import { useEffect, useState } from "react";
import { Hub } from "./components/Hub";
import { QuizGame } from "./components/quiz/QuizGame";
import { AFTrivia } from "./components/games/AFTrivia";
import { CookieFace } from "./components/games/CookieFace";
import { CarrotInABox } from "./components/games/CarrotInABox";
import { AdminPanel } from "./components/admin/AdminPanel";
import { GAMES } from "./data/games";
import type { GameId } from "./types";
import { usePersistentState } from "./hooks/usePersistentState";

const VALID_IDS = new Set<string>(GAMES.map((g) => g.id));

function App() {
  const [activeGame, setActiveGame] = usePersistentState<GameId | null>(
    "quiztime.activeGame",
    null,
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const goHome = () => setActiveGame(null);

  useEffect(() => {
    if (activeGame && !VALID_IDS.has(activeGame)) setActiveGame(null);
  }, [activeGame, setActiveGame]);

  if (adminOpen) return <AdminPanel onExit={() => setAdminOpen(false)} />;

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
      return (
        <Hub
          onSelectGame={setActiveGame}
          onOpenAdmin={() => setAdminOpen(true)}
        />
      );
  }
}

export default App;
