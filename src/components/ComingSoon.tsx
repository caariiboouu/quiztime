import { useState } from "react";

const REVEAL_PASSWORD = "afafafaf";

type ComingSoonProps = {
  onUnlock: () => void;
};

export function ComingSoon({ onUnlock }: ComingSoonProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === REVEAL_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-neutral-50 px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-5xl">🦆</div>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-neutral-900">
          Coming soon
        </h1>
        <p className="mb-8 text-neutral-600">
          We're putting the finishing touches on something fun. Thanks for your
          patience — check back shortly.
        </p>

        <div className="flex items-center gap-2">
          <input
            type="password"
            value={value}
            placeholder="Password"
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Enter
          </button>
        </div>
        {error && (
          <p className="mt-2 text-left text-sm text-red-600">
            That's not it — try again.
          </p>
        )}
      </div>
    </div>
  );
}
