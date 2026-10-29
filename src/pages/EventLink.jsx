import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Plus, Trash2, Upload, Send, MessageSquare, KeyRound, LockOpen, CalendarDays, ChevronLeft } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import EventOverviewCard from "@/components/showpilot/EventOverviewCard";
import { fetchPublicLink, getStoredToken, isAnswered, saveResponse, uploadActFile } from "@/lib/eventLink";

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

function Shell({ children, wide = false }) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className={`${wide ? "max-w-5xl" : "max-w-xl"} mx-auto px-4 pt-5 pb-16 flex flex-col gap-4`}>
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
  const [question, setQuestion] = useState("");
  // Locked until the act says who they are (returning acts open straight in).
  const [unlocked, setUnlocked] = useState(false);
  const [pane, setPane] = useState("start"); // start | show | question | ask:<key>
  const dirty = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let live = true;
    fetchPublicLink(code, preview ? null : getStoredToken(code)).then((d) => {
      if (!live) return;
      setInfo(d || null);
      if (d?.response && !preview) {
        setActName(d.response.act_name || "");
        setAnswers(d.response.answers || {});
        setSubmitted(!!d.response.submitted_at);
        if (String(d.response.act_name || "").trim()) setUnlocked(true);
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
    const q = question.trim();
    if (!q || !actName.trim()) return;
    const next = { ...answers, __questions: [...(answers.__questions || []), { text: q, at: new Date().toISOString() }] };
    setAnswers(next);
    setQuestion("");
    await persist(actName, next);
  };

  const unlock = () => {
    if (!actName.trim()) return;
    dirty.current = true;
    setUnlocked(true);
    if (!preview) persist(actName, answers);
  };

  // The key (Oct 29): the link opens an access key; typing who you're
  // playing as unlocks your web of what the venue needs.
  if (!unlocked) {
    return (
      <Shell>
        {previewBar}
        <div className="flex flex-col gap-1">
          <span className="text-[14px] text-white/65">{info.venue ? `${info.venue} sent you a key to` : "You've got a key to"}</span>
          <h1 className="text-[40px] leading-none font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{info.title || "Event"}</h1>
          <span className="text-[14.5px] text-white/70">{[fmtDay(info.date), info.place].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="relative rounded-[22px] border-[1.5px] bg-[#111] min-h-[300px] flex items-center justify-center overflow-hidden" style={{ borderColor: `${BLUE}80` }}>
          <div aria-hidden="true" className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${BLUE}2e, transparent 62%)` }} />
          <div className="relative flex flex-col items-center gap-3.5 px-6 text-center">
            <div className="w-[120px] h-[120px] rounded-full border-2 flex items-center justify-center" style={{ borderColor: BLUE, boxShadow: `0 0 30px ${BLUE}59` }}>
              <KeyRound className="w-[58px] h-[58px]" style={{ color: BLUE }} strokeWidth={1.5} />
            </div>
            <span className="text-[22px] tracking-[0.28em]" style={{ ...mono, color: BLUE }}>{String(code || "").toUpperCase()}</span>
            <span className="text-[13.5px] text-white/60 max-w-[280px] leading-relaxed">
              {asks.length ? `Your key for this show. Unlock it to open the web of ${asks.length} thing${asks.length === 1 ? "" : "s"} ${info.venue || "the venue"} needs from you.` : "Your key for this show. Unlock it to see the details."}
            </span>
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] tracking-[0.12em] text-white/60" style={mono}>WHO ARE YOU PLAYING AS?</span>
          <input value={actName} onChange={(e) => setActName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} placeholder="Band or artist name" className={`${inputCls} min-h-[52px] text-[17px]`} autoFocus />
        </label>
        <button type="button" disabled={!actName.trim()} onClick={unlock} className="min-h-[56px] rounded-[14px] font-bold text-[17px] flex items-center justify-center gap-2.5 disabled:opacity-50" style={{ background: BLUE, color: "#0d0d0d" }}>
          <LockOpen className="w-5 h-5" />Unlock my web
        </button>
        <p className="text-center text-[12.5px] text-white/50 leading-relaxed">No account needed. This key opens only your part of this show. Come back any time: your answers stay saved on this device and with the venue.</p>
      </Shell>
    );
  }

  const N = asks.length;
  const nodeSize = N > 9 ? 17 : 20; // % of the web
  const reqLeft = missing.length;
  const cur = pane.startsWith("ask:") ? asks.find((a) => `ask:${a.key}` === pane) || null : null;
  const curIdx = cur ? asks.indexOf(cur) : -1;
  const goAsk = (d) => { if (!N) return; const i = ((curIdx < 0 ? 0 : curIdx + d) + N) % N; setPane(`ask:${asks[i].key}`); };
  const saveNext = async () => {
    if (actName.trim()) await persist(actName, answers);
    const after = asks.slice(curIdx + 1).concat(asks.slice(0, curIdx + 1)).find((a) => a.required && !isAnswered(a, answers[a.key]));
    if (after && after !== cur) setPane(`ask:${after.key}`);
    else goAsk(1);
  };
  const send = () => { if (!preview && actName.trim() && status !== "saving") persist(actName, answers, true); };
  const corner = "absolute w-[15%] aspect-square min-w-[54px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1 text-[10.5px] sm:text-[12px] font-bold";
  const statusText = [
    preview ? "PREVIEW · NOTHING IS SAVED" : status === "saving" ? "SAVING…" : status === "error" ? "COULDN'T SAVE, TRY AGAIN" : status === "saved" ? "SAVED" : "",
  ].filter(Boolean).join(" · ");

  return (
    <Shell wide>
      {previewBar}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] tracking-[0.14em] truncate" style={{ ...mono, color: BLUE }}>{[info.venue, fmtDay(info.date)].filter(Boolean).join(" · ").toUpperCase()}</div>
          <h1 className="text-[28px] sm:text-[34px] leading-[1.05] font-bold truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{info.title || "Event"}</h1>
        </div>
        <div className="pt-1 flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11px] tracking-[0.08em] text-white/70" style={mono}>{done} OF {N} DONE</span>
          <div className="w-[110px] h-1.5 rounded bg-[#1f1f1f] overflow-hidden"><div className="h-full" style={{ width: `${N ? (done / N) * 100 : 100}%`, background: GREEN }} /></div>
          {statusText && <span className="text-[10.5px] tracking-[0.08em]" style={{ ...mono, color: status === "error" ? AMBER : "rgba(255,255,255,0.45)" }}>{statusText}</span>}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        {/* The act's web: their name in the middle, a circle per thing the venue asks. */}
        <div className="relative w-full max-w-[520px] mx-auto lg:mx-0 aspect-square shrink-0">
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
            <circle cx="50" cy="50" r="37" fill="none" stroke={`${RED}2e`} strokeWidth="0.3" />
            {asks.map((a, i) => {
              const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
              return <line key={a.key} x1="50" y1="50" x2={50 + 37 * Math.cos(ang)} y2={50 + 37 * Math.sin(ang)} stroke={pane === `ask:${a.key}` ? RED : `${RED}38`} strokeWidth="0.3" />;
            })}
          </svg>
          <button type="button" onClick={() => setPane("show")} aria-pressed={pane === "show"} className={`${corner} left-0 top-0`} style={{ borderColor: BLUE, background: pane === "show" ? `${BLUE}26` : "#111" }}>
            <CalendarDays className="w-[30%] h-[30%]" style={{ color: BLUE }} />The show
          </button>
          <button type="button" onClick={() => setPane("question")} aria-pressed={pane === "question"} className={`${corner} right-0 top-0`} style={{ borderColor: BLUE, background: pane === "question" ? `${BLUE}26` : "#111" }}>
            <MessageSquare className="w-[30%] h-[30%]" style={{ color: BLUE }} />Ask
          </button>
          <button type="button" onClick={send} disabled={preview || submitted || status === "saving"} aria-label={submitted ? "Sent to the venue" : "Send to the venue"} className={`${corner} right-0 bottom-0 disabled:cursor-default`}
            style={submitted ? { borderColor: GREEN, background: `${GREEN}22`, color: GREEN } : reqLeft ? { borderColor: "#444", borderStyle: "dashed", background: "#111", color: "rgba(255,255,255,0.55)" } : { borderColor: GREEN, background: GREEN, color: "#0d0d0d", boxShadow: `0 0 14px ${GREEN}80` }}>
            {submitted ? <CheckCircle className="w-[30%] h-[30%]" /> : <Send className="w-[30%] h-[30%]" />}{submitted ? "Sent" : "Send"}
          </button>
          {asks.map((a, i) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
            const ok = isAnswered(a, answers[a.key]);
            const on = pane === `ask:${a.key}`;
            const dot = ok ? GREEN : a.required ? AMBER : "#555";
            return (
              <button key={a.key} type="button" onClick={() => setPane(`ask:${a.key}`)} aria-pressed={on} aria-label={`${a.label}, ${ok ? "done" : a.required ? "needed" : "optional"}`}
                className="absolute rounded-full flex flex-col items-center justify-center gap-[3px] p-0 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${50 + 37 * Math.cos(ang)}%`, top: `${50 + 37 * Math.sin(ang)}%`, width: `${nodeSize}%`, height: `${nodeSize}%`, background: on ? RED : "#151515", color: on ? "#0d0d0d" : "#f2f2f2", border: `1.5px solid ${on ? RED : ok ? `${GREEN}8c` : `${RED}73`}`, boxShadow: on ? `0 0 16px ${RED}8c` : "none" }}>
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: on ? "#0d0d0d" : dot }} />
                <span className="text-[10px] sm:text-[12px] font-bold leading-[1.05] text-center px-1 line-clamp-2">{shortLabel(a.label)}</span>
              </button>
            );
          })}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[29%] aspect-square rounded-full border-2 flex flex-col items-center justify-center gap-0.5 px-2 text-center" style={{ borderColor: RED, background: "#1c1212", boxShadow: `0 0 26px ${RED}59` }}>
            <span className="text-[17px] sm:text-[24px] font-bold leading-none break-words max-w-full" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: RED }}>{actName.toUpperCase()}</span>
            <span className="text-[9px] sm:text-[10.5px] tracking-[0.1em] text-white/65" style={mono}>YOUR WEB</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex justify-center lg:justify-start gap-3.5 text-[11.5px] text-white/60">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />Done</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: AMBER }} />Needed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#555]" />Optional</span>
          </div>

          {cur && (
            <div className="rounded-[16px] border border-[#262626] bg-[#151515] p-4 sm:p-5 flex flex-col gap-3 shadow-[0_16px_36px_rgba(0,0,0,0.5)]">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {(() => { const ok = isAnswered(cur, answers[cur.key]); return <div className="text-[10.5px] tracking-[0.12em]" style={{ ...mono, color: ok ? GREEN : cur.required ? AMBER : "rgba(255,255,255,0.55)" }}>{ok ? "DONE" : cur.required ? `${(info.venue || "THE VENUE").toUpperCase()} NEEDS THIS` : "OPTIONAL"}</div>; })()}
                  <div className="text-[22px] font-bold leading-tight">{cur.label}</div>
                </div>
                <span className="text-[11px] text-white/55 pt-1" style={mono}>{curIdx + 1} / {N}</span>
              </div>
              {cur.hint && cur.type !== "yesno" && <p className="text-[13.5px] text-white/60 -mt-1.5">{cur.hint}</p>}
              <div>
                {cur.type === "text" && <input value={answers[cur.key] || ""} onChange={(e) => setAnswer(cur.key, e.target.value)} className={inputCls} aria-label={cur.label} autoFocus />}
                {cur.type === "longtext" && <textarea value={answers[cur.key] || ""} onChange={(e) => setAnswer(cur.key, e.target.value)} rows={5} className={`${inputCls} py-2`} aria-label={cur.label} autoFocus />}
                {cur.type === "file" && <FileAsk code={code} value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
                {cur.type === "yesno" && <YesNoAsk hint={cur.hint} value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
                {cur.type === "inputs" && <InputsAsk code={code} value={answers[cur.key]} onChange={(v) => setAnswer(cur.key, v)} />}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => goAsk(-1)} aria-label="Previous circle" className="w-[52px] min-h-[52px] rounded-[12px] border border-[#2a2a2a] flex items-center justify-center text-white/80"><ChevronLeft className="w-5 h-5" /></button>
                <button type="button" onClick={saveNext} className="flex-1 min-h-[52px] rounded-[12px] font-bold text-[16px]" style={{ background: RED, color: "#0d0d0d" }}>Save, next circle</button>
              </div>
            </div>
          )}

          {pane === "start" && (
            <div className="rounded-[16px] border border-[#262626] bg-[#151515] p-5 flex flex-col gap-2 text-center lg:text-left">
              {info.message && <p className="text-[15px] text-white/80 whitespace-pre-wrap pb-2 border-b border-[#242424] mb-1">{info.message}</p>}
              <span className="text-[17px] font-bold">{N ? "Tap a circle to fill it in" : "Nothing to fill in"}</span>
              <span className="text-[14px] text-white/60 leading-relaxed">{N ? `Orange ones are what ${info.venue || "the venue"} needs. When they're all green, tap Send.` : "Tap The show for the details."}</span>
              {N > 0 && <button type="button" onClick={() => setPane(`ask:${(missing[0] || asks[0]).key}`)} className="mt-2 self-center lg:self-start min-h-[48px] px-5 rounded-[12px] font-bold text-[15px]" style={{ background: RED, color: "#0d0d0d" }}>Start with {shortLabel((missing[0] || asks[0]).label)}</button>}
            </div>
          )}

          {pane === "show" && (
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
          )}

          {pane === "question" && (
            <div className={card}>
              <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-white/50" /><span className="text-[15px] font-semibold">Something not here?</span></div>
              <p className="text-[13px] text-white/50 mt-0.5">Ask {info.venue || "the venue"}. It goes on the event, not in email.</p>
              {(answers.__questions || []).map((q, i) => <p key={i} className="mt-2 text-[14px] text-white/75 bg-[#101010] border border-[#242424] rounded-[10px] px-3 py-2">You: {q.text}</p>)}
              <div className="mt-2 flex gap-2">
                <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendQuestion(); }} placeholder="Write a question" className={inputCls} autoFocus />
                <button type="button" onClick={sendQuestion} disabled={preview || !question.trim()} className="min-h-[44px] px-4 rounded-[10px] font-bold text-[14px] disabled:opacity-40" style={{ background: BLUE, color: "#0d0d0d" }}>Ask</button>
              </div>
            </div>
          )}

          {submitted ? (
            <p className="text-[13.5px] text-center lg:text-left" style={{ color: GREEN }}>Sent to {info.venue || "the venue"}. You can still change anything; it saves as you go.</p>
          ) : reqLeft ? (
            <p className="text-[13px] text-white/50 text-center lg:text-left">{reqLeft} needed before you send.</p>
          ) : (
            <button type="button" onClick={send} disabled={preview || status === "saving"} className="min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: GREEN, color: "#0d0d0d" }}><Send className="w-4 h-4" />Send to {info.venue || "the venue"}</button>
          )}
          <button type="button" onClick={() => setUnlocked(false)} className="self-center lg:self-start text-[12.5px] text-white/45 underline min-h-[40px]">Not {actName}? Change the name</button>
        </div>
      </div>
    </Shell>
  );
}
