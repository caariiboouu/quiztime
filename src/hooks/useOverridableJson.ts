import { usePersistentState } from "./usePersistentState";

export type OverridableJson<T> = {
  data: T;
  setData: (next: T) => void;
  reset: () => void;
  isOverridden: boolean;
};

export function useOverridableJson<T>(
  storageKey: string,
  bundled: T,
): OverridableJson<T> {
  const [override, setOverride] = usePersistentState<T | null>(
    storageKey,
    null,
  );
  return {
    data: override ?? bundled,
    setData: (next: T) => setOverride(next),
    reset: () => setOverride(null),
    isOverridden: override !== null,
  };
}
