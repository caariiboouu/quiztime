import { useState } from "react";
import type {
  ChoiceOption,
  PublicPlayer,
  PublicQna,
  PublicSegment,
  TeamStanding,
} from "../../shared/protocol";
import { ARROW, useControls, type Control } from "./controls";
import { DuckAvatar } from "./mascot/DuckAvatar";
import { useDuckLeader } from "./duckStore";
import { lookFor } from "./mascot/variants";

/**
 * Answer options mapped onto directions, so every answer is one keypress
 * from any cluster (WASD, arrows, numpad) or the top-row number keys.
 */
const LAYOUTS: Record<number, Control[]> = {
  2: ["left", "right"],
  3: ["left", "up", "right"],
  4: ["up", "left", "right", "down"],
};

const GRID_POS: Record<Control, string> = {
  up: "sm:col-start-2 sm:row-start-1",
  left: "sm:col-start-1 sm:row-start-2",
  right: "sm:col-start-3 sm:row-start-2",
  down: "sm:col-start-2 sm:row-start-3",
  action: "",
};

const OPTION_COLORS = [
  "bg-sky-600",
  "bg-amber-500",
  "bg-emerald-600",
  "bg-rose-600",
];

function directionsFor(count: number): Control[] {
  return LAYOUTS[count] ?? LAYOUTS[4];
}

type AnswerPadProps = {
  options: ChoiceOption[];
  selectedId: string | null;
  disabled?: boolean;
  /** After reveal: highlight right/wrong. */
  correctId?: string;
  distribution?: Record<string, number>;
  onPick?: (optionId: string) => void;
  size?: "md" | "lg";
};

export function AnswerPad({
  options,
  selectedId,
  disabled,
  correctId,
  distribution,
  onPick,
  size = "md",
}: AnswerPadProps) {
  const dirs = directionsFor(options.length);
  const pick = (i: number) => {
    const opt = options[i];
    if (opt && !disabled && onPick) onPick(opt.id);
  };
  useControls(
    {
      onControl: (c) => {
        const i = dirs.indexOf(c);
        if (i >= 0) pick(i);
      },
      onDigit: pick,
    },
    !disabled && !!onPick,
  );

  const total = distribution
    ? Object.values(distribution).reduce((s, n) => s + n, 0)
    : 0;

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((opt, i) => {
        const dir = dirs[i];
        const selected = selectedId === opt.id;
        const isCorrect = correctId !== undefined && opt.id === correctId;
        const isWrong = correctId !== undefined && selected && !isCorrect;
        const count = distribution?.[opt.id] ?? 0;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled || !onPick}
            onClick={() => pick(i)}
            aria-pressed={selected}
            aria-label={`${opt.text} (press ${ARROW[dir]} or ${i + 1})`}
            className={`relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center font-semibold text-white shadow-md transition ${GRID_POS[dir]} ${
              OPTION_COLORS[i]
            } ${size === "lg" ? "text-2xl" : "text-lg"} ${
              selected ? "ring-4 ring-neutral-900 ring-offset-2" : ""
            } ${correctId !== undefined && !isCorrect ? "opacity-40" : ""} ${
              isCorrect ? "ring-4 ring-emerald-300 ring-offset-2" : ""
            } ${disabled || !onPick ? "cursor-default" : "hover:brightness-110"}`}
          >
            <span className="absolute left-3 top-2 text-sm font-bold opacity-80">
              {ARROW[dir]} {i + 1}
            </span>
            <span className="px-4">{opt.text}</span>
            {isCorrect && <span className="text-sm">✓ correct</span>}
            {isWrong && <span className="text-sm">✗ your pick</span>}
            {distribution && (
              <span className="mt-1 w-full">
                <span className="block h-2 w-full overflow-hidden rounded bg-white/30">
                  <span
                    className="block h-full bg-white"
                    style={{ width: `${total ? (count / total) * 100 : 0}%` }}
                  />
                </span>
                <span className="text-xs font-medium">{count}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TimerBar({
  now,
  openedAt,
  closesAt,
}: {
  now: number;
  openedAt: number;
  closesAt: number | null;
}) {
  if (closesAt === null) return null;
  const total = Math.max(1, closesAt - openedAt);
  const left = Math.max(0, closesAt - now);
  const pct = (left / total) * 100;
  const secs = Math.ceil(left / 1000);
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${secs} seconds left`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            pct < 25 ? "bg-rose-500" : "bg-amber-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-lg font-bold tabular-nums text-neutral-700">
        {secs}
      </span>
    </div>
  );
}

export function Leaderboard({
  players,
  teams,
  teamMode,
  highlightId,
  limit = 10,
}: {
  players: PublicPlayer[];
  teams: TeamStanding[];
  teamMode: boolean;
  highlightId?: string;
  limit?: number;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const leader = useDuckLeader();
  const top = players.slice(0, limit);
  const me = highlightId ? players.findIndex((p) => p.id === highlightId) : -1;
  return (
    <div className={`grid gap-6 ${teamMode ? "md:grid-cols-[2fr_1fr]" : ""}`}>
      <ol className="space-y-2">
        {top.map((p, i) => (
          <PlayerRow
            key={p.id}
            rank={i + 1}
            player={p}
            team={p.teamId ? teamById.get(p.teamId) : undefined}
            highlight={p.id === highlightId}
            crowned={p.duckHolderId !== null && p.duckHolderId === leader}
          />
        ))}
        {me >= limit && (
          <PlayerRow
            rank={me + 1}
            player={players[me]}
            team={players[me].teamId ? teamById.get(players[me].teamId!) : undefined}
            highlight
            crowned={players[me].duckHolderId !== null && players[me].duckHolderId === leader}
          />
        )}
        {players.length === 0 && (
          <li className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-neutral-500">
            No players yet
          </li>
        )}
      </ol>
      {teamMode && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Teams (avg per member)
          </h3>
          <ol className="space-y-2">
            {teams.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3"
              >
                <span className="w-6 text-center font-semibold text-neutral-400">{i + 1}</span>
                <span className="h-4 w-4 rounded-full" style={{ background: t.color }} />
                <span className="flex-1 font-semibold">{t.name}</span>
                <span className="text-xs text-neutral-500">{t.members}👤</span>
                <span className="w-14 text-right font-bold tabular-nums">{t.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  rank,
  player,
  team,
  highlight,
  crowned,
}: {
  rank: number;
  player: PublicPlayer;
  team?: TeamStanding;
  highlight?: boolean;
  crowned?: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        highlight ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white"
      }`}
    >
      <span className="w-6 text-center font-semibold tabular-nums text-neutral-400">{rank}</span>
      <DuckAvatar
        look={lookFor(player.lookIndex, player.outfit)}
        crowned={crowned}
        size={rank <= 3 ? 48 : 40}
        label={`${player.name}'s duck`}
      />
      {team && (
        <span
          className="h-4 w-4 shrink-0 rounded-full"
          style={{ background: team.color }}
          title={team.name}
        />
      )}
      <span className={`flex-1 truncate font-semibold ${player.connected ? "" : "text-neutral-400"}`}>
        {player.name}
        {!player.connected && <span className="ml-2 text-xs font-normal">(offline)</span>}
      </span>
      <span className="w-16 text-right text-lg font-bold tabular-nums">{player.score}</span>
    </li>
  );
}

export function QnaList({
  items,
  onVote,
  renderExtra,
}: {
  items: PublicQna[];
  onVote?: (id: string) => void;
  renderExtra?: (item: PublicQna) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">No questions yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((q) => (
        <li
          key={q.id}
          className={`flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 ${
            q.answered ? "opacity-60" : ""
          }`}
        >
          <button
            type="button"
            disabled={!onVote}
            onClick={() => onVote?.(q.id)}
            aria-pressed={q.votedByMe}
            aria-label={`Upvote (${q.votes})`}
            className={`flex w-12 shrink-0 flex-col items-center rounded-md border px-2 py-1 text-sm font-semibold ${
              q.votedByMe
                ? "border-amber-500 bg-amber-100 text-amber-900"
                : "border-neutral-300 text-neutral-600"
            } ${onVote ? "hover:bg-amber-50" : "cursor-default"}`}
          >
            ▲<span className="tabular-nums">{q.votes}</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap break-words text-neutral-900">{q.text}</p>
            <p className="text-xs text-neutral-500">
              {q.author}
              {q.answered && " · answered"}
            </p>
          </div>
          {renderExtra?.(q)}
        </li>
      ))}
    </ul>
  );
}

export function QnaAsk({ onAsk }: { onAsk: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAsk(t);
    setText("");
  };
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={text}
        maxLength={280}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask the host a question…"
        aria-label="Ask the host a question"
        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        Ask
      </button>
    </div>
  );
}

export function Banner({
  kind,
  children,
  onDismiss,
}: {
  kind: "error" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm ${
        kind === "error" ? "bg-rose-100 text-rose-900" : "bg-sky-100 text-sky-900"
      }`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="font-semibold underline">
          Dismiss
        </button>
      )}
    </div>
  );
}

/** Lightning-round position and whether speed counts, shown above a question. */
export function SegmentBadges({ seg }: { seg: PublicSegment }) {
  const isChoice = seg.question?.type === "choice";
  if (!seg.round && !isChoice) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-semibold">
      {seg.round && (
        <span className="rounded-full bg-violet-600 px-3 py-1 text-white">
          ⚡ {seg.round.title} · {seg.round.index + 1}/{seg.round.count}
        </span>
      )}
      {isChoice &&
        (seg.speedScored ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
            Speed counts: faster correct answers score more
          </span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">
            No rush: accuracy only
          </span>
        ))}
    </div>
  );
}

/** Full-width "get ready" countdown before a lightning round starts. */
export function GetReady({ now, until, title }: { now: number; until: number; title: string }) {
  const n = Math.max(1, Math.ceil((until - now) / 1000));
  return (
    <div className="space-y-3 py-6 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-violet-600">Get ready</p>
      <h2 className="text-4xl font-black">⚡ {title}</h2>
      <p className="text-neutral-600">Quick-fire questions. Faster correct answers score more.</p>
      <div className="text-7xl font-black tabular-nums text-violet-600" aria-live="assertive">
        {n}
      </div>
    </div>
  );
}

export function NextIn({ now, at }: { now: number; at: number | null }) {
  if (at === null) return null;
  const n = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <p className="text-center text-sm font-semibold text-violet-700" aria-live="polite">
      Next question in {n}…
    </p>
  );
}

export function RoundTotals({
  title,
  totals,
  highlightId,
}: {
  title: string;
  totals: { playerId: string; name: string; points: number }[];
  highlightId?: string;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border-2 border-violet-300 bg-violet-50 p-5">
      <h3 className="mb-3 text-center text-lg font-black text-violet-900">⚡ {title}: results</h3>
      {totals.length === 0 ? (
        <p className="text-center text-neutral-600">No correct answers this round.</p>
      ) : (
        <ol className="space-y-1">
          {totals.slice(0, 8).map((t, i) => (
            <li
              key={t.playerId}
              className={`flex gap-3 rounded px-2 ${t.playerId === highlightId ? "bg-amber-100" : ""}`}
            >
              <span className="w-6 text-neutral-400">{i + 1}</span>
              <span className="flex-1 font-semibold">{t.name}</span>
              <span className="font-bold tabular-nums">+{t.points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
