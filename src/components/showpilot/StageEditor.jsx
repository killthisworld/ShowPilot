import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Check, ChevronDown, ChevronsDown, Mic, Pipette, Plus, Settings, Trash2, X } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { STAGE_POSITIONS, positionOfMember, positionColor, positionLabel, starterInstrument, inkOn } from "@/lib/stagePositions";
import { stageIconSvg, ICON_CHOICES } from "@/lib/stageIcons";
import { useCustomPositions, memberLook, withCustomPosition } from "@/lib/customPositions";
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
  // The glow is a soft gradient behind the icon, not a drop-shadow filter:
  // iPhone Safari left a trail of the filter's color behind a member being
  // dragged (job 288).
  const svg = <span className="relative block w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: stageIconSvg(pos, color, size) }} />;
  if (!glow) return <span className="block shrink-0" style={{ width: size, height: size }}>{svg}</span>;
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <span aria-hidden className="absolute pointer-events-none rounded-full" style={{ inset: -Math.round(size * 0.3), background: `radial-gradient(closest-side, ${color}66, ${color}22 55%, transparent)` }} />
      {svg}
    </span>
  );
}

// The black stage with everyone on it. Shared with the engineer's view.
// `onDrag(i, x, y)` with `dragOnly` = only that member can be dragged (the one
// picked up); `onDragEnd(i)` when they let go after a drag.
// A text highlight left by tapping on the stage (not one in a text box).
function clearStraySelection() {
  try {
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
  } catch {}
}

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
    // No text highlight starting on the stage (job 284).
    const noSelect = (e) => e.preventDefault();
    el.addEventListener("selectstart", noSelect);
    return () => { el.removeEventListener("touchmove", stop); el.removeEventListener("selectstart", noSelect); };
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
    clearStraySelection();
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
      // Tapping a member twice is a double click: don't let it highlight
      // nearby text like a copy selection (job 284).
      onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
      onClick={(e) => { clearStraySelection(); if (e.target === ref.current && onTapEmpty) onTapEmpty(...at(e)); }}
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full rounded-[14px] border border-[#3a3a3a] border-b-4 border-b-white bg-black select-none isolate"
      style={{ aspectRatio: "4 / 3", touchAction: onDrag && dragOnly === null ? "none" : "manipulation", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
      aria-label="Stage"
    >
      <span className="absolute top-1.5 left-0 right-0 text-center text-[9.5px] tracking-[0.18em] text-white/30 pointer-events-none" style={{ fontFamily: SCENE_MONO }}>BACK OF STAGE</span>
      <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10.5px] font-bold tracking-[0.18em] text-white pointer-events-none" style={{ fontFamily: SCENE_MONO }}>STAGE FRONT</span>
      {members.map((m, i) => {
        if (!placed(m)) return null;
        const { pos, color: pc, icon } = memberLook(m, getInstruments, colors);
        const on = picked === i;
        const inst = (getInstruments(m) || []).filter((x) => x.name && !isVocalInput(x)).map((x) => x.name).join(", ") || (memberSings(m, getInstruments(m) || []) ? "Vocals" : "");
        return (
          <div key={i} className="absolute flex flex-col items-center" style={{ left: `${m.stage_x * 100}%`, top: `${m.stage_y * 100}%`, zIndex: on ? 3 : 2, transform: "translate3d(-50%, -50%, 0)", willChange: on ? "left, top" : undefined, backfaceVisibility: "hidden" }}>
            <button type="button" onPointerDown={down(i)} aria-label={`${m.name || `Member ${i + 1}`}, ${memberPositionLabel(m, pos)}`} aria-pressed={on}
              onContextMenu={(e) => e.preventDefault()}
              className="flex flex-col items-center rounded-lg select-none" style={{ touchAction: canDrag(i) ? "none" : "manipulation", cursor: canDrag(i) ? "grab" : "pointer", outline: on ? `2px dashed ${pc}` : "none", outlineOffset: 4, WebkitTouchCallout: "none", WebkitUserSelect: "none" }}>
              <Icon pos={icon} color={pc} size={46} glow={on} />
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

// Pick a position: the instrument icons in their colors, then your own
// instruments (job 274). "+ Add" (was Other) opens a box to type one in
// (harmonica, sitar...) when onCustom is given.
function PositionGrid({ colors, value, onPick, onCustom, customs = [], onPickCustom, valueCustom = null }) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const addOther = () => { const t = otherText.trim(); if (t) onCustom(t); };
  const tile = (key, label, color, icon, on, onClick) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={on} aria-label={label}
      className="flex flex-col items-center gap-1 rounded-xl border py-2 px-1 min-w-0" style={{ borderColor: on ? color : "#262626", background: on ? color + "1A" : "#0b0b0b" }}>
      <Icon pos={icon} color={color} size={30} />
      <span className="text-[10.5px] leading-tight text-center truncate max-w-full" style={{ color: on ? color : "rgba(255,255,255,0.7)" }}>{label}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-5 gap-1.5">
        {STAGE_POSITIONS.filter((p) => p.key !== "other").map((p) => { const c = positionColor(p.key, colors); return tile(p.key, p.label, c, p.key, value === p.key && !valueCustom, () => onPick(p.key)); })}
        {customs.map((p) => tile(p.id, p.label, p.color, p.icon, valueCustom === p.label, () => onPickCustom?.(p)))}
        {onCustom && (
          <button type="button" onClick={() => setOtherOpen((o) => !o)} aria-pressed={otherOpen} aria-label="Add your own"
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-2 px-1" style={{ borderColor: otherOpen ? G : "#3a3a3a", background: otherOpen ? G + "1A" : "#0b0b0b", color: otherOpen ? G : "rgba(255,255,255,0.7)" }}>
            <Plus className="w-[30px] h-[30px] p-1" />
            <span className="text-[10.5px] leading-tight">+ Add</span>
          </button>
        )}
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

// The gear in "What do they play?" (jobs 274 / 275): your own instruments, in a
// window over the screen - a name, then an icon, then a color for that icon -
// and Save adds it to the list. Colors: your 5 most recent, plus Custom.
const RECENT = "sp_recent_stage_colors";
const DEFAULT_COLORS = ["#22D3EE", "#F472B6", "#FBBF24", "#A78BFA", "#8CFF3D"];
const recentColors = (customs) => {
  let r = [];
  try { r = JSON.parse(localStorage.getItem(RECENT) || "[]"); } catch {}
  const all = [...r, ...[...customs].reverse().map((p) => p.color), ...DEFAULT_COLORS].filter((c) => /^#[0-9a-f]{6}$/i.test(c || "")).map((c) => c.toUpperCase());
  return all.filter((c, i) => all.indexOf(c) === i).slice(0, 5);
};
const rememberColor = (c) => {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT) || "[]");
    localStorage.setItem(RECENT, JSON.stringify([c.toUpperCase(), ...r.filter((x) => x.toUpperCase() !== c.toUpperCase())].slice(0, 10)));
  } catch {}
};
function CustomPositionEditor({ customs, onSave, onClose }) {
  const blank = { id: null, label: "", color: "", icon: "" };
  const [f, setF] = useState(blank);
  const [state, setState] = useState("idle");
  const [swatches] = useState(() => recentColors(customs));
  const shown = f.color || "#FFFFFF";
  const ready = f.label.trim() && f.icon;
  const save = async () => {
    if (!ready) return;
    const item = { id: f.id || `c${Date.now().toString(36)}`, label: f.label.trim().slice(0, 40), color: shown, icon: f.icon };
    const next = f.id ? customs.map((p) => (p.id === f.id ? item : p)) : [...customs, item];
    setState("saving");
    try { if (f.color) rememberColor(f.color); await onSave(next); setState("idle"); onClose(); } catch (e) { console.error(e); setState("error"); }
  };
  const del = async (id) => { try { await onSave(customs.filter((p) => p.id !== id)); if (f.id === id) setF(blank); } catch (e) { console.error(e); setState("error"); } };
  const head = (n, t) => <span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{n}. {t}</span>;
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Your own instruments" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] max-h-[92dvh] overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 flex flex-col gap-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center">
          <span className="flex-1 text-white text-[16px] font-bold">{f.id ? "Edit your instrument" : "New instrument"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1 flex items-center justify-center text-white/45 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {customs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {customs.map((p) => (
              <span key={p.id} className="flex items-center rounded-full border pl-1 pr-0.5" style={{ borderColor: f.id === p.id ? p.color : "#2a2a2a" }}>
                <button type="button" onClick={() => setF({ ...p })} className="flex items-center gap-1 py-1 pr-1 text-[13px]" style={{ color: p.color }} aria-label={`Edit ${p.label}`}>
                  <Icon pos={p.icon} color={p.color} size={22} />{p.label}
                </button>
                <button type="button" onClick={() => del(p.id)} aria-label={`Delete ${p.label}`} className="w-7 h-7 flex items-center justify-center text-white/35 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {head(1, "NAME")}
          <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Pedal steel" aria-label="Instrument name" maxLength={40} autoFocus className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          {head(2, "ICON")}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-1.5 max-h-[232px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Icon">
            {ICON_CHOICES.map((ic) => {
              const on = f.icon === ic.id;
              return (
                <button key={ic.id} type="button" role="radio" aria-checked={on} aria-label={ic.label} title={ic.label} onClick={() => setF({ ...f, icon: ic.id })}
                  className="aspect-square rounded-lg border flex items-center justify-center" style={{ borderColor: on ? shown : "#262626", background: on ? shown + "1A" : "#0b0b0b" }}>
                  {/* Only the chosen icon takes the color (job 275). */}
                  <Icon pos={ic.id} color={on ? shown : "#FFFFFF"} size={28} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {head(3, "COLOR")}
          <div className="flex items-center gap-2" role="group" aria-label="Color">
            {swatches.map((c) => {
              const on = f.color && f.color.toUpperCase() === c;
              return (
                <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Use ${c}`} aria-pressed={!!on} className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: c, boxShadow: on ? "0 0 0 2px #141414, 0 0 0 4px #fff" : "none" }}>
                  {on && <Check className="w-4 h-4 text-black" strokeWidth={3} />}
                </button>
              );
            })}
            <label className="relative flex-1 min-w-[96px] h-10 px-3 rounded-lg border border-[#3a3a3a] flex items-center justify-center gap-2 cursor-pointer text-[12px] font-bold tracking-[0.08em] text-white/80 hover:border-white/40" style={{ fontFamily: SCENE_MONO }} title="Pick any color">
              <span className="w-5 h-5 rounded-md" style={{ background: shown }} /><Pipette className="w-4 h-4" /> CUSTOM
              <input type="color" value={shown.length === 7 ? shown.toLowerCase() : "#ffffff"} onChange={(e) => setF({ ...f, color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Custom color" />
            </label>
          </div>
        </div>
        {/* Save is the chosen color, with the chosen icon (job 275). */}
        <button type="button" onClick={save} disabled={!ready || state === "saving"} className="min-h-[48px] rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: shown, color: inkOn(shown) }}>
          {f.icon && <Icon pos={f.icon} color={inkOn(shown)} size={22} />}{state === "saving" ? "Saving…" : f.id ? "Save changes" : "Save"}
        </button>
        {state === "error" && <p className="text-[12px] text-[#f87171]">Couldn't save. Try again.</p>}
      </div>
    </div>,
    document.body
  );
}

// "What do they play?": the grid (with your own instruments), and the gear
// that opens the window to make more (job 275: it replaces + Add).
function PickPanel({ colors, onPick, onPickCustom, onClose, value = null, valueCustom = null }) {
  const [customs, saveCustoms] = useCustomPositions();
  const [manage, setManage] = useState(false);
  return (
    <div className="rounded-[14px] border border-[#262626] bg-[#101010] p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-[14px] font-semibold text-white">What do they play?</span>
        <button type="button" onClick={() => setManage(true)} aria-label="Your own instruments" title="Make your own instruments" className="w-9 h-9 flex items-center justify-center text-white/55 hover:text-[#8CFF3D]"><Settings className="w-[18px] h-[18px]" /></button>
        <button type="button" onClick={onClose} aria-label="Cancel" className="w-9 h-9 -mr-1 flex items-center justify-center text-white/45"><X className="w-5 h-5" /></button>
      </div>
      <PositionGrid colors={colors} value={value} valueCustom={valueCustom} onPick={onPick} customs={customs} onPickCustom={onPickCustom} />
      {manage && <CustomPositionEditor customs={customs} onSave={saveCustoms} onClose={() => setManage(false)} />}
    </div>
  );
}

const BUS_DEFAULT = { IEM: "#EAB308", Monitor: "#F97316" };

// "Name -> Instrument(s) -> IEM / Monitor", like the old member rows (job 270).
// One instrument and they sing: the instrument and a mic; more than one
// instrument: Multi Track; only vocals: a mic.
function MemberLine({ member, insts, busColors }) {
  const played = insts.filter((x) => !isVocalInput(x) && String(x.name || "").trim());
  const sings = memberSings(member, insts);
  const bus = member.bus_type;
  const arrow = <span className="text-white/30">→</span>;
  return (
    <div className="flex items-center gap-2 flex-wrap text-[14px]">
      <span className="text-white font-semibold">{member.name || <span className="text-white/25 italic">Name</span>}</span>
      {(played.length > 0 || sings) && arrow}
      {played.length > 1 ? <span className="text-white/65">Multi Track</span> : (
        <span className="text-white/65 flex items-center gap-1">
          {played[0]?.name}
          {sings && <Mic className="w-4 h-4 text-white/65" aria-label="Sings" />}
        </span>
      )}
      {bus && <>{arrow}<span className="font-bold" style={{ color: (busColors || BUS_DEFAULT)[bus] || "#fff" }}>{bus}</span></>}
    </div>
  );
}

// Name, instruments, vocals, what they hear. busColors (the engineer's side,
// job 270): IEM / Monitor sit under + Instrument in their colors, with the
// color gear (onBusSettings), instead of the "Hears" toggle.
function MemberForm({ draft, setDraft, getInstruments, colors, isNew, onSave, onCancel, onRemove, extra = null, busColors = null, onBusSettings = null }) {
  const [repick, setRepick] = useState(false);
  const { pos, color: pc, icon } = memberLook(draft, getInstruments, colors);
  const insts = getInstruments(draft);
  const setInsts = (list) => setDraft({ ...draft, instruments: list });
  const upd = (ii, f, v) => { const l = [...insts]; l[ii] = { ...l[ii], [f]: v }; setInsts(l); };
  const toggle = (on, color) => (on ? { color, borderColor: color + "80", background: color + "1F" } : { color: "rgba(255,255,255,0.45)", borderColor: "#333" });
  return (
    <div className="rounded-[14px] border bg-[#101010] p-3 flex flex-col gap-3" style={{ borderColor: pc + "55" }}>
      {!isNew && (
        // Tap the line to close the details again (job 271).
        <button type="button" onClick={onCancel} aria-expanded={true} aria-label="Close details" className="w-full flex items-center gap-2 text-left">
          <span className="flex-1 min-w-0"><MemberLine member={draft} insts={insts} busColors={busColors} /></span>
          <ChevronDown className="w-5 h-5 shrink-0 text-white/40 rotate-180" />
        </button>
      )}
      <div className="flex items-center gap-2.5">
        <Icon pos={icon} color={pc} size={34} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{isNew ? "NEW ON STAGE" : "ON STAGE"}</div>
          <div className="text-[15px] font-semibold" style={{ color: pc }}>{memberPositionLabel(draft, pos)}</div>
        </div>
        <button type="button" onClick={() => setRepick((r) => !r)} className="min-h-[34px] px-2.5 rounded-lg border border-[#333] text-[12px] text-white/65">{repick ? "Done" : "Change"}</button>
      </div>
      {/* Change = the same "What do they play?" box, gear and all (job 278). */}
      {repick && <PickPanel colors={colors} value={pos} valueCustom={draft.position_color ? draft.position_label : null}
        onPick={(k) => { setDraft({ ...draft, position: k, position_label: undefined, position_color: undefined, position_icon: undefined }); setRepick(false); }}
        onPickCustom={(p) => { setDraft(withCustomPosition(draft, p)); setRepick(false); }}
        onClose={() => setRepick(false)} />}
      <input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" aria-label="Member name" className={`${inputCls} font-semibold`} autoFocus={isNew} />
      <div className="flex items-center justify-between gap-x-2 gap-y-2 flex-wrap">
        <VocalsQuestion compact value={memberSings(draft, insts)} onChange={(yes) => setDraft(setMemberVocals(draft, insts, yes))} />
        {!busColors && <div className="flex items-center gap-1.5" role="group" aria-label="Hears">
          <span className="text-white/60 text-[13px] mr-0.5">Hears</span>
          {["IEM", "Monitor"].map((type) => {
            const on = draft.bus_type === type;
            return <button key={type} type="button" onClick={() => setDraft({ ...draft, bus_type: on ? "" : type })} aria-pressed={on} className={`h-8 px-2.5 rounded-lg text-xs font-semibold border ${on ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#333] text-white/40"}`}>{type}</button>;
          })}
        </div>}
      </div>
      {insts.map((inst, ii) => (isVocalInput(inst) ? null : (
        <div key={ii} className="flex items-center gap-1.5">
          <input value={inst.name || ""} onChange={(e) => upd(ii, "name", e.target.value)} placeholder="e.g. Guitar" aria-label="Instrument" className={`${inputCls} !min-h-[40px]`} />
          {["Mic", "DI"].map((type) => {
            // Tap again to turn it off: neither Mic nor DI (job 264).
            const on = (inst.mic_di ?? "Mic") === type;
            return <button key={type} type="button" onClick={() => upd(ii, "mic_di", on ? "" : type)} aria-pressed={on} className="min-h-[40px] px-2.5 rounded-lg text-[12.5px] font-semibold border shrink-0" style={toggle(on, "#93C5FD")}>{type}</button>;
          })}
          <button type="button" onClick={() => upd(ii, "phantom_power", !inst.phantom_power)} aria-pressed={!!inst.phantom_power} className="min-h-[40px] px-2.5 rounded-lg text-[12px] font-bold border shrink-0" style={toggle(!!inst.phantom_power, "#FBBF24")}>+48V</button>
          <button type="button" onClick={() => setInsts(insts.filter((_, k) => k !== ii))} aria-label="Remove instrument" className="min-h-[40px] w-[32px] shrink-0 flex items-center justify-center text-white/35 hover:text-red-400"><X className="w-4 h-4" /></button>
        </div>
      )))}
      <button type="button" onClick={() => setInsts([...insts, { name: "", phantom_power: false, mic_di: "" }])} className="self-start min-h-[38px] px-3 rounded-full border border-dashed border-[#444] text-[13px] font-semibold flex items-center gap-1" style={{ color: G }}><Plus className="w-3.5 h-3.5" />Instrument</button>
      {busColors && (
        <div className="flex items-center gap-2" role="group" aria-label="IEM or Monitor">
          {["IEM", "Monitor"].map((type, ti) => {
            const c = busColors[type] || BUS_DEFAULT[type];
            const on = draft.bus_type === type;
            return (
              <React.Fragment key={type}>
                <button type="button" onClick={() => setDraft({ ...draft, bus_type: on ? "" : type })} aria-pressed={on}
                  className={`flex-1 min-h-[40px] px-3 rounded-lg text-[13px] font-semibold border transition-all ${on ? "border-white/40" : "border-transparent opacity-60 hover:opacity-100"}`}
                  style={{ backgroundColor: c + "22", color: c }}>{type}</button>
                {ti === 0 && onBusSettings && (
                  <button type="button" onClick={onBusSettings} className="w-9 h-10 shrink-0 flex items-center justify-center text-white/35 hover:text-[#8CFF3D]" aria-label="IEM / Monitor colors"><Settings className="w-4 h-4" /></button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {extra}
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
// `renderMemberExtra(member, i)`: more for a saved member's details (e.g. their
// notes on a shared event; job 267), shown above Save.
// busColors / onBusSettings: the engineer's IEM / Monitor colors (job 270).
// The full stage page (job 272): `showAllLines` lists every member's line under
// the stage (tap one to pick them, tap again for their details) with + Add
// above them; `stageMaxWidth` keeps the stage small enough for a still page.
// `canEdit` false: no Add or details form; `renderMemberCard(member, i, close)`
// shows their read-only card instead. `canMove` false: nobody can be moved.
export default function StageEditor({ members = [], setMembers, getInstruments, colors = null, onRemoveMember, onCommit = null, renderMemberExtra = null, busColors = null, onBusSettings = null,
  showAllLines = false, canEdit = true, canMove = true, renderMemberCard = null, stageMaxWidth = null, side = false }) {
  // side (desktop stage page, job 280): the lines sit beside the stage.
  side = side && showAllLines;
  const [step, setStep] = useState(null); // null | "pick" | "form" | "place" | "lift"
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null); // member index, null = new
  const [swap, setSwap] = useState(false);
  const [sel, setSel] = useState(null);

  const startAdd = () => { setSwap(false); setSel(null); setEditing(null); setDraft({ name: "", instruments: [], bus_type: "" }); setStep("pick"); };
  const pickPos = (k, custom = "") => {
    const s = custom ? { name: custom, mic_di: "" } : starterInstrument(k);
    let d = { ...draft, position: k, position_label: custom || undefined, instruments: s ? [{ ...s, phantom_power: false }] : [] };
    if (k === "vocals") d = setMemberVocals(d, [], true);
    setDraft(d);
    setStep("form");
  };
  const pickCustom = (p) => { setDraft(withCustomPosition({ ...draft, instruments: [{ name: p.label, mic_di: "", phantom_power: false }] }, p)); setStep("form"); };
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
    onCommit?.(list);
    // New on the stage (job 285): they stand on a free spot, picked up (dashed
    // outline) with their line showing collapsed under the stage - drag them
    // or tap a spot, tap them again to set them down, tap the line to open.
    if (!wasPlaced && canMove) { setSel(idx); setStep("lift"); }
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
  // Their details are open and another member is tapped (job 272): keep what
  // was typed, then open the other member's details. Tapping the same member
  // again closes the details (they stay picked up when they can move).
  const keepDraft = () => {
    if (!canEdit || editing === null || !draft) return members;
    const list = [...members];
    const m = { ...draft, instruments: (getInstruments(draft) || []).filter((x) => x.name || isVocalInput(x)) };
    if (JSON.stringify(m) === JSON.stringify(members[editing])) return members;
    list[editing] = m;
    setMembers(list);
    onCommit?.(list);
    return list;
  };
  const switchTo = (i) => { const list = keepDraft(); setEditing(i); setDraft({ ...list[i] }); setSel(null); setStep("form"); };
  const collapse = () => { const i = editing; keepDraft(); close(); if (canMove && i !== null) { setSel(i); setStep("lift"); } };
  const openDetails = (i) => (step === "form" && editing !== null ? (editing === i ? collapse() : switchTo(i)) : edit(i));
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
    <div className={side ? "flex flex-row gap-5 h-full min-h-0 items-start" : `flex flex-col gap-2.5 ${showAllLines ? "h-full min-h-0" : ""}`}>
      <div className={side ? "flex-1 min-w-0 flex justify-center" : "contents"}>
      <div className="w-full mx-auto shrink-0 flex flex-col gap-2.5" style={stageMaxWidth ? { maxWidth: stageMaxWidth } : undefined}>
      <StageFloor
        members={members}
        getInstruments={getInstruments}
        colors={colors}
        picked={swap || step === "place" || step === "lift" ? sel : step === "form" ? editing : null}
        onTapMember={(i) => (swap ? tapInSwap(i) : step === "place" ? (i === sel ? drop() : setSel(i)) : step === "lift" ? (i === sel ? drop() : setSel(i))
          : step === "form" && editing !== null ? (editing === i ? collapse() : switchTo(i))
          : step ? null : canMove ? lift(i) : edit(i))}
        onTapEmpty={swap ? moveTo : step === "place" ? placeAt : step === "lift" ? (x, y) => drag(sel, x, y) : null}
        onDrag={(step === "place" || step === "lift") && sel !== null ? drag : null}
        dragOnly={sel}
      />
      <AudienceLine />
      </div>
      </div>

      {showAllLines ? (
        // Scrolls without a scroll bar (job 273).
        <div className={`${side ? "w-[400px] shrink-0 self-stretch" : "flex-1"} min-h-0 overflow-y-auto flex flex-col gap-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`} style={{ overscrollBehavior: "contain" }}>
          {step === "pick" ? (
            <PickPanel colors={colors} onPick={pickPos} onPickCustom={pickCustom} onClose={close} />
          ) : step === "form" && editing === null && draft ? (
            <MemberForm draft={draft} setDraft={setDraft} getInstruments={getInstruments} colors={colors} isNew onSave={save} onCancel={close} onRemove={remove} busColors={busColors} onBusSettings={onBusSettings} />
          ) : step === "place" && sel !== null && members[sel] ? (
            <div className="flex items-center gap-2 rounded-[14px] border p-3" style={{ borderColor: G + "55", background: G + "0D" }}>
              <p className="flex-1 text-[14px] leading-snug" style={{ color: G }}>Tap where {members[sel].name || "they"} stand{members[sel].name ? "s" : ""} on the stage, or drag them there.</p>
              <button type="button" onClick={drop} className="min-h-[40px] px-4 rounded-xl font-semibold text-[14px]" style={{ background: G, color: "#0d0d0d" }}>Done</button>
            </div>
          ) : canEdit && sel === null && !(step === "form" && editing !== null) ? (
            // + Add sits above the lines and goes away while someone is picked.
            <button type="button" onClick={startAdd} className="w-full min-h-[46px] shrink-0 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-1.5" style={{ background: "#60A5FA", color: "#0d0d0d" }}><Plus className="w-4 h-4" />Add</button>
          ) : null}
          {members.length === 0 && step !== "pick" && step !== "form" && <p className="text-center text-[12.5px] text-white/50">{canEdit ? "Add each member, then tap where they stand." : "No one is on this stage yet."}</p>}
          {step !== "pick" && !(step === "form" && editing === null) && members.map((m, i) => {
            const open = step === "form" && editing === i;
            // Someone picked or open: only their line shows (job 274).
            const focus = step === "form" && editing !== null ? editing : sel;
            if (focus !== null && focus !== i) return null;
            if (open && canEdit && draft) {
              return (
                <MemberForm key={i} draft={draft} setDraft={setDraft} getInstruments={getInstruments} colors={colors} isNew={false} onSave={save} onCancel={collapse} onRemove={remove}
                  extra={renderMemberExtra ? renderMemberExtra(members[i], i) : null} busColors={busColors} onBusSettings={onBusSettings} />
              );
            }
            if (open && !canEdit && renderMemberCard) return <div key={i}>{renderMemberCard(m, i, collapse)}</div>;
            const on = sel === i;
            const pc = memberLook(m, getInstruments, colors).color;
            return (
              <button key={i} type="button" onClick={() => (on || !canMove || step === "form" ? openDetails(i) : lift(i))} aria-label={`${m.name || `Member ${i + 1}`}: ${on ? "details" : "pick"}`} aria-expanded={false} aria-pressed={on}
                className="w-full min-h-[48px] shrink-0 rounded-xl border bg-[#111] px-3 py-2 flex items-center gap-2 text-left hover:border-[#444] select-none"
                style={{ borderColor: on ? pc : "#2a2a2a", borderStyle: on ? "dashed" : "solid" }}>
                <span className="flex-1 min-w-0"><MemberLine member={m} insts={getInstruments(m)} busColors={busColors} /></span>
                {!placed(m) && <span className="text-[10px] tracking-[0.1em] text-white/40 shrink-0" style={{ fontFamily: SCENE_MONO }}>OFF STAGE</span>}
                <ChevronDown className="w-5 h-5 shrink-0 text-white/40" />
              </button>
            );
          })}
        </div>
      ) : swap ? (
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
        // Picked up: the dashed outline says it; tap them again to set them down.
        // Their line, like the old member rows; tap to open their details (job 271).
        <button type="button" onClick={() => edit(sel)} aria-label={`${members[sel].name || "Member"}: details`} aria-expanded={false}
          className="w-full min-h-[48px] rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2 flex items-center gap-2 text-left hover:border-[#444]">
          <span className="flex-1 min-w-0"><MemberLine member={members[sel]} insts={getInstruments(members[sel])} busColors={busColors} /></span>
          <ChevronDown className="w-5 h-5 shrink-0 text-white/40" />
        </button>
      ) : step === "pick" ? (
        <PickPanel colors={colors} onPick={pickPos} onPickCustom={pickCustom} onClose={close} />
      ) : step === "form" && draft ? (
        <MemberForm draft={draft} setDraft={setDraft} getInstruments={getInstruments} colors={colors} isNew={editing === null} onSave={save} onCancel={close} onRemove={remove}
          extra={editing !== null && renderMemberExtra ? renderMemberExtra(members[editing], editing) : null}
          busColors={busColors} onBusSettings={onBusSettings} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={startAdd} className="flex-1 min-h-[46px] rounded-xl font-semibold text-[15px] flex items-center justify-center gap-1.5" style={{ background: "#60A5FA", color: "#0d0d0d" }}><Plus className="w-4 h-4" />Add</button>
          </div>
          {onCount === 0 && <p className="text-center text-[12.5px] text-white/50">Add each member, then tap where they stand.</p>}
        </>
      )}

      {!showAllLines && offStage.length > 0 && !step && !swap && (
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="text-[12px] text-white/50">Not on the stage yet. Tap to place them:</span>
          <div className="flex flex-wrap gap-1.5">
            {offStage.map(({ m, i }) => {
              const c = memberLook(m, getInstruments, colors).color;
              return <button key={i} type="button" onClick={() => edit(i)} className="min-h-[38px] px-3 rounded-full border text-[13px] font-semibold" style={{ borderColor: c + "88", color: c }}>+ {m.name || `Member ${i + 1}`}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
