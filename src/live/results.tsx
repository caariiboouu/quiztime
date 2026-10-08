import { useEffect, useMemo, useState } from "react";
import type { DuckHoursPreview, DuckHoursResult, PublicPlayer } from "../../shared/protocol";
import { liveSeconds } from "../../shared/duckStandings";
import { formatDuration, fractionLabel } from "../components/DuckHours";
import { refreshDuckData, useDuckData, useDuckLeader } from "./duckStore";
import { DuckAvatar } from "./mascot/DuckAvatar";
import { lookFor } from "./mascot/variants";

/** A rank as a rate: "holds the duck", "½×"… */
function rateLabel(rank: number | null): string {
  if (rank === 1) return "holds the duck";
  return rank ? `${fractionLabel(rank)} rate` : "benched";
}

/** This quiz's top three on a podium, each with their own duck. */
export function QuizPodium({ players }: { players: PublicPlayer[] }) {
  const leader = useDuckLeader();
  const top = players.slice(0, 3).filter((p) => p.score > 0);
  if (top.length === 0) return null;
  // 2nd, 1st, 3rd, like a real podium.
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const height = (i: number) => (i === 0 ? "h-24" : i === 1 ? "h-16" : "h-10");
  return (
    <ol className="mx-auto flex max-w-xl items-end justify-center gap-3" aria-label="Podium">
      {order.map((p) => {
        const place = top.indexOf(p);
        return (
          <li key={p.id} className="flex w-1/3 flex-col items-center text-center">
            <DuckAvatar
              look={lookFor(p.lookIndex, p.outfit)}
              crowned={p.duckHolderId !== null && p.duckHolderId === leader}
              size={place === 0 ? 96 : 76}
              label={`${p.name}'s duck`}
            />
            <p className="mt-1 max-w-full truncate font-bold">{p.name}</p>
            <p className="text-sm tabular-nums text-neutral-500">{p.score} pts</p>
            <div
              className={`mt-1 flex w-full items-start justify-center rounded-t-lg pt-1 text-xl font-black text-white ${height(place)} ${
                place === 0 ? "bg-amber-400" : place === 1 ? "bg-neutral-400" : "bg-amber-700/70"
              }`}
            >
              {place + 1}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Before the host applies them: the Duck Hours ranks this game would set. */
export function DuckHoursPreviewList({ preview }: { preview: DuckHoursPreview }) {
  return (
    <ol className="space-y-1.5">
      {preview.map((p) => (
        <li key={p.playerId} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
          <span className="w-6 text-center font-semibold tabular-nums text-neutral-400">{p.rank}</span>
          <span className="flex-1 truncate font-semibold">{p.name}</span>
          {p.isNew && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              new to the board
            </span>
          )}
          <span className="text-sm text-neutral-600">{p.rank === 1 ? "🦆 holds the duck" : rateLabel(p.rank)}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The Ceramic Duck Hours leaderboard, live from the server: total time
 * (ticking), who holds the duck, the 👑 leader, and this game's players
 * highlighted with their own ducks.
 */
export function DuckHoursStandings({
  players,
  result,
  meHolderId,
  limit = 12,
}: {
  /** This game's players (their ducks and highlights). */
  players: PublicPlayer[];
  result: DuckHoursResult | null;
  meHolderId?: string | null;
  limit?: number;
}) {
  // Fresh standings once the game's results have gone in.
  useEffect(() => {
    if (result) void refreshDuckData();
  }, [result]);
  const data = useDuckData();
  const leader = useDuckLeader();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const byHolder = useMemo(
    () => new Map(players.filter((p) => p.duckHolderId).map((p) => [p.duckHolderId!, p])),
    [players],
  );
  const ranked = [...data.holders].sort((a, b) => liveSeconds(data, b.id, now) - liveSeconds(data, a.id, now));
  // The top of the board, plus anyone from this game further down.
  const shown = ranked.filter((h, i) => i < limit || byHolder.has(h.id));
  return (
    <ol className="space-y-1.5">
      {shown.map((h) => {
        const player = byHolder.get(h.id);
        const place = ranked.indexOf(h) + 1;
        const me = meHolderId === h.id;
        return (
          <li
            key={h.id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
              me ? "border-amber-400 bg-amber-50" : player ? "border-sky-200 bg-sky-50" : "border-neutral-200 bg-white"
            }`}
          >
            <span className="w-6 text-center font-semibold tabular-nums text-neutral-400">{place}</span>
            {player ? (
              <DuckAvatar
                look={lookFor(player.lookIndex, player.outfit)}
                crowned={h.id === leader}
                size={36}
                label={`${player.name}'s duck`}
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100" aria-hidden>
                {h.id === leader ? "👑" : "🦆"}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {h.initials || "(no name)"}
                {h.id === leader && <span title="Most Ceramic Duck Hours"> 👑</span>}
              </span>
              <span className="text-xs text-neutral-500">
                {h.rank === 1 ? "🦆 holds the duck" : rateLabel(h.rank)}
                {player && " · played this game"}
              </span>
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {formatDuration(liveSeconds(data, h.id, now))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
