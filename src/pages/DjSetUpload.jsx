import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, AlertTriangle, Disc3, MoreHorizontal } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { inspectWav, describeWav, qualityWarning } from "@/lib/wav";
import { setUploadCall, uploadToDrive, DJ_COLOR } from "@/lib/djTools";
import { SEND_OFF_CSS, SendOffCenter, useSendOff } from "@/components/showpilot/IntakeKeyWeb";

const G = "#8CFF3D";
const AMBER = "#FF6A00";
const RED = "#F87171";
const field = "w-full bg-[#0d0d0d] border border-[#262626] rounded-lg px-3 py-2 text-white text-[15px] placeholder:text-white/25 outline-none focus:border-[#8CFF3D]/60";

let keySeq = 0;
const newTrack = (t = {}) => ({
  k: ++keySeq,
  title: t.title || "", artist: t.artist || "", bpm: t.bpm || "", key: t.key || "", notes: t.notes || "",
  file_id: t.file_id || null,
  up: { state: t.file_id ? "done" : "idle", pct: 0, msg: "" },
});
const titleFromFile = (name) => name.replace(/\.wav$/i, "").replace(/^\d+[\s._-]+/, "").replace(/_/g, " ").trim();

// The page an artist opens from the DJ's link: their set in play order,
// WAV files (checked to be real WAVs, quality shown) and a way to reach them.
// WAVs go straight into the DJ's Google Drive.
// Embeddable too: <DjSetUpload tokenOverride="..." embedded onDone={fn} />
// (e.g. right after an intake form) uses that token and leaves out the
// full-page wrapper.
export default function DjSetUpload({ tokenOverride = null, embedded = false, onDone = null } = {}) {
  const params = useParams();
  const token = tokenOverride || params.token;
  const [editName, setEditName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null); // { event, slot, files, lineup }
  const [artistName, setArtistName] = useState("");
  const [tracks, setTracks] = useState([]);
  const [contact, setContact] = useState("");
  const [files, setFiles] = useState({}); // drive file id -> meta
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // Sending is one time (job 225): it plays the send-off like the intake web,
  // then the link only shows that it's sent - no editing, no "send update".
  const [sendOff, setSendOff] = useState(false);
  useSendOff(sendOff, () => setSendOff(false));
  const queue = useRef(Promise.resolve()); // uploads run one at a time
  const stateRef = useRef({});
  stateRef.current = { artistName, tracks, contact };

  const applyServer = useCallback((d) => {
    setData(d);
    const map = {};
    (d.files || []).forEach((f) => { map[f.id] = f; });
    setFiles(map);
  }, []);

  useEffect(() => {
    supabase.rpc("get_dj_slot", { p_token: token }).then(({ data: d, error: e }) => {
      if (e || !d) { setData(null); setLoading(false); return; }
      applyServer(d);
      setArtistName(d.slot.artist_name || "");
      setTracks((d.slot.tracks || []).length ? d.slot.tracks.map(newTrack) : [newTrack()]);
      setContact(d.slot.contact || "");
      setSubmitted(d.slot.status === "submitted");
      setLoading(false);
    });
  }, [token, applyServer]);

  // Saves are serialised so an upload finishing mid-save can't be lost.
  const saveChain = useRef(Promise.resolve());
  const save = useCallback((submit = false) => {
    const run = async () => {
      const s = stateRef.current;
      setSaving(true);
      setError("");
      const { data: d, error: e } = await supabase.rpc("save_dj_slot", {
        p_token: token,
        p_artist_name: s.artistName,
        p_tracks: s.tracks.map(({ title, artist, bpm, key, notes, file_id }) => ({ title, artist, bpm, key, notes, file_id })),
        p_gear: {},
        p_announce: "",
        p_contact: s.contact,
        p_submit: submit,
      });
      setSaving(false);
      if (e || !d) { setError("Couldn't save. Check your connection and try again."); throw e || new Error("save failed"); }
      applyServer(d);
      setSavedAt(new Date());
      return d;
    };
    const p = saveChain.current.then(run, run);
    saveChain.current = p.catch(() => {});
    return p;
  }, [token, applyServer]);

  const patchTrack = (k, patch) => setTracks((ts) => ts.map((t) => (t.k === k ? { ...t, ...patch } : t)));
  const setUp = (k, up) => setTracks((ts) => ts.map((t) => (t.k === k ? { ...t, up: { ...t.up, ...up } } : t)));

  const uploading = tracks.some((t) => ["checking", "waiting", "uploading"].includes(t.up.state));
  useEffect(() => {
    if (!uploading) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const attach = async (k, file) => {
    setUp(k, { state: "checking", pct: 0, msg: "" });
    const meta = await inspectWav(file);
    if (!meta.ok) { setUp(k, { state: "error", msg: meta.reason }); return; }
    const t0 = stateRef.current.tracks.find((t) => t.k === k);
    if (t0 && !t0.title) patchTrack(k, { title: titleFromFile(file.name) });
    setUp(k, { state: "waiting", msg: describeWav(meta) });

    queue.current = queue.current.then(async () => {
      try {
        setUp(k, { state: "uploading", pct: 0 });
        const { upload_url } = await setUploadCall(token, "start", { name: file.name, size: file.size });
        const g = await uploadToDrive(upload_url, file, (done, total) => setUp(k, { pct: Math.round((done / total) * 100) }));
        const { file: rec } = await setUploadCall(token, "finish", {
          file_id: g.id, sample_rate: meta.sampleRate, bit_depth: meta.bitDepth, channels: meta.channels, duration_sec: meta.durationSec,
        });
        const old = stateRef.current.tracks.find((t) => t.k === k)?.file_id;
        setFiles((m) => ({ ...m, [rec.id]: rec }));
        // Update the ref right away too, so the save below includes this file.
        const next = stateRef.current.tracks.map((t) => (t.k === k ? { ...t, file_id: rec.id, up: { state: "done", pct: 100, msg: "" } } : t));
        stateRef.current = { ...stateRef.current, tracks: next };
        setTracks((ts) => ts.map((t) => (t.k === k ? { ...t, file_id: rec.id, up: { state: "done", pct: 100, msg: "" } } : t)));
        await save(false);
        if (old && old !== rec.id) setUploadCall(token, "remove", { file_id: old }).catch(() => {});
      } catch (e) {
        setUp(k, { state: "error", msg: e.message || "Upload failed. Try that file again." });
      }
    });
  };

  // Several WAVs dropped at once become tracks in the order they're named.
  const addMany = (fileList) => {
    const list = Array.from(fileList).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const fresh = list.map(() => newTrack());
    setTracks((ts) => [...ts.filter((t) => t.title || t.file_id || t.artist), ...fresh]);
    setTimeout(() => list.forEach((f, i) => attach(fresh[i].k, f)), 0);
  };

  const removeTrack = (t) => {
    const cur = stateRef.current.tracks;
    const next = cur.length > 1 ? cur.filter((x) => x.k !== t.k) : [newTrack()];
    stateRef.current = { ...stateRef.current, tracks: next };
    setTracks(next);
    save(false).catch(() => {});
    if (t.file_id) setUploadCall(token, "remove", { file_id: t.file_id }).catch(() => {});
  };
  const move = (i, d) => {
    const ts = stateRef.current.tracks;
    const j = i + d;
    if (j < 0 || j >= ts.length) return;
    const next = [...ts];
    [next[i], next[j]] = [next[j], next[i]];
    stateRef.current = { ...stateRef.current, tracks: next };
    setTracks(next);
    save(false).catch(() => {});
  };

  const submit = async () => {
    try {
      await save(true);
      setSendOff(true);
      setSubmitted(true);
      setUploadCall(token, "finalize").catch(() => {}); // number the files in Drive; not essential
      onDone?.();
    } catch { /* error already shown */ }
  };


  // A plain function (not a component) so inputs keep focus between renders.
  const shell = (children) => (embedded
    ? <div className="text-white" style={{ fontFamily: SCENE_FONT }}>{children}</div>
    : <div className="min-h-screen bg-[#0d0d0d] text-white pb-16" style={{ fontFamily: SCENE_FONT }}>{children}</div>);

  if (loading) {
    return shell(<div className="py-16 flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#8CFF3D] animate-spin" /></div>);
  }
  if (!data) {
    return shell(
        <div className="py-24 px-6 text-center">
          <Disc3 className="w-10 h-10 text-white/20 mx-auto" />
          <p className="mt-4 text-white text-2xl font-bold">This set link doesn't work</p>
          <p className="mt-1 text-white/50">Ask the DJ to send it again.</p>
        </div>
    );
  }

  const ev = data.event;
  // Sent (job 225): just that, for good.
  if (submitted && !sendOff) {
    const n = tracks.filter((t) => t.title || t.file_id).length;
    return shell(
      <div className="so-fade max-w-[560px] mx-auto px-6 py-20 flex flex-col items-center text-center gap-3">
        <style>{SEND_OFF_CSS}</style>
        <span className="w-20 h-20 rounded-full flex items-center justify-center border-2" style={{ borderColor: G, background: G + "14" }}>
          <Check className="w-9 h-9" style={{ color: G }} />
        </span>
        <h1 className="text-[34px] font-bold leading-none mt-2">Sent</h1>
        <p className="text-white/65 text-[16px]">Your set is with {ev.dj_name || "the DJ"}.</p>
        {n > 0 && <p className="text-[11px] tracking-[0.12em] text-white/40" style={{ fontFamily: SCENE_MONO }}>{n} TRACK{n === 1 ? "" : "S"}</p>}
      </div>
    );
  }
  const due = ev.due_at ? new Date(ev.due_at) : null;
  const overdue = due && due < new Date() && !submitted;
  const dateLabel = ev.event_date ? new Date(ev.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;
  const driveOk = ev.drive_connected;
  const djName = ev.dj_name || "the DJ";
  const djFirst = ev.dj_name ? ev.dj_name.split(/\s+/)[0] : "the DJ";
  // Where you are in the running order, from the lineup (or the slot itself).
  const lineup = data.lineup || [];
  const youIdx = lineup.findIndex((l) => l.is_you);
  const order = youIdx >= 0 ? youIdx + 1 : data.slot?.position || null;
  const start = (youIdx >= 0 ? lineup[youIdx].set_start : null) || data.slot?.set_start || null;
  const slotBit = start ? `you're on ${fmtTime(start)}${order ? ` (${ordinal(order)})` : ""}` : order && lineup.length > 1 ? `you're ${ordinal(order)} of ${lineup.length}` : null;

  return shell(
      <main className={`djs-form max-w-[560px] mx-auto ${embedded ? "" : "px-4 pt-7"} flex flex-col gap-5`}>
        {sendOff && <style className="djs-keep">{".djs-form > :not(.djs-keep) { opacity: 0; transition: opacity .45s ease; pointer-events: none; }"}</style>}
        {/* One header: who it's for, the event, your slot, when it's due */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: DJ_COLOR }}>YOUR SET FOR {djName.toUpperCase()}</span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-white/45" style={{ fontFamily: SCENE_MONO }}>
              {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> SAVING</> : savedAt ? <><Check className="w-3 h-3 text-[#8CFF3D]" /> SAVED</> : null}
            </span>
          </div>
          <h1 className="text-[30px] font-bold leading-[1.05] tracking-wide text-balance">{ev.title}</h1>
          <p className="text-white/60 text-[15px]">{[dateLabel, ev.venue, slotBit].filter(Boolean).join(" · ")}</p>
          {due && (
            <span className="self-start mt-1.5 text-[11px] px-2.5 py-0.5 rounded-full" style={{ fontFamily: SCENE_MONO, color: overdue ? RED : AMBER, border: `1px solid ${(overdue ? RED : AMBER)}66` }}>
              {overdue ? "WAS DUE " : "DUE "}{due.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
            </span>
          )}
        </div>
        {ev.note && <p className="m-0 text-white/80 text-[15px] whitespace-pre-wrap pl-3" style={{ borderLeft: `3px solid ${DJ_COLOR}` }}>{ev.note}</p>}

        {!driveOk && (
          <p className="m-0 text-[14px] flex items-start gap-2 text-white/80"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBER }} /> {djFirst}'s Google Drive isn't connected, so WAVs can't be sent yet. Your track list still saves.</p>
        )}

        {/* Billed as: a small editable line */}
        <div className="flex items-center gap-2 text-[14px] text-white/60 -mt-1">
          {editName ? (
            <input id="artist-name" autoFocus className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-white text-[15px] outline-none focus:border-[#8CFF3D]/60" value={artistName} maxLength={120}
              onChange={(e) => setArtistName(e.target.value)} onBlur={() => { setEditName(false); save(false).catch(() => {}); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} placeholder="How you're billed" />
          ) : (
            <>
              <span className="text-white font-semibold">{artistName || "Your name"}</span>
              <button type="button" onClick={() => setEditName(true)} className="text-white/45 hover:text-white underline-offset-2 hover:underline">{artistName ? "Not you? edit" : "add your name"}</button>
            </>
          )}
        </div>

        {/* Tracks: one row each, the WAV right there */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[20px] font-bold leading-none">Tracks</h2>
            <span className="text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}>IN PLAY ORDER</span>
          </div>
          <ol className="flex flex-col gap-2 m-0 p-0">
            {tracks.map((t, i) => (
              <TrackRow
                key={t.k} i={i} t={t} count={tracks.length} meta={t.file_id ? files[t.file_id] : null} driveOk={driveOk}
                onChange={(patch) => patchTrack(t.k, patch)} onBlur={() => save(false).catch(() => {})}
                onFile={(f) => attach(t.k, f)} onRemove={() => removeTrack(t)} onMove={(d) => move(i, d)}
              />
            ))}
          </ol>
          <div className="flex gap-2">
            {driveOk ? (
              <label className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[15px] font-semibold cursor-pointer hover:brightness-125" style={{ border: `1px dashed ${DJ_COLOR}88`, color: DJ_COLOR }}>
                <Plus className="w-4 h-4" /> Add WAVs
                <input type="file" accept=".wav,audio/wav,audio/x-wav" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addMany(e.target.files); e.target.value = ""; }} />
              </label>
            ) : <span className="flex-1" />}
            <button type="button" onClick={() => setTracks((ts) => [...ts, newTrack()])} className="px-4 py-3 rounded-xl border border-[#2a2a2a] text-white/65 hover:text-white text-[14px]">Type one in</button>
          </div>
          <span className="text-[12px] text-white/40">Tap a track to add a note for {djFirst} (fades, cue points).</span>
        </section>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold">How can {djFirst} reach you?</span>
          <input id="contact" maxLength={200} className={field} value={contact} onChange={(e) => setContact(e.target.value)} onBlur={() => save(false).catch(() => {})} placeholder="Phone or email" />
        </label>

        {error && <p className="m-0 text-sm" style={{ color: RED }}>{error}</p>}

        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={submit} disabled={saving || uploading}
            className="w-full h-[52px] rounded-[14px] text-[16px] font-extrabold tracking-[0.04em] disabled:opacity-50"
            style={{ background: G, color: "#0d0d0d" }}>
            {uploading ? "WAITING FOR UPLOADS…" : "SEND MY SET"}
          </button>
          <span className="text-center text-[10px] text-white/40" style={{ fontFamily: SCENE_MONO }}>SAVES AS YOU GO · YOU SEND IT ONCE</span>
        </div>
        {sendOff && (
          <div className="djs-keep fixed inset-0 z-50 pointer-events-none flex items-center justify-center" aria-live="polite">
            <style>{SEND_OFF_CSS}</style>
            <span className="sr-only">Sending your set</span>
            <div className="relative w-[120px] h-[120px] so-fade">
              <SendOffCenter off color={DJ_COLOR}>
                <span className="absolute inset-0 rounded-full flex items-center justify-center border-[3px]" style={{ borderColor: DJ_COLOR, background: "#141414", boxShadow: `0 0 28px ${DJ_COLOR}66` }}>
                  <Disc3 className="w-12 h-12" style={{ color: DJ_COLOR }} />
                </span>
              </SendOffCenter>
            </div>
          </div>
        )}
      </main>
  );
}

function fmtTime(hhmm) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}
function ordinal(n) {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
}

function TrackRow({ i, t, count, meta, driveOk, onChange, onBlur, onFile, onRemove, onMove }) {
  const [drag, setDrag] = useState(false);
  const [open, setOpen] = useState(!!t.notes);
  const [menu, setMenu] = useState(false);
  const warn = meta ? qualityWarning({ sampleRate: meta.sample_rate, bitDepth: meta.bit_depth }) : null;
  const busy = ["checking", "waiting", "uploading"].includes(t.up.state);
  const toggle = (e) => { if (e.target.closest("input, textarea, button, label")) return; setOpen((v) => !v); };

  let sub, subColor = "rgba(255,255,255,0.45)";
  if (t.up.state === "done" && meta) {
    sub = [meta.name, describeWav({ sampleRate: meta.sample_rate, bitDepth: meta.bit_depth, channels: meta.channels, durationSec: meta.duration_sec })].filter(Boolean).join(" · ");
    subColor = warn ? AMBER : G;
    if (warn) sub += ` · ${warn}`;
  } else if (t.up.state === "checking") sub = "Checking the file…";
  else if (t.up.state === "waiting") sub = `Queued · ${t.up.msg}`;
  else if (t.up.state === "uploading") sub = `Uploading ${t.up.pct}%`;
  else if (t.up.state === "error") { sub = t.up.msg; subColor = RED; }
  else sub = driveOk ? "No WAV yet" : "Track listed";

  return (
    <li
      onClick={toggle}
      className="list-none rounded-xl border bg-[#161616] px-3 py-2.5 flex flex-col gap-2 cursor-pointer transition-colors"
      style={{ borderColor: drag ? DJ_COLOR : "#262626" }}
      onDragOver={(e) => { if (driveOk) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && driveOk && !busy) onFile(f); }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] tabular-nums w-5 shrink-0" style={{ fontFamily: SCENE_MONO, color: DJ_COLOR }}>{String(i + 1).padStart(2, "0")}</span>
        <div className="flex-1 min-w-0 flex flex-col">
          <input id={`t-title-${t.k}`} className="w-full bg-transparent border border-transparent focus:border-[#2a2a2a] focus:bg-[#0d0d0d] rounded-md px-1.5 -mx-1.5 py-0.5 text-[15px] font-semibold text-white placeholder:text-white/30 outline-none"
            placeholder="Track title" maxLength={160} value={t.title} onChange={(e) => onChange({ title: e.target.value })} onBlur={onBlur} />
          <span className="text-[12px] truncate" style={{ color: subColor }}>{sub}</span>
          {t.up.state === "uploading" && (
            <span className="mt-1 h-1 rounded-full bg-[#222] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${t.up.pct}%`, background: G }} /></span>
          )}
        </div>
        {driveOk && !busy && (
          <label className="shrink-0 px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold cursor-pointer hover:brightness-125"
            style={t.file_id ? { borderColor: G + "66", color: G } : { borderColor: "#333", color: "#d4d4d4" }}>
            {t.file_id ? "✓ WAV" : "Add WAV"}
            <input type="file" accept=".wav,audio/wav,audio/x-wav" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
        )}
        {busy && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-white/50" />}
        <div className="relative shrink-0">
          <button type="button" aria-label="Track options" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="w-7 h-7 rounded-md flex items-center justify-center text-white/45 hover:text-white hover:bg-white/5"><MoreHorizontal className="w-4 h-4" /></button>
          {menu && (
            <div className="absolute right-0 top-8 z-20 w-40 rounded-lg bg-[#1a1a1a] border border-[#333] shadow-xl overflow-hidden" onMouseLeave={() => setMenu(false)}>
              <button type="button" disabled={i === 0} onClick={() => { setMenu(false); onMove(-1); }} className="w-full h-9 px-3 flex items-center gap-2 text-[13px] text-white/80 hover:bg-white/5 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /> Move up</button>
              <button type="button" disabled={i === count - 1} onClick={() => { setMenu(false); onMove(1); }} className="w-full h-9 px-3 flex items-center gap-2 text-[13px] text-white/80 hover:bg-white/5 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /> Move down</button>
              <button type="button" disabled={busy} onClick={() => { setMenu(false); onRemove(); }} className="w-full h-9 px-3 flex items-center gap-2 text-[13px] text-red-400 hover:bg-white/5 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
            </div>
          )}
        </div>
      </div>
      {open && (
        <textarea id={`t-notes-${t.k}`} rows={2} className="ml-7 bg-[#0d0d0d] border border-[#262626] rounded-lg px-2.5 py-1.5 text-white text-[14px] placeholder:text-white/30 outline-none focus:border-[#FDE047]/60 resize-none"
          placeholder="Note for the DJ (fades, cue points, edits)" maxLength={400} value={t.notes} onChange={(e) => onChange({ notes: e.target.value })} onBlur={onBlur} />
      )}
    </li>
  );
}
