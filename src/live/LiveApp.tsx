import { HostApp } from "./HostApp";
import { PlayerApp } from "./PlayerApp";
import { liveConfigured } from "./api";
import { ArenaPracticePage } from "./arena/ArenaPracticePage";
import { FlockPage } from "./flock/FlockPage";
import { MascotGallery } from "./mascot/MascotGallery";

/** See ./routes.ts for the hash routes. */

export function LiveApp({ hash, onExit }: { hash: string; onExit: () => void }) {
  // Needs no server, so it works even before the Worker is deployed.
  if (hash === "#/live/mascot") return <MascotGallery onExit={onExit} />;
  if (hash === "#/live/flock") return <FlockPage onExit={onExit} />;
  // Shared with whoever else is there; practises offline if the server's away.
  if (hash === "#/live/arena") return <ArenaPracticePage onExit={onExit} />;
  if (!liveConfigured) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-neutral-600">
        The live quiz server isn't configured for this build (VITE_LIVE_API_URL).
      </div>
    );
  }
  if (hash === "#/live/host") return <HostApp onExit={onExit} />;
  const m = hash.match(/^#\/live\/join\/([A-Za-z]{4})$/);
  const code = m ? m[1].toUpperCase() : null;
  return <PlayerApp key={code ?? "entry"} code={code} onExit={onExit} />;
}
