import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// Working with no signal (job 73, "On the road" stage 9).
//  - keep(key, value) / kept(key): the last copy of something (a day sheet,
//    a guest list) on this phone, so it still opens without signal.
//  - later(rpc, args): an action done without signal (checking a guest in),
//    sent when the phone is back online.
//  - useOnline(): whether the phone has signal right now.

const KEEP = "sp-kept:";
const QUEUE = "sp-later";
export const OFFLINE_CHANGED = "showpilot:offline-changed";

export function keep(key, value) {
  try { localStorage.setItem(KEEP + key, JSON.stringify({ at: Date.now(), value })); } catch { /* storage full or blocked */ }
}
export function kept(key) {
  try { return JSON.parse(localStorage.getItem(KEEP + key) || "null")?.value ?? null; } catch { return null; }
}
export function keptAt(key) {
  try { return JSON.parse(localStorage.getItem(KEEP + key) || "null")?.at ?? null; } catch { return null; }
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE) || "[]"); } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(OFFLINE_CHANGED));
}
export const waiting = () => readQueue().length;

// Call an RPC now, or (no signal / network error) save it for later.
// Resolves { queued: true } when saved for later.
export async function nowOrLater(fn, args) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    writeQueue([...readQueue(), { fn, args, at: Date.now() }]);
    return { queued: true };
  }
  const { error } = await supabase.rpc(fn, args);
  if (error && /fetch|network|Failed/i.test(error.message || "")) {
    writeQueue([...readQueue(), { fn, args, at: Date.now() }]);
    return { queued: true };
  }
  return { error };
}

let flushing = false;
export async function flushLater() {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  flushing = true;
  try {
    let q = readQueue();
    while (q.length) {
      const [next, ...rest] = q;
      const { error } = await supabase.rpc(next.fn, next.args);
      if (error && /fetch|network|Failed/i.test(error.message || "")) break; // still no signal
      if (error) console.error("Dropped a saved change", next.fn, error); // refused: don't retry forever
      q = rest;
      writeQueue(q);
    }
  } finally {
    flushing = false;
  }
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [pending, setPending] = useState(waiting);
  useEffect(() => {
    const on = () => { setOnline(true); flushLater(); };
    const off = () => setOnline(false);
    const changed = () => setPending(waiting());
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(OFFLINE_CHANGED, changed);
    if (navigator.onLine !== false) flushLater();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(OFFLINE_CHANGED, changed);
    };
  }, []);
  return { online, pending };
}
