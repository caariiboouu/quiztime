import { useCallback, useMemo } from "react";
import { usePersistentState } from "./usePersistentState";

export type OverridableJson<T> = {
  data: T;
  setData: (next: T) => void;
  reset: () => void;
  isOverridden: boolean;
  isDirty: boolean;
  markSaved: () => void;
};

export function useOverridableJson<T>(
  storageKey: string,
  bundled: T,
): OverridableJson<T> {
  const [override, setOverride] = usePersistentState<T | null>(
    storageKey,
    null,
  );
  const [lastSavedSnapshot, setLastSavedSnapshot] = usePersistentState<
    string | null
  >(`${storageKey}.lastSaved`, null);

  const data = override ?? bundled;

  const isDirty = useMemo(() => {
    const current = JSON.stringify(data);
    const baseline = lastSavedSnapshot ?? JSON.stringify(bundled);
    return current !== baseline;
  }, [data, bundled, lastSavedSnapshot]);

  const reset = useCallback(() => {
    setOverride(null);
    setLastSavedSnapshot(null);
  }, [setOverride, setLastSavedSnapshot]);

  const markSaved = useCallback(() => {
    setLastSavedSnapshot(JSON.stringify(data));
  }, [data, setLastSavedSnapshot]);

  return {
    data,
    setData: setOverride,
    reset,
    isOverridden: override !== null,
    isDirty,
    markSaved,
  };
}
