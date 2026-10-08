export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block min-w-[1.5em] rounded border border-neutral-300 bg-white px-1 text-center font-mono text-[11px] text-neutral-700 shadow-[0_1px_0_#d4d4d4]">
      {children}
    </kbd>
  );
}
