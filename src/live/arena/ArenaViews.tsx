import { useMemo, useState } from "react";
import { arenaLayout, lobbyLayout, teamLobbyLayout } from "../../../shared/arena";
import type { HostView, PlayerView, PublicPlayer, PublicSegment, RoomSettings } from "../../../shared/protocol";
import { useDuckLeader } from "../duckStore";
import { lookFor } from "../mascot/variants";
import type { DuckOutfit } from "../../../shared/outfit";
import type { ArenaFeed } from "../useRoom";
import { ArenaControls } from "./ArenaControls";
import { TOUCH_CONTROLS_HEIGHT, useTouchScreen } from "./touch";
import { ArenaPanel } from "./ArenaPanel";
import type { ArenaMember } from "./ArenaScene";
import { ZONE_COLORS, zoneBadge } from "./colors";
import { networkSource } from "./source";
import type { ArenaMove } from "../../../shared/arenaSim";

type Options = { id: string; text: string }[];

/** Members for the arena, rebuilt only when someone joins or leaves. */
function useMembers(players: PublicPlayer[]): ArenaMember[] {
  const key = JSON.stringify(players.map((p) => [p.id, p.lookIndex, p.name, p.duckHolderId, p.outfit]));
  const leader = useDuckLeader();
  return useMemo(() => {
    type Row = [string, number, string, string | null, DuckOutfit | null];
    return (JSON.parse(key) as Row[]).map(([id, look, name, duck, outfit]) => ({
      id,
      name,
      look: lookFor(look, outfit),
      crowned: duck !== null && duck === leader,
    }));
  }, [key, leader]);
}

function useArena(seg: PublicSegment, options: Options, players: PublicPlayer[], feed: { current: ArenaFeed }) {
  const count = seg.arena?.players ?? players.length;
  const layout = useMemo(() => arenaLayout(options.length, count), [options.length, count]);
  const members = useMembers(players);
  const source = useMemo(() => networkSource(feed), [feed]);
  const correctId = seg.reveal?.correctId;
  const reveal = useMemo(
    () =>
      seg.stage === "revealed"
        ? { correctIndex: correctId ? options.findIndex((o) => o.id === correctId) : null }
        : null,
    [seg.stage, correctId, options],
  );
  return { layout, members, source, reveal };
}

/** A player's view of the arena: their duck ringed, and the controls to steer it. */
export function PlayerArena({
  seg,
  view,
  options,
  feed,
  onMove,
}: {
  seg: PublicSegment;
  view: PlayerView;
  options: Options;
  feed: { current: ArenaFeed };
  onMove: Parameters<typeof ArenaControls>[0]["onMove"];
}) {
  const { layout, members, source, reveal } = useArena(seg, options, view.players, feed);
  const open = seg.stage === "open";
  const mine = view.myAnswer && "optionId" in view.myAnswer ? view.myAnswer.optionId : null;
  const mineIndex = options.findIndex((o) => o.id === mine);
  const [overview, setOverview] = useState(false);
  const touch = useTouchScreen();
  return (
    <div className="space-y-3">
      <ArenaView
        onMove={open ? onMove : null}
        layout={layout}
        options={options}
        members={members}
        source={source}
        youId={view.me.id}
        reveal={reveal}
        // The reveal is best seen from above: everyone's ducks at once.
        overview={overview || seg.stage === "revealed"}
        onToggle={() => setOverview((v) => !v)}
        current={mineIndex >= 0 ? mineIndex : null}
      />
      <AnswerList options={options} layout={layout} current={mineIndex >= 0 ? mineIndex : null} reveal={reveal} />
      <p className="text-center text-lg font-semibold" aria-live="polite">
        {mineIndex >= 0 ? (
          <>
            You're standing on{" "}
            <span
              className="rounded-lg px-2 py-0.5 text-white"
              style={{ background: ZONE_COLORS[mineIndex % ZONE_COLORS.length] }}
            >
              {mineIndex + 1}. {options[mineIndex].text}
            </span>
          </>
        ) : open ? (
          "Walk your duck onto an answer."
        ) : (
          "Your duck stayed in the middle."
        )}
      </p>
      {open && !touch && <ArenaControls onMove={onMove} layout={layout} />}
    </div>
  );
}

/**
 * A player's arena: the camera follows their duck, with each answer pinned
 * to the screen edge in its direction until it comes into view; or the whole
 * arena if they prefer. On a touch screen the arena gets taller and the
 * controls sit over its bottom corners, like a handheld console (answer
 * cards keep clear of them); elsewhere the caller puts controls below.
 */
export function ArenaView({
  overview,
  onToggle,
  current,
  onMove,
  zoneLabel,
  ...panel
}: Parameters<typeof ArenaPanel>[0] & {
  overview: boolean;
  onToggle: () => void;
  current: number | null;
  /** While answers are open: steer (drawn here on touch screens). */
  onMove?: ((m: ArenaMove) => void) | null;
  zoneLabel?: string;
}) {
  const touch = useTouchScreen();
  const overlay = touch && Boolean(onMove);
  return (
    <div>
      <div className="relative">
        <ArenaPanel
          {...panel}
          follow={overview ? null : panel.youId}
          current={current}
          safeBottom={overlay ? TOUCH_CONTROLS_HEIGHT : 0}
          className={touch ? "h-[68svh] min-h-[420px] max-h-[760px]" : undefined}
        />
        {overlay && onMove && (
          <ArenaControls onMove={onMove} layout={panel.layout} overlay colors={panel.colors} zoneLabel={zoneLabel} />
        )}
      </div>
      {/* Below the canvas, so it never covers an answer pinned to the bottom edge. */}
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold shadow hover:bg-neutral-50"
        >
          {overview ? "📷 Follow my duck" : "🗺 Whole arena"}
        </button>
      </div>
    </div>
  );
}

/** The presenter's view: the whole arena, plus how many ducks stand on each answer. */
export function HostArena({
  view,
  options,
  feed,
}: {
  view: HostView;
  options: Options;
  feed: { current: ArenaFeed };
}) {
  const seg = view.segment!;
  const { layout, members, source, reveal } = useArena(seg, options, view.players, feed);
  const counts = seg.stage === "revealed" ? seg.reveal?.distribution : view.liveDistribution;
  return (
    <div className="space-y-3">
      <ArenaPanel
        layout={layout}
        options={options}
        members={members}
        source={source}
        reveal={reveal}
        className="mx-auto aspect-[16/10] max-w-4xl"
      />
      {counts && (
        <div className="flex flex-wrap justify-center gap-2">
          {options.map((o, i) => (
            <span
              key={o.id}
              className="rounded-full px-3 py-1 text-sm font-semibold text-white"
              style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }}
            >
              {i + 1}. {o.text}: {counts[o.id] ?? 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The answers in full, laid out like the arena (up, left, right, down), for
 * small screens where the cards over the arena only have room for a few words.
 */
export function AnswerList({
  options,
  layout,
  current,
  reveal,
}: {
  options: Options;
  layout: { zones: { index: number; angle: number }[] };
  current: number | null;
  reveal: { correctIndex: number | null } | null;
}) {
  // Order by direction: up first, then left, right, down.
  const order = [...layout.zones].sort((a, b) => {
    const rank = (ang: number) => {
      const up = Math.sin(ang);
      const right = Math.cos(ang);
      return up > 0.5 ? 0 : right < -0.5 ? 1 : right > 0.5 ? 2 : 3;
    };
    return rank(a.angle) - rank(b.angle);
  });
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:hidden">
      {order.map((z) => {
        const o = options[z.index];
        if (!o) return null;
        const color = ZONE_COLORS[z.index % ZONE_COLORS.length];
        const correct = reveal?.correctIndex === z.index;
        const dim = reveal != null && reveal.correctIndex !== null && !correct;
        return (
          <li
            key={o.id}
            className={`flex items-start gap-2 rounded-lg border-2 bg-white px-2 py-1.5 text-sm ${
              current === z.index ? "ring-2 ring-amber-400" : ""
            } ${dim ? "opacity-40" : ""}`}
            style={{ borderColor: color }}
          >
            <span className="shrink-0 rounded px-1.5 text-xs font-black text-white" style={{ background: color }}>
              {zoneBadge(z.index, z.angle)}
            </span>
            <span className="font-medium leading-snug">
              {correct && "✓ "}
              {o.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The lobby's ground: an open patch, or in team mode a corner per team
 * (standing in one puts you on that team). Matches the server's layout.
 */
function useLobby(settings: RoomSettings) {
  const teams = settings.teamMode ? settings.teams : [];
  const key = JSON.stringify(teams.map((t) => [t.id, t.name, t.color]));
  return useMemo(() => {
    const list = JSON.parse(key) as [string, string, string][];
    if (list.length < 2) return { layout: lobbyLayout(), options: [], colors: undefined };
    return {
      layout: teamLobbyLayout(list.length),
      options: list.map(([id, text]) => ({ id, text })),
      colors: list.map(([, , color]) => color),
    };
  }, [key]);
}

/**
 * The waiting room for a player: an open patch where everyone who's joined
 * waddles about, bumps and quacks, getting used to the controls before the
 * first question. In team mode each team has a corner: walk into one (or
 * press its number) to join that team. The camera follows your duck (or
 * shows the whole patch).
 */
export function PlayerLobby({
  view,
  feed,
  onMove,
}: {
  view: PlayerView;
  feed: { current: ArenaFeed };
  onMove: (m: ArenaMove) => void;
}) {
  const { layout, options, colors } = useLobby(view.settings);
  const members = useMembers(view.players);
  const source = useMemo(() => networkSource(feed), [feed]);
  const [overview, setOverview] = useState(false);
  const touch = useTouchScreen();
  const mine = options.findIndex((o) => o.id === view.me.teamId);
  return (
    <div className="space-y-3">
      <ArenaView
        layout={layout}
        options={options}
        colors={colors}
        members={members}
        source={source}
        youId={view.me.id}
        reveal={null}
        overview={overview}
        onToggle={() => setOverview((v) => !v)}
        current={mine >= 0 ? mine : null}
        onMove={onMove}
        zoneLabel="team"
      />
      {options.length > 0 && (
        <p className="text-center text-lg font-semibold" aria-live="polite">
          {mine >= 0 ? (
            <>
              You're on{" "}
              <span className="rounded-lg px-2 py-0.5 text-white" style={{ background: colors?.[mine] }}>
                {options[mine].text}
              </span>
              . Walk to another corner to switch.
            </>
          ) : (
            "Walk into a team's corner to join it (or press its number)."
          )}
        </p>
      )}
      {!touch && <ArenaControls onMove={onMove} layout={layout} colors={colors} zoneLabel="team" />}
    </div>
  );
}

/** The waiting room on the presenter's screen: everyone's ducks milling about. */
export function HostLobbyArena({
  players,
  settings,
  feed,
}: {
  players: PublicPlayer[];
  settings: RoomSettings;
  feed: { current: ArenaFeed };
}) {
  const { layout, options, colors } = useLobby(settings);
  const members = useMembers(players);
  const source = useMemo(() => networkSource(feed), [feed]);
  return (
    <ArenaPanel
      layout={layout}
      options={options}
      colors={colors}
      members={members}
      source={source}
      reveal={null}
      className="mx-auto aspect-[16/10] max-w-3xl"
    />
  );
}

