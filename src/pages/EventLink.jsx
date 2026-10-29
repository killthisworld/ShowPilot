import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Plus, Trash2, Upload, Send, MessageSquare, Lock, CalendarDays, X, ExternalLink } from "lucide-react";
import SkyKey from "@/components/showpilot/SkyKey";
import NightSky from "@/components/showpilot/NightSky";
import { SCENE_MONO } from "@/lib/sceneStyle";
import EventOverviewCard from "@/components/showpilot/EventOverviewCard";
import { fetchPublicLink, getStoredToken, isAnswered, saveResponse, uploadActFile, askType, LINK_KINDS, guessLinkKind, linkHref } from "@/lib/eventLink";
import { supabase } from "@/api/supabaseClient";

// Public page an act opens from the venue's event link (/v/<code>). No account:
// answers save to a private response token kept in this browser. Job 176.
// Since Oct 29 (job 190) it opens as an access key: the act types who they
// are and their web unlocks, a circle per thing the venue asks.
const BLUE = "#60A5FA";
const GREEN = "#8CFF3D";
const AMBER = "#FF6A00";
const RED = "#F87171"; // the act's own colour (Mgmt / Artist)
// A circle's label: the question, shortened to fit.
const shortLabel = (label) => {
  const t = String(label || "").replace(/[?.]$/, "").trim();
  if (t.length <= 12) return t || "Question";
  const words = t.split(/\s+/).filter((w) => !/^(and|the|a|an|of|your|you|for|to|using)$/i.test(w));
  const out = (words.slice(0, 2).join(" ") || t).slice(0, 16);
  return out.charAt(0).toUpperCase() + out.slice(1);
};
const mono = { fontFamily: SCENE_MONO };
const card = "rounded-[14px] border border-[#2a2a2a] bg-[#141414] p-4";
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40";

// The night sky (stars drifting, shooting stars) behind the key and the web
// (job 191). `dim` darkens it; it lifts when the key opens.
function SkyBack({ seed, dim = 0.3 }) {
  return (
    <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}>
      <style>{`@keyframes el-web-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } } .el-web-in { animation: el-web-in 700ms cubic-bezier(.2,.8,.2,1) both; } @media (prefers-reduced-motion: reduce) { .el-web-in { animation: none; } }`}</style>
      <NightSky seed={seed} dim={dim} />
    </div>
  );
}

// Desktop or phone (job 191): each gets its own layout.
function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const f = () => setOn(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return on;
}

function Shell({ children, wide = false, sky = null, dim = 0.3 }) {
  return (
    <div className="min-h-screen bg-[#05060d] text-white relative">
      {sky && <SkyBack seed={sky} dim={dim} />}
      <div className={`relative ${wide ? "max-w-6xl" : "max-w-xl"} mx-auto px-4 pt-5 pb-16 flex flex-col gap-4`} style={{ zIndex: 1 }}>
        <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>
        {children}
      </div>
    </div>
  );
}

// In the venue's preview, uploads stay on this screen (nothing is stored).
let PREVIEW = false;
const uploadFile = (code, f) => (PREVIEW ? Promise.resolve({ url: URL.createObjectURL(f), name: f.name, type: f.type }) : uploadActFile(code, f));

const fmtDay = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "");

function FileAsk({ code, value, onChange }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setErr("");
    try { onChange(await uploadFile(code, f)); } catch (x) { console.error(x); setErr("Couldn't upload that file. Try again."); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2">
      {value?.url && <a href={value.url} target="_blank" rel="noreferrer" className="text-[14px] underline break-all" style={{ color: BLUE }}>{value.name || "Uploaded file"}</a>}
      <input ref={ref} type="file" className="hidden" onChange={pick} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="w-full min-h-[48px] rounded-[10px] font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: value?.url ? "transparent" : BLUE, color: value?.url ? BLUE : "#0d0d0d", border: `1px solid ${BLUE}` }}>
        <Upload className="w-4 h-4" />{busy ? "Uploading…" : value?.url ? "Replace file" : "Upload"}
      </button>
      {err && <p className="text-[13px]" style={{ color: AMBER }}>{err}</p>}
    </div>
  );
}

function InputsAsk({ code, value, onChange }) {
  const v = value || { members: [], files: [] };
  const members = v.members || [];
  const files = v.files || [];
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const set = (next) => onChange({ ...v, members: members, files, ...next });
  const setMember = (i, k, val) => set({ members: members.map((m, idx) => (idx === i ? { ...m, [k]: val } : m)) });
  const addFiles = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (!list.length) return;
    setBusy(true);
    const added = [];
    for (const f of list) { try { added.push(await uploadFile(code, f)); } catch (x) { console.error(x); } }
    set({ files: [...files, ...added] });
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-3">
      {members.map((m, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_44px] gap-2 items-center">
          <input value={m.name || ""} onChange={(e) => setMember(i, "name", e.target.value)} placeholder="Name" className={inputCls} aria-label="Member name" />
          <input value={m.plays || ""} onChange={(e) => setMember(i, "plays", e.target.value)} placeholder="Plays / plugs in" className={inputCls} aria-label="What they play" />
          <button type="button" onClick={() => set({ members: members.filter((_, idx) => idx !== i) })} aria-label="Remove member" className="min-h-[44px] flex items-center justify-center text-white/35"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => set({ members: [...members, { name: "", plays: "" }] })} className="min-h-[44px] self-start px-3 rounded-lg border border-[#2a2a2a] text-[14px] font-semibold flex items-center gap-1.5" style={{ color: BLUE }}><Plus className="w-4 h-4" />Add a member</button>
      <div className="border-t border-[#242424] pt-3 flex flex-col gap-2">
        <span className="text-[12px] tracking-[0.1em] text-white/50" style={mono}>STAGE PLOT / INPUT LIST FILES</span>
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-2"><a href={f.url} target="_blank" rel="noreferrer" className="flex-1 text-[14px] underline break-all" style={{ color: BLUE }}>{f.name}</a><button type="button" onClick={() => set({ files: files.filter((_, idx) => idx !== i) })} aria-label="Remove file" className="min-h-[44px] w-[44px] flex items-center justify-center text-white/35"><Trash2 className="w-4 h-4" /></button></div>
        ))}
        <input ref={ref} type="file" multiple className="hidden" onChange={addFiles} />
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="min-h-[44px] rounded-[10px] text-[14px] font-semibold border disabled:opacity-60" style={{ color: BLUE, borderColor: `${BLUE}66` }}>{busy ? "Uploading…" : "Add files"}</button>
      </div>
    </div>
  );
}

// Links (job 194): one row per link, what it's for from a list, + Add.
function LinksAsk({ value, onChange }) {
  const rows = Array.isArray(value) && value.length ? value : [{ kind: "", url: "" }];
  const refs = useRef([]);
  const set = (next) => onChange(next);
  const setRow = (i, patch) => set(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => { set([...rows, { kind: "", url: "" }]); setTimeout(() => refs.current[rows.length]?.focus(), 0); };
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => {
        const href = linkHref(r.url);
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-[12px] border border-[#242424] bg-[#101010] p-2.5">
            <div className="flex gap-2">
              <select value={r.kind || ""} onChange={(e) => setRow(i, { kind: e.target.value })} aria-label="What this link is for" className={`${inputCls} !w-[128px] shrink-0 !px-2`}>
                <option value="">Type…</option>
                {LINK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
              <input ref={(el) => { refs.current[i] = el; }} value={r.url || ""} inputMode="url" autoCapitalize="none" autoCorrect="off"
                onChange={(e) => setRow(i, { url: e.target.value, kind: r.kind || guessLinkKind(e.target.value) })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (String(r.url || "").trim()) add(); } }}
                placeholder="Paste the link" aria-label="Link" className={inputCls} />
              {rows.length > 1 && <button type="button" onClick={() => set(rows.filter((_, j) => j !== i))} aria-label="Remove link" className="min-h-[44px] w-[40px] shrink-0 flex items-center justify-center text-white/40"><X className="w-4 h-4" /></button>}
            </div>
            {href && /\./.test(r.url) && <a href={href} target="_blank" rel="noreferrer" className="self-start flex items-center gap-1.5 text-[12.5px] underline break-all" style={{ color: BLUE }}><ExternalLink className="w-3.5 h-3.5 shrink-0" />{href.replace(/^https?:\/\//, "")}</a>}
          </div>
        );
      })}
      <button type="button" onClick={add} className="self-center min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5" style={{ color: BLUE }}><Plus className="w-4 h-4" />Add another link</button>
    </div>
  );
}

// A contact (job 194): name, title, phone, email; + Add for more people.
function ContactAsk({ value, onChange }) {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  const rows = list.length ? list : [{ name: "", title: "", phone: "", email: "" }];
  const setRow = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={i} className="rounded-[12px] border border-[#242424] bg-[#101010] p-2.5 grid grid-cols-2 gap-2">
          <input value={r.name || ""} onChange={(e) => setRow(i, "name", e.target.value)} placeholder="Name" aria-label="Name" autoComplete="name" className={inputCls} />
          <input value={r.title || ""} onChange={(e) => setRow(i, "title", e.target.value)} placeholder="Title (tour manager…)" aria-label="Title" className={inputCls} />
          <input value={r.phone || ""} onChange={(e) => setRow(i, "phone", e.target.value)} placeholder="Phone" aria-label="Phone" type="tel" inputMode="tel" autoComplete="tel" className={inputCls} />
          <input value={r.email || ""} onChange={(e) => setRow(i, "email", e.target.value)} placeholder="Email" aria-label="Email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" className={inputCls} />
          {rows.length > 1 && <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="col-span-2 justify-self-end min-h-[36px] px-2 text-[12.5px] text-white/45 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Remove</button>}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { name: "", title: "", phone: "", email: "" }])} className="self-center min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5" style={{ color: BLUE }}><Plus className="w-4 h-4" />Add another person</button>
    </div>
  );
}

function AddressAsk({ value, onChange }) {
  const v = value && typeof value === "object" ? value : {};
  const set = (k, x) => onChange({ ...v, [k]: x });
  return (
    <div className="grid grid-cols-6 gap-2">
      <input value={v.street || ""} onChange={(e) => set("street", e.target.value)} placeholder="Street address" aria-label="Street address" autoComplete="street-address" className={`${inputCls} col-span-6`} />
      <input value={v.city || ""} onChange={(e) => set("city", e.target.value)} placeholder="City" aria-label="City" autoComplete="address-level2" className={`${inputCls} col-span-3`} />
      <input value={v.state || ""} onChange={(e) => set("state", e.target.value)} placeholder="State" aria-label="State" autoComplete="address-level1" className={`${inputCls} col-span-1 !px-2`} />
      <input value={v.zip || ""} onChange={(e) => set("zip", e.target.value)} placeholder="ZIP" aria-label="ZIP" inputMode="numeric" autoComplete="postal-code" className={`${inputCls} col-span-2`} />
    </div>
  );
}

function YesNoAsk({ value, onChange, hint }) {
  const v = value || {};
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {[["yes", "Yes"], ["no", "No"]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => onChange({ ...v, value: k })} className="flex-1 min-h-[48px] rounded-[10px] text-[15px] font-semibold border" style={{ background: v.value === k ? `${BLUE}22` : "#101010", borderColor: v.value === k ? BLUE : "#2a2a2a", color: v.value === k ? BLUE : "#e5e5e5" }}>{label}</button>
        ))}
      </div>
      <input value={v.note || ""} onChange={(e) => onChange({ ...v, note: e.target.value })} placeholder={hint || "Anything to add"} className={inputCls} />
    </div>
  );
}

export default function EventLink() {
  const { code } = useParams();
  // ?preview=1: the venue looking at what acts get (job 176). Starts blank,
  // never loads or saves an act's answers.
  const preview = new URLSearchParams(window.location.search).get("preview") === "1";
  PREVIEW = preview;
  const [info, setInfo] = useState(undefined); // undefined loading, null not found
  const [actName, setActName] = useState("");
  const [answers, setAnswers] = useState({});
  const [token, setToken] = useState(() => getStoredToken(code));
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState(""); // "", saving, saved, error
  // Locked until the act opens the key, every visit (returning acts keep their answers).
  const [unlocked, setUnlocked] = useState(false);
  const [pane, setPane] = useState("start"); // start | show | question | ask:<key>
  const [keyPhase, setKeyPhase] = useState("idle"); // idle | unlocking (the key opening, job 191)
  const desktop = useIsDesktop();
  // Someone with a Show Pilot account opening their key: their own profile
  // picture goes in the middle of their web (job 192).
  const [myPhoto, setMyPhoto] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !live) return;
        const { data } = await supabase.from("user_preferences").select("profile_photo_url").eq("user_id", user.id).maybeSingle();
        if (live && data?.profile_photo_url) setMyPhoto(data.profile_photo_url);
      } catch { /* not signed in */ }
    })();
    return () => { live = false; };
  }, []);
  // Several questions at once for the venue (job 192).
  const [drafts, setDrafts] = useState([""]);
  const dirty = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let live = true;
    fetchPublicLink(code, preview ? null : getStoredToken(code)).then((d) => {
      if (!live) return;
      setInfo(d || null);
      // An act's own key (job 190): the venue already named them.
      if (d?.key?.act_name) setActName(d.key.act_name);
      if (d?.response && !preview) {
        setActName(d.response.act_name || "");
        setAnswers(d.response.answers || {});
        setSubmitted(!!d.response.submitted_at);
        // The key opens every time the link is opened (Oct 29); their answers are already loaded.
      }
    }).catch((e) => { console.error(e); if (live) setInfo(null); });
    return () => { live = false; };
  }, [code]);

  const persist = useCallback(async (name, ans, submit = false) => {
    if (preview) return false;
    setStatus("saving");
    try {
      const r = await saveResponse(code, tokenRef.current, name, ans, submit);
      setToken(r.token);
      tokenRef.current = r.token;
      if (submit) setSubmitted(true);
      setStatus("saved");
      dirty.current = false;
      return true;
    } catch (e) { console.error(e); setStatus("error"); return false; }
  }, [code, preview]);

  // Save a moment after the last change, once the act has typed a name.
  useEffect(() => {
    if (!dirty.current || !actName.trim()) return undefined;
    const t = setTimeout(() => persist(actName, answers), 900);
    return () => clearTimeout(t);
  }, [actName, answers, persist]);

  const setAnswer = (key, val) => { dirty.current = true; setSubmitted(false); setAnswers((a) => ({ ...a, [key]: val })); };
  const asks = info?.asks || [];
  const done = useMemo(() => asks.filter((a) => isAnswered(a, answers[a.key])).length, [asks, answers]);
  const missing = asks.filter((a) => a.required && !isAnswered(a, answers[a.key]));

  if (info === undefined) {
    return <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" /></div>;
  }
  if (!info) {
    return <Shell><div className={card}><p className="text-white/70 text-lg">This link isn't valid.</p><p className="text-white/40 text-sm mt-1">Check it with the venue.</p></div></Shell>;
  }

  const previewBar = preview ? (
    <div className="sticky top-2 z-10 rounded-[12px] px-4 py-3 text-[14px] font-semibold text-[#0d0d0d]" style={{ background: BLUE }}>
      Preview: this is what acts see. Nothing you type here is saved or sent.
    </div>
  ) : null;

  const sendQuestion = async () => {
    const qs = drafts.map((d) => d.trim()).filter(Boolean);
    if (!qs.length || !actName.trim()) return;
    const at = new Date().toISOString();
    const next = { ...answers, __questions: [...(answers.__questions || []), ...qs.map((text) => ({ text, at }))] };
    setAnswers(next);
    setDrafts([""]);
    await persist(actName, next);
  };

  const unlock = () => {
    if (!actName.trim() || keyPhase !== "idle") return;
    dirty.current = true;
    setKeyPhase("unlocking");
  };
  // The key has finished opening (same animation as the fan's sky key).
  const onKeyOpen = () => {
    setUnlocked(true);
    setKeyPhase("idle");
    if (!preview && actName.trim()) persist(actName, answers);
  };
  const logo = info.overview?.image || "";
  const opening = keyPhase === "unlocking";

  // ---------- The key ----------
  if (!unlocked) {
    const who = info.key ? (
      <div className="rounded-[14px] border px-4 py-3 flex items-center gap-3 backdrop-blur-sm" style={{ borderColor: `${RED}66`, background: "rgba(26,18,18,0.8)" }}>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: RED }} />
        <span className="flex-1 min-w-0"><span className="block text-[11px] tracking-[0.12em] text-white/55" style={mono}>THIS KEY IS FOR</span><span className="block text-[18px] font-bold truncate">{info.key.act_name}</span></span>
      </div>
    ) : (
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-[0.12em] text-white/60" style={mono}>WHO ARE YOU PLAYING AS?</span>
        <input value={actName} onChange={(e) => setActName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} placeholder="Band or artist name" className={`${inputCls} min-h-[52px] text-[17px] bg-[#0b0b0b]/90`} autoFocus={desktop} />
      </label>
    );
    const heading = (
      <div className="flex flex-col gap-1">
        <span className="text-[14px] text-white/70">{info.key ? `${info.venue || "The venue"} sent ${info.key.act_name} a key to` : info.venue ? `${info.venue} sent you a key to` : "You've got a key to"}</span>
        <h1 className={`${desktop ? "text-[56px]" : "text-[40px]"} leading-none font-bold`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{info.title || "Event"}</h1>
        <span className="text-[14.5px] text-white/70">{[fmtDay(info.date), info.place].filter(Boolean).join(" · ")}</span>
      </div>
    );
    const keyArt = (size) => (
      <div className="relative flex flex-col items-center gap-3">
        <div style={{ width: size, height: size }}>
          <div style={{ transform: `scale(${size / 280})`, transformOrigin: "top left" }}>
            <SkyKey seed={code} color={BLUE} phase={opening ? "unlocking" : "idle"} onDone={onKeyOpen} image={logo || null} />
          </div>
        </div>
        <span className="text-[20px] tracking-[0.3em] transition-opacity duration-500" style={{ ...mono, color: BLUE, opacity: opening ? 0 : 1 }}>{String(code || "").toUpperCase()}</span>
      </div>
    );
    const action = (
      <div className="flex flex-col gap-3 transition-opacity duration-500" style={{ opacity: opening ? 0 : 1, pointerEvents: opening ? "none" : "auto" }}>
        {who}
        <button type="button" disabled={!actName.trim() || opening} onClick={unlock} className="min-h-[56px] rounded-[14px] font-bold text-[17px] flex items-center justify-center gap-2.5 disabled:opacity-50" style={{ background: BLUE, color: "#0d0d0d", boxShadow: `0 0 24px ${BLUE}55` }}>
          <Lock className="w-5 h-5" />Unlock my web
        </button>
        <p className="text-center text-[12.5px] text-white/55 leading-relaxed">
          {asks.length ? `Opens the web of ${asks.length} thing${asks.length === 1 ? "" : "s"} ${info.venue || "the venue"} needs from you. ` : ""}
          {info.key ? "No account needed. Your answers save as you go." : "No account needed. Your answers save as you go, on this device and with the venue."}
        </p>
      </div>
    );
    if (desktop) {
      return (
        <div className="min-h-screen text-white relative bg-[#05060d]">
          <SkyBack seed={code} dim={opening ? 0.1 : 0.35} />
          <div className="relative min-h-screen max-w-5xl mx-auto px-8 py-10 flex flex-col" style={{ zIndex: 1 }}>
            <div className="transition-opacity duration-500" style={{ opacity: opening ? 0 : 1 }}>
              <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>
              {previewBar}
            </div>
            {opening ? (
              // Only the stars and the key opening.
              <div className="flex-1 flex items-center justify-center">{keyArt(420)}</div>
            ) : (
              <div className="flex-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12 items-center">
                <div className="flex justify-center">{keyArt(380)}</div>
                <div className="flex flex-col gap-8">
                  {heading}
                  {action}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-[100dvh] text-white relative bg-[#05060d]">
        <SkyBack seed={code} dim={opening ? 0.1 : 0.35} />
        <div className="relative min-h-[100dvh] px-5 pt-5 pb-6 flex flex-col gap-5" style={{ zIndex: 1 }}>
          {!opening && (
            <>
              <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>
              {previewBar}
              {heading}
            </>
          )}
          <div className="flex-1 flex items-center justify-center py-2">{keyArt(Math.min(opening ? 330 : 300, typeof window !== "undefined" ? window.innerWidth - 50 : 300))}</div>
          {!opening && action}
        </div>
      </div>
    );
  }

  // ---------- The web ----------
  const N = asks.length;
  const nodeSize = N > 9 ? 17 : 20; // % of the web
  const reqLeft = missing.length;
  const cur = pane.startsWith("ask:") ? asks.find((a) => `ask:${a.key}` === pane) || null : null;
  const curIdx = cur ? asks.indexOf(cur) : -1;
  const curType = cur ? askType(cur, answers[cur.key]) : null;
  // Save keeps the answer and goes back to the web, where the circle turns green.
  const saveCircle = async () => {
    if (actName.trim()) await persist(actName, answers);
    setPane("start");
  };
  const send = () => { if (!preview && actName.trim() && status !== "saving") persist(actName, answers, true); };
  const statusText = preview ? "PREVIEW · NOTHING IS SAVED" : status === "saving" ? "SAVING…" : status === "error" ? "COULDN'T SAVE, TRY AGAIN" : status === "saved" ? "SAVED" : "";

  // The act's picture in the middle: their lineup photo, else the photo they
  // uploaded on this form.
  const nameKey = actName.trim().toLowerCase();
  const lineupPhoto = (info.overview?.bands || []).find((b) => String(b.band_name || "").trim().toLowerCase() === nameKey)?.photo_url || "";
  const photoAsk = asks.find((a) => a.type === "file" && /photo|picture|headshot|press/i.test(`${a.key} ${a.label}`));
  const upPhoto = photoAsk && answers[photoAsk.key]?.url && /^image\//.test(answers[photoAsk.key]?.type || "image/") ? answers[photoAsk.key].url : "";
  const actPhoto = myPhoto || lineupPhoto || upPhoto;

  const corner = "absolute w-[15%] aspect-square min-w-[54px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1 text-[10.5px] sm:text-[12px] font-bold backdrop-blur-sm";
  const web = (
    <div className="relative w-full aspect-square">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <circle cx="50" cy="50" r="37" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
        {asks.map((a, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
          const ok = isAnswered(a, answers[a.key]);
          return <line key={a.key} x1="50" y1="50" x2={50 + 37 * Math.cos(ang)} y2={50 + 37 * Math.sin(ang)} stroke={pane === `ask:${a.key}` ? "rgba(255,255,255,0.7)" : ok ? `${GREEN}80` : "rgba(255,255,255,0.16)"} strokeWidth="0.3" />;
        })}
      </svg>
      <button type="button" onClick={() => setPane(pane === "show" ? "start" : "show")} aria-pressed={pane === "show"} className={`${corner} left-0 top-0`} style={{ borderColor: BLUE, background: pane === "show" ? `${BLUE}33` : "rgba(17,17,17,0.85)" }}>
        <CalendarDays className="w-[30%] h-[30%]" style={{ color: BLUE }} />The show
      </button>
      <button type="button" onClick={() => setPane(pane === "question" ? "start" : "question")} aria-pressed={pane === "question"} className={`${corner} right-0 top-0`} style={{ borderColor: BLUE, background: pane === "question" ? `${BLUE}33` : "rgba(17,17,17,0.85)" }}>
        <MessageSquare className="w-[30%] h-[30%]" style={{ color: BLUE }} />Ask
      </button>
      <button type="button" onClick={send} disabled={preview || submitted || status === "saving" || reqLeft > 0} aria-label={submitted ? "Sent to the venue" : reqLeft ? `${reqLeft} needed before you send` : "Send to the venue"} className={`${corner} right-0 bottom-0 disabled:cursor-default`}
        style={submitted ? { borderColor: GREEN, background: `${GREEN}22`, color: GREEN } : reqLeft ? { borderColor: "#444", borderStyle: "dashed", background: "rgba(17,17,17,0.85)", color: "rgba(255,255,255,0.55)" } : { borderColor: GREEN, background: GREEN, color: "#0d0d0d", boxShadow: `0 0 14px ${GREEN}80` }}>
        {submitted ? <CheckCircle className="w-[30%] h-[30%]" /> : <Send className="w-[30%] h-[30%]" />}{submitted ? "Sent" : "Send"}
      </button>
      {asks.map((a, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
        const ok = isAnswered(a, answers[a.key]);
        const on = pane === `ask:${a.key}`;
        return (
          <button key={a.key} type="button" onClick={() => setPane(on ? "start" : `ask:${a.key}`)} aria-pressed={on} aria-label={`${a.label}, ${ok ? "done" : "not filled in yet"}`}
            className="absolute rounded-full flex flex-col items-center justify-center gap-[3px] p-0 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${50 + 37 * Math.cos(ang)}%`, top: `${50 + 37 * Math.sin(ang)}%`, width: `${nodeSize}%`, height: `${nodeSize}%`,
              // Not filled in: no colour. Filled in: green. The open one is ringed in white.
              background: ok ? GREEN : "rgba(21,21,21,0.92)", color: ok ? "#0d0d0d" : "#f2f2f2",
              border: `${on ? 2.5 : 1.5}px solid ${on ? "#FFFFFF" : ok ? GREEN : "rgba(255,255,255,0.28)"}`,
              boxShadow: on ? "0 0 18px rgba(255,255,255,0.45)" : ok ? `0 0 14px ${GREEN}66` : "none" }}>
            <span className={`${desktop ? "text-[13px]" : "text-[10px]"} font-bold leading-[1.05] text-center px-1 line-clamp-2`}>{shortLabel(a.label)}</span>
          </button>
        );
      })}
      {/* The act in the middle: their picture when there is one. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[29%] aspect-square rounded-full border-2 overflow-hidden flex flex-col items-center justify-center text-center" style={{ borderColor: RED, background: "#1c1212", boxShadow: `0 0 30px ${RED}66` }}>
        {actPhoto ? (
          <>
            <img src={actPhoto} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(10,6,6,0.85))" }} />
            <span className={`relative mt-auto mb-[12%] ${desktop ? "text-[20px]" : "text-[14px]"} font-bold leading-none px-2 truncate max-w-full`} style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{actName.toUpperCase()}</span>
          </>
        ) : (
          <>
            <span className={`${desktop ? "text-[26px]" : "text-[17px]"} font-bold leading-none break-words max-w-full px-2`} style={{ fontFamily: "'Barlow Condensed', sans-serif", color: RED }}>{actName.toUpperCase()}</span>
            <span className="text-[9px] sm:text-[10.5px] tracking-[0.1em] text-white/65 mt-0.5" style={mono}>YOUR WEB</span>
          </>
        )}
      </div>
    </div>
  );


  const askBody = cur && (
    <div className="flex flex-col gap-3 text-center">
      <div className="flex flex-col items-center gap-1">
        {(() => { const ok = isAnswered(cur, answers[cur.key]); return <div className="text-[10.5px] tracking-[0.12em]" style={{ ...mono, color: ok ? GREEN : "rgba(255,255,255,0.55)" }}>{ok ? "DONE" : cur.required ? "NEEDED" : "OPTIONAL"} · {curIdx + 1} / {N}</div>; })()}
        <div className={`${desktop ? "text-[30px]" : "text-[22px]"} font-bold leading-tight`} style={desktop ? { fontFamily: "'Barlow Condensed', sans-serif" } : undefined}>{cur.label}</div>
        {cur.hint && cur.type !== "yesno" && <p className="text-[13.5px] text-white/60">{cur.hint}</p>}
      </div>
      <div className="text-left">
        {curType === "text" && <input value={typeof answers[cur.key] === "string" ? answers[cur.key] : ""} onChange={(e) => setAnswer(cur.key, e.target.value)} className={inputCls} aria-label={cur.label} autoFocus={desktop} />}
        {curType === "longtext" && <textarea value={typeof answers[cur.key] === "string" ? answers[cur.key] : ""} onChange={(e) => setAnswer(cur.key, e.target.value)} rows={desktop ? 6 : 4} className={`${inputCls} py-2`} aria-label={cur.label} autoFocus={desktop} />}
        {curType === "file" && <FileAsk code={code} value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
        {curType === "yesno" && <YesNoAsk hint={cur.hint} value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
        {curType === "inputs" && <InputsAsk code={code} value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
        {curType === "links" && <LinksAsk value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
        {curType === "contact" && <ContactAsk value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
        {curType === "address" && <AddressAsk value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
      </div>
      <button type="button" onClick={saveCircle} disabled={status === "saving"} className="w-full min-h-[52px] rounded-[12px] font-bold text-[16px] disabled:opacity-60" style={{ background: GREEN, color: "#0d0d0d" }}>{status === "saving" ? "Saving…" : "Save"}</button>
    </div>
  );
  const showBody = (
    <div className="flex flex-col gap-3">
      {info.message && <div className={card}><p className="text-[15px] text-white/80 whitespace-pre-wrap">{info.message}</p></div>}
      {info.overview ? (
        <EventOverviewCard ov={info.overview} title={info.title} date={info.date} venue={info.venue} place={info.place} color={BLUE} />
      ) : (
        (info.blocks || []).map((bl) => (
          <div key={bl.key} className={card}>
            <div className="text-[11px] tracking-[0.12em] text-white/50" style={mono}>{String(bl.title || "").toUpperCase()}</div>
            <p className="mt-2 text-[15px] text-white/85 whitespace-pre-wrap leading-relaxed">{bl.body}</p>
          </div>
        ))
      )}
    </div>
  );
  const questionBody = (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col items-center gap-1 text-center">
        <MessageSquare className="w-5 h-5" style={{ color: BLUE }} />
        <span className={`${desktop ? "text-[26px]" : "text-[20px]"} font-bold`} style={desktop ? { fontFamily: "'Barlow Condensed', sans-serif" } : undefined}>Something not here?</span>
        <p className="text-[13.5px] text-white/60">Ask {info.venue || "the venue"}. It goes on the event, not in email.</p>
      </div>
      {(answers.__questions || []).map((q, i) => <p key={i} className="text-[14px] text-white/75 bg-[#101010] border border-[#242424] rounded-[10px] px-3 py-2">You asked: {q.text}</p>)}
      {drafts.map((d, i) => (
        <div key={i} className="flex gap-2">
          <input value={d} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i ? "Another question" : "Write a question"} aria-label={`Question ${i + 1}`} className={inputCls} autoFocus={desktop && i === drafts.length - 1} />
          {drafts.length > 1 && <button type="button" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} aria-label="Remove this question" className="min-h-[44px] w-[44px] shrink-0 flex items-center justify-center text-white/40"><X className="w-4 h-4" /></button>}
        </div>
      ))}
      {drafts.length < 8 && <button type="button" onClick={() => setDrafts([...drafts, ""])} className="self-center min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5" style={{ color: BLUE }}><Plus className="w-4 h-4" />Add another question</button>}
      <button type="button" onClick={sendQuestion} disabled={preview || !drafts.some((d) => d.trim())} className="w-full min-h-[50px] rounded-[12px] font-bold text-[15px] disabled:opacity-40" style={{ background: BLUE, color: "#0d0d0d" }}>{drafts.filter((d) => d.trim()).length > 1 ? `Send ${drafts.filter((d) => d.trim()).length} questions` : "Send question"}</button>
    </div>
  );
  const firstNeeded = missing[0] || asks[0];
  const showModal = pane === "show" ? (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 30 }}>
      <button type="button" aria-label="Close" onClick={() => setPane("start")} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label="The show" className="el-web-in relative w-full max-w-[520px] max-h-[88dvh] overflow-y-auto rounded-[18px]">
        <button type="button" onClick={() => setPane("start")} aria-label="Close" className="absolute right-2 top-2 z-10 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white/80"><X className="w-5 h-5" /></button>
        {showBody}
      </div>
    </div>
  ) : null;
  const startBody = (
    <div className="flex flex-col items-center gap-2 text-center">
      {info.message && <p className="w-full text-[15px] text-white/80 whitespace-pre-wrap pb-2 border-b border-[#242424] mb-1">{info.message}</p>}
      <span className="text-[17px] font-bold">{N ? (reqLeft ? "Tap a circle to fill it in" : submitted ? "All sent" : "Everything needed is in") : "Nothing to fill in"}</span>
      {(!N || !reqLeft) && <span className="text-[14px] text-white/60 leading-relaxed">{N ? (submitted ? "You can still change anything; it saves as you go." : `Tap Send to let ${info.venue || "the venue"} know.`) : "Tap The show for the details."}</span>}
      {N > 0 && reqLeft > 0 && <button type="button" onClick={() => setPane(`ask:${firstNeeded.key}`)} className="mt-2 min-h-[48px] px-5 rounded-[12px] font-bold text-[15px]" style={{ background: RED, color: "#0d0d0d" }}>Start with {shortLabel(firstNeeded.label)}</button>}
    </div>
  );
  const sendRow = submitted ? (
    <p className="text-[13.5px]" style={{ color: GREEN }}>Sent to {info.venue || "the venue"}. You can still change anything; it saves as you go.</p>
  ) : reqLeft ? null : (
    <button type="button" onClick={send} disabled={preview || status === "saving"} className="w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: GREEN, color: "#0d0d0d" }}><Send className="w-4 h-4" />Send to {info.venue || "the venue"}</button>
  );
  const header = (big) => (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] tracking-[0.14em] truncate" style={{ ...mono, color: BLUE }}>{[info.venue, fmtDay(info.date)].filter(Boolean).join(" · ").toUpperCase()}</div>
        <h1 className={`${big ? "text-[44px]" : "text-[28px]"} leading-[1.02] font-bold truncate`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{info.title || "Event"}</h1>
      </div>
      <div className="pt-1 flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] tracking-[0.08em] text-white/75" style={mono}>{done} OF {N} DONE</span>
        <div className={`${big ? "w-[180px] h-2" : "w-[110px] h-1.5"} rounded bg-[#1f1f1f] overflow-hidden`}><div className="h-full" style={{ width: `${N ? (done / N) * 100 : 100}%`, background: GREEN }} /></div>
        {statusText && <span className="text-[10.5px] tracking-[0.08em]" style={{ ...mono, color: status === "error" ? AMBER : "rgba(255,255,255,0.5)" }}>{statusText}</span>}
      </div>
    </div>
  );
  const changeName = !info.key ? <button type="button" onClick={() => { setUnlocked(false); setKeyPhase("idle"); }} className="text-[12.5px] text-white/50 underline min-h-[40px]">Not {actName}? Change the name</button> : null;

  if (desktop) {
    // Laptop: the web on the left, what you're filling in on the right.
    return (
      <div className="min-h-screen text-white relative bg-[#05060d]">
        <SkyBack seed={code} dim={0.25} />
        <div className="el-web-in relative max-w-6xl mx-auto px-8 py-8 flex flex-col gap-6" style={{ zIndex: 1 }}>
          <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>
          {previewBar}
          {header(true)}
          <div className="grid grid-cols-[minmax(0,600px)_minmax(0,1fr)] gap-10 items-start">
            <div className="flex flex-col gap-3">{web}</div>
            <div className="sticky top-6 flex flex-col gap-3">
              <div className="rounded-[18px] border border-[#262626] bg-[#151515]/95 backdrop-blur p-6 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
                {cur ? askBody : pane === "question" ? questionBody : startBody}
              </div>
              {sendRow}
              <div>{changeName}</div>
            </div>
          </div>
        </div>
        {showModal}
      </div>
    );
  }

  // Phone: the web fills the screen; a circle opens in a sheet from the bottom.
  const sheetOpen = pane !== "start" && pane !== "show";
  return (
    <div className="min-h-[100dvh] text-white relative bg-[#05060d]">
      <SkyBack seed={code} dim={0.25} />
      <div className="el-web-in relative px-4 pt-4 pb-8 flex flex-col gap-3" style={{ zIndex: 1 }}>
        {previewBar}
        {header(false)}
        <div className="mt-1">{web}</div>
        <div className="rounded-[16px] border border-[#262626] bg-[#151515]/90 backdrop-blur p-4">{startBody}</div>
        {sendRow}
        <div className="flex justify-center">{changeName}</div>
      </div>
      {sheetOpen && (
        <div className="fixed inset-0" style={{ zIndex: 20 }}>
          <button type="button" aria-label="Close" onClick={() => setPane("start")} className="absolute inset-0 bg-black/45" />
          <div role="dialog" aria-modal="true" aria-label={cur ? cur.label : "Ask the venue"} className="absolute left-0 right-0 bottom-0 max-h-[78dvh] overflow-y-auto rounded-t-[22px] border-t border-[#2a2a2a] bg-[#151515] px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-18px_40px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-center relative h-8 mb-1">
              <span className="w-10 h-1 rounded-full bg-[#3a3a3a]" aria-hidden="true" />
              <button type="button" onClick={() => setPane("start")} aria-label="Close" className="absolute right-0 top-0 w-10 h-10 flex items-center justify-center text-white/60"><X className="w-5 h-5" /></button>
            </div>
            {cur ? askBody : questionBody}
          </div>
        </div>
      )}
      {showModal}
    </div>
  );
}
