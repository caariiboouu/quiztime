type NavBarProps = {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function NavBar({ title, onBack, right }: NavBarProps) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ← Back
          </button>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h1>
      </div>
      <div>{right}</div>
    </header>
  );
}
