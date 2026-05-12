import { useState, useCallback } from "react";

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * State survives tab navigation within the session but clears on browser close.
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setStateAndStore = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: T) => T)(prev)
            : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [key]
  ) as React.Dispatch<React.SetStateAction<T>>;

  return [state, setStateAndStore];
}
