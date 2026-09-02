import { useCallback, useEffect, useMemo } from "react";
import { usePersistentState } from "./usePersistentState";

export type OverridableJson<T> = {
  data: T;
  setData: (next: T) => void;
  reset: () => void;
  isOverridden: boolean;
  isDirty: boolean;
  markSaved: () => void;
};

/**
 * A local draft that takes precedence over the JSON compiled into the bundle,
 * so the admin panel can edit content before publishing it to the repo.
 *
 * The draft records which bundled snapshot it was made against. Once the repo
 * moves on — the draft was published, or someone else updated the standings —
 * the bundled data is authoritative and the draft is dropped. Without this the
 * draft shadows the repo forever: it is stored under the same key the public
 * page reads, so a browser that ever opened the admin panel would keep showing
 * its own months-old copy no matter how many times the bundle was rebuilt.
 */
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
  // Snapshot of the bundled data this draft was derived from.
  const [basedOn, setBasedOn] = usePersistentState<string | null>(
    `${storageKey}.basedOn`,
    null,
  );

  const bundledSnapshot = useMemo(() => JSON.stringify(bundled), [bundled]);

  // A draft from a previous release of the bundled data — including any draft
  // written before we started recording `basedOn` — no longer applies.
  const isStaleOverride = override !== null && basedOn !== bundledSnapshot;

  useEffect(() => {
    if (!isStaleOverride) return;
    setOverride(null);
    setLastSavedSnapshot(null);
    setBasedOn(null);
  }, [isStaleOverride, setOverride, setLastSavedSnapshot, setBasedOn]);

  // Resolved during render, not in the effect above, so a stale draft is never
  // painted even for one frame.
  const data = isStaleOverride ? bundled : (override ?? bundled);

  const isDirty = useMemo(() => {
    const current = JSON.stringify(data);
    const baseline = lastSavedSnapshot ?? bundledSnapshot;
    return current !== baseline;
  }, [data, bundledSnapshot, lastSavedSnapshot]);

  const setData = useCallback(
    (next: T) => {
      setOverride(next);
      setBasedOn(bundledSnapshot);
    },
    [setOverride, setBasedOn, bundledSnapshot],
  );

  const reset = useCallback(() => {
    setOverride(null);
    setLastSavedSnapshot(null);
    setBasedOn(null);
  }, [setOverride, setLastSavedSnapshot, setBasedOn]);

  const markSaved = useCallback(() => {
    setLastSavedSnapshot(JSON.stringify(data));
  }, [data, setLastSavedSnapshot]);

  return {
    data,
    setData,
    reset,
    isOverridden: !isStaleOverride && override !== null,
    isDirty,
    markSaved,
  };
}
