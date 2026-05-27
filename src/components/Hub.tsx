import { GAMES } from "../data/games";
import type { GameId } from "../types";
import { NavBar } from "./NavBar";

type HubProps = {
  onSelectGame: (id: GameId) => void;
};

export function Hub({ onSelectGame }: HubProps) {
  return (
    <div className="flex h-full flex-col">
      <NavBar title="Quiz Time" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h2 className="mb-2 text-3xl font-semibold tracking-tight text-neutral-900">
          Pick a game
        </h2>
        <p className="mb-8 text-neutral-600">
          Choose an activity to launch. You can always come back here from the
          top-left back button.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              disabled={!game.available}
              onClick={() => game.available && onSelectGame(game.id)}
              className="rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition hover:border-neutral-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-neutral-900">
                  {game.name}
                </h3>
                {!game.available && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    Soon
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-600">{game.description}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
