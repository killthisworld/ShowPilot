import { useCallback, useEffect, useState } from "react";
import { fetchNeedsMe, TASK_ADDED_EVENT } from "@/lib/needsMe";

// One shared copy of get_needs_me for the company phone layout: the Needs me
// home, the Chats tab and the bottom bar's unread badge all read it, so a
// screen with all three still makes one request. Refreshes when a task is
// added from the "+" sheet and when the app comes back to the foreground.
let cache = null; // { data, at }
let inflight = null;
const listeners = new Set();
const FRESH_MS = 20000;

function load(force = false) {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = fetchNeedsMe().then((data) => {
    inflight = null;
    // A failed call keeps the last good copy rather than blanking the screen.
    if (data || !cache) cache = { data, at: Date.now() };
    listeners.forEach((fn) => fn(cache.data));
    return cache.data;
  });
  return inflight;
}

// Lets a screen patch the shared copy right away (e.g. a task marked done)
// without waiting for the next fetch.
export function patchNeedsMe(fn) {
  if (!cache?.data) return;
  cache = { data: fn(cache.data), at: cache.at };
  listeners.forEach((l) => l(cache.data));
}

export default function useNeedsMe(enabled = true) {
  const [data, setData] = useState(() => cache?.data ?? null);
  const [loading, setLoading] = useState(() => !cache);

  useEffect(() => {
    if (!enabled) return;
    const onData = (d) => { setData(d); setLoading(false); };
    listeners.add(onData);
    load().then(onData);
    const refresh = () => load(true);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener(TASK_ADDED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(onData);
      window.removeEventListener(TASK_ADDED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  const reload = useCallback(() => load(true), []);
  return { data, loading, reload, failed: !loading && data === null };
}
