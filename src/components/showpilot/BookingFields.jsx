import React, { useRef, useState } from "react";
import { cropImage } from "@/lib/cropImage";
import { Plus, X, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { LINK_KINDS, guessLinkKind, linkHref } from "@/lib/eventLink";
import { DAYS } from "@/lib/bookingPackage";

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
export function DealBody({ form, update }) {
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
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <label><span className={label}>BASED IN</span><input value={deal.hometown || ""} onChange={(e) => set("hometown", e.target.value)} placeholder="Atlanta, GA" autoComplete="address-level2" className={inputCls} /></label>
        <label><span className={label}>EXPECTED DRAW</span><input type="number" inputMode="numeric" min="0" value={deal.draw ?? ""} onChange={(e) => set("draw", e.target.value === "" ? "" : Number(e.target.value))} placeholder="150" className={inputCls} /></label>
      </div>
      <div className="flex flex-col gap-2">
        <span className={label}>THE DEAL YOU'RE LOOKING FOR</span>
        {choice(DEAL_ASKS, "ask")}
        {(deal.ask === "flat" || deal.ask === "vs" || deal.ask === "door") && (
          <div className="grid grid-cols-2 gap-2">
            {(deal.ask === "flat" || deal.ask === "vs") && <label><span className={label}>GUARANTEE</span><input inputMode="decimal" value={deal.guarantee || ""} onChange={(e) => set("guarantee", e.target.value)} placeholder="$500" className={inputCls} /></label>}
            {(deal.ask === "door" || deal.ask === "vs") && <label><span className={label}>DOOR %</span><input type="number" inputMode="numeric" min="0" max="100" value={deal.door_percent ?? ""} onChange={(e) => set("door_percent", e.target.value === "" ? "" : Number(e.target.value))} placeholder="70" className={inputCls} /></label>}
          </div>
        )}
      </div>
    </div>
  );
}
export const dealHas = (form) => {
  const d = form.deal || {};
  return [d.hometown, d.draw, d.recent, d.ask, d.ticket_price, d.age].some(has) || (Array.isArray(d.backline) && d.backline.length > 0);
};

// ---------- Promo: the act's picture and their links ----------
export function PromoBody({ form, update, uploadFile }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const links = Array.isArray(form.promo_links) && form.promo_links.length ? form.promo_links : [{ kind: "", url: "" }];
  const setLinks = (next) => update("promo_links", next);
  const setRow = (i, patch) => setLinks(links.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const onPhoto = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    const f = await cropImage(picked, { aspectW: 4, aspectH: 3, fit: "cover", outWidth: 1000 });
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
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const selectCls = `${inputCls} appearance-none pr-9 bg-no-repeat bg-[right_12px_center] bg-[length:14px] cursor-pointer`;
const caret = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-opacity='.6' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" };
const monthKeyLabel = (k) => { const [y, m] = k.split("-").map(Number); return `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`; };

// Months as a dropdown (month + year, job 248): add as many as you like;
// each one shows as a chip you can take off.
export function DatesBody({ wants, setWants }) {
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

// ---------- What the venue sees (read-only; job 246, step 2) ----------
const Row = ({ k, v }) => (v ? (
  <div className="flex justify-between gap-3 py-2 border-t border-[#1f1f1f] first:border-t-0 text-[14.5px]">
    <span className="text-white/55 shrink-0">{k}</span><span className="text-right font-semibold break-words min-w-0">{v}</span>
  </div>
) : null);
const Empty = ({ children }) => <p className="text-center text-[14px] text-white/50">{children}</p>;
const instrumentsOf = (m) => (Array.isArray(m.instruments) ? m.instruments : m.instrument ? [{ name: m.instrument, mic_di: m.mic_di }] : []);
const MERCH = { own: "Their own table + seller", venue: "They'd like the venue to sell it", none: "No merch" };

export function packageReadCircles(pkg, wantsText) {
  const d = pkg?.data || {};
  const members = Array.isArray(d.band_members) ? d.band_members : [];
  const files = Array.isArray(d.stage_plot_files) ? d.stage_plot_files : [];
  const links = (Array.isArray(d.promo_links) ? d.promo_links : []).filter((l) => has(l.url));
  const hosp = d.hospitality || {};
  const merch = d.merch || {};
  const inputs = members.reduce((n, m) => n + instrumentsOf(m).filter((i) => has(i.name)).length, 0);
  const genres = Array.isArray(d.genre_tags) ? d.genre_tags : [];
  const deal = d.deal || {};
  const c = (key, label, short, done, body) => ({ key, label, short, done, body });
  // A venue reads it in this order (job 289): who they are, how they look and
  // sound, the deal, when, hospitality, who to call; the audio side last.
  // Only what a venue needs to decide (job 301): who, how they look and
  // sound, the deal, when, who to call. Members, stage plot, notes and
  // hospitality come later, through the intake forms.
  const CORE = ["artist", "promo", "deal", "dates", "contact"];
  return [
    c("artist", "Artist", "Artist", true, () => (
      <div className="flex flex-col">
        <Row k="Artist" v={pkg.act_name} />
        <Row k="Genre" v={genres.join(", ")} />
      </div>
    )),
    c("promo", "Promo", "Promo", promoHas(d), () => (
      <div className="flex flex-col gap-3 items-center">
        {d.photo_url && <img src={d.photo_url} alt={`${pkg.act_name}`} className="w-full max-w-[280px] rounded-[14px] border border-[#2a2a2a] object-cover" />}
        {links.map((l, i) => {
          const kind = LINK_KINDS.find((k) => k.key === l.kind)?.label || "Link";
          return <a key={i} href={linkHref(l.url)} target="_blank" rel="noreferrer" className="w-full min-h-[44px] rounded-[10px] border border-[#2a2a2a] px-3 flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: GREEN }}><ExternalLink className="w-4 h-4 shrink-0" />{kind}<span className="text-white/50 font-normal truncate">{String(l.url).replace(/^https?:\/\//, "")}</span></a>;
        })}
        {!promoHas(d) && <Empty>No promo sent.</Empty>}
      </div>
    )),
    c("deal", "Deal and draw", "Deal & draw", dealHas(d), () => (dealHas(d) ? (
      <div className="flex flex-col">
        <Row k="Based in" v={deal.hometown} />
        <Row k="Expected draw" v={has(deal.draw) ? `${deal.draw} people` : ""} />
        <Row k="Recent shows" v={deal.recent} />
        <Row k="Deal" v={dealAskLine(deal)} />
        <Row k="Tickets" v={deal.ticket_price} />
        <Row k="Ages" v={textOf(AGES, deal.age)} />
        <Row k="Backline" v={backlineLine(deal)} />
      </div>
    ) : <Empty>Nothing sent about the deal or draw.</Empty>)),
    c("dates", "Dates wanted", "Dates wanted", true, () => (
      <div className="flex flex-col gap-2 text-center">
        <span className="text-[18px] font-bold">{wantsText || "Any time"}</span>
        {has(pkg.wants?.note) && <p className="text-[14.5px] text-white/75">"{pkg.wants.note}"</p>}
      </div>
    )),
    c("hosp", "Hospitality and merch", "Hospitality", hospitalityHas(d), () => (hospitalityHas(d) ? (
      <div className="flex flex-col">
        <Row k="Meals" v={has(hosp.meals) ? String(hosp.meals) : ""} />
        <Row k="Guest list" v={has(hosp.guests) ? `+${hosp.guests}` : ""} />
        <Row k="Dietary" v={hosp.dietary} />
        <Row k="Drinks & green room" v={hosp.drinks} />
        <Row k="Merch" v={MERCH[merch.table] || ""} />
        <Row k="Split" v={merch.split} />
      </div>
    ) : <Empty>Nothing asked for.</Empty>)),
    c("contact", "Their contact", "Contact", [d.submitter_name, d.submitter_phone, d.submitter_email].some(has), () => (
      <div className="flex flex-col">
        <Row k="Name" v={d.submitter_name} />
        <Row k="Phone" v={d.submitter_phone ? <a href={`tel:${String(d.submitter_phone).replace(/[^\d+]/g, "")}`} style={{ color: GREEN }}>{d.submitter_phone}</a> : ""} />
        <Row k="Email" v={d.submitter_email ? <a href={`mailto:${d.submitter_email}`} style={{ color: GREEN }}>{d.submitter_email}</a> : ""} />
      </div>
    )),
    c("members", "Members and inputs", "Members & inputs", members.length > 0, () => (members.length ? (
      <div className="flex flex-col gap-2">
        <span className="text-center text-[12.5px] text-white/55">{members.length} member{members.length === 1 ? "" : "s"} · {inputs} input{inputs === 1 ? "" : "s"}</span>
        {members.map((m, i) => (
          <div key={i} className="rounded-[12px] border border-[#242424] bg-[#101010] px-3 py-2.5 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold">{m.name || `Member ${i + 1}`}</div>
              <div className="text-[13px] text-white/65">{instrumentsOf(m).filter((x) => has(x.name)).map((x) => `${x.name}${x.mic_di ? ` (${x.mic_di})` : ""}${x.phantom_power ? " +48V" : ""}`).join(" · ") || "No inputs listed"}</div>
            </div>
            {m.bus_type && <span className="shrink-0 px-2 py-1 rounded-[8px] border border-[#333] text-[12px] font-semibold text-white/80">{m.bus_type}</span>}
          </div>
        ))}
      </div>
    ) : <Empty>No members listed yet.</Empty>)),
    c("plot", "Stage plot", "Stage plot", files.length > 0, () => (files.length ? (
      <div className="flex flex-col gap-2">
        {files.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noreferrer" className="min-h-[44px] rounded-[10px] border border-[#2a2a2a] px-3 flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: GREEN }}><ExternalLink className="w-4 h-4 shrink-0" /><span className="truncate">{f.name || "Stage plot"}</span></a>)}
      </div>
    ) : <Empty>No stage plot sent.</Empty>)),
    c("notes", "Notes for the engineer", "Notes", has(d.general_notes) || members.some((m) => has(m.notes)), () => (
      <div className="flex flex-col gap-2 text-[14.5px] text-white/85 whitespace-pre-wrap">
        {has(d.general_notes) && <p>{d.general_notes}</p>}
        {members.filter((m) => has(m.notes)).map((m, i) => <p key={i}><span className="font-bold">{m.name}:</span> {m.notes}</p>)}
        {!has(d.general_notes) && !members.some((m) => has(m.notes)) && <Empty>No notes.</Empty>}
      </div>
    )),
  // A section they left empty isn't shown at all (less to look at).
  ].filter((x) => CORE.includes(x.key) && (x.done || ["artist", "dates", "contact"].includes(x.key)));
}
