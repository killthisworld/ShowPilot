import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, ChevronDown, Loader2, Plus, Trash2, AlertTriangle, Disc3 } from "lucide-react";
import SwipeRow from "@/components/showpilot/SwipeRow";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { inspectWav, describeWav, qualityWarning } from "@/lib/wav";
import { setUploadCall, uploadToDrive, DJ_COLOR, fileTypes, acceptFor, typeOfFile, typesLabel } from "@/lib/djTools";
import { SEND_OFF_CSS, SendOffCenter, useSendOff, IntakeSent } from "@/components/showpilot/IntakeKeyWeb";

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
const titleFromFile = (name) => name.replace(/\.(wav|aiff?|flac|mp3|m4a)$/i, "").replace(/^\d+[\s._-]+/, "").replace(/_/g, " ").trim();

// The page an artist opens from the DJ's link: their set in play order,
// audio files in the types the DJ picked for the set (job 378: WAV, AIFF,
// FLAC, MP3, M4A; WAV when none were picked; WAVs are checked to be real
// WAVs with their quality shown) and a way to reach them. Files go straight
// into the DJ's Google Drive.
// Embeddable too: <DjSetUpload tokenOverride="..." embedded onDone={fn} />
// (e.g. right after an intake form) uses that token and leaves out the
// full-page wrapper.
// afterSent: shown under the Sent screen (after an intake: its feedback form; job 227).
export default function DjSetUpload({ tokenOverride = null, embedded = false, onDone = null, afterSent = null } = {}) {
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
  const typesRef = useRef(["wav"]); // the file types this set takes (job 378)
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
    // Only the types this set takes; a WAV is checked to be a real one.
    const kind = typeOfFile(file.name);
    if (!kind || !typesRef.current.includes(kind)) { setUp(k, { state: "error", msg: `This set takes ${typesLabel(typesRef.current)} files.` }); return; }
    const meta = kind === "wav" ? await inspectWav(file) : { ok: true };
    if (!meta.ok) { setUp(k, { state: "error", msg: meta.reason }); return; }
    const t0 = stateRef.current.tracks.find((t) => t.k === k);
    if (t0 && !t0.title) patchTrack(k, { title: titleFromFile(file.name) });
    setUp(k, { state: "waiting", msg: kind === "wav" ? describeWav(meta) : `${(file.size / 1048576).toFixed(1)} MB` });

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

  // Several files dropped at once become tracks in the order they're named.
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
  // Hold a song, then drag it up or down to move it (job 380).
  const listRef = useRef(null);
  const holdRef = useRef(null);   // { timer, x0, y0 } while waiting for the hold
  const dragRef = useRef(null);   // { k, grab, el } while dragging
  const [dragK, setDragK] = useState(null);
  const [dragDy, setDragDy] = useState(0);
  // Moves and lets-go are followed on the whole page: the dragged row moves
  // in the list as it goes, and the browser drops a row's pointer capture
  // when that happens. While dragging, the page mustn't scroll either.
  const moveFn = useRef(() => {});
  const upFn = useRef(() => {});
  useEffect(() => {
    const stop = (e) => { if (dragRef.current) e.preventDefault(); };
    const mv = (e) => moveFn.current(e);
    const up = () => upFn.current();
    document.addEventListener("touchmove", stop, { passive: false });
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("touchmove", stop);
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  const cancelHold = () => { if (holdRef.current) { clearTimeout(holdRef.current.timer); holdRef.current = null; } };
  const holdDown = (e, k) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("input, textarea, label, button")) return;
    const el = e.currentTarget;
    const { clientX: x0, clientY: y0 } = e;
    cancelHold();
    holdRef.current = {
      x0, y0,
      timer: setTimeout(() => {
        holdRef.current = null;
        const r = el.getBoundingClientRect();
        dragRef.current = { k, grab: y0 - r.top, el };
        setDragK(k); setDragDy(0);
        try { navigator.vibrate?.(12); } catch { /* ignore */ }
      }, 380),
    };
  };
  const holdMove = (e) => {
    const h = holdRef.current;
    if (h && (Math.abs(e.clientX - h.x0) > 8 || Math.abs(e.clientY - h.y0) > 8)) cancelHold(); // a scroll or a swipe
    const d = dragRef.current;
    const ol = listRef.current;
    if (!d || !ol) return;
    const olTop = ol.getBoundingClientRect().top;
    const top = e.clientY - d.grab; // where the row's top should be
    const mid = top + d.el.offsetHeight / 2;
    const ts = stateRef.current.tracks;
    const from = ts.findIndex((t) => t.k === d.k);
    const others = [...ol.children].filter((li) => li !== d.el);
    const to = others.filter((li) => olTop + li.offsetTop + li.offsetHeight / 2 < mid).length;
    if (from >= 0 && to !== from) {
      const next = [...ts];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      stateRef.current = { ...stateRef.current, tracks: next };
      setTracks(next);
    }
    setDragDy(top - (olTop + d.el.offsetTop));
  };
  const holdUp = () => {
    cancelHold();
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragK(null); setDragDy(0);
    save(false).catch(() => {});
  };
  moveFn.current = holdMove;
  upFn.current = holdUp;
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
      // Signed in to Show Pilot: the DJ sees your profile photo behind your
      // card (job 380). The server takes it from your account.
      supabase.auth.getSession().then(({ data: ss }) => {
        if (ss?.session) supabase.rpc("dj_slot_photo_from_me", { p_token: token }).then(() => {}, () => {});
      });
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
  const types = fileTypes(ev?.file_types);
  typesRef.current = types;
  // Sent (job 225): just that, for good.
  if (submitted && !sendOff) {
    const n = tracks.filter((t) => t.title || t.file_id).length;
    // After an intake: the disc flies, then straight to its feedback form (job 228).
    if (afterSent) return <IntakeSent seed={token} bare>{afterSent}</IntakeSent>;
    // Centred on the night sky, like the intake form's Sent screen.
    return (
      <IntakeSent seed={token} title="Sent!" line={`Your set is with ${ev.dj_name || "the DJ"}.`}>
        {n > 0 && <p className="mt-3 text-[11px] tracking-[0.12em] text-white/40" style={{ fontFamily: SCENE_MONO }}>{n} TRACK{n === 1 ? "" : "S"}</p>}
      </IntakeSent>
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
          <p className="m-0 text-[14px] flex items-start gap-2 text-white/80"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBER }} /> {djFirst}'s Google Drive isn't connected, so files can't be sent yet. Your track list still saves.</p>
        )}

        {/* Tracks: one row each, the WAV right there */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[20px] font-bold leading-none">Tracks</h2>
            <span className="text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}>IN PLAY ORDER</span>
          </div>
          <ol ref={listRef} className="relative flex flex-col gap-2 m-0 p-0">
            {tracks.map((t, i) => (
              <TrackRow
                key={t.k} i={i} t={t} count={tracks.length} meta={t.file_id ? files[t.file_id] : null} driveOk={driveOk} types={types}
                dragging={dragK === t.k} dragDy={dragK === t.k ? dragDy : 0} anyDragging={!!dragK}
                onHoldDown={(e) => holdDown(e, t.k)}
                onChange={(patch) => patchTrack(t.k, patch)} onBlur={() => save(false).catch(() => {})}
                onFile={(f) => attach(t.k, f)} onRemove={() => removeTrack(t)} onMove={(d) => move(i, d)}
              />
            ))}
          </ol>
          <div className="flex gap-2">
            {driveOk ? (
              <label className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[15px] font-semibold cursor-pointer hover:brightness-125" style={{ border: `1px dashed ${DJ_COLOR}88`, color: DJ_COLOR }}>
                <Plus className="w-4 h-4" /> Add {typesLabel(types)} files
                <input type="file" accept={acceptFor(types)} multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addMany(e.target.files); e.target.value = ""; }} />
              </label>
            ) : <span className="flex-1" />}
            <button type="button" onClick={() => setTracks((ts) => [...ts, { ...newTrack(), typed: true }])} className="px-4 py-3 rounded-xl border border-[#2a2a2a] text-white/65 hover:text-white text-[14px]">Type one in</button>
          </div>
          <span className="text-[12px] text-white/40">Tap a song to add a note for {djFirst}. Hold to move it, swipe left to delete.</span>
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

// One song (job 380): the number, its title and file, and a dropdown arrow.
// Tap it (or the arrow) for the title, a note for the DJ and its file; hold
// and drag to move it; swipe left to delete.
function TrackRow({ i, t, meta, driveOk, types = ["wav"], dragging = false, dragDy = 0, anyDragging = false, onHoldDown, onChange, onBlur, onFile, onRemove }) {
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(!!t.notes || !!t.typed); // typed in: ready for its title
  const warn = meta ? qualityWarning({ sampleRate: meta.sample_rate, bitDepth: meta.bit_depth }) : null;
  const busy = ["checking", "waiting", "uploading"].includes(t.up.state);

  let sub, subColor = "rgba(255,255,255,0.45)";
  if (t.up.state === "done" && meta && !meta.sample_rate) {
    sub = [meta.name, meta.size_bytes ? `${(meta.size_bytes / 1048576).toFixed(1)} MB` : ""].filter(Boolean).join(" · ");
    subColor = G;
  } else if (t.up.state === "done" && meta) {
    sub = [meta.name, describeWav({ sampleRate: meta.sample_rate, bitDepth: meta.bit_depth, channels: meta.channels, durationSec: meta.duration_sec })].filter(Boolean).join(" · ");
    subColor = warn ? AMBER : G;
    if (warn) sub += ` · ${warn}`;
  } else if (t.up.state === "checking") sub = "Checking the file…";
  else if (t.up.state === "waiting") sub = `Queued · ${t.up.msg}`;
  else if (t.up.state === "uploading") sub = `Uploading ${t.up.pct}%`;
  else if (t.up.state === "error") { sub = t.up.msg; subColor = RED; }
  else sub = driveOk ? "No file yet" : "Track listed";
  if (t.notes && !open) sub = `${sub} · Note`;

  return (
    <li
      onPointerDown={onHoldDown}
      onContextMenu={(e) => e.preventDefault()}
      className="list-none rounded-xl border bg-[#161616] transition-[box-shadow,border-color]"
      style={{
        borderColor: over || dragging ? DJ_COLOR : "#262626",
        transform: dragging ? `translateY(${dragDy}px) scale(1.02)` : undefined,
        zIndex: dragging ? 30 : undefined, position: "relative",
        boxShadow: dragging ? "0 12px 30px rgba(0,0,0,0.55)" : undefined,
        touchAction: anyDragging ? "none" : "pan-y",
        WebkitTouchCallout: "none",
      }}
      onDragOver={(e) => { if (driveOk) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && driveOk && !busy) onFile(f); }}
    >
      <SwipeRow actions={busy || anyDragging ? [] : [{ label: "Delete", icon: Trash2, color: RED, onClick: onRemove }]} radius={12} label={t.title || `Song ${i + 1}`}>
        <div onClick={() => { if (!anyDragging) setOpen((v) => !v); }} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer bg-[#161616] rounded-xl" style={{ WebkitUserSelect: "none", userSelect: "none" }}>
          <span className="text-[13px] tabular-nums w-5 shrink-0" style={{ fontFamily: SCENE_MONO, color: DJ_COLOR }}>{String(i + 1).padStart(2, "0")}</span>
          <div className="flex-1 min-w-0 flex flex-col">
            <span className={`text-[15px] font-semibold truncate ${t.title ? "text-white" : "text-white/35"}`}>{t.title || "Track title"}</span>
            <span className="text-[12px] truncate" style={{ color: subColor }}>{sub}</span>
            {t.up.state === "uploading" && (
              <span className="mt-1 h-1 rounded-full bg-[#222] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${t.up.pct}%`, background: G }} /></span>
            )}
          </div>
          {busy && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-white/50" />}
          <button type="button" aria-label={open ? "Close this song" : "Open this song"} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="shrink-0 w-9 h-9 -mr-1 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5">
            <ChevronDown className="w-5 h-5 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </button>
        </div>
      </SwipeRow>
      {open && !dragging && (
        <div className="px-3 pb-3 pt-0.5 flex flex-col gap-2">
          <input id={`t-title-${t.k}`} className="w-full bg-[#0d0d0d] border border-[#262626] rounded-lg px-2.5 py-2 text-[15px] font-semibold text-white placeholder:text-white/30 outline-none focus:border-[#FDE047]/60"
            placeholder="Track title" maxLength={160} value={t.title} onChange={(e) => onChange({ title: e.target.value })} onBlur={onBlur} />
          <textarea id={`t-notes-${t.k}`} rows={2} className="bg-[#0d0d0d] border border-[#262626] rounded-lg px-2.5 py-2 text-white text-[14px] placeholder:text-white/30 outline-none focus:border-[#FDE047]/60 resize-none"
            placeholder="Note for the DJ (fades, cue points, edits)" maxLength={400} value={t.notes} onChange={(e) => onChange({ notes: e.target.value })} onBlur={onBlur} />
          {driveOk && !busy && (
            <label className="self-start min-h-[38px] px-3 rounded-lg border text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 hover:brightness-125"
              style={t.file_id ? { borderColor: "#333", color: "#d4d4d4" } : { borderColor: `${DJ_COLOR}88`, color: DJ_COLOR }}>
              {t.file_id ? "Replace file" : `Add ${typesLabel(types)} file`}
              <input type="file" accept={acceptFor(types)} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            </label>
          )}
        </div>
      )}
    </li>
  );
}
