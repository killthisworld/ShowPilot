import React, { useEffect, useRef, useState } from "react";
import { AlarmClock } from "lucide-react";
import { readReminders, markFired, snoozeReminder, removeReminder, clockLabel, REMINDERS_CHANGED } from "@/lib/reminders";

// Goes off when a reminder is due (mounted once in App; Jay 2026-11-12).
// A banner over everything, a buzz and a beep; Done / 5 more min. When the
// app is in the background and the phone allows alerts, a system
// notification too. Checks every 10 seconds and the moment the app comes back.

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch { /* no sound */ }
}

async function systemAlert(r) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body = r.event ? `${r.event} · ${clockLabel(r.at)}` : clockLabel(r.at);
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) await reg.showNotification(r.text, { body, tag: r.id, icon: "/icon-192.png", renotify: true, requireInteraction: true });
    else new Notification(r.text, { body, tag: r.id });
  } catch { /* not allowed here */ }
}

export default function ReminderAlarm() {
  const [due, setDue] = useState([]); // reminders going off now
  const seen = useRef(new Set());

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const ringing = readReminders().filter((r) => !r.fired && r.at <= now);
      ringing.forEach((r) => {
        if (seen.current.has(r.id + r.at)) return;
        seen.current.add(r.id + r.at);
        try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* no buzz */ }
        beep();
        if (document.visibilityState !== "visible") systemAlert(r);
      });
      setDue(ringing);
    };
    check();
    const t = setInterval(check, 10000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(REMINDERS_CHANGED, check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener(REMINDERS_CHANGED, check); };
  }, []);

  if (!due.length) return null;
  const r = due[0];
  return (
    <div role="alertdialog" aria-label="Reminder" className="fixed inset-x-0 top-0 z-[120] px-3 pt-[max(10px,env(safe-area-inset-top))]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-lg rounded-2xl bg-[#1d1606] border-2 border-[#FFB547] shadow-[0_18px_50px_rgba(0,0,0,0.7)] p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-full bg-[#FFB547] flex items-center justify-center shrink-0 animate-pulse"><AlarmClock className="w-6 h-6 text-[#1d1606]" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold text-white leading-snug break-words">{r.text}</div>
            <div className="text-[13px] text-white/60 mt-0.5">{[clockLabel(r.at), r.event].filter(Boolean).join(" · ")}{due.length > 1 ? ` · ${due.length - 1} more` : ""}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => snoozeReminder(r.id, 5)} className="flex-1 h-12 rounded-xl bg-white/10 text-white text-[15px] font-semibold">5 more min</button>
          <button type="button" onClick={() => { markFired(r.id); }} className="flex-1 h-12 rounded-xl bg-[#FFB547] text-[#1d1606] text-[15px] font-bold">Done</button>
        </div>
        <button type="button" onClick={() => removeReminder(r.id)} className="self-center -mt-1 text-[12.5px] text-white/45">Delete it</button>
      </div>
    </div>
  );
}
