import { NavBar } from "../NavBar";
import { GameStage } from "./GameStage";

type CookieFaceProps = {
  onExit: () => void;
};

export function CookieFace({ onExit }: CookieFaceProps) {
  return (
    <div className="flex h-full flex-col">
      <NavBar title="Cookie Face" onBack={onExit} />
      <GameStage
        title="Cookie Face"
        description="Place a cookie on your forehead and get it into your mouth without using your hands to determine who gets rations."
      />
    </div>
  );
}
