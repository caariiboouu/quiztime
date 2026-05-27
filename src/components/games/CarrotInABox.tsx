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
        description="One shipwrecked crate has a X, the other is empty. One person looks inside, the other has the ability two switch the crates once before revealing which crate the X is actually in. Look -> Debate -> Choose -> Reveal"
      />
    </div>
  );
}
