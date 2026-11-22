import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Box, Plus, X } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import RigLayer from "@/components/showpilot/RigLayer";
import StageBuilder from "@/components/showpilot/StageBuilder";
import { emptyRig, normalizeRig, rigHasItems, rigSummary } from "@/lib/lightingRig";
import { useLdStages, saveLdStage } from "@/lib/ldStages";
import { toast } from "@/components/ui/use-toast";

const AMBER = "#8CFF3D"; // job 407: lighting is green (was amber)

// The event's 3D stage, for the LD (job 383): load one of their stages or
// build one from scratch. It goes out with their intake links (artists place
// their members on it) and is what the LD opens on the event.
//   rig, onChange(rig), venueName (a new stage is saved under it),
//   acts + onActs(acts): the event's acts, to set looks on their cues (job 387)
export default function LdStageCard({ rig, onChange, venueName = "", acts = null, onActs = null }) {
  const [picking, setPicking] = useState(false);
  const [building, setBuilding] = useState(false);
  const [stages, reload] = useLdStages();
  const has = rigHasItems(rig);
  const r = has ? normalizeRig(rig) : null;
  const usable = (stages || []).filter((s) => s.hasRig);
  return (
    <div className="rounded-[12px] border border-[#2c2c2c] bg-[#121212] p-2.5 flex items-center gap-3">
      <button type="button" onClick={() => setBuilding(true)} aria-label={has ? "Open the 3D stage" : "Build the 3D stage"}
        className="relative w-[112px] shrink-0 rounded-[8px] border border-[#333] border-b-2 border-b-white bg-black overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
        {r ? <RigLayer rig={r} /> : <Box className="w-6 h-6 text-white/25 absolute inset-0 m-auto" />}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div>
          <div className="text-[10px] tracking-[0.18em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>3D STAGE</div>
          <div className="text-white text-[14.5px] font-semibold truncate">{has ? rigSummary(r) || "Rigged" : "No stage yet"}</div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" onClick={() => setPicking(true)} className="h-9 px-2.5 rounded-[6px] border border-[#333] bg-[#1d1d1d] text-[12.5px] font-semibold text-white/85">Load a stage</button>
          <button type="button" onClick={() => setBuilding(true)} className="h-9 px-2.5 rounded-[6px] text-[12.5px] font-bold" style={{ background: AMBER, color: "#111" }}>{has ? "Rig it" : "Build from scratch"}</button>
        </div>
      </div>

      {picking && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/75 flex items-end sm:items-center justify-center p-3" onClick={() => setPicking(false)}>
          <div role="dialog" aria-label="Your stages" onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] max-h-[85dvh] overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 flex flex-col gap-3">
            <div className="flex items-center">
              <div className="flex-1">
                <div className="text-[10px] tracking-[0.18em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>YOUR STAGES</div>
                <div className="text-white text-[17px] font-semibold">Load a 3D stage</div>
              </div>
              <button type="button" onClick={() => setPicking(false)} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center text-white/50"><X className="w-5 h-5" /></button>
            </div>
            {stages === null ? <p className="text-white/45 text-[13px]">Loading…</p> : usable.length === 0 ? (
              <p className="text-white/50 text-[13.5px]">No stages yet. Build one here, or in Rig the stage.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {usable.map((s) => (
                  <button key={s.id} type="button" onClick={() => { onChange({ ...s.rig, name: s.name || "" }); setPicking(false); toast({ title: `Loaded ${s.name || "the stage"}` }); }}
                    className="rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-1.5 text-left hover:border-[#8CFF3D]/60">
                    <span className="relative block w-full rounded-[6px] border border-[#333] border-b-2 border-b-white bg-black overflow-hidden" style={{ aspectRatio: "4 / 3" }}><RigLayer rig={s.rig} /></span>
                    <span className="block mt-1.5 px-0.5 text-[13.5px] font-semibold text-white truncate">{s.name || "Untitled"}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => { setPicking(false); setBuilding(true); }} className="h-11 rounded-[8px] border border-dashed border-[#3a3a3a] text-[13.5px] font-semibold text-white/75 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />Build from scratch</button>
          </div>
        </div>,
        document.body
      )}
      {building && <EventStageBuilder rig={rig} venueName={venueName} onChange={onChange} acts={acts} onActs={onActs} onSaved={reload} onClose={() => setBuilding(false)} />}
    </div>
  );
}

// The event's stage in Rig the stage (job 387): Save puts it on the event,
// keeps it with the LD's stages under the venue's name, and hands back any
// looks set on the acts' cues.
export function EventStageBuilder({ rig, venueName = "", onChange, acts = null, onActs = null, startAct = 0, startTab = "rig", onSaved, onClose }) {
  const has = rigHasItems(rig) || (rig?.cues || []).length > 0;
  return (
    // The stage's name: the template loaded on it (job 458), else the venue.
    <StageBuilder name={rig?.name || venueName || ""} rig={has ? normalizeRig(rig) : emptyRig()} title="THIS EVENT'S STAGE" acts={acts} startAct={startAct} startTab={startTab}
      onClose={onClose}
      onSave={async ({ name, rig: next, acts: nextActs }) => {
        const named = String(name || "").trim();
        onChange(named ? { ...next, name: named } : (({ name: _n, ...rest }) => rest)(next));
        if (nextActs && onActs) onActs(nextActs);
        onClose();
        try { await saveLdStage({ name: name || venueName || "My stage", rig: next }); onSaved?.(); toast({ title: "Stage set for this event and saved to your stages" }); }
        catch (e) { console.error(e); toast({ title: "Set for this event (couldn't save it to your stages)" }); }
      }} />
  );
}
