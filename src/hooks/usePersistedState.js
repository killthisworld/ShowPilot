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

// Call this BEFORE navigating to /show/new from anywhere in the app.
// usePersistedState reads localStorage synchronously on a component's very
// first render (the lazy useState initializer above), which happens before
// any cleanup effect from a page you're leaving gets a chance to run - so
// clearing reactively on unmount is too late and can leak an abandoned
// draft's acts/fields into a "new" event that was never actually related to
// it. Clearing proactively here, synchronously, right when the person
// clicks "+" - before the navigation and before the next mount reads
// anything - is what actually guarantees a clean slate.
export function clearNewShowDraft() {
  try {
    localStorage.removeItem("showdetail_draft_new_show");
    localStorage.removeItem("showdetail_draft_new_bands");
    localStorage.removeItem("showdetail_draft_new_saved_at");
  } catch {
    // ignore
  }
}
