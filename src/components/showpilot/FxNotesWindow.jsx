import React, { useState } from "react";
import { createPortal } from "react-dom";
import { StickyNote, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

// FX / Artist Notes (jobs 167 / 169 / 205): one box, and one row of chips under
// it - General (whole show), then each act; the box shows whichever is picked.
// An act's box is its notes plus any per-member notes it sent on the intake
// form as "Name: note" lines; editing saves the whole text as the act's notes.
// Opened from the notes button on each act's row (by its set time) in every
// layout. Hosts decide who can edit what and how it's saved:
//   acts, target (an act index or "__show__"), onTarget
//   showNotes, onShowNotes (null = read only)
//   onActNotes(i, text) (null = read only)
//   onSave / saving / saved (optional: a Save button, for pages without one)
const G = "#8CFF3D";

export const actNotesText = (b) => {
  const members = (b?.artist_fx_notes || [])
    .filter((n) => n.artist_name && String(n.notes || "").trim())
    .map((n) => `${n.artist_name}: ${n.notes}`);
  return [b?.general_notes || "", ...members].filter((t) => String(t).trim()).join("\n\n");
};
export const actHasNotes = (b) => !!(b?.general_notes || (b?.artist_fx_notes || []).some((n) => n.notes));

// One act's notes (job 278), opened from its stage: General is that act's
// general notes, then a chip per member for their own notes.
//   act, onPatch({ general_notes } | { artist_fx_notes }) (null = read only)
function ActNotes({ act, onPatch, onSave, saving, saved, onClose }) {
  const [who, setWho] = useState(null); // null = General, else a member's name
  const members = (act?.band_members || []).filter((m) => String(m?.name || "").trim());
  const notes = act?.artist_fx_notes || [];
  const noteOf = (name) => notes.find((n) => n.artist_name === name)?.notes || "";
  const cur = who && members.some((m) => m.name === who) ? who : null;
  const editable = !!onPatch;
  const actLabel = act?.band_name || act?.role || "this act";
  const chip = (on) => `px-3 py-1.5 rounded-full text-[13px] border transition-all flex items-center gap-1.5 ${on ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#2a2a2a] text-white/55 hover:text-white/80"}`;
  const change = (v) => {
    if (!cur) { onPatch?.({ general_notes: v }); return; }
    const has = notes.some((n) => n.artist_name === cur);
    onPatch?.({ artist_fx_notes: has ? notes.map((n) => (n.artist_name === cur ? { ...n, notes: v } : n)) : [...notes, { artist_name: cur, notes: v }] });
  };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-3" style={{ height: "100dvh" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="FX / Artist Notes" className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg flex items-center gap-2 min-w-0">
            <StickyNote className="w-5 h-5 shrink-0" style={{ color: G }} /> <span className="truncate">{actLabel} notes</span>
          </h3>
          <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-white/40 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <Textarea
            key={cur || "__general__"}
            value={cur ? noteOf(cur) : (act?.general_notes || "")}
            readOnly={!editable}
            onChange={(e) => change(e.target.value)}
            className="bg-[#111] border-[#222] text-white text-[15px] leading-relaxed min-h-[48dvh]"
            placeholder={editable ? (cur ? `Notes for ${cur} (FX, monitor mix, etc.)...` : `General notes for ${actLabel}...`) : "No notes yet."}
          />
          {!editable && <p className="text-white/40 text-xs -mt-1">Only the owner or the Manager / Artist can change an act's notes.</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" onClick={() => setWho(null)} className={chip(!cur)}>
              General {act?.general_notes ? <span aria-label="has notes">●</span> : null}
            </button>
            {members.map((m, i) => (
              <button type="button" key={`${m.name}-${i}`} onClick={() => setWho(m.name)} className={chip(cur === m.name)}>
                {m.name} {noteOf(m.name) ? <span aria-label="has notes">●</span> : null}
              </button>
            ))}
          </div>
          {onSave && editable && (
            <button type="button" onClick={onSave} disabled={saving} className="w-full h-11 rounded-xl text-[#0d0d0d] font-semibold disabled:opacity-60" style={{ background: G }}>
              {saving ? "Saving..." : saved ? "Saved ✓" : "Save notes"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// `actOnly` (an act index): just that act's notes, General + its members
// (ActNotes above), edited with onActPatch(i, patch).
export default function FxNotesWindow({ acts = [], target, onTarget, showNotes = "", onShowNotes = null, onActNotes = null, onSave, saving = false, saved = false, onClose, actOnly = null, onActPatch = null }) {
  if (actOnly !== null && acts[actOnly]) {
    return <ActNotes act={acts[actOnly]} onPatch={onActPatch ? (patch) => onActPatch(actOnly, patch) : null} onSave={onSave} saving={saving} saved={saved} onClose={onClose} />;
  }
  const isShow = target === "__show__" || !acts[target];
  const act = isShow ? null : acts[target];
  const actLabel = (b) => b.band_name || b.role || "Act";
  const editable = isShow ? !!onShowNotes : !!onActNotes;
  const chip = (on) => `px-3 py-1.5 rounded-full text-[13px] border transition-all flex items-center gap-1.5 ${on ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#2a2a2a] text-white/55 hover:text-white/80"}`;

  return createPortal(
    // Above the stage plot page (z-80), which opens it too (job 272).
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-3" style={{ height: "100dvh" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="FX / Artist Notes" className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <StickyNote className="w-5 h-5" style={{ color: G }} /> FX / Artist Notes
          </h3>
          <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-white/40 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <Textarea
            key={String(target)}
            value={isShow ? (showNotes || "") : actNotesText(act)}
            readOnly={!editable}
            onChange={(e) => (isShow ? onShowNotes?.(e.target.value) : onActNotes?.(target, e.target.value))}
            className="bg-[#111] border-[#222] text-white text-[15px] leading-relaxed min-h-[48dvh]"
            placeholder={editable ? (isShow ? "General notes for the whole show..." : `Notes for ${actLabel(act)}...`) : "No notes yet."}
          />
          {!editable && (
            <p className="text-white/40 text-xs -mt-1">
              {isShow ? "Only the Audio / Lighting crew can change the General notes." : "Only the owner or the Manager / Artist can change an act's notes."}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" onClick={() => onTarget("__show__")} className={chip(isShow)}>
              General {showNotes ? <span aria-label="has notes">●</span> : null}
            </button>
            {acts.map((b, i) => (
              <button type="button" key={b.id || `fx-${i}`} onClick={() => onTarget(i)} className={chip(!isShow && target === i)}>
                {actLabel(b)} {actHasNotes(b) ? <span aria-label="has notes">●</span> : null}
              </button>
            ))}
          </div>

          {onSave && (onShowNotes || onActNotes) && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="w-full h-11 rounded-xl text-[#0d0d0d] font-semibold disabled:opacity-60"
              style={{ background: G }}
            >
              {saving ? "Saving..." : saved ? "Saved ✓" : "Save notes"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// The notes button on an act's row (by its set time).
export function ActNotesButton({ act, onClick, size = "md" }) {
  const has = actHasNotes(act);
  const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={`FX / Artist Notes for ${act?.band_name || "this act"}${has ? " (has notes)" : ""}`}
      title="FX / Artist Notes"
      className={`relative ${box} shrink-0 rounded-[10px] border border-[#2a2a2a] bg-[#141414] flex items-center justify-center hover:border-[#8CFF3D]/50`}
      style={{ color: has ? G : "rgba(140,255,61,0.55)" }}
    >
      <StickyNote className={size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} />
      {has && <span aria-hidden="true" className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: G }} />}
    </button>
  );
}
