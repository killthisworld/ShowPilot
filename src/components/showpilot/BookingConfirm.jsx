import React, { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";

// The sender's side once the venue answers (job 246, step 3): pick one of the
// dates offered and confirm. Confirming bursts the package open into the new
// event (the circles fly out, the event card lands), then links to it.
// On a laptop the offered dates sit side by side as cards.
const GREEN = "#8CFF3D";
const BLUE = "#60A5FA";
const RED = "#F87171";
const MONO = "'JetBrains Mono', monospace";
const COND = "'Barlow Condensed', sans-serif";
const fmt = (key, opts = { weekday: "short", month: "short", day: "numeric" }) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", opts);
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export function ConfirmDates({ pkg, venueName, busy, error, onConfirm }) {
  const offers = Array.isArray(pkg.offers) ? pkg.offers : [];
  const [pick, setPick] = useState(offers[0]?.date || "");
  return (
    <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex justify-center lg:items-center px-4 py-6 lg:px-10">
      <div className="w-full max-w-[460px] lg:max-w-[980px] flex flex-col gap-4 lg:gap-6">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-full shrink-0 border-2" style={{ borderColor: BLUE, background: "#1b2433" }} aria-hidden="true" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] tracking-[0.12em]" style={{ fontFamily: MONO, color: BLUE }}>{(venueName || "THE VENUE").toUpperCase()} REPLIED</span>
            <h1 className="text-[32px] lg:text-[44px] font-bold leading-none" style={{ fontFamily: COND }}>They can do {offers.length} date{offers.length === 1 ? "" : "s"}</h1>
          </div>
        </div>
        <div role="radiogroup" aria-label="Dates offered" className="flex flex-col gap-2.5 lg:grid lg:gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(offers.length, 1)}, minmax(0, 1fr))` }}>
          {offers.map((o) => {
            const on = pick === o.date;
            return (
              <button key={o.date} type="button" role="radio" aria-checked={on} onClick={() => setPick(o.date)} className="min-h-[80px] rounded-[14px] px-3.5 py-2.5 text-left flex items-center gap-3 border lg:relative lg:flex-col lg:items-start lg:gap-4 lg:p-5 lg:min-h-[220px]"
                style={on ? { borderColor: GREEN, background: `${GREEN}12` } : { borderColor: "#262626", background: "#151515" }}>
                <span className="w-[54px] h-[58px] lg:w-[76px] lg:h-[82px] rounded-[10px] bg-[#0f0f0f] border border-[#2a2a2a] flex flex-col items-center justify-center shrink-0">
                  <span className="text-[10px] tracking-[0.1em] text-white/60" style={{ fontFamily: MONO }}>{fmt(o.date, { weekday: "short" }).toUpperCase()}</span>
                  <span className="text-[26px] lg:text-[38px] font-bold leading-none" style={{ fontFamily: COND }}>{fmt(o.date, { day: "numeric" })}</span>
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[16px] lg:text-[20px] font-bold">{fmt(o.date)}</span>
                  <span className="text-[13px] lg:text-[14px] text-white/65">{[o.billing, o.set_time && `on at ${o.set_time}`, o.load_in && `load-in ${o.load_in}`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="w-[22px] h-[22px] rounded-full shrink-0 box-border lg:absolute lg:top-5 lg:right-5" style={on ? { border: `7px solid ${GREEN}`, background: "#0d0d0d" } : { border: "2px solid #444" }} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {pkg.venue_message && <div className="rounded-[12px] border border-[#262626] bg-[#151515] px-3.5 py-3 text-[14px] text-white/80">"{pkg.venue_message}"{venueName ? ` · ${venueName}` : ""}</div>}
        {error && <p className="text-center text-[14px] text-red-400">{error}</p>}
        <button type="button" disabled={!pick || busy} onClick={() => onConfirm(pick)} className="mt-2 min-h-[54px] lg:w-[420px] lg:self-center rounded-[12px] font-bold text-[16px] disabled:opacity-50" style={{ background: GREEN, color: "#0d0d0d" }}>
          {busy ? "Booking…" : pick ? `Confirm ${fmt(pick)}` : "Pick a date"}
        </button>
        <p className="text-center text-[12.5px] text-white/50">Confirming makes the event on {venueName || "the venue"}'s side with your info filled in, and puts it on your calendar.</p>
      </div>
    </div>
  );
}

// The package bursts open into the new event.
export function BookedBurst({ seed, actName, venueName, date, openHref }) {
  const [phase, setPhase] = useState(reduced() ? "card" : "burst");
  useEffect(() => {
    if (phase !== "burst") return undefined;
    const t = setTimeout(() => setPhase("card"), 1300);
    return () => clearTimeout(t);
  }, [phase]);
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a), y: Math.sin(a), i };
  });
  return (
    <IntakeSent seed={seed} bare>
      <style>{`
@keyframes bb-out { 0% { transform: translate(-50%,-50%) translate(0,0) scale(.4); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(-50%,-50%) translate(var(--dx), var(--dy)) scale(1); opacity: 0; } }
@keyframes bb-core { 0% { transform: translate(-50%,-50%) scale(.3); opacity: 0; } 30% { transform: translate(-50%,-50%) scale(1.15); opacity: 1; } 60% { transform: translate(-50%,-50%) scale(.95); } 100% { transform: translate(-50%,-50%) scale(0); opacity: 0; } }
@keyframes bb-card { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
`}</style>
      <div className="relative mx-auto" style={{ width: 280, height: 220 }}>
        {phase === "burst" && (
          <>
            <span aria-hidden="true" className="absolute left-1/2 top-1/2 w-24 h-24 rounded-full border-2" style={{ borderColor: RED, background: "#2a1c1c", boxShadow: `0 0 40px ${RED}99`, animation: "bb-core 1.1s ease-out both" }} />
            {dots.map((d) => (
              <span key={d.i} aria-hidden="true" className="absolute left-1/2 top-1/2 w-6 h-6 rounded-full" style={{ background: GREEN, boxShadow: `0 0 14px ${GREEN}aa`, "--dx": `${d.x * 140}px`, "--dy": `${d.y * 100}px`, animation: `bb-out 1.1s cubic-bezier(.2,.7,.3,1) ${0.25 + d.i * 0.02}s both` }} />
            ))}
          </>
        )}
        {phase === "card" && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-[16px] border-[1.5px] px-4 py-4 text-center" style={{ borderColor: BLUE, background: "rgba(21,21,21,0.95)", boxShadow: `0 0 40px ${BLUE}55`, animation: "bb-card .7s cubic-bezier(.2,.8,.2,1) both" }}>
            <div className="text-[10.5px] tracking-[0.12em]" style={{ fontFamily: MONO, color: "#93C5FD" }}>NEW EVENT</div>
            <div className="text-[32px] font-bold leading-none mt-1" style={{ fontFamily: COND }}>{actName}</div>
            <div className="text-[14px] text-white/75 mt-1">{[date ? fmt(date) : "", venueName].filter(Boolean).join(" · ")}</div>
          </div>
        )}
      </div>
      {phase === "card" && (
        <div className="flex flex-col gap-2.5 mt-6" style={{ animation: "bb-card .7s .2s cubic-bezier(.2,.8,.2,1) both" }}>
          <p className="text-white/70 text-[15px]"><CheckCircle className="inline w-4 h-4 mr-1 -mt-0.5" style={{ color: GREEN }} />Booked. It's on your calendar and {venueName || "the venue"}'s, with your info filled in.</p>
          {openHref && <a href={openHref} className="min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center" style={{ background: GREEN, color: "#0d0d0d" }}>Open the event</a>}
          <a href="/" className="text-[14px] text-white/60 underline mt-1">Back to ShowPilot</a>
        </div>
      )}
    </IntakeSent>
  );
}
