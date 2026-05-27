import { useCallback, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import type { Question } from "../../types";
import {
  clearPersistentState,
  usePersistentState,
} from "../../hooks/usePersistentState";

type Phase = "revealing" | "selecting" | "result" | "factoid";

type QuestionPlayProps = {
  question: Question;
  categoryName: string;
  stateKey: string;
  onComplete: (correct: boolean) => void;
  onCancel: () => void;
};

export function QuestionPlay({
  question,
  categoryName,
  stateKey,
  onComplete,
  onCancel,
}: QuestionPlayProps) {
  const [phase, setPhase] = usePersistentState<Phase>(
    `${stateKey}.phase`,
    "revealing",
  );
  const [revealedCount, setRevealedCount] = usePersistentState<number>(
    `${stateKey}.revealedCount`,
    0,
  );
  const [selectedAnswerId, setSelectedAnswerId] = usePersistentState<
    string | null
  >(`${stateKey}.selectedAnswerId`, null);

  // After a refresh, restoring phase="result" should not re-fire confetti.
  const confettiFiredRef = useRef(phase === "result" || phase === "factoid");

  const clearPersisted = useCallback(() => {
    clearPersistentState(`${stateKey}.phase`);
    clearPersistentState(`${stateKey}.revealedCount`);
    clearPersistentState(`${stateKey}.selectedAnswerId`);
  }, [stateKey]);

  const totalAnswers = question.answers.length;
  const allRevealed = revealedCount >= totalAnswers;

  const revealNext = useCallback(() => {
    setRevealedCount((c) => Math.min(c + 1, totalAnswers));
  }, [totalAnswers]);

  const handleSelect = useCallback(
    (answerId: string) => {
      if (phase !== "selecting" && phase !== "revealing") return;
      if (!allRevealed) return;
      setSelectedAnswerId(answerId);
      setPhase("selecting");
    },
    [phase, allRevealed],
  );

  const handleConfirm = useCallback(() => {
    if (phase !== "selecting" || !selectedAnswerId) return;
    const correct = selectedAnswerId === question.correctAnswerId;
    setPhase("result");
    if (correct && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      fireConfetti();
    }
  }, [phase, selectedAnswerId, question.correctAnswerId, setPhase]);

  const handleContinueToFactoid = useCallback(() => {
    if (phase !== "result") return;
    if (question.factoid || question.factoidImage) {
      setPhase("factoid");
    } else {
      clearPersisted();
      onComplete(selectedAnswerId === question.correctAnswerId);
    }
  }, [phase, question, selectedAnswerId, onComplete, setPhase, clearPersisted]);

  const handleFinish = useCallback(() => {
    clearPersisted();
    onComplete(selectedAnswerId === question.correctAnswerId);
  }, [onComplete, selectedAnswerId, question.correctAnswerId, clearPersisted]);

  // Spacebar handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
      }
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (phase === "revealing" && !allRevealed) {
          revealNext();
        } else if (phase === "selecting") {
          handleConfirm();
        } else if (phase === "result") {
          handleContinueToFactoid();
        } else if (phase === "factoid") {
          handleFinish();
        }
      } else if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    phase,
    allRevealed,
    revealNext,
    handleConfirm,
    handleContinueToFactoid,
    handleFinish,
    onCancel,
  ]);

  const isCorrect = selectedAnswerId === question.correctAnswerId;
  const showResult = phase === "result" || phase === "factoid";

  return (
    <div className="relative flex h-full flex-col">
      <div className="border-b border-neutral-200 bg-white px-6 py-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {categoryName}
      </div>

      {/* Click-to-reveal surface (background area) */}
      <div
        onClick={() => {
          if (phase === "revealing" && !allRevealed) revealNext();
          else if (phase === "result") handleContinueToFactoid();
          else if (phase === "factoid") handleFinish();
        }}
        className={`flex-1 overflow-auto px-6 py-10 ${
          phase === "revealing" && !allRevealed ? "cursor-pointer" : ""
        } ${phase === "result" && !isCorrect ? "animate-wrong-shake" : ""}`}
      >
        <div className="mx-auto w-full max-w-3xl">
          {phase !== "factoid" && (
            <>
              {question.image && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={question.image}
                    alt=""
                    className="max-h-72 rounded-lg border border-neutral-200 bg-white object-contain"
                  />
                </div>
              )}
              <h2 className="mb-8 text-center text-3xl font-semibold leading-tight text-neutral-900 sm:text-4xl">
                {question.question}
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {question.answers.map((answer, i) => {
                  const revealed = i < revealedCount;
                  const selected = selectedAnswerId === answer.id;
                  const isThisCorrect = answer.id === question.correctAnswerId;

                  let stateClass =
                    "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400";
                  if (!revealed) {
                    stateClass = "border-neutral-200 bg-neutral-100 text-neutral-300";
                  } else if (showResult) {
                    if (isThisCorrect) {
                      stateClass =
                        "border-green-500 bg-green-50 text-green-900 ring-2 ring-green-500";
                    } else if (selected) {
                      stateClass =
                        "border-red-500 bg-red-50 text-red-900 ring-2 ring-red-500";
                    } else {
                      stateClass = "border-neutral-200 bg-white text-neutral-500 opacity-60";
                    }
                  } else if (selected) {
                    stateClass =
                      "border-neutral-900 bg-neutral-900 text-white ring-2 ring-neutral-900";
                  }

                  return (
                    <button
                      key={answer.id}
                      type="button"
                      disabled={!revealed || showResult}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (revealed && !showResult) handleSelect(answer.id);
                      }}
                      className={`flex min-h-[64px] items-center gap-3 rounded-xl border p-4 text-left text-lg transition ${stateClass}`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-sm font-semibold">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {revealed ? (
                        <span className="flex flex-1 items-center gap-3">
                          {answer.image && (
                            <img
                              src={answer.image}
                              alt=""
                              className="h-12 w-12 rounded object-cover"
                            />
                          )}
                          <span>{answer.text}</span>
                        </span>
                      ) : (
                        <span className="text-sm italic">···</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {phase === "revealing" && !allRevealed && (
                <p className="mt-8 text-center text-sm text-neutral-500">
                  Press <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs">space</kbd> or click anywhere to reveal the next answer
                  ({revealedCount} / {totalAnswers})
                </p>
              )}

              {phase === "result" && (
                <div className="mt-10 text-center">
                  <p
                    className={`text-2xl font-semibold ${
                      isCorrect ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {isCorrect ? "Correct!" : "Not quite."}
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Press <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs">space</kbd> or click to continue
                  </p>
                </div>
              )}
            </>
          )}

          {phase === "factoid" && (
            <div className="text-center">
              <p className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
                Did you know?
              </p>
              {question.factoidImage && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={question.factoidImage}
                    alt=""
                    className="max-h-72 rounded-lg border border-neutral-200 bg-white object-contain"
                  />
                </div>
              )}
              <p className="mx-auto max-w-2xl text-2xl leading-relaxed text-neutral-800">
                {question.factoid}
              </p>
              <p className="mt-10 text-sm text-neutral-500">
                Press <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs">space</kbd> or click to finish
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Slide-up confirm bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 transition-transform duration-300 ${
          phase === "selecting" ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="pointer-events-auto border-t border-neutral-200 bg-white px-6 py-5 shadow-lg">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
            <div className="text-sm text-neutral-600">
              Selected:{" "}
              <span className="font-semibold text-neutral-900">
                {question.answers.find((a) => a.id === selectedAnswerId)?.text}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedAnswerId(null);
                  setPhase("revealing");
                }}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Change
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                Confirm answer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fireConfetti() {
  const duration = 1200;
  const end = Date.now() + duration;
  const colors = ["#22c55e", "#3b82f6", "#eab308", "#ec4899", "#a855f7"];
  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({
    particleCount: 150,
    spread: 110,
    origin: { y: 0.6 },
    colors,
  });
}
