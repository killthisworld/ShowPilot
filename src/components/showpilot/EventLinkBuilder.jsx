import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Check, Copy, Plus, Trash2, ChevronDown, Pencil, Upload, Eye } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { ASK_TYPES, DEFAULT_ASKS, buildBlocks, eventLinkUrl, isAnswered, saveEventLink, useEventLink } from "@/lib/eventLink";

// The venue's event link (job 176): choose what acts see, set the checklist,
// copy the link, then watch answers arrive. Lives in the venue's event tabs.
const G = "#8CFF3D";
const AMBER = "#FF6A00";
const mono = { fontFamily: SCENE_MONO };
const labelCls = "text-[11px] tracking-[0.12em] text-white/50";
const box = "rounded-[12px] border border-[#2a2a2a] bg-[#101010]";
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40";

export function eventLinkState(data) {
  if (!data?.link) return "empty";
  const asks = data.link.asks || [];
  const rs = data.responses || [];
  if (!rs.length) return "partial";
  return rs.every((r) => asks.filter((a) => a.required).every((a) => isAnswered(a, r.answers?.[a.key]))) ? "done" : "partial";
}
export function eventLinkSummary(data) {
  if (!data?.link) return "One link per event, acts fill it in";
  const rs = data.responses || [];
  if (!rs.length) return "Link ready, nobody has opened it yet";
  const asks = (data.link.asks || []).filter((a) => a.required);
  const complete = rs.filter((r) => asks.every((a) => isAnswered(a, r.answers?.[a.key]))).length;
  return `${complete} of ${rs.length} acts complete`;
}

function Check1({ on, onChange, label, sub, color }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="w-full flex items-start gap-3 text-left min-h-[44px] py-1.5">
      <span className="mt-0.5 w-[22px] h-[22px] rounded-[6px] flex items-center justify-center shrink-0" style={{ background: on ? color : "transparent", border: on ? "none" : "1.5px solid #444" }}>{on && <Check className="w-4 h-4 text-[#0d0d0d]" strokeWidth={3} />}</span>
      <span className="min-w-0"><span className="block text-[15px]">{label}</span>{sub && <span className="block text-[13px] text-white/45 truncate">{sub}</span>}</span>
    </button>
  );
}

// What each question looks like to the act, empty (job 176).
const ASK_VERB = { file: "ACTS UPLOAD THIS", yesno: "ACTS PICK ONE", inputs: "ACTS FILL THIS IN", text: "ACTS FILL THIS IN", longtext: "ACTS FILL THIS IN" };
const dash = "border-[1.5px] border-dashed border-[#3a3a3a] rounded-[10px] text-[13px] text-white/45";
function BlankField({ ask }) {
  if (ask.type === "file") {
    return <span className={`${dash} h-[64px] flex items-center justify-center gap-2`}><Upload className="w-4 h-4" />{ask.hint && !/^upload$/i.test(ask.hint.trim()) ? `Goes here · ${ask.hint}` : "File goes here"}</span>;
  }
  if (ask.type === "yesno") {
    return (
      <span className="flex gap-2">
        <span className={`${dash} flex-1 h-[44px] flex items-center justify-center`}>Yes</span>
        <span className={`${dash} flex-1 h-[44px] flex items-center justify-center`}>No</span>
      </span>
    );
  }
  if (ask.type === "inputs") {
    return (
      <span className={`${dash} h-[64px] px-3 grid grid-cols-2 content-center gap-x-3 gap-y-1`}>
        <span>Member name</span><span>What they plug in</span><span>Member name</span><span>What they plug in</span>
      </span>
    );
  }
  return <span className={`${dash} ${ask.type === "longtext" ? "h-[64px] items-start pt-2.5" : "h-[44px] items-center"} px-3 flex`}><span className="truncate">{ask.hint || "Their answer"}</span></span>;
}

function Responses({ data, color, shareToken, onTask }) {
  const asks = data.link.asks || [];
  const rs = data.responses || [];
  const [open, setOpen] = useState(null);
  if (!rs.length) return <p className="text-[15px] text-white/50">Nobody has opened the link yet. Copy it above and send it to the acts.</p>;
  return (
    <div className="flex flex-col gap-2">
      {rs.map((r) => {
        const miss = asks.filter((a) => !isAnswered(a, r.answers?.[a.key]));
        const missReq = miss.filter((a) => a.required);
        const qs = r.answers?.__questions || [];
        const isOpen = open === r.id;
        return (
          <div key={r.id} className={box} style={{ borderColor: missReq.length ? `${AMBER}55` : `${G}55` }}>
            <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[52px] text-left">
              <span className="flex-1 min-w-0"><span className="block text-[16px] font-semibold truncate">{r.act_name || "Unnamed act"}</span>
                <span className="block text-[13px]" style={{ color: missReq.length ? AMBER : G }}>{missReq.length ? `${missReq.length} needed` : "Everything required is in"}{qs.length ? ` · ${qs.length} question${qs.length > 1 ? "s" : ""}` : ""}{!r.submitted_at ? " · not sent yet" : ""}</span></span>
              <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="px-3.5 pb-3.5 flex flex-col gap-2 border-t border-[#1f1f1f] pt-3">
                {asks.map((a) => {
                  const ans = r.answers?.[a.key];
                  const ok = isAnswered(a, ans);
                  return (
                    <div key={a.key} className="flex items-start gap-3">
                      <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ok ? G : a.required ? AMBER : "#444" }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold">{a.label}</div>
                        {ok ? <AnswerView ask={a} ans={ans} color={color} /> : (
                          <div className="flex items-center gap-2 flex-wrap"><span className="text-[13.5px] text-white/40">Not answered</span>
                            <button type="button" onClick={() => onTask(`${r.act_name || "Act"}: please send ${a.label.toLowerCase()}`)} className="min-h-[44px] px-2 text-[13px] font-semibold underline" style={{ color }}>Make it a task</button></div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {qs.length > 0 && (
                  <div className="mt-1 border-t border-[#1f1f1f] pt-2 flex flex-col gap-1.5">
                    <span className={labelCls} style={mono}>QUESTIONS FROM THEM</span>
                    {qs.map((q, i) => (
                      <div key={i} className="flex items-start gap-2"><p className="flex-1 text-[14px] text-white/85">{q.text}</p>
                        <button type="button" onClick={() => onTask(`${r.act_name || "Act"} asks: ${q.text}`)} className="min-h-[44px] px-2 text-[13px] font-semibold underline shrink-0" style={{ color }}>Make it a task</button></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnswerView({ ask, ans, color }) {
  if (ask.type === "file") return <a href={ans.url} target="_blank" rel="noreferrer" className="text-[14px] underline break-all" style={{ color }}>{ans.name || "File"}</a>;
  if (ask.type === "yesno") return <p className="text-[14px] text-white/80">{ans.value === "yes" ? "Yes" : "No"}{ans.note ? ` · ${ans.note}` : ""}</p>;
  if (ask.type === "inputs") {
    return (
      <div className="text-[14px] text-white/80">
        {(ans.members || []).filter((m) => m.name).map((m, i) => <div key={i}>{m.name}{m.plays ? ` · ${m.plays}` : ""}</div>)}
        {(ans.files || []).map((f, i) => <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block underline break-all" style={{ color }}>{f.name}</a>)}
      </div>
    );
  }
  return <p className="text-[14px] text-white/80 whitespace-pre-wrap">{String(ans)}</p>;
}

export default function EventLinkBuilder({ gig, biz, run, color = "#60A5FA", shareToken, editable = true }) {
  const { data, reload } = useEventLink(gig.id, !!gig.id);
  const link = data?.link || null;
  const fresh = useMemo(() => buildBlocks(gig, biz?.deal, run), [gig, biz, run]);
  const [blocks, setBlocks] = useState(null);
  const [asks, setAsks] = useState(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [taskMsg, setTaskMsg] = useState("");
  const [openAsk, setOpenAsk] = useState(null);

  // Start the editor from the saved link, or from the event's info.
  useEffect(() => {
    if (!data || blocks) return;
    if (link) {
      const saved = new Set((link.blocks || []).map((b) => b.key));
      const merged = [...(link.blocks || []).map((b) => ({ ...b, on: true })), ...fresh.filter((b) => !saved.has(b.key)).map((b) => ({ ...b, on: false }))];
      setBlocks(merged); setAsks(link.asks || []); setMessage(link.message || "");
    } else {
      setBlocks(fresh); setAsks(DEFAULT_ASKS); setMessage("");
      setEditing(true);
    }
  }, [data, link, fresh, blocks]);

  if (!data) return <p className="text-white/45 text-[15px]">Loading…</p>;
  if (!data.can_view) return <p className="text-white/55 text-[15px]">Only the venue side of this event can send the link.</p>;
  if (!blocks || !asks) return null;

  const url = link ? eventLinkUrl(link.code) : "";
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} };
  const setBlock = (i, patch) => setBlocks(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const setAsk = (i, patch) => setAsks(asks.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const addAsk = () => { const key = `q_${Date.now().toString(36)}`; setAsks([...asks, { key, label: "", type: "text", required: false, hint: "" }]); setOpenAsk(key); };

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await saveEventLink(gig.id, { blocks, asks: asks.filter((a) => a.label.trim()), message });
      await reload();
      setEditing(false);
    } catch (e) { console.error(e); setErr(e.message || "Couldn't save the link."); }
    setSaving(false);
  };

  const makeTask = async (title) => {
    if (!shareToken) return;
    const { error } = await supabase.rpc("add_gig_task", { p_token: shareToken, p_section: "venue", p_title: title });
    setTaskMsg(error ? "Couldn't add the task." : "Added to this event's tasks.");
    setTimeout(() => setTaskMsg(""), 3000);
  };

  return (
    <div className="flex flex-col gap-4">
      {link && (
        <div className="rounded-[14px] border p-4 flex flex-col gap-3" style={{ borderColor: `${color}55`, background: "#141414" }}>
          <span className={labelCls} style={mono}>YOUR LINK</span>
          <div className="px-3 py-3 rounded-[10px] bg-[#0d0d0d] border border-[#2a2a2a] text-[14px] break-all" style={{ ...mono, color }}>{url.replace(/^https?:\/\//, "")}</div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={copy} className="flex-1 min-w-[140px] min-h-[48px] rounded-[10px] font-bold text-[15px] flex items-center justify-center gap-2" style={{ background: color, color: "#0d0d0d" }}><Copy className="w-4 h-4" />{copied ? "Copied" : "Copy link"}</button>
            <a href={`mailto:?subject=${encodeURIComponent(`${gig.event_name || gig.band_name || "Show"} at ${gig.venue || "the venue"}`)}&body=${encodeURIComponent(`Everything for the show, and a short form to fill in:\n${url}`)}`} className="flex-1 min-w-[140px] min-h-[48px] rounded-[10px] font-semibold text-[15px] flex items-center justify-center border" style={{ color, borderColor: `${color}66` }}>Email it</a>
          </div>
        </div>
      )}

      {link && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3"><span className={`${labelCls} flex-1`} style={mono}>RESPONSES</span>{taskMsg && <span className="text-[13px]" style={{ color: G }}>{taskMsg}</span>}</div>
          <Responses data={data} color={color} shareToken={shareToken} onTask={makeTask} />
        </div>
      )}

      {link && !editing && editable && (
        <button type="button" onClick={() => setEditing(true)} className="self-start min-h-[44px] px-4 rounded-[10px] border border-[#2a2a2a] text-[15px] font-semibold text-white/80">Change what acts see and are asked</button>
      )}

      {editing && editable && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-[#2a2a2a] bg-[#141414] p-4">
            <div className="text-[18px] font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>1. What acts see</div>
            <p className="text-[13.5px] text-white/50 mb-2">Built from this event. Edit any wording; acts see exactly this text.</p>
            {blocks.map((b, i) => (
              <div key={b.key} className="border-b border-[#1f1f1f] last:border-0">
                <Check1 on={b.on !== false} onChange={(v) => setBlock(i, { on: v })} label={b.title} sub={b.on !== false ? null : b.body.split("\n")[0]} color={color} />
                {b.on !== false && <textarea value={b.body} onChange={(e) => setBlock(i, { body: e.target.value })} rows={Math.min(6, b.body.split("\n").length + 1)} className={`${inputCls} py-2 mb-2`} />}
              </div>
            ))}
            {blocks.length === 0 && <p className="text-[14px] text-white/45">Nothing filled in on this event yet. Add times, load-in and the deal on its pages and they show up here.</p>}
            <label className="block mt-3"><span className={labelCls} style={mono}>NOTE AT THE TOP (OPTIONAL)</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Hi, here's everything for the show. Fill in the form at the bottom." className={`${inputCls} py-2 mt-1.5`} /></label>
          </div>

          <div className="rounded-[14px] border border-[#2a2a2a] bg-[#141414] p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="text-[18px] font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>2. Questions for each act</div>
                <p className="text-[13.5px] text-white/50">Acts fill these in on their page. You only pick the questions; the boxes stay empty until an act answers.</p>
              </div>
              {link ? (
                <a href={`${url}?preview=1`} target="_blank" rel="noreferrer" className="min-h-[44px] px-3.5 rounded-[10px] border flex items-center gap-2 text-[14px] font-semibold" style={{ color, borderColor: `${color}66` }}>
                  <Eye className="w-4 h-4" /> Preview as an act
                </a>
              ) : (
                <span className="min-h-[44px] px-3.5 rounded-[10px] border border-[#2a2a2a] flex items-center gap-2 text-[13px] text-white/40"><Eye className="w-4 h-4" /> Preview once the link is made</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {asks.map((a, i) => {
                const isOpen = openAsk === a.key;
                const tag = <span className="text-[10px] tracking-[0.1em]" style={{ ...mono, color: a.required ? AMBER : "rgba(255,255,255,0.45)" }}>{a.required ? "REQUIRED" : "OPTIONAL"}</span>;
                if (!isOpen) {
                  // Shown as the empty field the act will get (job 176): it
                  // gets filled in on their page, not here. Tap to change it.
                  return (
                    <button key={a.key} type="button" onClick={() => setOpenAsk(a.key)} aria-label={`Change the question: ${a.label || "New question"}`} className={`${box} p-3 text-left flex flex-col gap-2`}>
                      <span className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{a.label || "New question"}</span>
                        {tag}
                        <span className="w-8 h-8 shrink-0 rounded-lg border border-[#2a2a2a] flex items-center justify-center text-white/70"><Pencil className="w-3.5 h-3.5" /></span>
                      </span>
                      <span className="text-[10px] tracking-[0.12em] text-white/45" style={mono}>{ASK_VERB[a.type] || "ACTS FILL THIS IN"}</span>
                      <BlankField ask={a} />
                    </button>
                  );
                }
                return (
                  <div key={a.key} className={`${box} p-3 flex flex-col gap-2 sm:col-span-2`} style={{ borderColor: color }}>
                    <div className="flex gap-2 items-center">
                      <input value={a.label} onChange={(e) => setAsk(i, { label: e.target.value })} placeholder="What you need" className={inputCls} aria-label="Ask" autoFocus />
                      <button type="button" onClick={() => { setAsks(asks.filter((_, idx) => idx !== i)); setOpenAsk(null); }} aria-label="Remove" className="min-h-[44px] w-[44px] flex items-center justify-center text-white/35 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <select value={a.type} onChange={(e) => setAsk(i, { type: e.target.value })} className={`${inputCls} !w-auto`} aria-label="Type">{Object.entries(ASK_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
                      <button type="button" onClick={() => setAsk(i, { required: !a.required })} className="min-h-[44px] px-3 rounded-lg border text-[12px] tracking-[0.1em]" style={{ ...mono, color: a.required ? AMBER : "rgba(255,255,255,0.5)", borderColor: a.required ? `${AMBER}66` : "#2a2a2a" }}>{a.required ? "REQUIRED" : "OPTIONAL"}</button>
                      <button type="button" onClick={() => setOpenAsk(null)} className="min-h-[44px] px-3 rounded-lg text-[14px] font-semibold ml-auto" style={{ color }}>Done</button>
                    </div>
                    <input value={a.hint || ""} onChange={(e) => setAsk(i, { hint: e.target.value })} placeholder="Hint (size, format, what you want)" className={inputCls} aria-label="Hint" />
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addAsk} className="mt-3 min-h-[44px] px-3 rounded-lg border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5" style={{ color }}><Plus className="w-4 h-4" />Add your own question</button>
          </div>

          {err && <p className="text-[14px]" style={{ color: AMBER }}>{err}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="flex-1 min-h-[52px] rounded-[12px] font-bold text-[16px] disabled:opacity-60" style={{ background: link ? color : G, color: "#0d0d0d" }}>{saving ? "Saving…" : link ? "Save changes" : "Create the link"}</button>
            {link && <button type="button" onClick={() => { setBlocks(null); setEditing(false); }} className="min-h-[52px] px-5 rounded-[12px] border border-[#2a2a2a] font-semibold text-white/70">Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}
