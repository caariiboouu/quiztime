import { useMemo } from "react";
import type { DebateSide, PublicPlayer, Team } from "../../../shared/protocol";
import { lookFor } from "../mascot/variants";
import SideStage from "../sideview/SideStage";
import { debateLayout } from "./debateLayout";

/**
 * The debate floor: everyone's duck, side-on. Pick a side and your duck hops
 * over to it; on the reveal the ducks rise on pedestals as tall as their
 * argument was good (the verdicts themselves aren't shown). Default export,
 * for lazy loading.
 */
export default function DebateStage({
  players,
  sides,
  names,
  levels,
  levelCount,
  meId = null,
  teams,
}: {
  players: PublicPlayer[];
  sides: Record<string, DebateSide>;
  names: { for: string; against: string };
  levels?: Record<string, number>;
  levelCount?: number;
  meId?: string | null;
  /** Team mode: tags wear their team's colour. */
  teams?: Team[];
}) {
  const ordered = useMemo(() => [...players].sort((a, b) => a.lookIndex - b.lookIndex), [players]);
  const placeKey = JSON.stringify([ordered.map((p) => [p.id, sides[p.id] ?? null]), levels ?? null, levelCount ?? 0]);
  const { platforms, homes, view } = useMemo(() => {
    const [rows, lv, n] = JSON.parse(placeKey) as [[string, DebateSide | null][], Record<string, number> | null, number];
    return debateLayout(
      rows.map(([id, side]) => ({ id, side })),
      lv ?? undefined,
      n,
    );
  }, [placeKey]);
  const duckKey = JSON.stringify(ordered.map((p) => [p.id, p.lookIndex, p.outfit]));
  const ducks = useMemo(
    () =>
      (JSON.parse(duckKey) as [string, number, PublicPlayer["outfit"]][]).map(([id, look, outfit]) => ({
        id,
        look: lookFor(look, outfit),
      })),
    [duckKey],
  );
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamOf = new Map((teams ?? []).map((t) => [t.id, t]));
  const count = (side: DebateSide) => players.filter((p) => sides[p.id] === side).length;

  return (
    <div className="relative overflow-hidden rounded-3xl shadow-inner">
      <SideStage
        platforms={platforms}
        ducks={ducks}
        homes={homes}
        view={view}
        meId={meId}
        walkShuffles
        background="#eef2f7"
        tagLabel={(id) => {
          const p = byId.get(id);
          const side = sides[id];
          return p ? `${p.name}${side ? `, ${side === "for" ? names.for : names.against}` : ", undecided"}` : "";
        }}
        renderTag={(id) => {
          const p = byId.get(id);
          if (!p) return null;
          const team = p.teamId ? teamOf.get(p.teamId) : undefined;
          return (
            <span
              className={`block max-w-[5.5rem] truncate rounded-md border-2 bg-white/90 px-1 py-px text-[10px] font-bold leading-tight text-neutral-900 shadow-sm sm:max-w-[8rem] sm:text-[13px] ${
                id === meId ? "ring-2 ring-amber-400" : ""
              }`}
              style={{ borderColor: team?.color ?? "rgba(255,255,255,0.7)" }}
            >
              {p.name}
            </span>
          );
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-2 sm:p-3">
        <SideSign label={names.for} count={count("for")} tone="bg-sky-600" arrow="←" />
        <SideSign label={names.against} count={count("against")} tone="bg-rose-600" arrow="→" right />
      </div>
    </div>
  );
}

function SideSign({ label, count, tone, arrow, right }: { label: string; count: number; tone: string; arrow: string; right?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black text-white shadow sm:text-lg ${tone}`}>
      {!right && <span aria-hidden>{arrow}</span>}
      {label}
      <span className="rounded-full bg-white/25 px-1.5 text-xs sm:text-sm">{count}</span>
      {right && <span aria-hidden>{arrow}</span>}
    </span>
  );
}
