import { useEffect, useState } from "react";

// Reminders (Jay 2026-11-12: a stage tech at load-in needed to set reminders
// for later in the set). Personal, kept on this phone, so they work with no
// signal: { id, text, at (ms), event, token, fired }. ReminderAlarm (mounted
// once in App) goes off when one is due: banner, vibration and a beep, plus
// a system notification when the app is in the background and alerts are
// allowed. If the phone has closed the app, the reminder shows as soon as it
// opens again (lock-screen alerts need push, which isn't set up yet).

const KEY = "sp-reminders";
export const REMINDERS_CHANGED = "showpilot:reminders-changed";

export function readReminders() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event(REMINDERS_CHANGED));
}
export function addReminder({ text, at, event = "", token = "" }) {
  const r = { id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), at, event, token, fired: false };
  write([...readReminders(), r].sort((a, b) => a.at - b.at));
  askToAlert();
  return r;
}
export function removeReminder(id) { write(readReminders().filter((r) => r.id !== id)); }
export function snoozeReminder(id, minutes = 5) {
  write(readReminders().map((r) => (r.id === id ? { ...r, at: Date.now() + minutes * 60000, fired: false } : r)).sort((a, b) => a.at - b.at));
}
export function markFired(id) { write(readReminders().map((r) => (r.id === id ? { ...r, fired: true } : r))); }

// The phone's own alerts, asked for the first time a reminder is set.
export function askToAlert() {
  try {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  } catch { /* not supported */ }
}

export function useReminders(token = null) {
  const [list, setList] = useState(readReminders);
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => setList(readReminders());
    window.addEventListener(REMINDERS_CHANGED, on);
    window.addEventListener("storage", on);
    const t = setInterval(() => tick((n) => n + 1), 30000); // keep "in 12 min" fresh
    return () => { window.removeEventListener(REMINDERS_CHANGED, on); window.removeEventListener("storage", on); clearInterval(t); };
  }, []);
  return token ? list.filter((r) => r.token === token) : list;
}

// "in 12 min", "in 1 hr 5 min", "now", "5 min ago"
export function untilLabel(at, now = Date.now()) {
  const m = Math.round((at - now) / 60000);
  if (Math.abs(m) < 1) return "now";
  const span = (x) => (x >= 60 ? `${Math.floor(x / 60)} hr${x % 60 ? ` ${x % 60} min` : ""}` : `${x} min`);
  return m > 0 ? `in ${span(m)}` : `${span(-m)} ago`;
}
export const clockLabel = (at) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
