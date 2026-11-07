import React, { useRef, useState } from "react";
import { Plus, X, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { LINK_KINDS, guessLinkKind, linkHref } from "@/lib/eventLink";
import { upcomingMonths, DAYS } from "@/lib/bookingPackage";

// The booking package's own circles (job 246): Hospitality & merch, Promo,
// Dates wanted, and the "Send to" corner. The act circles (Artist & set,
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

// ---------- Hospitality & merch ----------
export function HospitalityBody({ form, update }) {
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
    </div>
  );
}
export const hospitalityHas = (form) => {
  const h = form.hospitality || {}, m = form.merch || {};
  return [h.meals, h.guests, h.dietary, h.drinks, m.table, m.split].some(has);
};

// ---------- Promo: the act's picture and their links ----------
export function PromoBody({ form, update, uploadFile }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const links = Array.isArray(form.promo_links) && form.promo_links.length ? form.promo_links : [{ kind: "", url: "" }];
  const setLinks = (next) => update("promo_links", next);
  const setRow = (i, patch) => setLinks(links.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try { update("photo_url", await uploadFile(f)); } catch (err) { console.error(err); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <span className={label}>THE ACT'S PICTURE</span>
        {form.photo_url ? (
          <div className="relative w-full max-w-[260px] aspect-[4/3] rounded-[14px] overflow-hidden border border-[#2a2a2a]">
            <img src={form.photo_url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => update("photo_url", "")} aria-label="Remove the picture" className="absolute right-2 top-2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white/85"><Trash2 className="w-4 h-4" /></button>
          </div>
        ) : null}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-60" style={{ color: GREEN }}>
          <ImagePlus className="w-4 h-4" />{busy ? "Uploading…" : form.photo_url ? "Change the picture" : "Add a picture"}
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className={label}>LINKS FOR THE VENUE TO PROMOTE YOU</span>
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
export const promoHas = (form) => has(form.photo_url) || (form.promo_links || []).some((l) => has(l.url));

// ---------- Dates wanted ----------
export function DatesBody({ wants, setWants }) {
  const months = Array.isArray(wants.months) ? wants.months : [];
  const days = Array.isArray(wants.days) ? wants.days : [];
  const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const anyTime = months.includes("any");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={label}>MONTHS</span>
        <div className="flex flex-wrap gap-2 justify-center">
          {upcomingMonths().map((m) => {
            const on = months.includes(m.key);
            const c = chip(on);
            return <button key={m.key} type="button" aria-pressed={on} disabled={anyTime} onClick={() => setWants({ ...wants, months: toggle(months, m.key) })} className={`${c.className} disabled:opacity-40`} style={c.style}>{m.label}</button>;
          })}
          {(() => { const c = chip(anyTime); return <button type="button" aria-pressed={anyTime} onClick={() => setWants({ ...wants, months: anyTime ? [] : ["any"] })} className={c.className} style={c.style}>Any time</button>; })()}
        </div>
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
      <label><span className={label}>NOTE FOR THE VENUE</span><textarea rows={3} value={wants.note || ""} onChange={(e) => setWants({ ...wants, note: e.target.value })} placeholder="Touring the Southeast, routing through mid-March" className={`${inputCls} py-2.5 resize-none`} /></label>
    </div>
  );
}

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
