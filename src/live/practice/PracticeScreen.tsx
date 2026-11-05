import { useEffect, useState } from "react";
import { MINIGAME_COUNTDOWN_SEC, type PublicSegment, type WatchView } from "../../../shared/protocol";
import { PRACTICE_CODE } from "../../../shared/practice";
import { HostArena, HostLobbyArena } from "../arena/ArenaViews";
import {
  AnswerPad,
  AnsweredCount,
  Banner,
  GetReady,
  Leaderboard,
  RoundTotals,
  SegmentBadges,
  TimerBar,
  TopAwards,
} from "../components";
import { DebatePanel } from "../debate/DebatePanel";
import { ArgumentCard, FactBoard } from "../debate/FactBoard";
import { debateNames } from "../debate/debateLayout";
import { duckHoursLeader } from "../mascot/duckChampion";
import { Mascot } from "../mascot/Mascot";
import { lookFor } from "../mascot/variants";
import { MINIGAMES } from "../minigames";
import { hasWebGL } from "../minigames/three/fallbackContext";
import { QuizPodium } from "../results";
import { useRoom, useServerNow, type ArenaFeed } from "../useRoom";

/**
 * #/live/test/screen: the practice room on a big screen, to watch the game
 * go by. It sees what every player sees (the arena, the debate floor, each
 * argument as it's read out, facts as they're turned over) and nobody's own
 * answer, and it can't do anything. Watching alone doesn't start a game:
 * someone joins at #/live/test for that.
 */
export function PracticeScreen({ onExit }: { onExit: () => void }) {
  // Keeps trying for as long as it's open, so it can be left up on a wall.
  const { view, status, offsetMs, arenaRef } = useRoom<WatchView>(PRACTICE_CODE, { watch: true });
  const link = `${window.location.origin}${import.meta.env.BASE_URL}#/live/test`;

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-sky-50 to-amber-50">
      <header className="border-b border-violet-200 bg-violet-50">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate font-black tracking-tight">{view?.title ?? "Debate & teams practice"}</h1>
            <p className="truncate text-sm text-neutral-600">
              Play along at <strong className="text-neutral-900">{link.replace(/^https?:\/\//, "")}</strong>
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {status === "reconnecting" && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Reconnecting…</span>
            )}
            <FullScreenButton />
            <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
              Back
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {!view ? (
          <p className="py-16 text-center text-neutral-500">Connecting…</p>
        ) : (
          <>
            {view.autopilot && !view.autopilot.judged && (
              <div className="mx-auto mb-6 max-w-3xl">
                <Banner kind="info">
                  Jev isn't judging right now, so every argument and written answer scores the middle.
                </Banner>
              </div>
            )}
            <ScreenStage view={view} offsetMs={offsetMs} link={link} feed={arenaRef} />
          </>
        )}
      </main>
    </div>
  );
}

/** For the projector: hide the browser around the game. */
function FullScreenButton() {
  const [full, setFull] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => void (full ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
      className="rounded-lg bg-white px-2.5 py-1 text-sm font-semibold shadow hover:bg-neutral-50"
    >
      {full ? "Exit full screen" : "⛶ Full screen"}
    </button>
  );
}

type StageProps = { view: WatchView; offsetMs: number; feed: { current: ArenaFeed } };

/** When the practice room moves itself on next. */
function NextUp({ at, offsetMs, what }: { at: number | null | undefined; offsetMs: number; what: string }) {
  const now = useServerNow(offsetMs);
  if (at == null) return null;
  const n = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <p className="text-center text-lg font-semibold text-violet-700" aria-live="polite">
      {what} in {n}…
    </p>
  );
}

function ScreenStage({ view, offsetMs, link, feed }: StageProps & { link: string }) {
  const nextAt = view.autopilot?.nextAt;

  if (view.phase === "lobby") {
    const people = view.players.filter((p) => !p.house);
    // House ducks count as connected, but they never walk the lobby.
    const anyoneHere = people.some((p) => p.connected);
    return (
      <div className="space-y-8 text-center">
        {anyoneHere && hasWebGL() ? (
          <HostLobbyArena players={view.players} settings={view.settings} feed={feed} />
        ) : (
          <Mascot animation="dance" size={220} />
        )}
        {view.settings.teamMode && view.teams.length >= 2 && (
          <div className="flex flex-wrap justify-center gap-3">
            {view.teams.map((t) => (
              <span
                key={t.id}
                className="rounded-full px-4 py-1.5 text-lg font-semibold text-white"
                style={{ background: t.color }}
              >
                {t.name}: {people.filter((p) => p.teamId === t.id).length}
              </span>
            ))}
          </div>
        )}
        <div>
          <p className="text-lg text-neutral-600">Join on your phone at</p>
          <p className="break-all text-2xl font-semibold text-neutral-900 sm:text-3xl">{link}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {people.map((p) => {
            const team = view.teams.find((t) => t.id === p.teamId);
            return (
              <span
                key={p.id}
                className={`flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-lg font-semibold ${p.connected ? "" : "opacity-40"}`}
              >
                {team && <span className="h-3 w-3 rounded-full" style={{ background: team.color }} />}
                {p.name}
              </span>
            );
          })}
        </div>
        {people.length === 0 ? (
          <p className="text-lg text-neutral-600">
            The game starts once someone joins. Four house ducks argue every debate too.
          </p>
        ) : (
          <NextUp at={nextAt} offsetMs={offsetMs} what={`${view.title} starts`} />
        )}
      </div>
    );
  }

  if (view.phase === "leaderboard" || view.phase === "ended") {
    const ended = view.phase === "ended";
    const top = view.players[0]?.score > 0 ? view.players[0] : null;
    const topCrowned = top?.duckHolderId != null && top.duckHolderId === duckHoursLeader();
    const [t1, t2] = view.teams;
    const teamLead = view.settings.teamMode && t1 && t1.score > 0 && (!t2 || t1.score > t2.score) ? t1 : null;
    return (
      <div className="space-y-8">
        <Mascot
          animation={ended ? "celebrate" : "waddle"}
          look={top ? lookFor(top.lookIndex, top.outfit) : undefined}
          crowned={topCrowned}
          size={190}
          className="-mb-6"
        />
        <h2 className="text-center text-4xl font-black">{ended ? "🏆 Final standings" : "Leaderboard"}</h2>
        {teamLead ? (
          <p className="-mt-6 text-center text-2xl font-bold" style={{ color: teamLead.color }}>
            {ended ? `${teamLead.name} win!` : `${teamLead.name} are in the lead`}
          </p>
        ) : (
          top && (
            <p className="-mt-6 text-center text-lg font-semibold text-neutral-600">
              {ended ? `${top.name} wins!` : `${top.name} is in the lead`}
            </p>
          )
        )}
        {ended && <QuizPodium players={view.players} />}
        <Leaderboard
          players={view.players}
          teams={view.teams}
          teamMode={view.settings.teamMode}
          teamScoring={view.settings.teamScoring}
        />
        <NextUp at={nextAt} offsetMs={offsetMs} what={ended ? "A new game" : "Next question"} />
      </div>
    );
  }

  const seg = view.segment;
  if (!seg) return null;
  return (
    <div className="space-y-5">
      <p className="text-center text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {seg.kind === "minigame" ? "Minigame" : "Question"} {seg.index + 1} of {seg.total}
      </p>
      {seg.kind === "minigame" ? (
        <ScreenMinigame seg={seg} offsetMs={offsetMs} />
      ) : (
        <ScreenQuestion key={seg.id} seg={seg} view={view} offsetMs={offsetMs} feed={feed} />
      )}
    </div>
  );
}

function ScreenQuestion({ seg, view, offsetMs, feed }: StageProps & { seg: PublicSegment }) {
  const now = useServerNow(offsetMs);
  const q = seg.question!;
  const revealed = seg.stage === "revealed";
  // A debate's arguments being read out: no points or winner yet.
  const presenting = revealed ? seg.reveal?.presenting : undefined;
  const nextAt = view.autopilot?.nextAt;

  if (seg.stage === "open" && seg.round && now < seg.answersOpenAt) {
    return <GetReady now={now} until={seg.answersOpenAt} title={seg.round.title} />;
  }

  if (seg.stage === "reading") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-8 text-center">
        <SegmentBadges seg={seg} />
        <h2 className="max-w-4xl text-4xl font-bold leading-snug sm:text-6xl">{q.prompt}</h2>
        <NextUp at={nextAt} offsetMs={offsetMs} what="The answers appear" />
      </div>
    );
  }

  const status =
    seg.stage === "closed"
      ? "Answers locked."
      : seg.stage === "judging"
        ? "Answers are in. Jev is reading them…"
        : seg.stage === "review"
          ? "Adding up the scores…"
          : null;

  return (
    <div className="space-y-6">
      <SegmentBadges seg={seg} />
      <h2 className="text-center text-3xl font-bold leading-snug sm:text-4xl">{q.prompt}</h2>
      {seg.stage === "open" && <TimerBar now={now} openedAt={seg.answersOpenAt} closesAt={seg.closesAt} />}

      {(q.type === "choice" || q.type === "poll") && q.arena && (
        <HostArena seg={seg} players={view.players} live={view.liveDistribution} options={q.options} feed={feed} />
      )}

      {(q.type === "choice" || q.type === "poll") && !q.arena && (
        <AnswerPad
          size="lg"
          options={q.options}
          selectedId={null}
          correctId={revealed ? seg.reveal?.correctId : undefined}
          distribution={revealed ? seg.reveal?.distribution : (view.liveDistribution ?? undefined)}
        />
      )}

      {q.type === "numeric" && revealed && seg.reveal?.answer !== undefined && (
        <p className="text-center text-3xl">
          Answer: <strong>{seg.reveal.answer}</strong> {seg.reveal.unit}
        </p>
      )}

      {q.type === "debate" && (
        <DebatePanel
          players={view.players}
          sides={seg.sides ?? {}}
          names={debateNames(q.sides)}
          levels={revealed ? seg.reveal?.levels : undefined}
          levelCount={seg.reveal?.levelCount}
          teams={view.settings.teamMode ? view.settings.teams : undefined}
          spotlightId={presenting?.current.playerId}
        />
      )}

      {presenting && q.type === "debate" && (
        <div className="mx-auto max-w-4xl space-y-2">
          <ArgumentCard
            presenting={presenting}
            names={debateNames(q.sides)}
            players={view.players}
            checked={seg.reveal?.factsChecked}
            large
          />
          <NextUp
            at={nextAt}
            offsetMs={offsetMs}
            what={presenting.step < presenting.total ? "Next argument" : "The result"}
          />
        </div>
      )}
      {q.type === "debate" && revealed && (seg.reveal?.facts?.length || seg.reveal?.debate) ? (
        <div className="mx-auto max-w-5xl">
          <FactBoard
            facts={seg.reveal.facts ?? []}
            names={debateNames(q.sides)}
            players={view.players}
            result={presenting ? undefined : seg.reveal.debate}
            checked={seg.reveal.factsChecked}
            large
          />
        </div>
      ) : null}

      {seg.stage === "open" && <AnsweredCount seg={seg} />}
      {status && (
        <p className="text-center text-lg text-neutral-600" aria-live="polite">
          {status}
        </p>
      )}

      {revealed && !presenting && (
        <>
          {seg.reveal?.factoid && (
            <p className="mx-auto max-w-2xl text-center text-lg text-neutral-700">💡 {seg.reveal.factoid}</p>
          )}
          {seg.reveal?.referenceAnswer && (
            <p className="mx-auto max-w-2xl text-center text-neutral-700">
              <span className="font-semibold">Model answer:</span> {seg.reveal.referenceAnswer}
            </p>
          )}
          {seg.reveal?.roundTotals && seg.round ? (
            <RoundTotals title={seg.round.title} totals={seg.reveal.roundTotals} />
          ) : (
            <TopAwards seg={seg} />
          )}
          <NextUp at={seg.advanceAt ?? nextAt} offsetMs={offsetMs} what="Moving on" />
        </>
      )}
    </div>
  );
}

function ScreenMinigame({ seg, offsetMs }: { seg: PublicSegment; offsetMs: number }) {
  const now = useServerNow(offsetMs);
  const mg = seg.minigame!;
  const def = MINIGAMES[mg.game];
  const startAt = seg.openedAt + MINIGAME_COUNTDOWN_SEC * 1000;
  const endAt = startAt + mg.durationSec * 1000;
  return (
    <div className="space-y-6 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-amber-600">Minigame!</p>
      <h2 className="text-5xl font-black">{def.name}</h2>
      <p className="text-xl text-neutral-700">{def.howTo}</p>
      {seg.stage === "open" &&
        (now < startAt ? (
          <p className="text-7xl font-black tabular-nums text-amber-500">{Math.ceil((startAt - now) / 1000)}</p>
        ) : (
          <TimerBar now={now} openedAt={startAt} closesAt={endAt} />
        ))}
      {seg.stage !== "revealed" && <AnsweredCount seg={seg} />}
      {seg.stage === "revealed" && <TopAwards seg={seg} />}
    </div>
  );
}
