import { execSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Identifier for this build. GitHub Pages serves index.html with only a
 * 10-minute max-age and we cannot set headers on it, so browsers (Safari
 * especially) can pin an old app shell — and with it an old hashed bundle —
 * more or less indefinitely. Stamping the build lets the running app notice
 * it has been superseded. See `src/lib/version.ts`.
 */
function buildId(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // Not a git checkout (tarball build); a timestamp still changes per build.
    return String(Date.now());
  }
}

/** Emits an unhashed version.json the app polls to detect a stale shell. */
function versionManifest(id: string): Plugin {
  return {
    name: "quiztime-version-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: id }),
      });
    },
  };
}

const id = buildId();

export default defineConfig({
  plugins: [react(), versionManifest(id)],
  base: "/quiztime/",
  define: {
    __BUILD_ID__: JSON.stringify(id),
  },
});
