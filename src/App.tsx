import { useState } from "react";
import { Hub } from "./components/Hub";
import { QuizGame } from "./components/quiz/QuizGame";
import type { GameId } from "./types";

function App() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  if (activeGame === "quiz") {
    return <QuizGame onExit={() => setActiveGame(null)} />;
  }

  return <Hub onSelectGame={setActiveGame} />;
}

export default App;
