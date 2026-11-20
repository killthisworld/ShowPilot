import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Copy, Trash2, RotateCw, RotateCcw, Minus, Plus, Play, Square } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { TRUSS_TYPES, FIXTURE_TYPES, RIG_COLORS, isTruss, newRigItem, normalizeRig, rigTypeLabel } from "@/lib/lightingRig";
import { LOOK_KEYS, lookFromKeys } from "@/lib/cueLooks";

const Stage3D = lazy(() => import("@/components/showpilot/Stage3D"));
const MA = { bg: "#141414", panel: "#1b1b1b", key: "#262626", line: "#333", amber: "#FFB400", cyan: "#3DD6F5" };

// Rig the stage (job 383): the LD builds the venue's stage in 3D - add
// trusses and lights, tap one to pick it, drag it across the stage, set its
// height / turn / length / color - and plays looks on it (wash, spots on the
// singers, chase and strobe to a BPM, fades, blinders, haze, blackout).
// onSave({ name, rig }) keeps it as a stage template.
export default function StageBuilder({ name: startName = "", rig: start, members = [], onSave, onClose, saving = false, title = "RIG THE STAGE", nameLabel = "Stage name (e.g. the venue)" }) {
  const [name, setName] = useState(startName);
  const [rig, setRig] = useState(() => normalizeRig(start));
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("rig"); // rig | looks
  const [keys, setKeys] = useState({});
  const [lookColor, setLookColor] = useState("");
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const item = rig.items.find((i) => i.id === sel) || null;
  const patch = (id, p) => setRig((r) => ({ ...r, items: r.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const add = (type) => { const it = newRigItem(type, rig); setRig((r) => ({ ...r, items: [...r.items, it] })); setSel(it.id); setTab("rig"); };
  const remove = (id) => { setRig((r) => ({ ...r, items: r.items.filter((i) => i.id !== id) })); setSel(null); };
  const duplicate = (id) => {
    const src = rig.items.find((i) => i.id === id);
    if (!src) return;
    const it = { ...src, id: Math.random().toString(36).slice(2, 10), x: Math.min(0.97, src.x + 0.08) };
    setRig((r) => ({ ...r, items: [...r.items, it] }));
    setSel(it.id);
  };
  const look = useMemo(() => (playing ? lookFromKeys(keys, lookColor, bpm) : null), [playing, keys, lookColor, bpm]);
  const toggleKey = (id) => { setPlaying(true); setKeys((k) => (id === "blackout" ? { blackout: !k.blackout } : { ...k, blackout: false, [id]: !k[id] })); };

  const key = "min-h-[40px] px-3 rounded-[6px] border text-[12.5px] font-semibold flex items-center gap-1.5 tracking-[0.02em]";
  const keyOff = { background: MA.key, borderColor: MA.line, color: "#d6d6d6" };
  const step = "w-10 h-10 rounded-[6px] border flex items-center justify-center text-white/80";
  const lbl = "text-[10px] tracking-[0.16em]";

  const panel = (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5" role="tablist">
        {[["rig", "RIG"], ["looks", "LOOKS"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className="flex-1 h-10 rounded-[6px] border text-[13px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, ...(tab === id ? { background: MA.amber, borderColor: MA.amber, color: "#111" } : keyOff) }}>{label}</button>
        ))}
      </div>

      {tab === "rig" && (
        <>
          {item ? (
            <div className="rounded-[8px] border p-3 flex flex-col gap-3" style={{ background: MA.panel, borderColor: isTruss(item.type) ? "#555" : item.color }}>
              <div className="flex items-center gap-2">
                <span className="text-white text-[14px] font-semibold shrink-0">{rigTypeLabel(item.type)}{isTruss(item.type) ? " truss" : ""}</span>
                <input value={item.label} onChange={(e) => patch(item.id, { label: e.target.value })} placeholder="Name (e.g. SL wash 1)" aria-label="Name" maxLength={40}
                  className="flex-1 min-w-0 min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <span className={lbl + " w-14"} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>HEIGHT</span>
                <button type="button" className={step} style={keyOff} aria-label="Lower" onClick={() => patch(item.id, { h: Math.max(0, item.h - 1) })}><Minus className="w-4 h-4" /></button>
                <span className="w-14 text-center text-white text-[15px] font-semibold tabular-nums">{item.h} ft</span>
                <button type="button" className={step} style={keyOff} aria-label="Higher" onClick={() => patch(item.id, { h: Math.min(80, item.h + 1) })}><Plus className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2">
                <span className={lbl + " w-14"} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>TURN</span>
                <button type="button" className={step} style={keyOff} aria-label="Turn left" onClick={() => patch(item.id, { rot: (item.rot - 15) % 360 })}><RotateCcw className="w-4 h-4" /></button>
                <span className="w-14 text-center text-white text-[15px] font-semibold tabular-nums">{((item.rot % 360) + 360) % 360}°</span>
                <button type="button" className={step} style={keyOff} aria-label="Turn right" onClick={() => patch(item.id, { rot: (item.rot + 15) % 360 })}><RotateCw className="w-4 h-4" /></button>
              </div>
              {(isTruss(item.type) || item.type === "led_bar") && (
                <div className="flex items-center gap-2">
                  <span className={lbl + " w-14"} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>{item.type === "truss_circle" ? "SIZE" : "LENGTH"}</span>
                  <input type="range" min="0.05" max={item.type === "led_bar" ? 0.4 : 1.1} step="0.01" value={item.len} onChange={(e) => patch(item.id, { len: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="Length" />
                  <span className="w-12 text-right text-white/70 text-[13px] tabular-nums">{Math.round(item.len * rig.width_ft)} ft</span>
                </div>
              )}
              {!isTruss(item.type) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={lbl + " w-14"} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>COLOR</span>
                  {RIG_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => patch(item.id, { color: c })} aria-label={`Color ${c}`} aria-pressed={item.color === c}
                      className="w-7 h-7 rounded-full border-2" style={{ background: c, borderColor: item.color === c ? "#fff" : "transparent" }} />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => duplicate(item.id)} className={key} style={keyOff}><Copy className="w-4 h-4" />Copy</button>
                <button type="button" onClick={() => remove(item.id)} className={key} style={{ ...keyOff, color: "#f87171" }}><Trash2 className="w-4 h-4" />Remove</button>
                <button type="button" onClick={() => setSel(null)} className="ml-auto text-white/55 text-[13px] px-2 min-h-[40px]">Done</button>
              </div>
            </div>
          ) : (
            <p className="text-white/45 text-[12.5px] leading-snug">Add trusses and lights, then tap one on the stage to pick it and drag it into place. Drag the empty space to turn the view, pinch or scroll to zoom.</p>
          )}
          <div className="flex flex-col gap-1.5">
            <span className={lbl} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>TRUSS</span>
            <div className="flex flex-wrap gap-1.5">
              {TRUSS_TYPES.map((t) => <button key={t.type} type="button" onClick={() => add(t.type)} className={key} style={keyOff}><Plus className="w-3.5 h-3.5 text-white/45" />{t.label}</button>)}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={lbl} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>FIXTURES</span>
            <div className="flex flex-wrap gap-1.5">
              {FIXTURE_TYPES.map((t) => (
                <button key={t.type} type="button" onClick={() => add(t.type)} className={key} style={keyOff}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={lbl} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>STAGE</span>
            <input type="number" inputMode="numeric" min="8" max="200" value={rig.width_ft} onChange={(e) => setRig((r) => ({ ...r, width_ft: Math.max(8, Math.min(200, Number(e.target.value) || 8)) }))} aria-label="Stage width in feet"
              className="w-16 min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2 text-[14px] text-white text-center" />
            <span className="text-white/45 text-[12.5px]">ft wide ×</span>
            <input type="number" inputMode="numeric" min="6" max="150" value={rig.depth_ft} onChange={(e) => setRig((r) => ({ ...r, depth_ft: Math.max(6, Math.min(150, Number(e.target.value) || 6)) }))} aria-label="Stage depth in feet"
              className="w-16 min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2 text-[14px] text-white text-center" />
            <span className="text-white/45 text-[12.5px]">ft deep</span>
          </div>
        </>
      )}

      {tab === "looks" && (
        <div className="flex flex-col gap-3">
          <p className="text-white/45 text-[12.5px] leading-snug">Press looks to see the rig play them. They stack, like a console; Blackout clears.</p>
          <div className="grid grid-cols-3 gap-1.5">
            {LOOK_KEYS.map((k) => {
              const on = playing && !!keys[k.id];
              return (
                <button key={k.id} type="button" onClick={() => toggleKey(k.id)} aria-pressed={on}
                  className="h-14 rounded-[6px] border text-[12px] font-bold leading-tight px-1"
                  style={on ? { background: k.id === "blackout" ? "#3a0d0d" : "#3a2b00", borderColor: k.id === "blackout" ? "#ef4444" : MA.amber, color: k.id === "blackout" ? "#fca5a5" : MA.amber, boxShadow: `0 0 12px ${k.id === "blackout" ? "#ef444455" : "#FFB40055"}` } : keyOff}>
                  {k.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={lbl + " w-14"} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>COLOR</span>
            <button type="button" onClick={() => setLookColor("")} aria-pressed={!lookColor} className="h-7 px-2 rounded-full border text-[11px]" style={!lookColor ? { borderColor: "#fff", color: "#fff" } : { borderColor: "#444", color: "#999" }}>Rig</button>
            {RIG_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => { setLookColor(c); setPlaying(true); }} aria-label={`Look color ${c}`} aria-pressed={lookColor === c}
                className="w-7 h-7 rounded-full border-2" style={{ background: c, borderColor: lookColor === c ? "#fff" : "transparent" }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className={lbl + " w-14"} style={{ fontFamily: SCENE_MONO, color: MA.amber }}>BPM</span>
            <input type="range" min="60" max="180" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="flex-1 accent-[#FFB400]" aria-label="BPM" />
            <span className="w-10 text-right text-white text-[14px] tabular-nums">{bpm}</span>
          </div>
          <button type="button" onClick={() => { setPlaying((p) => !p); if (playing) setKeys({}); }} className={key + " justify-center h-11"} style={playing ? { background: MA.cyan, borderColor: MA.cyan, color: "#111" } : keyOff}>
            {playing ? <><Square className="w-4 h-4" />Release</> : <><Play className="w-4 h-4" />Play the rig</>}
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col text-white" style={{ height: "100dvh", background: MA.bg }} role="dialog" aria-label="Rig the stage">
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 border-b" style={{ borderColor: MA.line, background: "#101010" }}>
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 -ml-1 flex items-center justify-center text-white/70"><ChevronLeft className="w-6 h-6" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.2em]" style={{ fontFamily: SCENE_MONO, color: MA.amber }}>{title}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={nameLabel} aria-label="Stage name" maxLength={80}
            className="w-full bg-transparent text-white text-[17px] font-semibold placeholder:text-white/30 focus:outline-none" />
        </div>
        {onSave && (
          <button type="button" onClick={() => onSave({ name: name.trim(), rig })} disabled={saving || !name.trim()}
            className="h-10 px-4 rounded-[6px] font-bold text-[14px] disabled:opacity-40" style={{ background: MA.amber, color: "#111" }}>{saving ? "Saving…" : "Save"}</button>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="relative lg:flex-1 min-h-0 h-[52dvh] lg:h-auto">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading the stage…</div>}>
            <Stage3D rig={rig} members={members} look={look} mode="build" selected={sel}
              onSelect={(id) => { setSel(id); if (id) setTab("rig"); }}
              onMoveItem={(id, x, y) => patch(id, { x, y })} />
          </Suspense>
          {!rig.items.length && <p className="absolute top-3 left-0 right-0 text-center text-white/45 text-[13px] pointer-events-none px-8">An empty stage. Add trusses and fixtures to rig it.</p>}
        </div>
        <div className="lg:w-[380px] shrink-0 flex-1 lg:flex-none min-h-0 overflow-y-auto overscroll-contain p-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t lg:border-t-0 lg:border-l" style={{ borderColor: MA.line, background: "#121212" }}>
          {panel}
        </div>
      </div>
    </div>,
    document.body
  );
}
