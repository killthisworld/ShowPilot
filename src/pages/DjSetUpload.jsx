import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, FileAudio, Loader2, Plus, Trash2, Upload, AlertTriangle, Disc3 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { inspectWav, describeWav, qualityWarning, formatBytes, formatDuration } from "@/lib/wav";
import { setUploadCall, uploadToDrive } from "@/lib/djTools";

const G = "#8CFF3D";
const AMBER = "#F59E0B";
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
export default function DjSetUpload() {
  const { token } = useParams();
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
      if (submit) setSubmitted(true);
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
      setUploadCall(token, "finalize").catch(() => {}); // number the files in Drive; not essential
    } catch { /* error already shown */ }
  };

  const totals = useMemo(() => {
    const withFile = tracks.filter((t) => t.file_id && files[t.file_id]);
    return {
      count: tracks.filter((t) => t.title || t.file_id).length,
      files: withFile.length,
      duration: withFile.reduce((s, t) => s + (Number(files[t.file_id]?.duration_sec) || 0), 0),
    };
  }, [tracks, files]);

  if (loading) {
    return <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#8CFF3D] animate-spin" /></div>;
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-6 text-center" style={{ fontFamily: SCENE_FONT }}>
        <div>
          <Disc3 className="w-10 h-10 text-white/20 mx-auto" />
          <p className="mt-4 text-white text-2xl font-bold">This set link doesn't work</p>
          <p className="mt-1 text-white/50">Ask the DJ to send it again.</p>
        </div>
      </div>
    );
  }

  const ev = data.event;
  const due = ev.due_at ? new Date(ev.due_at) : null;
  const overdue = due && due < new Date() && !submitted;
  const dateLabel = ev.event_date ? new Date(ev.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : null;
  const driveOk = ev.drive_connected;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white pb-24" style={{ fontFamily: SCENE_FONT }}>
      <header className="border-b border-[#1a1a1a] bg-[#0d0d0d]/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="text-[10px] tracking-[0.16em] text-white/40" style={{ fontFamily: SCENE_MONO }}>SHOWPILOT · SET FOR {(ev.dj_name || "THE DJ").toUpperCase()}</div>
          <div className="ml-auto flex items-center gap-2 text-xs text-white/50" style={{ fontFamily: SCENE_MONO }}>
            {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> SAVING</> : savedAt ? <><Check className="w-3 h-3 text-[#8CFF3D]" /> SAVED</> : null}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] items-start">
        <section className="min-w-0 flex flex-col gap-5">
          <div>
            <h1 className="text-4xl font-bold leading-none tracking-wide text-balance">{ev.title}</h1>
            <p className="mt-2 text-white/55 text-[15px]">{[dateLabel, ev.venue].filter(Boolean).join(" · ")}</p>
            {due && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ fontFamily: SCENE_MONO, color: overdue ? RED : AMBER, background: (overdue ? RED : AMBER) + "1A", border: `1px solid ${(overdue ? RED : AMBER)}55` }}>
                {overdue ? "WAS DUE " : "DUE "}{due.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase()}
              </p>
            )}
            {ev.note && <p className="mt-4 text-white/75 text-[15px] whitespace-pre-wrap max-w-[65ch] border-l-2 border-[#8CFF3D]/50 pl-3">{ev.note}</p>}
          </div>

          {submitted && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: G + "14", border: `1px solid ${G}55` }}>
              <Check className="w-5 h-5 text-[#8CFF3D] shrink-0" />
              <p className="text-[15px]">Your set is with the DJ. You can still change things here; they'll see the latest version.</p>
            </div>
          )}

          {!driveOk && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: AMBER + "14", border: `1px solid ${AMBER}55` }}>
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: AMBER }} />
              <p className="text-[15px] text-white/85">The DJ hasn't connected their Google Drive yet, so WAV files can't be sent right now. Fill in your track list; it saves, and you can add the files once they've connected.</p>
            </div>
          )}

          <label className="block">
            <span className="block text-[11px] tracking-[0.12em] text-white/45 mb-1.5" style={{ fontFamily: SCENE_MONO }}>ARTIST NAME</span>
            <input id="artist-name" className={field} value={artistName} maxLength={120} onChange={(e) => setArtistName(e.target.value)} onBlur={() => save(false).catch(() => {})} placeholder="How you're billed" />
          </label>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
              <div>
                <h2 className="text-2xl font-bold leading-none">Your set, in play order</h2>
                <p className="text-white/45 text-sm mt-1">WAV only. Files are checked before they're sent, and their quality is shown.</p>
              </div>
              <div className="text-xs text-white/50" style={{ fontFamily: SCENE_MONO }}>
                {totals.count} TRACK{totals.count === 1 ? "" : "S"} · {totals.files} WAV{totals.files === 1 ? "" : "S"}{totals.duration ? ` · ${formatDuration(totals.duration)}` : ""}
              </div>
            </div>

            <ol className="flex flex-col gap-2">
              {tracks.map((t, i) => (
                <TrackRow
                  key={t.k} i={i} t={t} count={tracks.length} meta={t.file_id ? files[t.file_id] : null} driveOk={driveOk}
                  onChange={(patch) => patchTrack(t.k, patch)} onBlur={() => save(false).catch(() => {})}
                  onFile={(f) => attach(t.k, f)} onRemove={() => removeTrack(t)} onMove={(d) => move(i, d)}
                />
              ))}
            </ol>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setTracks((ts) => [...ts, newTrack()])} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#2a2a2a] text-white/80 hover:text-white hover:border-white/30 text-sm font-semibold">
                <Plus className="w-4 h-4" /> Add a track
              </button>
              {driveOk && (
                <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#8CFF3D]/40 text-[#8CFF3D] hover:bg-[#8CFF3D]/10 text-sm font-semibold cursor-pointer">
                  <Upload className="w-4 h-4" /> Add several WAVs at once
                  <input type="file" accept=".wav,audio/wav,audio/x-wav" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addMany(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>

          <label className="block max-w-md">
            <span className="block text-[11px] tracking-[0.12em] text-white/45 mb-1.5" style={{ fontFamily: SCENE_MONO }}>BEST WAY TO REACH YOU</span>
            <input id="contact" maxLength={200} className={field} value={contact} onChange={(e) => setContact(e.target.value)} onBlur={() => save(false).catch(() => {})} placeholder="Phone or email, only the DJ sees this" />
          </label>

          {error && <p className="text-sm" style={{ color: RED }}>{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={submit} disabled={saving || uploading}
              className="px-6 py-3 rounded-xl text-lg font-bold tracking-[0.04em] disabled:opacity-50"
              style={{ background: G, color: "#0d0d0d" }}>
              {submitted ? "SEND UPDATE TO THE DJ" : "SEND MY SET TO THE DJ"}
            </button>
            {uploading && <span className="text-sm text-white/50">Waiting for uploads to finish…</span>}
          </div>
        </section>

        <aside className="lg:sticky lg:top-20 rounded-2xl border border-[#1f1f1f] bg-[#121212] p-4">
          <div className="text-[11px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>RUNNING ORDER</div>
          <ol className="mt-3 flex flex-col gap-1.5">
            {(data.lineup || []).map((l, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg px-2.5 py-2" style={l.is_you ? { background: G + "14", border: `1px solid ${G}55` } : { border: "1px solid transparent" }}>
                <span className="text-xs text-white/40 w-5 text-right" style={{ fontFamily: SCENE_MONO }}>{i + 1}</span>
                <span className={`flex-1 min-w-0 truncate font-semibold ${l.is_you ? "text-white" : "text-white/75"}`}>{l.is_you ? (artistName || "You") : (l.artist_name || "TBA")}</span>
                <span className="text-xs text-white/50 tabular-nums" style={{ fontFamily: SCENE_MONO }}>{l.set_start ? `${l.set_start}${l.set_end ? `–${l.set_end}` : ""}` : ""}</span>
              </li>
            ))}
          </ol>
        </aside>
      </main>
    </div>
  );
}

function TrackRow({ i, t, count, meta, driveOk, onChange, onBlur, onFile, onRemove, onMove }) {
  const [drag, setDrag] = useState(false);
  const warn = meta ? qualityWarning({ sampleRate: meta.sample_rate, bitDepth: meta.bit_depth }) : null;
  const busy = ["checking", "waiting", "uploading"].includes(t.up.state);
  const small = "bg-[#0d0d0d] border border-[#262626] rounded-md px-2 py-1.5 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#8CFF3D]/60 min-w-0";

  return (
    <li
      className="rounded-xl border bg-[#131313] p-3 flex gap-3 transition-colors"
      style={{ borderColor: drag ? G : "#222" }}
      onDragOver={(e) => { if (driveOk) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && driveOk && !busy) onFile(f); }}
    >
      <div className="flex flex-col items-center gap-1 pt-1">
        <span className="text-lg font-bold tabular-nums w-7 text-center" style={{ color: G }}>{String(i + 1).padStart(2, "0")}</span>
        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)} className="p-1 text-white/40 hover:text-white disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
        <button type="button" aria-label="Move down" disabled={i === count - 1} onClick={() => onMove(1)} className="p-1 text-white/40 hover:text-white disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_64px_64px]">
          <input id={`t-title-${t.k}`} className={`${small} col-span-2 sm:col-span-1`} placeholder="Track title" maxLength={160} value={t.title} onChange={(e) => onChange({ title: e.target.value })} onBlur={onBlur} />
          <input id={`t-artist-${t.k}`} className={`${small} col-span-2 sm:col-span-1`} placeholder="Original artist" maxLength={160} value={t.artist} onChange={(e) => onChange({ artist: e.target.value })} onBlur={onBlur} />
          <input id={`t-bpm-${t.k}`} className={small} placeholder="BPM" maxLength={10} inputMode="decimal" value={t.bpm} onChange={(e) => onChange({ bpm: e.target.value })} onBlur={onBlur} />
          <input id={`t-key-${t.k}`} className={small} placeholder="Key" maxLength={12} value={t.key} onChange={(e) => onChange({ key: e.target.value })} onBlur={onBlur} />
        </div>
        <input id={`t-notes-${t.k}`} className={small} placeholder="Notes for the DJ (cue points, transitions, edits)" maxLength={400} value={t.notes} onChange={(e) => onChange({ notes: e.target.value })} onBlur={onBlur} />

        <div className="flex flex-wrap items-center gap-2 text-sm min-h-[30px]">
          {t.up.state === "done" && meta ? (
            <>
              <FileAudio className="w-4 h-4 text-[#8CFF3D] shrink-0" />
              <span className="text-white/80 truncate max-w-[16rem]">{meta.name}</span>
              <span className="text-white/45 text-xs" style={{ fontFamily: SCENE_MONO }}>
                {describeWav({ sampleRate: meta.sample_rate, bitDepth: meta.bit_depth, channels: meta.channels, durationSec: meta.duration_sec })} · {formatBytes(meta.size_bytes)}
              </span>
              {warn && <span className="text-xs" style={{ color: AMBER }}>{warn}</span>}
            </>
          ) : t.up.state === "checking" ? (
            <span className="text-white/50 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking the file…</span>
          ) : t.up.state === "waiting" ? (
            <span className="text-white/50">Queued · {t.up.msg}</span>
          ) : t.up.state === "uploading" ? (
            <span className="flex items-center gap-2 w-full max-w-sm">
              <span className="flex-1 h-1.5 rounded-full bg-[#222] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${t.up.pct}%`, background: G }} /></span>
              <span className="text-xs text-white/60 tabular-nums" style={{ fontFamily: SCENE_MONO }}>{t.up.pct}%</span>
            </span>
          ) : t.up.state === "error" ? (
            <span className="text-sm" style={{ color: RED }}>{t.up.msg}</span>
          ) : null}

          {driveOk && !busy && (
            <label className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#2a2a2a] text-white/70 hover:text-white hover:border-white/30 text-xs font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> {t.file_id ? "Replace WAV" : "Attach WAV"}
              <input type="file" accept=".wav,audio/wav,audio/x-wav" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>

      <button type="button" aria-label="Remove track" disabled={busy} onClick={onRemove} className="self-start p-1.5 text-white/30 hover:text-red-400 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
    </li>
  );
}
