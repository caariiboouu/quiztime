import { useEffect, useMemo, useRef, useState } from "react";
import type { DuckHoursData } from "../../types";
import { liveSeconds } from "../../../shared/duckStandings";
import { useDuckData, useDuckLeader } from "../duckStore";
import { MAX_NAME_LENGTH, PIN_RE, type Account, type AccountSession } from "../../../shared/protocol";
import {
  ApiError,
  createAccount,
  lastAccountId,
  listAccounts,
  loadSessions,
  loginAccount,
  saveSession,
} from "../api";
import { Banner } from "../components";

/** Someone you can be: a Duck Hours entry (claimed or not) or a newer player. */
type Person = {
  key: string;
  name: string;
  holderId: string | null;
  account: Account | null;
  leader: boolean;
};

type Step =
  | { kind: "list" }
  | { kind: "pin"; person: Person; account: Account }
  | { kind: "claim"; person: Person }
  | { kind: "new" };

/** Everyone on the Ceramic Duck Hours board, top of the standings first. */
function duckBoard(data: DuckHoursData): { id: string; initials: string }[] {
  const now = Date.now();
  return data.holders
    .filter((h) => h.initials.trim())
    .map((h) => ({ id: h.id, initials: h.initials.trim(), seconds: liveSeconds(data, h.id, now) }))
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * "Who are you?": pick yourself from the Ceramic Duck Hours leaderboard (or
 * add yourself as someone new) and enter your four-digit PIN, or set one the
 * first time. Devices remember who's signed in, so it's one tap next time.
 */
export function WhoAreYou({ onSignedIn }: { onSignedIn: (s: AccountSession) => void }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [filter, setFilter] = useState("");
  const duck = useDuckData();
  const leader = useDuckLeader();

  useEffect(() => {
    listAccounts().then(
      (r) => setAccounts(r.accounts),
      (err: Error) => setLoadError(err.message),
    );
  }, []);

  const people = useMemo<Person[]>(() => {
    if (!accounts) return [];
    const byHolder = new Map(accounts.filter((a) => a.holderId).map((a) => [a.holderId!, a]));
    const board = duckBoard(duck).map((h) => ({
      key: `h:${h.id}`,
      name: h.initials,
      holderId: h.id,
      account: byHolder.get(h.id) ?? null,
      leader: h.id === leader,
    }));
    const onBoard = new Set(board.map((p) => p.holderId));
    const others = accounts
      .filter((a) => !a.holderId || !onBoard.has(a.holderId))
      .map((a) => ({ key: `a:${a.id}`, name: a.name, holderId: a.holderId, account: a, leader: false }));
    return [...board, ...others];
  }, [accounts, duck, leader]);

  const saved = useMemo(() => {
    const sessions = loadSessions();
    const last = lastAccountId();
    return people
      .filter((p) => p.account && sessions[p.account.id])
      .sort((a, b) => (a.account!.id === last ? -1 : b.account!.id === last ? 1 : 0));
    // Re-read when the list loads.
  }, [people]);

  const pick = (p: Person) => {
    const session = p.account ? loadSessions()[p.account.id] : undefined;
    if (p.account && session) {
      onSignedIn({ account: p.account, token: session.token });
    } else if (p.account) {
      setStep({ kind: "pin", person: p, account: p.account });
    } else {
      setStep({ kind: "claim", person: p });
    }
  };

  if (loadError) return <Banner kind="error">{loadError}</Banner>;
  if (!accounts) return <p className="py-6 text-center text-neutral-500">Loading players…</p>;

  if (step.kind === "pin") {
    const reset = step.account.needsPin;
    return (
      <PinStep
        title={`Hi ${step.person.name}!`}
        prompt={reset ? "Your PIN was reset. Choose a new four-digit PIN." : "Enter your four-digit PIN."}
        confirm={reset}
        onBack={() => setStep({ kind: "list" })}
        onPin={async (pin) => {
          const s = await loginAccount(step.account.id, pin);
          saveSession(s);
          onSignedIn(s);
        }}
      />
    );
  }
  if (step.kind === "claim") {
    return (
      <PinStep
        title={`Hi ${step.person.name}!`}
        prompt="First time here: choose a four-digit PIN. You'll use it to be you on other devices."
        confirm
        onBack={() => setStep({ kind: "list" })}
        onPin={async (pin) => {
          const s = await createAccount({ name: step.person.name, holderId: step.person.holderId, pin });
          saveSession(s);
          onSignedIn(s);
        }}
      />
    );
  }
  if (step.kind === "new") {
    return (
      <NewPlayer
        taken={new Set(people.map((p) => p.name.toLowerCase()))}
        onBack={() => setStep({ kind: "list" })}
        onCreated={(s) => {
          saveSession(s);
          onSignedIn(s);
        }}
      />
    );
  }

  const q = filter.trim().toLowerCase();
  const shown = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  return (
    <div className="space-y-3">
      <h2 className="text-center text-xl font-bold">Who are you?</h2>
      {saved.length > 0 && !q && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">On this device</p>
          <PeopleList people={saved} onPick={pick} />
        </div>
      )}
      {people.length > 8 && (
        <input
          aria-label="Find your name"
          placeholder="Find your name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 focus:border-neutral-600 focus:outline-none"
        />
      )}
      <PeopleList people={shown} onPick={pick} />
      <button
        type="button"
        onClick={() => setStep({ kind: "new" })}
        className="w-full rounded-xl border-2 border-dashed border-neutral-300 bg-white py-3 font-semibold text-neutral-700 hover:border-neutral-500"
      >
        ＋ I'm new here
      </button>
    </div>
  );
}

/** A list of people; ↑/↓ move between them (one hand on the arrows is enough). */
function PeopleList({ people, onPick }: { people: Person[]; onPick: (p: Person) => void }) {
  const ref = useRef<HTMLUListElement>(null);
  const move = (e: React.KeyboardEvent, by: number) => {
    const buttons = [...(ref.current?.querySelectorAll("button") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, i + by))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  if (people.length === 0) return <p className="py-3 text-center text-sm text-neutral-500">Nobody by that name yet.</p>;
  return (
    <ul
      ref={ref}
      className="grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") move(e, 1);
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(e, -1);
      }}
    >
      {people.map((p) => (
        <li key={p.key}>
          <button
            type="button"
            onClick={() => onPick(p)}
            className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 bg-white px-3 py-2.5 text-left font-semibold hover:border-neutral-500 focus:border-neutral-900 focus:outline-none ${
              p.leader ? "border-amber-400" : "border-neutral-200"
            }`}
          >
            <span className="min-w-0 break-words leading-tight">
              {p.leader && "👑 "}
              {p.name}
            </span>
            <span className="shrink-0 text-xs font-normal text-neutral-400">
              {p.account ? (p.account.needsPin ? "new PIN" : "🔒") : "set PIN"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PinField({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4}"
        maxLength={4}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center font-mono text-3xl tracking-[0.6em] focus:border-neutral-600 focus:outline-none"
      />
    </label>
  );
}

function PinStep({
  title,
  prompt,
  confirm,
  onPin,
  onBack,
}: {
  title: string;
  prompt: string;
  /** Setting a new PIN: type it twice. */
  confirm?: boolean;
  onPin: (pin: string) => Promise<void>;
  onBack: () => void;
}) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = PIN_RE.test(pin) && (!confirm || again === pin);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) {
      if (confirm && PIN_RE.test(pin) && PIN_RE.test(again)) setError("Those PINs don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onPin(pin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setPin("");
      setAgain("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-neutral-600">{prompt}</p>
      </div>
      <PinField label={confirm ? "New PIN" : "PIN"} value={pin} onChange={setPin} autoFocus={!confirm} />
      {confirm && <PinField label="Same PIN again" value={again} onChange={setAgain} />}
      {error && <Banner kind="error">{error}</Banner>}
      <button
        type="submit"
        disabled={busy || !ready}
        className="w-full rounded-xl bg-amber-500 py-3.5 text-lg font-bold text-white shadow hover:brightness-110 disabled:opacity-40"
      >
        {busy ? "Checking…" : "That's me"}
      </button>
      <button type="button" onClick={onBack} className="w-full text-sm text-neutral-500 underline">
        Not you? Pick someone else
      </button>
    </form>
  );
}

function NewPlayer({
  taken,
  onCreated,
  onBack,
}: {
  taken: Set<string>;
  onCreated: (s: AccountSession) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const clean = name.replace(/\s+/g, " ").trim();
  const clash = taken.has(clean.toLowerCase());
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-neutral-700">Your name</span>
        <input
          autoFocus
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-lg focus:border-neutral-600 focus:outline-none"
        />
      </label>
      {clash && (
        <Banner kind="error">"{clean}" is already on the list. If that's you, go back and pick it.</Banner>
      )}
      {clean && !clash ? (
        <PinStep
          title={`Welcome, ${clean}!`}
          prompt="Choose a four-digit PIN. You'll use it to be you on other devices."
          confirm
          onBack={onBack}
          onPin={async (pin) => onCreated(await createAccount({ name: clean, holderId: null, pin }))}
        />
      ) : (
        <button type="button" onClick={onBack} className="w-full text-sm text-neutral-500 underline">
          Back to the list
        </button>
      )}
    </div>
  );
}
