import React, { useEffect, useMemo, useRef, useState } from "react";
import { DatesBody } from "@/components/showpilot/BookingFields";
import { isDateTbd, requestLine } from "@/lib/dateRequest";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, MapPin, Music, SlidersHorizontal, Megaphone, FileText, UserPlus, Building2, Check, X, Plus, MessageSquare, Mail, Copy, ArrowUp, Loader2, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import IntakeKeyWeb, { IntakeSent, useIsDesktop } from "@/components/showpilot/IntakeKeyWeb";
import TimeSelect from "@/components/showpilot/TimeSelect";
import { loadNamed, saveNamed } from "@/lib/namedTemplates";
import { TemplateChooser, SaveAsTemplate } from "@/components/showpilot/TemplateChooser";

// Event templates (job 434): what a Create event web keeps under a name.
// Not the date, the event name, promo (this show only) or paperwork files.
const EVENT_KEYS = ["loadIn", "doors", "onStage", "curfew", "crew", "onFile", "people", "acts", "stagePlot", "stagePlotSave"];
const eventSnapshot = (f) => Object.fromEntries(EVENT_KEYS.filter((k) => f[k] !== undefined && f[k] !== null).map((k) => [k, f[k]]));
function eventTemplateLine(item) {
  const d = item?.data || {};
  const acts = Array.isArray(d.acts) ? d.acts.length : 0;
  const people = Array.isArray(d.people) ? d.people.length : 0;
  return [
    (d.loadIn || d.doors || d.onStage || d.curfew) && "times",
    acts && (acts === 1 ? d.acts[0].name : `${acts} acts`),
    d.crew && "sound / lights",
    people && `${people} co-host${people === 1 ? "" : "s"}`,
  ].filter(Boolean).join(", ");
}
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { useGoBack } from "@/lib/navHistory";
import {
  emptyForm, eventName, loadSources, actTemplate, onFileItems, uploadPromo, createEventFromWeb,
  PROMO_FORMATS, PROMO_LINK_KINDS, guessPromoLinkKind, has, dateSettled, venueFromSources, venueTimes, venueFileItems, uploadStagePlot,
} from "@/lib/newEventWeb";

// New event as a web (job 321), for manager / artist accounts. The sender
// (them) in the middle with their photo and card; a circle per part of the
// event, filled in from their templates where it can be: Date & times, the
// venue, the act, Sound / Lights, Promo (this show only), On file (from My
// Template), Paperwork (only them and the venue) and Co-hosts. Create event
// makes the event, its acts, its invite links and its paperwork, then hands
// over the links to send. Mockup: the "New Event Flow" canvas, bottom row.
// side="venue" (job 323): the venue in the middle, its schedule's times to
// start from, each act invited, Sound / Lights from the house's side, House
// info from the venue template, a contract instead of a W9, co-hosts and a
// promoter.
// A stage plot file, shown (job 335): the picture itself, tap to open it full size;
// a PDF is a tile that opens it.
function PlotPreview({ file }) {
  if (!file?.url) return null;
  const isImage = String(file.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name || file.url);
  return isImage ? (
    <a href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name || "the stage plot"}`} className="block rounded-[10px] overflow-hidden border border-[#2a2a2a] bg-black">
      <img src={file.url} alt={file.name || "Stage plot"} className="w-full max-h-[220px] object-contain" />
    </a>
  ) : (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className="min-h-[56px] rounded-[10px] border border-[#2a2a2a] bg-[#0b0b0b] px-3 flex items-center gap-2.5 text-[14px] font-semibold">
      <FileText className="w-5 h-5 text-white/50 shrink-0" /><span className="truncate">{file.name || "Stage plot (PDF)"}</span><span className="ml-auto text-[12.5px] text-white/55">Open</span>
    </a>
  );
}

const RED = "#F87171";
const BLUE = ACCOUNT_TYPE_STYLES.venue.color;
const GREEN = "#8CFF3D";
const inputCls = "w-full min-h-[46px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
const selectCls = `${inputCls} appearance-none`;
const lab = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const note = "text-[12.5px] text-white/55 leading-relaxed";
const initialsOf = (s) => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const dayText = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
const MAX_FILE = 15 * 1024 * 1024;
const PAPER_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/heic,.doc,.docx";

function Choice({ on, color, onClick, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="min-h-[46px] rounded-[10px] text-[14px] font-semibold border px-2"
      style={on ? { borderColor: color, background: `${color}1f`, color: "#fff" } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" }}>{children}</button>
  );
}

function Toggle({ on, onClick, label, color = RED }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className="w-[60px] h-[44px] shrink-0 flex items-center justify-center">
      <span className="relative block w-[46px] h-[28px] rounded-full transition-colors" style={{ background: on ? color : "#333" }}>
        <span className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-[#0d0d0d] transition-[left]" style={{ left: on ? 21 : 3 }} />
      </span>
    </button>
  );
}

// A Fellow Pilot in a picker row.
function PilotRow({ p, on, color, onClick }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="w-full min-h-[52px] px-2.5 rounded-[10px] border flex items-center gap-3 text-left"
      style={on ? { borderColor: color, background: `${color}14` } : { borderColor: "#262626", background: "#101010" }}>
      <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[13px] font-bold border" style={{ borderColor: on ? color : "#333", color }}>
        {p.profile_photo_url ? <img src={p.profile_photo_url} alt="" className="w-full h-full object-cover" /> : initialsOf(p.display_name)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-semibold truncate">{p.display_name || "Pilot"}</span>
        {p.job_title && <span className="block text-[12.5px] text-white/55 truncate">{p.job_title}</span>}
      </span>
      {on && <Check className="w-4 h-4 shrink-0" style={{ color }} />}
    </button>
  );
}

export default function NewEventWeb({ side = "manager" }) {
  const venueSide = side === "venue";
  const ACCENT = venueSide ? BLUE : RED;
  const { user } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack();
  const location = useLocation();
  const desktop = useIsDesktop();
  const [src, setSrc] = useState(null); // { me, managerTpl, acts, pilots }
  const [f, setF] = useState(() => ({ ...emptyForm(), date: location.state?.prefillDate || "" }));
  const [busy, setBusy] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [made, setMade] = useState(null); // { show, invites, warnings }
  const [error, setError] = useState("");
  const [pilotQuery, setPilotQuery] = useState("");
  const [newAct, setNewAct] = useState("");
  const [copied, setCopied] = useState("");
  // Event templates (job 434): { items } once looked up; choosing shows the
  // pick-a-template screen first; fromTpl is the name of the one in use.
  const [tpl, setTpl] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [fromTpl, setFromTpl] = useState("");
  const promoInput = useRef(null);
  const promoFor = useRef("");
  const paperInput = useRef(null);
  const plotInput = useRef(null);
  const paperFor = useRef("");

  useEffect(() => {
    if (!user) return;
    let gone = false;
    loadSources(user.id, side).then((s) => {
      if (gone) return;
      setSrc(s);
      // One act: it's already on.
      if (!venueSide && s.acts.length === 1) setF((cur) => (cur.acts.length ? cur : { ...cur, acts: [{ name: s.acts[0].name }] }));
      // A venue's times start from its template's schedule.
      if (venueSide) { const t = venueTimes(s); setF((cur) => ({ ...cur, loadIn: cur.loadIn || t.loadIn, doors: cur.doors || t.doors, curfew: cur.curfew || t.curfew })); }
    }).catch((e) => { console.error(e); setSrc({ me: {}, managerTpl: null, venueTpl: null, acts: [], pilots: [] }); });
    loadNamed(user.id, venueSide ? "venue" : "manager", "event").then(({ items }) => {
      if (gone) return;
      setTpl({ items });
      if (items.length) setChoosing(true);
    }).catch((e) => { console.error(e); setTpl({ items: [] }); });
    return () => { gone = true; };
  }, [user]);
  const pickTemplate = (id) => {
    const item = (tpl?.items || []).find((x) => x.id === id);
    if (item) {
      const d = item.data || {};
      setF((cur) => ({ ...cur, ...d, crew: { ...cur.crew, ...(d.crew || {}) }, onFile: { ...(d.onFile || {}) } }));
      setFromTpl(item.name);
    }
    setChoosing(false);
  };
  const saveAsTemplate = async (nm) => {
    const { item, how } = await saveNamed(user.id, venueSide ? "venue" : "manager", "event", { name: nm, data: eventSnapshot(f) }, (src?.me?.display_name || ""));
    setFromTpl(item.name);
    setTpl((t) => ({ items: how === "created" ? [...(t?.items || []), item] : (t?.items || []).map((x) => (x.id === item.id ? item : x)) }));
    return how === "created" ? `Saved "${item.name}". It's in the list next time you make an event.` : `Updated "${item.name}".`;
  };

  const set = (patch) => { setError(""); setF((cur) => ({ ...cur, ...(typeof patch === "function" ? patch(cur) : patch) })); };
  const setVenue = (patch) => set((cur) => ({ venue: { ...cur.venue, ...patch } }));
  const setCrew = (patch) => set((cur) => ({ crew: { ...cur.crew, ...patch } }));
  const setPromo = (patch) => set((cur) => ({ promo: { ...cur.promo, ...patch } }));
  const setPaper = (patch) => set((cur) => ({ paper: { ...cur.paper, ...patch } }));

  const sources = src || { me: {}, managerTpl: null, venueTpl: null, acts: [], pilots: [] };
  const me = sources.me || {};
  const fileItems = useMemo(() => (venueSide ? venueFileItems(sources) : onFileItems(sources, f)), [src, f.acts]); // eslint-disable-line react-hooks/exhaustive-deps
  const house = venueSide ? venueFromSources(sources) : null;
  const pilotById = (id) => sources.pilots.find((p) => p.id === id) || null;
  const venuePilot = pilotById(f.venue.pilotId);
  const firstAct = f.acts[0] || null;
  const uploads = f.promo.picked.filter((id) => f.promo.files[id]?.url);
  const paperCount = ["w9", "agreement", "coi"].filter((k) => f.paper[k]).length + f.paper.other.length;
  const name = eventName(f, house?.name || "");

  // ---------- promo / paperwork files ----------
  const pickPromo = (id) => { promoFor.current = id; promoInput.current?.click(); };
  const onPromoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const id = promoFor.current;
    if (!file || !id || !user) return;
    if (!file.type.startsWith("image/")) { setError("Promo graphics need to be an image (JPG, PNG or WebP)."); return; }
    if (file.size > MAX_FILE) { setError("That image is over 15 MB. Try a smaller copy."); return; }
    setBusy(id);
    try {
      const up = await uploadPromo(user.id, file, id);
      set((cur) => ({ promo: { ...cur.promo, files: { ...cur.promo.files, [id]: up } } }));
    } catch (err) { console.error(err); setError("That didn't upload. Check your signal and try again."); }
    setBusy("");
  };
  const pickPaper = (slot) => { paperFor.current = slot; paperInput.current?.click(); };
  const onPaperFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE) { setError("That file is over 15 MB. Try a smaller copy."); return; }
    const slot = paperFor.current;
    if (slot === "other") setPaper({ other: [...f.paper.other, file] });
    else setPaper({ [slot]: file });
  };

  // ---------- circle bodies ----------
  // Manager / artist (job 331): no act circle. One act in My Templates is
  // simply on; with none or several, who's playing is picked here.
  const pickAct = !venueSide && sources.acts.length !== 1;
  const showBody = () => (
    // With the act picker, two columns on a computer (job 434).
    <div className={pickAct && desktop ? "grid grid-cols-2 gap-6 items-start" : "flex flex-col gap-4"}>
      {pickAct && (
        <div className="pb-1">{actBody()}</div>
      )}
      <div className="flex flex-col gap-4 min-w-0">
      {/* Set the date if it's settled, or ask for one (months, nights, a note) like a booking package; job 329. */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Date">
        <Choice on={f.dateMode !== "request"} color={ACCENT} onClick={() => set({ dateMode: "set" })}>Set the date</Choice>
        <Choice on={f.dateMode === "request"} color={ACCENT} onClick={() => set({ dateMode: "request" })}>Request a date</Choice>
      </div>
      {f.dateMode === "request" ? (
        <>
          <DatesBody wants={f.wants} setWants={(w) => set({ wants: w })} noteFor={venueSide ? "THE ACT" : "THE VENUE"} notePlaceholder={venueSide ? "A Friday or Saturday in the spring, whichever you can do" : ""} />
          <p className={note}>It's held as a request until the date is set. Set the date on the event when it's settled.</p>
          <label><span className={lab}>EVENT NAME</span>
            <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={name || "Low Tide Radio at Clown House"} className={inputCls} />
          </label>
        </>
      ) : (
        <>
          {/* Fits the window without scrolling (job 429): date and name side by
              side on a computer, each time on one line with its label. */}
          <div className={desktop && !pickAct ? "grid grid-cols-2 gap-6 items-start" : "flex flex-col gap-4"}>
          <div className={desktop && !pickAct ? "flex flex-col gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
            <label className="min-w-0"><span className={lab}>DATE</span>
              <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} className={`${inputCls} [color-scheme:dark]`} />
            </label>
            <label className="min-w-0"><span className={lab}>EVENT NAME</span>
              <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={name || "Low Tide Radio at Clown House"} className={inputCls} />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            {[["LOAD-IN", "loadIn"], ["DOORS", "doors"], ["SHOW STARTS", "onStage"], ...(venueSide ? [["CURFEW", "curfew"]] : [])].map(([l, k]) => (
              <div key={k} className="flex items-center gap-3 min-w-0">
                <span className={lab + " mb-0 w-[100px] shrink-0 whitespace-nowrap"}>{l}</span>
                <TimeSelect value={f[k]} onChange={(v) => set({ [k]: v })} color={ACCENT} label={`${l.toLowerCase()} time`} />
              </div>
            ))}
          </div>
          </div>
          <p className={note}>{firstAct?.name ? `Show starts is ${firstAct.name}'s set time. ` : ""}{venueSide ? `Times start from My Template${house?.name ? ` (${house.name})` : ""}.` : "The venue can change these once they're in."}</p>
        </>
      )}
      </div>
    </div>
  );

  const inviteVenue = (
    <div className="flex items-center gap-3 rounded-[12px] border border-[#2a2a2a] bg-[#101010] pl-3">
      <span className="flex-1 min-w-0 py-2">
        <span className="block text-[14.5px] font-semibold">Invite them to the event</span>
        <span className="block text-[12.5px] text-white/55">You'll get their link to text or email when you create it.</span>
      </span>
      <Toggle on={f.venue.invite} label="Invite the venue" onClick={() => setVenue({ invite: !f.venue.invite })} />
    </div>
  );
  const pilotMatches = sources.pilots.filter((p) => !pilotQuery.trim() || `${p.display_name} ${p.job_title}`.toLowerCase().includes(pilotQuery.trim().toLowerCase()));
  const venueBody = () => (
    <div className={desktop && sources.pilots.length > 0 ? "grid grid-cols-2 gap-6 items-start" : "flex flex-col gap-4"}>
      <div className="flex flex-col gap-4 min-w-0">
      <label><span className={lab}>VENUE</span>
        <input value={f.venue.name} onChange={(e) => setVenue({ name: e.target.value, pilotId: null })} placeholder="Clown House" autoComplete="organization" className={inputCls} />
      </label>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <label><span className={lab}>CITY</span><input value={f.venue.city} onChange={(e) => setVenue({ city: e.target.value })} placeholder="Nashville" className={inputCls} /></label>
        <label><span className={lab}>STATE</span><input value={f.venue.state} onChange={(e) => setVenue({ state: e.target.value })} placeholder="TN" className={inputCls} /></label>
      </div>
      {inviteVenue}
      </div>
      {sources.pilots.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={lab + " mb-0"}>FROM YOUR FELLOW PILOTS</span>
          {sources.pilots.length > 5 && <input value={pilotQuery} onChange={(e) => setPilotQuery(e.target.value)} placeholder="Search" aria-label="Search Fellow Pilots" className={inputCls} />}
          <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
            {pilotMatches.slice(0, 30).map((p) => (
              <PilotRow key={p.id} p={p} color={BLUE} on={f.venue.pilotId === p.id} onClick={() => setVenue(f.venue.pilotId === p.id ? { pilotId: null } : { pilotId: p.id, name: p.display_name || f.venue.name })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const toggleAct = (n) => set((cur) => ({ acts: cur.acts.some((a) => a.name === n) ? cur.acts.filter((a) => a.name !== n) : [...cur.acts, { name: n }] }));
  const addAct = () => {
    const n = newAct.trim();
    if (!n) return;
    if (!f.acts.some((a) => a.name.toLowerCase() === n.toLowerCase())) set((cur) => ({ acts: [...cur.acts, { name: n }] }));
    setNewAct("");
  };
  const makeHeadliner = (i) => set((cur) => ({ acts: [cur.acts[i], ...cur.acts.filter((_, k) => k !== i)] }));
  const actBody = () => (
    <div className="flex flex-col gap-4">
      {sources.acts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={lab + " mb-0"}>YOUR ACTS</span>
          <div className="flex flex-wrap gap-2">
            {sources.acts.map((t) => {
              const on = f.acts.some((a) => a.name === t.name);
              return (
                <button key={t.name} type="button" aria-pressed={on} onClick={() => toggleAct(t.name)} className="min-h-[44px] pl-1.5 pr-3.5 rounded-full border flex items-center gap-2 text-[14px] font-semibold"
                  style={on ? { borderColor: RED, background: `${RED}1f` } : { borderColor: "#333", color: "rgba(255,255,255,0.75)" }}>
                  <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-[12px] font-bold" style={{ background: "#2a1a1a", color: RED }}>
                    {t.data.photo_url ? <img src={t.data.photo_url} alt="" className="w-full h-full object-cover" /> : initialsOf(t.name)}
                  </span>
                  {t.name}
                </button>
              );
            })}
          </div>
          <p className={note}>Their stage plot, photo and contact come with them.</p>
        </div>
      )}
      <div className="flex gap-2">
        <input value={newAct} onChange={(e) => setNewAct(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAct(); } }} placeholder={sources.acts.length ? "Another act's name" : "The act's name"} aria-label="Act name" className={inputCls} />
        <button type="button" onClick={addAct} disabled={!newAct.trim()} className="shrink-0 min-h-[46px] px-4 rounded-lg text-[14px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ background: RED, color: "#0d0d0d" }}><Plus className="w-4 h-4" strokeWidth={3} />Add</button>
      </div>
      {f.acts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={lab + " mb-0"}>THE BILL</span>
          {f.acts.map((a, i) => (
            <div key={a.name} className="min-h-[50px] pl-3 pr-1 rounded-[10px] border border-[#262626] bg-[#101010] flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[14.5px] font-semibold truncate">{a.name}</span>
              <span className="text-[10.5px] tracking-[0.1em] text-white/55" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{i === 0 ? "HEADLINER" : "OPENER"}</span>
              {i > 0 && <button type="button" onClick={() => makeHeadliner(i)} aria-label={`Make ${a.name} the headliner`} className="w-10 h-10 flex items-center justify-center text-white/60"><ArrowUp className="w-4 h-4" /></button>}
              <button type="button" onClick={() => toggleAct(a.name)} aria-label={`Take ${a.name} off`} className="w-10 h-10 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Side by side on a computer, so the window doesn't scroll (job 434).
  const crewBody = () => (
    <div className={desktop ? "grid grid-cols-2 gap-5 items-start" : "flex flex-col gap-5"}>
      {[["sound", "SOUND", "soundPilot", "engineer"], ["lights", "LIGHTS", "lightsPilot", "LD"]].map(([k, title, pk, who]) => (
        <div key={k} className="flex flex-col gap-2">
          <span className={lab + " mb-0"}>{title}</span>
          <div className="grid grid-cols-2 gap-2">
            <Choice on={f.crew[k] === "ours"} color={GREEN} onClick={() => setCrew({ [k]: "ours", ...(venueSide ? { [pk]: "" } : {}) })}>{venueSide ? "The act brings theirs" : "We bring ours"}</Choice>
            <Choice on={f.crew[k] === "venue"} color={BLUE} onClick={() => setCrew({ [k]: "venue", ...(venueSide ? {} : { [pk]: "" }) })}>{venueSide ? "House provides" : "Venue provides"}</Choice>
          </div>
          {f.crew[k] === (venueSide ? "venue" : "ours") ? (
            <div className="flex flex-col gap-2">
              {sources.pilots.length > 0 && (
                <select value={f.crew[pk]} onChange={(e) => setCrew({ [pk]: e.target.value })} aria-label={`Your ${who}`} className={selectCls}>
                  <option value="">{`Pick your ${who}'s card`}</option>
                  {sources.pilots.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
                </select>
              )}
              {!f.crew[pk] && (() => {
                const tk = `${k}Tech`;
                const t = f.crew[tk] || {};
                const setT = (patch) => setCrew({ [tk]: { ...t, ...patch } });
                return (
                  <div className="flex flex-col gap-2">
                    <span className={lab + " mb-0"}>{sources.pilots.length ? "OR TYPE THEM IN" : `YOUR ${who.toUpperCase()}`}</span>
                    <input value={t.name || ""} onChange={(e) => setT({ name: e.target.value })} placeholder="Name" aria-label={`Your ${who}'s name`} className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={t.phone || ""} onChange={(e) => setT({ phone: e.target.value })} placeholder="Phone" type="tel" inputMode="tel" aria-label={`Your ${who}'s phone`} className={inputCls} />
                      <input value={t.email || ""} onChange={(e) => setT({ email: e.target.value })} placeholder="Email" type="email" inputMode="email" autoCapitalize="none" aria-label={`Your ${who}'s email`} className={inputCls} />
                    </div>
                  </div>
                );
              })()}
              <p className={note}>{f.crew[pk] ? "Their card goes on the event, and they get an invite link." : "Optional. They go on the event's Audio / Lighting page."}</p>
            </div>
          ) : <p className={note}>{venueSide ? "The act brings their own. They'll show up on the event when they join." : "The venue assigns one of their techs."}</p>}
          {!venueSide && k === "sound" && f.crew.sound === "venue" && stagePlotPart()}
        </div>
      ))}
    </div>
  );

  // The stage plot for the venue's engineer (job 331): the act's from My
  // Template (switch it off for this show), and / or a file uploaded here.
  const plotItem = fileItems.find((it) => it.key === "plot");
  // What My Template already has for the first act, shown so you can see it.
  const plotTpl = src && !venueSide && firstAct ? actTemplate(src, firstAct.name) : null;
  const tplPlotFiles = (() => {
    const d = plotTpl?.data || {};
    const files = Array.isArray(d.stage_plot_files) ? d.stage_plot_files.filter((x) => x?.url) : [];
    if (files.length) return files;
    return d.stage_plot_url ? [{ url: d.stage_plot_url, name: "Stage plot", type: "image/png" }] : [];
  })();
  const plotOn = f.onFile.plot !== false;
  const pickPlot = () => plotInput.current?.click();
  const onPlotFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > MAX_FILE) { setError("That file is over 15 MB. Try a smaller copy."); return; }
    setBusy("plot");
    try { const up = await uploadStagePlot(user.id, file); set({ stagePlot: up }); }
    catch (err) { console.error(err); setError("The stage plot didn't upload. Check your signal and try again."); }
    setBusy("");
  };
  const stagePlotPart = () => (
    <div className="flex flex-col gap-2 mt-1 rounded-[12px] border border-[#262626] bg-[#101010] p-3">
      <span className={lab + " mb-0"}>STAGE PLOT FOR THEIR ENGINEER</span>
      {plotItem ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0" style={{ opacity: plotOn ? 1 : 0.5 }}>
            <span className="block text-[14.5px] font-semibold">Send our stage plot & inputs</span>
            <span className="block text-[12.5px] text-white/55 truncate">{plotOn ? `From My Template · ${plotItem.sub}` : "Not on this event"}</span>
          </span>
          <Toggle on={plotOn} label="Send our stage plot and inputs" onClick={() => set((cur) => ({ onFile: { ...cur.onFile, plot: !plotOn } }))} />
        </div>
      ) : <p className={note + " m-0"}>No stage plot in My Template yet. Upload one here and it can be kept in My Template for every show.</p>}
      {plotItem && plotOn && tplPlotFiles.length > 0 && (
        <div className="flex flex-col gap-2">{tplPlotFiles.map((file, i) => <PlotPreview key={file.url + i} file={file} />)}</div>
      )}
      {f.stagePlot ? (
        <div className="flex flex-col gap-2">
          <PlotPreview file={f.stagePlot} />
          {plotTpl?.id ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[13.5px] text-white/75">Keep it in My Template for every show</span>
              <Toggle on={f.stagePlotSave !== false} label="Keep this stage plot in My Template" onClick={() => set({ stagePlotSave: f.stagePlotSave === false })} />
            </div>
          ) : (
            <p className={note + " m-0"}>{firstAct?.name ? `${firstAct.name} isn't in My Template yet, so this stage plot is for this show only.` : "Add who's playing to keep it in My Template."}</p>
          )}
        <div className="flex items-center gap-2 min-h-[44px]">
          <span className="flex-1 min-w-0 text-[14px] truncate">{f.stagePlot.name}</span>
          <button type="button" onClick={pickPlot} className="min-h-[40px] px-3 rounded-[9px] border border-[#3a3a3a] text-[13px] font-semibold">Replace</button>
          <button type="button" onClick={() => set({ stagePlot: null })} aria-label="Remove the stage plot file" className="w-10 h-10 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
        </div>
        </div>
      ) : (
        <button type="button" onClick={pickPlot} disabled={busy === "plot"} className="min-h-[44px] rounded-[10px] border border-dashed border-[#3a3a3a] text-[14px] font-semibold text-white/85 flex items-center justify-center gap-1.5 disabled:opacity-60">
          {busy === "plot" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{plotItem ? "Or upload a different one" : "Upload a stage plot"}
        </button>
      )}
    </div>
  );

  const PH = desktop ? 128 : 112;
  const promoLinks = Array.isArray(f.promo.links) && f.promo.links.length ? f.promo.links : [{ kind: "", url: "" }];
  const setLink = (i, patch) => setPromo({ links: promoLinks.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const promoBody = () => (
    // Graphics left, links right on a computer (job 434).
    <div className={desktop ? "grid grid-cols-2 gap-6 items-start" : "flex flex-col gap-4"}>
      <div className="flex flex-col gap-4 min-w-0">
      <span className={lab + " mb-0"}>WHAT SIZES DID YOU MAKE?</span>
      <div className="flex flex-wrap gap-2">
        {PROMO_FORMATS.map((p) => {
          const on = f.promo.picked.includes(p.id);
          const gh = 14, gw = Math.round(gh * Math.min(p.r, 1.9));
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => setPromo({ picked: on ? f.promo.picked.filter((x) => x !== p.id) : [...f.promo.picked, p.id] })}
              className="min-h-[44px] pl-2.5 pr-3 rounded-full border flex items-center gap-2 text-[13.5px] font-semibold" style={on ? { borderColor: ACCENT, background: `${ACCENT}1f` } : { borderColor: "#333", color: "rgba(255,255,255,0.75)" }}>
              <span aria-hidden="true" className="block rounded-[2px] border-[1.5px]" style={{ width: gw, height: gh, borderColor: on ? ACCENT : "#8a8a8a" }} />
              {p.label}<span className="text-[11px] text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.ratio}</span>
            </button>
          );
        })}
      </div>
      {/* No "pick the sizes" line (job 429): nothing shows until a size is picked. */}
      {f.promo.picked.length > 0 && (
        <div className="flex flex-wrap gap-3 items-end">
          {f.promo.picked.map((id) => {
            const p = PROMO_FORMATS.find((x) => x.id === id);
            const up = f.promo.files[id];
            const w = Math.round(Math.min(PH * p.r, desktop ? 380 : 320));
            return (
              <div key={id} className="flex flex-col gap-1.5" style={{ width: w }}>
                <button type="button" onClick={() => pickPromo(id)} disabled={busy === id} aria-label={`${up ? "Replace" : "Upload"} ${p.label} ${p.ratio}`}
                  className="relative w-full rounded-[10px] overflow-hidden flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold text-white/85"
                  style={{ aspectRatio: String(p.r), border: up ? `1.5px solid ${ACCENT}` : "1.5px dashed #3a3a3a", background: up ? "#000" : "#101010" }}>
                  {up ? <img src={up.url} alt={`${p.label} graphic`} className="absolute inset-0 w-full h-full object-cover" />
                    : busy === id ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <><Upload className="w-4 h-4" /><span>{p.label}</span><span className="text-[10px] text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.px}</span></>}
                </button>
                {up && (
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-white/60 truncate">{p.label}</span>
                    <button type="button" onClick={() => set((cur) => { const files = { ...cur.promo.files }; delete files[id]; return { promo: { ...cur.promo, files } }; })} className="min-h-[32px] px-1 text-white/50">Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
      <div className="flex flex-col gap-4 min-w-0">
      {/* Links (job 429): as many as you have, each with its platform. */}
      <div className="flex flex-col gap-2">
        <span className={lab + " mb-0"}>LINKS</span>
        {promoLinks.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select value={r.kind || ""} onChange={(e) => setLink(i, { kind: e.target.value })} aria-label="Which platform" className={`${inputCls} !w-[172px] shrink-0 !px-2`}>
              <option value="">Platform…</option>
              {PROMO_LINK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <input value={r.url || ""} onChange={(e) => setLink(i, { url: e.target.value, kind: r.kind || guessPromoLinkKind(e.target.value) })} placeholder="Paste the link" aria-label="Link" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={inputCls} />
            {promoLinks.length > 1 && <button type="button" onClick={() => setPromo({ links: promoLinks.filter((_, j) => j !== i) })} aria-label="Remove link" className="min-h-[44px] w-[40px] shrink-0 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>}
          </div>
        ))}
        <button type="button" onClick={() => setPromo({ links: [...promoLinks, { kind: "", url: "" }] })} className="self-start min-h-[44px] px-3.5 rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5" style={{ color: ACCENT }}><Plus className="w-4 h-4" />Add a link</button>
      </div>
      <p className={note}>Skip any of it now and add it later. Everyone on the event sees the update.</p>
      </div>
    </div>
  );

  const filesBody = () => (
    fileItems.length ? (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col rounded-[12px] border border-[#262626] bg-[#101010] overflow-hidden">
          {fileItems.map((it) => {
            const on = f.onFile[it.key] !== false;
            return (
              <div key={it.key} className="min-h-[58px] pl-3 flex items-center gap-2 border-b border-[#1f1f1f] last:border-0">
                <span className="flex-1 min-w-0" style={{ opacity: on ? 1 : 0.5 }}>
                  <span className="block text-[14.5px] font-semibold">{it.label}</span>
                  <span className="block text-[12.5px] text-white/55 truncate">{on ? it.sub : "Not on this event"}</span>
                </span>
                <Toggle on={on} color={ACCENT} label={`${it.label} on this event`} onClick={() => set((cur) => ({ onFile: { ...cur.onFile, [it.key]: !on } }))} />
              </div>
            );
          })}
        </div>
        <p className={note}>Set once in My Template, on every event. Switch any off for this one.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <p className={note}>{venueSide ? "Nothing on file yet. Add your address, load-in, house gear and hospitality in My Template, and every event gets them." : "Nothing on file yet. Add your act's stage plot and photo, and your travel, merch and guest list, in My Template, and every event gets them."}</p>
        <button type="button" onClick={() => navigate("/templates")} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14px] font-semibold text-white/85">Open My Template</button>
      </div>
    )
  );

  const paperRow = (slot, label) => {
    const file = f.paper[slot];
    return (
      <div key={slot} className="min-h-[58px] pl-3 pr-1.5 flex items-center gap-2 border-b border-[#1f1f1f]">
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-semibold">{label}</span>
          <span className="block text-[12.5px] text-white/55 truncate">{file ? file.name : "Not added"}</span>
        </span>
        <button type="button" onClick={() => pickPaper(slot)} className="min-h-[40px] px-3 rounded-[9px] border border-[#3a3a3a] text-[13px] font-semibold">{file ? "Replace" : "Add"}</button>
        {file && <button type="button" onClick={() => setPaper({ [slot]: null })} aria-label={`Remove ${label}`} className="w-10 h-10 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>}
      </div>
    );
  };
  const paperBody = () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col rounded-[12px] border border-[#262626] bg-[#101010] overflow-hidden [&>*:last-child]:border-0">
        {!venueSide && paperRow("w9", "W9")}
        {paperRow("agreement", venueSide ? "Contract" : "Performance agreement")}
        {paperRow("coi", "Certificate of insurance")}
        {f.paper.other.map((file, i) => (
          <div key={`${file.name}${i}`} className="min-h-[52px] pl-3 pr-1.5 flex items-center gap-2 border-b border-[#1f1f1f]">
            <span className="flex-1 min-w-0 text-[14.5px] truncate">{file.name}</span>
            <button type="button" onClick={() => setPaper({ other: f.paper.other.filter((_, k) => k !== i) })} aria-label={`Remove ${file.name}`} className="w-10 h-10 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => pickPaper("other")} className="min-h-[46px] rounded-[12px] border border-dashed border-[#3a3a3a] text-[14px] font-semibold text-white/80 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />Another file</button>
      <p className={note}>Only you and the {venueSide ? "act" : "venue"} see these. Never techs or fans. They go in the event's Paperwork.</p>
    </div>
  );

  const addPerson = (role, label) => set((cur) => ({ people: [...cur.people, { id: Math.random().toString(36).slice(2, 9), role, label, pilotId: "" }] }));
  const setPerson = (id, patch) => set((cur) => ({ people: cur.people.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const peopleBody = () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(venueSide ? [["venue", "Co-host"], ["manager", "Promoter"]] : [["manager", "Co-host"], ["band", "Opening act"], ["manager", "Tour manager"]]).map(([role, l]) => (
          <button key={l} type="button" onClick={() => addPerson(role, l === "Co-host" ? "" : l)} className="min-h-[44px] px-3.5 rounded-full border border-dashed border-[#3a3a3a] text-[14px] font-semibold text-white/85 flex items-center gap-1.5"><Plus className="w-4 h-4" />{l}</button>
        ))}
      </div>
      {f.people.map((x) => (
        <div key={x.id} className="flex flex-col gap-2 rounded-[12px] border border-[#262626] bg-[#101010] p-3">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] tracking-[0.1em]" style={{ fontFamily: "'JetBrains Mono', monospace", color: x.role === "venue" ? BLUE : RED }}>{x.role === "band" ? "ARTIST" : x.role === "venue" ? "VENUE / CO-HOST" : venueSide ? "PROMOTER" : "MANAGER / CO-HOST"}</span>
            <span className="flex-1" />
            <button type="button" onClick={() => set((cur) => ({ people: cur.people.filter((p) => p.id !== x.id) }))} aria-label="Remove" className="w-9 h-9 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
          </div>
          <input value={x.label} onChange={(e) => setPerson(x.id, { label: e.target.value })} placeholder="Their name" aria-label="Their name" className={inputCls} />
          {sources.pilots.length > 0 && (
            <select value={x.pilotId} onChange={(e) => { const p = pilotById(e.target.value); setPerson(x.id, { pilotId: e.target.value, ...(p && !x.label ? { label: p.display_name } : {}) }); }} aria-label="From your Fellow Pilots" className={selectCls}>
              <option value="">Or pick a Fellow Pilot</option>
              {sources.pilots.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
            </select>
          )}
        </div>
      ))}
      <p className={note}>Optional. Each gets an invite link when you create the event, and their own circle on it.</p>
    </div>
  );

  // The venue's acts (job 323): a name, or a Fellow Pilot, and an invite each.
  const newRow = () => ({ id: Math.random().toString(36).slice(2, 9), name: "", pilotId: "", invite: true });
  const setActAt = (i, patch) => set((cur) => ({ acts: cur.acts.map((a, k) => (k === i ? { ...a, ...patch } : a)) }));
  const actBodyVenue = () => (
    <div className="flex flex-col gap-3">
      {f.acts.map((a, i) => (
        <div key={a.id || i} className="flex flex-col gap-2 rounded-[12px] border border-[#262626] bg-[#101010] p-3">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] tracking-[0.1em]" style={{ fontFamily: "'JetBrains Mono', monospace", color: RED }}>{i === 0 ? "HEADLINER" : "OPENER"}</span>
            <span className="flex-1" />
            {i > 0 && <button type="button" onClick={() => makeHeadliner(i)} aria-label={`Make ${a.name || "this act"} the headliner`} className="w-9 h-9 flex items-center justify-center text-white/60"><ArrowUp className="w-4 h-4" /></button>}
            <button type="button" onClick={() => set((cur) => ({ acts: cur.acts.filter((_, k) => k !== i) }))} aria-label={`Take ${a.name || "this act"} off`} className="w-9 h-9 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
          </div>
          <input value={a.name} onChange={(e) => setActAt(i, { name: e.target.value })} placeholder="The act's name" aria-label="The act's name" className={inputCls} />
          {sources.pilots.length > 0 && (
            <select value={a.pilotId || ""} onChange={(e) => { const p = pilotById(e.target.value); const prev = pilotById(a.pilotId); setActAt(i, { pilotId: e.target.value, ...(p && (!a.name || a.name === prev?.display_name) ? { name: p.display_name } : {}) }); }} aria-label="From your Fellow Pilots" className={selectCls}>
              <option value="">Or pick a Fellow Pilot</option>
              {sources.pilots.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
            </select>
          )}
          <div className="flex items-center gap-3 pl-1">
            <span className="flex-1 text-[13.5px] text-white/75">Send them an invite</span>
            <Toggle on={a.invite !== false} color={BLUE} label={`Invite ${a.name || "this act"}`} onClick={() => setActAt(i, { invite: a.invite === false })} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => set((cur) => ({ acts: [...cur.acts, newRow()] }))} className="min-h-[46px] rounded-[12px] border border-dashed border-[#3a3a3a] text-[14px] font-semibold text-white/85 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />{f.acts.length ? "Another act" : "Add the act"}</button>
      <p className={note}>Each act gets an invite link. When they join, their stage plot, photo and contact come with them.</p>
    </div>
  );

  // ---------- the web ----------
  const crewDone = true;
  const namedActs = f.acts.filter((a) => has(a.name));
  const firstNamed = namedActs[0] || null;
  const firstPilot = venueSide && firstNamed ? pilotById(firstNamed.pilotId) : null;
  const circles = venueSide ? [
    { key: "show", label: "Date & times", short: "Date & times", required: true, done: dateSettled(f), hint: "When it is", icon: <Clock />, body: showBody },
    { key: "act", label: firstNamed ? firstNamed.name + (namedActs.length > 1 ? ` +${namedActs.length - 1}` : "") : "The act", short: firstNamed ? firstNamed.name : "The act", done: namedActs.length > 0, hint: "Who's playing, and their invites",
      ...(firstNamed ? { photo: firstPilot?.profile_photo_url || "", initials: initialsOf(firstNamed.name), ring: RED } : { icon: <Music /> }), body: actBodyVenue },
    { key: "crew", label: "Sound / Lights", short: "Sound / Lights", done: crewDone, hint: "Who covers sound and lights", icon: <SlidersHorizontal />, body: crewBody },
    { key: "promo", label: "Promo", short: "Promo", done: uploads.length > 0 || (f.promo.links || []).some((l) => has(l.url)), hint: "This show only", icon: <Megaphone />, body: promoBody },
    { key: "files", label: "House info", short: "House info", done: fileItems.some((it) => f.onFile[it.key] !== false), hint: "From My Template, on every event", icon: <Building2 />, body: filesBody },
    { key: "paper", label: "Paperwork", short: "Paperwork", done: paperCount > 0, hint: "Contract, insurance", icon: <FileText />, body: paperBody },
    { key: "people", label: "Co-hosts", short: "Co-hosts", done: f.people.length > 0, hint: "A co-host or promoter", icon: <UserPlus />, body: peopleBody },
  ] : [
    { key: "show", label: "Date & times", short: "Date & times", required: true, done: dateSettled(f) && f.acts.length > 0, hint: pickAct ? "Who's playing, and when" : "When it is", icon: <Clock />, body: showBody },
    { key: "venue", label: f.venue.name.trim() || "Venue", short: f.venue.name.trim() || "Venue", done: has(f.venue.name), hint: "Where it is, and their invite",
      ...(has(f.venue.name) ? { photo: venuePilot?.profile_photo_url || "", initials: initialsOf(f.venue.name), ring: BLUE } : { icon: <MapPin /> }), body: venueBody },
    { key: "crew", label: "Sound / Lights", short: "Sound / Lights", done: crewDone, hint: "Who brings the engineer and the LD", icon: <SlidersHorizontal />, body: crewBody },
    // Create event stays simple (job 331): promo, paperwork and the rest are
    // added on the event afterwards; Book a date carries the full package.
    { key: "people", label: "Co-hosts", short: "Co-hosts", done: f.people.length > 0, hint: "Anyone else on it", icon: <UserPlus />, body: peopleBody },
  ];

  const create = async () => {
    if (!user || sending) return;
    if (!dateSettled(f)) { setError(f.dateMode === "request" ? "Add the months you're asking for first." : "Pick the date first."); return; }
    if (!venueSide && !f.acts.length) { setError("Add who's playing first (in Date & times)."); return; }
    setSending(true); setError("");
    try {
      const out = await createEventFromWeb(user.id, sources, f, side);
      setMade(out);
      setSent(true);
    } catch (e) {
      console.error(e);
      setError("The event didn't make. Check your signal and try again.");
    }
    setSending(false);
  };

  const hiddenInputs = (
    <>
      <input ref={promoInput} type="file" accept="image/*" className="hidden" onChange={onPromoFile} />
      <input ref={paperInput} type="file" accept={PAPER_ACCEPT} className="hidden" onChange={onPaperFile} />
      <input ref={plotInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPlotFile} />
    </>
  );

  if (!src) {
    return <div className="min-h-screen bg-[#05060d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#F87171]/30 border-t-[#F87171] rounded-full animate-spin" /></div>;
  }

  // Event templates saved: pick one, or start fresh (job 434).
  if (choosing && tpl?.items?.length) {
    return (
      <TemplateChooser seed={user?.id || "new-event"} icon={Clock} color={ACCENT} title="New event"
        line="Start from one of your event templates and just add the date, or start fresh."
        items={tpl.items.map((x) => ({ ...x, line: eventTemplateLine(x) }))}
        onPick={pickTemplate} onFresh={() => pickTemplate("")} onBack={() => goBack()} />
    );
  }

  // ---------- made: hand over the invite links ----------
  if (made && !sent) {
    const token = made.show.share_token;
    const when = isDateTbd(made.show.date) ? requestLine(made.show.manager_info?.date_request) : dayText(made.show.date);
    const msg = (inv) => `${me.display_name || "I"} added you to ${made.show.event_name}${when ? ` on ${when}` : ""} on ShowPilot. Open it here: ${inv.url}`;
    const copy = async (inv) => {
      try { await navigator.clipboard.writeText(inv.url); setCopied(inv.id); setTimeout(() => setCopied((c) => (c === inv.id ? "" : c)), 1600); } catch { /* ignore */ }
    };
    return (
      <IntakeSent seed={token || "event"} title="Event made" line={[made.show.event_name, when].filter(Boolean).join(" · ")}>
        {made.warnings.length > 0 && (
          <div className="mt-4 flex flex-col gap-1 text-left">
            {made.warnings.map((w) => <p key={w} className="text-[13.5px] text-amber-300/90 m-0">{w}</p>)}
          </div>
        )}
        {made.invites.length > 0 && (
          <div className="mt-6 flex flex-col gap-3 text-left">
            <span className={lab + " mb-0 text-center"}>SEND THE INVITES</span>
            {made.invites.map((inv) => {
              const st = ACCOUNT_TYPE_STYLES[inv.role] || { color: "#9A9A9A", label: inv.role };
              return (
                <div key={inv.id} className="rounded-[14px] border border-[#2a2a2a] bg-[#141414] p-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.color }} />
                    <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{inv.label}</span>
                    <span className="text-[10.5px] tracking-[0.1em] text-white/55" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{String(st.label).toUpperCase()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <a href={`sms:${inv.phone || ""}?&body=${encodeURIComponent(msg(inv))}`} className="min-h-[44px] rounded-[10px] border border-[#333] text-[13.5px] font-semibold flex items-center justify-center gap-1.5 text-white no-underline"><MessageSquare className="w-4 h-4" />Text</a>
                    <a href={`mailto:${inv.email || ""}?subject=${encodeURIComponent(made.show.event_name)}&body=${encodeURIComponent(msg(inv))}`} className="min-h-[44px] rounded-[10px] border border-[#333] text-[13.5px] font-semibold flex items-center justify-center gap-1.5 text-white no-underline"><Mail className="w-4 h-4" />Email</a>
                    <button type="button" onClick={() => copy(inv)} className="min-h-[44px] rounded-[10px] border border-[#333] text-[13.5px] font-semibold flex items-center justify-center gap-1.5">{copied === inv.id ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy</>}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => navigate(`/gig/web?token=${token}`, { replace: true })} className="mt-6 w-full min-h-[52px] rounded-[12px] font-bold text-[16px]" style={{ background: GREEN, color: "#0d0d0d" }}>Open the event</button>
      </IntakeSent>
    );
  }

  return (
    <>
      {hiddenInputs}
      <IntakeKeyWeb
        fill // the whole desktop width, like the booking webs (job 433)
        startOpen
        color={ACCENT}
        seed={user?.id || "new-event"}
        title={name || "New event"}
        dateLine={f.dateMode === "request" ? (requestLine(f.wants) ? `Requesting ${requestLine(f.wants)}` : "New event") : f.date ? dayText(f.date) : "New event"}
        actName=""
        center={{ name: (venueSide ? house?.name : "") || me.display_name || "You", photo: me.profile_photo_url || "", label: "You", href: me.card_share_token ? `/pilot/${me.card_share_token}` : "" }}
        circles={circles}
        onSend={create}
        canSend={dateSettled(f) && (venueSide || f.acts.length > 0)}
        sending={sending}
        sendLabel="Create event"
        belowSend={tpl ? (
          <SaveAsTemplate color={ACCENT} current={fromTpl} names={tpl.items.map((x) => x.name)}
            suggest={tpl.items.length ? (firstAct?.name || "") : venueSide ? "House night" : (firstAct?.name || "My usual show")}
            note={fromTpl ? `Filled in from "${fromTpl}".` : ""} onSave={saveAsTemplate} />
        ) : null}
        error={error}
        sent={sent}
        onSentOff={() => setSent(false)}
        onBack={() => goBack()}
      />
    </>
  );
}
