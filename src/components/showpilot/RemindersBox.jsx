import React, { useState } from "react";
import { AlarmClock, X, Plus } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { useReminders, addReminder, removeReminder, untilLabel, clockLabel } from "@/lib/reminders";

// Reminders at the top of My tasks and an event's task page (Jay
// 2026-11-12). Type what, tap when ("15 min", "1 hr", or a time), done.
// `event` / `token` tie a reminder to an event (the event's task page shows
// only its own). Kept on this phone; ReminderAlarm goes off when one's due.

const QUICK = [[5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hr"]];

export default function RemindersBox({ event = "", token = "", accent = "#FFB547" }) {
  const list = useReminders(token || null).filter((r) => !r.fired || r.at > Date.now() - 6 * 3600000);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [err, setErr] = useState("");

  const save = (at) => {
    if (!text.trim()) { setErr("What should it remind you of?"); return; }
    addReminder({ text, at, event, token });
    setText(""); setTime(""); setErr(""); setAdding(false);
  };
  const atClock = () => {
    if (!time) return;
    const [h, m] = time.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1); // a time already past means tomorrow
    save(d.getTime());
  };

  const upcoming = list.filter((r) => !r.fired);
  const past = list.filter((r) => r.fired);
  return (
    <section className="flex flex-col gap-1.5" aria-label="Reminders">
      <div className="flex items-center gap-2">
        <span className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: accent }}>REMINDERS{upcoming.length ? ` · ${upcoming.length}` : ""}</span>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="ml-auto h-8 px-2.5 -mr-1 rounded-lg flex items-center gap-1 text-[13px] font-semibold" style={{ color: accent }}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />Remind me
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-[10px] bg-[#181818] border border-[#2e2e2e] p-3 flex flex-col gap-2.5" style={{ borderLeft: `3px solid ${accent}` }}>
          <input value={text} onChange={(e) => { setText(e.target.value); setErr(""); }} autoFocus maxLength={120} aria-label="Remind me to"
            placeholder="e.g. Swap guitar mic before song 6" className="h-11 px-3 rounded-lg bg-[#0d0d0d] border border-[#2a2a2a] text-white text-[16px] outline-none focus:border-white/40" />
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK.map(([m, l]) => (
              <button key={m} type="button" onClick={() => save(Date.now() + m * 60000)} className="h-10 rounded-lg bg-[#232323] text-white text-[13.5px] font-semibold active:brightness-125">{l}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="At a time" className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-[#0d0d0d] border border-[#2a2a2a] text-white text-[16px] outline-none [color-scheme:dark]" />
            <button type="button" onClick={atClock} disabled={!time} className="h-10 px-4 rounded-lg text-[13.5px] font-bold text-[#0d0d0d] disabled:opacity-40" style={{ background: accent }}>Set</button>
            <button type="button" onClick={() => { setAdding(false); setErr(""); }} className="h-10 px-3 rounded-lg text-white/60 text-[13.5px]">Cancel</button>
          </div>
          {err && <p className="m-0 text-[12.5px] text-red-400">{err}</p>}
        </div>
      )}

      {upcoming.map((r) => (
        <div key={r.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] bg-[#181818] border border-[#262626]" style={{ borderLeft: `3px solid ${accent}` }}>
          <AlarmClock className="w-[18px] h-[18px] shrink-0" style={{ color: accent }} />
          <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
            <span className="text-[14px] font-semibold leading-snug">{r.text}</span>
            <span className="text-[10.5px] text-white/60 truncate" style={{ fontFamily: SCENE_MONO }}>{clockLabel(r.at)} · {untilLabel(r.at).toUpperCase()}{r.event && !token ? ` · ${r.event.toUpperCase()}` : ""}</span>
          </div>
          <button type="button" onClick={() => removeReminder(r.id)} aria-label={`Delete reminder "${r.text}"`} className="w-9 h-9 -mr-1 shrink-0 rounded-lg flex items-center justify-center text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      ))}
      {past.map((r) => (
        <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] border border-[#222] opacity-55">
          <AlarmClock className="w-4 h-4 shrink-0 text-white/50" />
          <span className="flex-1 min-w-0 text-[13px] line-through truncate">{r.text}</span>
          <span className="text-[10.5px] text-white/50 shrink-0" style={{ fontFamily: SCENE_MONO }}>{clockLabel(r.at)}</span>
          <button type="button" onClick={() => removeReminder(r.id)} aria-label={`Clear reminder "${r.text}"`} className="w-8 h-8 -mr-1 shrink-0 rounded-lg flex items-center justify-center text-white/40"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {!adding && !list.length && <p className="m-0 text-[12.5px] text-white/40">Set a reminder for later in the set: it goes off on this phone.</p>}
    </section>
  );
}
