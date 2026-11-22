import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import DjRecordPlayer from "@/components/showpilot/DjRecordPlayer";
import { Play, Download, Mail, Phone, Disc3, ChevronLeft, ChevronRight, Check, X, Loader2, CalendarPlus, ArrowLeft } from "lucide-react";
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

const BOOKED = "#8CFF3D";
const HOLD = "#FB923C";

// A month of the DJ's nights: booked, on hold, or open. With requests on,
// an open night can be tapped to ask for it. It fills the height it's
// given (job 460: the press kit fits one screen), so the days stretch.
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
  const rows = Math.ceil(cells.length / 7);
  const openCount = cells.filter((d) => d && d >= today && !bookedSet.has(d) && !holdSet.has(d)).length;
  const arrow = "w-9 h-9 shrink-0 rounded-full flex items-center justify-center border border-white/15 text-white/85 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent";
  return (
    <section className="h-full min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" className={arrow} onClick={() => setYm(addMonths(ym, -1))} disabled={ym <= first} aria-label="Month before"><ChevronLeft className="w-[18px] h-[18px]" /></button>
        <div className="flex-1 text-center leading-none" aria-live="polite">
          <div className="text-[21px] tracking-[0.04em]" style={{ ...cond, color: DJ_COLOR }}>{MONTHS[m - 1].toUpperCase()} <span className="text-white/60">{y}</span></div>
          <div className="mt-0.5 text-[11px] text-white/55">{openCount} open{takeRequests && openCount ? " · tap one to ask for it" : ""}</div>
        </div>
        <button type="button" className={arrow} onClick={() => setYm(addMonths(ym, 1))} disabled={ym >= last} aria-label="Month after"><ChevronRight className="w-[18px] h-[18px]" /></button>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-7 gap-1 text-center" style={{ gridTemplateRows: `auto repeat(${rows}, minmax(0, 1fr))` }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="text-[10.5px] text-white/45 pb-0.5" style={mono}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const n = Number(d.slice(8));
          const past = d < today;
          const isBooked = bookedSet.has(d);
          const isHold = holdSet.has(d);
          const open = !past && !isBooked && !isHold;
          const base = "relative min-h-0 rounded-lg flex flex-col items-center justify-center text-[13.5px]";
          if (open && takeRequests) {
            return (
              <button key={d} type="button" onClick={() => onPick?.(d)} aria-label={`Request ${longDate(d)}`} className={`${base} font-semibold border border-white/20 bg-black/20 hover:border-[#FDE047] hover:bg-[#FDE047]/10`}>
                {n}
              </button>
            );
          }
          return (
            // Booked nights fill green, held nights fill orange (Jay, job 464).
            <div key={d} className={`${base} ${past ? "text-white/20" : isBooked || isHold ? "font-bold text-black" : "font-semibold border border-white/20"}`} style={!past && isBooked ? { background: BOOKED } : !past && isHold ? { background: HOLD } : undefined} aria-label={isBooked ? `${longDate(d)}, booked` : isHold ? `${longDate(d)}, on hold` : undefined}>
              {n}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 text-[11.5px] text-white/60">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded border border-white/35" />Open</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ background: BOOKED }} />Booked</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ background: HOLD }} />On hold</span>
      </div>
    </section>
  );
}

const input = "w-full min-h-[44px] px-3 rounded-xl bg-[#0d0e14] border border-white/15 text-[15px] text-white placeholder:text-white/35 outline-none focus:border-[#FDE047]";

// Asking for a night: a sheet over the press kit.
export function RequestSheet({ token, date: date0, djName, onClose }) {
  // No date yet (the Request a date button): pick one in the sheet.
  const [date, setDate] = useState(date0 || "");
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
    if (!date) { setError("Pick a date."); return; }
    if (!f.name.trim()) { setError("Add your name."); return; }
    if (!f.email.trim() && !f.phone.trim()) { setError("Add an email or a phone number so the DJ can reply."); return; }
    setSending(true);
    try { await requestDate(token, { ...f, date }); setSent(true); }
    catch (err) { setError(err.message || "Couldn't send it. Try again."); }
    finally { setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={date ? `Request ${longDate(date)}` : "Request a date"} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-[480px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#111216] border border-[#2a2a2a] p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.18em] text-white/60" style={mono}>REQUEST A DATE</div>
            <div className="text-[28px] leading-tight" style={{ ...cond, color: DJ_COLOR }}>{date ? longDate(date) : "Pick a night"}</div>
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
            {!date0 && <input className={input} aria-label="Date" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: "dark" }} />}
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


// ---- The press kit on one screen (job 460, Jay 2026-11-22) ----
// No scrolling on a phone or a computer: the banner is the background, the
// record (profile pic on the sleeve) plays the DJ's tracks, and up to 5
// photos swipe behind the bio at the bottom, like an artist's About on
// Spotify. Lists page with arrows instead of scrolling; the calendar
// stretches to the space it has.

function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

function BioSheet({ kit, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`About ${kit.name}`} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-[560px] max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#111216] border border-[#2a2a2a] p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.18em] text-white/60" style={mono}>ABOUT</div>
            <div className="text-[30px] leading-tight" style={{ ...cond, color: DJ_COLOR }}>{kit.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 -mt-1 rounded-xl flex items-center justify-center text-white/70 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <p className="m-0 text-[15.5px] leading-relaxed text-white/85 whitespace-pre-line">{kit.bio}</p>
      </div>
    </div>
  );
}

// Photos behind the bio: swipe (or the arrows) to move between them.
export function AboutCard({ kit }) {
  const photos = (kit.press_photos || []).filter((p) => p?.url).slice(0, 5);
  const list = photos.length ? photos : [{ url: kit.banner_url || kit.photo_url || "" }];
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const textBox = useRef(null);
  const { h } = useBox(textBox);
  const lines = Math.max(2, Math.floor(h / 22.5));
  const bioRef = useRef(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => { const el = bioRef.current; if (el) setClipped(el.scrollHeight > el.clientHeight + 2); }, [lines, kit.bio]);
  const touch = useRef(null);
  const go = (d) => setI((x) => (x + d + list.length) % list.length);
  return (
    <section
      className="relative h-full min-h-0 rounded-2xl overflow-hidden bg-[#15161c] border border-white/10 select-none"
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={(e) => {
        const s0 = touch.current; touch.current = null; if (!s0 || list.length < 2) return;
        const t = e.changedTouches[0]; const dx = t.clientX - s0.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - s0.y)) go(dx < 0 ? 1 : -1);
      }}
      aria-roledescription="carousel"
      aria-label={`About ${kit.name}`}
    >
      {list.map((p, j) => (
        // No saving photos from the press kit (Jay, job 463): no download
        // button, no long-press menu, no dragging them out.
        p.url ? <img key={`${p.url}-${j}`} src={p.url} alt="" draggable="false" onContextMenu={(e) => e.preventDefault()} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500 pointer-events-none" style={{ opacity: j === i ? 1 : 0, WebkitTouchCallout: "none", WebkitUserSelect: "none" }} /> : null
      ))}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 58%, rgba(0,0,0,0.92) 100%)" }} />
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
        <span className="text-[10.5px] tracking-[0.18em] text-white/85" style={mono}>ABOUT</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[34%] p-4 flex flex-col justify-end gap-2">
        <div ref={textBox} className="min-h-0 flex-1 flex flex-col justify-end">
          {kit.bio ? (
            <p ref={bioRef} className="m-0 text-[15px] leading-[1.5] text-white/90 overflow-hidden whitespace-pre-line" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }}>{kit.bio}</p>
          ) : null}
        </div>
        {/* Genres under the bio (Jay, job 461). */}
        <GenreChips genres={kit.genre_tags} />
        <div className="flex items-center justify-between gap-2 min-h-[28px]">
          {kit.bio && clipped ? <button type="button" onClick={() => setFull(true)} className="text-[13px] font-semibold underline underline-offset-2 text-white/85 hover:text-white">Read more</button> : <span />}
          {list.length > 1 && (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Photos">
              <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="hidden lg:flex w-8 h-8 rounded-full bg-black/50 items-center justify-center hover:bg-black/75"><ChevronLeft className="w-4 h-4" /></button>
              {list.map((_, j) => (
                <button key={j} type="button" role="tab" aria-selected={j === i} aria-label={`Photo ${j + 1}`} onClick={() => setI(j)} className="h-6 flex items-center"><span className="block h-1.5 rounded-full transition-all" style={{ width: j === i ? 18 : 6, background: j === i ? DJ_COLOR : "rgba(255,255,255,0.5)" }} /></button>
              ))}
              <button type="button" onClick={() => go(1)} aria-label="Next photo" className="hidden lg:flex w-8 h-8 rounded-full bg-black/50 items-center justify-center hover:bg-black/75"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </div>
      {full && <BioSheet kit={kit} onClose={() => setFull(false)} />}
    </section>
  );
}

// "Played at" paged to the room it has: as many nights as fit, arrows for more.
function PlayedAtFit({ history }) {
  const box = useRef(null);
  const { h } = useBox(box);
  const per = Math.max(1, Math.floor((h + 6) / 64));
  const [page, setPage] = useState(0);
  const list = history || [];
  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * per, p * per + per);
  return (
    <section className="h-full min-h-0 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label>PLAYED AT</Label>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-white/55 mr-1 tabular-nums" style={mono}>{p * per + 1}–{Math.min(list.length, p * per + per)} / {list.length}</span>
            <button type="button" onClick={() => setPage(p - 1)} disabled={p === 0} aria-label="Earlier page" className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center disabled:opacity-25"><ChevronLeft className="w-4 h-4" /></button>
            <button type="button" onClick={() => setPage(p + 1)} disabled={p >= pages - 1} aria-label="Next page" className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center disabled:opacity-25"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      <div ref={box} className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
        {list.length === 0 && <Empty>No nights on Show Pilot yet.</Empty>}
        {shown.map((x, k) => {
          const dt = new Date(`${x.date}T00:00:00`);
          return (
            <div key={`${x.date}-${k}`} className="h-[58px] shrink-0 flex items-stretch rounded-xl bg-black/35 border border-white/10 overflow-hidden">
              <div className="w-[54px] shrink-0 flex flex-col items-center justify-center border-r border-dashed border-white/15 text-[9.5px] tracking-[0.1em] leading-tight" style={{ ...mono, color: `${DJ_COLOR}cc` }}>
                {MON[dt.getMonth()]}<span className="text-[18px] text-white tracking-normal" style={cond}>{dt.getDate()}</span><span className="text-white/45">{dt.getFullYear()}</span>
              </div>
              <div className="min-w-0 flex-1 px-3 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[14.5px] font-semibold truncate">{x.venue || x.name}</span>
                  {x.confirmed && <span className="shrink-0 w-[16px] h-[16px] rounded-full flex items-center justify-center" style={{ background: DJ_COLOR, color: "#000" }} title="Confirmed: on the event's own lineup in Show Pilot" aria-label="Confirmed by the event"><Check className="w-2.5 h-2.5" strokeWidth={3.5} /></span>}
                </div>
                <div className="text-[12.5px] text-white/60 truncate">{[x.venue ? x.name : "", x.with?.length ? `with ${x.with.join(", ")}` : ""].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          );
        })}
      </div>
      {list.some((x) => x.confirmed) && <div className="flex items-center gap-1 text-[11px] text-white/50"><Check className="w-3 h-3" style={{ color: DJ_COLOR }} />Confirmed by the event on Show Pilot</div>}
    </section>
  );
}

function NextDates({ dates, max = 2 }) {
  const list = (dates || []).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {list.map((d, i) => {
        const dt = new Date(`${d.date}T00:00:00`);
        return (
          <div key={`${d.date}-${i}`} className="flex items-baseline gap-2.5 text-[13.5px] min-w-0">
            <span className="w-[50px] shrink-0 text-[11.5px]" style={{ ...mono, color: DJ_COLOR }}>{MON[dt.getMonth()]} {String(dt.getDate()).padStart(2, "0")}</span>
            <span className="truncate">{d.name}</span>
            {d.venue && <span className="ml-auto shrink-0 max-w-[45%] truncate text-white/55">{d.venue}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Links, full mixes and the logo, in one wrapping row.
function LinkRow({ kit, max = 99 }) {
  const items = [
    ...(kit.links || []).filter((l) => l?.url).map((l) => ({ key: `l${l.url}`, href: href(l.url), label: l.kind || platformOf(l.url) })),
    ...(kit.mixes || []).filter((m) => m?.url).map((m) => ({ key: `m${m.url}`, href: href(m.url), label: m.title || "Mix", mix: true })),
    ...(kit.logo_url ? [{ key: "logo", href: kit.logo_url, label: "Logo", logo: true }] : []),
  ].slice(0, max);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <a key={x.key} href={x.href} target="_blank" rel="noreferrer" download={x.logo ? "" : undefined} className="min-h-[34px] max-w-full px-3 rounded-full border border-white/20 bg-black/30 flex items-center gap-1.5 text-[13px] font-semibold text-white no-underline hover:border-white/45">
          {x.mix && <Play className="w-3 h-3 fill-current shrink-0" style={{ color: DJ_COLOR }} />}
          {x.logo && <Download className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{x.label}</span>
        </a>
      ))}
    </div>
  );
}

const glass = "rounded-2xl bg-black/45 backdrop-blur-md border border-white/10";

// Back, top left (Jay, job 464): to wherever they came from in the app (the
// DJ's own "See it the way promoters do"), else home for a signed-in user,
// else Show Pilot's site for a promoter who opened the link.
function BackButton() {
  const navigate = useNavigate();
  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) { navigate(-1); return; }
    let signedIn = false;
    try { signedIn = Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k)); } catch { /* private mode */ }
    if (signedIn) navigate("/"); else window.location.href = "https://get.showpilot.space";
  };
  return (
    <button type="button" onClick={back} aria-label="Back" className="w-11 h-11 shrink-0 rounded-full bg-black/55 border border-white/15 backdrop-blur flex items-center justify-center text-white hover:bg-black/75">
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}

export default function DjKitView({ kit, token }) {
  const [asking, setAsking] = useState(null); // a date being requested
  const [tab, setTab] = useState("about");
  const take = kit.take_requests !== false && !!token;
  const hasHistory = (kit.history || []).length > 0;
  const mail = kit.contact_email ? `mailto:${kit.contact_email}?subject=${encodeURIComponent(`Booking ${kit.name || ""}`.trim())}` : kit.contact_phone ? `tel:${kit.contact_phone}` : "";
  const tabs = [["about", "About"], ...(hasHistory ? [["played", "Played at"]] : []), ["dates", take ? "Open dates" : "Dates"]];

  const actions = (
    <div className="flex gap-2">
      {take && (
        <button type="button" onClick={() => (tab === "dates" ? setAsking("") : setTab("dates"))} className="lg:hidden flex-1 min-h-[48px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold" style={{ background: DJ_COLOR, color: "#000" }}>
          <CalendarPlus className="w-4 h-4" />Request a date
        </button>
      )}
      {mail && (
        <a href={mail} className={`${take ? "lg:flex-1" : "flex-1"} min-h-[48px] px-5 rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold no-underline ${take ? "border border-white/25 bg-black/40 text-white" : ""}`} style={take ? undefined : { background: DJ_COLOR, color: "#000" }}>
          {kit.contact_email ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}{kit.contact_email ? "Email" : "Call"}
        </a>
      )}
    </div>
  );
  const contact = (kit.contact_name || kit.contact_phone) && (
    <div className="text-[12.5px] text-white/65 truncate">
      <span className="text-[10px] tracking-[0.18em] text-white/45 mr-2" style={mono}>BOOKINGS</span>
      {[kit.contact_name, kit.contact_phone].filter(Boolean).join(" · ")}
    </div>
  );

  return (
    <div className="relative h-[100dvh] overflow-hidden text-white bg-black">
      {/* The banner, the whole background. */}
      <div aria-hidden="true" className="absolute inset-0">
        {kit.banner_url && <img src={kit.banner_url} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0" style={{ background: kit.banner_url ? "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.72) 45%, rgba(0,0,0,0.9) 100%)" : "#000" }} />
      </div>

      {/* Phone: the record on top, then tabs, then the buttons. */}
      <div className="lg:hidden relative h-full flex flex-col gap-2.5 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="relative">
          <div className="absolute left-0 top-0 z-10"><BackButton /></div>
          <div className="pl-12"><DjRecordPlayer kit={kit} maxHeight="25dvh" /></div>
        </div>
        <div role="tablist" aria-label="Press kit" className="flex gap-1 p-1 rounded-full bg-black/45 border border-white/10">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="flex-1 min-h-[36px] rounded-full text-[13px] font-semibold transition-colors" style={tab === k ? { background: DJ_COLOR, color: "#000" } : { color: "rgba(255,255,255,0.75)" }}>{label}</button>
          ))}
        </div>
        <div className="flex-1 min-h-0" role="tabpanel">
          {tab === "about" && (
            <div className="h-full min-h-0 flex flex-col gap-2">
              <div className="flex-1 min-h-0"><AboutCard kit={kit} /></div>
              <div className="max-h-[76px] overflow-hidden"><LinkRow kit={kit} /></div>
            </div>
          )}
          {tab === "played" && <div className={`${glass} h-full p-3`}><PlayedAtFit history={kit.history} /></div>}
          {tab === "dates" && (
            <div id="kit-dates" tabIndex={-1} className={`${glass} h-full p-3 flex flex-col gap-2 outline-none`}>
              <NextDates dates={kit.dates} max={2} />
              <div className="flex-1 min-h-0"><OpenDates booked={kit.booked} holds={kit.holds} takeRequests={take} onPick={setAsking} /></div>
            </div>
          )}
        </div>
        {actions}
      </div>

      {/* Computer: the record and the buttons on the left; played at and
          the calendar on top, the About card along the bottom. */}
      <div className="hidden lg:grid relative h-full p-6 gap-5" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)", gridTemplateRows: "minmax(0,1fr) minmax(0,0.85fr)" }}>
        <div className="row-span-2 min-h-0 flex flex-col justify-center gap-4 relative">
          <div className="absolute left-0 top-0 z-10"><BackButton /></div>
          <DjRecordPlayer kit={kit} maxHeight="50dvh" />
          {take && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setAsking("")} className="flex-1 min-h-[48px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold" style={{ background: DJ_COLOR, color: "#000" }}>
                <CalendarPlus className="w-4 h-4" />Request a date
              </button>
              {mail && <a href={mail} className="min-h-[48px] px-5 rounded-full border border-white/25 bg-black/40 flex items-center justify-center gap-2 text-[15px] font-semibold text-white no-underline"><Mail className="w-4 h-4" />Email</a>}
            </div>
          )}
          {!take && actions}
          <LinkRow kit={kit} />
          {contact}
          <a href="https://get.showpilot.space" className="text-[12px] text-white/45 no-underline hover:text-white/70">Made with Show Pilot</a>
        </div>
        <div className={`${glass} min-h-0 p-4`}>
          {hasHistory ? <PlayedAtFit history={kit.history} /> : (
            <section className="h-full flex flex-col gap-2"><Label>UPCOMING</Label><NextDates dates={kit.dates} max={6} /></section>
          )}
        </div>
        <div id="kit-cal" className={`${glass} min-h-0 p-4 flex flex-col gap-2`}>
          <Label>{take ? "OPEN DATES" : "DATES"}</Label>
          {hasHistory && <NextDates dates={kit.dates} max={2} />}
          <div className="flex-1 min-h-0"><OpenDates booked={kit.booked} holds={kit.holds} takeRequests={take} onPick={setAsking} /></div>
        </div>
        <div className="col-span-2 min-h-0"><AboutCard kit={kit} /></div>
      </div>

      {asking !== null && <RequestSheet token={token} date={asking} djName={kit.name} onClose={() => setAsking(null)} />}
    </div>
  );
}
