type GameStageProps = {
  title: string;
  description: string;
};

export function GameStage({ title, description }: GameStageProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="mb-4 text-5xl font-semibold tracking-tight text-neutral-900">
        {title}
      </h2>
      <p className="max-w-xl text-lg text-neutral-600">{description}</p>
      <p className="mt-12 rounded-md border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-500">
        Drive the game in the room — back out when you're done.
      </p>
    </main>
  );
}
