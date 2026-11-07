import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import TimeSelect from "@/components/showpilot/TimeSelect";
import { DAYS } from "@/lib/bookingPackage";

// The venue offers up to 3 dates for a booking package (job 246, step 2).
// Nights the act wants are outlined in their red; nights the venue already
// has an event are crossed out. Set time, load-in and billing go with every
// date offered. On a laptop the calendar sits on the left and the details
// (picked dates, billing, times, note, Offer) on the right, all on one screen.
const BLUE = "#60A5FA";
const RED = "#F87171";
const MONO = "'JetBrains Mono', monospace";
const label = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function OfferDates({ wants = {}, booked = new Set(), initial = null, actName, submitting = false, error = "", onSubmit, onBack }) {
  const firstMonth = useMemo(() => {
    const ms = (wants.months || []).filter((k) => k !== "any").sort();
    const now = new Date();
    if (ms.length) {
      const [y, m] = ms[0].split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      return d < new Date(now.getFullYear(), now.getMonth(), 1) ? new Date(now.getFullYear(), now.getMonth(), 1) : d;
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, [wants.months]);
  const [view, setView] = useState(firstMonth);
  const first = initial?.offers?.[0] || {};
  const [picked, setPicked] = useState(() => (initial?.offers || []).map((o) => o.date));
  const [setTime, setSetTime] = useState(first.set_time || "");
  const [loadIn, setLoadIn] = useState(first.load_in || "");
  const [billing, setBilling] = useState(first.billing || "Headliner");
  const [message, setMessage] = useState(initial?.message || "");

  const y = view.getFullYear(), m = view.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const wantDays = Array.isArray(wants.days) ? wants.days : [];
  const wantMonths = Array.isArray(wants.months) ? wants.months : [];
  const monthWanted = wantMonths.includes("any") || wantMonths.includes(`${y}-${String(m + 1).padStart(2, "0")}`);
  const toggle = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < 3 ? [...p, key].sort() : p));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    const key = iso(y, m, d);
    const date = new Date(y, m, d);
    const past = date < today;
    const isBooked = booked.has(key);
    const want = monthWanted && (wantDays.length === 0 || wantDays.includes(DOW_KEYS[date.getDay()]));
    cells.push({ d, key, past, isBooked, want, on: picked.includes(key) });
  }
  const n = picked.length;
  const fmt = (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] tracking-[0.14em]" style={{ fontFamily: MONO, color: BLUE }}>OFFER DATES TO {(actName || "THEM").toUpperCase()}</span>
        <h1 className="text-[34px] lg:text-[44px] font-bold leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Pick up to 3</h1>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:items-start">
      <div className="flex flex-col gap-4 lg:rounded-[18px] lg:border lg:border-[#1f1f1f] lg:bg-[#111] lg:p-5">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous month" onClick={() => setView(new Date(y, m - 1, 1))} className="w-11 h-11 rounded-[10px] border border-[#333] flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
        <span className="flex-1 text-center text-[16px] font-bold">{view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button type="button" aria-label="Next month" onClick={() => setView(new Date(y, m + 1, 1))} className="w-11 h-11 rounded-[10px] border border-[#333] flex items-center justify-center"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAYS.map((d) => <span key={d.key} className="text-[10px] tracking-[0.08em] text-white/50 pb-0.5" style={{ fontFamily: MONO }}>{d.label.toUpperCase()}</span>)}
        {cells.map((c, i) => c ? (
          <button key={c.key} type="button" disabled={c.past || c.isBooked} aria-pressed={c.on} onClick={() => toggle(c.key)}
            aria-label={`${fmt(c.key)}${c.isBooked ? ", you already have an event" : c.want ? ", a night they want" : ""}`}
            className="h-11 lg:h-[52px] rounded-[10px] text-[14px] lg:text-[16px] font-bold border disabled:cursor-not-allowed"
            style={c.isBooked ? { background: "#1f1f1f", color: "rgba(255,255,255,0.3)", borderColor: "#1f1f1f", textDecoration: "line-through" }
              : c.on ? { background: BLUE, color: "#0d0d0d", borderColor: BLUE }
              : c.past ? { color: "rgba(255,255,255,0.2)", borderColor: "transparent" }
              : c.want ? { color: "#fff", borderColor: `${RED}99` }
              : { color: "rgba(255,255,255,0.55)", borderColor: "#262626" }}>
            {c.d}
          </button>
        ) : <span key={`b${i}`} />)}
      </div>
      <div className="flex gap-4 flex-wrap text-[12px] text-white/60 justify-center">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] border" style={{ borderColor: `${RED}99` }} />Nights they want</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[#2a2a2a]" />You already have an event</span>
      </div>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
      <div className="hidden lg:flex items-center justify-between">
        <span className={label + " mb-0"} style={{ fontFamily: MONO }}>DATES YOU'RE OFFERING</span>
        <span className="text-[12px] text-white/50" style={{ fontFamily: MONO }}>{n} / 3</span>
      </div>
      {n === 0 && <p className="hidden lg:block m-0 text-[14px] text-white/45 rounded-[12px] border border-dashed border-[#2a2a2a] px-3 py-3 text-center">Tap nights on the calendar.</p>}

      {n > 0 && (
        <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
          {picked.map((k) => (
            <button key={k} type="button" onClick={() => toggle(k)} aria-label={`Remove ${fmt(k)}`} className="min-h-[40px] pl-3 pr-2 rounded-full text-[13.5px] font-bold flex items-center gap-1.5" style={{ background: `${BLUE}22`, color: "#93C5FD", border: `1px solid ${BLUE}66` }}>{fmt(k)}<X className="w-3.5 h-3.5" /></button>
          ))}
        </div>
      )}

      <div className="rounded-[14px] border border-[#262626] bg-[#151515] p-4 flex flex-col gap-4">
        <div>
          <span className={label} style={{ fontFamily: MONO }}>BILLING</span>
          <div className="flex gap-2 flex-wrap">
            {["Opener", "Support", "Headliner"].map((b) => (
              <button key={b} type="button" aria-pressed={billing === b} onClick={() => setBilling(b)} className="min-h-[44px] px-4 rounded-full text-[14px] font-bold border"
                style={billing === b ? { borderColor: RED, background: `${RED}22`, color: "#FCA5A5" } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" }}>{b}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div><span className={label} style={{ fontFamily: MONO }}>THEY'D GO ON AT</span><TimeSelect value={setTime} onChange={setSetTime} color={BLUE} label="Set time" /></div>
          <div><span className={label} style={{ fontFamily: MONO }}>LOAD-IN</span><TimeSelect value={loadIn} onChange={setLoadIn} color={BLUE} label="Load-in" /></div>
        </div>
        <label>
          <span className={label} style={{ fontFamily: MONO }}>NOTE FOR THEM (OPTIONAL)</span>
          <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Friday usually draws better." className="w-full min-h-[44px] px-3 py-2.5 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40 resize-none" />
        </label>
      </div>

      {error && <p className="text-center text-[14px] text-red-400">{error}</p>}
      <button type="button" disabled={!n || submitting} onClick={() => onSubmit(picked.map((date) => ({ date, set_time: setTime, load_in: loadIn, billing })), message)}
        className="min-h-[54px] rounded-[12px] font-bold text-[16px] disabled:opacity-50" style={{ background: BLUE, color: "#0d0d0d" }}>
        {submitting ? "Sending…" : n ? `Offer ${n} date${n === 1 ? "" : "s"}` : "Pick a date"}
      </button>
      {onBack && <button type="button" onClick={onBack} className="min-h-[44px] text-[14px] text-white/60">Back to their package</button>}
      </div>
      </div>
    </div>
  );
}
