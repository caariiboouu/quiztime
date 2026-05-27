import { NavBar } from "../NavBar";
import { GameStage } from "./GameStage";

type CarrotInABoxProps = {
  onExit: () => void;
};

export function CarrotInABox({ onExit }: CarrotInABoxProps) {
  return (
    <div className="flex h-full flex-col">
      <NavBar title="Carrot in a Box" onBack={onExit} />
      <GameStage
        title="Carrot in a Box"
        description="One box has a carrot, the other is empty. Look inside, then convince the room your box is the one to pick."
      />
    </div>
  );
}
