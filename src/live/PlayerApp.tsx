import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_WRITTEN_LENGTH,
  MINIGAME_COUNTDOWN_SEC,
  LOBBY_FEED,
  type AccountSession,
  type AnswerValue,
  type PlayerView,
  type PublicSegment,
  type RoomInfo,
} from "../../shared/protocol";
import {
  ApiError,
  forgetSession,
  getRoomInfo,
  joinRoom,
  loadPlayerCreds,
  savePlayerCreds,
  type PlayerCreds,
} from "./api";
import {
  AnswerPad,
  Banner,
  GetReady,
  Leaderboard,
  NextIn,
  RoundTotals,
  SegmentBadges,
  QnaAsk,
  QnaList,
  TimerBar,
} from "./components";
import { ControlsHint } from "./ControlsHint";
import { Mascot } from "./mascot/Mascot";
import type { MascotAnimation } from "./mascot/poses";
import { describeLook, lookFor } from "./mascot/variants";
import { duckHoursLeader } from "./mascot/duckChampion";
import { MINIGAMES } from "./minigames";
import { MinigamePlayer } from "./minigames/MinigamePlayer";
import { hasWebGL } from "./minigames/three/fallbackContext";
import { useGraphicsPref } from "./minigames/useGraphicsPref";
import { useRoom, useServerNow, type ArenaFeed, type RoomStatus } from "./useRoom";
import { PlayerArena, PlayerLobby } from "./arena/ArenaViews";
import { OutfitPicker } from "./account/OutfitPicker";
import { WhoAreYou } from "./account/WhoAreYou";

export function PlayerApp({ code, onExit }: { code: string | null; onExit: () => void }) {
  const [creds, setCreds] = useState<PlayerCreds | null>(() =>
    code ? loadPlayerCreds(code) : null,
  );

  if (!code) return <CodeEntry onExit={onExit} />;
  if (!creds) {
    return (
      <JoinForm
        code={code}
        onExit={onExit}
        onJoined={(c) => {
          savePlayerCreds(code, c);
          setCreds(c);
        }}
      />
    );
  }
  return (
    <PlayerGame
      creds={creds}
      onLeave={() => {
        savePlayerCreds(code, null);
        setCreds(null);
      }}
      onExit={onExit}
    />
  );
}

function Shell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-sky-50 to-amber-50">
      {header}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function CodeEntry({ onExit }: { onExit: () => void }) {
  const [value, setValue] = useState("");
  const clean = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const go = () => {
    if (clean.length === 4) window.location.hash = `#/live/join/${clean}`;
  };
  return (
    <Shell>
      <div className="m-auto w-full max-w-sm text-center">
        <Mascot animation="waddle" size={150} />
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Join the live quiz</h1>
        <label className="block text-left text-sm font-medium text-neutral-700" htmlFor="code">
          Room code
        </label>
        <input
          id="code"
          autoFocus
          value={clean}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABCD"
          className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-4 py-4 text-center font-mono text-4xl tracking-[0.4em] focus:border-neutral-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={go}
          disabled={clean.length !== 4}
          className="mt-4 w-full rounded-xl bg-neutral-900 py-4 text-lg font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          Continue
        </button>
        <a href="#/live/arena" className="mt-6 block text-sm font-semibold text-emerald-700 underline">
          Practise steering your duck
        </a>
        <button type="button" onClick={onExit} className="mt-3 text-sm text-neutral-500 underline">
          Back
        </button>
      </div>
    </Shell>
  );
}

function JoinForm({
  code,
  onJoined,
  onExit,
}: {
  code: string;
  onJoined: (c: PlayerCreds) => void;
  onExit: () => void;
}) {
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRoomInfo(code).then(setInfo, (err: ApiError) =>
      setLoadError(err.status === 404 ? `There's no room ${code}.` : err.message),
    );
  }, [code]);

  const join = async (s: AccountSession, team: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await joinRoom(code, { account: { id: s.account.id, token: s.token }, teamId: team });
      onJoined({ code, ...res });
    } catch (err) {
      const message = (err as Error).message;
      if (message.startsWith("Please pick yourself again")) {
        // This device's sign-in is no longer valid (e.g. the PIN was reset).
        forgetSession(s.account.id);
        setSession(null);
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Shell>
        <div className="m-auto max-w-sm space-y-4 text-center">
          <Banner kind="error">{loadError}</Banner>
          <button
            type="button"
            onClick={() => (window.location.hash = "#/live")}
            className="rounded-lg bg-neutral-900 px-4 py-2 font-semibold text-white"
          >
            Try another code
          </button>
          <div>
            <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
              Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }
  if (!info) {
    return (
      <Shell>
        <p className="m-auto text-neutral-500">Finding room {code}…</p>
      </Shell>
    );
  }

  const needsTeam = info.settings.teamMode;
  return (
    <Shell>
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center">
          <Mascot animation="idle" size={120} />
          <p className="font-mono text-sm tracking-widest text-neutral-500">ROOM {code}</p>
          <h1 className="text-3xl font-bold tracking-tight">{info.title}</h1>
        </div>

        {!session ? (
          <>
            {error && <Banner kind="error">{error}</Banner>}
            <WhoAreYou
              onSignedIn={(s) => {
                setSession(s);
                if (!needsTeam) void join(s, null);
              }}
            />
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void join(session, teamId);
            }}
            className="space-y-6"
          >
            <p className="text-center text-lg">
              Joining as <strong>{session.account.name}</strong>.{" "}
              <button
                type="button"
                onClick={() => setSession(null)}
                className="text-sm text-neutral-500 underline"
              >
                Not you?
              </button>
            </p>
            {needsTeam && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-neutral-700">
                  Pick a team <span className="text-neutral-400">(arrow keys work here)</span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {info.settings.teams.map((t) => (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-white p-3 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-900 ${
                        teamId === t.id ? "border-neutral-900" : "border-neutral-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="team"
                        value={t.id}
                        checked={teamId === t.id}
                        onChange={() => setTeamId(t.id)}
                        className="sr-only"
                      />
                      <span className="h-5 w-5 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {error && <Banner kind="error">{error}</Banner>}
            <button
              type="submit"
              disabled={busy || (needsTeam && !teamId)}
              className="w-full rounded-xl bg-amber-500 py-4 text-xl font-bold text-white shadow hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Joining…" : "Join"}
            </button>
          </form>
        )}
        <ControlsHint />
      </div>
    </Shell>
  );
}

const STATUS_TEXT: Partial<Record<RoomStatus, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
};

function PlayerGame({
  creds,
  onLeave,
  onExit,
}: {
  creds: PlayerCreds;
  onLeave: () => void;
  onExit: () => void;
}) {
  const { view, status, error, clearError, send, offsetMs, arenaRef } = useRoom<PlayerView>(creds.code, {
    token: creds.token,
  });
  const [showQna, setShowQna] = useState(false);

  if (status === "kicked" || status === "gone" || status === "rejected") {
    const msg =
      status === "kicked"
        ? "The host removed you from this game."
        : status === "gone"
          ? "This room has closed."
          : "Your seat in this room is gone.";
    return (
      <Shell>
        <div className="m-auto max-w-sm space-y-4 text-center">
          <p className="text-lg">{msg}</p>
          {status === "rejected" && (
            <button
              type="button"
              onClick={onLeave}
              className="rounded-lg bg-neutral-900 px-4 py-2 font-semibold text-white"
            >
              Join again
            </button>
          )}
          <div>
            <button type="button" onClick={onExit} className="text-sm text-neutral-500 underline">
              Leave
            </button>
          </div>
        </div>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <p className="m-auto text-neutral-500">{STATUS_TEXT[status] ?? "Loading…"}</p>
      </Shell>
    );
  }

  const team = view.teams.find((t) => t.id === view.me.teamId);
  const rank = view.players.findIndex((p) => p.id === view.me.id) + 1;
  const openQna = view.qna.filter((q) => !q.answered).length;

  const header = (
    <header className="border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        {team && <span className="h-4 w-4 rounded-full" style={{ background: team.color }} />}
        <span className="truncate font-semibold">{view.me.name}</span>
        <span className="text-sm text-neutral-500">#{rank}</span>
        <span className="ml-auto text-lg font-bold tabular-nums">{view.me.score} pts</span>
        {status !== "open" && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            {STATUS_TEXT[status]}
          </span>
        )}
      </div>
    </header>
  );

  return (
    <Shell header={header}>
      {error && (
        <div className="mb-4">
          <Banner kind="error" onDismiss={clearError}>
            {error}
          </Banner>
        </div>
      )}

      <div className="flex-1">
        <PlayerStage view={view} send={send} offsetMs={offsetMs} feed={arenaRef} />
      </div>

      <footer className="mt-8 space-y-4">
        <ControlsHint />
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setShowQna((v) => !v)}
            aria-expanded={showQna}
            className="text-sm font-semibold text-amber-800 underline"
          >
            Questions for the host{openQna ? ` (${openQna})` : ""}
          </button>
          {showQna && (
            <div className="mt-3 space-y-3">
              <QnaAsk onAsk={(text) => send({ t: "qnaAsk", text })} />
              <QnaList items={view.qna} onVote={(id) => send({ t: "qnaVote", id })} />
            </div>
          )}
        </div>
      </footer>
    </Shell>
  );
}

type Send = ReturnType<typeof useRoom>["send"];

/** Whether this player's linked duck leads the Ceramic Duck Hours standings. */
function isChampion(view: PlayerView): boolean {
  return view.me.duckHolderId !== null && view.me.duckHolderId === duckHoursLeader();
}

/** How the mascot feels about what's on screen; null hides it. */
function playerMood(view: PlayerView): MascotAnimation | null {
  const seg = view.segment;
  const rank = view.players.findIndex((p) => p.id === view.me.id) + 1;
  switch (view.phase) {
    case "lobby":
      // The waiting room has everyone's ducks in it already.
      return null;
    case "leaderboard":
      return rank <= 3 ? "celebrate" : "waddle";
    case "ended":
      return rank <= 3 ? "celebrate" : "dance";
    case "segment":
      // Minigames have the duck in the scene already.
      if (!seg || seg.kind === "minigame") return null;
      // The arena has everyone's ducks in it already (once the answers are up).
      if (seg.arena && seg.stage !== "reading") return null;
      if (seg.stage === "reading") return "idle";
      if (seg.stage !== "revealed") return "idle";
      if (seg.question?.type === "poll") return "quack";
      if ((view.myAward ?? 0) > 0) return "celebrate";
      return view.myAnswer ? "sad" : "sleep";
  }
}

type StageProps = { view: PlayerView; send: Send; offsetMs: number; feed: { current: ArenaFeed } };

function PlayerStage(props: StageProps) {
  const mood = playerMood(props.view);
  // One mascot stays mounted across questions (one WebGL context, no
  // flicker); it shrinks while a question is open to leave room to answer.
  const answering = props.view.segment?.stage === "open" && props.view.phase === "segment";
  return (
    <>
      {mood && (
        <Mascot
          animation={mood}
          look={lookFor(props.view.me.lookIndex, props.view.me.outfit)}
          crowned={isChampion(props.view)}
          size={answering ? 84 : 170}
          className="-mb-2"
        />
      )}
      <StageBody {...props} />
    </>
  );
}

function StageBody({ view, send, offsetMs, feed }: StageProps) {
  if (view.phase === "lobby") {
    const look = lookFor(view.me.lookIndex, view.me.outfit);
    const crowned = isChampion(view);
    return (
      <div className="space-y-4 pb-10 pt-2 text-center">
        <div>
          <h2 className="text-2xl font-bold">You're in, {view.me.name}!</h2>
          <p className="text-neutral-600">
            Try the controls while you wait: walk around, bump into people, quack.
          </p>
          <p className="mt-1 font-semibold text-neutral-800">
            You're {crowned ? `${describeLook({ ...look, hat: "none" })} and the crown` : describeLook(look)}.
          </p>
          {crowned && (
            <p className="mt-1 font-semibold text-amber-700">
              👑 You lead the Ceramic Duck Hours, so your duck wears the crown.
            </p>
          )}
        </div>
        <PlayerLobby
          view={view}
          feed={feed}
          onMove={(move) => send({ t: "move", segmentId: LOBBY_FEED, move })}
        />
        <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-left font-bold">Dress your duck</h3>
          <OutfitPicker
            hat={look.hat}
            neckpiece={look.neckpiece}
            crowned={crowned}
            onChange={(outfit) => send({ t: "outfit", outfit })}
          />
          <p className="mt-2 text-left text-xs text-neutral-500">Saved for your next game too.</p>
        </div>
        <p className="text-neutral-600">
          Waiting for the host to start <strong>{view.title}</strong>.{" "}
          {view.players.length} player{view.players.length === 1 ? "" : "s"} here.
        </p>
      </div>
    );
  }
  if (view.phase === "leaderboard" || view.phase === "ended") {
    const rank = view.players.findIndex((p) => p.id === view.me.id) + 1;
    return (
      <div className="space-y-6">
        <h2 className="text-center text-2xl font-bold" aria-live="polite">
          {view.phase === "ended" ? `Final: you placed #${rank}!` : `You're #${rank}`}
        </h2>
        <Leaderboard
          players={view.players}
          teams={view.teams}
          teamMode={view.settings.teamMode}
          highlightId={view.me.id}
        />
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
        <MinigameStage key={seg.id} seg={seg} view={view} send={send} offsetMs={offsetMs} />
      ) : (
        <QuestionStage key={seg.id} seg={seg} view={view} send={send} offsetMs={offsetMs} feed={feed} />
      )}
    </div>
  );
}

function ResultLine({ view }: { view: PlayerView }) {
  const award = view.myAward ?? 0;
  const answered = view.myAnswer !== null;
  return (
    <p
      className={`text-center text-2xl font-bold ${award > 0 ? "text-emerald-700" : "text-neutral-600"}`}
      aria-live="polite"
    >
      {award > 0 ? `+${award} points!` : answered ? "No points this time" : "You didn't answer"}
    </p>
  );
}

function QuestionStage({
  seg,
  view,
  send,
  offsetMs,
  feed,
}: {
  seg: PublicSegment;
  view: PlayerView;
  send: Send;
  offsetMs: number;
  feed: { current: ArenaFeed };
}) {
  const now = useServerNow(offsetMs);
  const q = seg.question!;
  const open = seg.stage === "open";
  const revealed = seg.stage === "revealed";
  const answer = (value: AnswerValue) => send({ t: "answer", segmentId: seg.id, value });

  const status = open
    ? null
    : revealed
      ? null
      : seg.stage === "judging"
        ? "Answers are in. The judge is reading them…"
        : seg.stage === "review"
          ? "The host is checking the scores…"
          : "Answers locked. Waiting for the reveal…";

  if (open && seg.round && now < seg.answersOpenAt) {
    return <GetReady now={now} until={seg.answersOpenAt} title={seg.round.title} />;
  }

  // The host is reading the question out; the answers (and your duck) come next.
  if (seg.stage === "reading") {
    return (
      <div className="space-y-4 py-6 text-center">
        <SegmentBadges seg={seg} />
        <h2 className="text-2xl font-bold leading-snug sm:text-3xl">{q.prompt}</h2>
        <p className="text-neutral-600" aria-live="polite">
          Listen up! The answers appear in the arena in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SegmentBadges seg={seg} />
      <h2 className="text-center text-2xl font-bold leading-snug sm:text-3xl">{q.prompt}</h2>
      {open && <TimerBar now={now} openedAt={seg.answersOpenAt} closesAt={seg.closesAt} />}

      {(q.type === "choice" || q.type === "poll") && q.arena && (
        <PlayerArena
          seg={seg}
          view={view}
          options={q.options}
          feed={feed}
          onMove={(move) => send({ t: "move", segmentId: seg.id, move })}
        />
      )}

      {(q.type === "choice" || q.type === "poll") && !q.arena && (
        <>
          <AnswerPad
            options={q.options}
            selectedId={
              view.myAnswer && "optionId" in view.myAnswer ? view.myAnswer.optionId : null
            }
            disabled={!open}
            onPick={(optionId) => answer({ type: q.type, optionId })}
            correctId={revealed ? seg.reveal?.correctId : undefined}
            distribution={revealed ? seg.reveal?.distribution : undefined}
          />
          {open && view.myAnswer && (
            <p className="text-center text-sm text-neutral-600" aria-live="polite">
              Locked in. You can change it until time's up
              {seg.speedScored && " (your speed counts from your final pick)"}.
            </p>
          )}
        </>
      )}

      {q.type === "numeric" && (
        <NumericInput
          unit={q.unit}
          disabled={!open}
          submitted={view.myAnswer?.type === "numeric" ? view.myAnswer.value : null}
          onSubmit={(value) => answer({ type: "numeric", value })}
        />
      )}

      {q.type === "written" && (
        <WrittenInput
          segmentId={seg.id}
          maxLength={q.maxLength ?? MAX_WRITTEN_LENGTH}
          disabled={!open}
          submitted={view.myAnswer?.type === "written" ? view.myAnswer.text : null}
          onSubmit={(text) => answer({ type: "written", text })}
        />
      )}

      {status && (
        <p className="text-center text-neutral-600" aria-live="polite">
          {status}
        </p>
      )}

      {revealed && (
        <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          {q.type !== "poll" && <ResultLine view={view} />}
          {q.type === "numeric" && seg.reveal?.answer !== undefined && (
            <p className="text-center text-lg">
              Answer: <strong>{seg.reveal.answer}</strong> {seg.reveal.unit}
            </p>
          )}
          {seg.reveal?.referenceAnswer && (
            <p className="text-neutral-700">
              <span className="font-semibold">Model answer:</span> {seg.reveal.referenceAnswer}
            </p>
          )}
          {seg.reveal?.factoid && <p className="text-neutral-700">💡 {seg.reveal.factoid}</p>}
          <NextIn now={now} at={seg.advanceAt} />
        </div>
      )}
      {revealed && seg.round && seg.reveal?.roundTotals && (
        <RoundTotals
          title={seg.round.title}
          totals={seg.reveal.roundTotals}
          highlightId={view.me.id}
        />
      )}
    </div>
  );
}

function NumericInput({
  unit,
  disabled,
  submitted,
  onSubmit,
}: {
  unit?: string;
  disabled: boolean;
  submitted: number | null;
  onSubmit: (n: number) => void;
}) {
  const [text, setText] = useState(submitted === null ? "" : String(submitted));
  const value = Number(text.replace(/,/g, ""));
  const valid = text.trim() !== "" && Number.isFinite(value);
  const submit = () => valid && !disabled && onSubmit(value);
  return (
    <div className="mx-auto max-w-sm space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          inputMode="decimal"
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label="Your guess"
          className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-4 text-center text-3xl font-bold tabular-nums focus:border-neutral-600 focus:outline-none disabled:bg-neutral-100"
        />
        {unit && <span className="text-lg text-neutral-600">{unit}</span>}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!valid || disabled}
        className="w-full rounded-xl bg-neutral-900 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        Submit <span className="font-normal opacity-70">(Enter)</span>
      </button>
      {submitted !== null && (
        <p className="text-center text-sm text-neutral-600" aria-live="polite">
          Locked in: <strong>{submitted}</strong>
          {!disabled && ". You can change it until time's up."}
        </p>
      )}
    </div>
  );
}

function WrittenInput({
  segmentId,
  maxLength,
  disabled,
  submitted,
  onSubmit,
}: {
  segmentId: string;
  maxLength: number;
  disabled: boolean;
  submitted: string | null;
  onSubmit: (text: string) => void;
}) {
  const draftKey = `quiztime.live.draft.${segmentId}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? submitted ?? "";
    } catch {
      return submitted ?? "";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, text);
    } catch {
      // Drafts are a convenience only.
    }
  }, [draftKey, text]);

  const saved = submitted !== null && submitted === text;
  const submit = () => !disabled && text.trim() && onSubmit(text);

  return (
    <div className="space-y-2">
      <p className="text-center text-sm text-neutral-600">
        No timer and no speed bonus here. Take your time; spelling doesn't count.
      </p>
      <textarea
        autoFocus
        disabled={disabled}
        value={text}
        maxLength={maxLength}
        rows={6}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends (one key); Shift+Enter is there for a new line if wanted.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Your answer"
        className="w-full rounded-xl border border-neutral-300 bg-white p-4 text-lg focus:border-neutral-600 focus:outline-none disabled:bg-neutral-100"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-500" aria-live="polite">
          {saved
            ? disabled
              ? "✓ Submitted"
              : "✓ Saved. You can keep editing until the host closes this."
            : submitted !== null
              ? "Unsaved changes. Press Enter to update."
              : `${text.length}/${maxLength}`}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim() || saved}
          className="rounded-xl bg-neutral-900 px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {submitted !== null ? "Update" : "Submit"} <span className="font-normal opacity-70">(Enter)</span>
        </button>
      </div>
    </div>
  );
}

function MinigameStage({
  seg,
  view,
  send,
  offsetMs,
}: {
  seg: PublicSegment;
  view: PlayerView;
  send: Send;
  offsetMs: number;
}) {
  const now = useServerNow(offsetMs, 100);
  const mg = seg.minigame!;
  const def = MINIGAMES[mg.game];
  const startAt = seg.openedAt + MINIGAME_COUNTDOWN_SEC * 1000;
  const endAt = startAt + mg.durationSec * 1000;
  const scoreRef = useRef(0);
  const sentRef = useRef(view.myAnswer !== null);
  const [finalScore, setFinalScore] = useState<number | null>(
    view.myAnswer?.type === "minigame" ? view.myAnswer.score : null,
  );
  const open = seg.stage === "open";
  const [graphics, setGraphics] = useGraphicsPref();

  // Fetch the 3D scene (and three.js) during the countdown.
  useEffect(() => {
    if (graphics === "3d" && hasWebGL()) void def.preload();
  }, [def, graphics]);

  const submit = useCallback(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    setFinalScore(scoreRef.current);
    send({ t: "answer", segmentId: seg.id, value: { type: "minigame", score: scoreRef.current } });
  }, [send, seg.id]);

  // Time's up: hand in whatever we have.
  useEffect(() => {
    if (open && now >= endAt) submit();
  }, [open, now, endAt, submit]);

  if (seg.stage === "revealed") {
    const mine = seg.reveal?.awards.find((a) => a.playerId === view.me.id);
    const place = mine ? seg.reveal!.awards.indexOf(mine) + 1 : null;
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-3xl font-black">{def.name}</h2>
        <ResultLine view={view} />
        {place && (
          <p className="text-neutral-600">
            You placed #{place} of {seg.reveal!.awards.length} ({mine?.detail}).
          </p>
        )}
      </div>
    );
  }

  if (!open || finalScore !== null) {
    return (
      <div className="space-y-3 py-8 text-center">
        <h2 className="text-3xl font-black">{def.name}</h2>
        {finalScore !== null ? (
          <p className="text-xl" aria-live="polite">
            Your score: <strong>{finalScore}</strong>. Waiting for everyone else…
          </p>
        ) : (
          <p className="text-neutral-600">This round is over.</p>
        )}
        <p className="text-sm text-neutral-500">
          {seg.answeredCount} / {seg.eligibleCount} done
        </p>
      </div>
    );
  }

  if (now < startAt) {
    const n = Math.ceil((startAt - now) / 1000);
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-amber-600">Minigame!</p>
        <h2 className="text-4xl font-black">{def.name}</h2>
        <p className="text-lg text-neutral-700">{def.howTo}</p>
        <p className="text-sm text-neutral-500">
          {def.uses === "action"
            ? "One button: Space, Enter, numpad 0, or tap."
            : "Directions: WASD, arrow keys, numpad 8 4 6 2, or tap."}
        </p>
        <div className="text-7xl font-black tabular-nums text-amber-500" aria-live="assertive">
          {n}
        </div>
        {hasWebGL() && (
          <label className="inline-flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={graphics === "2d"}
              onChange={(e) => setGraphics(e.target.checked ? "2d" : "3d")}
            />
            Simple 2D graphics (easier on slow devices and motion sensitivity)
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-black">{def.name}</h2>
        <div className="flex-1">
          <TimerBar now={now} openedAt={startAt} closesAt={endAt} />
        </div>
      </div>
      <MinigamePlayer
        def={def}
        graphics={graphics}
        seed={mg.seed}
        active={now < endAt}
        onScore={(s) => {
          scoreRef.current = s;
        }}
        onDone={submit}
      />
    </div>
  );
}
