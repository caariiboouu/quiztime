import { useCallback, useRef, useState } from "react";
import bundledQuiz from "../../data/quiz.json";
import bundledTrivia from "../../data/afTrivia.json";
import type { QuizData, TriviaData } from "../../types";
import { useOverridableJson } from "../../hooks/useOverridableJson";
import { NavBar } from "../NavBar";
import { QUIZ_OVERRIDE_KEY } from "../quiz/QuizGame";
import { TRIVIA_OVERRIDE_KEY } from "../games/AFTrivia";
import { QuizEditor } from "./QuizEditor";
import { TriviaEditor } from "./TriviaEditor";
import { GithubError, getFile, putFile } from "../../lib/github";
import {
  decryptString,
  encryptString,
  type EncryptedBlob,
} from "../../lib/crypto";

const QUIZ_PATH = "src/data/quiz.json";
const TRIVIA_PATH = "src/data/afTrivia.json";
const AUTH_PATH = "public/auth.enc.json";
const AUTH_URL = `${import.meta.env.BASE_URL}auth.enc.json`;
const TOKEN_SESSION_KEY = "quiztime.admin.token";

type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type Stage =
  | { kind: "gate" }
  | { kind: "setup"; password: string }
  | { kind: "ready"; token: string };

type AdminPanelProps = {
  onExit: () => void;
};

export function AdminPanel({ onExit }: AdminPanelProps) {
  const [stage, setStage] = useState<Stage>(() => {
    const cached = sessionStorage.getItem(TOKEN_SESSION_KEY);
    return cached ? { kind: "ready", token: cached } : { kind: "gate" };
  });

  const handleAuthed = useCallback((token: string) => {
    sessionStorage.setItem(TOKEN_SESSION_KEY, token);
    setStage({ kind: "ready", token });
  }, []);

  if (stage.kind === "gate") {
    return (
      <Gate
        onExit={onExit}
        onAuthed={handleAuthed}
        onNeedsSetup={(password) => setStage({ kind: "setup", password })}
      />
    );
  }

  if (stage.kind === "setup") {
    return (
      <Setup
        password={stage.password}
        onAuthed={handleAuthed}
        onBack={() => setStage({ kind: "gate" })}
      />
    );
  }

  return (
    <Inner
      token={stage.token}
      onExit={onExit}
      onTokenInvalid={() => {
        sessionStorage.removeItem(TOKEN_SESSION_KEY);
        setStage({ kind: "gate" });
      }}
    />
  );
}

async function fetchAuthBlob(): Promise<EncryptedBlob | null> {
  const res = await fetch(AUTH_URL, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Auth fetch failed (${res.status})`);
  // Dev servers often fall back to index.html for missing files; only accept
  // real JSON.
  const text = await res.text();
  if (!text.trimStart().startsWith("{")) return null;
  try {
    return JSON.parse(text) as EncryptedBlob;
  } catch {
    return null;
  }
}

function Gate({
  onExit,
  onAuthed,
  onNeedsSetup,
}: {
  onExit: () => void;
  onAuthed: (token: string) => void;
  onNeedsSetup: (password: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await fetchAuthBlob();
      if (!blob) {
        onNeedsSetup(value);
        return;
      }
      const token = await decryptString(value, blob);
      onAuthed(token);
    } catch (err) {
      if (err instanceof DOMException && err.name === "OperationError") {
        setError("Wrong password.");
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy(false);
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
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            autoFocus
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="button"
            disabled={busy || !value}
            onClick={() => void submit()}
            className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
      </main>
    </div>
  );
}

function Setup({
  password,
  onAuthed,
  onBack,
}: {
  password: string;
  onAuthed: (token: string) => void;
  onBack: () => void;
}) {
  const [pat, setPat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pat.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await encryptString(password, pat.trim());
      const content = JSON.stringify(blob, null, 2) + "\n";
      const existing = await getFile(pat.trim(), AUTH_PATH);
      await putFile(
        pat.trim(),
        AUTH_PATH,
        content,
        "Initialize admin auth blob",
        existing?.sha,
      );
      onAuthed(pat.trim());
    } catch (err) {
      if (err instanceof GithubError && err.status === 401) {
        setError("Token rejected. Verify it has Contents: Read and write on this repo.");
      } else {
        setError(err instanceof Error ? err.message : "Setup failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <NavBar title="First-time setup" onBack={onBack} />
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold text-neutral-900">
            One-time setup
          </h2>
          <p className="mb-3 text-sm text-neutral-700">
            The site doesn't have a commit credential yet. Paste a GitHub personal
            access token below — it'll be encrypted with the password and saved
            to the repo. After this, anyone with the password can edit content
            without needing GitHub.
          </p>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
            <li>
              Open{" "}
              <a
                className="underline"
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub → fine-grained tokens
              </a>
              .
            </li>
            <li>
              Resource owner: your user. Repository access:{" "}
              <em>Only select repositories → caariiboouu/quiztime</em>.
            </li>
            <li>
              Repository permissions →{" "}
              <strong>Contents: Read and write</strong>.
            </li>
            <li>Generate and paste below (starts with <code>github_pat_</code>).</li>
          </ol>
          <input
            type="password"
            autoFocus
            placeholder="github_pat_…"
            value={pat}
            onChange={(e) => {
              setPat(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !pat.trim()}
              onClick={() => void submit()}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Initializing…" : "Initialize"}
            </button>
          </div>
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

function Inner({
  token,
  onExit,
  onTokenInvalid,
}: {
  token: string;
  onExit: () => void;
  onTokenInvalid: () => void;
}) {
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle" });

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

  const saveToRepo = async () => {
    const path = tab === "quiz" ? QUIZ_PATH : TRIVIA_PATH;
    const payload = tab === "quiz" ? quiz.data : trivia.data;
    const content = JSON.stringify(payload, null, 2) + "\n";
    setSaveStatus({ state: "saving" });
    try {
      const existing = await getFile(token, path);
      const summary =
        tab === "quiz"
          ? `Update ??? quiz content (${(payload as QuizData).categories.length} categories)`
          : `Update AF Trivia content (${(payload as TriviaData).questions.length} questions)`;
      await putFile(token, path, content, `${summary} via admin panel`, existing?.sha);
      (tab === "quiz" ? quiz : trivia).markSaved();
      setSaveStatus({
        state: "success",
        message: "Committed — Pages will rebuild in about a minute.",
      });
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Commit failed";
      if (err instanceof GithubError && err.status === 409) {
        msg = "Someone else committed first. Refresh the page and re-apply your edits.";
      } else if (err instanceof GithubError && err.status === 401) {
        msg = "The site's stored token is no longer valid. Click 'Re-initialize' to set a new one.";
      }
      setSaveStatus({ state: "error", message: msg });
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
            {active.isDirty && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              disabled={saveStatus.state === "saving"}
              onClick={() => void saveToRepo()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveStatus.state === "saving" ? "Saving…" : "Save to repo"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (tab === "quiz") downloadJson("quiz.json", quiz.data);
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
          Edits live in your browser. <strong>Save to repo</strong> commits the
          active tab and triggers a redeploy; other editors see the change on
          their next page load (~1 min).
        </div>
        {saveStatus.state === "success" && (
          <div className="border-t border-green-200 bg-green-50 px-6 py-2 text-sm text-green-900">
            {saveStatus.message}
          </div>
        )}
        {saveStatus.state === "error" && (
          <div className="flex items-center justify-between gap-3 border-t border-red-200 bg-red-50 px-6 py-2 text-sm text-red-900">
            <span>{saveStatus.message}</span>
            {saveStatus.message.includes("Re-initialize") && (
              <button
                type="button"
                onClick={onTokenInvalid}
                className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Re-initialize
              </button>
            )}
          </div>
        )}
      </div>

      {tab === "quiz" ? (
        <QuizEditor data={quiz.data} onChange={quiz.setData} />
      ) : (
        <TriviaEditor data={trivia.data} onChange={trivia.setData} />
      )}
    </div>
  );
}
