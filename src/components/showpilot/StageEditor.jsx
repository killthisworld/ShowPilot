import React, { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronsDown, Plus, Trash2, X } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { STAGE_POSITIONS, positionOfMember, positionColor, positionLabel, starterInstrument } from "@/lib/stagePositions";
import { stageIconSvg } from "@/lib/stageIcons";
import VocalsQuestion, { isVocalInput, memberSings, setMemberVocals } from "@/components/showpilot/VocalsQuestion";

// "Build your stage" (job 252): the intake's Members and inputs as a stage.
// + Add -> pick their position -> name, instruments (Mic / DI, +48V), vocals,
// Monitor / IEM -> Save puts them on the stage, then a tap places them. Tap
// someone on the stage to pick them up (dashed outline): drag them, or tap a
// spot, then tap them again to set them down (job 256). Edit details from
// there. Move / swap: tap one, then another to swap them. Positions live on each member (stage_x /
// stage_y, 0-1; position = the picked key), with the rest of the member.
const G = "#8CFF3D";
const placed = (m) => typeof m?.stage_x === "number" && typeof m?.stage_y === "number";
// Keep the icon and its name on the stage (job 257: not over the stage front).
const clampX = (v) => Math.min(0.92, Math.max(0.08, v));
const clampY = (v) => Math.min(0.82, Math.max(0.12, v));
const SPOTS = [0.2, 0.4, 0.6, 0.8].map((x) => [x, 0.66]).concat([0.2, 0.4, 0.6, 0.8].map((x) => [x, 0.3]), [0.3, 0.5, 0.7].map((x) => [x, 0.48]));
export const freeSpot = (members, skip = -1) => {
  const taken = members.filter((m, i) => i !== skip && placed(m));
  return SPOTS.find(([x, y]) => !taken.some((m) => Math.abs(m.stage_x - x) < 0.12 && Math.abs(m.stage_y - y) < 0.12)) || [0.5, 0.5];
};
// "Other" can be their own instrument name (job 252: Other -> + Add).
export const memberPositionLabel = (m, pos) => (pos === "other" && m?.position_label ? m.position_label : positionLabel(pos));
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";

function Icon({ pos, color, size = 48, glow = false }) {
  return <span className="block shrink-0 [&>svg]:w-full [&>svg]:h-full" style={{ width: size, height: size, filter: glow ? `drop-shadow(0 0 9px ${color})` : "none" }} dangerouslySetInnerHTML={{ __html: stageIconSvg(pos, color, size) }} />;
}

// The black stage with everyone on it. Shared with the engineer's view.
// `onDrag(i, x, y)` with `dragOnly` = only that member can be dragged (the one
// picked up); `onDragEnd(i)` when they let go after a drag.
export function StageFloor({ members, getInstruments, colors, picked = null, onTapMember, onTapEmpty, onDrag, onDragEnd, dragOnly = null, labels = true }) {
  const canDrag = (i) => !!onDrag && (dragOnly === null || dragOnly === i);
  const ref = useRef(null);
  const press = useRef(null); // { i, x, y, moved }
  const canDragRef = useRef(canDrag);
  canDragRef.current = canDrag;
  // Phones scroll the page under a drag unless the touch is stopped here
  // (job 257): React's touch listeners can't, so this one isn't passive.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const stop = (e) => { const p = press.current; if (p && canDragRef.current(p.i) && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);
  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [clampX((e.clientX - r.left) / r.width), clampY((e.clientY - r.top) / r.height)];
  };
  const down = (i) => (e) => {
    e.stopPropagation();
    press.current = { i, x: e.clientX, y: e.clientY, moved: false };
    if (canDrag(i)) e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const p = press.current;
    if (!p || !canDrag(p.i)) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    p.moved = true;
    const [x, y] = at(e);
    onDrag(p.i, x, y);
  };
  const up = (e) => {
    const p = press.current;
    press.current = null;
    if (p && !p.moved) onTapMember?.(p.i);
    else if (p && p.moved) onDragEnd?.(p.i);
  };
  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => { press.current = null; }}
      onClick={(e) => { if (e.target === ref.current && onTapEmpty) onTapEmpty(...at(e)); }}
      className="relative w-full rounded-[14px] border border-[#3a3a3a] border-b-4 border-b-white bg-black select-none"
      style={{ aspectRatio: "4 / 3", touchAction: onDrag && dragOnly === null ? "none" : "manipulation" }}
      aria-label="Stage"
    >
      <span className="absolute top-1.5 left-0 right-0 text-center text-[9.5px] tracking-[0.18em] text-white/30 pointer-events-none" style={{ fontFamily: SCENE_MONO }}>BACK OF STAGE</span>
      <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10.5px] font-bold tracking-[0.18em] text-white pointer-events-none" style={{ fontFamily: SCENE_MONO }}>STAGE FRONT</span>
      {members.map((m, i) => {
        if (!placed(m)) return null;
        const pos = positionOfMember(m, getInstruments);
        const pc = positionColor(pos, colors);
        const on = picked === i;
        const inst = (getInstruments(m) || []).filter((x) => x.name && !isVocalInput(x)).map((x) => x.name).join(", ") || (memberSings(m, getInstruments(m) || []) ? "Vocals" : "");
        return (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${m.stage_x * 100}%`, top: `${m.stage_y * 100}%`, zIndex: on ? 3 : 2 }}>
            <button type="button" onPointerDown={down(i)} aria-label={`${m.name || `Member ${i + 1}`}, ${memberPositionLabel(m, pos)}`} aria-pressed={on}
              onContextMenu={(e) => e.preventDefault()}
              className="flex flex-col items-center rounded-lg select-none" style={{ touchAction: canDrag(i) ? "none" : "manipulation", cursor: canDrag(i) ? "grab" : "pointer", outline: on ? `2px dashed ${pc}` : "none", outlineOffset: 4, WebkitTouchCallout: "none", WebkitUserSelect: "none" }}>
              <Icon pos={pos} color={pc} size={46} glow={on} />
              {labels && <span className="mt-0.5 max-w-[96px] text-center text-[11px] font-semibold text-white leading-tight truncate">{m.name || `Member ${i + 1}`}</span>}
              {labels && inst && <span className="max-w-[96px] text-center text-[10px] leading-tight truncate" style={{ color: pc }}>{inst}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function AudienceLine() {
  return (
    <div className="flex items-center justify-center gap-3 text-white" aria-label="The audience is this way">
      <ChevronsDown className="w-4 h-4" />
      <span className="text-[12px] font-bold tracking-[0.18em]" style={{ fontFamily: SCENE_MONO }}>AUDIENCE</span>
      <ChevronsDown className="w-4 h-4" />
    </div>
  );
}

// Pick a position: the instrument icons in their colors. "Other" opens a box
// to add their own (harmonica, sitar...) when onCustom is given.
function PositionGrid({ colors, value, onPick, onCustom }) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const addOther = () => { const t = otherText.trim(); if (t) onCustom(t); };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-5 gap-1.5">
        {STAGE_POSITIONS.map((p) => {
          const c = positionColor(p.key, colors);
          const on = value === p.key || (p.key === "other" && otherOpen);
          return (
            <button key={p.key} type="button" onClick={() => (p.key === "other" && onCustom ? setOtherOpen((o) => !o) : onPick(p.key))} aria-pressed={on} aria-label={p.label}
              className="flex flex-col items-center gap-1 rounded-xl border py-2 px-1" style={{ borderColor: on ? c : "#262626", background: on ? c + "1A" : "#0b0b0b" }}>
              <Icon pos={p.key} color={c} size={30} />
              <span className="text-[10.5px] leading-tight text-center" style={{ color: on ? c : "rgba(255,255,255,0.7)" }}>{p.label}</span>
            </button>
          );
        })}
      </div>
      {otherOpen && onCustom && (
        <div className="flex items-center gap-1.5">
          <input value={otherText} onChange={(e) => setOtherText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }}
            placeholder="What do they play? e.g. Harmonica" aria-label="Their own instrument" autoFocus className={`${inputCls} !min-h-[42px]`} />
          <button type="button" onClick={addOther} disabled={!otherText.trim()} className="min-h-[42px] px-3.5 rounded-lg font-semibold text-[14px] flex items-center gap-1 shrink-0 disabled:opacity-40" style={{ background: G, color: "#0d0d0d" }}><Plus className="w-4 h-4" />Add</button>
        </div>
      )}
    </div>
  );
}

// Name, instruments, vocals, what they hear.
function MemberForm({ draft, setDraft, getInstruments, colors, isNew, onSave, onCancel, onRemove }) {
  const [repick, setRepick] = useState(false);
  const pos = positionOfMember(draft, getInstruments);
  const pc = positionColor(pos, colors);
  const insts = getInstruments(draft);
  const setInsts = (list) => setDraft({ ...draft, instruments: list });
  const upd = (ii, f, v) => { const l = [...insts]; l[ii] = { ...l[ii], [f]: v }; setInsts(l); };
  const toggle = (on, color) => (on ? { color, borderColor: color + "80", background: color + "1F" } : { color: "rgba(255,255,255,0.45)", borderColor: "#333" });
  return (
    <div className="rounded-[14px] border bg-[#101010] p-3 flex flex-col gap-3" style={{ borderColor: pc + "55" }}>
      <div className="flex items-center gap-2.5">
        <Icon pos={pos} color={pc} size={34} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{isNew ? "NEW ON STAGE" : "ON STAGE"}</div>
          <div className="text-[15px] font-semibold" style={{ color: pc }}>{memberPositionLabel(draft, pos)}</div>
        </div>
        <button type="button" onClick={() => setRepick((r) => !r)} className="min-h-[34px] px-2.5 rounded-lg border border-[#333] text-[12px] text-white/65">{repick ? "Done" : "Change"}</button>
      </div>
      {repick && <PositionGrid colors={colors} value={pos} onPick={(k) => { setDraft({ ...draft, position: k, position_label: undefined }); setRepick(false); }} onCustom={(t) => { setDraft({ ...draft, position: "other", position_label: t }); setRepick(false); }} />}
      <input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" aria-label="Member name" className={`${inputCls} font-semibold`} autoFocus={isNew} />
      <div className="flex items-center justify-between gap-x-2 gap-y-2 flex-wrap">
        <VocalsQuestion compact value={memberSings(draft, insts)} onChange={(yes) => setDraft(setMemberVocals(draft, insts, yes))} />
        <div className="flex items-center gap-1.5" role="group" aria-label="Hears">
          <span className="text-white/60 text-[13px] mr-0.5">Hears</span>
          {["IEM", "Monitor"].map((type) => {
            const on = draft.bus_type === type;
            return <button key={type} type="button" onClick={() => setDraft({ ...draft, bus_type: on ? "" : type })} aria-pressed={on} className={`h-8 px-2.5 rounded-lg text-xs font-semibold border ${on ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#333] text-white/40"}`}>{type}</button>;
          })}
        </div>
      </div>
      {insts.map((inst, ii) => (isVocalInput(inst) ? null : (
        <div key={ii} className="flex items-center gap-1.5">
          <input value={inst.name || ""} onChange={(e) => upd(ii, "name", e.target.value)} placeholder="e.g. Guitar" aria-label="Instrument" className={`${inputCls} !min-h-[40px]`} />
          {["Mic", "DI"].map((type) => {
            const on = (inst.mic_di || "Mic") === type;
            return <button key={type} type="button" onClick={() => upd(ii, "mic_di", type)} aria-pressed={on} className="min-h-[40px] px-2.5 rounded-lg text-[12.5px] font-semibold border shrink-0" style={toggle(on, "#93C5FD")}>{type}</button>;
          })}
          <button type="button" onClick={() => upd(ii, "phantom_power", !inst.phantom_power)} aria-pressed={!!inst.phantom_power} className="min-h-[40px] px-2.5 rounded-lg text-[12px] font-bold border shrink-0" style={toggle(!!inst.phantom_power, "#FBBF24")}>+48V</button>
          <button type="button" onClick={() => setInsts(insts.filter((_, k) => k !== ii))} aria-label="Remove instrument" className="min-h-[40px] w-[32px] shrink-0 flex items-center justify-center text-white/35 hover:text-red-400"><X className="w-4 h-4" /></button>
        </div>
      )))}
      <button type="button" onClick={() => setInsts([...insts, { name: "", phantom_power: false, mic_di: "Mic" }])} className="self-start min-h-[38px] px-3 rounded-full border border-dashed border-[#444] text-[13px] font-semibold flex items-center gap-1" style={{ color: G }}><Plus className="w-3.5 h-3.5" />Instrument</button>
      <div className="flex items-center gap-2 pt-1">
        {!isNew && <button type="button" onClick={onRemove} aria-label="Remove from the stage" className="min-h-[44px] w-[44px] rounded-xl border border-[#333] flex items-center justify-center text-white/45 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
        <button type="button" onClick={onCancel} className="min-h-[44px] px-4 rounded-xl border border-[#333] text-[14px] text-white/70">Cancel</button>
        <button type="button" onClick={onSave} className="flex-1 min-h-[44px] rounded-xl font-semibold text-[15px]" style={{ background: G, color: "#0d0d0d" }}>{isNew ? "Save to the stage" : "Save"}</button>
      </div>
    </div>
  );
}

// `onCommit(list)` (job 258): called when a change is finished - someone set
// down, placed, swapped, saved or removed - so the event can save it right
// away with no Save button. Not called while dragging.
export default function StageEditor({ members = [], setMembers, getInstruments, colors = null, onRemoveMember, onCommit = null }) {
  const [step, setStep] = useState(null); // null | "pick" | "form" | "place" | "lift"
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null); // member index, null = new
  const [swap, setSwap] = useState(false);
  const [sel, setSel] = useState(null);

  const startAdd = () => { setSwap(false); setSel(null); setEditing(null); setDraft({ name: "", instruments: [], bus_type: "" }); setStep("pick"); };
  const pickPos = (k, custom = "") => {
    const s = custom ? { name: custom, mic_di: "Mic" } : starterInstrument(k);
    let d = { ...draft, position: k, position_label: custom || undefined, instruments: s ? [{ ...s, phantom_power: false }] : [] };
    if (k === "vocals") d = setMemberVocals(d, [], true);
    setDraft(d);
    setStep("form");
  };
  const edit = (i) => { setSwap(false); setSel(null); setEditing(i); setDraft({ ...members[i] }); setStep("form"); };
  const close = () => { setStep(null); setDraft(null); setEditing(null); };
  const save = () => {
    const list = [...members];
    let m = { ...draft };
    m.instruments = (getInstruments(m) || []).filter((x) => x.name || isVocalInput(x));
    const wasPlaced = placed(m);
    if (!wasPlaced) { const [x, y] = freeSpot(list, editing ?? -1); m = { ...m, stage_x: x, stage_y: y }; }
    const idx = editing === null ? list.length : editing;
    if (editing === null) list.push(m); else list[editing] = m;
    setMembers(list);
    close();
    // New on the stage: they place them next (tap where they stand, or drag);
    // that's when it's committed.
    if (!wasPlaced) { setSel(idx); setStep("place"); } else onCommit?.(list);
  };
  const placeAt = (x, y) => {
    if (sel === null) return;
    const list = [...members];
    list[sel] = { ...list[sel], stage_x: x, stage_y: y };
    setMembers(list);
    setSel(null);
    setStep(null);
    onCommit?.(list);
  };
  // Picked up (job 256): drag them or tap a spot; tap them again to set them down.
  const lift = (i) => { setSwap(false); setSel(i); setStep("lift"); };
  const drop = () => { setSel(null); setStep(null); onCommit?.(members); };
  const remove = () => {
    const list = members.filter((_, k) => k !== editing);
    onRemoveMember ? onRemoveMember(editing) : setMembers(list);
    close();
    onCommit?.(list);
  };

  // Move / swap: tap one, then another (swap) or an empty spot (move).
  const tapInSwap = (i) => {
    if (sel === null) { setSel(i); return; }
    if (sel === i) { setSel(null); return; }
    const list = [...members];
    const a = list[sel], b = list[i];
    list[sel] = { ...a, stage_x: b.stage_x, stage_y: b.stage_y };
    list[i] = { ...b, stage_x: a.stage_x, stage_y: a.stage_y };
    setMembers(list);
    setSel(null);
    onCommit?.(list);
  };
  const moveTo = (x, y) => {
    if (sel === null) return;
    const list = [...members];
    list[sel] = { ...list[sel], stage_x: x, stage_y: y };
    setMembers(list);
    setSel(null);
    onCommit?.(list);
  };
  const drag = (i, x, y) => { const list = [...members]; list[i] = { ...list[i], stage_x: x, stage_y: y }; setMembers(list); };

  const offStage = members.map((m, i) => ({ m, i })).filter(({ m }) => !placed(m) && (m.name || (getInstruments(m) || []).some((x) => x.name)));
  const onCount = members.filter(placed).length;

  return (
    <div className="flex flex-col gap-2.5">
      <StageFloor
        members={members}
        getInstruments={getInstruments}
        colors={colors}
        picked={swap || step === "place" || step === "lift" ? sel : step === "form" ? editing : null}
        onTapMember={(i) => (swap ? tapInSwap(i) : step === "place" ? (i === sel ? drop() : setSel(i)) : step === "lift" ? (i === sel ? drop() : setSel(i)) : step ? null : lift(i))}
        onTapEmpty={swap ? moveTo : step === "place" ? placeAt : step === "lift" ? (x, y) => drag(sel, x, y) : null}
        onDrag={(step === "place" || step === "lift") && sel !== null ? drag : null}
        dragOnly={sel}
      />
      <AudienceLine />

      {swap ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[13px] leading-snug" style={{ color: G }}>{sel === null ? "Tap someone to move or swap." : `Now tap someone to swap with ${members[sel]?.name || "them"}, or an empty spot to move them.`}</p>
          <button type="button" onClick={() => { setSwap(false); setSel(null); }} className="min-h-[40px] px-4 rounded-xl font-semibold text-[14px]" style={{ background: G, color: "#0d0d0d" }}>Done</button>
        </div>
      ) : step === "place" && sel !== null && members[sel] ? (
        <div className="flex items-center gap-2 rounded-[14px] border p-3" style={{ borderColor: G + "55", background: G + "0D" }}>
          <p className="flex-1 text-[14px] leading-snug" style={{ color: G }}>Tap where {members[sel].name || "they"} stand{members[sel].name ? "s" : ""} on the stage, or drag them there.</p>
          <button type="button" onClick={drop} className="min-h-[40px] px-4 rounded-xl font-semibold text-[14px]" style={{ background: G, color: "#0d0d0d" }}>Done</button>
        </div>
      ) : step === "lift" && sel !== null && members[sel] ? (
        <div className="flex flex-col gap-2 rounded-[14px] border border-dashed p-3" style={{ borderColor: G + "88", background: G + "0D" }}>
          <p className="text-[14px] leading-snug" style={{ color: G }}>Drag {members[sel].name || "them"} where they stand, or tap a spot. Tap them again to set them down.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => edit(sel)} className="flex-1 min-h-[42px] rounded-xl border border-[#3a3a3a] text-white/80 font-semibold text-[14px]">Edit details</button>
            <button type="button" onClick={drop} className="flex-1 min-h-[42px] rounded-xl font-semibold text-[14px]" style={{ background: G, color: "#0d0d0d" }}>Set down</button>
          </div>
        </div>
      ) : step === "pick" ? (
        <div className="rounded-[14px] border border-[#262626] bg-[#101010] p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-white">What do they play?</span>
            <button type="button" onClick={close} aria-label="Cancel" className="w-9 h-9 -mr-1 flex items-center justify-center text-white/45"><X className="w-5 h-5" /></button>
          </div>
          <PositionGrid colors={colors} onPick={pickPos} onCustom={(t) => pickPos("other", t)} />
        </div>
      ) : step === "form" && draft ? (
        <MemberForm draft={draft} setDraft={setDraft} getInstruments={getInstruments} colors={colors} isNew={editing === null} onSave={save} onCancel={close} onRemove={remove} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={startAdd} className="flex-1 min-h-[46px] rounded-xl font-semibold text-[15px] flex items-center justify-center gap-1.5" style={{ background: G, color: "#0d0d0d" }}><Plus className="w-4 h-4" />Add</button>
            <button type="button" onClick={() => { setSwap(true); setSel(null); }} disabled={onCount < 1} className="flex-1 min-h-[46px] rounded-xl border font-semibold text-[15px] flex items-center justify-center gap-1.5 disabled:opacity-35" style={{ borderColor: G + "66", color: G }}><ArrowLeftRight className="w-4 h-4" />Tap to move / edit</button>
          </div>
          {onCount === 0 && <p className="text-center text-[12.5px] text-white/50">Add each member, then tap where they stand.</p>}
        </>
      )}

      {offStage.length > 0 && !step && !swap && (
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="text-[12px] text-white/50">Not on the stage yet. Tap to place them:</span>
          <div className="flex flex-wrap gap-1.5">
            {offStage.map(({ m, i }) => {
              const c = positionColor(positionOfMember(m, getInstruments), colors);
              return <button key={i} type="button" onClick={() => edit(i)} className="min-h-[38px] px-3 rounded-full border text-[13px] font-semibold" style={{ borderColor: c + "88", color: c }}>+ {m.name || `Member ${i + 1}`}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
