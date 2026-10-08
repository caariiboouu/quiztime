import { ControlsHint } from "../ControlsHint";
import { ArenaPractice } from "./ArenaDemo";
import { SoundToggle } from "./ArenaControls";

/**
 * #/live/arena: the shared practice arena on its own page, for sharing a
 * link. Everyone who opens it gets a duck.
 */
export function ArenaPracticePage({ onExit }: { onExit: () => void }) {
  return (
    <div className="min-h-full bg-gradient-to-b from-sky-50 to-emerald-50 px-3 py-4 sm:px-4 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-3">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">Duck arena practice</h1>
            <p className="text-sm text-neutral-600">
              Walk your duck onto the answer you think is right before time runs out.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <SoundToggle />
            <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
              Back
            </button>
          </div>
        </header>
        <ArenaPractice />
        <div className="hidden sm:block">
          <ControlsHint />
        </div>
      </div>
    </div>
  );
}
