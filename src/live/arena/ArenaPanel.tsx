import { Suspense, lazy } from "react";
import type { ArenaLayout } from "../../../shared/arena";
import { hasWebGL } from "../minigames/three/fallbackContext";
import type { ArenaMember } from "./ArenaScene";
import type { ArenaSource } from "./source";

const ArenaScene = lazy(() => import("./ArenaScene"));

/** The arena canvas, lazy-loaded, with a plain fallback where 3D isn't possible. */
export function ArenaPanel(props: {
  layout: ArenaLayout;
  options: { id: string; text: string }[];
  members: ArenaMember[];
  source: ArenaSource;
  youId?: string;
  reveal?: { correctIndex: number | null } | null;
  follow?: string | null;
  current?: number | null;
  safeBottom?: number;
  className?: string;
}) {
  const description = `Answer arena with ${props.members.length} ducks. Answers: ${props.options
    .map((o, i) => `${i + 1}. ${o.text}`)
    .join("; ")}.`;
  if (!hasWebGL()) {
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-neutral-600">
        This device can't show the 3D arena. Press 1–{props.options.length} to pick an answer.
      </p>
    );
  }
  return (
    <Suspense fallback={<p className="py-24 text-center text-neutral-500">Setting up the arena…</p>}>
      <ArenaScene {...props} description={description} />
    </Suspense>
  );
}
