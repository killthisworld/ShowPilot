import React from "react";

// A time picker for schedules (job 230): the hour, the minutes in 15-minute
// steps, and AM / PM. It reads and writes the same text the schedule has
// always kept ("7:00 PM"), so day sheets and the run of show read it as
// before. A time typed in before (say "7:10 PM" or "19:00") still loads; an
// odd minute stays selectable until it's changed.

const MINUTES = ["00", "15", "30", "45"];

// "7:00 PM", "7pm", "19:00", "7:30" (no AM / PM written: taken as PM) -> parts.
export function parseTime(text) {
  const s = String(text || "").trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|p)?\.?\s*m?\.?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] || "00";
  let ap = m[3] ? (m[3] === "a" ? "AM" : "PM") : null;
  if (Number(min) > 59 || h > 23) return null;
  if (!ap) {
    // No AM / PM written: a 24-hour time, or an evening show time.
    if (h === 0) { h = 12; ap = "AM"; } else if (h > 12) { h -= 12; ap = "PM"; } else ap = "PM";
  } else if (h === 0) h = 12;
  if (h > 12) { h -= 12; ap = "PM"; }
  return { h: String(h), min, ap };
}

export const formatTime = ({ h, min, ap }) => (h ? `${h}:${min || "00"} ${ap || "PM"}` : "");

export default function TimeSelect({ value, onChange, disabled = false, color = "#8CFF3D", label = "Time", className = "" }) {
  const parsed = parseTime(value);
  const cur = parsed || { h: "", min: "00", ap: "PM" };
  const unreadable = !!String(value || "").trim() && !parsed;
  const set = (patch) => {
    const next = { ...cur, ...patch };
    if (!next.h) return onChange("");
    onChange(formatTime(next));
  };
  const sel = "h-11 rounded-[10px] bg-[#0f0f0f] border border-[#2a2a2a] text-white text-[15px] px-2 focus:outline-none focus:border-white/40 disabled:opacity-50 appearance-none text-center";
  const mins = MINUTES.includes(cur.min) ? MINUTES : [...MINUTES, cur.min].sort();
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label={label}>
      <select value={cur.h} onChange={(e) => set({ h: e.target.value })} disabled={disabled} aria-label={`${label}: hour`} className={`${sel} w-[52px]`} style={{ fontVariantNumeric: "tabular-nums" }}>
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-white/40" aria-hidden="true">:</span>
      <select value={cur.min} onChange={(e) => set({ min: e.target.value })} disabled={disabled || !cur.h} aria-label={`${label}: minutes`} className={`${sel} w-[56px]`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {mins.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <div className="flex rounded-[10px] border border-[#2a2a2a] overflow-hidden shrink-0" role="radiogroup" aria-label={`${label}: AM or PM`}>
        {["AM", "PM"].map((ap) => {
          const on = cur.ap === ap;
          return (
            <button key={ap} type="button" role="radio" aria-checked={on} disabled={disabled || !cur.h} onClick={() => set({ ap })}
              className="h-11 px-2.5 text-[13px] font-bold transition-colors disabled:opacity-50"
              style={on && cur.h ? { background: color, color: "#0d0d0d" } : { background: "#0f0f0f", color: "rgba(255,255,255,0.55)" }}>
              {ap}
            </button>
          );
        })}
      </div>
      {unreadable && <span className="text-[12px] text-white/45 truncate" title={value}>was “{value}”</span>}
    </div>
  );
}
