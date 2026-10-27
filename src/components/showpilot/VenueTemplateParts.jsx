import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { DEAL_TYPES, FORCE_MAJEURE_TEXT, CANCELLATION_TEXT } from "@/lib/eventBusiness";
import { DEFAULT_ASKS, DEFAULT_EMAIL, EMAIL_FIELDS } from "@/lib/eventLink";
import { AskGrid } from "@/components/showpilot/EventLinkBuilder";
import { venuePartsWithContent, venuePartOnEvent } from "@/lib/roleTemplates";
import { REPLY_FIELDS } from "@/lib/savedReplies";
import { ADVANCE_HOW, DEFAULT_ADVANCE_STEPS, newAdvanceStep, whenLabel, fmtWhen, fetchEventAdvance, updateAdvanceStep, stepSendAt } from "@/lib/eventAdvance";

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
  useEffect(() => { if (!gig?.date) setOn((s) => { const n = new Set(s); n.delete("advance"); return n; }); }, [gig?.date]);
  const note = (key) => {
    if (key === "deal") return dealLocked ? "The deal was already sent. Change it on Paperwork." : deal ? "Fills in the draft deal" : "Saved as a draft deal for you to send";
    if (key === "event_link") return linkExists ? "Replaces the questions on this event's link" : "Used when you create the link";
    if (key === "advance") {
      const steps = (data?.section?.advance_steps || []).filter((st) => st.on !== false);
      if (!gig?.date) return "Set the event's date first";
      const ats = steps.map((st) => stepSendAt(gig.date, st)).filter((d) => d && d.getTime() > Date.now()).sort((a, b) => a - b);
      return ats.length ? `${ats.length} step${ats.length === 1 ? "" : "s"}, ${fmtWhen(ats[0])} to ${fmtWhen(ats[ats.length - 1])}` : "Every step's time has already passed";
    }
    if (key === "task_presets") return gig?.date ? "Added to the event's tasks with due dates" : "Added to the event's tasks (no date yet, so no due dates)";
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
                const locked = (pt.key === "deal" && dealLocked) || (pt.key === "advance" && !gig?.date);
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
        <span className="text-[12.5px] text-white/50 -mt-2">The event's pages change on screen; press SAVE to keep them. The deal, tasks, the advance schedule and the link's questions save right away.</span>
      </div>
    </div>,
    document.body
  );
}

// ---------- Saved replies ----------
const rid = () => Math.random().toString(36).slice(2, 9);
export function SavedRepliesFields({ value, onChange, color = "#60A5FA" }) {
  const list = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(null);
  const bodyRefs = useRef({});
  const set = (i, patch) => onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => { const id = rid(); onChange([...list, { id, title: "", body: "" }]); setOpen(id); };
  const insert = (i, key) => {
    const el = bodyRefs.current[list[i].id];
    const cur = list[i].body || "";
    const at = el && typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : at;
    set(i, { body: `${cur.slice(0, at)}{${key}}${cur.slice(end)}` });
    setTimeout(() => { if (el) { el.focus(); const p = at + key.length + 2; el.setSelectionRange(p, p); } }, 0);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-white/55 -mt-2">Answers you give every act. In an event's chat, tap Saved replies to drop one in, filled in for that event. You can still change it before you send.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {list.map((r, i) => (open === r.id ? (
          <div key={r.id} className="rounded-[12px] border bg-[#101010] p-3 flex flex-col gap-2 sm:col-span-2" style={{ borderColor: color }}>
            <div className="flex gap-2 items-center">
              <input value={r.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Name it (e.g. Load-in)" aria-label="Reply name" className={inputCls} autoFocus />
              <button type="button" onClick={() => { onChange(list.filter((_, idx) => idx !== i)); setOpen(null); }} aria-label="Remove reply" className="min-h-[44px] w-[44px] flex items-center justify-center text-white/40 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <textarea ref={(el) => { bodyRefs.current[r.id] = el; }} value={r.body} onChange={(e) => set(i, { body: e.target.value })} rows={4} placeholder="Hey {act}! Load-in is {load_in} through the back door..." aria-label="Reply" className={`${inputCls} py-2 leading-relaxed`} />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-white/50 mr-1">Insert:</span>
              {REPLY_FIELDS.map((f) => (
                <button key={f.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(i, f.key)} className="min-h-[36px] px-2.5 rounded-full border text-[12.5px] font-semibold" style={{ color, borderColor: `${color}66` }}>{f.label}</button>
              ))}
              <button type="button" onClick={() => setOpen(null)} className="min-h-[36px] px-3 ml-auto text-[14px] font-semibold" style={{ color }}>Done</button>
            </div>
          </div>
        ) : (
          <button key={r.id} type="button" onClick={() => setOpen(r.id)} className="rounded-[12px] border border-[#2a2a2a] bg-[#101010] p-3 text-left flex flex-col gap-1 min-h-[88px]" aria-label={`Change the reply: ${r.title || "New reply"}`}>
            <span className="text-[15px] font-semibold">{r.title || "New reply"}</span>
            <span className="text-[13.5px] text-white/60 line-clamp-3 whitespace-pre-wrap">{r.body || "Empty"}</span>
          </button>
        )))}
      </div>
      <button type="button" onClick={add} className="self-start min-h-[44px] px-3 rounded-lg border border-dashed border-[#444] text-[14px] font-semibold" style={{ color }}>+ New saved reply</button>
    </div>
  );
}
export const repliesSummary = (v) => (Array.isArray(v) && v.length ? `${v.length} repl${v.length === 1 ? "y" : "ies"}` : "Answers you give every act");

// ---------- Task presets ----------
export const PRESET_KINDS = [
  { key: "plain", label: "To do" },
  { key: "upload", label: "Upload" },
];
export const PRESET_FOR = [
  { key: "manager", label: "Mgmt / Artist" },
  { key: "engineer", label: "Audio" },
];
export function TaskPresetsFields({ value, onChange, color = "#60A5FA" }) {
  const list = Array.isArray(value) ? value : [];
  const set = (i, patch) => onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-white/55 -mt-2">Tasks every act gets. Loading the template adds them to the event, due the number of days before the show you set here.</p>
      {list.length > 0 && (
        <div className="rounded-[12px] border border-[#242424] divide-y divide-[#1f1f1f]">
          {list.map((t, i) => (
            <div key={t.id} className="p-3 flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <input value={t.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Send stage plot and input list" aria-label="Task" className={inputCls} />
                <button type="button" onClick={() => onChange(list.filter((_, idx) => idx !== i))} aria-label="Remove task" className="min-h-[44px] w-[44px] flex items-center justify-center text-white/40 shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <select value={t.kind || "plain"} onChange={(e) => set(i, { kind: e.target.value })} aria-label="Kind" className={`${inputCls} !w-auto`}>{PRESET_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
                <select value={t.section || "manager"} onChange={(e) => set(i, { section: e.target.value })} aria-label="For" className={`${inputCls} !w-auto`}>{PRESET_FOR.map((k) => <option key={k.key} value={k.key}>For {k.label}</option>)}</select>
                <label className="flex items-center gap-2 text-[14px] text-white/70">Due
                  <input type="number" min="0" max="120" value={t.days_before ?? ""} onChange={(e) => set(i, { days_before: e.target.value === "" ? null : Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)) })} aria-label="Days before the show" className={`${inputCls} !w-[76px]`} placeholder="14" />
                  days before</label>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => onChange([...list, { id: rid(), title: "", kind: "plain", section: "manager", days_before: 14 }])} className="self-start min-h-[44px] px-3 rounded-lg border border-dashed border-[#444] text-[14px] font-semibold" style={{ color }}>+ Add a task</button>
    </div>
  );
}
export const presetsSummary = (v) => {
  const n = (Array.isArray(v) ? v : []).filter((t) => String(t.title || "").trim()).length;
  return n ? `${n} task${n === 1 ? "" : "s"} for the act` : "Tasks every act gets";
};
// Due date for a preset on an event: the show date minus its days.
export function presetDue(date, days) {
  if (!date || days === null || days === undefined || days === "") return null;
  const d = new Date(String(date).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - Number(days));
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// ---------- Advance schedule ----------
const STEP_FIELDS = [...REPLY_FIELDS, { key: "link", label: "Event link" }, { key: "missing", label: "What's missing" }];
function StepEditor({ step, onChange, onRemove, color, dated = false }) {
  const s = step;
  const after = Number(s.days) < 0;
  const n = Math.abs(Number(s.days) || 0);
  const bodyRef = useRef(null);
  const insert = (key) => {
    const el = bodyRef.current;
    const cur = s.body || "";
    const at = el && typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    onChange({ ...s, body: `${cur.slice(0, at)}{${key}}${cur.slice(at)}` });
    setTimeout(() => { if (el) { el.focus(); const p = at + key.length + 2; el.setSelectionRange(p, p); } }, 0);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap items-center">
        {dated ? (
          <label className="flex items-center gap-2 text-[14px] text-white/70">Sends
            <input type="datetime-local" value={s.at || ""} onChange={(e) => onChange({ ...s, at: e.target.value })} aria-label="When it sends" className={`${inputCls} !w-auto`} /></label>
        ) : (
          <>
            <input type="number" min="0" max="120" value={n} onChange={(e) => { const v = Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)); onChange({ ...s, days: after ? -v : v }); }} aria-label="Days" className={`${inputCls} !w-[72px]`} />
            <select value={after ? "after" : "before"} onChange={(e) => onChange({ ...s, days: e.target.value === "after" ? -Math.max(1, n) : n })} aria-label="Before or after the show" className={`${inputCls} !w-auto`}>
              <option value="before">days before the show</option><option value="after">days after the show</option>
            </select>
            <input type="time" value={s.time || "10:00"} onChange={(e) => onChange({ ...s, time: e.target.value })} aria-label="Time" className={`${inputCls} !w-auto`} />
          </>
        )}
        <select value={s.how} onChange={(e) => onChange({ ...s, how: e.target.value })} aria-label="What it does" className={`${inputCls} !w-auto`}>
          {Object.entries(ADVANCE_HOW).map(([k, h]) => <option key={k} value={k}>{h.long}</option>)}
        </select>
        {onRemove && <button type="button" onClick={onRemove} aria-label="Remove step" className="min-h-[44px] w-[44px] flex items-center justify-center text-white/40 ml-auto"><X className="w-4 h-4" /></button>}
      </div>
      <input value={s.title || ""} onChange={(e) => onChange({ ...s, title: e.target.value })} placeholder={s.how === "task" ? "The task (e.g. Confirm set times)" : "Name it (only you see this)"} aria-label="Step name" className={inputCls} />
      {s.how === "email" ? (
        <p className="text-[13.5px] text-white/50">Sends your event link email to the act's contacts on the event (the manager contact and acts' own emails). Skipped if the link hasn't been made yet.</p>
      ) : (
        <>
          <textarea ref={bodyRef} value={s.body || ""} onChange={(e) => onChange({ ...s, body: e.target.value })} rows={3} placeholder={s.how === "task" ? "Details (optional)" : "The message. Hey {act}, ..."} aria-label="Message" className={`${inputCls} py-2 leading-relaxed`} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-white/50 mr-1">Insert:</span>
            {STEP_FIELDS.map((f) => (
              <button key={f.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(f.key)} className="min-h-[34px] px-2.5 rounded-full border text-[12px] font-semibold" style={{ color, borderColor: `${color}66` }}>{f.label}</button>
            ))}
          </div>
        </>
      )}
      <label className="flex items-center gap-2.5 min-h-[40px] text-[14px] text-white/75">
        <input type="checkbox" checked={!!s.only_if_incomplete} onChange={(e) => onChange({ ...s, only_if_incomplete: e.target.checked })} className="w-[18px] h-[18px]" style={{ accentColor: color }} />
        Only if they haven't finished the event link
      </label>
    </div>
  );
}

export function AdvanceStepsFields({ value, onChange, color = "#60A5FA" }) {
  const list = Array.isArray(value) ? value : [];
  const sorted = [...list].sort((a, b) => (Number(b.days) || 0) - (Number(a.days) || 0));
  const set = (id, next) => onChange(list.map((s) => (s.id === id ? next : s)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-white/55 -mt-2">Steps that go out on their own, counted from each show's date. Loading the template schedules them on the event, where you can change or skip any of them before it goes out. Messages and tasks come from you.</p>
      {list.length === 0 && (
        <button type="button" onClick={() => onChange(DEFAULT_ADVANCE_STEPS())} className="self-start min-h-[44px] px-4 rounded-[10px] border text-[14px] font-semibold" style={{ color, borderColor: `${color}80` }}>Start with the usual 5 steps</button>
      )}
      {sorted.map((s) => (
        <div key={s.id} className="rounded-[12px] border border-[#242424] bg-[#101010] p-3 flex gap-3" style={{ opacity: s.on === false ? 0.55 : 1 }}>
          <label className="pt-2.5 shrink-0" title={s.on === false ? "Off" : "On"}>
            <input type="checkbox" checked={s.on !== false} onChange={(e) => set(s.id, { ...s, on: e.target.checked })} aria-label={`${s.title || "Step"} on`} className="w-[18px] h-[18px]" style={{ accentColor: color }} />
          </label>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="text-[11px] tracking-[0.12em]" style={{ ...mono, color }}>{whenLabel(s).toUpperCase()} · {ADVANCE_HOW[s.how]?.label.toUpperCase()}</span>
            <StepEditor step={s} onChange={(next) => set(s.id, next)} onRemove={() => onChange(list.filter((x) => x.id !== s.id))} color={color} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, newAdvanceStep()])} className="self-start min-h-[44px] px-3 rounded-lg border border-dashed border-[#444] text-[14px] font-semibold" style={{ color }}>+ Add a step</button>
    </div>
  );
}
export const advanceSummary = (v) => {
  const on = (Array.isArray(v) ? v : []).filter((s) => s.on !== false);
  return on.length ? `${on.length} step${on.length === 1 ? "" : "s"}` : "Messages that go out on their own";
};

// The event's own schedule (venue side): what's coming, what went out.
const STATUS_LOOK = {
  scheduled: { label: "SCHEDULED", color: "#60A5FA" },
  sending: { label: "SENDING", color: "#60A5FA" },
  sent: { label: "SENT", color: "#8CFF3D" },
  skipped: { label: "SKIPPED", color: "rgba(255,255,255,0.5)" },
  failed: { label: "DIDN'T SEND", color: AMBER },
};
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
export function EventAdvancePage({ gig, color = "#60A5FA", editable = true, onCount }) {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // { id | "new", ...step, at }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reload = async () => { const r = await fetchEventAdvance(gig.id); setRows(r); onCount?.(r); };
  useEffect(() => { if (gig?.id) reload(); }, [gig?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn) => { setBusy(true); setErr(""); try { await fn(); await reload(); } catch (e) { console.error(e); setErr(e?.message || "Something went wrong. Try again."); } setBusy(false); };

  const saveEdit = () => run(async () => {
    const at = editing.at ? new Date(editing.at) : null;
    if (!at || Number.isNaN(at.getTime())) throw new Error("Pick when it sends.");
    if (at.getTime() < Date.now()) throw new Error("Pick a time that hasn't passed.");
    if (editing.id === "new") {
      const { data, error } = await supabase.rpc("schedule_event_advance", { p_show: gig.id, p_steps: [{ step_id: `own_${Date.now().toString(36)}`, how: editing.how, title: editing.title || "", body: editing.body || "", send_at: at.toISOString(), only_if_incomplete: !!editing.only_if_incomplete }] });
      if (error) throw error;
      if (!data?.added) throw new Error("Couldn't add the step.");
    } else {
      await updateAdvanceStep(editing.id, { title: editing.title || "", body: editing.body || "", sendAt: at.toISOString() });
    }
    setEditing(null);
  });

  if (!rows) return <p className="text-white/45 text-[15px]">Loading…</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-white/55 -mt-2">Messages, tasks and emails that go out on their own for this event. Load a venue template with an advance schedule, or add a step here.</p>
      {rows.length === 0 && !editing && <p className="text-[15px] text-white/40">Nothing scheduled yet.</p>}
      {rows.map((r) => {
        const look = STATUS_LOOK[r.status] || STATUS_LOOK.scheduled;
        const open = editing?.id === r.id;
        const canChange = editable && ["scheduled", "skipped", "failed"].includes(r.status);
        return (
          <div key={r.id} className="rounded-[12px] border bg-[#101010] p-3 flex flex-col gap-2" style={{ borderColor: open ? color : "#242424", opacity: r.status === "skipped" ? 0.6 : 1 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px]" style={{ ...mono, color: "rgba(255,255,255,0.85)" }}>{fmtWhen(r.sent_at || r.send_at)}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#2f2f2f] text-white/75">{ADVANCE_HOW[r.how]?.label}</span>
              <span className="text-[10.5px] tracking-[0.1em] ml-auto" style={{ ...mono, color: look.color }}>{look.label}</span>
            </div>
            {open ? (
              <>
                <StepEditor step={editing} onChange={(next) => setEditing({ ...next, how: r.how })} color={color} dated />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={saveEdit} className="flex-1 min-h-[44px] rounded-[10px] font-bold text-[14.5px] disabled:opacity-60" style={{ background: color, color: "#0d0d0d" }}>{busy ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-[44px] px-4 rounded-[10px] border border-[#2a2a2a] text-white/70">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold">{r.title || ADVANCE_HOW[r.how]?.long}</div>
                {r.how !== "email" && r.body && <p className="text-[14px] text-white/65 whitespace-pre-wrap">{r.body}</p>}
                {r.result && <p className="text-[12.5px]" style={{ color: r.status === "failed" ? AMBER : "rgba(255,255,255,0.5)" }}>{r.result}</p>}
                {canChange && (
                  <div className="flex gap-2 flex-wrap">
                    {r.status !== "skipped" && <button type="button" onClick={() => setEditing({ id: r.id, how: r.how, title: r.title, body: r.body, only_if_incomplete: r.only_if_incomplete, at: toLocalInput(r.send_at) })} className="min-h-[40px] px-3 rounded-[8px] border border-[#2a2a2a] text-[13px] text-white/80">Edit</button>}
                    <button type="button" disabled={busy} onClick={() => run(() => updateAdvanceStep(r.id, { status: r.status === "skipped" ? "scheduled" : "skipped", ...(r.status !== "scheduled" && new Date(r.send_at).getTime() < Date.now() ? { sendAt: new Date(Date.now() + 15 * 60000).toISOString() } : {}) }))} className="min-h-[40px] px-3 rounded-[8px] border border-[#2a2a2a] text-[13px] text-white/80">{r.status === "skipped" ? "Put it back" : r.status === "failed" ? "Try again" : "Skip"}</button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      {editing?.id === "new" && (
        <div className="rounded-[12px] border bg-[#101010] p-3 flex flex-col gap-2" style={{ borderColor: color }}>
          <StepEditor step={editing} onChange={(next) => setEditing({ ...next, id: "new" })} color={color} dated />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={saveEdit} className="flex-1 min-h-[44px] rounded-[10px] font-bold text-[14.5px] disabled:opacity-60" style={{ background: color, color: "#0d0d0d" }}>{busy ? "Adding…" : "Schedule it"}</button>
            <button type="button" onClick={() => setEditing(null)} className="min-h-[44px] px-4 rounded-[10px] border border-[#2a2a2a] text-white/70">Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="text-[14px]" style={{ color: AMBER }}>{err}</p>}
      {editable && !editing && (
        <button type="button" onClick={() => setEditing({ ...newAdvanceStep(), id: "new", at: "" })} className="self-start min-h-[44px] px-3 rounded-lg border border-dashed border-[#444] text-[14px] font-semibold" style={{ color }}>+ Add a step</button>
      )}
    </div>
  );
}
export const eventAdvanceSummary = (rows) => {
  const next = (rows || []).filter((r) => r.status === "scheduled").sort((a, b) => new Date(a.send_at) - new Date(b.send_at))[0];
  if (!rows || !rows.length) return "Messages that go out on their own";
  return next ? `Next: ${fmtWhen(next.send_at)}` : `${rows.filter((r) => r.status === "sent").length} sent`;
};
