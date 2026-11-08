import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronsDown, Loader2, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { positionOfMember, positionColor, positionLabel } from "@/lib/stagePositions";
import { stageIconSvg } from "@/lib/stageIcons";
import { memberLook } from "@/lib/customPositions";
import { isVocalInput, memberSings } from "@/components/showpilot/VocalsQuestion";
import StageEditor, { StageFloor, memberPositionLabel } from "@/components/showpilot/StageEditor";
import SaveStageTemplateButton from "@/components/showpilot/SaveStageTemplate";
import { ActNotesButton } from "@/components/showpilot/FxNotesWindow";

// The engineer's stage plot for show night (job 251): each act's stage as the
// act laid it out on the intake form (members' stage_x / stage_y), in the
// engineer's own position colors. Tap anyone for their name, inputs (Mic / DI,
// +48V), vocals and what they hear (Monitor / IEM). Quick to open from the
// event page card or the stage plot button on each act's row.
const G = "#8CFF3D";
const placed = (m) => typeof m?.stage_x === "number" && typeof m?.stage_y === "number";
export const instrumentsOf = (m) => {
  if (Array.isArray(m?.instruments)) return m.instruments;
  if (m?.instrument) return [{ name: m.instrument, phantom_power: !!m.phantom_power, mic_di: "Mic" }];
  return [];
};
export const hasStagePlot = (act) => (act?.band_members || []).some(placed);
const actName = (a) => a?.band_name || a?.role || "Act";

// The viewer's own stage plot colors (Settings > Customize). Kept once loaded
// (job 273) so a stage opens in your colors right away instead of starting in
// the default ones; Settings updates it when you change a color.
let myColors; // undefined = not loaded yet
const COLORS_EVENT = "sp-stage-colors";
export function rememberStageColors(colors) {
  myColors = colors || null;
  try { window.dispatchEvent(new CustomEvent(COLORS_EVENT)); } catch {}
}
export function useMyStageColors() {
  const [colors, setColors] = useState(myColors ?? null);
  useEffect(() => {
    let off = false;
    const sync = () => { if (!off) setColors(myColors ?? null); };
    window.addEventListener(COLORS_EVENT, sync);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_preferences").select("stage_plot_colors").eq("user_id", user.id).maybeSingle();
      myColors = data?.stage_plot_colors || null;
      sync();
    })().catch(() => {});
    return () => { off = true; window.removeEventListener(COLORS_EVENT, sync); };
  }, []);
  return colors;
}

// The stage itself. `small` = the event page preview (no labels, not tappable).
function Stage({ members, colors, picked, onPick, small = false }) {
  return (
    <div className={`relative w-full bg-black border border-[#3a3a3a] border-b-4 border-b-white ${small ? "rounded-xl" : "rounded-[14px]"}`} style={{ aspectRatio: "4 / 3" }}>
      {!small && <span className="absolute top-1.5 left-0 right-0 text-center text-[9.5px] tracking-[0.18em] text-white/30" style={{ fontFamily: SCENE_MONO }}>BACK OF STAGE</span>}
      <span className={`absolute left-0 right-0 text-center font-bold tracking-[0.18em] text-white ${small ? "bottom-1 text-[8px]" : "bottom-1.5 text-[10.5px]"}`} style={{ fontFamily: SCENE_MONO }}>STAGE FRONT</span>
      {members.map((m, i) => {
        if (!placed(m)) return null;
        const { pos, color: pc, icon: ic } = memberLook(m, instrumentsOf, colors);
        const on = picked === i;
        const icon = <span className={`block ${small ? "w-7 h-7" : "w-12 h-12"} [&>svg]:w-full [&>svg]:h-full`} style={{ filter: on ? `drop-shadow(0 0 9px ${pc})` : "none" }} dangerouslySetInnerHTML={{ __html: stageIconSvg(ic, pc, 48) }} />;
        return (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${m.stage_x * 100}%`, top: `${m.stage_y * 100}%`, zIndex: on ? 3 : 2 }}>
            {small ? icon : (
              <button type="button" onClick={() => onPick(on ? null : i)} aria-label={`${m.name || `Member ${i + 1}`}, ${positionLabel(pos)}`} aria-pressed={on} className="flex flex-col items-center">
                {icon}
                <span className="mt-0.5 max-w-[100px] text-center text-[11.5px] font-semibold text-white leading-tight truncate">{m.name || `Member ${i + 1}`}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// One person's card: inputs, vocals, monitor / IEM.
function PersonCard({ m, i, colors, onClose }) {
  const { pos, color: pc, icon: ic } = memberLook(m, instrumentsOf, colors);
  const inst = instrumentsOf(m);
  const inputs = inst.filter((x) => x.name && !isVocalInput(x));
  const sings = memberSings(m, inst);
  const hears = m.bus_type || "";
  const row = "flex items-center justify-between gap-3 py-2 border-t border-[#222]";
  const tag = (txt, color) => <span className="px-2 py-0.5 rounded-md text-[12px] font-bold border" style={{ color, borderColor: color + "66", background: color + "14" }}>{txt}</span>;
  return (
    <div className="rounded-2xl border bg-[#121212] p-4" style={{ borderColor: pc + "66" }} role="dialog" aria-label={`${m.name || `Member ${i + 1}`}`}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: stageIconSvg(ic, pc, 40) }} />
        <div className="flex-1 min-w-0">
          <div className="text-white text-[18px] font-bold leading-tight truncate">{m.name || `Member ${i + 1}`}</div>
          <div className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: pc }}>{memberPositionLabel(m, pos).toUpperCase()}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1 flex items-center justify-center text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <div className="mt-3">
        {inputs.length === 0 && <div className={row}><span className="text-white/45 text-[14px]">No instrument inputs</span></div>}
        {inputs.map((x, k) => (
          <div key={k} className={row}>
            <span className="text-white text-[15px] font-semibold min-w-0 truncate">{x.name}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              {(x.mic_di ?? "Mic") && tag(x.mic_di ?? "Mic", x.mic_di === "DI" ? "#93C5FD" : "#E5E7EB")}
              {x.phantom_power && tag("+48V", "#FBBF24")}
            </span>
          </div>
        ))}
        <div className={row}>
          <span className="text-white/60 text-[14px]">Vocals</span>
          {sings === true ? tag("Yes", G) : sings === false ? tag("No", "#9CA3AF") : <span className="text-white/35 text-[13px]">Not said</span>}
        </div>
        <div className={row}>
          <span className="text-white/60 text-[14px]">Hears</span>
          {hears ? tag(hears, hears === "IEM" ? "#EAB308" : "#F97316") : <span className="text-white/35 text-[13px]">Not said</span>}
        </div>
      </div>
    </div>
  );
}

// Full screen stage page (job 272): the act's stage on a still page, with every
// member's "Name -> Instrument -> IEM / Monitor" line under it. Tap someone on
// the stage or their line to pick them (drag them or tap a spot; tap them
// again to set them down); tap the picked line for their details. < goes back.
// Top right: the act's notes (`onOpenNotes(actIndex)`, the page's FX / Artist
// Notes) and Save to my templates.
//   onEditMembers(actIndex, list): can edit the lineup - + Add and details,
//     every change saved straight away (async, returns an error or null).
//   token + onActs only: can move people (set_stage_positions; job 252).
//   neither: look only; a member's line opens their card.
export function StagePlotView({ acts = [], start = 0, onClose, token = null, onActs = null, onEditMembers = null, startEditing = false, onOpenNotes = null, busColors = null, onBusSettings = null }) {
  const colors = useMyStageColors();
  // Desktop (job 280): everyone's line beside the stage, not under it.
  const [wideView, setWideView] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => { const on = () => setWideView(window.innerWidth >= 1024); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const tabs = acts.map((a, i) => ({ a, i })).filter(({ a }) => onEditMembers || hasStagePlot(a));
  const [cur, setCur] = useState(tabs.some(({ i }) => i === start) ? start : tabs[0]?.i ?? 0);
  const act = acts[cur];
  const canEdit = !!onEditMembers;
  const canPos = !!(token && onActs && act && (act.id || typeof act.sort_order === "number"));
  // The members as shown; follows the act, and moves / edits land here first.
  const [list, setList] = useState(act?.band_members || []);
  useEffect(() => { setList(act?.band_members || []); }, [cur, act?.band_members]); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState({ saving: false, err: "", saved: false });
  const queue = React.useRef(Promise.resolve());
  // Each finished change saves straight away, one at a time, in order.
  const commit = (next) => {
    const actIndex = cur;
    setStatus({ saving: true, err: "", saved: false });
    queue.current = queue.current.then(async () => {
      const err = await onEditMembers(actIndex, next);
      setStatus({ saving: false, err: err || "", saved: !err });
    });
  };
  // Only positions (Audio / Lighting crew on someone else's event).
  const savePositions = async (next) => {
    const before = acts;
    onActs(acts.map((a, k) => (k === cur ? { ...a, band_members: next } : a)));
    setStatus({ saving: true, err: "", saved: false });
    const positions = next.map((m, i) => ({ i, x: placed(m) ? m.stage_x : null, y: placed(m) ? m.stage_y : null }));
    const { error } = await supabase.rpc("set_stage_positions", { p_token: token, p_band: act.id ? { id: act.id } : { sort_order: act.sort_order, band_name: act.band_name || "" }, p_positions: positions });
    if (error) {
      console.error(error);
      onActs(before);
      setStatus({ saving: false, saved: false, err: /Only the owner/.test(error.message || "") ? "You can't move people on this act's stage." : "Couldn't save that move. Try again." });
    } else setStatus({ saving: false, err: "", saved: true });
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // A still page: nothing behind it scrolls while it's open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const iconBtn = "w-10 h-10 shrink-0 rounded-[10px] border border-[#2a2a2a] bg-[#141414] flex items-center justify-center";
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black text-white flex flex-col overflow-hidden" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", overscrollBehavior: "none" }}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 -ml-1 shrink-0 flex items-center justify-center text-white/75 hover:text-white"><ChevronLeft className="w-7 h-7" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] tracking-[0.16em] text-white/45" style={{ fontFamily: SCENE_MONO }}>STAGE PLOT</div>
          <div className="text-[19px] font-bold leading-tight truncate">{actName(act)}</div>
        </div>
        {onOpenNotes && act && <ActNotesButton act={act} onClick={() => onOpenNotes(cur)} />}
        {/* Keep this act's stage in My Templates (job 254). */}
        {token && act && list.some(placed) && <SaveStageTemplateButton key={cur} act={{ ...act, band_members: list }} iconOnly className={iconBtn} />}
      </div>
      {tabs.length > 1 && (
        <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto shrink-0">
          {tabs.map(({ a, i }) => (
            <button key={i} type="button" onClick={() => setCur(i)} aria-pressed={cur === i}
              className="shrink-0 min-h-[36px] px-3 rounded-full border text-[13px] font-semibold"
              style={cur === i ? { borderColor: G, color: "#0d0d0d", background: G } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" }}>
              {actName(a)}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 px-4 pb-3 flex flex-col">
        <div className={`w-full ${wideView ? "max-w-[1320px]" : "max-w-[760px]"} mx-auto flex-1 min-h-0 flex flex-col`}>
          <StageEditor
            key={cur}
            members={list}
            setMembers={setList}
            getInstruments={instrumentsOf}
            colors={colors}
            onRemoveMember={(i) => setList((l) => l.filter((_, k) => k !== i))}
            onCommit={canEdit ? commit : canPos ? savePositions : null}
            showAllLines
            canEdit={canEdit}
            canMove={canEdit || canPos}
            renderMemberCard={(m, i, close) => <PersonCard m={m} i={i} colors={colors} onClose={close} />}
            stageMaxWidth={wideView ? "min(860px, calc((100dvh - 190px) * 4 / 3))" : "min(760px, calc((100dvh - 330px) * 4 / 3))"}
            side={wideView}
            busColors={busColors}
            onBusSettings={onBusSettings}
          />
          {/* Only a problem shows here (job 275: no "Saved"). */}
          {status.err && <p className="shrink-0 pt-1 text-center text-[12.5px] text-[#f87171]">{status.err}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

// The stage plot icon (job 273): the ShowPilot logo's stage - the arches over
// the stage floor - as a line icon in the button's color.
export function StageIcon({ className = "", style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M5.06 14.27V11.98a6.94 6.94 0 0 1 13.88 0v2.29" />
      <path d="M8.13 14.27V11.98a3.86 3.86 0 0 1 7.72 0v2.29" />
      <path d="M10.5 14.27v-2.3a1.5 1.5 0 0 1 3 0v2.3z" fill="currentColor" stroke="none" />
      <path d="M4.64 14.27h14.7l1.94 2.26v2.41H2.72v-2.41z" />
    </svg>
  );
}

// The event page card: a preview of the first act's plot; tap to open. On the
// desktop event page (job 255) it's also how people who can edit the lineup
// build a stage: with `onEditMembers` and no stage yet, it says "Build the
// stage" and opens straight into it.
export function StagePlotCard({ acts = [], token = null, onActs = null, onEditMembers = null, onOpenNotes = null, busColors = null, onBusSettings = null }) {
  const colors = useMyStageColors();
  const [open, setOpen] = useState(false);
  const plotAt = acts.findIndex(hasStagePlot);
  const build = plotAt < 0;
  if (build && !(onEditMembers && acts.length)) return null;
  const first = build ? 0 : plotAt;
  const count = acts.filter(hasStagePlot).length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left rounded-2xl border border-[#242424] bg-[#111] p-3 flex items-center gap-3" aria-label={build ? "Build the stage" : "Open the stage plot"}>
        <div className="w-[38%] max-w-[180px] shrink-0 pointer-events-none"><Stage members={acts[first].band_members || []} colors={colors} small /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] tracking-[0.16em] text-white/45" style={{ fontFamily: SCENE_MONO }}>STAGE PLOT</div>
          <div className="text-white text-[16px] font-semibold leading-tight truncate">{build ? "No stage yet" : `${actName(acts[first])}${count > 1 ? ` +${count - 1}` : ""}`}</div>
          <div className="text-[12.5px] mt-1" style={{ color: G }}>{build ? "Build the stage: who stands where and what they play" : onEditMembers ? "Open to view or edit" : "Tap to open"}</div>
        </div>
      </button>
      {open && <StagePlotView acts={acts} start={first} onClose={() => setOpen(false)} token={token} onActs={onActs} onEditMembers={onEditMembers} startEditing={build} onOpenNotes={onOpenNotes} busColors={busColors} onBusSettings={onBusSettings} />}
    </>
  );
}

// The button on an act's row, next to its notes and tracks buttons.
export function ActStagePlotButton({ act, onClick, size = "md" }) {
  if (!hasStagePlot(act)) return null;
  const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={`${actName(act)}'s stage plot`} title="Stage plot"
      className={`${box} shrink-0 rounded-[10px] border bg-black flex items-center justify-center`} style={{ borderColor: G + "55", color: G }}>
      <StageIcon className={size === "sm" ? "w-5 h-5" : "w-6 h-6"} />
    </button>
  );
}
