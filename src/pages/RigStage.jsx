import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import BottomTabs from "@/components/showpilot/BottomTabs";
import RigLayer from "@/components/showpilot/RigLayer";
import StageBuilder from "@/components/showpilot/StageBuilder";
import { useLdStages, saveLdStage } from "@/lib/ldStages";
import { emptyRig } from "@/lib/lightingRig";
import useRigThumbs from "@/components/showpilot/RigThumbs";
import { toast } from "@/components/ui/use-toast";

const AMBER = "#FFB400";

// Rig the stage (job 383): the LD's 3D stages, one per venue, kept as
// templates. Open one to rig it and play looks on it, or start a new one.
export default function RigStage() {
  const navigate = useNavigate();
  const [stages, reload] = useLdStages();
  const [open, setOpen] = useState(null); // { id, name, rig } | "new"
  const [saving, setSaving] = useState(false);
  const save = async ({ name, rig }) => {
    setSaving(true);
    try {
      await saveLdStage({ id: open?.id || null, name, rig });
      toast({ title: "Stage saved to your templates" });
      setOpen(null);
      reload();
    } catch (e) { console.error(e); toast({ title: "Couldn't save the stage", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };
  const withRig = (stages || []).filter((s) => s.hasRig);
  // Each stage pictured as it was built, in 3D (job 396).
  const [thumbs, drawer] = useRigThumbs(withRig);
  const without = (stages || []).filter((s) => !s.hasRig);
  return (
    <div className="min-h-screen bg-[#111] text-white pb-28">
      <div className="max-w-[1100px] mx-auto px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 py-2">
          <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="w-10 h-10 -ml-2 flex items-center justify-center text-white/70"><ChevronLeft className="w-6 h-6" /></button>
          <div className="flex-1">
            <div className="text-[10.5px] tracking-[0.2em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>STAGES</div>
            <h1 className="text-[22px] font-bold leading-tight">Rig the stage</h1>
          </div>
          <button type="button" onClick={() => setOpen({ id: null, name: "", rig: emptyRig() })} className="h-11 px-4 rounded-[6px] font-bold text-[14px] flex items-center gap-1.5" style={{ background: AMBER, color: "#111" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} />New stage
          </button>
        </div>
        <p className="text-white/50 text-[13.5px] mb-4">Build each venue's stage in 3D, play looks on it, and send it with your intake links: artists place their members right on it.</p>

        {stages === null ? (
          <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-[#FFB400]/30 border-t-[#FFB400] rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {withRig.map((s) => (
                <button key={s.id} type="button" onClick={() => setOpen({ id: s.id, name: s.name, rig: s.rig })}
                  className="rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-2 text-left hover:border-[#FFB400]/60">
                  <span className="relative block w-full rounded-[6px] border border-[#333] bg-black overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                    {thumbs[s.id]
                      ? <img src={thumbs[s.id]} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      : <span className="absolute inset-0 opacity-50"><RigLayer rig={s.rig} /></span>}
                  </span>
                  <span className="block mt-2 px-1 pb-1 text-[15px] font-semibold truncate">{s.name || "Untitled stage"}</span>
                </button>
              ))}
              {!withRig.length && (
                <button type="button" onClick={() => setOpen({ id: null, name: "", rig: emptyRig() })}
                  className="rounded-[8px] border border-dashed border-[#3a3a3a] min-h-[200px] flex flex-col items-center justify-center gap-2 text-white/60 hover:border-[#FFB400]/60">
                  <Plus className="w-7 h-7" />
                  <span className="text-[14px] font-semibold">Rig your first stage</span>
                </button>
              )}
            </div>
            {without.length > 0 && (
              <div className="mt-6">
                <div className="text-[10.5px] tracking-[0.18em] text-white/45 mb-2" style={{ fontFamily: SCENE_MONO }}>VENUES WITHOUT A STAGE YET</div>
                <div className="flex flex-wrap gap-2">
                  {without.map((s) => (
                    <button key={s.id} type="button" onClick={() => setOpen({ id: s.id, name: s.name, rig: emptyRig() })}
                      className="h-10 px-3 rounded-[6px] border border-[#2c2c2c] bg-[#1a1a1a] text-[13.5px] text-white/80 flex items-center gap-1.5 hover:border-[#FFB400]/60">
                      <Plus className="w-3.5 h-3.5 text-white/45" />{s.name || "Untitled venue"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {drawer}
      {open && <StageBuilder name={open.name} rig={open.rig} saving={saving} onSave={save} onClose={() => setOpen(null)} />}
      <div className="lg:hidden"><BottomTabs /></div>
    </div>
  );
}
