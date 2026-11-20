import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cropImage } from "@/lib/cropImage";
import { Plus, X, ExternalLink, ImagePlus, Trash2, Upload, FileText, Pencil, Loader2, ChevronRight, IdCard, SlidersHorizontal } from "lucide-react";
import { PROMO_FORMATS } from "@/lib/newEventWeb";
import { loadFellowPilots, techsFirst } from "@/lib/assignTech";
import PilotCardView from "@/pages/PilotCardView";
import { LINK_KINDS, guessLinkKind, linkHref } from "@/lib/eventLink";
import { DAYS } from "@/lib/bookingPackage";
import TimeSelect from "@/components/showpilot/TimeSelect";
import FxNotesWindow, { ActNotesButton, actHasNotes } from "@/components/showpilot/FxNotesWindow";
import { StagePlotView, StageIcon, hasStagePlot } from "@/components/showpilot/StagePlotView";

// The booking package's own circles (job 246): Hospitality & merch, Promo,
// Dates wanted, and the "Send to" corner. The act circles (Artist,
// Members & inputs, Stage plot, Notes, Contact) come from IntakeFields.
const GREEN = "#8CFF3D";
const RED = "#F87171";
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
const label = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const chip = (on) => ({
  className: "min-h-[44px] px-3.5 rounded-full text-[14px] font-bold border",
  style: on ? { borderColor: GREEN, background: `${GREEN}1f`, color: "#B6FF85" } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" },
});
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// ---------- Rider files (job 331): a tech rider and a hospitality rider ----------
// form.riders = { tech: { url, name, type }, hospitality: { url, name, type } }
// Job 332: also lighting (the lighting rider) and cues (a cue sheet). The
// audio rider keeps the key "tech" so packages from job 331 still read.
export const RIDER_KINDS = { tech: "Audio rider", lighting: "Lighting rider", cues: "Cue sheet", hospitality: "Hospitality rider" };
// updateWith(field, fn): a write that starts from the latest form (uploads
// finish late, and two at once mustn't undo each other).
const writer = (update, updateWith, form) => (field, fn) => (updateWith ? updateWith(field, fn) : update(field, fn(form[field])));
export function RiderFile({ form, update, updateWith, uploadFile, kind }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const riders = form.riders || {};
  const file = riders[kind];
  const name = RIDER_KINDS[kind];
  const onFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setErr("");
    if (picked.size > 15 * 1024 * 1024) { setErr("That file is over 15 MB. Try a smaller copy."); return; }
    setBusy(true);
    try {
      const url = await uploadFile(picked);
      writer(update, updateWith, form)("riders", (cur) => ({ ...(cur || {}), [kind]: { url, name: picked.name, type: picked.type || "" } }));
    } catch (x) { console.error(x); setErr("It didn't upload. Check your signal and try again."); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className={label}>{name.toUpperCase()} (PDF OR PICTURE)</span>
      <input ref={ref} type="file" accept="image/*,application/pdf,.pdf,.doc,.docx" className="hidden" onChange={onFile} />
      {file?.url ? (
        <div className="flex items-center gap-2 min-h-[44px] rounded-[10px] border border-[#2a2a2a] bg-[#101010] pl-3 pr-1">
          <FileText className="w-4 h-4 shrink-0 text-white/55" />
          <a href={file.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[14px] font-semibold" style={{ color: GREEN }}>{file.name || name}</a>
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="min-h-[40px] px-3 text-[13px] font-semibold text-white/75">{busy ? "Uploading…" : "Replace"}</button>
          <button type="button" onClick={() => writer(update, updateWith, form)("riders", (cur) => { const next = { ...(cur || {}) }; delete next[kind]; return next; })} aria-label={`Remove the ${name.toLowerCase()}`} className="w-10 h-10 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="min-h-[44px] rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ color: GREEN }}>
          <Upload className="w-4 h-4" />{busy ? "Uploading…" : `Upload your ${name.toLowerCase()}`}
        </button>
      )}
      {err && <p className="text-[12.5px] text-[#F87171] m-0">{err}</p>}
    </div>
  );
}
const riderOf = (d, kind) => (d?.riders && d.riders[kind]?.url ? d.riders[kind] : null);

// ---------- Tech rider (job 332): Audio and Lighting, two tabs ----------
// form.tech = { audio: { who: "own" | "venue", name, phone, email, card_token },
//               lighting: { who, name, phone, email, card_token, cues, notes } }
// Audio also has the stage plot (form.stage_plot_files, the same files as
// Members & inputs) with the notes icon beside it (job 337): the act's notes
// window, General (form.general_notes) + a chip per member (artist_fx_notes),
// as in My Templates. No separate engineer notes box.
export const TECH_TABS = [["audio", "Audio", "SOUND ENGINEER", "engineer"], ["lighting", "Lighting", "LIGHTING TECH", "LD"]];
const techOf = (d, k) => (d?.tech && typeof d.tech[k] === "object" && d.tech[k]) || {};
const tabHas = (d, k) => {
  const t = techOf(d, k);
  if ([t.who, t.name, t.phone, t.email, t.cues, t.notes].some(has)) return true;
  if (k === "audio") return !!riderOf(d, "tech") || (d.stage_plot_files || []).length > 0 || (d.band_members || []).length > 0 || actHasNotes(d);
  return !!riderOf(d, "lighting") || !!riderOf(d, "cues");
};
export const techRiderHas = (form) => tabHas(form, "audio") || tabHas(form, "lighting");
function TechTabs({ tab, setTab, d }) {
  return (
    <div role="tablist" aria-label="Audio or lighting" className="grid grid-cols-2 gap-1 p-1 rounded-[12px] bg-[#0b0b0b] border border-[#262626]">
      {TECH_TABS.map(([k, name]) => {
        const on = tab === k;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)}
            className="min-h-[44px] rounded-[9px] text-[15px] font-bold flex items-center justify-center gap-2"
            style={on ? { background: GREEN, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.7)" }}>
            {name}{tabHas(d, k) && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "#0d0d0d" : GREEN }} />}
          </button>
        );
      })}
    </div>
  );
}
// The ShowPilot stage plot (job 339): the act's members as laid out in My
// Template, with their inputs. A card that opens the interactive plot.
const memberCount = (d) => (Array.isArray(d.band_members) ? d.band_members : []).length;
const inputCount = (d) => (Array.isArray(d.band_members) ? d.band_members : []).reduce((n, m) => n + instrumentsOf(m).filter((i) => has(i.name)).length, 0);
function ShowPilotPlotCard({ d, actName, line, onRemove = null }) {
  const [open, setOpen] = useState(false);
  const n = memberCount(d), ins = inputCount(d);
  const canOpen = hasStagePlot(d);
  return (
    <div className="flex items-center gap-3 min-h-[60px] rounded-[12px] border bg-[#101010] pl-3 pr-1.5 py-2" style={{ borderColor: `${GREEN}55` }}>
      <span className="w-10 h-10 rounded-[10px] border bg-black shrink-0 flex items-center justify-center" style={{ borderColor: `${GREEN}55`, color: GREEN }}><StageIcon className="w-6 h-6" /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-bold truncate">ShowPilot stage plot</span>
        <span className="block text-[12.5px] text-white/55 leading-snug">{[line, `${n} member${n === 1 ? "" : "s"}`, `${ins} input${ins === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
      </span>
      {canOpen && <button type="button" onClick={() => setOpen(true)} className="min-h-[40px] px-3 rounded-[9px] border border-[#3a3a3a] text-[13px] font-semibold shrink-0">{onRemove ? "View" : "Open"}</button>}
      {onRemove && <button type="button" onClick={onRemove} aria-label="Take the ShowPilot stage plot off" className="w-10 h-10 flex items-center justify-center text-white/45 shrink-0"><X className="w-4 h-4" /></button>}
      {open && <StagePlotView acts={[{ ...d, band_name: actName || d.band_name || "The act" }]} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function TechRiderBody({ form, update, updateWith, uploadFile, h, pullTemplatePlot = null }) {
  const [pulling, setPulling] = useState(false);
  const [pullErr, setPullErr] = useState("");
  const pull = async () => {
    setPullErr("");
    setPulling(true);
    try { const msg = await pullTemplatePlot(); if (msg) setPullErr(msg); }
    catch (x) { console.error(x); setPullErr("Couldn't load My Template. Check your signal and try again."); }
    setPulling(false);
  };
  const [tab, setTab] = useState("audio");
  const [pilots, setPilots] = useState([]);
  useEffect(() => { loadFellowPilots().then((p) => setPilots(techsFirst(p || []))).catch(() => {}); }, []);
  const [, name, who, short] = TECH_TABS.find(([k]) => k === tab);
  const t = techOf(form, tab);
  const setT = (patch) => writer(update, updateWith, form)("tech", (cur) => ({ ...(cur || {}), [tab]: { ...((cur || {})[tab] || {}), ...patch } }));
  const files = form.stage_plot_files || [];
  const plotRef = useRef(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const sideBtn = (v, text) => {
    const c = chip(t.who === v);
    return <button type="button" aria-pressed={t.who === v} onClick={() => setT({ who: t.who === v ? "" : v })} className={`${c.className} flex-1`} style={c.style}>{text}</button>;
  };
  return (
    <div className="flex flex-col gap-4">
      <TechTabs tab={tab} setTab={setTab} d={form} />
      <div className="flex flex-col gap-2">
        <span className={label}>{who}</span>
        <div className="flex gap-2">{sideBtn("own", "We bring our own")}{sideBtn("venue", `Need the venue's ${short}`)}</div>
        {t.who === "own" && (
          <div className="flex flex-col gap-2 rounded-[12px] border border-[#242424] bg-[#101010] p-2.5">
            {pilots.length > 0 && (
              <select value="" onChange={(e) => { const pl = pilots.find((x) => x.id === e.target.value); if (pl) setT({ name: pl.display_name || "", phone: pl.contact_phone || "", email: pl.contact_email || "", card_token: pl.card_share_token || "" }); }} aria-label={`Pick your ${short} from your Fellow Pilots`} className={inputCls}>
                <option value="">From your Fellow Pilots…</option>
                {pilots.map((pl) => <option key={pl.id} value={pl.id}>{pl.display_name}{pl.job_title ? ` · ${pl.job_title}` : ""}</option>)}
              </select>
            )}
            <input value={t.name || ""} onChange={(e) => setT({ name: e.target.value, card_token: "" })} placeholder="Name" aria-label={`${name} tech's name`} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input value={t.phone || ""} onChange={(e) => setT({ phone: h?.formatPhone ? h.formatPhone(e.target.value) : e.target.value })} placeholder="Phone" type="tel" inputMode="tel" aria-label={`${name} tech's phone`} className={inputCls} />
              <input value={t.email || ""} onChange={(e) => setT({ email: e.target.value })} placeholder="Email" type="email" inputMode="email" autoCapitalize="none" aria-label={`${name} tech's email`} className={inputCls} />
            </div>
            {t.card_token && <span className="text-[12px] text-white/55">Their digital card goes with it.</span>}
          </div>
        )}
        {t.who === "venue" && <p className="m-0 text-[12.5px] text-white/55">{tab === "audio" ? "The venue's engineer gets your rider, stage plot and notes." : "The venue's LD gets your rider and cues."}</p>}
      </div>
      <RiderFile form={form} update={update} updateWith={updateWith} uploadFile={uploadFile} kind={tab === "audio" ? "tech" : "lighting"} />
      {tab === "audio" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className={`${label} flex-1 mb-0`}>STAGE PLOT</span>
              <ActNotesButton act={form} onClick={() => setNotesOpen(true)} />
            </div>
            {/* Two ways (job 339): the ShowPilot stage plot from My Template, or a PDF. */}
            {memberCount(form) > 0 ? (
              <ShowPilotPlotCard d={form} actName={form.band_name} line="From My Template" onRemove={() => update("band_members", [])} />
            ) : pullTemplatePlot && (
              <button type="button" onClick={pull} disabled={pulling} className="min-h-[52px] rounded-[12px] border px-3 text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60" style={{ borderColor: `${GREEN}66`, color: GREEN }}>
                {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <StageIcon className="w-5 h-5" />}Use my stage plot from My Template
              </button>
            )}
            {pullErr && <p className="m-0 text-[12.5px] text-[#F87171]">{pullErr}</p>}
            {files.map((f, i) => (
              <div key={`${f.url}-${i}`} className="flex items-center gap-2 min-h-[44px] rounded-[10px] border border-[#2a2a2a] bg-[#101010] pl-3 pr-1">
                <FileText className="w-4 h-4 shrink-0 text-white/55" />
                <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[14px] font-semibold" style={{ color: GREEN }}>{f.name || "Stage plot"}</a>
                {h?.removeStagePlotFile && <button type="button" onClick={() => h.removeStagePlotFile(i)} aria-label={`Remove ${f.name || "the stage plot"}`} className="w-10 h-10 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>}
              </div>
            ))}
            {h?.handleStagePlotUpload && (
              <>
                <input ref={plotRef} type="file" accept="application/pdf,.pdf,image/*" multiple onChange={h.handleStagePlotUpload} className="hidden" />
                <button type="button" onClick={() => plotRef.current?.click()} className="min-h-[44px] rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center justify-center gap-1.5" style={{ color: GREEN }}><Upload className="w-4 h-4" />{files.length ? "Upload another PDF" : "Upload a stage plot PDF"}</button>
              </>
            )}
          </div>
          {notesOpen && (
            <FxNotesWindow acts={[form]} target={0} onTarget={() => {}} actOnly={0}
              onActPatch={(_, patch) => Object.entries(patch).forEach(([k, v]) => update(k, v))}
              onSave={() => setNotesOpen(false)} onClose={() => setNotesOpen(false)} />
          )}
        </>
      ) : (
        <>
          <label><span className={label}>LIGHTING CUES</span><textarea rows={4} value={t.cues || ""} onChange={(e) => setT({ cues: e.target.value })} placeholder={"Song 1: blue wash, no strobe\nSong 4: blackout on the drop\nEncore: full white"} className={`${inputCls} py-2.5 resize-none`} /></label>
          <RiderFile form={form} update={update} updateWith={updateWith} uploadFile={uploadFile} kind="cues" />
          <label><span className={label}>NOTES FOR THE LD</span><textarea rows={2} value={t.notes || ""} onChange={(e) => setT({ notes: e.target.value })} placeholder="No haze, please. Strobe is OK." className={`${inputCls} py-2.5 resize-none`} /></label>
        </>
      )}
    </div>
  );
}

// ---------- Contact (job 332): name, title, phone, email ----------
export function ContactBody({ form, update, formatPhone = (v) => v }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label><span className={label}>NAME</span><input value={form.submitter_name || ""} onChange={(e) => update("submitter_name", e.target.value)} placeholder="Jay Rivera" autoComplete="name" className={inputCls} /></label>
        <label><span className={label}>TITLE</span><input value={form.submitter_title || ""} onChange={(e) => update("submitter_title", e.target.value)} placeholder="Manager" autoComplete="organization-title" className={inputCls} /></label>
      </div>
      <label><span className={label}>PHONE</span><input value={form.submitter_phone || ""} onChange={(e) => update("submitter_phone", formatPhone(e.target.value))} placeholder="(555) 010-0100" type="tel" inputMode="tel" autoComplete="tel" className={inputCls} /></label>
      <label><span className={label}>EMAIL</span><input value={form.submitter_email || ""} onChange={(e) => update("submitter_email", e.target.value)} placeholder="jay@mgmt.com" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" className={inputCls} /></label>
    </div>
  );
}
export const contactHas = (d) => [d.submitter_name, d.submitter_title, d.submitter_phone, d.submitter_email].some(has);
export const contactDone = (d) => has(d.submitter_name) && (has(d.submitter_phone) || has(d.submitter_email));

// ---------- Digital card (job 332): a row that opens someone's card ----------
export function DigitalCardRow({ token, name, photo, line, heading = "DIGITAL CARD", color = RED }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className={label}>{heading}</span>
      <button type="button" disabled={!token} onClick={() => setOpen(true)} className="min-h-[60px] rounded-[12px] border border-[#2a2a2a] bg-[#101010] px-3 flex items-center gap-3 text-left disabled:opacity-60 hover:border-[#444]">
        <span className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-[#1d1d1d] flex items-center justify-center text-[14px] font-bold border" style={{ borderColor: color, color }}>
          {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <IdCard className="w-5 h-5" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold truncate">{name || "Your card"}</span>
          <span className="block text-[12.5px] text-white/55 truncate">{token ? line || "Open the digital card" : "Set up your digital card in Settings"}</span>
        </span>
        {token && <ChevronRight className="w-5 h-5 text-white/45 shrink-0" />}
      </button>
      {open && createPortal(<div className="fixed inset-0" style={{ zIndex: 80 }}><PilotCardView token={token} onClose={() => setOpen(false)} /></div>, document.body)}
    </div>
  );
}

// ---------- The centre (job 332): the act, and the sender's card ----------
export function ActCenterBody({ form, update, uploadFile, artistBody, card }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const onPhoto = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    const f = await cropImage(picked, { aspectW: 1, aspectH: 1, shape: "circle", fit: "cover", outWidth: 900 });
    if (!f) return;
    setBusy(true);
    try { update("photo_url", await uploadFile(f)); } catch (err) { console.error(err); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="w-[84px] h-[84px] rounded-full overflow-hidden shrink-0 border-2 bg-[#101010] flex items-center justify-center" style={{ borderColor: RED }}>
          {form.photo_url ? <img src={form.photo_url} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6 text-white/40" />}
        </span>
        <div className="flex flex-col gap-1.5">
          <span className={label + " mb-0"}>THE ACT'S PICTURE</span>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="min-h-[40px] px-3 rounded-[10px] border border-[#3a3a3a] text-[13.5px] font-semibold disabled:opacity-60">{busy ? "Uploading…" : form.photo_url ? "Change" : "Add a picture"}</button>
            {form.photo_url && <button type="button" onClick={() => update("photo_url", "")} className="min-h-[40px] px-3 text-[13.5px] text-white/55">Remove</button>}
          </div>
        </div>
      </div>
      {artistBody}
      <DigitalCardRow {...card} heading="YOUR DIGITAL CARD (GOES WITH THE PACKAGE)" />
    </div>
  );
}

// ---------- Hospitality & merch ----------
export function HospitalityBody({ form, update, updateWith, uploadFile }) {
  const hosp = form.hospitality || {};
  const merch = form.merch || {};
  const setH = (k, v) => update("hospitality", { ...hosp, [k]: v });
  const setM = (k, v) => update("merch", { ...merch, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <label><span className={label}>MEALS</span><input type="number" inputMode="numeric" min="0" value={hosp.meals ?? ""} onChange={(e) => setH("meals", e.target.value === "" ? "" : Number(e.target.value))} placeholder="4" className={inputCls} /></label>
        <label><span className={label}>GUEST LIST</span><input type="number" inputMode="numeric" min="0" value={hosp.guests ?? ""} onChange={(e) => setH("guests", e.target.value === "" ? "" : Number(e.target.value))} placeholder="4" className={inputCls} /></label>
      </div>
      <label><span className={label}>DIETARY</span><input value={hosp.dietary || ""} onChange={(e) => setH("dietary", e.target.value)} placeholder="1 vegetarian, no nuts" className={inputCls} /></label>
      <label><span className={label}>DRINKS & GREEN ROOM</span><input value={hosp.drinks || ""} onChange={(e) => setH("drinks", e.target.value)} placeholder="Water on stage, towels" className={inputCls} /></label>
      <div className="flex flex-col gap-2">
        <span className={label}>MERCH</span>
        <div className="flex flex-wrap gap-2 justify-center">
          {[["own", "Our own table + seller"], ["venue", "Venue sells it"], ["none", "No merch"]].map(([v, text]) => {
            const c = chip(merch.table === v);
            return <button key={v} type="button" aria-pressed={merch.table === v} onClick={() => setM("table", merch.table === v ? "" : v)} className={c.className} style={c.style}>{text}</button>;
          })}
        </div>
        {merch.table && merch.table !== "none" && (
          <input value={merch.split || ""} onChange={(e) => setM("split", e.target.value)} placeholder="Split, e.g. 80 / 20 soft goods" aria-label="Merch split" className={inputCls} />
        )}
      </div>
      {uploadFile && <RiderFile form={form} update={update} updateWith={updateWith} uploadFile={uploadFile} kind="hospitality" />}
    </div>
  );
}
export const hospitalityHas = (form) => {
  const h = form.hospitality || {}, m = form.merch || {};
  return [h.meals, h.guests, h.dietary, h.drinks, m.table, m.split].some(has) || !!riderOf(form, "hospitality");
};

// ---------- Deal and draw: what a venue weighs before it books (job 248) ----------
export const DEAL_ASKS = [["flat", "Guarantee"], ["door", "Door split"], ["vs", "Guarantee vs %"], ["open", "Open to offers"]];
export const AGES = [["all", "All ages"], ["18", "18+"], ["21", "21+"], ["any", "Either"]];
export const BACKLINE = [["own", "We bring everything"], ["drums", "Need drums"], ["bass", "Need a bass amp"], ["guitar", "Need a guitar amp"], ["keys", "Need keys"]];
const textOf = (list, k) => list.find(([v]) => v === k)?.[1] || "";
export const money = (v) => { const s = String(v ?? "").trim(); return !s ? "" : /^[\d,.]+$/.test(s) ? `$${s}` : s; };
export function dealAskLine(deal = {}) {
  if (deal.ask === "open") return "Open to offers";
  if (deal.ask === "flat") return deal.guarantee ? `${money(deal.guarantee)} guarantee` : "Guarantee";
  if (deal.ask === "door") return deal.door_percent ? `${deal.door_percent}% of the door` : "Door split";
  if (deal.ask === "vs") return [money(deal.guarantee), deal.door_percent ? `${deal.door_percent}%` : ""].filter(Boolean).join(" vs ") || "Guarantee vs %";
  return "";
}
export const backlineLine = (deal = {}) => {
  const b = Array.isArray(deal.backline) ? deal.backline : [];
  const s = b.map((k) => textOf(BACKLINE, k)).filter(Boolean).join(", ");
  return [s, deal.share_backline ? "happy to share" : ""].filter(Boolean).join(" · ");
};
// Documents with the deal (job 332): form.deal_files = [{ url, name, type, kind }]
export const DOC_KINDS = [["w9", "W9"], ["contract", "Contract"], ["insurance", "Insurance"], ["onesheet", "One-sheet / EPK"], ["other", "Other"]];
export function DealDocs({ form, update, updateWith, uploadFile }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const write = writer(update, updateWith, form);
  const docs = Array.isArray(form.deal_files) ? form.deal_files : [];
  const onFiles = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (!list.length) return;
    setErr("");
    setBusy(true);
    for (const f of list) {
      if (f.size > 15 * 1024 * 1024) { setErr(`${f.name} is over 15 MB. Try a smaller copy.`); continue; }
      try {
        const url = await uploadFile(f);
        const kind = /w-?9/i.test(f.name) ? "w9" : /contract|agreement/i.test(f.name) ? "contract" : /insur|coi/i.test(f.name) ? "insurance" : /one.?sheet|epk|press/i.test(f.name) ? "onesheet" : "other";
        write("deal_files", (cur) => [...(Array.isArray(cur) ? cur : []), { url, name: f.name, type: f.type || "", kind }]);
      } catch (x) { console.error(x); setErr("A file didn't upload. Check your signal and try again."); }
    }
    setBusy(false);
  };
  const setKind = (i, kind) => write("deal_files", (cur) => (cur || []).map((d, j) => (j === i ? { ...d, kind } : d)));
  const remove = (i) => write("deal_files", (cur) => (cur || []).filter((_, j) => j !== i));
  return (
    <div className="flex flex-col gap-2">
      <span className={label + " mb-0"}>DOCUMENTS</span>
      {docs.map((d, i) => (
        <div key={`${d.url}-${i}`} className="flex flex-col gap-1.5 rounded-[12px] border border-[#242424] bg-[#101010] p-2.5">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 shrink-0 text-white/55" />
            <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[14px] font-semibold" style={{ color: GREEN }}>{d.name || "Document"}</a>
            <button type="button" onClick={() => remove(i)} aria-label={`Remove ${d.name || "the document"}`} className="w-10 h-10 -my-2 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
          </div>
          <select value={d.kind || "other"} onChange={(e) => setKind(i, e.target.value)} aria-label={`What ${d.name || "this document"} is`} className={inputCls}>
            {DOC_KINDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      ))}
      <input ref={ref} type="file" multiple accept="image/*,application/pdf,.pdf,.doc,.docx" className="hidden" onChange={onFiles} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="min-h-[44px] rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ color: GREEN }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{busy ? "Uploading…" : docs.length ? "Add another document" : "Upload documents"}
      </button>
      <span className="text-[12px] text-white/50">W9, a contract you use, insurance, a one-sheet. PDF, Word or a picture.</span>
      {err && <p className="m-0 text-[12.5px] text-[#F87171]">{err}</p>}
    </div>
  );
}
export function DealBody({ form, update, updateWith, uploadFile }) {
  const deal = form.deal || {};
  const set = (k, v) => update("deal", { ...deal, [k]: v });
  const backline = Array.isArray(deal.backline) ? deal.backline : [];
  const toggleBack = (k) => {
    if (k === "own") return set("backline", backline.includes("own") ? [] : ["own"]);
    const rest = backline.filter((x) => x !== "own");
    set("backline", rest.includes(k) ? rest.filter((x) => x !== k) : [...rest, k]);
  };
  const choice = (list, key, multi) => (
    <div className="flex flex-wrap gap-2 justify-center">
      {list.map(([v, text]) => {
        const on = multi ? backline.includes(v) : deal[key] === v;
        const c = chip(on);
        return <button key={v} type="button" aria-pressed={on} onClick={() => (multi ? toggleBack(v) : set(key, on ? "" : v))} className={c.className} style={c.style}>{text}</button>;
      })}
    </div>
  );
  // Simplified (job 337, Jay 2026-11-18): the deal first, then the numbers,
  // then the rest. No Recent shows (an older package's note is just not shown).
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={label}>THE DEAL</span>
        {choice(DEAL_ASKS, "ask")}
        {(deal.ask === "flat" || deal.ask === "vs" || deal.ask === "door") && (
          <div className="grid grid-cols-2 gap-2">
            {(deal.ask === "flat" || deal.ask === "vs") && <label><span className={label}>GUARANTEE</span><input inputMode="decimal" value={deal.guarantee || ""} onChange={(e) => set("guarantee", e.target.value)} placeholder="$500" className={inputCls} /></label>}
            {(deal.ask === "door" || deal.ask === "vs") && <label><span className={label}>DOOR %</span><input type="number" inputMode="numeric" min="0" max="100" value={deal.door_percent ?? ""} onChange={(e) => set("door_percent", e.target.value === "" ? "" : Number(e.target.value))} placeholder="70" className={inputCls} /></label>}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label><span className={label}>EXPECTED DRAW</span><input type="number" inputMode="numeric" min="0" value={deal.draw ?? ""} onChange={(e) => set("draw", e.target.value === "" ? "" : Number(e.target.value))} placeholder="150" className={inputCls} /></label>
        <label><span className={label}>TICKET PRICE</span><input value={deal.ticket_price || ""} onChange={(e) => set("ticket_price", e.target.value)} placeholder="$15" className={inputCls} /></label>
      </div>
      <label><span className={label}>BASED IN</span><input value={deal.hometown || ""} onChange={(e) => set("hometown", e.target.value)} placeholder="Atlanta, GA" autoComplete="address-level2" className={inputCls} /></label>
      <div className="flex flex-col gap-2"><span className={label}>AGES</span>{choice(AGES, "age")}</div>
      <div className="flex flex-col gap-2">
        <span className={label}>BACKLINE</span>
        {choice(BACKLINE, "backline", true)}
        {(() => { const c = chip(!!deal.share_backline); return <div className="flex justify-center"><button type="button" aria-pressed={!!deal.share_backline} onClick={() => set("share_backline", !deal.share_backline)} className={c.className} style={c.style}>Happy to share with other acts</button></div>; })()}
      </div>
      {uploadFile && <DealDocs form={form} update={update} updateWith={updateWith} uploadFile={uploadFile} />}
    </div>
  );
}
export const dealHas = (form) => {
  const d = form.deal || {};
  return [d.hometown, d.draw, d.ask, d.ticket_price, d.age].some(has) || (Array.isArray(d.backline) && d.backline.length > 0)
    || (Array.isArray(form.deal_files) && form.deal_files.length > 0);
};

// ---------- Promo (job 332): the sizes they made, each uploaded and edited at its ratio, and links ----------
// form.promo_picked = ["sq", "st", ...]; form.promo_images = { sq: { url, name }, ... }
const PROMO_ASPECT = { sq: [1, 1], pt: [4, 5], st: [9, 16], wd: [16, 9], fb: [191, 100], pr: [11, 17] };
const promoPicked = (d) => (Array.isArray(d.promo_picked) ? d.promo_picked : Object.keys(d.promo_images || {}));
export function PromoBody({ form, update, updateWith, uploadFile }) {
  const ref = useRef(null);
  const forId = useRef("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const write = writer(update, updateWith, form);
  const picked = promoPicked(form);
  const imgs = form.promo_images || {};
  const links = Array.isArray(form.promo_links) && form.promo_links.length ? form.promo_links : [{ kind: "", url: "" }];
  const setLinks = (next) => update("promo_links", next);
  const setRow = (i, patch) => setLinks(links.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const togglePick = (id) => write("promo_picked", (cur) => {
    const list = Array.isArray(cur) ? cur : Object.keys(form.promo_images || {});
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  });
  // Through the photo editor at that size (drag, zoom, rotate), then up.
  const put = async (id, file) => {
    const [aw, ah] = PROMO_ASPECT[id] || [1, 1];
    const edited = await cropImage(file, { aspectW: aw, aspectH: ah, fit: "cover", outWidth: aw >= ah ? 1920 : 1080 });
    if (!edited) return;
    setBusy(id);
    setErr("");
    try {
      const url = await uploadFile(edited);
      write("promo_images", (cur) => ({ ...(cur || {}), [id]: { url, name: file.name || "promo.jpg" } }));
    } catch (x) { console.error(x); setErr("That didn't upload. Check your signal and try again."); }
    setBusy("");
  };
  const pick = (id) => { forId.current = id; ref.current?.click(); };
  const onFile = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) put(forId.current, f); };
  const edit = async (id) => {
    const im = imgs[id];
    if (!im?.url) return;
    setBusy(id);
    try {
      const blob = await (await fetch(im.url)).blob();
      setBusy("");
      await put(id, new File([blob], im.name || "promo.jpg", { type: blob.type || "image/jpeg" }));
    } catch (x) { console.error(x); setBusy(""); setErr("Couldn't open that one to edit. Upload it again instead."); }
  };
  return (
    <div className="flex flex-col gap-4">
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <span className={label + " mb-0"}>SIZES</span>
      <div className="flex flex-wrap gap-2">
        {PROMO_FORMATS.map((p) => {
          const on = picked.includes(p.id);
          const gh = 14, gw = Math.round(gh * Math.min(p.r, 1.9));
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => togglePick(p.id)}
              className="min-h-[44px] pl-2.5 pr-3 rounded-full border flex items-center gap-2 text-[13.5px] font-semibold" style={on ? { borderColor: GREEN, background: `${GREEN}1f`, color: "#B6FF85" } : { borderColor: "#333", color: "rgba(255,255,255,0.75)" }}>
              <span aria-hidden="true" className="block rounded-[2px] border-[1.5px]" style={{ width: gw, height: gh, borderColor: on ? GREEN : "#8a8a8a" }} />
              {p.label}<span className="text-[11px] text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.ratio}</span>
            </button>
          );
        })}
      </div>
      {/* No "pick the sizes" explainer (job 337): nothing shows until a size is picked. */}
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-3 items-end">
          {picked.map((id) => {
            const p = PROMO_FORMATS.find((x) => x.id === id);
            if (!p) return null;
            const up = imgs[id];
            const w = Math.round(Math.min(120 * p.r, 300));
            return (
              <div key={id} className="flex flex-col gap-1.5" style={{ width: Math.max(w, 96) }}>
                <button type="button" onClick={() => pick(id)} disabled={busy === id} aria-label={`${up ? "Replace" : "Upload"} ${p.label} ${p.ratio}`}
                  className="relative w-full rounded-[10px] overflow-hidden flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold text-white/85"
                  style={{ aspectRatio: String(p.r), border: up ? `1.5px solid ${GREEN}` : "1.5px dashed #3a3a3a", background: up ? "#000" : "#101010" }}>
                  {up ? <img src={up.url} alt={`${p.label} graphic`} className="absolute inset-0 w-full h-full object-cover" />
                    : busy === id ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <><Upload className="w-4 h-4" /><span>{p.label}</span><span className="text-[10px] text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.px}</span></>}
                  {up && busy === id && <span className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></span>}
                </button>
                {up && (
                  <div className="flex items-center justify-between text-[12px]">
                    <button type="button" onClick={() => edit(id)} aria-label={`Edit the ${p.label} graphic`} className="min-h-[32px] px-1 flex items-center gap-1 text-white/75"><Pencil className="w-3.5 h-3.5" />Edit</button>
                    <button type="button" onClick={() => write("promo_images", (cur) => { const next = { ...(cur || {}) }; delete next[id]; return next; })} className="min-h-[32px] px-1 text-white/50">Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {err && <p className="m-0 text-[12.5px] text-[#F87171]">{err}</p>}
      <div className="flex flex-col gap-2.5">
        <span className={label}>LINKS</span>
        {links.map((r, i) => {
          const href = linkHref(r.url);
          return (
            <div key={i} className="flex flex-col gap-1.5 rounded-[12px] border border-[#242424] bg-[#101010] p-2.5">
              <div className="flex gap-2">
                <select value={r.kind || ""} onChange={(e) => setRow(i, { kind: e.target.value })} aria-label="What this link is for" className={`${inputCls} !w-[124px] shrink-0 !px-2`}>
                  <option value="">Type…</option>
                  {LINK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
                <input value={r.url || ""} inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => setRow(i, { url: e.target.value, kind: r.kind || guessLinkKind(e.target.value) })} placeholder="Paste the link" aria-label="Link" className={inputCls} />
                {links.length > 1 && <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Remove link" className="min-h-[44px] w-[40px] shrink-0 flex items-center justify-center text-white/40"><X className="w-4 h-4" /></button>}
              </div>
              {href && /\./.test(r.url) && <a href={href} target="_blank" rel="noreferrer" className="self-start flex items-center gap-1.5 text-[12.5px] underline break-all" style={{ color: GREEN }}><ExternalLink className="w-3.5 h-3.5 shrink-0" />{href.replace(/^https?:\/\//, "")}</a>}
            </div>
          );
        })}
        <button type="button" onClick={() => setLinks([...links, { kind: "", url: "" }])} className="self-center min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5" style={{ color: GREEN }}><Plus className="w-4 h-4" />Add another link</button>
      </div>
    </div>
  );
}
export const promoHas = (form) => Object.values(form.promo_images || {}).some((x) => has(x?.url)) || (form.promo_links || []).some((l) => has(l.url));

// ---------- Dates wanted ----------
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const selectCls = `${inputCls} appearance-none pr-9 bg-no-repeat bg-[right_12px_center] bg-[length:14px] cursor-pointer`;
const caret = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-opacity='.6' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" };
const monthKeyLabel = (k) => { const [y, m] = k.split("-").map(Number); return `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`; };

// Months as a dropdown (month + year, job 248): add as many as you like;
// each one shows as a chip you can take off.
export function DatesBody({ wants, setWants, noteFor = "THE VENUE", notePlaceholder = "" }) {
  const months = Array.isArray(wants.months) ? wants.months : [];
  const days = Array.isArray(wants.days) ? wants.days : [];
  const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const anyTime = months.includes("any");
  const now = new Date();
  const thisY = now.getFullYear(), thisM = now.getMonth() + 1;
  const years = [thisY, thisY + 1, thisY + 2];
  const [pickY, setPickY] = useState(thisY);
  const [pickM, setPickM] = useState(thisM);
  const pickKey = `${pickY}-${String(pickM).padStart(2, "0")}`;
  const past = pickY === thisY && pickM < thisM;
  const added = months.includes(pickKey);
  const addMonth = () => { if (!past && !added) setWants({ ...wants, months: [...months.filter((k) => k !== "any"), pickKey].sort() }); };
  const chosen = months.filter((k) => k !== "any").sort();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={label}>MONTHS</span>
        <div className="flex gap-2">
          <select aria-label="Month" value={pickM} disabled={anyTime} onChange={(e) => setPickM(Number(e.target.value))} className={`${selectCls} flex-[3] disabled:opacity-40`} style={caret}>
            {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1} disabled={pickY === thisY && i + 1 < thisM}>{n}</option>)}
          </select>
          <select aria-label="Year" value={pickY} disabled={anyTime} onChange={(e) => { const y = Number(e.target.value); setPickY(y); if (y === thisY && pickM < thisM) setPickM(thisM); }} className={`${selectCls} flex-[2] disabled:opacity-40`} style={caret}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={addMonth} disabled={anyTime || past || added} className="shrink-0 min-h-[44px] px-4 rounded-lg text-[14px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ background: GREEN, color: "#0d0d0d" }}><Plus className="w-4 h-4" strokeWidth={3} />{added ? "Added" : "Add"}</button>
        </div>
        {(chosen.length > 0 || anyTime) && (
          <div className="flex flex-wrap gap-2 justify-center">
            {anyTime ? (
              <span className="min-h-[40px] px-3.5 rounded-full text-[14px] font-bold border flex items-center" style={{ borderColor: GREEN, background: `${GREEN}1f`, color: "#B6FF85" }}>Any time</span>
            ) : chosen.map((k) => (
              <button key={k} type="button" onClick={() => setWants({ ...wants, months: months.filter((x) => x !== k) })} aria-label={`Remove ${monthKeyLabel(k)}`} className="min-h-[40px] pl-3.5 pr-2.5 rounded-full text-[14px] font-bold border flex items-center gap-1.5" style={{ borderColor: GREEN, background: `${GREEN}1f`, color: "#B6FF85" }}>{monthKeyLabel(k)}<X className="w-3.5 h-3.5" /></button>
            ))}
          </div>
        )}
        {(() => { const c = chip(anyTime); return <div className="flex justify-center"><button type="button" aria-pressed={anyTime} onClick={() => setWants({ ...wants, months: anyTime ? [] : ["any"] })} className={c.className} style={c.style}>Any time works</button></div>; })()}
      </div>
      <div className="flex flex-col gap-2">
        <span className={label}>NIGHTS</span>
        <div className="flex flex-wrap gap-1.5 justify-center" role="group" aria-label="Nights">
          {DAYS.map((d) => {
            const on = days.includes(d.key);
            return <button key={d.key} type="button" aria-pressed={on} onClick={() => setWants({ ...wants, days: toggle(days, d.key) })} className="min-w-[44px] min-h-[44px] px-2 rounded-[10px] text-[13px] font-bold border" style={on ? { borderColor: GREEN, background: `${GREEN}1f`, color: "#B6FF85" } : { borderColor: "#333", color: "rgba(255,255,255,0.6)" }}>{d.label}</button>;
          })}
        </div>
        <span className="text-center text-[12.5px] text-white/50">Leave the nights blank if any night works.</span>
      </div>
      <label><span className={label}>NOTE FOR {noteFor}</span><textarea rows={3} value={wants.note || ""} onChange={(e) => setWants({ ...wants, note: e.target.value })} placeholder={notePlaceholder || "Touring the Southeast, routing through mid-March"} className={`${inputCls} py-2.5 resize-none`} /></label>
    </div>
  );
}

// ---------- Dates wanted: months and nights, or exact dates (job 347) ----------
// Exact dates are for an act that already knows the nights: the venue can
// confirm one straight away. wants.dates = [{ date, set_time, load_in }].
function ExactDates({ wants, setWants, noteFor }) {
  const dates = Array.isArray(wants.dates) ? wants.dates : [];
  const [pick, setPick] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const setDates = (list) => setWants({ ...wants, months: [], days: [], dates: list });
  const add = () => { if (pick && pick >= today && !dates.some((d) => d.date === pick) && dates.length < 10) { setDates([...dates, { date: pick, set_time: "", load_in: "" }].sort((a, b) => a.date.localeCompare(b.date))); setPick(""); } };
  const patch = (date, p) => setDates(dates.map((d) => (d.date === date ? { ...d, ...p } : d)));
  const fmtDay = (k) => new Date(`${k}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={label}>ADD A DATE</span>
        <div className="flex gap-2">
          <input type="date" aria-label="Date" min={today} value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputCls} flex-1`} />
          <button type="button" onClick={add} disabled={!pick || pick < today || dates.length >= 10} className="shrink-0 min-h-[44px] px-4 rounded-lg text-[14px] font-bold disabled:opacity-40" style={{ background: GREEN, color: "#0d0d0d" }}>Add</button>
        </div>
        <span className="text-[12.5px] text-white/50">Up to 10. The venue can confirm one, or offer other nights.</span>
      </div>
      {dates.map((d) => (
        <div key={d.date} className="rounded-[12px] border border-[#2a2a2a] bg-[#101010] px-3 py-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[14.5px] font-bold">{fmtDay(d.date)}</span>
            <button type="button" onClick={() => setDates(dates.filter((x) => x.date !== d.date))} aria-label={`Remove ${fmtDay(d.date)}`} className="w-9 h-9 flex items-center justify-center text-white/55"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-4">
            <div><span className={label}>WE'D GO ON AT</span><TimeSelect value={d.set_time || ""} onChange={(v) => patch(d.date, { set_time: v })} color={GREEN} label={`Set time ${fmtDay(d.date)}`} /></div>
            <div><span className={label}>LOAD-IN</span><TimeSelect value={d.load_in || ""} onChange={(v) => patch(d.date, { load_in: v })} color={GREEN} label={`Load-in ${fmtDay(d.date)}`} /></div>
          </div>
        </div>
      ))}
      <label><span className={label}>NOTE FOR {noteFor}</span><textarea rows={3} value={wants.note || ""} onChange={(e) => setWants({ ...wants, note: e.target.value })} className={`${inputCls} py-2.5`} /></label>
    </div>
  );
}

export function DatesWantedBody({ wants, setWants, noteFor = "THE VENUE", notePlaceholder = "" }) {
  const [mode, setMode] = useState(() => (Array.isArray(wants.dates) && wants.dates.length ? "exact" : "month"));
  const seg = (v, text) => (
    <button type="button" role="tab" aria-selected={mode === v} onClick={() => { if (v !== mode) { setMode(v); setWants({ ...wants, months: [], days: [], dates: [] }); } }}
      className="flex-1 min-h-[40px] rounded-full text-[13.5px] font-bold" style={mode === v ? { background: GREEN, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.7)" }}>{text}</button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="How to ask" className="flex gap-1 p-1 rounded-full border border-[#2a2a2a] bg-[#0b0b0b]">{seg("month", "Months and nights")}{seg("exact", "Exact dates")}</div>
      {mode === "exact" ? <ExactDates wants={wants} setWants={setWants} noteFor={noteFor} /> : <DatesBody wants={wants} setWants={setWants} noteFor={noteFor} notePlaceholder={notePlaceholder} />}
    </div>
  );
}
export const datesHave = (wants = {}) => (Array.isArray(wants.months) && wants.months.length > 0) || (Array.isArray(wants.dates) && wants.dates.length > 0);

// ---------- Send to (corner) ----------
export function SendToBody({ to, setTo, formatPhone = (v) => v }) {
  return (
    <div className="flex flex-col gap-3">
      <label><span className={label}>VENUE</span><input value={to.name || ""} onChange={(e) => setTo({ ...to, name: e.target.value })} placeholder="The Spot" autoComplete="organization" className={inputCls} /></label>
      <label><span className={label}>THEIR EMAIL</span><input value={to.email || ""} onChange={(e) => setTo({ ...to, email: e.target.value })} placeholder="booking@thespot.com" type="email" inputMode="email" autoCapitalize="none" className={inputCls} /></label>
      <label><span className={label}>OR THEIR PHONE</span><input value={to.phone || ""} onChange={(e) => setTo({ ...to, phone: formatPhone(e.target.value) })} placeholder="(555) 010-0100" type="tel" inputMode="tel" className={inputCls} /></label>
      <span className="text-center text-[12.5px] text-white/55">After you send it, you can text or email them the link. They don't need a ShowPilot account to open it.</span>
    </div>
  );
}
export const sendToDone = (to) => has(to.name) && (has(to.email) || has(to.phone));
export { RED as PACKAGE_COLOR };

// ---------- What the venue sees (read-only; job 246, step 2) ----------
const Row = ({ k, v }) => (v ? (
  <div className="flex justify-between gap-3 py-2 border-t border-[#1f1f1f] first:border-t-0 text-[14.5px]">
    <span className="text-white/55 shrink-0">{k}</span><span className="text-right font-semibold break-words min-w-0">{v}</span>
  </div>
) : null);
const Empty = ({ children }) => <p className="text-center text-[14px] text-white/50">{children}</p>;
const instrumentsOf = (m) => (Array.isArray(m.instruments) ? m.instruments : m.instrument ? [{ name: m.instrument, mic_di: m.mic_di }] : []);
const MERCH = { own: "Their own table + seller", venue: "They'd like the venue to sell it", none: "No merch" };

// The Tech rider as the venue reads it (job 332): the same two tabs.
function TechRiderRead({ d, actName = "" }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [tab, setTab] = useState(() => (tabHas(d, "audio") || !tabHas(d, "lighting") ? "audio" : "lighting"));
  const t = techOf(d, tab);
  const [, name, who, short] = TECH_TABS.find(([k]) => k === tab);
  const files = Array.isArray(d.stage_plot_files) ? d.stage_plot_files : [];
  const fileLink = (f, i, text) => f?.url ? <a key={i} href={f.url} target="_blank" rel="noreferrer" className="min-h-[44px] rounded-[10px] border border-[#2a2a2a] px-3 flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: GREEN }}><FileText className="w-4 h-4 shrink-0" />{text}<span className="text-white/50 font-normal truncate">{f.name}</span></a> : null;
  const rider = riderOf(d, tab === "audio" ? "tech" : "lighting");
  const cues = riderOf(d, "cues");
  const side = t.who === "own" ? `Bringing their own ${short}` : t.who === "venue" ? `Needs the venue's ${short}` : "";
  return (
    <div className="flex flex-col gap-3">
      <TechTabs tab={tab} setTab={setTab} d={d} />
      {!tabHas(d, tab) ? <Empty>Nothing about {name.toLowerCase()} yet.</Empty> : (
        <>
          <div className="flex flex-col">
            <Row k={who.charAt(0) + who.slice(1).toLowerCase()} v={side} />
            {t.who === "own" && <>
              <Row k="Name" v={t.name} />
              <Row k="Phone" v={t.phone ? <a href={`tel:${String(t.phone).replace(/[^\d+]/g, "")}`} style={{ color: GREEN }}>{t.phone}</a> : ""} />
              <Row k="Email" v={t.email ? <a href={`mailto:${t.email}`} style={{ color: GREEN }}>{t.email}</a> : ""} />
            </>}
          </div>
          {t.who === "own" && t.card_token && <DigitalCardRow token={t.card_token} name={t.name} line={`Their ${short}'s digital card`} heading={`${short.toUpperCase()}'S CARD`} />}
          {fileLink(rider, "rider", RIDER_KINDS[tab === "audio" ? "tech" : "lighting"])}
          {tab === "audio" ? (
            <>
              {(memberCount(d) > 0 || files.length > 0) && (
                <div className="flex flex-col gap-1.5">
                  <span className={label + " mb-0"}>STAGE PLOT</span>
                  {memberCount(d) > 0 && <ShowPilotPlotCard d={d} actName={actName} line="" />}
                  {files.map((f, i) => fileLink(f, i, "Stage plot"))}
                </div>
              )}
              {actHasNotes(d) && (
                <div className="flex items-center gap-2">
                  <ActNotesButton act={d} onClick={() => setNotesOpen(true)} />
                  <span className="text-[13px] text-white/55">Notes from the act</span>
                </div>
              )}
              {notesOpen && <FxNotesWindow acts={[{ ...d, band_name: actName || d.band_name }]} target={0} onTarget={() => {}} actOnly={0} onClose={() => setNotesOpen(false)} />}
            </>
          ) : (
            <>
              {has(t.cues) && <div className="flex flex-col gap-1"><span className={label + " mb-0"}>LIGHTING CUES</span><p className="m-0 text-[14.5px] text-white/85 whitespace-pre-wrap">{t.cues}</p></div>}
              {fileLink(cues, "cues", "Cue sheet")}
              {has(t.notes) && <div className="flex flex-col gap-1"><span className={label + " mb-0"}>NOTES FOR THE LD</span><p className="m-0 text-[14.5px] text-white/85 whitespace-pre-wrap">{t.notes}</p></div>}
            </>
          )}
        </>
      )}
    </div>
  );
}

// The centre as the venue opens it (job 332): the act, and who sent it.
export function ActCenterRead({ pkg }) {
  const d = pkg?.data || {};
  const genres = Array.isArray(d.genre_tags) ? d.genre_tags : [];
  const s = pkg?.sender || {};
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        {(d.photo_url || s.photo) && <img src={d.photo_url || s.photo} alt="" className="w-[120px] h-[120px] rounded-full object-cover border-2" style={{ borderColor: RED }} />}
        <div className="text-[22px] font-bold leading-tight">{pkg?.act_name}</div>
        {genres.length > 0 && <div className="text-[14px] text-white/65">{genres.join(" · ")}</div>}
        {has(d.deal?.hometown) && <div className="text-[13px] text-white/55">Based in {d.deal.hometown}</div>}
      </div>
      <DigitalCardRow token={s.card} name={s.name} photo={s.photo} line={[d.submitter_title, "Open their digital card"].filter(Boolean).join(" · ")} heading="SENT BY" />
    </div>
  );
}

export function packageReadCircles(pkg, wantsText) {
  const d = pkg?.data || {};
  const links = (Array.isArray(d.promo_links) ? d.promo_links : []).filter((l) => has(l.url));
  const imgs = d.promo_images || {};
  const promoIds = promoPicked(d).filter((id) => imgs[id]?.url);
  const hosp = d.hospitality || {};
  const merch = d.merch || {};
  const deal = d.deal || {};
  const docs = (Array.isArray(d.deal_files) ? d.deal_files : []).filter((x) => has(x.url));
  const c = (key, label, short, done, body, extra = {}) => ({ key, label, short, done, body, ...extra });
  const riderLink = (kind) => {
    const r = riderOf(d, kind);
    return r ? <a href={r.url} target="_blank" rel="noreferrer" className="mt-2 w-full min-h-[44px] rounded-[10px] border border-[#2a2a2a] px-3 flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: GREEN }}><FileText className="w-4 h-4 shrink-0" />{RIDER_KINDS[kind]}<span className="text-white/50 font-normal truncate">{r.name}</span></a> : null;
  };
  // Clockwise in the order a venue books (job 332): when, the deal and its
  // paperwork, how it'll sell, the tech side, hospitality, who to call. The
  // act and the sender's card are the centre.
  return [
    c("dates", "Dates wanted", "Dates wanted", true, () => (
      <div className="flex flex-col gap-2 text-center">
        <span className="text-[18px] font-bold">{wantsText || "Any time"}</span>
        {has(pkg.wants?.note) && <p className="text-[14.5px] text-white/75">"{pkg.wants.note}"</p>}
      </div>
    )),
    c("deal", "Deal & docs", "Deal & docs", dealHas(d), () => (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          <Row k="Deal" v={dealAskLine(deal)} />
          <Row k="Expected draw" v={has(deal.draw) ? `${deal.draw} people` : ""} />
          <Row k="Tickets" v={deal.ticket_price} />
          <Row k="Based in" v={deal.hometown} />
          <Row k="Ages" v={textOf(AGES, deal.age)} />
          <Row k="Backline" v={backlineLine(deal)} />
        </div>
        {docs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className={label + " mb-0"}>DOCUMENTS</span>
            {docs.map((x, i) => <a key={i} href={x.url} target="_blank" rel="noreferrer" className="min-h-[44px] rounded-[10px] border border-[#2a2a2a] px-3 flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: GREEN }}><FileText className="w-4 h-4 shrink-0" />{textOf(DOC_KINDS, x.kind) || "Document"}<span className="text-white/50 font-normal truncate">{x.name}</span></a>)}
          </div>
        )}
      </div>
    )),
    c("promo", "Promo", "Promo", promoHas(d), () => (
      <div className="flex flex-col gap-3">
        {promoIds.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center items-end">
            {promoIds.map((id) => {
              const p = PROMO_FORMATS.find((x) => x.id === id);
              return (
                <a key={id} href={imgs[id].url} target="_blank" rel="noreferrer" className="flex flex-col gap-1 items-center" style={{ width: Math.max(Math.round(Math.min(130 * (p?.r || 1), 300)), 96) }}>
                  <img src={imgs[id].url} alt={`${pkg.act_name} ${p?.label || ""}`} className="w-full rounded-[10px] border border-[#2a2a2a] object-cover" style={{ aspectRatio: String(p?.r || 1) }} />
                  <span className="text-[12px] text-white/60">{p?.label} <span className="text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p?.ratio}</span></span>
                </a>
              );
            })}
          </div>
        )}
        {links.map((l, i) => {
          const kind = LINK_KINDS.find((k) => k.key === l.kind)?.label || "Link";
          return <a key={i} href={linkHref(l.url)} target="_blank" rel="noreferrer" className="w-full min-h-[44px] rounded-[10px] border border-[#2a2a2a] px-3 flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: GREEN }}><ExternalLink className="w-4 h-4 shrink-0" />{kind}<span className="text-white/50 font-normal truncate">{String(l.url).replace(/^https?:\/\//, "")}</span></a>;
        })}
        {!promoHas(d) && <Empty>No promo sent.</Empty>}
      </div>
    )),
    c("tech", "Tech rider", "Tech rider", techRiderHas(d), () => <TechRiderRead d={d} actName={pkg.act_name} />, { icon: <SlidersHorizontal /> }),
    c("hosp", "Hospitality and merch", "Hospitality", hospitalityHas(d), () => (hospitalityHas(d) ? (
      <div className="flex flex-col">
        <Row k="Meals" v={has(hosp.meals) ? String(hosp.meals) : ""} />
        <Row k="Guest list" v={has(hosp.guests) ? `+${hosp.guests}` : ""} />
        <Row k="Dietary" v={hosp.dietary} />
        <Row k="Drinks & green room" v={hosp.drinks} />
        <Row k="Merch" v={MERCH[merch.table] || ""} />
        <Row k="Split" v={merch.split} />
        {riderLink("hospitality")}
      </div>
    ) : <Empty>Nothing asked for.</Empty>)),
    c("contact", "Their contact", "Contact", contactHas(d), () => (
      <div className="flex flex-col">
        <Row k="Name" v={d.submitter_name} />
        <Row k="Title" v={d.submitter_title} />
        <Row k="Phone" v={d.submitter_phone ? <a href={`tel:${String(d.submitter_phone).replace(/[^\d+]/g, "")}`} style={{ color: GREEN }}>{d.submitter_phone}</a> : ""} />
        <Row k="Email" v={d.submitter_email ? <a href={`mailto:${d.submitter_email}`} style={{ color: GREEN }}>{d.submitter_email}</a> : ""} />
      </div>
    )),
  // Every circle the act could fill in is always there (job 345), so the
  // venue sees what was sent and what wasn't; an empty one says so.
  ].map((x) => (x.done || x.key === "dates" ? x : { ...x, body: () => <Empty>Not sent.</Empty> }));
}
