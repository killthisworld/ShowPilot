import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Plus, Trash2, Upload, Send, MessageSquare } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { fetchPublicLink, getStoredToken, isAnswered, saveResponse, uploadActFile } from "@/lib/eventLink";

// Public page an act opens from the venue's event link (/v/<code>). No account:
// answers save to a private response token kept in this browser. Job 176.
const BLUE = "#60A5FA";
const GREEN = "#8CFF3D";
const AMBER = "#FF6A00";
const mono = { fontFamily: SCENE_MONO };
const card = "rounded-[14px] border border-[#2a2a2a] bg-[#141414] p-4";
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40";

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-xl mx-auto px-4 pt-5 pb-28 flex flex-col gap-3">
        <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>
        {children}
      </div>
    </div>
  );
}

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
    try { onChange(await uploadActFile(code, f)); } catch (x) { console.error(x); setErr("Couldn't upload that file. Try again."); }
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
    for (const f of list) { try { added.push(await uploadActFile(code, f)); } catch (x) { console.error(x); } }
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
  const [info, setInfo] = useState(undefined); // undefined loading, null not found
  const [actName, setActName] = useState("");
  const [answers, setAnswers] = useState({});
  const [token, setToken] = useState(() => getStoredToken(code));
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState(""); // "", saving, saved, error
  const [question, setQuestion] = useState("");
  const dirty = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let live = true;
    fetchPublicLink(code, getStoredToken(code)).then((d) => {
      if (!live) return;
      setInfo(d || null);
      if (d?.response) {
        setActName(d.response.act_name || "");
        setAnswers(d.response.answers || {});
        setSubmitted(!!d.response.submitted_at);
      }
    }).catch((e) => { console.error(e); if (live) setInfo(null); });
    return () => { live = false; };
  }, [code]);

  const persist = useCallback(async (name, ans, submit = false) => {
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
  }, [code]);

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

  const sendQuestion = async () => {
    const q = question.trim();
    if (!q || !actName.trim()) return;
    const next = { ...answers, __questions: [...(answers.__questions || []), { text: q, at: new Date().toISOString() }] };
    setAnswers(next);
    setQuestion("");
    await persist(actName, next);
  };

  return (
    <Shell>
      <div className="rounded-[14px] border border-[#2a2a2a] bg-[#141414] p-4" style={{ borderTop: `3px solid ${BLUE}` }}>
        {info.venue && <div className="text-[11px] tracking-[0.1em]" style={{ ...mono, color: BLUE }}>{String(info.venue).toUpperCase()}</div>}
        <h1 className="mt-1.5 text-[30px] leading-[1.05] font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{info.title || "Event"}</h1>
        <p className="mt-1 text-[14px] text-white/60">{[fmtDay(info.date), info.place].filter(Boolean).join(" · ")}</p>
      </div>

      {info.message && <div className={card}><p className="text-[15px] text-white/80 whitespace-pre-wrap">{info.message}</p></div>}

      {(info.blocks || []).map((b) => (
        <div key={b.key} className={card}>
          <div className="text-[11px] tracking-[0.12em] text-white/50" style={mono}>{String(b.title || "").toUpperCase()}</div>
          <p className="mt-2 text-[15px] text-white/85 whitespace-pre-wrap leading-relaxed">{b.body}</p>
        </div>
      ))}

      {asks.length > 0 && (
        <>
          <div className="mt-2 flex items-end gap-3">
            <div className="flex-1"><h2 className="text-[24px] font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>What we need from you</h2><p className="text-[13.5px] text-white/50">Answer once. It saves as you go.</p></div>
            <span className="text-[11px] tracking-[0.1em] text-white/50 pb-1" style={mono}>{done} OF {asks.length}</span>
          </div>

          <div className={card}>
            <label className="text-[13px] text-white/60">Your band name</label>
            <input value={actName} onChange={(e) => { dirty.current = true; setActName(e.target.value); }} placeholder="Band name" className={`${inputCls} mt-1.5`} />
          </div>

          {asks.map((a) => {
            const ok = isAnswered(a, answers[a.key]);
            return (
              <div key={a.key} className="rounded-[14px] bg-[#141414] p-4 border" style={{ borderColor: ok ? `${GREEN}55` : a.required ? `${AMBER}66` : "#2a2a2a" }}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[15px] font-semibold">{a.label}</span>
                  <span className="text-[10px] tracking-[0.1em]" style={{ ...mono, color: ok ? GREEN : a.required ? AMBER : "rgba(255,255,255,0.4)" }}>{ok ? "DONE" : a.required ? "NEEDED" : "OPTIONAL"}</span>
                </div>
                {a.hint && a.type !== "yesno" && <p className="text-[13px] text-white/45 mt-0.5">{a.hint}</p>}
                <div className="mt-3">
                  {a.type === "text" && <input value={answers[a.key] || ""} onChange={(e) => setAnswer(a.key, e.target.value)} className={inputCls} />}
                  {a.type === "longtext" && <textarea value={answers[a.key] || ""} onChange={(e) => setAnswer(a.key, e.target.value)} rows={3} className={`${inputCls} py-2`} />}
                  {a.type === "file" && <FileAsk code={code} value={answers[a.key]} onChange={(v) => setAnswer(a.key, v)} />}
                  {a.type === "yesno" && <YesNoAsk hint={a.hint} value={answers[a.key]} onChange={(v) => setAnswer(a.key, v)} />}
                  {a.type === "inputs" && <InputsAsk code={code} value={answers[a.key]} onChange={(v) => setAnswer(a.key, v)} />}
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className={card}>
        <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-white/50" /><span className="text-[15px] font-semibold">Something not here?</span></div>
        <p className="text-[13px] text-white/50 mt-0.5">Ask the venue. It goes on the event, not in email.</p>
        {(answers.__questions || []).map((q, i) => <p key={i} className="mt-2 text-[14px] text-white/75 bg-[#101010] border border-[#242424] rounded-[10px] px-3 py-2">You: {q.text}</p>)}
        <div className="mt-2 flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={actName.trim() ? "Write a question" : "Add your band name first"} disabled={!actName.trim()} className={inputCls} />
          <button type="button" onClick={sendQuestion} disabled={!question.trim() || !actName.trim()} className="min-h-[44px] px-4 rounded-[10px] font-bold text-[14px] disabled:opacity-40" style={{ background: BLUE, color: "#0d0d0d" }}>Ask</button>
        </div>
      </div>

      <div className="fixed left-0 right-0 bottom-0 bg-[#0d0d0d]/95 border-t border-[#2a2a2a] px-4 pt-3 pb-5">
        <div className="max-w-xl mx-auto flex flex-col gap-1.5">
          {submitted ? (
            <div className="min-h-[52px] rounded-[12px] flex items-center justify-center gap-2 font-bold text-[15px]" style={{ background: `${GREEN}22`, color: GREEN }}><CheckCircle className="w-5 h-5" />Sent to the venue. You can still make changes.</div>
          ) : (
            <button type="button" disabled={!actName.trim() || status === "saving"} onClick={() => persist(actName, answers, true)} className="min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: GREEN, color: "#0d0d0d" }}><Send className="w-4 h-4" />Send to venue</button>
          )}
          <p className="text-center text-[12px] text-white/40" style={mono}>
            {status === "saving" ? "SAVING…" : status === "error" ? "COULDN'T SAVE, TRY AGAIN" : status === "saved" ? "SAVED" : !actName.trim() ? "ADD YOUR BAND NAME TO START" : ""}
            {!submitted && missing.length > 0 && status !== "saving" ? `${status ? " · " : ""}${missing.length} NEEDED` : ""}
          </p>
        </div>
      </div>
    </Shell>
  );
}
