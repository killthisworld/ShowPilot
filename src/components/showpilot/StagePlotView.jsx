import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, ChevronsDown, LayoutGrid, Loader2, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { positionOfMember, positionColor, positionLabel } from "@/lib/stagePositions";
import { stageIconSvg } from "@/lib/stageIcons";
import { isVocalInput, memberSings } from "@/components/showpilot/VocalsQuestion";
import { StageFloor } from "@/components/showpilot/StageEditor";

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

// The viewer's own stage plot colors (Settings > Customize).
export function useMyStageColors() {
  const [colors, setColors] = useState(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_preferences").select("stage_plot_colors").eq("user_id", user.id).maybeSingle();
      if (!off) setColors(data?.stage_plot_colors || null);
    })().catch(() => {});
    return () => { off = true; };
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
        const pos = positionOfMember(m, instrumentsOf);
        const pc = positionColor(pos, colors);
        const on = picked === i;
        const icon = <span className={`block ${small ? "w-7 h-7" : "w-12 h-12"} [&>svg]:w-full [&>svg]:h-full`} style={{ filter: on ? `drop-shadow(0 0 9px ${pc})` : "none" }} dangerouslySetInnerHTML={{ __html: stageIconSvg(pos, pc, 48) }} />;
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
  const pos = positionOfMember(m, instrumentsOf);
  const pc = positionColor(pos, colors);
  const inst = instrumentsOf(m);
  const inputs = inst.filter((x) => x.name && !isVocalInput(x));
  const sings = memberSings(m, inst);
  const hears = m.bus_type || "";
  const row = "flex items-center justify-between gap-3 py-2 border-t border-[#222]";
  const tag = (txt, color) => <span className="px-2 py-0.5 rounded-md text-[12px] font-bold border" style={{ color, borderColor: color + "66", background: color + "14" }}>{txt}</span>;
  return (
    <div className="rounded-2xl border bg-[#121212] p-4" style={{ borderColor: pc + "66" }} role="dialog" aria-label={`${m.name || `Member ${i + 1}`}`}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: stageIconSvg(pos, pc, 40) }} />
        <div className="flex-1 min-w-0">
          <div className="text-white text-[18px] font-bold leading-tight truncate">{m.name || `Member ${i + 1}`}</div>
          <div className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: pc }}>{positionLabel(pos).toUpperCase()}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1 flex items-center justify-center text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <div className="mt-3">
        {inputs.length === 0 && <div className={row}><span className="text-white/45 text-[14px]">No instrument inputs</span></div>}
        {inputs.map((x, k) => (
          <div key={k} className={row}>
            <span className="text-white text-[15px] font-semibold min-w-0 truncate">{x.name}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              {tag(x.mic_di || "Mic", x.mic_di === "DI" ? "#93C5FD" : "#E5E7EB")}
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

// Full screen: the act's stage, act chips, and the tapped person's card.
// Move / swap (job 252): with the event's `token` and `onActs` (the page's
// setter), tap one person then another to swap them, or an empty spot to move
// them; saved straight away with set_stage_positions (owner, Manager / Artist,
// or the Audio / Lighting crew; only the positions change).
export function StagePlotView({ acts = [], start = 0, onClose, token = null, onActs = null }) {
  const colors = useMyStageColors();
  const withPlot = acts.map((a, i) => ({ a, i })).filter(({ a }) => hasStagePlot(a));
  const [cur, setCur] = useState(withPlot.some(({ i }) => i === start) ? start : withPlot[0]?.i ?? 0);
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const act = acts[cur];
  const members = act?.band_members || [];
  const canMove = !!(token && onActs && act && (act.id || typeof act.sort_order === "number"));
  const [swap, setSwap] = useState(false);
  const [sel, setSel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [moveErr, setMoveErr] = useState("");

  // Save the new spots: the page updates straight away, the server after.
  const savePositions = async (list) => {
    const before = acts;
    onActs(acts.map((a, k) => (k === cur ? { ...a, band_members: list } : a)));
    setSaving(true);
    setMoveErr("");
    const positions = list.map((m, i) => ({ i, x: placed(m) ? m.stage_x : null, y: placed(m) ? m.stage_y : null }));
    const { error } = await supabase.rpc("set_stage_positions", { p_token: token, p_band: act.id ? { id: act.id } : { sort_order: act.sort_order, band_name: act.band_name || "" }, p_positions: positions });
    setSaving(false);
    if (error) {
      console.error(error);
      onActs(before);
      setMoveErr(/Only the owner/.test(error.message || "") ? "You can't move people on this act's stage." : "Couldn't save that move. Try again.");
    }
  };
  const tapInSwap = (i) => {
    if (sel === null) { setSel(i); return; }
    if (sel === i) { setSel(null); return; }
    const list = [...members];
    const a = list[sel], b = list[i];
    if (placed(a)) list[i] = { ...b, stage_x: a.stage_x, stage_y: a.stage_y }; else { const { stage_x, stage_y, ...rest } = b; list[i] = rest; }
    if (placed(b)) list[sel] = { ...a, stage_x: b.stage_x, stage_y: b.stage_y }; else { const { stage_x, stage_y, ...rest } = a; list[sel] = rest; }
    setSel(null);
    savePositions(list);
  };
  const moveTo = (x, y) => {
    if (sel === null) return;
    const list = [...members];
    list[sel] = { ...list[sel], stage_x: x, stage_y: y };
    setSel(null);
    savePositions(list);
  };
  const notPlaced = members.map((m, i) => ({ m, i })).filter(({ m }) => !placed(m) && (m.name || instrumentsOf(m).some((x) => x.name)));

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black text-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 shrink-0">
        <LayoutGrid className="w-5 h-5 shrink-0" style={{ color: G }} />
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] tracking-[0.16em] text-white/45" style={{ fontFamily: SCENE_MONO }}>STAGE PLOT</div>
          <div className="text-[19px] font-bold leading-tight truncate">{actName(act)}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close stage plot" className="w-11 h-11 -mr-2 flex items-center justify-center text-white/60 hover:text-white"><X className="w-6 h-6" /></button>
      </div>
      {withPlot.length > 1 && (
        <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto shrink-0">
          {withPlot.map(({ a, i }) => (
            <button key={i} type="button" onClick={() => { setCur(i); setPicked(null); }} aria-pressed={cur === i}
              className="shrink-0 min-h-[36px] px-3 rounded-full border text-[13px] font-semibold"
              style={cur === i ? { borderColor: G, color: "#0d0d0d", background: G } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" }}>
              {actName(a)}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <div className="max-w-[760px] mx-auto flex flex-col gap-2">
          <StageFloor
            members={members}
            getInstruments={instrumentsOf}
            colors={colors}
            picked={swap ? sel : picked}
            onTapMember={(i) => (swap ? tapInSwap(i) : setPicked(picked === i ? null : i))}
            onTapEmpty={swap ? moveTo : null}
          />
          <div className="flex items-center justify-center gap-3 text-white"><ChevronsDown className="w-4 h-4" /><span className="text-[12px] font-bold tracking-[0.18em]" style={{ fontFamily: SCENE_MONO }}>AUDIENCE</span><ChevronsDown className="w-4 h-4" /></div>
          {swap ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[13px] leading-snug" style={{ color: G }}>{sel === null ? "Tap someone to move or swap." : `Now tap someone to swap with ${members[sel]?.name || "them"}, or an empty spot to move them.`}</p>
              {saving && <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
              <button type="button" onClick={() => { setSwap(false); setSel(null); }} className="min-h-[40px] px-4 rounded-xl font-semibold text-[14px]" style={{ background: G, color: "#0d0d0d" }}>Done</button>
            </div>
          ) : picked !== null && members[picked] ? (
            <PersonCard m={members[picked]} i={picked} colors={colors} onClose={() => setPicked(null)} />
          ) : (
            <div className="flex flex-col items-center gap-2 mt-1">
              <p className="text-center text-white/40 text-[13px]">Tap anyone for their inputs, vocals and monitor.</p>
              {canMove && (
                <button type="button" onClick={() => { setSwap(true); setSel(null); setPicked(null); }} className="min-h-[42px] px-4 rounded-xl border font-semibold text-[14px] flex items-center gap-1.5" style={{ borderColor: G + "66", color: G }}>
                  <ArrowLeftRight className="w-4 h-4" />Move / swap
                </button>
              )}
            </div>
          )}
          {moveErr && <p className="text-center text-[12.5px] text-[#f87171]">{moveErr}</p>}
          {notPlaced.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] tracking-[0.14em] text-white/40 mb-1.5" style={{ fontFamily: SCENE_MONO }}>NOT ON THE PLOT{swap ? " · TAP ONE, THEN A SPOT" : ""}</div>
              <div className="flex flex-wrap gap-1.5">
                {notPlaced.map(({ m, i }) => (
                  <button key={i} type="button" onClick={() => (swap ? setSel(i) : setPicked(i))} aria-pressed={swap && sel === i} className="min-h-[36px] px-3 rounded-full border text-[13px]" style={swap && sel === i ? { borderColor: G, color: G } : { borderColor: "#333", color: "rgba(255,255,255,0.75)" }}>{m.name || `Member ${i + 1}`}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// The event page card (tech phone): a preview of the first act's plot; tap to open.
export function StagePlotCard({ acts = [], token = null, onActs = null }) {
  const colors = useMyStageColors();
  const [open, setOpen] = useState(false);
  const first = acts.findIndex(hasStagePlot);
  if (first < 0) return null;
  const count = acts.filter(hasStagePlot).length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left rounded-2xl border border-[#242424] bg-[#111] p-3 flex items-center gap-3" aria-label="Open the stage plot">
        <div className="w-[38%] shrink-0 pointer-events-none"><Stage members={acts[first].band_members || []} colors={colors} small /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] tracking-[0.16em] text-white/45" style={{ fontFamily: SCENE_MONO }}>STAGE PLOT</div>
          <div className="text-white text-[16px] font-semibold leading-tight truncate">{actName(acts[first])}{count > 1 ? ` +${count - 1}` : ""}</div>
          <div className="text-[12.5px] mt-1" style={{ color: G }}>Tap to open</div>
        </div>
      </button>
      {open && <StagePlotView acts={acts} start={first} onClose={() => setOpen(false)} token={token} onActs={onActs} />}
    </>
  );
}

// The button on an act's row, next to its notes and tracks buttons.
export function ActStagePlotButton({ act, onClick, size = "md" }) {
  if (!hasStagePlot(act)) return null;
  const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={`${actName(act)}'s stage plot`} title="Stage plot"
      className={`${box} shrink-0 rounded-[10px] border bg-[#141414] flex items-center justify-center`} style={{ borderColor: G + "55", color: G }}>
      <LayoutGrid className={size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} />
    </button>
  );
}
