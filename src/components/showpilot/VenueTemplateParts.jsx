import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { DEAL_TYPES, FORCE_MAJEURE_TEXT, CANCELLATION_TEXT } from "@/lib/eventBusiness";
import { DEFAULT_ASKS, DEFAULT_EMAIL, EMAIL_FIELDS } from "@/lib/eventLink";
import { AskGrid } from "@/components/showpilot/EventLinkBuilder";
import { venuePartsWithContent, venuePartOnEvent } from "@/lib/roleTemplates";

// The venue template's extra parts (job 185): the usual deal, the event
// link's questions and note, and the event link email. Plus the sheet that
// picks which parts of a template to load onto an event.
const mono = { fontFamily: SCENE_MONO };
const AMBER = "#FF6A00";
const labelCls = "text-[11px] tracking-[0.12em] text-white/50";
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40";

function In({ label, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className={labelCls} style={mono}>{label.toUpperCase()}</span>
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </label>
  );
}
function Area({ label, value, onChange, placeholder, rows = 3, extra = null }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="flex items-center gap-2"><span className={`${labelCls} flex-1`} style={mono}>{label.toUpperCase()}</span>{extra}</span>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={`${inputCls} py-2 leading-relaxed resize-y`} />
    </label>
  );
}

// ---------- Deal terms ----------
export function DealTemplateFields({ value = {}, onChange, color = "#60A5FA" }) {
  const t = value || {};
  const set = (k, v) => onChange({ ...t, [k]: v });
  const type = t.deal_type || "";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-white/55 -mt-2">Your usual terms. Loading the template puts them on the event as a draft deal; you still check it and send it from Paperwork. Deposit dates are set on each event.</p>
      <div className="flex flex-col gap-1.5">
        <span className={labelCls} style={mono}>DEAL</span>
        <div className="grid grid-cols-3 gap-1.5">
          {DEAL_TYPES.map((d) => (
            <button key={d.key} type="button" aria-pressed={type === d.key} onClick={() => set("deal_type", type === d.key ? "" : d.key)} className="min-h-[44px] rounded-lg text-[14px] font-bold" style={type === d.key ? { background: color, color: "#0d0d0d" } : { border: "1px solid #2a2a2a", color: "rgba(255,255,255,0.7)" }}>{d.label}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(type === "flat" || type === "vs") && <In label="Guarantee" value={t.guarantee} onChange={(v) => set("guarantee", v)} placeholder="$500" />}
        {(type === "door" || type === "vs") && <In label="Door split %" value={t.door_percent} onChange={(v) => set("door_percent", v.replace(/[^0-9.]/g, ""))} placeholder="80" />}
        {(type === "door" || type === "vs") && <In label="Split after" value={t.door_after} onChange={(v) => set("door_after", v)} placeholder="$300 house costs" />}
        <In label="Bonuses" value={t.bonus} onChange={(v) => set("bonus", v)} placeholder="$200 at 150 tickets" />
        <In label="Merch split" value={t.merch_split} onChange={(v) => set("merch_split", v)} placeholder="Artist keeps 100%" />
        <In label="Deposit" value={t.deposit_amount} onChange={(v) => set("deposit_amount", v)} placeholder="$250" />
        <In label="Balance" value={t.balance_terms} onChange={(v) => set("balance_terms", v)} placeholder="Cash at settlement" />
        <In label="Paid by" value={t.payment_method} onChange={(v) => set("payment_method", v)} placeholder="Venmo, check, cash" />
      </div>
      <Area label="Cancellation" value={t.cancellation} onChange={(v) => set("cancellation", v)} placeholder="What happens if either side cancels"
        extra={!t.cancellation && <button type="button" onClick={() => set("cancellation", CANCELLATION_TEXT)} className="text-[12px] font-semibold text-white/60 hover:text-white">Use standard wording</button>} />
      <Area label="Weather and events nobody controls" value={t.force_majeure} onChange={(v) => set("force_majeure", v)} placeholder="Severe weather, power failure, government order..."
        extra={!t.force_majeure && <button type="button" onClick={() => set("force_majeure", FORCE_MAJEURE_TEXT)} className="text-[12px] font-semibold text-white/60 hover:text-white">Use standard wording</button>} />
      <Area label="Other terms" value={t.other_terms} onChange={(v) => set("other_terms", v)} placeholder="Radius clause, recording, comps..." rows={2} />
    </div>
  );
}
// Template deal -> event deal terms (one-night fields stay out).
export function dealTermsFromTemplate(t = {}) {
  const { deposit_due, ...rest } = t || {}; // eslint-disable-line no-unused-vars
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ""));
}

// ---------- Event link setup ----------
export function LinkSetupTemplateFields({ value = {}, onChange, color = "#60A5FA" }) {
  const v = value || {};
  const asks = Array.isArray(v.asks) && v.asks.length ? v.asks : DEFAULT_ASKS;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-white/55 -mt-2">What every act is asked on the event link, and the note at the top. Acts still see each event's own overview, live from the event.</p>
      <label className="flex flex-col gap-1.5"><span className={labelCls} style={mono}>NOTE AT THE TOP (OPTIONAL)</span>
        <textarea value={v.message || ""} onChange={(e) => onChange({ ...v, asks, message: e.target.value })} rows={2} placeholder="Hi, here's everything for the show. Fill in the form at the bottom." className={`${inputCls} py-2`} /></label>
      <div>
        <span className={labelCls} style={mono}>QUESTIONS FOR EACH ACT</span>
        <AskGrid asks={asks} setAsks={(next) => onChange({ ...v, asks: next })} color={color} />
      </div>
    </div>
  );
}
export const linkSetupSummary = (v) => (v && Array.isArray(v.asks) && v.asks.length ? `${v.asks.length} question${v.asks.length === 1 ? "" : "s"}${v.message ? " · note" : ""}` : "The questions acts answer");

// ---------- Event link email ----------
export function LinkEmailTemplateFields({ value, onChange, color = "#60A5FA" }) {
  const v = { ...DEFAULT_EMAIL, ...(value || {}) };
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const last = useRef("body");
  const insert = (key) => {
    const field = last.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const cur = v[field] || "";
    const at = el && typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : at;
    onChange({ ...v, [field]: `${cur.slice(0, at)}{${key}}${cur.slice(end)}` });
    setTimeout(() => { if (el) { el.focus(); const p = at + key.length + 2; el.setSelectionRange(p, p); } }, 0);
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-white/55 -mt-2">The email that goes out with the event link. Events loaded from this template use it instead of your account's email.</p>
      <label className="flex flex-col gap-1.5"><span className={labelCls} style={mono}>SUBJECT</span>
        <input ref={subjectRef} value={v.subject} onFocus={() => { last.current = "subject"; }} onChange={(e) => onChange({ ...v, subject: e.target.value })} className={inputCls} /></label>
      <label className="flex flex-col gap-1.5"><span className={labelCls} style={mono}>EMAIL</span>
        <textarea ref={bodyRef} value={v.body} onFocus={() => { last.current = "body"; }} onChange={(e) => onChange({ ...v, body: e.target.value })} rows={9} className={`${inputCls} py-2 leading-relaxed`} /></label>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-white/50 mr-1">Insert:</span>
        {EMAIL_FIELDS.map((f) => (
          <button key={f.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(f.key)} className="min-h-[36px] px-2.5 rounded-full border text-[12.5px] font-semibold" style={{ color, borderColor: `${color}66` }}>{f.label}</button>
        ))}
      </div>
    </div>
  );
}
export const linkEmailSummary = (v) => (v && (v.subject || v.body) ? `"${String(v.subject || "").slice(0, 40)}"` : "Uses your account's email");

// ---------- Not in this template ----------
export function ExcludedPart({ label, onInclude, color = "#60A5FA" }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#333] p-6 flex flex-col items-start gap-3">
      <span className="text-[16px] font-semibold">Not in this template</span>
      <span className="text-[14.5px] text-white/60 leading-relaxed">Loading this template leaves the event's {label} alone. Tick it to save what you fill in here.</span>
      <button type="button" onClick={onInclude} className="min-h-[44px] px-4 rounded-[10px] border text-[14px] font-semibold" style={{ color, borderColor: `${color}80` }}>Include {label}</button>
    </div>
  );
}

// ---------- Load: pick the parts ----------
// The venue ticks which parts of the template go onto this event. Parts the
// event already has say they'll be replaced; a deal that's been sent can't be.
export function VenueLoadSheet({ name, data, gig, deal, onClose, onLoad, color = "#60A5FA" }) {
  const parts = venuePartsWithContent(data);
  const [on, setOn] = useState(() => new Set(parts.map((pt) => pt.key)));
  const [linkExists, setLinkExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const dealLocked = !!deal && deal.status && deal.status !== "draft";
  useEffect(() => {
    let live = true;
    if (gig?.id) supabase.rpc("get_event_link_admin", { p_show: gig.id }).then(({ data: d }) => { if (live) setLinkExists(!!d?.link); });
    return () => { live = false; };
  }, [gig?.id]);
  useEffect(() => { if (dealLocked) setOn((s) => { const n = new Set(s); n.delete("deal"); return n; }); }, [dealLocked]);
  const note = (key) => {
    if (key === "deal") return dealLocked ? "The deal was already sent. Change it on Paperwork." : deal ? "Fills in the draft deal" : "Saved as a draft deal for you to send";
    if (key === "event_link") return linkExists ? "Replaces the questions on this event's link" : "Used when you create the link";
    return venuePartOnEvent(gig, key) ? "Replaces what's on the event" : "";
  };
  const toggle = (key) => setOn((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const go = async () => { setBusy(true); try { await onLoad(on, { linkExists }); } finally { setBusy(false); } };
  return createPortal(
    <div className="fixed inset-0 z-[96] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ fontFamily: SCENE_FONT }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Load template" onClick={(e) => e.stopPropagation()} className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-t-[16px] sm:rounded-[16px] border border-[#2a2a2a] bg-[#151515] p-5 flex flex-col gap-4 text-white">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] tracking-[0.14em]" style={{ ...mono, color }}>LOAD TEMPLATE</div>
            <div className="text-[24px] font-bold leading-tight truncate">{name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-[10px] border border-[#2a2a2a] flex items-center justify-center text-white/70"><X className="w-4 h-4" /></button>
        </div>
        {parts.length === 0 ? (
          <p className="text-[15px] text-white/55">This template has nothing filled in yet. Fill it in under My Templates first.</p>
        ) : (
          <>
            <span className="text-[14px] text-white/60 -mb-2">Untick anything you don't want on this event.</span>
            <div className="rounded-[12px] border border-[#242424] divide-y divide-[#1f1f1f]">
              {parts.map((pt) => {
                const n = note(pt.key);
                const locked = pt.key === "deal" && dealLocked;
                return (
                  <label key={pt.key} className={`flex items-center gap-3 min-h-[52px] px-3.5 py-2 ${locked ? "opacity-60" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={on.has(pt.key)} disabled={locked} onChange={() => toggle(pt.key)} className="w-[18px] h-[18px] shrink-0" style={{ accentColor: color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{pt.label}</span>
                      {n && <span className="block text-[12.5px]" style={{ color: /Replaces/.test(n) && on.has(pt.key) ? AMBER : "rgba(255,255,255,0.5)" }}>{n}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={busy || on.size === 0 || parts.length === 0} onClick={go} className="flex-1 min-h-[50px] rounded-[10px] font-bold text-[15.5px] disabled:opacity-50" style={{ background: color, color: "#0d0d0d" }}>{busy ? "Loading…" : `Load ${on.size} part${on.size === 1 ? "" : "s"}`}</button>
          <button type="button" onClick={onClose} className="min-h-[50px] px-5 rounded-[10px] border border-[#2a2a2a] text-white/75">Cancel</button>
        </div>
        <span className="text-[12.5px] text-white/50 -mt-2">The event's pages change on screen; press SAVE to keep them. The deal and the link's questions save right away.</span>
      </div>
    </div>,
    document.body
  );
}
