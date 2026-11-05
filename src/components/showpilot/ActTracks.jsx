import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Disc3, FolderOpen, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { DJ_COLOR } from "@/lib/djTools";
import { SCENE_MONO } from "@/lib/sceneStyle";

// An act's tracks on the phone event page (job 219): the DJ set an act sent
// for this event (from its DJ set link, or the intake form's "Do you have
// tracks to send?"). Who sees them: whoever owns the event's set links - the
// person who sent the link, whose Google Drive the WAVs went to (the tables'
// own rules decide; everyone else just gets nothing back).
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
  return { tracks };
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

// The sheet: the set in play order (a track with a WAV opens it in Drive), and their folder.
export function ActTracksSheet({ entry, actName, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!entry) return null;
  const s = entry.slot;
  const { tracks } = summary(entry);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${actName}'s tracks`} onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col bg-[#161616] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 shrink-0">
          <Disc3 className="w-5 h-5 mt-1 shrink-0" style={{ color: DJ_COLOR }} />
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-lg leading-tight truncate">{actName}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 -mt-1 flex items-center justify-center text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 flex flex-col gap-1.5">
          {/* Just the order and the titles (Jay, Nov 5). A track with a WAV opens it in Drive. */}
          {tracks.length === 0 ? <p className="text-white/40 text-sm py-6 text-center">No tracks listed yet.</p> : tracks.map((t, k) => {
            const f = t.file_id ? entry.files[t.file_id] : null;
            const row = (
              <>
                <span className="text-[13px] tabular-nums text-white/45 w-5" style={{ fontFamily: SCENE_MONO }}>{k + 1}</span>
                <span className="min-w-0 flex-1 font-semibold text-[15px] text-white leading-snug">{t.title || "Untitled"}</span>
              </>
            );
            const cls = "flex items-center gap-3 px-3 py-3 rounded-lg bg-[#1b1b1b] border border-[#242424]";
            return f?.web_view_link
              ? <a key={k} href={f.web_view_link} target="_blank" rel="noreferrer" className={cls}>{row}</a>
              : <div key={k} className={cls}>{row}</div>;
          })}
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
