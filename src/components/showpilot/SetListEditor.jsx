import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardList, Plus, X } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Set list (job 313), on the Artist and Manager profiles of an event. One
// list per act on the event, songs in order, each with an optional note
// (key, tuning, segue, who sings). Saved in manager_info.setlists:
//   [{ act: "Creek n Woodz", songs: [{ id, title, notes }] }]
// Create PDFs makes the printable copy from it.
const uid = () => Math.random().toString(36).slice(2, 9);
// A break between songs (job 315): a stop, so the DJ (and the band) know not
// to go straight into the next song. { id, kind: "break", title, notes }. It
// isn't numbered, so songs keep their numbers around it.
export const isBreak = (x) => x?.kind === "break";
export const songCount = (songs) => (songs || []).filter((x) => !isBreak(x) && String(x.title || "").trim()).length;
export const setlistFor = (setlists, act) => (Array.isArray(setlists) ? setlists : []).find((s) => s.act === act)?.songs || [];

export default function SetListEditor({ acts = [], setlists, onChange, editable = true, color = "#F87171" }) {
  const list = Array.isArray(setlists) ? setlists : [];
  const names = acts.length ? acts : ["Our set"];
  const [act, setAct] = useState(names[0]);
  useEffect(() => { if (!names.includes(act)) setAct(names[0]); }, [names.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const songs = setlistFor(list, act);
  const put = (next) => {
    const others = list.filter((s) => s.act !== act);
    onChange([...others, { act, songs: next }]);
  };
  const setSong = (i, k, v) => put(songs.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= songs.length) return;
    const next = [...songs]; [next[i], next[j]] = [next[j], next[i]]; put(next);
  };
  const addPasted = () => {
    const lines = pasted.split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)-]?\s*/, "").trim()).filter(Boolean).slice(0, 80);
    if (lines.length) put([...songs, ...lines.map((t) => ({ id: uid(), title: t.slice(0, 120), notes: "" }))]);
    setPasted(""); setPasting(false);
  };

  const field = "h-10 px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40 disabled:opacity-60 min-w-0";
  return (
    <div className="flex flex-col gap-3">
      {names.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Act">
          {names.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={act === n} onClick={() => setAct(n)}
              className="px-3 py-1.5 rounded-full text-[14px] font-bold"
              style={act === n ? { background: color, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.75)", border: "1px solid #333" }}>
              {n} <span className="opacity-70 font-semibold">{songCount(setlistFor(list, n)) || ""}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-[#111] border border-[#1f1f1f] rounded-xl overflow-hidden divide-y divide-[#1a1a1a]">
        {songs.length === 0 && <p className="px-4 py-4 text-[15px] text-white/45">No songs yet. Add them one at a time, or paste the whole list.</p>}
        {(() => { let num = 0; return songs.map((s, i) => {
          const brk = isBreak(s);
          if (!brk) num += 1;
          return (
          <div key={s.id || i} className="flex items-start gap-2 px-3 py-2.5" style={brk ? { background: `${color}12` } : undefined}>
            {brk
              ? <span className="w-7 shrink-0 pt-2 text-right text-[18px] font-bold leading-none" style={{ color }} aria-hidden="true">—</span>
              : <span className="w-7 shrink-0 pt-2.5 text-right text-[15px] font-bold" style={{ fontFamily: SCENE_MONO, color }}>{num}</span>}
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row gap-2">
              <input className={`${field} flex-[2] ${brk ? "font-bold uppercase tracking-[0.06em]" : ""}`} value={s.title || ""} onChange={(e) => setSong(i, "title", e.target.value)} disabled={!editable}
                placeholder={brk ? "Break" : "Song"} aria-label={brk ? "Break label" : `Song ${num}`} maxLength={120} style={brk ? { color } : undefined} />
              <input className={`${field} flex-1 text-[15px]`} value={s.notes || ""} onChange={(e) => setSong(i, "notes", e.target.value)} disabled={!editable}
                placeholder={brk ? "Cue for the DJ, e.g. stop, talk, count in" : "Note: key, tuning, segue"} aria-label={brk ? "Break cue" : `Note for song ${num}`} maxLength={120} />
            </div>
            {editable && (
              <div className="flex items-center shrink-0 pt-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 text-white/45 hover:text-white disabled:opacity-20"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === songs.length - 1} aria-label="Move down" className="p-1.5 text-white/45 hover:text-white disabled:opacity-20"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => put(songs.filter((_, j) => j !== i))} aria-label={`Remove ${brk ? "break" : s.title || "song"}`} className="p-1.5 text-white/35 hover:text-[#FF8A8A]"><X className="w-4 h-4" /></button>
              </div>
            )}
          </div>
          );
        }); })()}
      </div>

      {editable && (pasting ? (
        <div className="flex flex-col gap-2">
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={7} autoFocus placeholder={"One song per line\nNumbers at the start are fine"} aria-label="Paste songs"
            className="w-full px-3 py-2 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40 resize-y" />
          <div className="flex gap-2">
            <button type="button" onClick={addPasted} className="px-4 py-2 rounded-lg text-[15px] font-bold text-[#0d0d0d]" style={{ background: color }}>Add these songs</button>
            <button type="button" onClick={() => { setPasting(false); setPasted(""); }} className="px-3 py-2 text-[15px] text-white/60 hover:text-white">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => put([...songs, { id: uid(), title: "", notes: "" }])} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[15px] font-bold" style={{ border: `1px dashed ${color}88`, color }}>
            <Plus className="w-4 h-4" /> Add a song
          </button>
          <button type="button" onClick={() => put([...songs, { id: uid(), kind: "break", title: "Break", notes: "" }])} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[15px] font-semibold border" style={{ color, borderColor: `${color}55` }}>
            <span aria-hidden="true" className="font-bold">—</span> Add a break
          </button>
          <button type="button" onClick={() => setPasting(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[15px] font-semibold text-white/75 border border-[#333] hover:text-white">
            <ClipboardList className="w-4 h-4" /> Paste a list
          </button>
        </div>
      ))}
    </div>
  );
}
