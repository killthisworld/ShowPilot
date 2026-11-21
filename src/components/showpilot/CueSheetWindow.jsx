import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X, FileText, ListMusic } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import CueSheetEditor from "@/components/showpilot/CueSheetEditor";
import { cueSheetHasAny, cueSheetSummary } from "@/lib/cueSheet";
import { supabase } from "@/api/supabaseClient";
import { cueSheetFile } from "@/lib/cueSheetPdf";
import PdfStyleSheet from "@/components/showpilot/PdfStyleSheet";
import { saveOrShare } from "@/lib/guestListPdf";
import { toast } from "@/components/ui/use-toast";

// Cue sheet files from the event go with the stage plots.
async function uploadCueFile(file) {
  const { data: { user } } = await supabase.auth.getUser();
  const path = `${user?.id || "cues"}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from("stage-plots").upload(path, file);
  if (error) throw error;
  return supabase.storage.from("stage-plots").getPublicUrl(path).data.publicUrl;
}

const G = "#8CFF3D";

// An act's lighting cue sheet on the event (job 377), next to its notes and
// stage plot: the LD opens it, works through the set, edits anything.
export function ActCuesButton({ act, onClick, size = "md" }) {
  const has = cueSheetHasAny(act?.lighting_cues);
  const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={`Lighting cues for ${act?.band_name || "this act"}${has ? " (has cues)" : ""}`} title="Lighting cues"
      className={`relative ${box} shrink-0 rounded-[10px] border border-[#2a2a2a] bg-[#141414] flex items-center justify-center hover:border-[#8CFF3D]/50`}
      style={{ color: has ? G : "rgba(140,255,61,0.55)" }}>
      <Lightbulb className={size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} />
      {has && <span aria-hidden="true" className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: G }} />}
    </button>
  );
}

// The LD's cue sheet button (job 435), next to the act's notes: their cue
// sheet as they uploaded or typed it, or an empty one for the LD to fill in.
export function CueSheetButton({ act, onClick, size = "md" }) {
  const has = cueSheetHasAny(act?.lighting_cues);
  const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={`Cue sheet for ${act?.band_name || "this act"}${has ? " (has cues)" : ""}`} title="Cue sheet"
      className={`relative ${box} shrink-0 rounded-[10px] border border-[#2a2a2a] bg-[#141414] flex items-center justify-center hover:border-[#8CFF3D]/50`}
      style={{ color: has ? G : "rgba(140,255,61,0.55)" }}>
      <ListMusic className={size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} />
      {has && <span aria-hidden="true" className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: G }} />}
    </button>
  );
}

// acts, start (index); onChange(i, sheet) when editable; onSave(i) (optional,
// a Save button); onUpload(file) -> url for the cue sheet files.
// eventLine: "Sat, Dec 5 · The Fillmore" on the PDF (job 418).
export default function CueSheetWindow({ acts = [], start = 0, onChange = null, onSave = null, saving = false, onUpload = uploadCueFile, onClose, eventLine = "" }) {
  const [cur, setCur] = useState(start);
  const [styling, setStyling] = useState(false); // the PDF style sheet (job 451)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const act = acts[cur];
  if (!act) return null;
  const summary = cueSheetSummary(act.lighting_cues);
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Lighting cues" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[620px] max-h-[94dvh] bg-[#111] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl flex flex-col">
        <div className="shrink-0 px-4 pt-4 pb-3 flex items-start gap-3 border-b border-[#1f1f1f]">
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] tracking-[0.18em] text-white/45" style={{ fontFamily: SCENE_MONO }}>LIGHTING CUES</div>
            <div className="text-white text-[18px] font-semibold truncate">{act.band_name || `Act ${cur + 1}`}</div>
            {summary && <div className="text-white/45 text-[12.5px]">{summary}</div>}
          </div>
          {/* The act's cue sheet as a PDF (job 418); styled first like the
              other PDFs - background and font color (job 451). */}
          {cueSheetHasAny(act.lighting_cues) && (
            <button type="button" onClick={() => setStyling(true)} aria-label={`${act.band_name || "This act"}'s cue sheet as a PDF`}
              className="h-10 px-3 rounded-[6px] border text-[13px] font-bold shrink-0 flex items-center gap-1.5" style={{ borderColor: "#2f4d1f", color: G, background: "#13200b" }}>
              <FileText className="w-4 h-4" />PDF
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center text-white/50"><X className="w-5 h-5" /></button>
        </div>
        {acts.length > 1 && (
          <div className="shrink-0 px-4 pt-3 flex gap-1.5 flex-wrap">
            {acts.map((a, i) => (
              <button key={i} type="button" onClick={() => setCur(i)} aria-pressed={i === cur}
                className="min-h-[34px] px-3 rounded-full border text-[13px] font-semibold"
                style={i === cur ? { borderColor: G, background: G, color: "#0d0d0d" } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" }}>
                {a.band_name || `Act ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
          <CueSheetEditor key={cur} value={act.lighting_cues} readOnly={!onChange} onChange={onChange ? (v) => onChange(cur, v) : undefined} onUpload={onUpload}
            notesPlaceholder="Notes for this act's show (no strobes, haze ok, follow spot on the singer…)" />
        </div>
        {onSave && (
          <div className="shrink-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 border-t border-[#1f1f1f]">
            <button type="button" onClick={() => onSave(cur)} disabled={saving} className="w-full min-h-[48px] rounded-xl font-semibold text-[15px] disabled:opacity-60" style={{ background: G, color: "#0d0d0d" }}>
              {saving ? "Saving…" : "Save cues"}
            </button>
          </div>
        )}
        {styling && (
          <PdfStyleSheet title="Lighting cues" eventName={act.band_name || `Act ${cur + 1}`}
            previewLine={summary || "Songs and cues"}
            onCreate={async (style) => {
              try { await saveOrShare(await cueSheetFile({ actName: act.band_name || `Act ${cur + 1}`, eventLine, sheet: act.lighting_cues, style })); }
              catch (e) { if (e?.needsTap) throw e; console.error(e); toast({ title: "Couldn't make the PDF", variant: "destructive" }); }
            }}
            onClose={() => setStyling(false)} />
        )}
      </div>
    </div>,
    document.body
  );
}
