import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Camera, Check, ChevronRight, Copy, Eye, EyeOff, ImagePlus, Mail, MessageSquare, Palette, Plus, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { VENUE_PART_FIELDS, MANAGER_PART_FIELDS } from "@/lib/roleTemplates";
import { uploadIconImage } from "@/lib/eventIcons";
import {
  COLORS, FIELD_KINDS, kindLabel, fieldFilled, fieldText, newId, pageOf, sectionList, setMode, withPage,
} from "@/lib/templatePage";

// My Template for a venue, manager or artist (job 297): their one template as
// a page of their own. The look (cover, logo, color, header, layout, title),
// the sections (order, names, hidden fields, fields and sections of their
// own) and what every new event starts with (fill it in / ask me / leave out).
// The built-in details are still edited in the event workspace's editor
// (onEditDetails opens it at that section).
const COND = "'Barlow Condensed', sans-serif";
const MONO = { fontFamily: SCENE_MONO };
const TITLE_FONT = { bold: { fontFamily: COND, fontWeight: 700 }, classic: { fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 600 }, clean: { fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700, letterSpacing: "-0.01em" } };
const MODE = { fill: "AUTO", ask: "ASK", off: "OFF", kept: "IN CHAT" };
const MODE_LONG = { fill: "Fill it in", ask: "Ask me", off: "Leave out" };
const inputCls = "w-full min-h-[46px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
const label = "block text-[10.5px] tracking-[0.12em] text-white/55 mb-1.5";
const pretty = (k) => k.replace(/^tpl_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).replace(/\bpa\b/i, "PA").replace(/\bwifi\b/i, "Wi-Fi");
const isEmpty = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
const valueText = (v) => (Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : typeof v === "object" ? "Set" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

// One line per built-in section from what's in the template.
function summaries(role, data = {}) {
  const s = data.section || {};
  const g = data.gig || {};
  const n = (a, w) => (Array.isArray(a) && a.length ? `${a.length} ${w}${a.length === 1 ? "" : "s"}` : "");
  const j = (...xs) => xs.filter((x) => x && String(x).trim()).join(" · ");
  if (role === "venue") {
    return {
      address: j(s.address, [g.city || data.city, g.state || data.state].filter(Boolean).join(", "), s.capacity && `cap ${s.capacity}`, s.age_policy),
      load_in: j(s.load_in_location, s.parking),
      schedule: j(n(s.schedule, "time"), s.hard_curfew && `curfew ${s.hard_curfew}`),
      wifi_power: j(g.wifi_network || data.wifi_network, (g.power_notes || data.power_notes) && "power notes"),
      house_gear: j(g.console || data.console, s.pa, s.backline),
      hospitality: j(s.green_room && "green room", s.meals, s.drink_tickets && `${s.drink_tickets} drink tickets`),
      deal: s.tpl_deal && Object.keys(s.tpl_deal).length ? "Deal terms set" : "",
      event_link: s.event_link_setup?.asks?.length ? `${s.event_link_setup.asks.length} questions` : "",
      link_email: s.event_link_email?.subject || "",
      replies: n(s.saved_replies, "reply"),
      task_presets: n(s.task_presets, "task"),
      advance: n(s.advance_steps, "step"),
      documents: n(s.documents, "file"),
    };
  }
  return {
    contact: j(s.contact_name, s.contact_phone),
    advance: n(s.checklist, "item"),
    travel: j(s.vehicle, s.travel_notes && "notes"),
    guests: n(s.guests, "guest") || s.guest_list || "",
    merch: j(s.merch_split && `split ${s.merch_split}`, s.merch_table),
    documents: n(s.documents, "file"),
  };
}

// The built-in fields of a section that have something, for hiding.
function builtInFields(role, data, key) {
  const map = role === "venue" ? VENUE_PART_FIELDS[key] : { section: MANAGER_PART_FIELDS[key] || [] };
  if (!map) return [];
  const s = data.section || {};
  const g = data.gig || {};
  const out = [];
  for (const k of map.gig || []) if (!isEmpty(g[k] ?? data[k])) out.push({ key: k, value: g[k] ?? data[k] });
  for (const k of map.section || []) if (!isEmpty(s[k])) out.push({ key: k, value: s[k] });
  return out.filter((f) => !["tpl_deal", "event_link_setup", "event_link_email", "saved_replies", "task_presets", "advance_steps"].includes(f.key));
}

function Sheet({ title, kicker, color, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose} style={{ fontFamily: SCENE_FONT }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "sm:max-w-[620px]" : "sm:max-w-[460px]"} max-h-[92dvh] overflow-y-auto bg-[#141414] border border-[#2a2a2a] rounded-t-[20px] sm:rounded-[20px] p-5 flex flex-col gap-4 text-white`}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {kicker && <div className="text-[11px] tracking-[0.14em]" style={{ ...MONO, color }}>{kicker}</div>}
            <h2 className="text-[26px] leading-tight m-0" style={{ fontFamily: COND, fontWeight: 700 }}>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 -mt-2 rounded-full flex items-center justify-center text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// One field of their own: a label and a value by kind.
function FieldEditor({ field, onChange, onRemove, onMove, color }) {
  const set = (patch) => onChange({ ...field, ...patch });
  const [busy, setBusy] = useState(false);
  const list = Array.isArray(field.value) ? field.value : [];
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { set({ value: { url: await uploadIconImage(file), name: file.name } }); } catch (e) { console.error(e); }
    setBusy(false);
  };
  let input;
  if (field.kind === "yesno") {
    input = (
      <div className="flex gap-2">
        {[[true, "Yes"], [false, "No"]].map(([v, t]) => (
          <button key={t} type="button" aria-pressed={field.value === v} onClick={() => set({ value: field.value === v ? null : v })} className="flex-1 min-h-[44px] rounded-lg border text-[14px] font-semibold"
            style={field.value === v ? { borderColor: color, background: `${color}1f`, color: "#fff" } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.7)" }}>{t}</button>
        ))}
      </div>
    );
  } else if (field.kind === "checklist") {
    input = (
      <div className="flex flex-col gap-1.5">
        {list.map((it, i) => (
          <div key={it.id || i} className="flex gap-1.5">
            <input aria-label={`Item ${i + 1}`} value={it.text || ""} onChange={(e) => set({ value: list.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)) })} className={inputCls} />
            <button type="button" aria-label="Remove item" onClick={() => set({ value: list.filter((_, idx) => idx !== i) })} className="w-11 shrink-0 rounded-lg text-white/50 hover:text-red-400"><X className="w-4 h-4 mx-auto" /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ value: [...list, { id: newId(), text: "" }] })} className="min-h-[40px] rounded-lg border border-dashed border-[#3a3a3a] text-[13.5px] font-semibold text-white/70">+ Add an item</button>
      </div>
    );
  } else if (field.kind === "file") {
    input = field.value?.url ? (
      <div className="flex items-center gap-2 min-h-[46px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a]">
        <a href={field.value.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[14px] underline">{field.value.name || "File"}</a>
        <button type="button" aria-label="Remove file" onClick={() => set({ value: null })} className="w-9 h-9 text-white/50 hover:text-red-400"><X className="w-4 h-4 mx-auto" /></button>
      </div>
    ) : (
      <label className="min-h-[46px] rounded-lg border border-dashed border-[#3a3a3a] flex items-center justify-center text-[14px] font-semibold text-white/70 cursor-pointer">
        {busy ? "Uploading…" : "Choose a photo or file"}
        <input type="file" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
    );
  } else {
    const type = field.kind === "number" ? "number" : field.kind === "time" ? "time" : field.kind === "link" ? "url" : "text";
    input = <input type={type} inputMode={field.kind === "number" ? "decimal" : undefined} aria-label={field.label || "Value"} value={field.value ?? ""} onChange={(e) => set({ value: e.target.value })} placeholder={field.kind === "link" ? "https://" : ""} className={inputCls} />;
  }
  return (
    <div className="rounded-[12px] border border-[#2a2a2a] bg-[#101010] p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input aria-label="Field name" value={field.label} onChange={(e) => set({ label: e.target.value })} placeholder="Field name, e.g. Gate code" className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14.5px] font-semibold placeholder:text-white/30" />
        <span className="text-[10px] tracking-[0.1em] text-white/45 shrink-0" style={MONO}>{kindLabel(field.kind).toUpperCase()}</span>
        <button type="button" aria-label="Move up" onClick={() => onMove(-1)} className="w-8 h-8 text-white/45 hover:text-white"><ArrowUp className="w-4 h-4 mx-auto" /></button>
        <button type="button" aria-label="Move down" onClick={() => onMove(1)} className="w-8 h-8 text-white/45 hover:text-white"><ArrowDown className="w-4 h-4 mx-auto" /></button>
        <button type="button" aria-label="Remove field" onClick={onRemove} className="w-8 h-8 text-white/45 hover:text-red-400"><Trash2 className="w-4 h-4 mx-auto" /></button>
      </div>
      {input}
    </div>
  );
}

function FieldsEditor({ fields, onChange, color }) {
  const add = (kind) => onChange([...fields, { id: newId(), label: "", kind, value: kind === "checklist" ? [] : kind === "yesno" ? null : "" }]);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, i) => (
        <FieldEditor key={f.id} field={f} color={color} onChange={(nf) => onChange(fields.map((x) => (x.id === f.id ? nf : x)))} onRemove={() => onChange(fields.filter((x) => x.id !== f.id))} onMove={(d) => move(i, d)} />
      ))}
      <div className="rounded-[12px] border-[1.5px] border-dashed p-3 flex flex-col gap-2" style={{ borderColor: `${color}55` }}>
        <div className="text-[13.5px] font-semibold" style={{ color }}>Add a field of your own</div>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_KINDS.map((k) => (
            <button key={k.kind} type="button" onClick={() => add(k.kind)} className="min-h-[38px] px-3 rounded-full border border-[#333] bg-[#111] text-[13px] font-semibold">{k.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModePicker({ value, onChange, color, kept }) {
  if (kept) return <p className="text-[13px] text-white/55 m-0">Kept in your template: the event chat reads your saved replies from here.</p>;
  return (
    <div role="radiogroup" aria-label="On every new event" className="grid grid-cols-3 gap-1.5 p-1 rounded-[12px] bg-[#101010] border border-[#262626]">
      {["fill", "ask", "off"].map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)} className="min-h-[44px] rounded-[9px] text-[13.5px] font-bold"
          style={value === m ? (m === "off" ? { background: "#3a3a3a", color: "#fff" } : { background: color, color: "#0d0d0d" }) : { color: "rgba(255,255,255,0.7)" }}>{MODE_LONG[m]}</button>
      ))}
    </div>
  );
}

// The template's header, as it'll look.
function Hero({ look, name, sub, ring, initials, onCover, compact = false }) {
  const tf = TITLE_FONT[look.title] || TITLE_FONT.bold;
  const accent = look.color || ring;
  const h = compact ? 132 : 168;
  return (
    <div>
      <div className="relative rounded-[18px] overflow-hidden border" style={{ height: look.header === "logo" ? 72 : h, borderColor: "#22324a33", background: look.header === "color" ? accent : "#16202e" }}>
        {look.header === "photo" && (look.cover_url
          ? <img src={look.cover_url} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-[11px] tracking-[0.1em] text-white/35" style={MONO}>ADD A COVER PHOTO</div>)}
        {onCover && look.header === "photo" && (
          <label aria-label="Change cover photo" className="absolute right-2.5 top-2.5 w-10 h-10 rounded-[10px] bg-black/55 flex items-center justify-center cursor-pointer">
            <Camera className="w-4 h-4" />
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { onCover(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {/* The logo overlaps the cover's edge; the name sits just under it. */}
      <div className="relative z-[1] flex items-start gap-3 px-3" style={{ marginTop: -34 }}>
        <div className="w-[72px] h-[72px] rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[26px]" style={{ border: `3px solid ${ring}`, background: "#141a22", color: ring, ...TITLE_FONT.bold }}>
          {look.logo_url ? <img src={look.logo_url} alt="" className="w-full h-full object-cover" /> : initials}
        </div>
        <div className="min-w-0" style={{ marginTop: 40 }}>
          <div className="text-[30px] leading-none truncate" style={tf}>{name || "Your template"}</div>
          {sub && <div className="text-[13px] text-white/65 mt-1 truncate">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function LookControls({ look, setLook, ring, onUpload }) {
  const [busy, setBusy] = useState("");
  const up = async (which, file) => {
    if (!file) return;
    setBusy(which);
    try { const url = await onUpload(file); setLook({ [which]: url }); } catch (e) { console.error(e); }
    setBusy("");
  };
  const opt = (on) => (on ? { borderColor: ring, background: `${ring}1a`, color: "#fff" } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.8)" });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {[["cover_url", "Cover photo", "The room, the stage"], ["logo_url", "Logo", "Shows on every event"]].map(([k, t, s]) => (
          <div key={k} className="relative">
            <label className="min-h-[88px] rounded-[14px] border border-[#2a2a2a] bg-[#101010] flex flex-col items-center justify-center gap-1 text-center cursor-pointer px-2">
              {look[k] ? <img src={look[k]} alt="" className={`w-10 h-10 object-cover ${k === "logo_url" ? "rounded-full" : "rounded-md"}`} /> : <ImagePlus className="w-5 h-5 text-white/70" />}
              <span className="text-[13.5px] font-semibold">{busy === k ? "Uploading…" : t}</span>
              <span className="text-[11.5px] text-white/50">{s}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { up(k, e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {look[k] && <button type="button" aria-label={`Remove ${t.toLowerCase()}`} onClick={() => setLook({ [k]: "" })} className="absolute top-1 right-1 w-8 h-8 rounded-full text-white/50 hover:text-red-400"><X className="w-4 h-4 mx-auto" /></button>}
          </div>
        ))}
      </div>
      <div>
        <span className={label} style={MONO}>YOUR COLOR</span>
        <div className="flex gap-2 flex-wrap items-center">
          {COLORS.map((c) => (
            <button key={c.hex} type="button" aria-label={c.label} aria-pressed={look.color === c.hex} onClick={() => setLook({ color: look.color === c.hex ? "" : c.hex })} className="w-10 h-10 rounded-full"
              style={{ background: c.hex, border: look.color === c.hex ? "3px solid #fff" : "2px solid #222" }} />
          ))}
          <label aria-label="Pick any color" className="w-10 h-10 rounded-full border-[1.5px] border-dashed border-[#555] flex items-center justify-center text-white/70 cursor-pointer relative overflow-hidden">
            <Plus className="w-4 h-4" />
            <input type="color" value={look.color || "#60a5fa"} onChange={(e) => setLook({ color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
        </div>
        <p className="text-[12px] text-white/50 mt-2 mb-0 leading-snug">Your color brands your page. Your profile color stays on the frame and the logo ring so people know what kind of profile it is.</p>
      </div>
      <div>
        <span className={label} style={MONO}>HEADER</span>
        <div className="grid grid-cols-3 gap-2">
          {[["photo", "Photo"], ["color", "Color"], ["logo", "Logo only"]].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={look.header === k} onClick={() => setLook({ header: k })} className="min-h-[44px] rounded-[12px] border text-[13.5px] font-semibold" style={opt(look.header === k)}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <span className={label} style={MONO}>SECTIONS SHOW AS</span>
        <div className="grid grid-cols-2 gap-2">
          {[["cards", "Cards"], ["list", "List"]].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={look.layout === k} onClick={() => setLook({ layout: k })} className="min-h-[44px] rounded-full border text-[13.5px] font-semibold" style={opt(look.layout === k)}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <span className={label} style={MONO}>TITLE STYLE</span>
        <div className="grid grid-cols-3 gap-2">
          {[["bold", "Bold"], ["classic", "Classic"], ["clean", "Clean"]].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={look.title === k} onClick={() => setLook({ title: k })} className="min-h-[50px] rounded-[12px] border text-[19px]" style={{ ...opt(look.title === k), ...TITLE_FONT[k] }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// What a new event made with this template looks like.
function Preview({ role, look, name, sub, ring, initials, sections, title = true }) {
  const fill = sections.filter((s) => s.mode === "fill" && s.filled);
  const ask = sections.filter((s) => s.mode === "ask");
  const accent = look.color || ring;
  return (
    <div className="flex flex-col gap-3">
      {title && <div className="text-[10.5px] tracking-[0.12em] text-white/55" style={MONO}>A NEW EVENT, WITH YOUR TEMPLATE</div>}
      <Hero look={look} name={role === "venue" ? `New event · ${name || "your venue"}` : name} sub={sub} ring={ring} initials={initials} compact />
      {fill.length ? (
        <div className={look.layout === "list" ? "flex flex-col gap-1.5" : "grid grid-cols-2 xl:grid-cols-3 gap-2"}>
          {fill.map((s) => (
            <div key={s.key} className="rounded-[12px] bg-[#151515] border border-[#262626] px-3 py-2.5 min-w-0">
              <div className="text-[10px] tracking-[0.1em] truncate" style={{ ...MONO, color: accent }}>{s.label.toUpperCase()}</div>
              <div className="text-[13px] text-white/80 mt-1 leading-snug line-clamp-2">{s.sub || "Filled in"}</div>
            </div>
          ))}
        </div>
      ) : <p className="text-[13px] text-white/50 m-0">Nothing fills in by itself yet. Fill a section in and set it to Fill it in.</p>}
      {ask.length > 0 && <div className="rounded-[12px] border border-dashed border-[#333] px-3 py-2.5 text-[13px] text-white/65">Asks you when you load it: {ask.map((s, i) => <span key={s.key}><strong className="text-white">{s.label}</strong>{i < ask.length - 1 ? ", " : ""}</span>)}</div>}
    </div>
  );
}

// Send your venue as a package (job 298): one link, by text, email or copy.
function SendSheet({ ring, name, onClose }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    supabase.rpc("share_my_template").then(({ data, error: e }) => {
      if (e) { console.error(e); setError("Couldn't make the link. Try again."); return; }
      setCode(data || "");
    });
  }, []);
  const url = code ? `${window.location.origin}/vp/${code}` : "";
  const msg = `Here's everything about ${name || "our venue"}: load-in, schedule, gear, hospitality. ${url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const opt = "min-h-[56px] rounded-[12px] border border-[#333] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold";
  return (
    <Sheet title="Send your venue" kicker="SEND AS A PACKAGE" color={ring} onClose={onClose}>
      <p className="m-0 -mt-2 text-[14px] text-white/65 leading-snug">Acts and techs open it as a web: every section a circle, or Read it all. Your deal, event link, saved replies, task presets and advance never go in it, nor anything you left out or hid. It's always your template as it is now.</p>
      {error ? <p className="m-0 text-[14px] text-red-400">{error}</p> : (
        <div className="rounded-[10px] bg-[#0b0b0b] border border-[#2a2a2a] px-3 py-2.5 text-[14px] text-white/80 break-all" style={MONO}>{code ? url.replace(/^https?:\/\//, "") : "Making your link…"}</div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <a href={code ? `sms:?&body=${encodeURIComponent(msg)}` : undefined} aria-disabled={!code} className={opt}><MessageSquare className="w-4 h-4" />Text</a>
        <a href={code ? `mailto:?subject=${encodeURIComponent(`${name || "Our venue"}: everything you need`)}&body=${encodeURIComponent(msg)}` : undefined} aria-disabled={!code} className={opt}><Mail className="w-4 h-4" />Email</a>
        <button type="button" disabled={!code} onClick={copy} className={`${opt} disabled:opacity-50`}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? "Copied" : "Copy"}</button>
      </div>
      {code && <a href={`/vp/${code}`} target="_blank" rel="noreferrer" className="min-h-[46px] rounded-[12px] border text-[14px] font-semibold flex items-center justify-center" style={{ borderColor: `${ring}77`, color: ring }}>See what they get</a>}
    </Sheet>
  );
}

export default function CompanyTemplatePage({ role, template, displayName, desktop, onCreate, onSave, onEditDetails, actsBlock = null }) {
  const ring = role === "venue" ? ACCOUNT_TYPE_STYLES.venue.color : ACCOUNT_TYPE_STYLES.manager.color;
  const [name, setName] = useState(template?.name || "");
  const [data, setData] = useState(template?.data || {});
  const [saveState, setSaveState] = useState("saved");
  const [sheet, setSheet] = useState(null); // look | loads | preview | section:<key>
  const [reorder, setReorder] = useState(false);
  const first = useRef(true);
  const timer = useRef(null);

  // A fresh copy when the template itself changes (e.g. edited in the editor).
  useEffect(() => { setName(template?.name || ""); setData(template?.data || {}); first.current = true; }, [template?.id, template?.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave a moment after a change.
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    if (!template?.id) return undefined;
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await onSave(name.trim() || template.name, data); setSaveState("saved"); } catch (e) { console.error(e); setSaveState("error"); }
    }, 800);
    return () => clearTimeout(timer.current);
  }, [name, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = pageOf(data);
  const look = page.look;
  const sums = useMemo(() => summaries(role, data), [role, data]);
  const sections = useMemo(() => sectionList(role, data, sums), [role, data, sums]);
  const setLook = (patch) => setData((d) => withPage(d, { look: { ...pageOf(d).look, ...patch } }));
  const setPage = (patch) => setData((d) => withPage(d, patch));
  const initials = (name || displayName || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const sub = role === "venue"
    ? [sums.address].filter(Boolean).join(" · ")
    : [role === "manager" ? "Management" : "", sums.contact].filter(Boolean).join(" · ");
  const counted = sections.filter((s) => s.mode !== "kept");
  const filledN = counted.filter((s) => s.filled).length;
  const fillN = sections.filter((s) => s.mode === "fill").length;

  const move = (key, d) => {
    const keys = sections.map((s) => s.key);
    const i = keys.indexOf(key);
    const j = i + d;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setPage({ order: keys });
  };
  const addSection = () => {
    const id = `c_${newId()}`;
    setData((d) => {
      const p = pageOf(d);
      return withPage(d, { custom: [...p.custom, { id, name: "", fields: [] }], order: [...sectionList(role, d, sums).map((s) => s.key), id] });
    });
    setSheet(`section:${id}`);
  };

  if (!template) {
    return (
      <div className="rounded-[18px] border border-[#262626] bg-[#151515] p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-[24px]" style={{ border: `3px solid ${ring}`, color: ring, ...TITLE_FONT.bold }}>{initials}</div>
        <h2 className="m-0 text-[28px]" style={TITLE_FONT.bold}>{role === "venue" ? "Make your venue's template" : "Make your template"}</h2>
        <p className="m-0 text-[14px] text-white/60 max-w-[340px]">{role === "venue" ? "Your room, filled in once: address, load-in, schedule, gear, hospitality. Every new event starts with it." : "Your side, filled in once: contact, advance, travel, guests, merch. Every new event starts with it."}</p>
        <button type="button" onClick={onCreate} className="mt-1 min-h-[50px] px-6 rounded-[12px] font-bold text-[15px]" style={{ background: ring, color: "#0d0d0d" }}>Start my template</button>
      </div>
    );
  }

  const sectionRow = (s, i) => (
    <div key={s.key} className="flex items-center gap-1.5 rounded-[12px] bg-[#151515] border border-[#262626]" style={{ opacity: s.mode === "off" ? 0.5 : 1 }}>
      <button type="button" onClick={() => setSheet(`section:${s.key}`)} className="flex-1 min-w-0 flex items-center gap-2.5 min-h-[56px] pl-3 pr-1 text-left">
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[14.5px] font-semibold truncate">{s.label}</span>
            {!s.builtIn && <span className="shrink-0 text-[9.5px] tracking-[0.1em] px-1.5 py-[2px] rounded" style={{ ...MONO, background: `${ring}26`, color: ring }}>YOURS</span>}
          </span>
          <span className="block text-[12px] text-white/55 truncate">{s.mode === "off" ? "Left out of your template" : s.sub || (s.builtIn ? "Not filled in yet" : "No fields yet")}</span>
        </span>
        <span className="shrink-0 text-[9.5px] tracking-[0.1em] px-1.5 py-1 rounded-[5px] border border-[#333] text-white/75" style={MONO}>{MODE[s.mode]}</span>
        {!reorder && <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />}
      </button>
      {reorder && (
        <span className="flex shrink-0 pr-1.5">
          <button type="button" aria-label={`Move ${s.label} up`} disabled={i === 0} onClick={() => move(s.key, -1)} className="w-10 h-10 text-white/60 disabled:opacity-25"><ArrowUp className="w-4 h-4 mx-auto" /></button>
          <button type="button" aria-label={`Move ${s.label} down`} disabled={i === sections.length - 1} onClick={() => move(s.key, 1)} className="w-10 h-10 text-white/60 disabled:opacity-25"><ArrowDown className="w-4 h-4 mx-auto" /></button>
        </span>
      )}
    </div>
  );

  const sectionsBlock = (
    <section aria-label="Sections" className="flex flex-col gap-1.5">
      <div className="flex items-center px-0.5 pb-1">
        <span className="text-[15px] font-bold tracking-[0.08em] text-white/60" style={{ fontFamily: COND }}>SECTIONS</span>
        <span className="flex-1" />
        <button type="button" aria-pressed={reorder} onClick={() => setReorder((r) => !r)} className="min-h-[36px] px-2.5 rounded-lg text-[12.5px] font-semibold" style={reorder ? { color: "#0d0d0d", background: ring } : { color: "rgba(255,255,255,0.65)" }}>{reorder ? "Done" : "Reorder"}</button>
      </div>
      {sections.map(sectionRow)}
      <button type="button" onClick={addSection} className="min-h-[48px] rounded-[12px] border-[1.5px] border-dashed text-[14px] font-semibold flex items-center justify-center gap-1.5" style={{ borderColor: `${ring}66`, color: ring }}>
        <Plus className="w-4 h-4" strokeWidth={2.5} />Add your own section
      </button>
    </section>
  );

  const progress = (
    <div className="flex items-center gap-3 rounded-[12px] bg-[#151515] border border-[#262626] px-3 py-2.5">
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold">{filledN} of {counted.length} sections filled</div>
        <div className="h-[5px] rounded bg-[#262626] mt-1.5 overflow-hidden"><div className="h-full" style={{ width: `${counted.length ? Math.round((filledN / counted.length) * 100) : 0}%`, background: ring }} /></div>
      </div>
      <button type="button" onClick={() => setSheet("loads")} className="min-h-[40px] text-[12.5px] font-semibold whitespace-nowrap" style={{ color: ring }}>{fillN} fill every event ›</button>
    </div>
  );

  const nameInput = (
    <input aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder={role === "venue" ? "Your venue's name" : "Your name or company"}
      className="w-full bg-transparent border-0 border-b border-[#2a2a2a] focus:border-white/40 outline-none text-[15px] text-white/80 pb-1.5" />
  );
  const status = <span className="text-[12.5px]" style={{ color: saveState === "error" ? "#f87171" : "rgba(255,255,255,0.5)" }}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : "Saved"}</span>;

  // ---- sheets ----
  let sheetEl = null;
  if (sheet === "look") {
    sheetEl = <Sheet title="Make it yours" kicker="THE LOOK" color={ring} onClose={() => setSheet(null)}><LookControls look={look} setLook={setLook} ring={ring} onUpload={uploadIconImage} /></Sheet>;
  } else if (sheet === "send") {
    sheetEl = <SendSheet ring={ring} name={name} onClose={() => setSheet(null)} />;
  } else if (sheet === "preview") {
    sheetEl = <Sheet title="A new event" kicker="PREVIEW" color={ring} onClose={() => setSheet(null)} wide><Preview role={role} look={look} name={name} sub={sub} ring={ring} initials={initials} sections={sections} title={false} /></Sheet>;
  } else if (sheet === "loads") {
    sheetEl = (
      <Sheet title="Every new event starts with" kicker="WHAT LOADS" color={ring} onClose={() => setSheet(null)}>
        <p className="m-0 -mt-2 text-[13.5px] text-white/60">Fill it in: on every new event by itself. Ask me: only when you press Load template on an event. Leave out: not in your template at all.</p>
        {[["fill", "FILLS IN BY ITSELF"], ["ask", "ASKS ME FIRST"], ["off", "LEFT OUT"], ["kept", "KEPT IN YOUR TEMPLATE"]].map(([m, t]) => {
          const rows = sections.filter((s) => s.mode === m);
          if (!rows.length) return null;
          return (
            <div key={m} className="flex flex-col gap-1.5">
              <div className="text-[10.5px] tracking-[0.12em]" style={{ ...MONO, color: m === "fill" ? ring : "rgba(255,255,255,0.6)" }}>{t} · {rows.length}</div>
              {rows.map((s) => (
                <div key={s.key} className="flex items-center gap-2 min-h-[50px] pl-3 pr-1.5 rounded-[11px] bg-[#101010] border border-[#262626]">
                  <span className="flex-1 min-w-0 text-[14px] font-semibold truncate" style={{ opacity: m === "off" ? 0.55 : 1 }}>{s.label}</span>
                  {m !== "kept" && (
                    <div role="radiogroup" aria-label={s.label} className="flex gap-0.5 p-0.5 rounded-[9px] bg-[#0b0b0b]">
                      {["fill", "ask", "off"].map((o) => (
                        <button key={o} type="button" role="radio" aria-checked={s.mode === o} onClick={() => setData((d) => setMode(role, d, s.key, o))} className="min-w-[46px] min-h-[38px] px-2 rounded-[7px] text-[12px] font-bold"
                          style={s.mode === o ? (o === "off" ? { background: "#3a3a3a", color: "#fff" } : { background: ring, color: "#0d0d0d" }) : { color: "rgba(255,255,255,0.6)" }}>{o === "fill" ? "Fill" : o === "ask" ? "Ask" : "Off"}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        <button type="button" onClick={() => setSheet(null)} className="min-h-[50px] rounded-[12px] font-bold text-[15px]" style={{ background: ring, color: "#0d0d0d" }}>Done</button>
      </Sheet>
    );
  } else if (sheet && sheet.startsWith("section:")) {
    const key = sheet.slice(8);
    const s = sections.find((x) => x.key === key);
    if (s) {
      const hiddenList = page.hidden[key] || [];
      const fields = s.builtIn ? builtInFields(role, data, key) : [];
      const setFields = (list) => setData((d) => {
        const p = pageOf(d);
        return s.builtIn ? withPage(d, { extra: { ...p.extra, [key]: list } }) : withPage(d, { custom: p.custom.map((c) => (c.id === key ? { ...c, fields: list } : c)) });
      });
      const rename = (v) => setData((d) => {
        const p = pageOf(d);
        return s.builtIn ? withPage(d, { names: { ...p.names, [key]: v } }) : withPage(d, { custom: p.custom.map((c) => (c.id === key ? { ...c, name: v } : c)) });
      });
      const toggleHidden = (fk) => setPage({ hidden: { ...page.hidden, [key]: hiddenList.includes(fk) ? hiddenList.filter((x) => x !== fk) : [...hiddenList, fk] } });
      const removeSection = () => { setData((d) => { const p = pageOf(d); return withPage(d, { custom: p.custom.filter((c) => c.id !== key), order: p.order.filter((k) => k !== key) }); }); setSheet(null); };
      const currentName = s.builtIn ? (page.names[key] ?? "") : (page.custom.find((c) => c.id === key)?.name ?? "");
      sheetEl = (
        <Sheet title={s.label} kicker={s.builtIn ? "SECTION" : "YOUR OWN SECTION"} color={ring} onClose={() => setSheet(null)}>
          <label>
            <span className={label} style={MONO}>SECTION NAME</span>
            <input value={currentName} onChange={(e) => rename(e.target.value)} placeholder={s.base || "e.g. Parking pass"} className={`${inputCls} text-[18px] font-semibold`} />
          </label>
          {s.builtIn && (
            <div className="flex flex-col gap-1.5">
              <span className={label + " mb-0"} style={MONO}>WHAT'S IN IT</span>
              {fields.length ? fields.map((f) => {
                const off = hiddenList.includes(f.key);
                return (
                  <div key={f.key} className="flex items-center gap-2 min-h-[50px] pl-3 pr-1 rounded-[11px] bg-[#101010] border border-[#262626]" style={{ opacity: off ? 0.5 : 1 }}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[10px] tracking-[0.1em] text-white/55" style={MONO}>{pretty(f.key).toUpperCase()}</span>
                      <span className="block text-[14px] truncate">{valueText(f.value)}</span>
                    </span>
                    <button type="button" aria-pressed={!off} aria-label={off ? `Load ${pretty(f.key)} on events` : `Don't load ${pretty(f.key)} on events`} onClick={() => toggleHidden(f.key)} className="w-11 h-11 text-white/60 hover:text-white">
                      {off ? <EyeOff className="w-4 h-4 mx-auto" /> : <Eye className="w-4 h-4 mx-auto" />}
                    </button>
                  </div>
                );
              }) : <p className="m-0 text-[13.5px] text-white/50">Nothing filled in here yet.</p>}
              <button type="button" onClick={() => { setSheet(null); onEditDetails(key); }} className="min-h-[46px] rounded-[12px] border text-[14px] font-semibold" style={{ borderColor: `${ring}77`, color: ring }}>Edit the details</button>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className={label + " mb-0"} style={MONO}>{s.builtIn ? "YOUR OWN FIELDS" : "FIELDS"}</span>
            <FieldsEditor fields={s.builtIn ? s.extra : (page.custom.find((c) => c.id === key)?.fields || [])} onChange={setFields} color={ring} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label + " mb-0"} style={MONO}>ON EVERY NEW EVENT</span>
            <ModePicker value={s.mode} kept={s.mode === "kept"} onChange={(m) => setData((d) => setMode(role, d, key, m))} color={ring} />
          </div>
          {!s.builtIn && <button type="button" onClick={removeSection} className="min-h-[44px] rounded-[12px] text-[14px] font-semibold text-red-400 border border-red-500/30">Delete this section</button>}
          <button type="button" onClick={() => setSheet(null)} className="min-h-[50px] rounded-[12px] font-bold text-[15px]" style={{ background: ring, color: "#0d0d0d" }}>Done</button>
        </Sheet>
      );
    }
  }

  const sendBtn = role === "venue" ? (
    <button type="button" onClick={() => setSheet("send")} className="min-h-[40px] px-3 rounded-[10px] text-[13px] font-bold flex items-center gap-1.5" style={desktop ? { background: ring, color: "#0d0d0d" } : { border: `1px solid ${ring}88`, color: ring }}>
      <Send className="w-4 h-4" />{desktop ? "Send as a package" : "Send"}
    </button>
  ) : null;
  const topButtons = (
    <div className="flex items-center gap-2">
      {status}
      {sendBtn}
      {!desktop && <button type="button" onClick={() => setSheet("look")} className="min-h-[40px] px-3 rounded-[10px] border border-[#333] text-[13px] font-semibold flex items-center gap-1.5"><Palette className="w-4 h-4" />Look</button>}
      {!desktop && <button type="button" onClick={() => setSheet("preview")} className="min-h-[40px] px-3 rounded-[10px] text-[13px] font-bold" style={{ background: ring, color: "#0d0d0d" }}>Preview</button>}
    </div>
  );

  if (desktop) {
    return (
      <div className="flex flex-col gap-4" style={{ fontFamily: SCENE_FONT }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-[420px]">{nameInput}</div>
          <span className="flex-1" />
          {topButtons}
        </div>
        <div className="grid gap-5 items-start" style={{ gridTemplateColumns: "320px minmax(0, 1fr) 320px" }}>
          <div className="flex flex-col gap-4">
            {progress}
            {actsBlock}
            {sectionsBlock}
          </div>
          <div className="rounded-[18px] border border-[#1f1f1f] bg-[#111] p-4">
            <Preview role={role} look={look} name={name} sub={sub} ring={ring} initials={initials} sections={sections} />
          </div>
          <div className="rounded-[18px] border border-[#1f1f1f] bg-[#111] p-4 flex flex-col gap-3">
            <div className="text-[22px]" style={TITLE_FONT.bold}>The look</div>
            <LookControls look={look} setLook={setLook} ring={ring} onUpload={uploadIconImage} />
          </div>
        </div>
        {sheetEl}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: SCENE_FONT }}>
      <div className="flex items-center justify-end gap-2">
        {topButtons}
      </div>
      <Hero look={look} name={name} sub={sub} ring={ring} initials={initials} onCover={async (f) => { if (!f) return; try { setLook({ cover_url: await uploadIconImage(f) }); } catch (e) { console.error(e); } }} />
      {nameInput}
      {progress}
      {actsBlock}
      {sectionsBlock}
      {sheetEl}
    </div>
  );
}

