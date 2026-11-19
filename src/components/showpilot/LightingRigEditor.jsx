import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Box, Copy, Trash2, RotateCw, RotateCcw, Minus, Plus, Square } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import RigLayer from "@/components/showpilot/RigLayer";
import { AudienceLine } from "@/components/showpilot/StageEditor";
import { TRUSS_TYPES, FIXTURE_TYPES, RIG_COLORS, isTruss, newRigItem, normalizeRig, rigTypeLabel } from "@/lib/lightingRig";

const Rig3D = lazy(() => import("@/components/showpilot/Rig3D"));
const G = "#8CFF3D";

// The LD's lighting rig for a venue (job 377), full screen: the stage from
// above with trusses and lights to add, drag and set up, and a 3D view to
// orbit. onSave(rig) on Done; Back without Done keeps nothing.
export default function LightingRigEditor({ rig: start, venueName = "", onSave, onClose }) {
  const [rig, setRig] = useState(() => normalizeRig(start));
  const [sel, setSel] = useState(null);
  const [view3d, setView3d] = useState(false);
  const ref = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const item = rig.items.find((i) => i.id === sel) || null;
  const patch = (id, p) => setRig((r) => ({ ...r, items: r.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const add = (type) => {
    const it = newRigItem(type, rig);
    setRig((r) => ({ ...r, items: [...r.items, it] }));
    setSel(it.id);
  };
  const remove = (id) => { setRig((r) => ({ ...r, items: r.items.filter((i) => i.id !== id) })); setSel(null); };
  const duplicate = (id) => {
    const src = rig.items.find((i) => i.id === id);
    if (!src) return;
    const it = { ...src, id: Math.random().toString(36).slice(2, 10), x: Math.min(0.97, src.x + 0.06), y: Math.min(0.97, src.y + 0.04) };
    setRig((r) => ({ ...r, items: [...r.items, it] }));
    setSel(it.id);
  };

  // Drag an item on the stage (pointer, so mouse and touch alike).
  const at = (e) => {
    const b = ref.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))];
  };
  const onItemDown = (id, e) => {
    e.stopPropagation();
    const it = rig.items.find((i) => i.id === id);
    const [x, y] = at(e);
    drag.current = { id, dx: it.x - x, dy: it.y - y, moved: false, pid: e.pointerId };
    try { ref.current.setPointerCapture(e.pointerId); } catch {}
    setSel(id);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = at(e);
    d.moved = true;
    patch(d.id, { x: Math.min(1, Math.max(0, x + d.dx)), y: Math.min(1, Math.max(0, y + d.dy)) });
  };
  const onUp = () => { drag.current = null; };

  const chip = "min-h-[40px] px-3 rounded-[10px] border border-[#2e2e2e] bg-[#141414] text-white/85 text-[13px] font-semibold flex items-center gap-1.5 hover:border-white/40";
  const step = "w-10 h-10 rounded-[10px] border border-[#2e2e2e] bg-[#141414] text-white/80 flex items-center justify-center hover:border-white/40";
  const lbl = "text-[10.5px] tracking-[0.14em] text-white/45";

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black flex flex-col" style={{ height: "100dvh" }} role="dialog" aria-label="Lighting rig">
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 border-b border-[#1c1c1c]">
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 -ml-1 flex items-center justify-center text-white/70"><ChevronLeft className="w-6 h-6" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] tracking-[0.18em] text-white/45" style={{ fontFamily: SCENE_MONO }}>LIGHTING RIG</div>
          <div className="text-white text-[17px] font-semibold truncate">{venueName || "This venue"}</div>
        </div>
        <button type="button" onClick={() => setView3d((v) => !v)} aria-pressed={view3d}
          className="h-10 px-3 rounded-[10px] border text-[13px] font-semibold flex items-center gap-1.5"
          style={view3d ? { borderColor: G, color: "#0d0d0d", background: G } : { borderColor: "#333", color: "rgba(255,255,255,0.85)" }}>
          {view3d ? <Square className="w-4 h-4" /> : <Box className="w-4 h-4" />}{view3d ? "Top" : "3D"}
        </button>
        <button type="button" onClick={() => onSave?.(rig)} className="h-10 px-4 rounded-[10px] font-semibold text-[14px]" style={{ background: G, color: "#0d0d0d" }}>Done</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-[760px] mx-auto px-3 py-3 flex flex-col gap-3">
          {view3d ? (
            <div className="w-full rounded-[14px] overflow-hidden border border-[#2a2a2a]" style={{ height: "min(70dvh, 560px)" }}>
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading 3D…</div>}>
                <Rig3D rig={rig} />
              </Suspense>
            </div>
          ) : (
            <>
              <div ref={ref} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                onPointerDown={(e) => { if (e.target === ref.current || e.target.tagName === "svg") setSel(null); }}
                className="relative w-full rounded-[14px] border border-[#3a3a3a] border-b-4 border-b-white bg-black select-none"
                style={{ aspectRatio: "4 / 3", touchAction: "none" }}>
                <span className="absolute top-1.5 left-0 right-0 text-center text-[9.5px] tracking-[0.18em] text-white/30 pointer-events-none" style={{ fontFamily: SCENE_MONO }}>BACK OF STAGE</span>
                <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10.5px] font-bold tracking-[0.18em] text-white pointer-events-none" style={{ fontFamily: SCENE_MONO }}>STAGE FRONT</span>
                <RigLayer rig={rig} selected={sel} onItemDown={onItemDown} />
                {!rig.items.length && <p className="absolute inset-0 flex items-center justify-center text-white/35 text-[13px] pointer-events-none px-8 text-center">Add trusses and lights below, then drag them into place.</p>}
              </div>
              <AudienceLine />
            </>
          )}

          {/* The picked item's settings. */}
          {item && !view3d && (
            <div className="rounded-[12px] border bg-[#0f0f0f] p-3 flex flex-col gap-3" style={{ borderColor: (isTruss(item.type) ? "#8A8F98" : item.color) + "88" }}>
              <div className="flex items-center gap-2">
                <span className="text-white text-[15px] font-semibold">{rigTypeLabel(item.type)}{isTruss(item.type) ? " truss" : ""}</span>
                <input value={item.label} onChange={(e) => patch(item.id, { label: e.target.value })} placeholder="Name (e.g. Upstage truss, SL wash 1)" aria-label="Name" maxLength={40}
                  className="flex-1 min-w-0 min-h-[40px] rounded-lg bg-[#111] border border-[#262626] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={lbl + " w-16"} style={{ fontFamily: SCENE_MONO }}>HEIGHT</span>
                <button type="button" className={step} aria-label="Lower" onClick={() => patch(item.id, { h: Math.max(0, item.h - 1) })}><Minus className="w-4 h-4" /></button>
                <span className="w-14 text-center text-white text-[15px] font-semibold tabular-nums">{item.h} ft</span>
                <button type="button" className={step} aria-label="Higher" onClick={() => patch(item.id, { h: Math.min(80, item.h + 1) })}><Plus className="w-4 h-4" /></button>
                <span className="text-white/35 text-[12px]">{item.h === 0 ? "on the deck" : "trim"}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={lbl + " w-16"} style={{ fontFamily: SCENE_MONO }}>TURN</span>
                <button type="button" className={step} aria-label="Turn left" onClick={() => patch(item.id, { rot: (item.rot - 15) % 360 })}><RotateCcw className="w-4 h-4" /></button>
                <span className="w-14 text-center text-white text-[15px] font-semibold tabular-nums">{((item.rot % 360) + 360) % 360}°</span>
                <button type="button" className={step} aria-label="Turn right" onClick={() => patch(item.id, { rot: (item.rot + 15) % 360 })}><RotateCw className="w-4 h-4" /></button>
              </div>
              {(isTruss(item.type) || item.type === "led_bar") && (
                <div className="flex items-center gap-2">
                  <span className={lbl + " w-16"} style={{ fontFamily: SCENE_MONO }}>{item.type === "truss_circle" ? "SIZE" : "LENGTH"}</span>
                  <input type="range" min="0.05" max={item.type === "led_bar" ? 0.4 : 1.1} step="0.01" value={item.len} onChange={(e) => patch(item.id, { len: Number(e.target.value) })} className="flex-1 accent-[#8CFF3D]" aria-label="Length" />
                  <span className="w-14 text-right text-white/70 text-[13px] tabular-nums">{Math.round(item.len * rig.width_ft)} ft</span>
                </div>
              )}
              {!isTruss(item.type) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={lbl + " w-16"} style={{ fontFamily: SCENE_MONO }}>COLOR</span>
                  {RIG_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => patch(item.id, { color: c })} aria-label={`Color ${c}`} aria-pressed={item.color === c}
                      className="w-8 h-8 rounded-full border-2" style={{ background: c, borderColor: item.color === c ? "#fff" : "transparent" }} />
                  ))}
                  <label className="w-8 h-8 rounded-full border border-dashed border-white/40 overflow-hidden relative cursor-pointer" aria-label="Custom color">
                    <input type="color" value={item.color} onChange={(e) => patch(item.id, { color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </label>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => duplicate(item.id)} className={chip}><Copy className="w-4 h-4" />Duplicate</button>
                <button type="button" onClick={() => remove(item.id)} className={chip + " !text-[#f87171]"}><Trash2 className="w-4 h-4" />Remove</button>
                <button type="button" onClick={() => setSel(null)} className="ml-auto text-white/50 text-[13px] px-2 min-h-[40px]">Done</button>
              </div>
            </div>
          )}

          {!view3d && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className={lbl} style={{ fontFamily: SCENE_MONO }}>TRUSS</span>
                <div className="flex flex-wrap gap-2">
                  {TRUSS_TYPES.map((t) => <button key={t.type} type="button" onClick={() => add(t.type)} className={chip}><Plus className="w-3.5 h-3.5 text-white/50" />{t.label}</button>)}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={lbl} style={{ fontFamily: SCENE_MONO }}>LIGHTS</span>
                <div className="flex flex-wrap gap-2">
                  {FIXTURE_TYPES.map((t) => (
                    <button key={t.type} type="button" onClick={() => add(t.type)} className={chip}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{t.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 flex-wrap pb-6">
            {view3d && <p className="w-full text-white/40 text-[12.5px] -mt-1 mb-1">Drag to turn it, pinch or scroll to zoom.</p>}
            <span className={lbl} style={{ fontFamily: SCENE_MONO }}>STAGE SIZE</span>
            <input type="number" inputMode="numeric" min="8" max="200" value={rig.width_ft} onChange={(e) => setRig((r) => ({ ...r, width_ft: Math.max(8, Math.min(200, Number(e.target.value) || 8)) }))} aria-label="Stage width in feet"
              className="w-16 min-h-[40px] rounded-lg bg-[#111] border border-[#262626] px-2 text-[14px] text-white text-center" />
            <span className="text-white/40 text-[13px]">ft wide ×</span>
            <input type="number" inputMode="numeric" min="6" max="150" value={rig.depth_ft} onChange={(e) => setRig((r) => ({ ...r, depth_ft: Math.max(6, Math.min(150, Number(e.target.value) || 6)) }))} aria-label="Stage depth in feet"
              className="w-16 min-h-[40px] rounded-lg bg-[#111] border border-[#262626] px-2 text-[14px] text-white text-center" />
            <span className="text-white/40 text-[13px]">ft deep</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
