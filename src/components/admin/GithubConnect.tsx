import { useState } from "react";
import { GithubError, validateToken } from "../../lib/github";
import { usePersistentState } from "../../hooks/usePersistentState";

const TOKEN_KEY = "quiztime.github.token";
const LOGIN_KEY = "quiztime.github.login";

export type GithubAuth = {
  token: string | null;
  login: string | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
  authed: boolean;
};

export function useGithubAuth(): GithubAuth {
  const [token, setToken] = usePersistentState<string | null>(TOKEN_KEY, null);
  const [login, setLogin] = usePersistentState<string | null>(LOGIN_KEY, null);

  return {
    token,
    login,
    authed: !!token && !!login,
    signIn: async (next: string) => {
      const { login: name } = await validateToken(next);
      setToken(next);
      setLogin(name);
    },
    signOut: () => {
      setToken(null);
      setLogin(null);
    },
  };
}

type GithubConnectModalProps = {
  onSignIn: (token: string) => Promise<void>;
  onClose: () => void;
};

export function GithubConnectModal({ onSignIn, onClose }: GithubConnectModalProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSignIn(value.trim());
      onClose();
    } catch (err) {
      if (err instanceof GithubError && err.status === 401) {
        setError("Token rejected. Double-check you copied it correctly and that it has Contents: Read and write on this repo.");
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">
          Connect to GitHub
        </h2>
        <p className="mb-3 text-sm text-neutral-700">
          Paste a personal access token below. The token saves to your browser
          and is used to commit changes back to the repo.
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
          <li>Resource owner: your user. Repository access: <em>Only select repositories → caariiboouu/quiztime</em>.</li>
          <li>Repository permissions → <strong>Contents: Read and write</strong>.</li>
          <li>Generate, copy the token (starts with <code>github_pat_</code>), paste below.</li>
        </ol>
        <input
          type="password"
          autoFocus
          placeholder="github_pat_…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
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
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !value.trim()}
            onClick={() => void submit()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Checking…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
