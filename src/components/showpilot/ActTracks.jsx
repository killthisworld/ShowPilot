import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Disc3, FileAudio, FolderOpen, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { DJ_COLOR } from "@/lib/djTools";
import { describeWav, formatDuration, qualityWarning } from "@/lib/wav";
import { SCENE_MONO } from "@/lib/sceneStyle";

// An act's tracks on the phone event page (job 219): the DJ set an act sent
// for this event (from its DJ set link, or the intake form's "Do you have
// tracks to send?"). Who sees them: whoever owns the event's set links - the
// person who sent the link, whose Google Drive the WAVs went to (the tables'
// own rules decide; everyone else just gets nothing back).
const AMBER = "#FF9A3D";
const norm = (s) => String(s || "").trim().toLowerCase();
const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;

// Every act's set for an event, by act name: { [name]: { slot, files } }.
// Only acts that have started or sent a set are in it.
export function useEventTracks(showId) {
  const [byAct, setByAct] = useState({});
  const load = useCallback(async () => {
    if (!showId) { setByAct({}); return; }
    const { data: reqs } = await supabase.from("dj_set_requests").select("id").eq("show_id", showId);
    const reqIds = (reqs || []).map((r) => r.id);
    if (!reqIds.length) { setByAct({}); return; }
    const { data: slots } = await supabase.from("dj_set_slots").select("*").in("request_id", reqIds).neq("status", "waiting");
    const used = (slots || []).filter((s) => (Array.isArray(s.tracks) && s.tracks.length) || s.status === "submitted");
    if (!used.length) { setByAct({}); return; }
    const { data: files } = await supabase.from("dj_set_files").select("*").in("slot_id", used.map((s) => s.id));
    const fileMap = {};
    (files || []).forEach((f) => { fileMap[f.drive_file_id] = f; });
    const map = {};
    used.forEach((s) => {
      const key = norm(s.artist_name);
      // The newest set wins if an act somehow has two.
      if (!map[key] || (s.submitted_at || s.created_at) > (map[key].slot.submitted_at || map[key].slot.created_at)) map[key] = { slot: s, files: fileMap };
    });
    setByAct(map);
  }, [showId]);
  useEffect(() => { load(); }, [load]);
  return { byAct, reload: load, tracksFor: (actName) => byAct[norm(actName)] || null };
}

const summary = (entry) => {
  const tracks = Array.isArray(entry?.slot?.tracks) ? entry.slot.tracks : [];
  const wavs = tracks.filter((t) => t.file_id && entry.files[t.file_id]);
  const total = wavs.reduce((sum, t) => sum + (Number(entry.files[t.file_id].duration_sec) || 0), 0);
  return { tracks, wavs, total };
};

// The button on the act's row, next to its notes button. Nothing when the act hasn't sent tracks.
export function ActTracksButton({ entry, actName, onClick, size = "md" }) {
  if (!entry) return null;
  const { tracks } = summary(entry);
  const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={`${actName || "This act"}'s tracks (${tracks.length})`}
      title="Tracks"
      className={`relative ${box} shrink-0 rounded-[10px] border bg-[#141414] flex items-center justify-center`}
      style={{ borderColor: DJ_COLOR + "55", color: DJ_COLOR }}
    >
      <Disc3 className={size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} />
      {tracks.length > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center text-[#0d0d0d]" style={{ background: DJ_COLOR }}>{tracks.length}</span>
      )}
    </button>
  );
}

// The sheet: the set in play order, each WAV's quality (opens it in Drive), contact, their folder.
export function ActTracksSheet({ entry, actName, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!entry) return null;
  const s = entry.slot;
  const { tracks, wavs, total } = summary(entry);
  const sent = s.status === "submitted";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${actName}'s tracks`} onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col bg-[#161616] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 shrink-0">
          <Disc3 className="w-5 h-5 mt-1 shrink-0" style={{ color: DJ_COLOR }} />
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-lg leading-tight truncate">{actName}</h3>
            <p className="text-[11px] tracking-[0.08em] mt-1" style={{ fontFamily: SCENE_MONO, color: sent ? "#8CFF3D" : "#60A5FA" }}>
              {sent ? "SENT" : "STILL WORKING ON IT"} · {tracks.length} TRACK{tracks.length === 1 ? "" : "S"} · {wavs.length} WAV{total ? ` · ${formatDuration(total)}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 -mt-1 flex items-center justify-center text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 flex flex-col gap-1.5">
          {tracks.length === 0 ? <p className="text-white/40 text-sm py-6 text-center">No tracks listed yet.</p> : tracks.map((t, k) => {
            const f = t.file_id ? entry.files[t.file_id] : null;
            const warn = f ? qualityWarning({ sampleRate: f.sample_rate, bitDepth: f.bit_depth }) : null;
            return (
              <div key={k} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[#1b1b1b] border border-[#242424]">
                <span className="text-[12px] tabular-nums text-white/45 w-5 pt-0.5" style={{ fontFamily: SCENE_MONO }}>{k + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[15px] text-white leading-snug">{t.title || "Untitled"}</div>
                  {(t.artist || t.notes) && <div className="text-white/50 text-[13px] leading-snug">{[t.artist, t.notes].filter(Boolean).join(" · ")}</div>}
                  {f ? (
                    <a href={f.web_view_link || "#"} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1" style={{ color: warn ? AMBER : "#8CFF3D" }}>
                      <FileAudio className="w-3.5 h-3.5" />
                      <span className="text-[11.5px]" style={{ fontFamily: SCENE_MONO }}>{describeWav({ sampleRate: f.sample_rate, bitDepth: f.bit_depth, channels: f.channels, durationSec: f.duration_sec })}</span>
                    </a>
                  ) : <div className="mt-1 text-white/30 text-[12px]">No WAV</div>}
                  {warn && <div className="text-[12px] mt-0.5" style={{ color: AMBER }}>{warn}</div>}
                </div>
              </div>
            );
          })}
          {s.contact && (
            <div className="mt-2">
              <div className="text-[10px] tracking-[0.12em] text-white/40" style={{ fontFamily: SCENE_MONO }}>CONTACT</div>
              <div className="mt-1 text-white/80 text-sm select-text">{s.contact}</div>
            </div>
          )}
          {s.drive_folder_id && (
            <a href={folderUrl(s.drive_folder_id)} target="_blank" rel="noreferrer"
              className="mt-3 h-11 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold"
              style={{ borderColor: DJ_COLOR + "55", color: DJ_COLOR, background: DJ_COLOR + "12" }}>
              <FolderOpen className="w-4 h-4" /> Open their folder in Drive
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
