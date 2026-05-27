import { NavBar } from "../NavBar";
import { GameStage } from "./GameStage";

type CarrotInABoxProps = {
  onExit: () => void;
};

export function CarrotInABox({ onExit }: CarrotInABoxProps) {
  return (
    <div className="flex h-full flex-col">
      <NavBar title="X in a Crate" onBack={onExit} />
      <GameStage
        title="X in a Crate"
        description="One shipwrecked crate has a X, the other is empty. Look inside, then convince the room your box is the one to pick."
      />
    </div>
  );
}
