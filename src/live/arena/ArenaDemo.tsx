import { useEffect, useMemo, useState } from "react";
import { arenaLayout, zoneAt, type ArenaLayout } from "../../../shared/arena";
import { arenaMove, createArenaSim, freezeArena, type ArenaMove } from "../../../shared/arenaSim";
import { DEMO_NAMES, DEMO_OPEN_SEC, DEMO_QUESTIONS, type DemoState } from "../../../shared/demo";
import { lookForIndex } from "../mascot/variants";
import { ArenaControls } from "./ArenaControls";
import { useTouchScreen } from "./touch";
import { AnswerList, ArenaView } from "./ArenaViews";
import type { ArenaMember } from "./ArenaScene";
import { ZONE_COLORS } from "./colors";
import { localArenaSource } from "./localSource";
import { networkSource, type ArenaSource } from "./source";
import { useDemo } from "./useDemo";

/**
 * Practice arena: everyone who opens it shares one arena on the server, each
 * with their own duck, with computer ducks making up the numbers. If the
 * server can't be reached, the same practice runs offline in the browser.
 */
export function ArenaPractice({ offlineMembers }: { offlineMembers?: ArenaMember[] }) {
  const demo = useDemo();
  if (demo.status === "offline" || demo.status === "full") {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {demo.status === "full"
            ? "The shared practice arena is full right now, so you're practising with computer ducks."
            : "Couldn't reach the practice server, so you're practising offline with computer ducks."}
        </p>
        <OfflinePractice members={offlineMembers} />
      </div>
    );
  }
  if (!demo.state) {
    return (
      <p className="py-24 text-center text-neutral-500">
        {demo.status === "reconnecting" ? "Reconnecting…" : "Finding you a duck…"}
      </p>
    );
  }
  return (
    <OnlinePractice
      state={demo.state}
      offsetMs={demo.offsetMs}
      feed={demo.feed}
      move={demo.move}
      reconnecting={demo.status === "reconnecting"}
    />
  );
}

function OnlinePractice({
  state,
  offsetMs,
  feed,
  move,
  reconnecting,
}: {
  state: DemoState;
  offsetMs: number;
  feed: ReturnType<typeof useDemo>["feed"];
  move: (m: ArenaMove) => void;
  reconnecting: boolean;
}) {
  const options = useMemo(
    () => state.question.options.map((text, i) => ({ id: String(i), text })),
    [state.question],
  );
  const layout = useMemo(
    () => arenaLayout(state.question.options.length, state.layoutPlayers),
    [state.question, state.layoutPlayers],
  );
  const rosterKey = JSON.stringify(state.ducks.map((d) => [d.id, d.name, d.lookIndex]));
  const members = useMemo<ArenaMember[]>(
    () =>
      (JSON.parse(rosterKey) as [string, string, number][]).map(([id, name, look]) => ({
        id,
        name,
        look: lookForIndex(look),
      })),
    [rosterKey],
  );
  const source = useMemo(() => networkSource(feed), [feed]);
  const revealed = state.phase === "reveal";

  // The clock, and which answer you're standing on (from the latest positions).
  const [now, setNow] = useState(() => Date.now());
  const [myZone, setMyZone] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const latest = feed.current.snaps.at(-1)?.ducks.get(state.you);
      setMyZone(latest ? zoneAt(layout, latest[1], latest[2]) : null);
    }, 200);
    return () => clearInterval(id);
  }, [feed, layout, state.you]);
  const left = Math.max(0, Math.ceil((state.endsAt - (now + offsetMs)) / 1000));

  const me = state.ducks.find((d) => d.id === state.you);
  const people = state.ducks.filter((d) => !d.bot).length;
  const bots = state.ducks.length - people;
  return (
    <PracticeLayout
      prompt={state.question.prompt}
      clock={revealed ? `Next in ${left}s` : `${left}s`}
      layout={layout}
      options={options}
      members={members}
      source={source}
      youId={state.you}
      correct={revealed ? state.correct : null}
      myZone={myZone}
      onMove={revealed ? null : move}
      footer={
        <p className="text-center text-sm text-neutral-500">
          {reconnecting && "Reconnecting… "}
          You're <strong>{me?.name ?? "a duck"}</strong>.{" "}
          {people === 1 ? "Just you so far" : `${people} people here`}
          {bots > 0 ? `, plus ${bots} computer duck${bots === 1 ? "" : "s"}.` : "."}
          {people === 1 && " Share the link to practise together."}
        </p>
      }
    />
  );
}

const OFFLINE_CROWD = 12;

/** The same practice, run in the browser with computer ducks (no server). */
function OfflinePractice({ members: given }: { members?: ArenaMember[] }) {
  const members = useMemo<ArenaMember[]>(
    () =>
      given ??
      Array.from({ length: OFFLINE_CROWD }, (_, i) => ({
        id: `duck-${i}`,
        name: i === 0 ? "You" : DEMO_NAMES[i % DEMO_NAMES.length],
        look: lookForIndex(i),
      })),
    [given],
  );
  const youId = members[0].id;
  const [qi, setQi] = useState(0);
  const [round, setRound] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [left, setLeft] = useState(DEMO_OPEN_SEC);
  const [myZone, setMyZone] = useState<number | null>(null);
  const q = DEMO_QUESTIONS[qi];
  const options = useMemo(() => q.options.map((text, i) => ({ id: String(i), text })), [q]);

  const sim = useMemo(
    () => createArenaSim(q.options.length, members.map((m) => m.id)),
    // A fresh arena each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, members, round],
  );
  const source = useMemo(
    () =>
      localArenaSource(sim, {
        bots: members.map((m) => m.id).filter((id) => id !== youId),
        favourite: q.correct,
      }),
    [sim, members, youId, q],
  );

  // Countdown, and keep "you're standing on…" up to date. Time's up: every
  // duck stops dead where it stands.
  useEffect(() => {
    if (revealed) return;
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, DEMO_OPEN_SEC - (Date.now() - started) / 1000);
      setLeft(Math.ceil(remaining));
      const you = sim.walkers.get(youId);
      setMyZone(you ? zoneAt(sim.layout, you.x, you.z) : null);
      if (remaining <= 0) {
        freezeArena(sim);
        setRevealed(true);
      }
    }, 200);
    return () => clearInterval(id);
  }, [sim, youId, revealed]);

  const next = () => {
    setQi((i) => (i + 1) % DEMO_QUESTIONS.length);
    setRound((r) => r + 1);
    setRevealed(false);
    setLeft(DEMO_OPEN_SEC);
    setMyZone(null);
  };

  return (
    <PracticeLayout
      prompt={q.prompt}
      clock={revealed ? "Time!" : `${left}s`}
      layout={sim.layout}
      options={options}
      members={members}
      source={source}
      youId={youId}
      correct={revealed ? q.correct : null}
      myZone={myZone}
      onMove={revealed ? null : (m) => arenaMove(sim, youId, m)}
      footer={
        revealed && (
          <div className="text-center">
            <button
              type="button"
              onClick={next}
              className="rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white"
            >
              Next practice question
            </button>
          </div>
        )
      }
    />
  );
}

/** Question, arena, answers, how you did, and the controls. */
function PracticeLayout({
  prompt,
  clock,
  layout,
  options,
  members,
  source,
  youId,
  correct,
  myZone,
  onMove,
  footer,
}: {
  prompt: string;
  clock: string;
  layout: ArenaLayout;
  options: { id: string; text: string }[];
  members: ArenaMember[];
  source: ArenaSource;
  youId: string;
  /** Set once revealed. */
  correct: number | null;
  myZone: number | null;
  /** Null once time's up. */
  onMove: ((m: ArenaMove) => void) | null;
  footer?: React.ReactNode;
}) {
  const [overview, setOverview] = useState(false);
  const touch = useTouchScreen();
  const revealed = correct !== null;
  const reveal = revealed ? { correctIndex: correct } : null;
  const answer = (i: number) => options[i]?.text ?? "";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold leading-snug sm:text-2xl">{prompt}</h2>
        <span className="shrink-0 rounded-full bg-neutral-900 px-3 py-1 font-mono text-base font-bold text-white sm:text-lg">
          {clock}
        </span>
      </div>
      <ArenaView
        layout={layout}
        options={options}
        members={members}
        source={source}
        youId={youId}
        reveal={reveal}
        overview={overview || revealed}
        onToggle={() => setOverview((v) => !v)}
        current={myZone}
        onMove={onMove}
      />
      <AnswerList options={options} layout={layout} current={myZone} reveal={reveal} />
      <p className="text-center text-lg font-semibold" aria-live="polite">
        {revealed ? (
          myZone === correct ? (
            "Correct! 🎉"
          ) : myZone === null ? (
            `You stayed in the middle. The answer was ${answer(correct)}.`
          ) : (
            `Not quite. The answer was ${answer(correct)}.`
          )
        ) : myZone === null ? (
          "Walk your duck onto an answer."
        ) : (
          <>
            You're standing on{" "}
            <span
              className="rounded-lg px-2 py-0.5 text-white"
              style={{ background: ZONE_COLORS[myZone % ZONE_COLORS.length] }}
            >
              {myZone + 1}. {answer(myZone)}
            </span>
          </>
        )}
      </p>
      {footer}
      {onMove && !touch && <ArenaControls onMove={onMove} layout={layout} />}
    </div>
  );
}
