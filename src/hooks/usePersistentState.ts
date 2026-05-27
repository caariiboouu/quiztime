import { useEffect, useState } from "react";

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable (private mode, quota); ignore.
    }
  }, [key, value]);

  return [value, setValue];
}

export function clearPersistentState(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
