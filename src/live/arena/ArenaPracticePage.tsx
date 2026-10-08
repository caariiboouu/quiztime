import { useState } from "react";
import { ControlsHint } from "../ControlsHint";
import { lastAccountId, loadSessions } from "../api";
import { ArenaPractice } from "./ArenaDemo";
import { SoundToggle } from "./ArenaControls";

const NAME_KEY = "quiztime.live.practiceName";
const MAX_NAME = 20;

/** Last time's practice name, else the name of whoever last signed in here. */
function rememberedName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved !== null) return saved;
  } catch {
    // no storage: start blank
  }
  const last = lastAccountId();
  return (last && loadSessions()[last]?.account.name) || "";
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // fine: just not remembered
  }
}

/**
 * #/live/arena: the shared practice arena on its own page, for sharing a
 * link. Everyone who opens it names their duck (or takes a random duck
 * name) and gets one to steer.
 */
export function ArenaPracticePage({ onExit }: { onExit: () => void }) {
  // null until they've said what to call their duck.
  const [name, setName] = useState<string | null>(null);
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
        {name === null ? (
          <NameStep
            onGo={(n) => {
              // "Surprise me" keeps the name they typed before for next time.
              if (n) rememberName(n);
              setName(n);
            }}
          />
        ) : (
          <ArenaPractice name={name} onChangeName={() => setName(null)} />
        )}
        <div className="hidden sm:block">
          <ControlsHint />
        </div>
      </div>
    </div>
  );
}

function NameStep({ onGo }: { onGo: (name: string) => void }) {
  const [value, setValue] = useState(rememberedName);
  const clean = value.replace(/\s+/g, " ").trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) onGo(clean);
      }}
      className="mx-auto max-w-sm space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm"
    >
      <label className="block">
        <span className="mb-2 block text-lg font-bold">What should we call your duck?</span>
        <input
          autoFocus
          maxLength={MAX_NAME}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-center text-lg focus:border-neutral-600 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={!clean}
        className="w-full rounded-xl bg-amber-500 py-3.5 text-lg font-bold text-white shadow hover:brightness-110 disabled:opacity-40"
      >
        Let's waddle
      </button>
      <button type="button" onClick={() => onGo("")} className="text-sm text-neutral-500 underline">
        Surprise me with a duck name
      </button>
    </form>
  );
}
