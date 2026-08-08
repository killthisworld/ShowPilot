import { useState, useEffect } from "react";

// Persists state to localStorage under `key`, restoring it on mount so a
// page refresh (or accidental tab close) doesn't wipe out in-progress form
// data. Falls back to `initialValue` if nothing is saved yet, or if
// localStorage throws (private browsing, storage disabled, etc).
export function usePersistedState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage unavailable — fail silently, form still works in-memory
    }
  }, [key, state]);

  return [state, setState];
}

// Call after a successful submit/save so the next fresh visit doesn't
// reload stale leftover data.
export function clearPersistedState(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
