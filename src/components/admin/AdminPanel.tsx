import { useRef, useState } from "react";
import bundledQuiz from "../../data/quiz.json";
import bundledTrivia from "../../data/afTrivia.json";
import type { QuizData, TriviaData } from "../../types";
import { useOverridableJson } from "../../hooks/useOverridableJson";
import { NavBar } from "../NavBar";
import { QUIZ_OVERRIDE_KEY } from "../quiz/QuizGame";
import { TRIVIA_OVERRIDE_KEY } from "../games/AFTrivia";
import { QuizEditor } from "./QuizEditor";
import { TriviaEditor } from "./TriviaEditor";
import {
  GithubConnectModal,
  useGithubAuth,
  type GithubAuth,
} from "./GithubConnect";
import { GithubError, getFile, putFile } from "../../lib/github";

const QUIZ_PATH = "src/data/quiz.json";
const TRIVIA_PATH = "src/data/afTrivia.json";

type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

const PASSWORD = "afafafaf";
const SESSION_KEY = "quiztime.admin.unlocked";

type AdminPanelProps = {
  onExit: () => void;
};

export function AdminPanel({ onExit }: AdminPanelProps) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "1",
  );
  if (!unlocked) {
    return <Gate onExit={onExit} onUnlock={() => setUnlocked(true)} />;
  }
  return <Inner onExit={onExit} />;
}

function Gate({ onExit, onUnlock }: { onExit: () => void; onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const submit = () => {
    if (value === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      onUnlock();
    } else {
      setError(true);
    }
  };
  return (
    <div className="flex h-full flex-col">
      <NavBar title="Edit content" onBack={onExit} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">
            Password required
          </h2>
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoFocus
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
          {error && (
            <p className="mt-2 text-sm text-red-600">Wrong password.</p>
          )}
          <button
            type="button"
            onClick={submit}
            className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Unlock
          </button>
        </div>
      </main>
    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Inner({ onExit }: { onExit: () => void }) {
  const quiz = useOverridableJson<QuizData>(
    QUIZ_OVERRIDE_KEY,
    bundledQuiz as QuizData,
  );
  const trivia = useOverridableJson<TriviaData>(
    TRIVIA_OVERRIDE_KEY,
    bundledTrivia as TriviaData,
  );
  const [tab, setTab] = useState<"quiz" | "trivia">("quiz");
  const quizImportRef = useRef<HTMLInputElement>(null);
  const triviaImportRef = useRef<HTMLInputElement>(null);
  const auth = useGithubAuth();
  const [showConnect, setShowConnect] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle" });

  const saveToRepo = async () => {
    if (!auth.token) return;
    const path = tab === "quiz" ? QUIZ_PATH : TRIVIA_PATH;
    const payload = tab === "quiz" ? quiz.data : trivia.data;
    const content = JSON.stringify(payload, null, 2) + "\n";
    setSaveStatus({ state: "saving" });
    try {
      const existing = await getFile(auth.token, path);
      const summary =
        tab === "quiz"
          ? `Update ??? quiz content (${(payload as QuizData).categories.length} categories)`
          : `Update AF Trivia content (${(payload as TriviaData).questions.length} questions)`;
      const message = `${summary} via admin panel`;
      await putFile(auth.token, path, content, message, existing?.sha);
      setSaveStatus({
        state: "success",
        message: "Committed — Pages will rebuild in about a minute.",
      });
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Commit failed";
      if (err instanceof GithubError && err.status === 409) {
        msg = "Someone else committed first. Refresh the page and re-apply your edits.";
      } else if (err instanceof GithubError && err.status === 401) {
        msg = "Token rejected. Disconnect and re-enter a valid token.";
      }
      setSaveStatus({ state: "error", message: msg });
    }
  };

  const handleImport = async (file: File, target: "quiz" | "trivia") => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (target === "quiz") {
        if (!parsed || !Array.isArray(parsed.categories))
          throw new Error("Expected { categories: [...] }");
        quiz.setData(parsed);
      } else {
        if (!parsed || !Array.isArray(parsed.questions))
          throw new Error("Expected { questions: [...] }");
        trivia.setData(parsed);
      }
      alert("Imported successfully.");
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : "bad JSON"}`);
    }
  };

  const resetTab = () => {
    if (tab === "quiz") {
      if (confirm("Discard your quiz edits and return to the deployed defaults?"))
        quiz.reset();
    } else {
      if (confirm("Discard your AF Trivia edits and return to the deployed defaults?"))
        trivia.reset();
    }
  };

  const active = tab === "quiz" ? quiz : trivia;

  return (
    <div className="flex h-full flex-col">
      <NavBar title="Edit content" onBack={onExit} />

      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-6 py-3">
          <button
            type="button"
            onClick={() => setTab("quiz")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "quiz"
                ? "bg-neutral-900 text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            ??? Quiz
          </button>
          <button
            type="button"
            onClick={() => setTab("trivia")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "trivia"
                ? "bg-neutral-900 text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            AF Trivia
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {active.isOverridden && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Unsaved override
              </span>
            )}
            <GithubAuthControls auth={auth} onConnect={() => setShowConnect(true)} />
            <button
              type="button"
              disabled={!auth.authed || saveStatus.state === "saving"}
              onClick={() => void saveToRepo()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveStatus.state === "saving" ? "Saving…" : "Save to repo"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (tab === "quiz")
                  downloadJson("quiz.json", quiz.data);
                else downloadJson("afTrivia.json", trivia.data);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() =>
                tab === "quiz"
                  ? quizImportRef.current?.click()
                  : triviaImportRef.current?.click()
              }
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Import
            </button>
            <input
              ref={quizImportRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f, "quiz");
                e.target.value = "";
              }}
            />
            <input
              ref={triviaImportRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f, "trivia");
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={resetTab}
              disabled={!active.isOverridden}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-4xl px-6 pb-3 text-xs text-neutral-500">
          Edits live in your browser. <strong>Save to repo</strong> commits to
          GitHub and the site rebuilds in about a minute; <strong>Export</strong>
          downloads the file if you'd rather commit manually.
        </div>
        {saveStatus.state === "success" && (
          <div className="border-t border-green-200 bg-green-50 px-6 py-2 text-sm text-green-900">
            {saveStatus.message}
          </div>
        )}
        {saveStatus.state === "error" && (
          <div className="border-t border-red-200 bg-red-50 px-6 py-2 text-sm text-red-900">
            {saveStatus.message}
          </div>
        )}
      </div>

      {showConnect && (
        <GithubConnectModal
          onSignIn={auth.signIn}
          onClose={() => setShowConnect(false)}
        />
      )}

      {tab === "quiz" ? (
        <QuizEditor data={quiz.data} onChange={quiz.setData} />
      ) : (
        <TriviaEditor data={trivia.data} onChange={trivia.setData} />
      )}
    </div>
  );
}

function GithubAuthControls({
  auth,
  onConnect,
}: {
  auth: GithubAuth;
  onConnect: () => void;
}) {
  if (!auth.authed) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        Connect GitHub
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700">
      <span>@{auth.login}</span>
      <button
        type="button"
        onClick={auth.signOut}
        className="text-neutral-400 hover:text-neutral-700"
        title="Disconnect"
      >
        ×
      </button>
    </div>
  );
}
