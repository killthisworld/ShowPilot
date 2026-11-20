import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { normalizeRig, rigHasItems } from "@/lib/lightingRig";
import { cueSteps, LOOK_KEYS, lookFromKeys, cueSecs } from "@/lib/cueLooks";
import { CueRow, useCuePlayer } from "@/components/showpilot/CueRow";
import { memberLook } from "@/lib/customPositions";
import { memberSings, isVocalInput } from "@/components/showpilot/VocalsQuestion";
import { useMyStageColors, instrumentsOf } from "@/components/showpilot/StagePlotView";
import { emptyRig } from "@/lib/lightingRig";
import { positionOfMember } from "@/lib/stagePositions";

// An act's members where they put themselves, for Stage3D (job 387).
export function actMembers3D(act, colors) {
  return (act?.band_members || []).filter((m) => typeof m.stage_x === "number").map((m) => {
    const insts = instrumentsOf(m);
    const played = insts.filter((x) => !isVocalInput(x)).map((x) => x.name).filter(Boolean);
    const sings = memberSings(m, insts);
    return { x: m.stage_x, y: m.stage_y, color: memberLook(m, instrumentsOf, colors).color, name: m.name || "", sub: [...played, ...(sings ? ["Vocals"] : [])].join(", "), sings, part: positionOfMember(m, instrumentsOf) };
  });
}

const Stage3D = lazy(() => import("@/components/showpilot/Stage3D"));
const AMBER = "#8CFF3D"; // job 407: lighting is green (was amber)
const KEY = { background: "#262626", borderColor: "#333", color: "#d6d6d6" };

// The LD's view of an act on the event (job 383): the event's 3D stage with
// the act's members where they put themselves (look-only, no audio details),
// and their cue sheet played on the rig - GO / BACK through the cues, or Auto
// to step with the song's BPM.
export default function LdStageWindow({ acts = [], start = 0, rig, onClose, onOpenCues = null }) {
  const [cur, setCur] = useState(start);
  const [step, setStep] = useState(-1);
  const [play, startPlay, stopPlay, plays] = useCuePlayer(); // job 389: a tapped cue plays through once; job 421: several together
  const [keys, setKeys] = useState({});
  const colors = useMyStageColors();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const act = acts[cur] || {};
  const r = useMemo(() => (rigHasItems(rig) ? normalizeRig(rig) : emptyRig()), [rig]);
  const members = useMemo(() => actMembers3D(act, colors), [act, colors]);
  const steps = useMemo(() => cueSteps(act.lighting_cues), [act]);
  const s = play ? steps[play.i] : null;
  const look = plays.length
    ? plays.map((p) => steps[p.i] && { ...steps[p.i].look, key: p.key, startAt: p.at }).filter(Boolean)
    : Object.values(keys).some(Boolean) ? lookFromKeys(keys) : null;

  useEffect(() => { setStep(-1); stopPlay(); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <div className="text-[10px] tracking-[0.16em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>CUE {play.i + 1} / {steps.length} · {(s.song.title || `SONG ${s.songIndex + 1}`).toUpperCase()}</div>
              <div className="text-[15px] font-semibold truncate">{s.cue.at ? `${s.cue.at.trim()}: ` : ""}{s.cue.look || "—"}</div>
            </div>
          )}
        </div>
        {/* The playback: the act's cues, MA style. */}
        <div className="lg:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#2a2a2a] bg-[#141414] p-3 pb-[max(14px,env(safe-area-inset-bottom))] flex flex-col gap-3 max-h-[46dvh] lg:max-h-none overflow-y-auto">
          {steps.length ? (
            <>
              <p className="text-white/45 text-[12.5px]">Tap a cue to play it through on the stage.</p>
              <div className="flex flex-col gap-1">
                {steps.map((x, i) => (
                  <CueRow key={i} n={i + 1} title={x.cue.look || "—"} sub={`${x.song.title || `Song ${x.songIndex + 1}`}${x.cue.at ? ` · ${x.cue.at.trim()}` : ""}`}
                    color={x.cue.color || x.song.color || ""} active={i === step} play={plays.find((p) => p.i === i) || null}
                    onTap={() => { setStep(i); if (plays.some((p) => p.i === i)) stopPlay(i); else startPlay(i, cueSecs(x.cue.secs, x.song.bpm)); }} />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-white/50 text-[13px]">No cues from this act yet. Try looks on the rig:</p>
              <div className="grid grid-cols-3 gap-1.5">
                {LOOK_KEYS.map((k) => (
                  <button key={k.id} type="button" onClick={() => setKeys((m) => (k.id === "blackout" ? { blackout: !m.blackout } : { ...m, blackout: false, [k.id]: !m[k.id] }))} aria-pressed={!!keys[k.id]}
                    className="h-12 rounded-[6px] border text-[12px] font-bold" style={keys[k.id] ? { background: "#16240d", borderColor: AMBER, color: AMBER } : KEY}>{k.label}</button>
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

// On the event's act (job 383): who the act put on the stage, read-only,
// and the button into the 3D stage. The LD doesn't edit members.
export function LdActMembers({ act, onOpen }) {
  const colors = useMyStageColors();
  const list = (act?.band_members || []).filter((m) => m.name || instrumentsOf(m).length);
  const placed = list.filter((m) => typeof m.stage_x === "number").length;
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onOpen} className="h-12 rounded-[8px] border flex items-center gap-2.5 px-3 text-left" style={{ background: "#1f1800", borderColor: AMBER, color: AMBER }}>
        <span className="text-[13px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_MONO }}>OPEN 3D STAGE</span>
        <span className="ml-auto text-[12px] text-white/55">{list.length ? `${placed} of ${list.length} on the stage` : "No members yet"}</span>
      </button>
      {list.length > 0 && (
        <div className="flex flex-col gap-1">
          {list.map((m, i) => {
            const insts = instrumentsOf(m);
            const played = insts.filter((x) => !isVocalInput(x)).map((x) => x.name).filter(Boolean);
            const sub = [...played, ...(memberSings(m, insts) ? ["Vocals"] : [])].join(", ");
            return (
              <div key={i} className="min-h-[36px] px-2.5 rounded-[6px] border border-[#262626] bg-[#121212] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: memberLook(m, instrumentsOf, colors).color }} />
                <span className="text-[13.5px] text-white font-semibold truncate">{m.name || `Member ${i + 1}`}</span>
                <span className="text-[12.5px] text-white/50 truncate">{sub}</span>
              </div>
            );
          })}
        </div>
      )}
      {!list.length && <p className="text-white/40 text-[12.5px]">The act places their members on your 3D stage from your intake link.</p>}
    </div>
  );
}

// The act on the event, for the LD (job 431): a small picture of the
// event's 3D stage with the act's members where they put themselves; tap
// it to open the full stage. Drawn once in 3D and kept as a picture (no
// live 3D view per act). onPdf: the act's cue sheet as a PDF, when they
// sent cues.
export function LdActStage({ act, rig, onOpen, onPdf = null }) {
  const colors = useMyStageColors();
  const r = useMemo(() => (rigHasItems(rig) ? normalizeRig(rig) : emptyRig()), [rig]);
  const members = useMemo(() => actMembers3D(act, colors), [act, colors]);
  const sig = useMemo(() => JSON.stringify([r.items, r.dark, members.map((m) => [m.x, m.y, m.part, m.name])]), [r, members]);
  const [shot, setShot] = useState(null); // { sig, url }
  const list = (act?.band_members || []).filter((m) => m.name || instrumentsOf(m).length);
  const placed = members.length;
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={onOpen} aria-label={`Open the 3D stage for ${act?.band_name || "this act"}`}
        className="relative w-full rounded-[10px] border overflow-hidden bg-black text-left" style={{ aspectRatio: "16 / 9", borderColor: "#2f4d1f" }}>
        {shot?.sig === sig && shot.url
          ? <img src={shot.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 flex items-center justify-center text-white/35 text-[12.5px]">Drawing the stage…</div>}
        {shot?.sig !== sig && (
          <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 640, height: 360, pointerEvents: "none" }}>
            <Suspense fallback={null}>
              <Stage3D key={sig} rig={r} members={members} labels={false} mode="view" onSnapshot={(url) => setShot({ sig, url: url || "" })} />
            </Suspense>
          </div>
        )}
        <span className="absolute left-0 right-0 bottom-0 px-3 py-2 flex items-center gap-2" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>
          <span className="text-[12px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>3D STAGE</span>
          <span className="ml-auto text-[12px] text-white/70">{list.length ? `${placed} of ${list.length} on the stage` : "No members yet"} · Tap to open</span>
        </span>
      </button>
      {onPdf && <button type="button" onClick={onPdf} className="self-start text-[12.5px] font-semibold px-1 min-h-[32px]" style={{ color: AMBER }}>Their cue sheet (PDF)</button>}
    </div>
  );
}
