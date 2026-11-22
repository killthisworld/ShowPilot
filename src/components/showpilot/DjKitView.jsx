import React, { useEffect, useState } from "react";
import { Play, Download, Mail, Phone, Disc3, ChevronLeft, ChevronRight, Check, X, Loader2, CalendarPlus } from "lucide-react";
import { DJ_COLOR } from "@/lib/djTools";
import { href, platformOf, requestDate, todayIso } from "@/lib/djKit";

// The DJ press kit as people read it (job 457). Used by DJ mode's Profile
// tab (the DJ's own view) and by the public link (/kit/:token).
//   kit: { name, photo_url, genre_tags, city, bio, mixes, press_photos,
//          logo_url, links, contact_name, contact_email, contact_phone, dates }
//   own: the DJ's view (empty sections say what to add instead of hiding)

export const mono = { fontFamily: "'JetBrains Mono', monospace" };
export const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function Label({ children, right }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[11px] tracking-[0.18em] text-white/65 font-medium" style={mono}>{children}</h2>
      {right}
    </div>
  );
}

export function GenreChips({ genres }) {
  if (!genres?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {genres.map((g) => (
        <span key={g} className="px-2.5 py-[3px] rounded-full text-[12px] font-semibold" style={{ background: `${DJ_COLOR}1f`, color: DJ_COLOR }}>{g}</span>
      ))}
    </div>
  );
}

export function Avatar({ name, url, size = 84 }) {
  const initials = (name || "DJ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="rounded-full overflow-hidden shrink-0 bg-[#1c1d24] flex items-center justify-center" style={{ width: size, height: size, border: `2px solid ${DJ_COLOR}` }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <span style={{ ...cond, color: DJ_COLOR, fontSize: size * 0.36 }}>{initials}</span>}
    </div>
  );
}

function Empty({ children }) {
  return <p className="m-0 text-[14px] text-white/50">{children}</p>;
}

export function Dates({ dates, own }) {
  return (
    <section className="flex flex-col gap-2">
      <Label right={own ? <span className="text-[12px] text-white/50">From your Bookings</span> : null}>UPCOMING DATES</Label>
      {dates?.length ? dates.map((d, i) => {
        const dt = new Date(`${d.date}T00:00:00`);
        return (
          <div key={`${d.date}-${i}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#101116] border border-[#262626]">
            <div className="w-11 text-center text-[10px] tracking-[0.1em] leading-tight" style={{ ...mono, color: DJ_COLOR }}>
              {MON[dt.getMonth()]}<div className="text-[22px] text-white tracking-normal" style={cond}>{dt.getDate()}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold truncate">{d.name}</div>
              {d.venue && <div className="text-[13px] text-white/60 truncate">{d.venue}</div>}
            </div>
          </div>
        );
      }) : <Empty>{own ? "Gigs you're booked for show up here by themselves." : "No dates announced yet."}</Empty>}
    </section>
  );
}

export function Mixes({ mixes, own }) {
  const list = (mixes || []).filter((m) => m?.url);
  if (!list.length && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>{own ? "MIXES" : "LISTEN"}</Label>
      {list.length ? list.map((m, i) => (
        <a key={`${m.url}-${i}`} href={href(m.url)} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-xl bg-[#101116] border border-[#262626] text-white no-underline hover:border-white/25">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: DJ_COLOR, color: "#000" }}><Play className="w-4 h-4 fill-current ml-0.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold truncate">{m.title || "Mix"}</span>
            <span className="block text-[12.5px] text-white/60">{platformOf(m.url)}</span>
          </span>
        </a>
      )) : <Empty>Add links to your mixes so promoters can hear your sound.</Empty>}
    </section>
  );
}

export function Photos({ photos, logo, own, grid = "grid-cols-3" }) {
  const list = [...(photos || []).filter((p) => p?.url).map((p) => ({ ...p, kind: "Photo" })), ...(logo ? [{ url: logo, kind: "Logo" }] : [])];
  if (!list.length && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>{"PRESS PHOTOS & LOGO"}</Label>
      {list.length ? (
        <div className={`grid gap-2 ${grid}`}>
          {list.map((p, i) => (
            <a key={`${p.url}-${i}`} href={p.url} target="_blank" rel="noreferrer" download className="relative block aspect-[4/5] rounded-[10px] overflow-hidden bg-[#1c1d24] border border-[#262626] group" aria-label={`Open ${p.kind.toLowerCase()} full size`}>
              <img src={p.url} alt="" className={`w-full h-full ${p.kind === "Logo" ? "object-contain p-3" : "object-cover"}`} />
              <span className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white/90"><Download className="w-3.5 h-3.5" /></span>
            </a>
          ))}
        </div>
      ) : <Empty>Add press photos and your logo, so promoters can grab them for flyers.</Empty>}
      {!own && list.length > 0 && <span className="text-[12px] text-white/50">Tap one to open it at full size.</span>}
    </section>
  );
}

export function Links({ links, own }) {
  const list = (links || []).filter((l) => l?.url);
  if (!list.length && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>LINKS</Label>
      {list.length ? (
        <div className="flex flex-wrap gap-2">
          {list.map((l, i) => (
            <a key={`${l.url}-${i}`} href={href(l.url)} target="_blank" rel="noreferrer" className="min-h-[38px] px-3.5 rounded-full border border-white/20 flex items-center text-[13.5px] font-semibold text-white no-underline hover:border-white/45">
              {l.kind || platformOf(l.url)}
            </a>
          ))}
        </div>
      ) : <Empty>Add your Instagram, SoundCloud, Resident Advisor and more.</Empty>}
    </section>
  );
}

export function Contact({ kit, own, title = "BOOKING CONTACT" }) {
  const has = kit.contact_name || kit.contact_email || kit.contact_phone;
  if (!has && !own) return null;
  return (
    <section className="px-3.5 py-3 rounded-xl bg-[#101116] border border-[#262626] flex flex-col gap-1.5">
      <Label>{title}</Label>
      {has ? (
        <>
          {kit.contact_name && <div className="text-[15px] font-semibold">{kit.contact_name}</div>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            {kit.contact_email && <a href={`mailto:${kit.contact_email}`} className="flex items-center gap-1.5 text-white/80 no-underline hover:text-white"><Mail className="w-3.5 h-3.5" />{kit.contact_email}</a>}
            {kit.contact_phone && <a href={`tel:${kit.contact_phone}`} className="flex items-center gap-1.5 text-white/80 no-underline hover:text-white"><Phone className="w-3.5 h-3.5" />{kit.contact_phone}</a>}
          </div>
        </>
      ) : <Empty>Who should promoters reach to book you? You, or your agent.</Empty>}
    </section>
  );
}

export function Bio({ bio, own }) {
  if (!bio && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>BIO</Label>
      {bio ? <p className="m-0 text-[15px] leading-relaxed text-white/85 whitespace-pre-line">{bio}</p> : <Empty>A few lines a promoter can paste straight into a flyer or listing.</Empty>}
    </section>
  );
}

// ---- Round 2 (job 459): Played at, open dates, the record sleeve ----

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymOf = (iso) => iso.slice(0, 7);
const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

// "Played at": real nights from Show Pilot events. A check marks the ones
// someone else (the venue, an artist) put on Show Pilot with the DJ on it.
export function History({ history, own, limit = 6 }) {
  const [all, setAll] = useState(false);
  const list = history || [];
  if (!list.length && !own) return null;
  const shown = all ? list : list.slice(0, limit);
  return (
    <section className="flex flex-col gap-2">
      <Label right={list.some((h) => h.confirmed) ? <span className="flex items-center gap-1 text-[11.5px] text-white/55"><Check className="w-3.5 h-3.5" style={{ color: DJ_COLOR }} />Confirmed by the event</span> : null}>PLAYED AT</Label>
      {list.length ? (
        <>
          {shown.map((h, i) => {
            const dt = new Date(`${h.date}T00:00:00`);
            return (
              <div key={`${h.date}-${i}`} className="relative flex items-stretch rounded-xl bg-[#101116] border border-[#262626] overflow-hidden">
                <div className="w-[58px] shrink-0 flex flex-col items-center justify-center py-2 border-r border-dashed border-white/15 text-[10px] tracking-[0.1em] leading-tight" style={{ ...mono, color: `${DJ_COLOR}cc` }}>
                  {MON[dt.getMonth()]}
                  <span className="text-[20px] text-white tracking-normal" style={cond}>{dt.getDate()}</span>
                  <span className="text-white/45">{dt.getFullYear()}</span>
                </div>
                <div className="min-w-0 flex-1 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-semibold truncate">{h.venue || h.name}</span>
                    {h.confirmed && <span className="shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: DJ_COLOR, color: "#000" }} title="Confirmed: on the event's own lineup in Show Pilot" aria-label="Confirmed by the event"><Check className="w-3 h-3" strokeWidth={3} /></span>}
                  </div>
                  <div className="text-[13px] text-white/60 truncate">{h.venue ? h.name : ""}</div>
                  {h.with?.length > 0 && <div className="text-[12.5px] text-white/50 truncate">with {h.with.join(", ")}</div>}
                </div>
              </div>
            );
          })}
          {list.length > limit && (
            <button type="button" onClick={() => setAll((x) => !x)} className="self-start min-h-[36px] px-3 rounded-full border border-white/20 text-[13px] font-semibold text-white/80 hover:text-white">
              {all ? "Show fewer" : `Show all ${list.length}`}
            </button>
          )}
        </>
      ) : <Empty>Nights you play through Show Pilot show up here by themselves after the date.</Empty>}
    </section>
  );
}

// Mixes as a record's tracklist: A1, A2... then B1, B2.
export function Tracklist({ mixes }) {
  const list = (mixes || []).filter((m) => m?.url);
  if (!list.length) return null;
  const half = Math.ceil(list.length / 2);
  return (
    <section className="flex flex-col gap-1">
      <Label>TRACKLIST</Label>
      {list.map((m, i) => (
        <a key={`${m.url}-${i}`} href={href(m.url)} target="_blank" rel="noreferrer" className="group flex items-center gap-3 min-h-[48px] text-white no-underline">
          <span className="w-7 shrink-0 text-[13px]" style={{ ...mono, color: DJ_COLOR }}>{i < half ? "A" : "B"}{i < half ? i + 1 : i - half + 1}</span>
          <span className="min-w-0 flex-1 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold truncate group-hover:underline">{m.title || "Mix"}</span>
            <span className="flex-1 border-b border-dotted border-white/20 translate-y-[-3px] min-w-[12px]" aria-hidden="true" />
            <span className="shrink-0 text-[12px] text-white/55" style={mono}>{platformOf(m.url)}</span>
          </span>
          <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center" style={{ background: DJ_COLOR, color: "#000" }}><Play className="w-3.5 h-3.5 fill-current ml-0.5" /></span>
        </a>
      ))}
    </section>
  );
}

// A month of the DJ's nights: booked, on hold, or open. With requests on,
// an open night can be tapped to ask for it.
export function OpenDates({ booked, holds, takeRequests, onPick }) {
  const today = todayIso();
  const first = ymOf(today);
  const last = addMonths(first, 23);
  const [ym, setYm] = useState(first);
  const bookedSet = new Set(booked || []);
  const holdSet = new Set(holds || []);
  const [y, m] = ym.split("-").map(Number);
  const startDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(y, m, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  const openCount = cells.filter((d) => d && d >= today && !bookedSet.has(d) && !holdSet.has(d)).length;
  const arrow = "w-10 h-10 rounded-full flex items-center justify-center border border-white/15 text-white/85 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent";
  return (
    <section className="flex flex-col gap-3">
      <Label right={<span className="text-[12px] text-white/55">{openCount} open in {MONTHS[m - 1]}</span>}>OPEN DATES</Label>
      <div className="flex items-center gap-2">
        <button type="button" className={arrow} onClick={() => setYm(addMonths(ym, -1))} disabled={ym <= first} aria-label="Month before"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1 text-center text-[22px] leading-none tracking-[0.04em]" style={{ ...cond, color: DJ_COLOR }} aria-live="polite">{MONTHS[m - 1].toUpperCase()} <span className="text-white/60">{y}</span></div>
        <button type="button" className={arrow} onClick={() => setYm(addMonths(ym, 1))} disabled={ym >= last} aria-label="Month after"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="text-[11px] text-white/45 py-1" style={mono}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const n = Number(d.slice(8));
          const past = d < today;
          const isBooked = bookedSet.has(d);
          const isHold = holdSet.has(d);
          const open = !past && !isBooked && !isHold;
          const base = "relative aspect-square min-h-[40px] rounded-lg flex flex-col items-center justify-center text-[14px]";
          if (open && takeRequests) {
            return (
              <button key={d} type="button" onClick={() => onPick?.(d)} aria-label={`Request ${longDate(d)}`} className={`${base} font-semibold border border-white/15 hover:border-[#FDE047] hover:bg-[#FDE047]/10`}>
                {n}
              </button>
            );
          }
          return (
            <div key={d} className={`${base} ${past ? "text-white/20" : isBooked ? "text-white/35 bg-white/[0.04]" : isHold ? "text-white/70" : "font-semibold border border-white/15"}`} aria-label={isBooked ? `${longDate(d)}, booked` : isHold ? `${longDate(d)}, on hold` : undefined}>
              <span className={isBooked ? "line-through" : ""}>{n}</span>
              {(isBooked || isHold) && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: isBooked ? "rgba(255,255,255,0.45)" : "#FB923C" }} />}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/60">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-white/30" />Open</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-white/45" />Booked</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#FB923C" }} />On hold</span>
      </div>
      {takeRequests && <p className="m-0 text-[13px] text-white/55">Tap an open night to ask for it.</p>}
    </section>
  );
}

const input = "w-full min-h-[44px] px-3 rounded-xl bg-[#0d0e14] border border-white/15 text-[15px] text-white placeholder:text-white/35 outline-none focus:border-[#FDE047]";

// Asking for a night: a sheet over the press kit.
export function RequestSheet({ token, date, djName, onClose }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", event_name: "", venue: "", city: "", set_time: "", message: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const send = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.name.trim()) { setError("Add your name."); return; }
    if (!f.email.trim() && !f.phone.trim()) { setError("Add an email or a phone number so the DJ can reply."); return; }
    setSending(true);
    try { await requestDate(token, { ...f, date }); setSent(true); }
    catch (err) { setError(err.message || "Couldn't send it. Try again."); }
    finally { setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Request ${longDate(date)}`} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-[480px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#111216] border border-[#2a2a2a] p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.18em] text-white/60" style={mono}>REQUEST A DATE</div>
            <div className="text-[28px] leading-tight" style={{ ...cond, color: DJ_COLOR }}>{longDate(date)}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 -mt-1 rounded-xl flex items-center justify-center text-white/70 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        {sent ? (
          <div className="py-6 flex flex-col items-center gap-2 text-center">
            <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: DJ_COLOR, color: "#000" }}><Check className="w-6 h-6" strokeWidth={3} /></span>
            <div className="text-[18px] font-bold">Request sent</div>
            <p className="m-0 text-[14.5px] text-white/65">{djName} will get back to you{f.email ? ` at ${f.email}` : ""}.</p>
            <button type="button" onClick={onClose} className="mt-2 min-h-[44px] px-6 rounded-full border border-white/20 font-semibold">Done</button>
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-2.5">
            <input className={input} aria-label="Your name" value={f.name} onChange={set("name")} placeholder="Your name *" autoComplete="name" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input className={input} aria-label="Email" type="email" inputMode="email" value={f.email} onChange={set("email")} placeholder="Email" autoComplete="email" />
              <input className={input} aria-label="Phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="Phone" autoComplete="tel" />
            </div>
            <input className={input} aria-label="Event" value={f.event_name} onChange={set("event_name")} placeholder="Event or night" />
            <div className="grid grid-cols-2 gap-2.5">
              <input className={input} aria-label="Venue" value={f.venue} onChange={set("venue")} placeholder="Venue" />
              <input className={input} aria-label="City" value={f.city} onChange={set("city")} placeholder="City" />
            </div>
            <input className={input} aria-label="Set time" value={f.set_time} onChange={set("set_time")} placeholder="Set time (e.g. 11 PM – 1 AM)" />
            <textarea className={`${input} py-2.5 resize-y`} rows={3} aria-label="Message" value={f.message} onChange={set("message")} placeholder="Anything else: fee, slot, other acts" />
            {error && <p className="m-0 text-[14px] text-[#F87171]" role="alert">{error}</p>}
            <button type="submit" disabled={sending} className="min-h-[48px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold disabled:opacity-60" style={{ background: DJ_COLOR, color: "#000" }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}Send request
            </button>
            <p className="m-0 text-[12px] text-white/45 text-center">Goes straight to {djName}'s Bookings on Show Pilot.</p>
          </form>
        )}
      </div>
    </div>
  );
}

// The record sleeve: the cover photo with the name on it, and the record
// sliding out of the side.
export function Sleeve({ kit }) {
  const cover = kit.press_photos?.find((p) => p?.url)?.url || kit.photo_url;
  const [out, setOut] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOut(true), 250); return () => clearTimeout(t); }, []);
  return (
    // The sleeve takes 64% of the width; the record slides out to its right.
    <div className="relative w-full max-w-[640px] mx-auto" style={{ aspectRatio: "1 / 0.64" }}>
      <div
        aria-hidden="true"
        className="absolute rounded-full motion-safe:transition-[left] motion-safe:duration-[1200ms] ease-out"
        style={{ width: "60%", aspectRatio: "1 / 1", top: "3%", left: out ? "39%" : "4%" }}
      >
        <div
          className="absolute inset-0 rounded-full motion-safe:animate-[spin_9s_linear_infinite]"
          style={{
            background: `radial-gradient(circle, #000 0 1.8%, ${DJ_COLOR} 2% 17%, #050505 17.5% 19.5%, transparent 20%), repeating-radial-gradient(circle, #0a0a0a 0 1.5px, #242424 1.5px 2.5px)`,
            boxShadow: "0 12px 40px rgba(0,0,0,0.8), inset 0 0 0 2px rgba(255,255,255,0.10)",
          }}
        >
          <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 20deg, transparent 0 18%, rgba(255,255,255,0.14) 24%, transparent 31% 68%, rgba(255,255,255,0.10) 74%, transparent 81%)" }} />
          <div className="absolute rounded-full flex items-center justify-center" style={{ inset: "39%" }}>
            <span className="text-[9px] tracking-[0.12em] text-black/80 rotate-[-18deg]" style={mono}>SIDE A</span>
          </div>
        </div>
      </div>
      <div className="absolute left-0 top-0 h-full rounded-[4px] overflow-hidden bg-[#1c1d24] shadow-[0_16px_50px_rgba(0,0,0,0.75)]" style={{ aspectRatio: "1 / 1" }}>
        {cover ? <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><Disc3 className="w-16 h-16 text-white/15" /></div>}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.88) 100%)" }} />
        <div className="absolute top-2.5 left-3 right-3 flex justify-between text-[9.5px] tracking-[0.18em]" style={mono}>
          <span style={{ color: DJ_COLOR }}>SHOWPILOT</span><span className="text-white/75">PRESS KIT</span>
        </div>
        <div className="absolute left-3 right-3 bottom-3 flex flex-col gap-1.5">
          <h1 className="m-0 text-[34px] sm:text-[52px] leading-[0.9] uppercase break-words font-bold" style={cond}>{kit.name}</h1>
          {kit.city && <div className="text-[10px] tracking-[0.16em] text-white/75" style={mono}>{kit.city.toUpperCase()}</div>}
        </div>
      </div>
    </div>
  );
}

// The public press kit page (/kit/:token): the sleeve on top, the back of
// the sleeve below it.
export default function DjKitView({ kit, token }) {
  const [asking, setAsking] = useState(null); // a date being requested
  const take = kit.take_requests !== false && !!token;
  const hasPhotos = kit.press_photos?.some((p) => p?.url) || kit.logo_url;
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="max-w-[880px] mx-auto px-4 pt-6 pb-12 overflow-x-hidden">
      <Sleeve kit={kit} />
      <div className="mt-5 flex flex-col gap-3 max-w-[640px] mx-auto">
        <GenreChips genres={kit.genre_tags} />
        <div className="flex flex-wrap gap-2">
          {take && (
            <button type="button" onClick={() => scrollTo("open-dates")} className="flex-1 min-w-[160px] min-h-[46px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold" style={{ background: DJ_COLOR, color: "#000" }}>
              <CalendarPlus className="w-4 h-4" />Request a date
            </button>
          )}
          {kit.contact_email && (
            <a href={`mailto:${kit.contact_email}?subject=${encodeURIComponent(`Booking ${kit.name || ""}`.trim())}`} className={`${take ? "" : "flex-1"} min-h-[46px] px-5 rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold no-underline ${take ? "border border-white/25 text-white" : ""}`} style={take ? undefined : { background: DJ_COLOR, color: "#000" }}>
              <Mail className="w-4 h-4" />Email
            </a>
          )}
          {hasPhotos && (
            <button type="button" onClick={() => scrollTo("photos")} className="min-h-[46px] px-5 rounded-full border border-white/25 flex items-center justify-center gap-2 text-[15px] font-semibold text-white">
              <Download className="w-4 h-4" />{"Photos & logo"}
            </button>
          )}
        </div>
      </div>

      {/* The back of the sleeve */}
      <div className="mt-8 rounded-[6px] border border-[#232323] bg-[#0c0c0e] p-4 sm:p-7">
        <div className="flex items-center gap-3 mb-5 text-[10.5px] tracking-[0.2em] text-white/50" style={mono}>
          <span style={{ color: DJ_COLOR }}>SIDE B</span><span className="flex-1 h-px bg-white/15" /><span>{(kit.name || "").toUpperCase()}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-7">
          <div className="flex flex-col gap-7">
            {kit.bio && (
              <section className="flex flex-col gap-2">
                <Label>LINER NOTES</Label>
                <p className="m-0 text-[15px] leading-relaxed text-white/85 whitespace-pre-line">{kit.bio}</p>
              </section>
            )}
            <Tracklist mixes={kit.mixes} />
            {kit.dates?.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <Label>TOUR DATES</Label>
                {kit.dates.map((d, i) => {
                  const dt = new Date(`${d.date}T00:00:00`);
                  return (
                    <div key={`${d.date}-${i}`} className="flex items-baseline gap-3 py-2 border-b border-white/10 text-[14.5px]">
                      <span className="w-[54px] shrink-0 text-[12px]" style={{ ...mono, color: DJ_COLOR }}>{MON[dt.getMonth()]} {String(dt.getDate()).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      {d.venue && <span className="shrink-0 max-w-[45%] truncate text-white/55">{d.venue}</span>}
                    </div>
                  );
                })}
              </section>
            )}
          </div>
          <div className="flex flex-col gap-7">
            <History history={kit.history} />
            <div id="open-dates" className="scroll-mt-4">
              <OpenDates booked={kit.booked} holds={kit.holds} takeRequests={take} onPick={setAsking} />
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-7">
          <div id="photos" className="scroll-mt-4"><Photos photos={kit.press_photos} logo={kit.logo_url} grid="grid-cols-2 sm:grid-cols-4" /></div>
          <Links links={kit.links} />
          {/* Credits, like the small print on a sleeve. */}
          <div className="pt-4 border-t border-white/10 flex flex-col gap-1.5 text-[13px] text-white/70">
            {(kit.contact_name || kit.contact_email || kit.contact_phone) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[10.5px] tracking-[0.18em] text-white/45" style={mono}>BOOKINGS</span>
                {kit.contact_name && <span className="font-semibold text-white">{kit.contact_name}</span>}
                {kit.contact_email && <a href={`mailto:${kit.contact_email}`} className="text-white/80 hover:text-white">{kit.contact_email}</a>}
                {kit.contact_phone && <a href={`tel:${kit.contact_phone}`} className="text-white/80 hover:text-white">{kit.contact_phone}</a>}
              </div>
            )}
            {hasPhotos && <span className="text-white/45">Photos and logo may be used to promote {kit.name}'s shows.</span>}
          </div>
        </div>
      </div>
      <a href="https://get.showpilot.space" className="block mt-6 text-center text-[12px] text-white/45 no-underline hover:text-white/70">Made with Show Pilot</a>
      {asking && <RequestSheet token={token} date={asking} djName={kit.name} onClose={() => setAsking(null)} />}
    </div>
  );
}
