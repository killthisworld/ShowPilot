import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import BottomTabs from "@/components/showpilot/BottomTabs";
import RigLayer from "@/components/showpilot/RigLayer";
import StageBuilder from "@/components/showpilot/StageBuilder";
import { useLdStages, saveStageParts } from "@/lib/ldStages";
import { emptyRig, isTruss, isLight, isScreen, isPerson } from "@/lib/lightingRig";
import useRigThumbs from "@/components/showpilot/RigThumbs";
import { toast } from "@/components/ui/use-toast";

const G = "#8CFF3D"; // the lighting tech's color (job 407: green, like audio)
const mono = { fontFamily: SCENE_MONO };

// Rig the stage (job 383): the LD's 3D stages, one per venue, kept as
// templates. Open one to rig it and play looks on it, or start a new one.
// Job 407: laid out like a console's stage pool - a window with a title
// bar, and each stage a numbered pool cell with its 3D picture, name and
// what's rigged on it.
export default function RigStage() {
  const navigate = useNavigate();
  const [stages, reload] = useLdStages();
  const [open, setOpen] = useState(null); // { id, name, rig }
  const [saving, setSaving] = useState(false);
  // The Save window's choice (job 407): the lights to this venue's stage,
  // the band to an artist template. The stage stays open after saving.
  const save = async ({ name, rig, parts, artist }) => {
    setSaving(true);
    try {
      const out = await saveStageParts({ id: open?.id || null, name, rig, parts, artist });
      if (out.venueId) setOpen((o) => (o ? { ...o, id: out.venueId, name } : o));
      toast({ title: [out.venueId && "Lights saved to your stages", out.bandId && `Band saved to ${artist}`].filter(Boolean).join(" · ") || "Saved" });
      reload();
    } catch (e) { console.error(e); toast({ title: "Couldn't save the stage", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };
  const withRig = (stages || []).filter((s) => s.hasRig);
  // Each stage pictured as it was built, in 3D (job 396).
  const [thumbs, drawer] = useRigThumbs(withRig);
  const without = (stages || []).filter((s) => !s.hasRig);
  const count = (s, f) => (s.rig.items || []).filter((i) => f(i.type)).length;
  const fresh = () => setOpen({ id: null, name: "", rig: emptyRig() });
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white pb-28">
      <div className="max-w-[1100px] mx-auto px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 py-2">
          <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="w-10 h-10 -ml-2 flex items-center justify-center text-white/70"><ChevronLeft className="w-6 h-6" /></button>
          <div className="flex-1">
            <div className="text-[10.5px] tracking-[0.2em]" style={{ ...mono, color: G }}>STAGES</div>
            <h1 className="text-[22px] font-bold leading-tight">Rig the stage</h1>
          </div>
          <button type="button" onClick={fresh} className="h-11 px-4 rounded-[5px] font-bold text-[14px] flex items-center gap-1.5" style={{ background: G, color: "#111" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} />New stage
          </button>
        </div>
        <p className="text-white/50 text-[13.5px] mb-4">Build each venue's stage in 3D, play looks on it, and send it with your intake links: artists place their members right on it.</p>

        {/* The pool window */}
        <div className="rounded-[6px] border overflow-hidden" style={{ borderColor: "#2a2a2a", background: "#111" }}>
          <div className="h-9 px-3 flex items-center gap-3 border-b" style={{ ...mono, borderColor: "#2a2a2a", background: "linear-gradient(#1d1d1d, #151515)" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: G, boxShadow: `0 0 6px ${G}` }} />
            <span className="text-[11.5px] tracking-[0.18em] font-bold" style={{ color: G }}>STAGE POOL</span>
            <span className="text-[11px] text-white/40">{stages ? `${withRig.length} RIGGED` : ""}</span>
            <span className="ml-auto text-[11px] text-white/35 hidden sm:inline">TAP A CELL TO OPEN</span>
          </div>
          {stages === null ? (
            <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${G}44`, borderTopColor: G }} /></div>
          ) : (
            <div className="p-2 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", backgroundImage: "linear-gradient(#161616 1px, transparent 1px), linear-gradient(90deg, #161616 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
              {withRig.map((s, i) => (
                <button key={s.id} type="button" onClick={() => setOpen({ id: s.id, name: s.name, rig: s.rig })}
                  className="group rounded-[4px] border text-left overflow-hidden flex flex-col transition-colors" style={{ borderColor: "#2e2e2e", background: "#0d0d0d" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = G; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2e2e2e"; }}>
                  <span className="h-6 px-1.5 flex items-center gap-2 text-[10.5px] border-b" style={{ ...mono, borderColor: "#262626", background: "#151515" }}>
                    <span className="px-1 rounded-[2px] font-bold" style={{ background: G, color: "#0b0b0b" }}>{i + 1}</span>
                    <span className="truncate text-white/55">STAGE</span>
                  </span>
                  <span className="relative block w-full bg-black overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                    {thumbs[s.id]
                      ? <img src={thumbs[s.id]} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      : <span className="absolute inset-0 opacity-50"><RigLayer rig={s.rig} /></span>}
                  </span>
                  <span className="block px-2 pt-1.5 text-[14.5px] font-semibold truncate">{s.name || "Untitled stage"}</span>
                  <span className="px-2 pb-2 pt-1 grid grid-cols-4 gap-1 text-[10px]" style={mono}>
                    {[["TRS", count(s, isTruss)], ["FIX", count(s, isLight)], ["LED", count(s, isScreen)], ["PPL", count(s, isPerson)]].map(([k, v]) => (
                      <span key={k} className="h-6 rounded-[2px] border flex items-center justify-center gap-1" style={{ borderColor: "#262626", background: "#141414", color: v ? "#cfcfcf" : "#555" }}>
                        <span style={{ color: v ? G : "#555" }}>{k}</span>{v}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
              <button type="button" onClick={fresh}
                className="rounded-[4px] border border-dashed min-h-[200px] flex flex-col items-center justify-center gap-2 text-white/50" style={{ borderColor: "#333", background: "#0d0d0d" }}>
                <Plus className="w-7 h-7" />
                <span className="text-[13px] font-semibold" style={mono}>{withRig.length ? "NEW STAGE" : "RIG YOUR FIRST STAGE"}</span>
              </button>
            </div>
          )}
        </div>
        {without.length > 0 && (
          <div className="mt-6">
            <div className="text-[10.5px] tracking-[0.18em] text-white/45 mb-2" style={mono}>VENUES WITHOUT A STAGE YET</div>
            <div className="flex flex-wrap gap-2">
              {without.map((s) => (
                <button key={s.id} type="button" onClick={() => setOpen({ id: s.id, name: s.name, rig: emptyRig() })}
                  className="h-10 px-3 rounded-[4px] border border-[#2c2c2c] bg-[#151515] text-[13.5px] text-white/80 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-white/45" />{s.name || "Untitled venue"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {drawer}
      {open && <StageBuilder name={open.name} rig={open.rig} saving={saving} onSave={save} onClose={() => { setOpen(null); reload(); }} saveParts />}
      <div className="lg:hidden"><BottomTabs /></div>
    </div>
  );
}
