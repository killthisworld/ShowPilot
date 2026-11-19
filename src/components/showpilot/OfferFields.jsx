import React, { useState } from "react";
import { CalendarDays, DollarSign, Speaker, Utensils, Truck, ClipboardCheck, MessageSquare, X } from "lucide-react";
import TimeSelect from "@/components/showpilot/TimeSelect";
import { DEAL_ASKS, AGES, money } from "@/components/showpilot/BookingFields";
import { OFFER_BLUE } from "@/lib/bookingPackage";

// A venue's offer (job 348): its circles, to fill in (VenueOffer) and to read
// (what the act opens). Each circle has an icon for what it is.
// data = { deal, room, hosp, logi, needs }, wants = { dates: [{ date, set_time, load_in, billing }], note }.
const BLUE = OFFER_BLUE;
const MONO = { fontFamily: "'JetBrains Mono', monospace" };
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
const label = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const chipStyle = (on) => (on
  ? { borderColor: BLUE, background: `${BLUE}22`, color: "#BFDBFE" }
  : { borderColor: "#333", color: "rgba(255,255,255,0.7)" });
const fmtDay = (k) => new Date(`${k}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export const NEEDS = [
  ["plot", "Stage plot"], ["rider", "Tech rider and input list"], ["bio", "Bio and press photo"],
  ["promo", "Promo assets and links"], ["w9", "W-9 / payment details"], ["guests", "Guest list names"],
];
const BILLINGS = ["Opener", "Support", "Headliner"];

function Field({ k, text, placeholder, value, set, area = false }) {
  return (
    <label>
      <span className={label}>{text}</span>
      {area
        ? <textarea rows={3} value={value || ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} className={`${inputCls} py-2.5 resize-none`} />
        : <input value={value || ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} className={inputCls} />}
    </label>
  );
}
const section = (data, key) => (data && typeof data[key] === "object" && data[key] ? data[key] : {});
const setIn = (data, setData, key) => (k, v) => setData({ ...data, [key]: { ...section(data, key), [k]: v } });

// ---------- Dates ----------
export function OfferDatesBody({ wants, setWants }) {
  const dates = Array.isArray(wants.dates) ? wants.dates : [];
  const [pick, setPick] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const setDates = (list) => setWants({ ...wants, dates: list });
  const add = () => {
    if (!pick || pick < today || dates.some((d) => d.date === pick) || dates.length >= 10) return;
    const last = dates[dates.length - 1] || {};
    setDates([...dates, { date: pick, set_time: last.set_time || "", load_in: last.load_in || "", billing: last.billing || "Headliner" }].sort((a, b) => a.date.localeCompare(b.date)));
    setPick("");
  };
  const patch = (date, p) => setDates(dates.map((d) => (d.date === date ? { ...d, ...p } : d)));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={label}>ADD A DATE</span>
        <div className="flex gap-2">
          <input type="date" aria-label="Date" min={today} value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputCls} flex-1`} />
          <button type="button" onClick={add} disabled={!pick || pick < today || dates.length >= 10} className="shrink-0 min-h-[44px] px-4 rounded-lg text-[14px] font-bold disabled:opacity-40" style={{ background: BLUE, color: "#0d0d0d" }}>Add</button>
        </div>
        <span className="text-[12.5px] text-white/50">Up to 10. Each date has its own times. New dates copy the last date's times.</span>
      </div>
      {dates.map((d) => (
        <div key={d.date} className="rounded-[12px] border border-[#2a2a2a] bg-[#101010] px-3 py-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[14.5px] font-bold">{fmtDay(d.date)}</span>
            <button type="button" onClick={() => setDates(dates.filter((x) => x.date !== d.date))} aria-label={`Remove ${fmtDay(d.date)}`} className="w-9 h-9 flex items-center justify-center text-white/55"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-4">
            <div><span className={label}>THEY'D GO ON AT</span><TimeSelect value={d.set_time || ""} onChange={(v) => patch(d.date, { set_time: v })} color={BLUE} label={`Set time ${fmtDay(d.date)}`} /></div>
            <div><span className={label}>LOAD-IN</span><TimeSelect value={d.load_in || ""} onChange={(v) => patch(d.date, { load_in: v })} color={BLUE} label={`Load-in ${fmtDay(d.date)}`} /></div>
          </div>
          <div className="flex gap-2 flex-wrap" role="group" aria-label={`Billing ${fmtDay(d.date)}`}>
            {BILLINGS.map((b) => (
              <button key={b} type="button" aria-pressed={d.billing === b} onClick={() => patch(d.date, { billing: b })} className="min-h-[40px] px-3.5 rounded-full text-[13.5px] font-bold border" style={chipStyle(d.billing === b)}>{b}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
export const offerDatesDone = (wants = {}) => Array.isArray(wants.dates) && wants.dates.length > 0;

// ---------- The deal ----------
export function OfferDealBody({ data, setData }) {
  const deal = section(data, "deal");
  const set = setIn(data, setData, "deal");
  return (
    <div className="flex flex-col gap-4">
      <div><span className={label}>WHAT YOU'RE OFFERING</span>
        <div className="flex flex-wrap gap-2">{DEAL_ASKS.map(([k, t]) => <button key={k} type="button" aria-pressed={deal.ask === k} onClick={() => set("ask", k)} className="min-h-[44px] px-3.5 rounded-full text-[14px] font-bold border" style={chipStyle(deal.ask === k)}>{t}</button>)}</div>
      </div>
      {["flat", "vs"].includes(deal.ask) && <Field k="guarantee" text="GUARANTEE" placeholder="$500" value={deal.guarantee} set={set} />}
      {["door", "vs"].includes(deal.ask) && <Field k="door_percent" text="DOOR PERCENT" placeholder="70" value={deal.door_percent} set={set} />}
      <Field k="ticket_price" text="TICKET PRICE" placeholder="$15 advance / $20 door" value={deal.ticket_price} set={set} />
      <div><span className={label}>AGES</span>
        <div className="flex flex-wrap gap-2">{AGES.map(([k, t]) => <button key={k} type="button" aria-pressed={deal.age === k} onClick={() => set("age", k)} className="min-h-[44px] px-3.5 rounded-full text-[14px] font-bold border" style={chipStyle(deal.age === k)}>{t}</button>)}</div>
      </div>
      <Field k="merch_split" text="MERCH CUT" placeholder="No cut" value={deal.merch_split} set={set} />
      <Field k="promo" text="PROMO WE'LL DO" placeholder="Socials, flyer, listings, email list" value={deal.promo} set={set} />
    </div>
  );
}
export const offerDealDone = (d = {}) => { const x = section(d, "deal"); return has(x.ask) || has(x.guarantee) || has(x.door_percent) || has(x.ticket_price); };

// ---------- Room and production ----------
export function OfferRoomBody({ data, setData }) {
  const r = section(data, "room");
  const set = setIn(data, setData, "room");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3"><div className="flex-1"><Field k="capacity" text="CAPACITY" placeholder="300" value={r.capacity} set={set} /></div><div className="flex-1"><Field k="stage" text="STAGE SIZE" placeholder="24 x 16 ft" value={r.stage} set={set} /></div></div>
      <Field k="engineer" text="HOUSE SOUND" placeholder="House engineer included" value={r.engineer} set={set} />
      <Field k="lights" text="HOUSE LIGHTING" placeholder="House operator included" value={r.lights} set={set} />
      <Field k="pa" text="PA AND MONITORS" placeholder="Describe the house PA, monitors and console" value={r.pa} set={set} area />
      <Field k="backline" text="BACKLINE WE PROVIDE" placeholder="Drums, bass amp, two guitar amps" value={r.backline} set={set} />
    </div>
  );
}
export const offerRoomDone = (d = {}) => Object.values(section(d, "room")).some(has);

// ---------- Hospitality and lodging ----------
export function OfferHospBody({ data, setData }) {
  const h = section(data, "hosp");
  const set = setIn(data, setData, "hosp");
  return (
    <div className="flex flex-col gap-3">
      <Field k="meals" text="MEALS" placeholder="Dinner for 5, or a buyout" value={h.meals} set={set} />
      <Field k="drinks" text="DRINKS" placeholder="2 drink tickets each, water" value={h.drinks} set={set} />
      <Field k="green_room" text="GREEN ROOM" placeholder="Private, lockable" value={h.green_room} set={set} />
      <Field k="guests" text="GUEST LIST" placeholder="2 comps per member" value={h.guests} set={set} />
      <Field k="lodging" text="LODGING" placeholder="Hotel provided, or at a rate, or none" value={h.lodging} set={set} />
    </div>
  );
}
export const offerHospDone = (d = {}) => Object.values(section(d, "hosp")).some(has);

// ---------- Load-in and logistics ----------
export function OfferLogiBody({ data, setData }) {
  const l = section(data, "logi");
  const set = setIn(data, setData, "logi");
  return (
    <div className="flex flex-col gap-3">
      <Field k="load_in" text="LOAD-IN DOOR AND PARKING" placeholder="Back alley, 3 spots" value={l.load_in} set={set} />
      <Field k="soundcheck" text="SOUNDCHECK" placeholder="By set order, from 5:30 PM" value={l.soundcheck} set={set} />
      <Field k="curfew" text="CURFEW" placeholder="12:00 AM hard stop" value={l.curfew} set={set} />
      <Field k="merch" text="MERCH TABLE" placeholder="Provided, you sell" value={l.merch} set={set} />
      <Field k="contact" text="CONTACT ON THE DAY" placeholder="Name and phone" value={l.contact} set={set} />
    </div>
  );
}
export const offerLogiDone = (d = {}) => Object.values(section(d, "logi")).some(has);

// ---------- What we need from the act ----------
export function OfferNeedsBody({ data, setData }) {
  const needs = Array.isArray(data.needs) ? data.needs : [];
  const toggle = (k) => setData({ ...data, needs: needs.includes(k) ? needs.filter((x) => x !== k) : [...needs, k] });
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] text-white/55">The act sees this as a checklist when it answers, and what it still has to add.</span>
      {NEEDS.map(([k, t]) => {
        const on = needs.includes(k);
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => toggle(k)} className="min-h-[48px] px-3.5 rounded-[12px] border text-left text-[14.5px] font-semibold flex items-center gap-3" style={chipStyle(on)}>
            <span className="w-5 h-5 rounded-[5px] border-2 flex items-center justify-center text-[12px] shrink-0" style={{ borderColor: BLUE, background: on ? BLUE : "transparent", color: "#0d0d0d" }}>{on ? "✓" : ""}</span>{t}
          </button>
        );
      })}
    </div>
  );
}
export const offerNeedsDone = (d = {}) => Array.isArray(d.needs) && d.needs.length > 0;

// ---------- A note ----------
export function OfferNoteBody({ wants, setWants }) {
  return (
    <label>
      <span className={label}>NOTE TO THE ACT</span>
      <textarea rows={5} value={wants.note || ""} onChange={(e) => setWants({ ...wants, note: e.target.value })} placeholder="Anything else you want them to know before they answer." className={`${inputCls} py-2.5 resize-none`} />
    </label>
  );
}
export const offerNoteDone = (w = {}) => has(w.note);

// ---------- Reading an offer ----------
const Row = ({ k, v }) => (has(v) ? (
  <div className="flex justify-between gap-4 py-2 border-t border-[#1f1f1f] first:border-t-0 text-[14.5px]">
    <span className="text-white/55 shrink-0">{k}</span><span className="text-right">{v}</span>
  </div>
) : null);
const askText = (k) => (DEAL_ASKS.find(([x]) => x === k) || [])[1] || "";
const ageText = (k) => (AGES.find(([x]) => x === k) || [])[1] || "";

export function offerDatesList(dates = []) {
  return (
    <div className="flex flex-col gap-2">
      {dates.map((d) => (
        <div key={d.date} className="rounded-[12px] border border-[#262626] bg-[#101010] px-3 py-2.5">
          <div className="text-[15px] font-bold">{fmtDay(d.date)}</div>
          <div className="text-[13px] text-white/65">{[d.billing, d.set_time && `on at ${d.set_time}`, d.load_in && `load-in ${d.load_in}`].filter(Boolean).join(" · ")}</div>
        </div>
      ))}
    </div>
  );
}

// The circles an act reads. `pkg` = { data, wants }.
export function offerReadCircles(pkg) {
  const data = pkg.data || {}, wants = pkg.wants || {};
  const deal = section(data, "deal"), room = section(data, "room"), hosp = section(data, "hosp"), logi = section(data, "logi");
  const dates = Array.isArray(wants.dates) ? wants.dates : [];
  const needs = (Array.isArray(data.needs) ? data.needs : []).map((k) => (NEEDS.find(([x]) => x === k) || [])[1]).filter(Boolean);
  return [
    { key: "dates", label: "Dates", short: "Dates", icon: <CalendarDays />, done: dates.length > 0, body: () => offerDatesList(dates) },
    { key: "deal", label: "The deal", short: "The deal", icon: <DollarSign />, done: offerDealDone(data), body: () => (
      <div className="flex flex-col">
        <Row k="Offer" v={askText(deal.ask)} /><Row k="Guarantee" v={money(deal.guarantee)} />
        <Row k="Door" v={has(deal.door_percent) ? `${String(deal.door_percent).replace(/%$/, "")}%` : ""} />
        <Row k="Tickets" v={deal.ticket_price} /><Row k="Ages" v={ageText(deal.age)} />
        <Row k="Merch cut" v={deal.merch_split} /><Row k="Promo from us" v={deal.promo} />
      </div>) },
    { key: "room", label: "Room and production", short: "Room", icon: <Speaker />, done: offerRoomDone(data), body: () => (
      <div className="flex flex-col">
        <Row k="Capacity" v={room.capacity} /><Row k="Stage" v={room.stage} /><Row k="Sound" v={room.engineer} />
        <Row k="Lights" v={room.lights} /><Row k="PA" v={room.pa} /><Row k="Backline" v={room.backline} />
      </div>) },
    { key: "hosp", label: "Hospitality and lodging", short: "Hospitality", icon: <Utensils />, done: offerHospDone(data), body: () => (
      <div className="flex flex-col">
        <Row k="Meals" v={hosp.meals} /><Row k="Drinks" v={hosp.drinks} /><Row k="Green room" v={hosp.green_room} />
        <Row k="Guest list" v={hosp.guests} /><Row k="Lodging" v={hosp.lodging} />
      </div>) },
    { key: "logi", label: "Load-in and logistics", short: "Logistics", icon: <Truck />, done: offerLogiDone(data), body: () => (
      <div className="flex flex-col">
        <Row k="Load-in" v={logi.load_in} /><Row k="Soundcheck" v={logi.soundcheck} /><Row k="Curfew" v={logi.curfew} />
        <Row k="Merch" v={logi.merch} /><Row k="Day-of contact" v={logi.contact} />
      </div>) },
    { key: "needs", label: "What we need from you", short: "We need", icon: <ClipboardCheck />, done: needs.length > 0, body: () => (
      <div className="flex flex-col gap-2">
        {needs.map((t) => <div key={t} className="min-h-[44px] px-3.5 rounded-[12px] border border-[#262626] bg-[#101010] flex items-center gap-3 text-[14.5px]"><span style={{ color: BLUE }}>✓</span>{t}</div>)}
        <span className="text-[12.5px] text-white/50" style={MONO}>You attach these when you answer.</span>
      </div>) },
    { key: "note", label: "Note from the venue", short: "Note", icon: <MessageSquare />, done: has(wants.note), body: () => <p className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">{wants.note}</p> },
  ].filter((c) => c.done);
}
