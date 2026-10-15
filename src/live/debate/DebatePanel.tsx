import { Suspense, lazy, type ComponentProps } from "react";
import { hasWebGL } from "../minigames/three/fallbackContext";

const DebateStage = lazy(() => import("./DebateStage"));

/** The debate floor, lazy-loaded, with a plain list where 3D isn't possible. */
export function DebatePanel(props: ComponentProps<typeof DebateStage>) {
  if (!hasWebGL()) {
    const side = (s: "for" | "against") => props.players.filter((p) => props.sides[p.id] === s).map((p) => p.name);
    return (
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm">
        <p>
          <strong className="text-sky-700">{props.names.for}:</strong> {side("for").join(", ") || "nobody yet"}
        </p>
        <p className="text-right">
          <strong className="text-rose-700">{props.names.against}:</strong> {side("against").join(", ") || "nobody yet"}
        </p>
      </div>
    );
  }
  return (
    <Suspense fallback={<p className="py-16 text-center text-neutral-500">Setting up the debate floor…</p>}>
      <DebateStage {...props} />
    </Suspense>
  );
}
