import { useState } from "react";
import { PRACTICE_CODE } from "../../../shared/practice";
import { ApiError, joinPractice, loadPlayerCreds, savePlayerCreds, type PlayerCreds } from "../api";
import { NameStep } from "../arena/ArenaPracticePage";
import { SoundToggle } from "../arena/ArenaControls";
import { Banner } from "../components";
import { PlayerGame } from "../PlayerApp";

/**
 * #/live/test: the debate & teams practice room (shared/practice.ts). A real
 * game that runs itself on a timer, in team mode, with one of every kind of
 * question and three debates. Anyone with the link joins with just a name.
 */
export function PracticeRoomPage({ onExit }: { onExit: () => void }) {
  const [seat, setSeat] = useState<PlayerCreds | null>(() => loadPlayerCreds(PRACTICE_CODE));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await joinPractice(name);
      const next: PlayerCreds = { code: res.code, playerId: res.playerId, token: res.token };
      savePlayerCreds(PRACTICE_CODE, next);
      setSeat(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <header className="border-b border-violet-200 bg-violet-50">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate font-black tracking-tight">Debate &amp; teams practice</h1>
          <p className="truncate text-xs text-neutral-600">Runs by itself. Everyone with this link plays together.</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <SoundToggle />
          <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
            Back
          </button>
        </div>
      </div>
    </header>
  );

  if (seat) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <div className="flex flex-1 flex-col">
          <PlayerGame
            creds={seat}
            rejoinWhenGone
            onLeave={() => {
              savePlayerCreds(PRACTICE_CODE, null);
              setSeat(null);
            }}
            onExit={onExit}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-sky-50 to-amber-50">
      {header}
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md space-y-2 text-center text-neutral-700">
          <p>
            A game that hosts itself, for trying out <strong>debates</strong> and <strong>teams</strong> with
            whoever else is here. You'll go in a team (Mallards or Canvasbacks), and the teams get evened out
            before it starts.
          </p>
          <p className="text-sm text-neutral-500">
            Three debates, a poll, a written answer, a number guess and two quick ones. When it ends, a new game
            starts.
          </p>
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        <NameStep onGo={join} busy={busy} />
      </main>
    </div>
  );
}
