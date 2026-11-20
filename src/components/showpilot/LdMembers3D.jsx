import React, { Suspense, lazy, useMemo, useRef, useState } from "react";
import { Plus, Trash2, MapPin, ChevronDown } from "lucide-react";
import { STAGE_POSITIONS, positionOfMember } from "@/lib/stagePositions";
import { memberLook } from "@/lib/customPositions";
import { memberSings, isVocalInput } from "@/components/showpilot/VocalsQuestion";
import { emptyRig, normalizeRig, rigHasItems } from "@/lib/lightingRig";
import { stageIconSvg } from "@/lib/stageIcons";

const Stage3D = lazy(() => import("@/components/showpilot/Stage3D"));
const PLAYS = STAGE_POSITIONS.filter((p) => p.key !== "vocals");

// Who plays what on an LD's intake (job 383): each member's name, what they
// play and if they sing, placed right on the LD's 3D stage - tap a member's
// pin, then tap where they stand; drag them to move. No audio details.
export default function LdMembers3D({ members = [], setMembers, getInstruments, colors, rig }) {
  const [picked, setPicked] = useState(members.findIndex((m) => typeof m.stage_x !== "number"));
  // One member open at a time (job 417): a new one opens, the rest fold to
  // a row - their icon, name, Move and an arrow to open them.
  const [openAt, setOpenAt] = useState(-1);
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
    setOpenAt(i);
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
      part: positionOfMember(m, getInstruments),
    };
  }), [members, colors, getInstruments]);

  const input = "min-h-[42px] rounded-[10px] bg-[#0b0b0b] border border-[#262626] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30";
  return (
    <div className="flex flex-col gap-3">
      {/* The stage stays at the top as the members scroll under it (job 416),
          so nobody has to scroll back up to place someone. */}
      {/* Nothing but Add a member until there's someone to place (job 417). */}
      {members.length > 0 && (
      <div className="sticky -top-2 z-10 -mx-1 px-1 pt-2 -mt-2 pb-2 bg-[#151515]">
      <div ref={stageRef} className="relative w-full rounded-[14px] overflow-hidden border border-[#2a2a2a] bg-black" style={{ height: "min(38dvh, 340px)" }}>
        <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading the stage…</div>}>
          <Stage3D rig={r} members={view} mode="place" pickedMember={picked >= 0 ? picked : null}
            onTapDeck={(x, y) => { if (picked >= 0 && members[picked]) { set(picked, { stage_x: x, stage_y: y }); setPicked(-1); } }}
            onMoveMember={(i, x, y) => set(i, { stage_x: x, stage_y: y })} />
        </Suspense>
        <p className="absolute top-2 left-0 right-0 text-center text-[12px] text-white/60 pointer-events-none px-6">
          {picked >= 0 && members[picked] ? `Tap where ${members[picked].name || "they"} stand${members[picked].name ? "s" : ""}` : members.length ? "Drag someone to move them. Drag the stage to turn it." : "Add your members below"}
        </p>
      </div>
      </div>
      )}

      {members.map((m, i) => {
        const key = plays(m);
        const insts = getInstruments(m);
        const sings = !!memberSings(m, insts);
        const color = memberLook(m, getInstruments, colors).color;
        return (
          <div key={i} className="rounded-[12px] border bg-[#101010] p-2 flex flex-col gap-2" style={{ borderColor: picked === i ? "#8CFF3D" : color + "88" }}>
            <div className="flex items-center gap-1.5">
              {/* What they play, at a glance (and to open them). */}
              <button type="button" onClick={() => setOpenAt(openAt === i ? -1 : i)} aria-label={`${PLAYS.find((p) => p.key === key)?.label || "Plays"}${sings ? " and sings" : ""}`}
                className="relative w-[42px] h-[42px] shrink-0 rounded-[10px] border flex items-center justify-center" style={{ background: "#161616", borderColor: "#333" }}>
                <span aria-hidden="true" className="block [&>svg]:w-full [&>svg]:h-full" style={{ width: 26, height: 26 }} dangerouslySetInnerHTML={{ __html: stageIconSvg(key || "other", PLAYS.find((p) => p.key === key)?.color || "#CBD5E1", 26) }} />
                {sings && <span aria-hidden="true" className="absolute -right-1 -bottom-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#0d0d0d" }} dangerouslySetInnerHTML={{ __html: stageIconSvg("vocals", "#8CFF3D", 14) }} />}
              </button>
              <input value={m.name || ""} onChange={(e) => set(i, { name: e.target.value })} placeholder={`Member ${i + 1} name`} aria-label="Name" className={input + " flex-1 min-w-0 font-semibold"} />
              <button type="button" onClick={() => pick(picked === i ? -1 : i)} aria-pressed={picked === i} aria-label={`Place ${m.name || "this member"} on the stage`}
                className="h-[42px] px-2.5 rounded-[10px] border text-[12.5px] font-semibold flex items-center gap-1 shrink-0"
                style={picked === i ? { background: "#8CFF3D", borderColor: "#8CFF3D", color: "#0d0d0d" } : { borderColor: "#333", color: typeof m.stage_x === "number" ? "rgba(255,255,255,0.7)" : "#8CFF3D" }}>
                <MapPin className="w-4 h-4" />{typeof m.stage_x === "number" ? "Move" : "Place"}
              </button>
              <button type="button" onClick={() => setOpenAt(openAt === i ? -1 : i)} aria-expanded={openAt === i} aria-label={`${openAt === i ? "Close" : "Open"} ${m.name || `member ${i + 1}`}`}
                className="w-9 h-[42px] shrink-0 flex items-center justify-center text-white/60 hover:text-white">
                <ChevronDown className="w-5 h-5 transition-transform" style={{ transform: openAt === i ? "rotate(180deg)" : "none" }} />
              </button>
            </div>
            {openAt === i && <>
            {/* What they play as the stage plot's instrument icons (job 416),
                the name read out for screen readers; Sings beside them. */}
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Plays">
              {PLAYS.map((p) => (
                <button key={p.key} type="button" onClick={() => setPlays(i, p.key)} aria-pressed={key === p.key} aria-label={p.label} title={p.label}
                  className="h-11 rounded-[10px] border flex items-center justify-center"
                  style={key === p.key ? { background: p.color + "33", borderColor: p.color } : { background: "#161616", borderColor: "#333" }}>
                  <span aria-hidden="true" className="block [&>svg]:w-full [&>svg]:h-full" style={{ width: 28, height: 28 }} dangerouslySetInnerHTML={{ __html: stageIconSvg(p.key, p.color, 28) }} />
                </button>
              ))}
              <button type="button" onClick={() => set(i, { vocals: !sings, instruments: !sings ? insts : insts.filter((x) => !isVocalInput(x)) })} aria-pressed={sings} aria-label="Sings" title="Sings"
                className="h-11 rounded-[10px] border flex items-center justify-center"
                style={sings ? { background: "#8CFF3D33", borderColor: "#8CFF3D" } : { background: "#161616", borderColor: "#333" }}>
                <span aria-hidden="true" className="block [&>svg]:w-full [&>svg]:h-full" style={{ width: 28, height: 28 }} dangerouslySetInnerHTML={{ __html: stageIconSvg("vocals", "#8CFF3D", 28) }} />
              </button>
            </div>
            {key === "other" && (
              <input value={insts.find((x) => !isVocalInput(x))?.name || ""} onChange={(e) => setPlays(i, "other", e.target.value)} placeholder="What they play" aria-label="What they play" className={input} />
            )}
            <button type="button" onClick={() => { setMembers(members.filter((_, k) => k !== i)); setPicked(-1); setOpenAt(-1); }} aria-label={`Remove ${m.name || "member"}`}
              className="self-end min-h-[36px] px-2 flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-red-400"><Trash2 className="w-4 h-4" />Remove</button>
            </>}
          </div>
        );
      })}
      <button type="button" onClick={add} className="min-h-[48px] rounded-[12px] font-semibold text-[14.5px] flex items-center justify-center gap-1.5" style={{ background: "#2563EB", color: "#fff" }}>
        <Plus className="w-4 h-4" />Add a member
      </button>
    </div>
  );
}
