import React, { Suspense, lazy, useMemo, useRef, useState } from "react";
import { Mic, Plus, Trash2, MapPin } from "lucide-react";
import { STAGE_POSITIONS, positionOfMember } from "@/lib/stagePositions";
import { memberLook } from "@/lib/customPositions";
import { memberSings, isVocalInput } from "@/components/showpilot/VocalsQuestion";
import { emptyRig, normalizeRig, rigHasItems } from "@/lib/lightingRig";

const Stage3D = lazy(() => import("@/components/showpilot/Stage3D"));
const PLAYS = STAGE_POSITIONS.filter((p) => p.key !== "vocals");

// Who plays what on an LD's intake (job 383): each member's name, what they
// play and if they sing, placed right on the LD's 3D stage - tap a member's
// pin, then tap where they stand; drag them to move. No audio details.
export default function LdMembers3D({ members = [], setMembers, getInstruments, colors, rig }) {
  const [picked, setPicked] = useState(members.findIndex((m) => typeof m.stage_x !== "number"));
  const stageRef = useRef(null);
  // Picking someone to move brings the stage into view to tap.
  const pick = (i) => { setPicked(i); if (i >= 0) stageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); };
  const r = useMemo(() => (rigHasItems(rig) ? normalizeRig(rig) : emptyRig()), [rig]);
  const set = (i, p) => setMembers(members.map((m, k) => (k === i ? { ...m, ...p } : m)));
  const free = (n) => [0.2, 0.8, 0.5, 0.35, 0.65, 0.1, 0.9][n % 7];
  const add = () => {
    const i = members.length;
    // New members stand on a free spot to start with; Move puts them elsewhere.
    setMembers([...members, { name: "", position: "guitar", instruments: [{ name: "Guitar" }], vocals: false, stage_x: free(i), stage_y: 0.55 + (Math.floor(i / 7) * 0.15) % 0.4 }]);
    setPicked(-1);
  };
  const plays = (m) => positionOfMember(m, getInstruments);
  const setPlays = (i, key, other = "") => {
    const m = members[i];
    const label = key === "other" ? other : STAGE_POSITIONS.find((p) => p.key === key)?.label || "";
    const vocalLines = getInstruments(m).filter(isVocalInput);
    set(i, { position: key, instruments: [{ name: label }, ...vocalLines] });
  };
  const view = useMemo(() => members.map((m, i) => {
    const insts = getInstruments(m);
    const played = insts.filter((x) => !isVocalInput(x)).map((x) => x.name).filter(Boolean);
    return {
      x: typeof m.stage_x === "number" ? m.stage_x : undefined, y: m.stage_y,
      color: memberLook(m, getInstruments, colors).color,
      name: m.name || `Member ${i + 1}`,
      sub: [...played, ...(memberSings(m, insts) ? ["Vocals"] : [])].join(", "),
      sings: !!memberSings(m, insts),
    };
  }), [members, colors, getInstruments]);

  const input = "min-h-[42px] rounded-[10px] bg-[#0b0b0b] border border-[#262626] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30";
  return (
    <div className="flex flex-col gap-3">
      <div ref={stageRef} className="relative w-full rounded-[14px] overflow-hidden border border-[#2a2a2a] bg-black scroll-mt-24" style={{ height: "min(56dvh, 460px)" }}>
        <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading the stage…</div>}>
          <Stage3D rig={r} members={view} mode="place" pickedMember={picked >= 0 ? picked : null}
            onTapDeck={(x, y) => { if (picked >= 0 && members[picked]) { set(picked, { stage_x: x, stage_y: y }); setPicked(-1); } }}
            onMoveMember={(i, x, y) => set(i, { stage_x: x, stage_y: y })} />
        </Suspense>
        <p className="absolute top-2 left-0 right-0 text-center text-[12px] text-white/60 pointer-events-none px-6">
          {picked >= 0 && members[picked] ? `Tap where ${members[picked].name || "they"} stand${members[picked].name ? "s" : ""}` : members.length ? "Drag someone to move them. Drag the stage to turn it." : "Add your members below"}
        </p>
      </div>

      {members.map((m, i) => {
        const key = plays(m);
        const insts = getInstruments(m);
        const sings = !!memberSings(m, insts);
        const color = memberLook(m, getInstruments, colors).color;
        return (
          <div key={i} className="rounded-[12px] border bg-[#101010] p-2.5 flex flex-col gap-2" style={{ borderColor: picked === i ? "#8CFF3D" : color + "88" }}>
            <div className="flex items-center gap-2">
              <input value={m.name || ""} onChange={(e) => set(i, { name: e.target.value })} placeholder={`Member ${i + 1} name`} aria-label="Name" className={input + " flex-1 min-w-0 font-semibold"} />
              <button type="button" onClick={() => pick(picked === i ? -1 : i)} aria-pressed={picked === i} aria-label={`Place ${m.name || "this member"} on the stage`}
                className="h-[42px] px-2.5 rounded-[10px] border text-[12.5px] font-semibold flex items-center gap-1 shrink-0"
                style={picked === i ? { background: "#8CFF3D", borderColor: "#8CFF3D", color: "#0d0d0d" } : { borderColor: "#333", color: typeof m.stage_x === "number" ? "rgba(255,255,255,0.7)" : "#8CFF3D" }}>
                <MapPin className="w-4 h-4" />{typeof m.stage_x === "number" ? "Move" : "Place"}
              </button>
              <button type="button" onClick={() => { setMembers(members.filter((_, k) => k !== i)); setPicked(-1); }} aria-label={`Remove ${m.name || "member"}`} className="w-10 h-[42px] shrink-0 flex items-center justify-center text-white/35 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Plays">
              {PLAYS.map((p) => (
                <button key={p.key} type="button" onClick={() => setPlays(i, p.key)} aria-pressed={key === p.key}
                  className="min-h-[34px] px-2.5 rounded-full border text-[12.5px] font-semibold"
                  style={key === p.key ? { background: p.color, borderColor: p.color, color: "#0d0d0d" } : { borderColor: "#333", color: "rgba(255,255,255,0.65)" }}>{p.label}</button>
              ))}
              <button type="button" onClick={() => set(i, { vocals: !sings, instruments: !sings ? insts : insts.filter((x) => !isVocalInput(x)) })} aria-pressed={sings}
                className="min-h-[34px] px-2.5 rounded-full border text-[12.5px] font-semibold flex items-center gap-1"
                style={sings ? { background: "#8CFF3D", borderColor: "#8CFF3D", color: "#0d0d0d" } : { borderColor: "#333", color: "rgba(255,255,255,0.65)" }}><Mic className="w-3.5 h-3.5" />Sings</button>
            </div>
            {key === "other" && (
              <input value={insts.find((x) => !isVocalInput(x))?.name || ""} onChange={(e) => setPlays(i, "other", e.target.value)} placeholder="What they play" aria-label="What they play" className={input} />
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} className="min-h-[48px] rounded-[12px] font-semibold text-[14.5px] flex items-center justify-center gap-1.5" style={{ background: "#2563EB", color: "#fff" }}>
        <Plus className="w-4 h-4" />Add a member
      </button>
    </div>
  );
}
