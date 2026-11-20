import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { normalizeRig, rigHasItems } from "@/lib/lightingRig";
import { cueSteps, LOOK_KEYS, lookFromKeys } from "@/lib/cueLooks";
import { memberLook } from "@/lib/customPositions";
import { memberSings, isVocalInput } from "@/components/showpilot/VocalsQuestion";
import { useMyStageColors, instrumentsOf } from "@/components/showpilot/StagePlotView";
import { emptyRig } from "@/lib/lightingRig";

const Stage3D = lazy(() => import("@/components/showpilot/Stage3D"));
const AMBER = "#FFB400";
const KEY = { background: "#262626", borderColor: "#333", color: "#d6d6d6" };

// The LD's view of an act on the event (job 383): the event's 3D stage with
// the act's members where they put themselves (look-only, no audio details),
// and their cue sheet played on the rig - GO / BACK through the cues, or Auto
// to step with the song's BPM.
export default function LdStageWindow({ acts = [], start = 0, rig, onClose, onOpenCues = null }) {
  const [cur, setCur] = useState(start);
  const [step, setStep] = useState(-1); // -1 = house look (no cue)
  const [auto, setAuto] = useState(false);
  const [keys, setKeys] = useState({});
  const colors = useMyStageColors();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const act = acts[cur] || {};
  const r = useMemo(() => (rigHasItems(rig) ? normalizeRig(rig) : emptyRig()), [rig]);
  const members = useMemo(() => (act.band_members || []).filter((m) => typeof m.stage_x === "number").map((m) => {
    const insts = instrumentsOf(m);
    const played = insts.filter((x) => !isVocalInput(x)).map((x) => x.name).filter(Boolean);
    const sings = memberSings(m, insts);
    return { x: m.stage_x, y: m.stage_y, color: memberLook(m, instrumentsOf, colors).color, name: m.name || "", sub: [...played, ...(sings ? ["Vocals"] : [])].join(", "), sings };
  }), [act, colors]);
  const steps = useMemo(() => cueSteps(act.lighting_cues), [act]);
  const s = step >= 0 ? steps[step] : null;
  const look = s ? s.look : Object.values(keys).some(Boolean) ? lookFromKeys(keys) : null;

  // Auto: the next cue after 16 beats of the song's tempo.
  useEffect(() => {
    if (!auto || !steps.length) return undefined;
    const bpm = Number(s?.song?.bpm) || 120;
    const id = window.setTimeout(() => setStep((i) => (i + 1 < steps.length ? i + 1 : (setAuto(false), i))), (60 / bpm) * 16 * 1000);
    return () => window.clearTimeout(id);
  }, [auto, step, steps, s]);
  useEffect(() => { setStep(-1); setAuto(false); }, [cur]);

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-[#111] text-white flex flex-col" style={{ height: "100dvh" }} role="dialog" aria-label="3D stage">
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 border-b border-[#2a2a2a] bg-[#0f0f0f]">
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 -ml-1 flex items-center justify-center text-white/70"><ChevronLeft className="w-6 h-6" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.2em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>3D STAGE</div>
          <div className="text-[17px] font-semibold truncate">{act.band_name || `Act ${cur + 1}`}</div>
        </div>
        {onOpenCues && <button type="button" onClick={() => onOpenCues(cur)} className="h-10 px-3 rounded-[6px] border text-[13px] font-semibold" style={KEY}>Cue sheet</button>}
      </div>
      {acts.length > 1 && (
        <div className="shrink-0 px-3 py-2 flex gap-1.5 overflow-x-auto border-b border-[#222]">
          {acts.map((a, i) => (
            <button key={i} type="button" onClick={() => setCur(i)} aria-pressed={i === cur} className="shrink-0 h-9 px-3 rounded-[6px] border text-[13px] font-semibold"
              style={i === cur ? { background: AMBER, borderColor: AMBER, color: "#111" } : KEY}>{a.band_name || `Act ${i + 1}`}</button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="relative flex-1 min-h-[42dvh]">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading the stage…</div>}>
            <Stage3D rig={r} members={members} look={look} mode="view" />
          </Suspense>
          {!members.length && <p className="absolute top-3 left-0 right-0 text-center text-white/50 text-[13px] pointer-events-none px-6">No one placed on the stage yet. They place themselves on your intake link.</p>}
          {s && (
            <div className="absolute left-3 right-3 bottom-3 rounded-[8px] bg-black/70 border border-[#333] px-3 py-2 pointer-events-none">
              <div className="text-[10px] tracking-[0.16em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>CUE {step + 1} / {steps.length} · {(s.song.title || `SONG ${s.songIndex + 1}`).toUpperCase()}</div>
              <div className="text-[15px] font-semibold truncate">{s.cue.at ? `${s.cue.at.trim()}: ` : ""}{s.cue.look || "—"}</div>
            </div>
          )}
        </div>
        {/* The playback: the act's cues, MA style. */}
        <div className="lg:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#2a2a2a] bg-[#141414] p-3 pb-[max(14px,env(safe-area-inset-bottom))] flex flex-col gap-3 max-h-[46dvh] lg:max-h-none overflow-y-auto">
          {steps.length ? (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                <button type="button" onClick={() => setStep((i) => Math.max(-1, i - 1))} aria-label="Back a cue" className="h-14 rounded-[6px] border flex items-center justify-center" style={KEY}><SkipBack className="w-5 h-5" /></button>
                <button type="button" onClick={() => setAuto((a) => !a)} aria-pressed={auto} aria-label={auto ? "Stop auto" : "Auto"} className="h-14 rounded-[6px] border flex flex-col items-center justify-center text-[10px] font-bold tracking-[0.1em]"
                  style={auto ? { background: "#0f2f37", borderColor: "#3DD6F5", color: "#3DD6F5" } : KEY}>{auto ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}AUTO</button>
                <button type="button" onClick={() => setStep((i) => Math.min(steps.length - 1, i + 1))} aria-label="Go: next cue"
                  className="col-span-2 h-14 rounded-[6px] text-[20px] font-black tracking-[0.16em] flex items-center justify-center gap-1.5" style={{ background: AMBER, color: "#111" }}>GO<SkipForward className="w-5 h-5" /></button>
              </div>
              <div className="flex flex-col gap-1">
                {steps.map((x, i) => (
                  <button key={i} type="button" onClick={() => setStep(i)} className="min-h-[40px] px-2.5 rounded-[6px] border text-left flex items-center gap-2"
                    style={i === step ? { background: "#3a2b00", borderColor: AMBER } : { background: "#1b1b1b", borderColor: "#2a2a2a" }}>
                    <span className="w-7 text-[11px] tabular-nums" style={{ fontFamily: SCENE_MONO, color: i === step ? AMBER : "#888" }}>{i + 1}</span>
                    {(x.cue.color || x.song.color) && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: x.cue.color || x.song.color }} />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] text-white/50 truncate">{x.song.title || `Song ${x.songIndex + 1}`}{x.cue.at ? ` · ${x.cue.at.trim()}` : ""}</span>
                      <span className="block text-[13.5px] text-white truncate">{x.cue.look || "—"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-white/50 text-[13px]">No cues from this act yet. Try looks on the rig:</p>
              <div className="grid grid-cols-3 gap-1.5">
                {LOOK_KEYS.map((k) => (
                  <button key={k.id} type="button" onClick={() => setKeys((m) => (k.id === "blackout" ? { blackout: !m.blackout } : { ...m, blackout: false, [k.id]: !m[k.id] }))} aria-pressed={!!keys[k.id]}
                    className="h-12 rounded-[6px] border text-[12px] font-bold" style={keys[k.id] ? { background: "#3a2b00", borderColor: AMBER, color: AMBER } : KEY}>{k.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
