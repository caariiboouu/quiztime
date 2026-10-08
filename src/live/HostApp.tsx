import { useState } from "react";
import sampleShow from "../data/liveSampleShow.json";
import { proposeDuckBonuses } from "../../shared/duckBonus";
import type {
  HostSubmission,
  HostView,
  RoomSettings,
  SavedShow,
  ScoringMode,
  Segment,
  Show,
  ShowSegment,
  Team,
} from "../../shared/protocol";
import { MINIGAME_COUNTDOWN_SEC } from "../../shared/protocol";
import {
  createRoom,
  joinLink,
  loadHostCreds,
  loadSavedShow,
  saveHostCreds,
  saveSavedShow,
  type HostCreds,
} from "./api";
import {
  AnswerPad,
  Banner,
  GetReady,
  Leaderboard,
  NextIn,
  QnaList,
  RoundTotals,
  SegmentBadges,
  TimerBar,
} from "./components";
import { useControls } from "./controls";
import { Mascot } from "./mascot/Mascot";
import { PinResets } from "./account/PinResets";
import { QuestionEditor } from "./host/QuestionEditor";
import { showProblems } from "./host/questionSet";
import { hasWebGL } from "./minigames/three/fallbackContext";
import { MINIGAMES } from "./minigames";
import { useRoom, useServerNow, type ArenaFeed } from "./useRoom";
import { HostArena, HostLobbyArena } from "./arena/ArenaViews";

const DEFAULT_TEAMS: Team[] = [
  { id: "mallards", name: "Mallards", color: "#16a34a" },
  { id: "rubber", name: "Rubber Duckies", color: "#eab308" },
  { id: "teals", name: "Teals", color: "#0891b2" },
  { id: "eiders", name: "Eiders", color: "#9333ea" },
];

export function HostApp({ onExit }: { onExit: () => void }) {
  const [creds, setCreds] = useState<HostCreds | null>(() => loadHostCreds());
  if (!creds) {
    return (
      <HostSetup
        onExit={onExit}
        onCreated={(c) => {
          saveHostCreds(c);
          setCreds(c);
        }}
      />
    );
  }
  return (
    <HostConsole
      creds={creds}
      onExit={onExit}
      onNewRoom={() => {
        saveHostCreds(null);
        setCreds(null);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function HostSetup({
  onCreated,
  onExit,
}: {
  onCreated: (c: HostCreds) => void;
  onExit: () => void;
}) {
  const [password, setPassword] = useState("");
  // The saved question set (from the server) and the copy being edited.
  const [saved, setSaved] = useState<SavedShow | null>(null);
  const [draft, setDraft] = useState<Show>(sampleShow as Show);
  const [teamMode, setTeamMode] = useState(false);
  const [teams, setTeams] = useState<Team[]>(DEFAULT_TEAMS);
  const [choiceScoring, setChoiceScoring] = useState<ScoringMode>("accuracy");
  const [speedBonusMax, setSpeedBonusMax] = useState(50);
  const [arena, setArena] = useState(true);
  const [busy, setBusy] = useState<"unlock" | "save" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.show);
  const problems = showProblems(draft);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("unlock");
    setError(null);
    try {
      const res = await loadSavedShow(password);
      setSaved(res);
      // Nothing saved yet: start from the sample.
      setDraft(res.show ?? (sampleShow as Show));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** Save the edited set; returns it, or null if the server refused. */
  const saveDraft = async (): Promise<Show | null> => {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const res = await saveSavedShow(password, draft);
      setSaved(res);
      setNotice("Saved. Every new game starts with these questions.");
      return res.show;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (file: File) => {
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as Show;
      if (!parsed?.title || !Array.isArray(parsed.segments)) {
        throw new Error("That file isn't a show (needs a title and segments).");
      }
      setDraft(parsed);
      setNotice(`Loaded ${file.name}. Save to use it for every new game.`);
    } catch (err) {
      setError(err instanceof SyntaxError ? "That file isn't valid JSON." : (err as Error).message);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "questions"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A game always starts from the saved set: save any edits first.
    const show = dirty ? await saveDraft() : saved?.show;
    if (!show) return;
    setBusy("create");
    setError(null);
    const settings: RoomSettings = {
      teamMode,
      teams: teamMode ? teams : [],
      choiceScoring,
      speedBonusMax,
      arena,
    };
    try {
      const res = await createRoom({ password, show, settings });
      onCreated({ code: res.code, hostKey: res.hostKey });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
      <h1 className="text-xl font-semibold">Host a live quiz</h1>
      <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
        Back
      </button>
    </header>
  );

  // Everything here (answers included) is behind the host password.
  if (!saved) {
    return (
      <div className="min-h-full bg-neutral-50">
        {header}
        <form onSubmit={unlock} className="mx-auto max-w-sm space-y-4 px-6 py-12">
          <label className="block">
            <span className="mb-1 block text-lg font-semibold">Host password</span>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
          {error && <Banner kind="error">{error}</Banner>}
          <button
            type="submit"
            disabled={busy !== null || !password}
            className="w-full rounded-xl bg-neutral-900 py-3 font-bold text-white disabled:opacity-40"
          >
            {busy === "unlock" ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neutral-50">
      {header}
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8 px-6 py-8">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Questions</h2>
            <p className={`text-sm ${dirty ? "font-semibold text-amber-700" : "text-neutral-500"}`}>
              {dirty
                ? "Unsaved changes"
                : saved.updatedAt
                  ? `Saved ${new Date(saved.updatedAt).toLocaleString()}`
                  : "Not saved yet"}
            </p>
          </div>
          <p className="text-sm text-neutral-600">
            Every game you start uses this set until you change it.
          </p>
          <QuestionEditor show={draft} onChange={setDraft} label={segmentLabel} />
          {dirty && problems.length > 0 && (
            <ul className="list-inside list-disc text-sm text-amber-800">
              {problems.slice(0, 5).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={!dirty || problems.length > 0 || busy !== null}
              className="rounded-md bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-40"
            >
              {busy === "save" ? "Saving…" : "Save questions"}
            </button>
            {dirty && saved.show && (
              <button type="button" onClick={() => setDraft(saved.show!)} className="text-neutral-600 underline">
                Discard changes
              </button>
            )}
            <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium hover:bg-neutral-100">
              Import a show file…
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
              />
            </label>
            <button type="button" onClick={download} className="text-neutral-600 underline">
              Download a backup
            </button>
          </div>
          {notice && !dirty && <Banner kind="info">{notice}</Banner>}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Answer arena</h2>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={arena}
              onChange={(e) => setArena(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong>Walk to answer</strong>: multiple-choice questions and polls are played in
              the arena. Each one starts with just the question on screen for you to read out;
              press <em>Show the answers</em> to open the arena. Players walk their ducks onto an
              answer before time runs out.
            </span>
          </label>
          <p className="text-xs text-neutral-500">
            A question in the show file can opt out with <code>"arena": false</code>. Lightning
            rounds are always tap-to-answer, and number and written questions are typed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Scoring</h2>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 text-neutral-700">Multiple-choice questions</legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="scoring"
                checked={choiceScoring === "accuracy"}
                onChange={() => setChoiceScoring("accuracy")}
                className="mt-1"
              />
              <span>
                <strong>Accuracy only</strong>: a correct answer earns its points however long it
                took. Like Slido.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="scoring"
                checked={choiceScoring === "speed"}
                onChange={() => setChoiceScoring("speed")}
                className="mt-1"
              />
              <span>
                <strong>Speed counts</strong>: correct answers also earn up to{" "}
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={speedBonusMax}
                  aria-label="Max speed bonus"
                  onChange={(e) => setSpeedBonusMax(Math.max(0, Number(e.target.value) || 0))}
                  className="w-20 rounded-md border border-neutral-300 px-2 py-0.5"
                />{" "}
                bonus points for answering sooner.
              </span>
            </label>
          </fieldset>
          <p className="text-xs text-neutral-500">
            A question in the show file can override this with <code>"scoring"</code>. Lightning
            rounds always count speed. Speed is only ever scored on multiple choice, where every
            answer is a single keypress; never on typed or written answers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Teams</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={teamMode}
              onChange={(e) => setTeamMode(e.target.checked)}
            />
            Play in teams (team score = average per member)
          </label>
          {teamMode && (
            <div className="space-y-2">
              {teams.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={t.color}
                    aria-label={`${t.name} color`}
                    onChange={(e) =>
                      setTeams(teams.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))
                    }
                    className="h-9 w-12 rounded border border-neutral-300"
                  />
                  <input
                    value={t.name}
                    maxLength={24}
                    aria-label="Team name"
                    onChange={(e) =>
                      setTeams(teams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5"
                  />
                  <button
                    type="button"
                    disabled={teams.length <= 2}
                    onClick={() => setTeams(teams.filter((_, j) => j !== i))}
                    className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {teams.length < 8 && (
                <button
                  type="button"
                  onClick={() =>
                    setTeams([
                      ...teams,
                      { id: `team-${Date.now().toString(36)}`, name: `Team ${teams.length + 1}`, color: "#64748b" },
                    ])
                  }
                  className="text-sm font-medium text-neutral-700 underline"
                >
                  + Add team
                </button>
              )}
            </div>
          )}
        </section>

        {error && <Banner kind="error">{error}</Banner>}

        <button
          type="submit"
          disabled={busy !== null || problems.length > 0}
          className="w-full rounded-xl bg-amber-500 py-4 text-lg font-bold text-white shadow hover:brightness-110 disabled:opacity-40"
        >
          {busy === "create" ? "Creating…" : dirty ? "Save questions and create room" : "Create room"}
        </button>
      </form>
      <div className="mx-auto max-w-2xl px-6 pb-10">
        <PinResets password={password} />
      </div>
    </div>
  );
}

function segmentLabel(s: ShowSegment): string {
  if (s.kind === "minigame") return `🎮 ${MINIGAMES[s.game]?.name ?? s.game}`;
  if (s.kind === "lightning") {
    return `⚡ ${s.title ?? "Lightning round"}: ${s.questions.length} questions, ${s.timeLimitSec}s each`;
  }
  const icon = { choice: "🔘", numeric: "🔢", written: "✍️", poll: "📊" }[s.question.type];
  return `${icon} ${s.question.prompt}`;
}

// ---------------------------------------------------------------------------
// Console (also the presenter screen)
// ---------------------------------------------------------------------------

function HostConsole({
  creds,
  onExit,
  onNewRoom,
}: {
  creds: HostCreds;
  onExit: () => void;
  onNewRoom: () => void;
}) {
  const { view, status, error, clearError, send, offsetMs, arenaRef } = useRoom<HostView>(creds.code, {
    host: creds.hostKey,
  });
  const [panel, setPanel] = useState<"none" | "players" | "qna">("none");
  const [copied, setCopied] = useState(false);

  // Peeking applies to one question stage only, so moving on hides it again.
  const segKey = view?.segment ? `${view.segment.id}:${view.segment.stage}` : "";
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const peek = peekKey === segKey;
  const setPeek = (on: boolean) => setPeekKey(on ? segKey : null);

  const next = nextAction(view);
  useControls(
    { onControl: (c) => (c === "action" || c === "right") && next && send({ t: "advance" }) },
    !!next && panel === "none",
  );

  if (status === "gone" || status === "rejected") {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-sm space-y-4 text-center">
          <p>Room {creds.code} is no longer available.</p>
          <button
            type="button"
            onClick={onNewRoom}
            className="rounded-lg bg-neutral-900 px-4 py-2 font-semibold text-white"
          >
            Set up a new room
          </button>
        </div>
      </div>
    );
  }
  if (!view) {
    return <p className="p-10 text-center text-neutral-500">Connecting to room {creds.code}…</p>;
  }

  const link = joinLink(view.code);
  const online = view.players.filter((p) => p.connected).length;
  const openQna = view.qna.filter((q) => !q.answered && !q.hidden).length;

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-sky-50 to-amber-50">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-neutral-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">{view.title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">Code</span>
          <span className="rounded-lg bg-neutral-900 px-3 py-1 font-mono text-2xl font-bold tracking-[0.3em] text-white">
            {view.code}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // Clipboard blocked; the link is visible on the lobby screen.
              }
            }}
            className="text-sm text-neutral-600 underline"
          >
            {copied ? "Copied!" : "Copy join link"}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPanel(panel === "players" ? "none" : "players")}
            className={`rounded-md border px-3 py-1.5 ${panel === "players" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}
          >
            👤 {online}/{view.players.length}
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "qna" ? "none" : "qna")}
            className={`rounded-md border px-3 py-1.5 ${panel === "qna" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}
          >
            💬 Q&amp;A{openQna ? ` (${openQna})` : ""}
          </button>
          {status !== "open" && (
            <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">Reconnecting…</span>
          )}
        </div>
      </header>

      {error && (
        <div className="px-6 pt-3">
          <Banner kind="error" onDismiss={clearError}>
            {error}
          </Banner>
        </div>
      )}

      <div className="flex flex-1">
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
          <HostStage view={view} send={send} offsetMs={offsetMs} peek={peek} link={link} feed={arenaRef} />
        </main>
        {panel !== "none" && (
          <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-4">
            {panel === "players" ? (
              <PlayersPanel view={view} onKick={(id) => send({ t: "kick", playerId: id })} />
            ) : (
              <QnaPanel view={view} send={send} />
            )}
          </aside>
        )}
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-white px-6 py-3">
        <span className="text-sm text-neutral-500">
          {view.segment ? `${view.segment.index + 1} / ${view.segment.total}` : `0 / ${view.segments.length}`}
        </span>
        {view.segment?.kind === "question" && view.segment.stage !== "revealed" && (
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={peek} onChange={(e) => setPeek(e.target.checked)} />
            Peek at answer (visible if you're sharing your screen)
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          {view.phase === "segment" && (
            <button
              type="button"
              onClick={() => send({ t: "showLeaderboard" })}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              Leaderboard
            </button>
          )}
          {view.phase !== "ended" ? (
            <button
              type="button"
              onClick={() => {
                if (confirm("End the game now? Final standings will be shown.")) send({ t: "end" });
              }}
              className="rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
            >
              End game
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onNewRoom}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
              >
                New room
              </button>
              <button type="button" onClick={onExit} className="rounded-lg px-3 py-2 text-sm text-neutral-500">
                Exit
              </button>
            </>
          )}
          {next && (
            <button
              type="button"
              onClick={() => send({ t: "advance" })}
              className="rounded-lg bg-amber-500 px-6 py-2 text-lg font-bold text-white shadow hover:brightness-110"
            >
              {next} <span className="text-sm font-normal opacity-80">(Space)</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/** Label for the host's main button, or null if there's nothing to advance. */
function nextAction(view: HostView | null): string | null {
  if (!view) return null;
  const seg = view.segment;
  const isLast = seg ? seg.index + 1 >= seg.total : false;
  switch (view.phase) {
    case "lobby":
      return "Start game";
    case "ended":
      return null;
    case "leaderboard":
      if (seg && seg.stage !== "revealed") return "Back to question";
      return isLast ? "Finish" : "Next";
    case "segment":
      switch (seg?.stage) {
        case "reading":
          return "Show the answers";
        case "open":
          return seg.kind === "minigame" ? "End round" : "Lock answers";
        case "closed":
          return "Reveal";
        case "judging":
          return "Skip to review";
        case "review":
          return "Reveal scores";
        case "revealed":
          if (seg.advanceAt !== null) return "Next now";
          return isLast ? "Finish" : "Next";
      }
  }
  return null;
}

type Send = ReturnType<typeof useRoom>["send"];

function HostStage({
  view,
  send,
  offsetMs,
  peek,
  link,
  feed,
}: {
  view: HostView;
  send: Send;
  offsetMs: number;
  peek: boolean;
  link: string;
  feed: { current: ArenaFeed };
}) {
  if (view.phase === "lobby") {
    return (
      <div className="space-y-8 text-center">
        <LobbyArea players={view.players} feed={feed} />
        <div>
          <p className="text-lg text-neutral-600">Join at</p>
          <p className="break-all text-2xl font-semibold text-neutral-900">{link}</p>
          <p className="mt-4 text-lg text-neutral-600">or enter code</p>
          <p className="font-mono text-7xl font-black tracking-[0.3em]">{view.code}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {view.players.map((p) => {
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
          {view.players.length === 0 && <p className="text-neutral-500">Waiting for players…</p>}
        </div>
      </div>
    );
  }

  if (view.phase === "leaderboard" || view.phase === "ended") {
    return (
      <div className="space-y-8">
        <Mascot animation={view.phase === "ended" ? "celebrate" : "waddle"} size={190} className="-mb-6" />
        <h2 className="text-center text-4xl font-black">
          {view.phase === "ended" ? "🏆 Final standings" : "Leaderboard"}
        </h2>
        <Leaderboard players={view.players} teams={view.teams} teamMode={view.settings.teamMode} />
        {view.phase === "ended" && <DuckBonusPanel view={view} />}
      </div>
    );
  }

  const seg = view.segment;
  const full = view.fullSegment;
  if (!seg || !full) return null;
  return full.kind === "minigame" ? (
    <HostMinigame view={view} offsetMs={offsetMs} />
  ) : (
    <HostQuestion view={view} send={send} offsetMs={offsetMs} peek={peek} feed={feed} />
  );
}

function AnsweredCount({ view }: { view: HostView }) {
  const seg = view.segment!;
  return (
    <p className="text-center text-lg text-neutral-600" aria-live="polite">
      <strong className="text-2xl tabular-nums text-neutral-900">{seg.answeredCount}</strong> /{" "}
      {seg.eligibleCount} answered
    </p>
  );
}

function TopAwards({ view }: { view: HostView }) {
  const awards = view.segment?.reveal?.awards ?? [];
  if (awards.length === 0) return null;
  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Top this round
      </h3>
      <ol className="space-y-1">
        {awards.slice(0, 5).map((a, i) => (
          <li key={a.playerId} className="flex gap-3">
            <span className="w-6 text-neutral-400">{i + 1}</span>
            <span className="flex-1 font-semibold">{a.name}</span>
            {a.detail && <span className="text-sm text-neutral-500">{a.detail}</span>}
            <span className="w-16 text-right font-bold tabular-nums">+{a.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HostQuestion({
  view,
  send,
  offsetMs,
  peek,
  feed,
}: {
  view: HostView;
  send: Send;
  offsetMs: number;
  peek: boolean;
  feed: { current: ArenaFeed };
}) {
  const now = useServerNow(offsetMs);
  const seg = view.segment!;
  const full = view.fullSegment as Extract<Segment, { kind: "question" }>;
  const q = full.question;
  const revealed = seg.stage === "revealed";
  const showAnswer = revealed || peek;

  if (seg.stage === "open" && now < seg.answersOpenAt && seg.round) {
    return <GetReady now={now} until={seg.answersOpenAt} title={seg.round.title} />;
  }

  // Just the question, big, for the host to read out. Next opens the arena.
  if (seg.stage === "reading") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-8 text-center">
        <SegmentBadges seg={seg} />
        <h2 className="max-w-4xl text-4xl font-bold leading-snug sm:text-6xl">{q.prompt}</h2>
        <p className="text-lg text-neutral-500">
          Read it out, then press <strong>Show the answers</strong> to open the arena.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SegmentBadges seg={seg} />
      <h2 className="text-center text-3xl font-bold leading-snug sm:text-4xl">{q.prompt}</h2>
      {seg.stage === "open" && (
        <TimerBar now={now} openedAt={seg.answersOpenAt} closesAt={seg.closesAt} />
      )}

      {(q.type === "choice" || q.type === "poll") && q.arena && (
        <HostArena view={view} options={q.options} feed={feed} />
      )}

      {(q.type === "choice" || q.type === "poll") && !q.arena && (
        <AnswerPad
          size="lg"
          options={q.options}
          selectedId={null}
          correctId={showAnswer && q.type === "choice" ? q.correctId : undefined}
          // Polls show live results as votes come in, like Slido.
          distribution={revealed ? seg.reveal?.distribution : (view.liveDistribution ?? undefined)}
        />
      )}

      {q.type === "numeric" && showAnswer && (
        <p className="text-center text-3xl">
          Answer: <strong>{q.answer}</strong> {q.unit}
        </p>
      )}

      {seg.stage === "open" && <AnsweredCount view={view} />}
      {seg.stage === "closed" && <p className="text-center text-neutral-600">Answers locked.</p>}

      {q.type === "written" && (seg.stage === "judging" || seg.stage === "review") && (
        <WrittenReview view={view} send={send} />
      )}

      {revealed && (
        <>
          {q.type !== "poll" && "factoid" in q && q.factoid && (
            <p className="mx-auto max-w-2xl text-center text-lg text-neutral-700">💡 {q.factoid}</p>
          )}
          {q.type === "written" && q.referenceAnswer && (
            <p className="mx-auto max-w-2xl text-center text-neutral-700">
              <span className="font-semibold">Model answer:</span> {q.referenceAnswer}
            </p>
          )}
          {seg.reveal?.roundTotals && seg.round ? (
            <RoundTotals title={seg.round.title} totals={seg.reveal.roundTotals} />
          ) : (
            <TopAwards view={view} />
          )}
          <NextIn now={now} at={seg.advanceAt} />
        </>
      )}
    </div>
  );
}

function WrittenReview({ view, send }: { view: HostView; send: Send }) {
  const seg = view.segment!;
  const full = view.fullSegment as Extract<Segment, { kind: "question" }>;
  const max = "points" in full.question ? full.question.points : 0;
  const subs = view.submissions.filter((s) => s.value.type === "written");
  const judged = subs.filter((s) => s.judge).length;
  const judging = seg.stage === "judging";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-neutral-700">
          {judging
            ? `Jev is judging… ${judged} / ${subs.length}`
            : view.judgeConfigured
              ? "Check Jev's suggestions, adjust anything that looks off, then reveal."
              : "Jev isn't configured on the server, so score these by hand."}
        </p>
        {!judging && view.judgeConfigured && (
          <button
            type="button"
            onClick={() => send({ t: "rejudge" })}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Re-judge all
          </button>
        )}
      </div>
      <p className="text-xs text-amber-800">
        Answers and scores below are visible to anyone watching your screen.
      </p>
      <ul className="space-y-3">
        {subs.map((s) => (
          <ReviewRow key={s.playerId} sub={s} max={max} disabled={judging} send={send} />
        ))}
        {subs.length === 0 && <li className="text-neutral-500">Nobody answered.</li>}
      </ul>
    </div>
  );
}

function ReviewRow({
  sub,
  max,
  disabled,
  send,
}: {
  sub: HostSubmission;
  max: number;
  disabled: boolean;
  send: Send;
}) {
  const j = sub.judge;
  const current = sub.finalPoints ?? j?.suggestedPoints ?? 0;
  // Only holds text while the host is typing; otherwise show the live value.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (n: number) => {
    const pts = Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : current;
    setDraft(null);
    if (pts !== current || sub.finalPoints === undefined) {
      send({ t: "setFinalPoints", playerId: sub.playerId, points: pts });
    }
  };
  const text = sub.value.type === "written" ? sub.value.text : "";

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{sub.name}</p>
          <p className="whitespace-pre-wrap break-words text-neutral-800">{text || <em>(blank)</em>}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={max}
            value={draft ?? String(current)}
            disabled={disabled}
            aria-label={`Points for ${sub.name}`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== null && commit(Number(draft))}
            onKeyDown={(e) => e.key === "Enter" && draft !== null && commit(Number(draft))}
            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-right text-lg font-bold tabular-nums"
          />
          <span className="text-sm text-neutral-500">/ {max}</span>
        </div>
      </div>
      {j && (
        <div className="mt-2 space-y-1 text-sm">
          {j.status === "ok" && (
            <p className="text-neutral-600">
              Jev suggests <strong>{j.suggestedPoints}</strong>
              {j.quality !== undefined && ` · quality ${j.quality.toFixed(1)}/4`}
              {j.qualityConfidence !== undefined && ` (confidence ${Math.round(j.qualityConfidence * 100)}%)`}
              {sub.finalPoints !== undefined && sub.finalPoints !== j.suggestedPoints && " · adjusted by you"}
            </p>
          )}
          {j.criteria.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {j.criteria.map((c) => (
                <li
                  key={c.text}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    c.p >= 0.7
                      ? "bg-emerald-100 text-emerald-900"
                      : c.p <= 0.3
                        ? "bg-neutral-100 text-neutral-500 line-through"
                        : "bg-amber-100 text-amber-900"
                  }`}
                  title={`${Math.round(c.p * 100)}%`}
                >
                  {c.text} · {Math.round(c.p * 100)}%
                </li>
              ))}
            </ul>
          )}
          {j.flags.map((f) => (
            <p key={f} className="text-amber-800">
              ⚠ {f}
            </p>
          ))}
          {j.error && <p className="text-xs text-rose-700">{j.error}</p>}
        </div>
      )}
      {!disabled && (
        <div className="mt-2 flex gap-2 text-xs">
          <button type="button" onClick={() => commit(0)} className="rounded border px-2 py-0.5 hover:bg-neutral-100">
            0
          </button>
          {j?.status === "ok" && (
            <button
              type="button"
              onClick={() => commit(j.suggestedPoints)}
              className="rounded border px-2 py-0.5 hover:bg-neutral-100"
            >
              Jev's ({j.suggestedPoints})
            </button>
          )}
          <button type="button" onClick={() => commit(max)} className="rounded border px-2 py-0.5 hover:bg-neutral-100">
            Full ({max})
          </button>
        </div>
      )}
    </li>
  );
}

function HostMinigame({ view, offsetMs }: { view: HostView; offsetMs: number }) {
  const now = useServerNow(offsetMs);
  const seg = view.segment!;
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
          <p className="text-7xl font-black tabular-nums text-amber-500">
            {Math.ceil((startAt - now) / 1000)}
          </p>
        ) : (
          <TimerBar now={now} openedAt={startAt} closesAt={endAt} />
        ))}
      {seg.stage !== "revealed" && <AnsweredCount view={view} />}
      {seg.stage === "revealed" && <TopAwards view={view} />}
    </div>
  );
}

function PlayersPanel({ view, onKick }: { view: HostView; onKick: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Players</h2>
      <ul className="space-y-1 text-sm">
        {view.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-500" : "bg-neutral-300"}`} />
            <span className="flex-1 truncate">
              {p.name}
              {p.duckHolderId && <span title="Linked to Duck Hours"> 🦆</span>}
            </span>
            <span className="tabular-nums text-neutral-500">{p.score}</span>
            <button
              type="button"
              onClick={() => confirm(`Remove ${p.name} from the game?`) && onKick(p.id)}
              className="rounded px-1.5 text-xs text-rose-700 hover:bg-rose-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QnaPanel({ view, send }: { view: HostView; send: Send }) {
  const hidden = view.qna.filter((q) => q.hidden);
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Audience questions</h2>
      <QnaList
        items={view.qna.filter((q) => !q.hidden)}
        renderExtra={(q) => (
          <div className="flex flex-col gap-1 text-xs">
            <button
              type="button"
              onClick={() => send({ t: "qnaModerate", id: q.id, answered: !q.answered })}
              className="rounded border px-2 py-0.5 hover:bg-neutral-100"
            >
              {q.answered ? "Reopen" : "Answered"}
            </button>
            <button
              type="button"
              onClick={() => send({ t: "qnaModerate", id: q.id, hidden: true })}
              className="rounded border px-2 py-0.5 text-rose-700 hover:bg-rose-50"
            >
              Hide
            </button>
          </div>
        )}
      />
      {hidden.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-500">Hidden ({hidden.length})</summary>
          <ul className="mt-2 space-y-1">
            {hidden.map((q) => (
              <li key={q.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-neutral-500">{q.text}</span>
                <button
                  type="button"
                  onClick={() => send({ t: "qnaModerate", id: q.id, hidden: false })}
                  className="text-xs underline"
                >
                  Unhide
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DuckBonusPanel({ view }: { view: HostView }) {
  const proposals = proposeDuckBonuses(view);
  const linked = view.players.filter((p) => p.duckHolderId).length;
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="font-semibold">🦆 Ceramic Duck Hours</h3>
      {proposals.length === 0 ? (
        <p className="mt-1 text-sm text-neutral-700">
          Bonus rules aren't set up yet (see <code>shared/duckBonus.ts</code>). {linked} of{" "}
          {view.players.length} players linked a duck entry.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {proposals.map((p, i) => (
            <li key={i}>
              {p.playerName}: +{Math.round(p.seconds / 60)} min {p.reason && `(${p.reason})`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The lobby fills with everyone's ducks as they join, waddling about the
 * waiting-room patch as players try out the controls on their phones.
 * Before anyone's connected (or without WebGL), the mascot holds the stage.
 */
function LobbyArea({ players, feed }: { players: HostView["players"]; feed: { current: ArenaFeed } }) {
  if (!players.some((p) => p.connected) || !hasWebGL()) return <Mascot animation="dance" size={220} />;
  return <HostLobbyArena players={players} feed={feed} />;
}
