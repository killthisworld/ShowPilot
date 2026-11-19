import React, { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { CUE_COLORS, CUE_FEELS, CUE_LOOKS, CUE_MOMENTS, newCue, newSong, normalizeCueSheet } from "@/lib/cueSheet";

// The lighting cue sheet (job 377): the set song by song, each with its
// feel, tempo, main color and cues ("Chorus -> full wash, red"). The act
// fills it on an LD's intake or uploads their own; the LD opens and edits it
// on the event. value / onChange(sheet); onUpload(file) -> url; readOnly.
const inputCls = "w-full min-h-[44px] rounded-[10px] bg-[#0b0b0b] border border-[#262626] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30";
const mono = { fontFamily: SCENE_MONO };

function Swatches({ value, onChange, size = 26, label }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={label}>
      {CUE_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(value === c ? "" : c)} aria-label={`${label} ${c}`} aria-pressed={value === c}
          className="rounded-full border-2 shrink-0" style={{ width: size, height: size, background: c, borderColor: value === c ? "#fff" : "transparent", opacity: value && value !== c ? 0.45 : 1 }} />
      ))}
    </div>
  );
}

function SongCard({ song, n, total, onChange, onMove, onRemove, readOnly, open, onToggle }) {
  const set = (p) => onChange({ ...song, ...p });
  const setCue = (k, p) => set({ cues: song.cues.map((q, j) => (j === k ? { ...q, ...p } : q)) });
  const accent = song.color || "#3a3a3a";
  const nextMoment = CUE_MOMENTS[Math.min(song.cues.length, CUE_MOMENTS.length - 1)];
  // The quick looks and colors show on the cue being worked on only.
  const [activeCue, setActiveCue] = useState(null);
  return (
    <div className="rounded-[12px] border bg-[#101010]" style={{ borderColor: song.color ? song.color + "99" : "#2a2a2a" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full min-h-[52px] px-3 flex items-center gap-2.5 text-left">
        <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold" style={{ background: accent, color: song.color ? "#0d0d0d" : "#fff" }}>{n}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-white text-[15px] font-semibold truncate">{song.title || <span className="text-white/35 italic font-normal">Song {n}</span>}</span>
          <span className="block text-white/45 text-[12px] truncate">
            {[song.feel, song.bpm ? `${song.bpm} BPM` : "", song.cues.length ? `${song.cues.length} cue${song.cues.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || (readOnly ? "No cues" : "Tap to add cues")}
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-white/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2.5">
          {readOnly ? null : (
            <div className="flex gap-2">
              <input value={song.title} onChange={(e) => set({ title: e.target.value })} placeholder="Song title" aria-label="Song title" className={inputCls + " font-semibold"} autoFocus={!song.title} />
              <input value={song.bpm} onChange={(e) => set({ bpm: e.target.value.replace(/[^0-9.]/g, "").slice(0, 5) })} placeholder="BPM" aria-label="BPM" inputMode="decimal" className={inputCls + " !w-[76px] shrink-0 text-center"} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.14em] text-white/40" style={mono}>FEEL</span>
            <div className="flex gap-1.5 flex-wrap">
              {CUE_FEELS.map((f) => {
                const on = song.feel === f;
                return <button key={f} type="button" disabled={readOnly} onClick={() => set({ feel: on ? "" : f })} aria-pressed={on}
                  className="min-h-[34px] px-3 rounded-full border text-[12.5px] font-semibold disabled:cursor-default"
                  style={on ? { borderColor: "#fff", background: "#fff", color: "#0d0d0d" } : { borderColor: "#333", color: "rgba(255,255,255,0.6)", opacity: readOnly ? 0.4 : 1 }}>{f}</button>;
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.14em] text-white/40" style={mono}>MAIN COLOR</span>
            {readOnly ? (song.color ? <span className="w-6 h-6 rounded-full" style={{ background: song.color }} /> : <span className="text-white/35 text-[13px]">Any</span>) : <Swatches value={song.color} onChange={(c) => set({ color: c })} label="Main color" />}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] tracking-[0.14em] text-white/40" style={mono}>CUES</span>
            {song.cues.map((q, k) => (
              <div key={q.id} onFocusCapture={() => setActiveCue(q.id)} onClick={() => setActiveCue(q.id)} className="rounded-[10px] border border-[#262626] bg-[#0b0b0b] p-2 flex flex-col gap-2" style={q.color ? { borderLeft: `4px solid ${q.color}` } : undefined}>
                <div className="flex items-center gap-1.5">
                  {readOnly ? (
                    <span className="text-[13px] font-semibold text-white min-w-[72px]">{q.at || "—"}</span>
                  ) : (
                    <select value={CUE_MOMENTS.includes(q.at) || !q.at ? q.at : "__custom"} onChange={(e) => setCue(k, { at: e.target.value === "__custom" ? " " : e.target.value })} aria-label="When"
                      className="min-h-[40px] rounded-lg bg-[#141414] border border-[#2a2a2a] px-2 text-[13.5px] text-white shrink-0">
                      <option value="">When…</option>
                      {CUE_MOMENTS.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="__custom">Time / other…</option>
                    </select>
                  )}
                  {!readOnly && !CUE_MOMENTS.includes(q.at) && q.at !== "" && (
                    <input value={q.at.trim() ? q.at : ""} onChange={(e) => setCue(k, { at: e.target.value || " " })} placeholder="e.g. 1:45" aria-label="When (time)" className={inputCls + " !min-h-[40px] !w-[90px] shrink-0 text-[13.5px]"} />
                  )}
                  {readOnly ? <span className="flex-1 text-[14px] text-white/85">{q.look || <span className="text-white/35">No look</span>}</span> : (
                    <input value={q.look} onChange={(e) => setCue(k, { look: e.target.value })} placeholder="The look (e.g. red wash, strobes)" aria-label="Look" className={inputCls + " !min-h-[40px] text-[14px]"} />
                  )}
                  {!readOnly && <button type="button" onClick={() => set({ cues: song.cues.filter((_, j) => j !== k) })} aria-label="Remove cue" className="w-9 h-10 shrink-0 flex items-center justify-center text-white/35 hover:text-red-400"><X className="w-4 h-4" /></button>}
                </div>
                {!readOnly && activeCue === q.id && (
                  <>
                    <div className="flex gap-1 flex-wrap">
                      {CUE_LOOKS.map((l) => (
                        <button key={l} type="button" onClick={() => setCue(k, { look: q.look.trim() ? (q.look.includes(l) ? q.look : `${q.look.trim()}, ${l.toLowerCase()}`) : l })}
                          className="min-h-[30px] px-2 rounded-full border border-[#2a2a2a] text-[11.5px] text-white/55 hover:text-white hover:border-white/40">{l}</button>
                      ))}
                    </div>
                    <Swatches value={q.color} onChange={(c) => setCue(k, { color: c })} size={22} label="Cue color" />
                  </>
                )}
              </div>
            ))}
            {!readOnly && (
              <button type="button" onClick={() => { const q = newCue(nextMoment); set({ cues: [...song.cues, q] }); setActiveCue(q.id); }} className="self-start min-h-[38px] px-3 rounded-full border border-dashed border-[#444] text-[13px] font-semibold flex items-center gap-1 text-[#8CFF3D]"><Plus className="w-3.5 h-3.5" />Cue</button>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2 pt-1">
              <button type="button" disabled={n === 1} onClick={() => onMove(-1)} aria-label="Move up" className="w-10 h-10 rounded-lg border border-[#2a2a2a] flex items-center justify-center text-white/55 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" disabled={n === total} onClick={() => onMove(1)} aria-label="Move down" className="w-10 h-10 rounded-lg border border-[#2a2a2a] flex items-center justify-center text-white/55 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={onRemove} className="ml-auto min-h-[40px] px-3 rounded-lg border border-[#2a2a2a] text-[13px] text-white/50 hover:text-red-400 flex items-center gap-1.5"><Trash2 className="w-4 h-4" />Remove song</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CueSheetEditor({ value, onChange, onUpload = null, readOnly = false, notesPlaceholder = "For the whole set: no strobes, haze is fine, keep it dark between songs…" }) {
  const sheet = normalizeCueSheet(value);
  const [openId, setOpenId] = useState(() => (sheet.songs.length === 1 ? sheet.songs[0].id : null));
  const [uploading, setUploading] = useState(false);
  const put = (p) => onChange?.({ ...sheet, ...p });
  const setSong = (i, s) => put({ songs: sheet.songs.map((x, j) => (j === i ? s : x)) });
  const move = (i, d) => {
    const l = [...sheet.songs];
    const [x] = l.splice(i, 1);
    l.splice(i + d, 0, x);
    put({ songs: l });
  };
  const addSong = () => { const s = newSong(); put({ songs: [...sheet.songs, s] }); setOpenId(s.id); };
  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !onUpload) return;
    setUploading(true);
    const added = [];
    for (const f of files) {
      try { added.push({ url: await onUpload(f), name: f.name, type: f.type }); } catch (err) { console.error(err); }
    }
    setUploading(false);
    if (added.length) put({ files: [...sheet.files, ...added] });
  };
  return (
    <div className="flex flex-col gap-2.5">
      {sheet.songs.map((s, i) => (
        <SongCard key={s.id} song={s} n={i + 1} total={sheet.songs.length} readOnly={readOnly}
          open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)}
          onChange={(x) => setSong(i, x)} onMove={(d) => move(i, d)} onRemove={() => put({ songs: sheet.songs.filter((_, j) => j !== i) })} />
      ))}
      {!readOnly && (
        <button type="button" onClick={addSong} className="min-h-[48px] rounded-[12px] border border-dashed border-[#3a3a3a] text-[14px] font-semibold flex items-center justify-center gap-1.5 text-white/75 hover:border-white/40">
          <Plus className="w-4 h-4" />{sheet.songs.length ? "Add the next song" : "Add your first song"}
        </button>
      )}
      {readOnly && !sheet.songs.length && <p className="text-white/40 text-[13.5px]">No songs yet.</p>}
      {/* Their own cue sheet or setlist, as files. */}
      {!readOnly && onUpload && (
        <label className="min-h-[48px] px-3 flex items-center justify-center gap-2 text-center border-[1.5px] border-dashed border-[#3a3a3a] rounded-[12px] text-white/65 text-[14px] cursor-pointer hover:border-white/40">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}Have a cue sheet or setlist? Upload it
          <input type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" multiple onChange={upload} className="hidden" />
        </label>
      )}
      {sheet.files.map((f, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-[#262626] bg-[#0b0b0b] px-3 py-2">
          <a href={f.url} target="_blank" rel="noreferrer" className="text-[13.5px] underline truncate text-[#8CFF3D]">{f.name || "Cue sheet"}</a>
          {!readOnly && <button type="button" onClick={() => put({ files: sheet.files.filter((_, j) => j !== i) })} aria-label="Remove file" className="min-h-[36px] w-[36px] flex items-center justify-center text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>}
        </div>
      ))}
      {readOnly ? (sheet.notes ? <p className="text-white/75 text-[14px] whitespace-pre-wrap rounded-lg border border-[#262626] bg-[#0b0b0b] px-3 py-2">{sheet.notes}</p> : null) : (
        <textarea value={sheet.notes} onChange={(e) => put({ notes: e.target.value })} rows={3} placeholder={notesPlaceholder} aria-label="Lighting notes" className={inputCls + " py-2 leading-relaxed"} />
      )}
    </div>
  );
}
