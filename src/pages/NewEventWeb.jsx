import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, MapPin, Music, SlidersHorizontal, Megaphone, Folder, FileText, UserPlus, Check, X, Plus, MessageSquare, Mail, Copy, ArrowUp, Loader2, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import IntakeKeyWeb, { IntakeSent, useIsDesktop } from "@/components/showpilot/IntakeKeyWeb";
import TimeSelect from "@/components/showpilot/TimeSelect";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { useGoBack } from "@/lib/navHistory";
import {
  emptyForm, eventName, loadSources, actTemplate, onFileItems, uploadPromo, createEventFromWeb,
  PROMO_FORMATS, has,
} from "@/lib/newEventWeb";

// New event as a web (job 321), for manager / artist accounts. The sender
// (them) in the middle with their photo and card; a circle per part of the
// event, filled in from their templates where it can be: Date & times, the
// venue, the act, Sound / Lights, Promo (this show only), On file (from My
// Template), Paperwork (only them and the venue) and Co-hosts. Create event
// makes the event, its acts, its invite links and its paperwork, then hands
// over the links to send. Mockup: the "New Event Flow" canvas, bottom row.
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

function Toggle({ on, onClick, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className="w-[60px] h-[44px] shrink-0 flex items-center justify-center">
      <span className="relative block w-[46px] h-[28px] rounded-full transition-colors" style={{ background: on ? RED : "#333" }}>
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

export default function NewEventWeb() {
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
  const promoInput = useRef(null);
  const promoFor = useRef("");
  const paperInput = useRef(null);
  const paperFor = useRef("");

  useEffect(() => {
    if (!user) return;
    let gone = false;
    loadSources(user.id).then((s) => {
      if (gone) return;
      setSrc(s);
      // One act: it's already on.
      if (s.acts.length === 1) setF((cur) => (cur.acts.length ? cur : { ...cur, acts: [{ name: s.acts[0].name }] }));
    }).catch((e) => { console.error(e); setSrc({ me: {}, managerTpl: null, acts: [], pilots: [] }); });
    return () => { gone = true; };
  }, [user]);

  const set = (patch) => { setError(""); setF((cur) => ({ ...cur, ...(typeof patch === "function" ? patch(cur) : patch) })); };
  const setVenue = (patch) => set((cur) => ({ venue: { ...cur.venue, ...patch } }));
  const setCrew = (patch) => set((cur) => ({ crew: { ...cur.crew, ...patch } }));
  const setPromo = (patch) => set((cur) => ({ promo: { ...cur.promo, ...patch } }));
  const setPaper = (patch) => set((cur) => ({ paper: { ...cur.paper, ...patch } }));

  const sources = src || { me: {}, managerTpl: null, acts: [], pilots: [] };
  const me = sources.me || {};
  const fileItems = useMemo(() => onFileItems(sources, f), [src, f.acts]); // eslint-disable-line react-hooks/exhaustive-deps
  const pilotById = (id) => sources.pilots.find((p) => p.id === id) || null;
  const venuePilot = pilotById(f.venue.pilotId);
  const firstAct = f.acts[0] || null;
  const firstTpl = firstAct ? actTemplate(sources, firstAct.name) : null;
  const uploads = f.promo.picked.filter((id) => f.promo.files[id]?.url);
  const paperCount = ["w9", "agreement", "coi"].filter((k) => f.paper[k]).length + f.paper.other.length;
  const name = eventName(f);

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
  const showBody = () => (
    <div className="flex flex-col gap-4">
      <label><span className={lab}>DATE</span>
        <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} className={`${inputCls} [color-scheme:dark]`} />
      </label>
      {[["LOAD-IN", "loadIn"], ["DOORS", "doors"], ["ON STAGE", "onStage"]].map(([l, k]) => (
        <div key={k}><span className={lab}>{l}</span><TimeSelect value={f[k]} onChange={(v) => set({ [k]: v })} color={RED} label={`${l.toLowerCase()} time`} /></div>
      ))}
      <label><span className={lab}>EVENT NAME</span>
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={name || "Low Tide Radio at Clown House"} className={inputCls} />
      </label>
      <p className={note}>{firstAct ? `On stage is ${firstAct.name}'s set time. ` : ""}The venue can change these once they're in.</p>
    </div>
  );

  const pilotMatches = sources.pilots.filter((p) => !pilotQuery.trim() || `${p.display_name} ${p.job_title}`.toLowerCase().includes(pilotQuery.trim().toLowerCase()));
  const venueBody = () => (
    <div className="flex flex-col gap-4">
      <label><span className={lab}>VENUE</span>
        <input value={f.venue.name} onChange={(e) => setVenue({ name: e.target.value, pilotId: null })} placeholder="Clown House" autoComplete="organization" className={inputCls} />
      </label>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <label><span className={lab}>CITY</span><input value={f.venue.city} onChange={(e) => setVenue({ city: e.target.value })} placeholder="Nashville" className={inputCls} /></label>
        <label><span className={lab}>STATE</span><input value={f.venue.state} onChange={(e) => setVenue({ state: e.target.value })} placeholder="TN" className={inputCls} /></label>
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
      <div className="flex items-center gap-3 rounded-[12px] border border-[#2a2a2a] bg-[#101010] pl-3">
        <span className="flex-1 min-w-0 py-2">
          <span className="block text-[14.5px] font-semibold">Invite them to the event</span>
          <span className="block text-[12.5px] text-white/55">You'll get their link to text or email when you create it.</span>
        </span>
        <Toggle on={f.venue.invite} label="Invite the venue" onClick={() => setVenue({ invite: !f.venue.invite })} />
      </div>
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

  const crewBody = () => (
    <div className="flex flex-col gap-5">
      {[["sound", "SOUND", "soundPilot", "engineer"], ["lights", "LIGHTS", "lightsPilot", "LD"]].map(([k, title, pk, who]) => (
        <div key={k} className="flex flex-col gap-2">
          <span className={lab + " mb-0"}>{title}</span>
          <div className="grid grid-cols-2 gap-2">
            <Choice on={f.crew[k] === "ours"} color={GREEN} onClick={() => setCrew({ [k]: "ours" })}>We bring ours</Choice>
            <Choice on={f.crew[k] === "venue"} color={BLUE} onClick={() => setCrew({ [k]: "venue", [pk]: "" })}>Venue provides</Choice>
          </div>
          {f.crew[k] === "ours" ? (
            sources.pilots.length > 0 ? (
              <select value={f.crew[pk]} onChange={(e) => setCrew({ [pk]: e.target.value })} aria-label={`Your ${who}`} className={selectCls}>
                <option value="">Invite your {who} later</option>
                {sources.pilots.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
              </select>
            ) : <p className={note}>Invite your {who} from the event once it's made. They get their own circle.</p>
          ) : <p className={note}>The venue assigns one of their techs.</p>}
        </div>
      ))}
    </div>
  );

  const PH = desktop ? 128 : 112;
  const promoBody = () => (
    <div className="flex flex-col gap-4">
      <span className={lab + " mb-0"}>WHAT SIZES DID YOU MAKE?</span>
      <div className="flex flex-wrap gap-2">
        {PROMO_FORMATS.map((p) => {
          const on = f.promo.picked.includes(p.id);
          const gh = 14, gw = Math.round(gh * Math.min(p.r, 1.9));
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => setPromo({ picked: on ? f.promo.picked.filter((x) => x !== p.id) : [...f.promo.picked, p.id] })}
              className="min-h-[44px] pl-2.5 pr-3 rounded-full border flex items-center gap-2 text-[13.5px] font-semibold" style={on ? { borderColor: RED, background: `${RED}1f` } : { borderColor: "#333", color: "rgba(255,255,255,0.75)" }}>
              <span aria-hidden="true" className="block rounded-[2px] border-[1.5px]" style={{ width: gw, height: gh, borderColor: on ? RED : "#8a8a8a" }} />
              {p.label}<span className="text-[11px] text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.ratio}</span>
            </button>
          );
        })}
      </div>
      {f.promo.picked.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-[#333] px-3 py-4 text-center text-[13px] text-white/55">Pick the sizes you have. Each one gets its own upload.</p>
      ) : (
        <div className="flex flex-wrap gap-3 items-end">
          {f.promo.picked.map((id) => {
            const p = PROMO_FORMATS.find((x) => x.id === id);
            const up = f.promo.files[id];
            const w = Math.round(Math.min(PH * p.r, desktop ? 380 : 320));
            return (
              <div key={id} className="flex flex-col gap-1.5" style={{ width: w }}>
                <button type="button" onClick={() => pickPromo(id)} disabled={busy === id} aria-label={`${up ? "Replace" : "Upload"} ${p.label} ${p.ratio}`}
                  className="relative w-full rounded-[10px] overflow-hidden flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold text-white/85"
                  style={{ aspectRatio: String(p.r), border: up ? `1.5px solid ${RED}` : "1.5px dashed #3a3a3a", background: up ? "#000" : "#101010" }}>
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
      <label><span className={lab}>FACEBOOK EVENT</span>
        <input value={f.promo.facebook} onChange={(e) => setPromo({ facebook: e.target.value })} placeholder="Paste the event link" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={inputCls} />
      </label>
      <p className={note}>Skip any of it now and add it later. Everyone on the event sees the update.</p>
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
                <Toggle on={on} label={`${it.label} on this event`} onClick={() => set((cur) => ({ onFile: { ...cur.onFile, [it.key]: !on } }))} />
              </div>
            );
          })}
        </div>
        <p className={note}>Set once in My Template, on every event. Switch any off for this one.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <p className={note}>Nothing on file yet. Add your act's stage plot and photo, and your travel, merch and guest list, in My Template, and every event gets them.</p>
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
        {paperRow("w9", "W9")}
        {paperRow("agreement", "Performance agreement")}
        {paperRow("coi", "Certificate of insurance")}
        {f.paper.other.map((file, i) => (
          <div key={`${file.name}${i}`} className="min-h-[52px] pl-3 pr-1.5 flex items-center gap-2 border-b border-[#1f1f1f]">
            <span className="flex-1 min-w-0 text-[14.5px] truncate">{file.name}</span>
            <button type="button" onClick={() => setPaper({ other: f.paper.other.filter((_, k) => k !== i) })} aria-label={`Remove ${file.name}`} className="w-10 h-10 flex items-center justify-center text-white/45"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => pickPaper("other")} className="min-h-[46px] rounded-[12px] border border-dashed border-[#3a3a3a] text-[14px] font-semibold text-white/80 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />Another file</button>
      <p className={note}>Only you and the venue see these. Never techs or fans. They go in the event's Paperwork.</p>
    </div>
  );

  const addPerson = (role, label) => set((cur) => ({ people: [...cur.people, { id: Math.random().toString(36).slice(2, 9), role, label, pilotId: "" }] }));
  const setPerson = (id, patch) => set((cur) => ({ people: cur.people.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const peopleBody = () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {[["manager", "Co-host"], ["band", "Opening act"], ["manager", "Tour manager"]].map(([role, l]) => (
          <button key={l} type="button" onClick={() => addPerson(role, l === "Co-host" ? "" : l)} className="min-h-[44px] px-3.5 rounded-full border border-dashed border-[#3a3a3a] text-[14px] font-semibold text-white/85 flex items-center gap-1.5"><Plus className="w-4 h-4" />{l}</button>
        ))}
      </div>
      {f.people.map((x) => (
        <div key={x.id} className="flex flex-col gap-2 rounded-[12px] border border-[#262626] bg-[#101010] p-3">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] tracking-[0.1em]" style={{ fontFamily: "'JetBrains Mono', monospace", color: RED }}>{x.role === "band" ? "ARTIST" : "MANAGER / CO-HOST"}</span>
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

  // ---------- the web ----------
  const crewDone = true;
  const circles = [
    { key: "show", label: "Date & times", short: "Date & times", required: true, done: has(f.date), hint: "When it is", icon: <Clock />, body: showBody },
    { key: "venue", label: f.venue.name.trim() || "Venue", short: f.venue.name.trim() || "Venue", done: has(f.venue.name), hint: "Where it is, and their invite",
      ...(has(f.venue.name) ? { photo: venuePilot?.profile_photo_url || "", initials: initialsOf(f.venue.name), ring: BLUE } : { icon: <MapPin /> }), body: venueBody },
    { key: "act", label: firstAct ? firstAct.name + (f.acts.length > 1 ? ` +${f.acts.length - 1}` : "") : "The act", short: firstAct ? firstAct.name : "The act", required: true, done: f.acts.length > 0, hint: "Who's playing",
      ...(firstAct ? { photo: firstTpl?.data?.photo_url || "", initials: initialsOf(firstAct.name), ring: RED } : { icon: <Music /> }), body: actBody },
    { key: "crew", label: "Sound / Lights", short: "Sound / Lights", done: crewDone, hint: "Who brings the engineer and the LD", icon: <SlidersHorizontal />, body: crewBody },
    { key: "promo", label: "Promo", short: "Promo", done: uploads.length > 0 || has(f.promo.facebook), hint: "This show only", icon: <Megaphone />, body: promoBody },
    { key: "files", label: "On file", short: "On file", done: fileItems.some((it) => f.onFile[it.key] !== false), hint: "From My Template, on every event", icon: <Folder />, body: filesBody },
    { key: "paper", label: "Paperwork", short: "Paperwork", done: paperCount > 0, hint: "W9, agreement, insurance", icon: <FileText />, body: paperBody },
    { key: "people", label: "Co-hosts", short: "Co-hosts", done: f.people.length > 0, hint: "Anyone else on it", icon: <UserPlus />, body: peopleBody },
  ];

  const create = async () => {
    if (!user || sending) return;
    if (!has(f.date)) { setError("Pick the date first."); return; }
    if (!f.acts.length) { setError("Add who's playing first."); return; }
    setSending(true); setError("");
    try {
      const out = await createEventFromWeb(user.id, sources, f);
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
    </>
  );

  if (!src) {
    return <div className="min-h-screen bg-[#05060d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#F87171]/30 border-t-[#F87171] rounded-full animate-spin" /></div>;
  }

  // ---------- made: hand over the invite links ----------
  if (made && !sent) {
    const token = made.show.share_token;
    const when = dayText(made.show.date);
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
        startOpen
        color={RED}
        seed={user?.id || "new-event"}
        title={name || "New event"}
        dateLine={f.date ? dayText(f.date) : "New event"}
        actName=""
        center={{ name: me.display_name || "You", photo: me.profile_photo_url || "", label: "You", href: me.card_share_token ? `/pilot/${me.card_share_token}` : "" }}
        circles={circles}
        onSend={create}
        canSend={has(f.date) && f.acts.length > 0}
        sending={sending}
        sendLabel="Create event"
        error={error}
        sent={sent}
        onSentOff={() => setSent(false)}
        belowSend={(
          <button type="button" onClick={() => goBack()} className="min-h-[44px] text-[14px] font-semibold text-white/60">Cancel</button>
        )}
      />
    </>
  );
}
