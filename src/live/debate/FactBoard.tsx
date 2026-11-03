import type {
  DebatePresenting,
  DebateResult,
  DebateSide,
  PublicPlayer,
  RevealedFact,
} from "../../../shared/protocol";

type Names = { for: string; against: string };

const TONE: Record<DebateSide | "either", { pill: string; back: string; edge: string; text: string }> = {
  for: { pill: "bg-sky-600", back: "bg-sky-600", edge: "border-sky-300", text: "text-sky-800" },
  against: { pill: "bg-rose-600", back: "bg-rose-600", edge: "border-rose-300", text: "text-rose-800" },
  either: { pill: "bg-violet-600", back: "bg-violet-600", edge: "border-violet-300", text: "text-violet-800" },
};

function nameList(ids: string[], players: PublicPlayer[], meId?: string | null): string {
  const byId = new Map(players.map((p) => [p.id, p.name]));
  return ids.map((id) => (id === meId ? "you" : (byId.get(id) ?? "someone"))).join(", ");
}

/**
 * The hidden fact board, turned over. Each side's facts sit face down until
 * an argument read out uncovers one; it flips over with who found it and what
 * they said. At the result the rest turn over too ("Nobody found this one"),
 * under a banner for the side that won.
 */
export function FactBoard({
  facts,
  names,
  players,
  result,
  checked = true,
  meId,
  large,
}: {
  facts: RevealedFact[];
  names: Names;
  players: PublicPlayer[];
  /** Who won; left out while the arguments are still being read. */
  result?: DebateResult;
  /** False when nobody checked the facts (Jev was off and the host marked none). */
  checked?: boolean;
  meId?: string | null;
  /** The host's projected screen. */
  large?: boolean;
}) {
  const groups: { key: DebateSide | "either"; title: string; items: { fact: RevealedFact; i: number }[] }[] = [
    { key: "for", title: `${names.for}'s facts`, items: [] },
    { key: "against", title: `${names.against}'s facts`, items: [] },
    { key: "either", title: "Either side's", items: [] },
  ];
  facts.forEach((fact, i) => groups.find((g) => g.key === (fact.side ?? "either"))!.items.push({ fact, i }));

  return (
    <section className="space-y-4" aria-label="Fact board">
      {result && <ResultBanner result={result} names={names} large={large} />}
      {!checked && (
        <p className="text-center text-sm text-neutral-600">
          Nobody checked the facts this time, so none were uncovered.
        </p>
      )}
      <div className={`grid gap-4 ${groups[2].items.length ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.key} className="space-y-2">
              <h3 className={`text-sm font-bold uppercase tracking-wide ${TONE[g.key].text}`}>
                {g.title}{" "}
                <span className="font-normal normal-case text-neutral-500">
                  ({g.items.filter((x) => x.fact.uncoveredBy.length).length} of {g.items.length} uncovered)
                </span>
              </h3>
              <ul className="space-y-2">
                {g.items.map(({ fact, i }) => (
                  <FactCard
                    // A new key when it turns over, so the flip plays.
                    key={`${i}:${fact.hidden ? "down" : "up"}`}
                    fact={fact}
                    tone={TONE[g.key]}
                    players={players}
                    meId={meId}
                    checked={checked}
                    large={large}
                  />
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}

function FactCard({
  fact,
  tone,
  players,
  meId,
  checked,
  large,
}: {
  fact: RevealedFact;
  tone: (typeof TONE)[DebateSide];
  players: PublicPlayer[];
  meId?: string | null;
  checked: boolean;
  large?: boolean;
}) {
  if (fact.hidden) {
    return (
      <li
        aria-label="A hidden fact"
        className={`flex h-20 items-center justify-center rounded-xl text-4xl font-black text-white/90 shadow-inner ${tone.back} ${large ? "sm:h-24" : ""}`}
      >
        ?
      </li>
    );
  }
  const found = fact.uncoveredBy.length > 0;
  return (
    <li
      className={`animate-fact-flip rounded-xl border-2 p-3 shadow-sm ${
        found ? `${tone.edge} bg-white` : "border-dashed border-neutral-300 bg-neutral-50"
      }`}
    >
      <p className={`font-semibold leading-snug text-neutral-900 ${large ? "text-lg" : ""}`}>{fact.text}</p>
      {found ? (
        <>
          <p className="mt-1 text-sm font-semibold text-emerald-700">
            🔓 Uncovered by {nameList(fact.uncoveredBy, players, meId)}
          </p>
          {fact.quote && (
            <blockquote className="mt-1 line-clamp-3 border-l-2 border-neutral-200 pl-2 text-sm italic text-neutral-600">
              “{fact.quote.text}”
            </blockquote>
          )}
        </>
      ) : (
        checked && <p className="mt-1 text-sm text-neutral-500">Nobody found this one</p>
      )}
      {fact.bluffedBy.length > 0 && (
        <p className="mt-1 text-sm font-semibold text-rose-700">
          🚨 Contradicted by {nameList(fact.bluffedBy, players, meId)}
        </p>
      )}
    </li>
  );
}

function ResultBanner({ result, names, large }: { result: DebateResult; names: Names; large?: boolean }) {
  const { for: f, against: a } = result.facts;
  const share = (s: { uncovered: number; total: number }) => (s.total ? s.uncovered / s.total : 0);
  const onFacts = share(f) !== share(a);
  const winner = result.winner;
  const loser = winner && (winner === "for" ? "against" : "for");
  // A side nobody argued for loses whatever the facts say.
  const walkover = loser && result.argued?.[loser] === 0;
  return (
    <div
      className={`animate-fact-flip rounded-2xl p-4 text-center text-white shadow ${
        winner === "for" ? "bg-sky-600" : winner === "against" ? "bg-rose-600" : "bg-neutral-600"
      }`}
      aria-live="polite"
    >
      <p className={`font-black ${large ? "text-4xl" : "text-2xl"}`}>
        {winner ? `${names[winner]} wins!` : "It's a draw!"}
      </p>
      <p className="mt-1 opacity-90">
        {f.total + a.total > 0 &&
          `${names.for}: ${f.uncovered} of ${f.total} facts · ${names.against}: ${a.uncovered} of ${a.total}. `}
        {walkover && `Nobody argued ${names[loser]}. `}
        {winner && !walkover && !onFacts && "Level on facts, so the better arguments won it. "}
        {winner && result.bonus > 0 && `+${result.bonus} for everyone who argued ${names[winner]}.`}
        {!winner && result.bonus > 0 && "No bonus this time."}
      </p>
    </div>
  );
}

/**
 * The argument up now, big enough for the host to read out. It slides in
 * from its side's end of the floor, and says if it uncovered a fact or got
 * one wrong.
 */
export function ArgumentCard({
  presenting,
  names,
  players,
  checked = true,
  meId,
  large,
}: {
  presenting: DebatePresenting;
  names: Names;
  players: PublicPlayer[];
  checked?: boolean;
  meId?: string | null;
  large?: boolean;
}) {
  const { step, total, current } = presenting;
  const side = current.side;
  const who = current.playerId === meId ? "You" : nameList([current.playerId], players);
  const n = current.uncovered.length;
  const b = current.bluffed.length;
  return (
    <article
      key={step}
      className={`rounded-2xl border-4 bg-white p-5 shadow ${
        side === "for" ? "animate-slide-from-left border-sky-500" : "animate-slide-from-right border-rose-500"
      } ${large ? "sm:p-8" : ""}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-black text-white ${TONE[side].pill}`}>
          {side === "for" ? `← ${names.for}` : `${names.against} →`}
        </span>
        <span className={`font-bold ${large ? "text-2xl" : "text-lg"}`}>{who}</span>
        <span className="ml-auto text-sm text-neutral-500">
          Argument {step} of {total}
        </span>
      </div>
      <p
        className={`mt-3 whitespace-pre-wrap break-words leading-snug text-neutral-900 ${
          large ? "text-2xl sm:text-3xl" : "text-lg"
        }`}
      >
        {current.text}
      </p>
      {checked && (n > 0 || b > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {n > 0 && (
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-bold text-white">
              🔓 Uncovered {n === 1 ? "a fact" : `${n} facts`}!
            </span>
          )}
          {b > 0 && (
            <span className="rounded-full bg-rose-600 px-3 py-1 text-sm font-bold text-white">
              🚨 Bluff! That contradicts {b === 1 ? "a fact" : `${b} facts`}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
