import { formatTokens, formatUsd, JEV_USD_PER_MTOK_INPUT, type JevSpend } from "../../../shared/jevCost";
import type { JevLedgerSummary } from "../../../shared/jevLedger";
import type { HostView } from "../../../shared/protocol";

/** What judging with Jev has cost: this question, the whole game, and all time. Host only. */
export function JevCostPanel({ view }: { view: HostView }) {
  const { question, game, allTime } = view.jevSpend;
  const price = Object.values(JEV_USD_PER_MTOK_INPUT)[0];
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Jev cost</h2>
      {!view.judgeConfigured && (
        <p className="text-sm text-amber-800">Jev isn't configured on this server, so nothing new will be judged.</p>
      )}
      <SpendBlock title="This question" spend={question} />
      <SpendBlock title="This game" spend={game} />
      <AllTime ledger={allTime} thisGame={view.jevSpend.gameKey} />
      <p className="text-xs text-neutral-500">
        Jev bills input tokens only (${price} per million); output tokens are free. Each written answer or argument is
        one call, and re-judging pays again. Counts every call Jev answered, as it reported them.
      </p>
    </div>
  );
}

function SpendBlock({ title, spend }: { title: string; spend: JevSpend | null }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-3">
      <h3 className="text-sm font-semibold text-neutral-600">{title}</h3>
      {!spend || spend.calls === 0 ? (
        <p className="mt-1 text-sm text-neutral-500">Nothing judged yet.</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-black tabular-nums">{formatUsd(spend.usd)}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
            <dt className="text-neutral-500">Calls</dt>
            <dd>{spend.calls}</dd>
            <dt className="text-neutral-500">Per call</dt>
            <dd>{spend.calls > spend.unpriced ? formatUsd(spend.usd / (spend.calls - spend.unpriced)) : "—"}</dd>
            <dt className="text-neutral-500">Input tokens</dt>
            <dd>{formatTokens(spend.inputTokens)}</dd>
            <dt className="text-neutral-500">Output tokens</dt>
            <dd>{formatTokens(spend.outputTokens)} (free)</dd>
          </dl>
          {spend.unpriced > 0 && (
            <p className="mt-2 text-xs text-amber-800">
              {spend.unpriced} {spend.unpriced === 1 ? "call has" : "calls have"} no price (Jev didn't report its
              tokens, or the model isn't in the price list), so the real total is a little higher.
            </p>
          )}
        </>
      )}
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Every game the server remembers, and the last few one by one. */
function AllTime({ ledger, thisGame }: { ledger: JevLedgerSummary | null; thisGame: string }) {
  if (!ledger) {
    return (
      <section className="rounded-lg border border-neutral-200 p-3">
        <h3 className="text-sm font-semibold text-neutral-600">All time</h3>
        <p className="mt-1 text-sm text-neutral-500">Loading…</p>
      </section>
    );
  }
  return (
    <>
      <SpendBlock
        title={
          ledger.since
            ? `All time: ${ledger.games} ${ledger.games === 1 ? "game" : "games"} since ${dateFormat.format(ledger.since)}`
            : "All time"
        }
        spend={ledger.total}
      />
      {ledger.recent.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-3">
          <h3 className="text-sm font-semibold text-neutral-600">Recent games</h3>
          <ul className="mt-1 divide-y divide-neutral-100 text-sm">
            {ledger.recent.map((g) => (
              <li key={g.key} className="flex items-baseline gap-2 py-1.5">
                <span className="w-24 shrink-0 text-neutral-500 tabular-nums">{dateFormat.format(g.startedAt)}</span>
                <span className="min-w-0 flex-1 truncate" title={g.title}>
                  {g.title}
                  {g.key === thisGame && <span className="ml-1 text-xs text-neutral-500">(this game)</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatUsd(g.spend.usd)}
                  {g.spend.unpriced > 0 ? "+" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
