import { useEffect, useState } from "react";
import { Hub } from "./components/Hub";
import { QuizGame } from "./components/quiz/QuizGame";
import { AFTrivia } from "./components/games/AFTrivia";
import { CookieFace } from "./components/games/CookieFace";
import { CarrotInABox } from "./components/games/CarrotInABox";
import { DuckHours } from "./components/DuckHours";
import { AdminPanel } from "./components/admin/AdminPanel";
import { GAMES } from "./data/games";
import type { GameId } from "./types";
import { usePersistentState } from "./hooks/usePersistentState";

const VALID_IDS = new Set<string>(GAMES.map((g) => g.id));

// Ceramic Duck Hours lives at its own hash URL (#/duck) rather than on the Hub.
const DUCK_HASHES = new Set(["#/duck", "#/duck-hours"]);

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function App() {
  const [activeGame, setActiveGame] = usePersistentState<GameId | null>(
    "quiztime.activeGame",
    null,
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const goHome = () => setActiveGame(null);
  const hash = useHashRoute();

  useEffect(() => {
    if (activeGame && !VALID_IDS.has(activeGame)) setActiveGame(null);
  }, [activeGame, setActiveGame]);

  if (DUCK_HASHES.has(hash)) {
    return (
      <DuckHours
        onExit={() => {
          window.location.hash = "";
        }}
      />
    );
  }

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
