import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Copy, Trash2, RotateCw, RotateCcw, Minus, Plus, Move, Check, Lightbulb, SkipBack, SkipForward, Play, Pause, Square, X } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { TRUSS_TYPES, FIXTURE_TYPES, RIG_COLORS, isTruss, newRigItem, normalizeRig, rigTypeLabel, lightsOnTruss, rigGroups, newRigId } from "@/lib/lightingRig";
import { LOOK_KEYS, lookFromKeys, lookFromCue, keysFromCue, cueSteps, newStageCue } from "@/lib/cueLooks";
import { normalizeCueSheet } from "@/lib/cueSheet";
import { useMyStageColors } from "@/components/showpilot/StagePlotView";
import { actMembers3D } from "@/components/showpilot/LdStageWindow";

const Stage3D = lazy(() => import("@/components/showpilot/Stage3D"));
const MA = { bg: "#141414", panel: "#1b1b1b", key: "#262626", line: "#333", amber: "#FFB400", cyan: "#3DD6F5", green: "#8CFF3D" };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const norm360 = (r) => ((r % 360) + 360) % 360;

// Rig the stage (jobs 383, 387): the LD builds the venue's stage in 3D.
//  - Add a truss or light: it lands in hand (grey). Drag it, or tap the stage
//    where it goes; tap it again (or Place) and it's placed (green).
//  - Tap something placed: Move, Duplicate, Delete, Place - and on a truss,
//    Add lights (what kind, how many) hung along it, in hand to move, tilt and
//    turn together, then tap to place.
//  - Dragging anything placed just moves it; let go and it's placed.
//  - CUES: the LD's own cues for the stage, and each act's cue sheet (on an
//    event) - set a look on every cue and run through them on the rig.
// onSave({ name, rig, acts }) - acts only when act cue sheets were changed.
export default function StageBuilder({
  name: startName = "", rig: start, members = [], acts = null, startAct = 0, startTab = "rig",
  onSave, onClose, saving = false, title = "RIG THE STAGE", nameLabel = "Stage name (e.g. the venue)",
}) {
  const [name, setName] = useState(startName);
  const [rig, setRig] = useState(() => normalizeRig(start));
  const [sel, setSel] = useState([]);
  const [moving, setMoving] = useState(false); // the picked ones are in hand (grey)
  const [adding, setAdding] = useState(null); // { type, count } - lights onto a truss
  const [tab, setTab] = useState(startTab); // rig | cues
  const [sheets, setSheets] = useState(() => (acts || []).map((a) => a?.lighting_cues || null));
  const [touchedActs, setTouchedActs] = useState(false);
  const [src, setSrc] = useState(acts && acts.length ? clamp(startAct, 0, acts.length - 1) : "stage");
  const [cueAt, setCueAt] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [auto, setAuto] = useState(false);
  const colors = useMyStageColors();
  const dragFromPlaced = useRef(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const items = rig.items;
  const picked = useMemo(() => items.filter((i) => sel.includes(i.id)), [items, sel]);
  const one = picked.length === 1 ? picked[0] : null;
  const lights = picked.filter((i) => !isTruss(i.type));
  const patchMany = (ids, fn) => setRig((r) => ({ ...r, items: r.items.map((i) => (ids.includes(i.id) ? { ...i, ...fn(i) } : i)) }));
  const patch = (id, p) => patchMany([id], () => p);
  const pick = (ids, inHand = false) => { setSel(ids); setMoving(inHand && ids.length > 0); setAdding(null); };
  const addItems = (list) => { setRig((r) => ({ ...r, items: [...r.items, ...list] })); pick(list.map((i) => i.id), true); setTab("rig"); };
  const add = (type) => addItems([newRigItem(type, rig)]);
  const remove = () => { setRig((r) => ({ ...r, items: r.items.filter((i) => !sel.includes(i.id)) })); pick([]); };
  const duplicate = () => addItems(picked.map((i) => ({ ...i, id: newRigId(), x: clamp(i.x + 0.06, 0, 1), y: clamp(i.y + 0.04, 0, 1) })));
  const place = () => pick([]);
  const hangLights = () => {
    if (!one || !isTruss(one.type) || !adding) return;
    addItems(lightsOnTruss(one, adding.type, adding.count, rig));
  };
  const nudge = (k, by, lo, hi) => patchMany(sel, (i) => ({ [k]: k === "rot" ? norm360((i.rot || 0) + by) : clamp((i[k] || 0) + by, lo, hi) }));

  // --- Taps and drags from the stage. ---
  const onTapItem = (id) => {
    if (sel.includes(id) && moving) return place(); // tap it again: placed
    if (sel.includes(id)) return sel.length > 1 ? pick([id]) : pick([]);
    pick([id]);
  };
  const onTapDeck = (x, y) => {
    if (moving && sel.length && x !== null) {
      // Tap where it goes: the picked ones move there together.
      const cx = picked.reduce((n, i) => n + i.x, 0) / picked.length;
      const cy = picked.reduce((n, i) => n + i.y, 0) / picked.length;
      patchMany(sel, (i) => ({ x: clamp(i.x + x - cx, 0, 1), y: clamp(i.y + y - cy, 0, 1) }));
      return;
    }
    pick([]);
  };
  const onDragStart = (id) => {
    const inGroup = sel.includes(id);
    dragFromPlaced.current = !(inGroup && moving);
    if (!inGroup) setSel([id]);
    setAdding(null);
    setMoving(true);
  };
  const onMoveItems = (list) => {
    const at = Object.fromEntries(list.map((p) => [p.id, p]));
    setRig((r) => ({ ...r, items: r.items.map((i) => (at[i.id] ? { ...i, x: at[i.id].x, y: at[i.id].y } : i)) }));
    // Something already placed, dragged and let go: placed where it landed.
    if (dragFromPlaced.current) setMoving(false);
  };

  // --- Cues. ---
  const stageCues = rig.cues || [];
  const actSheet = useMemo(() => (typeof src === "number" ? normalizeCueSheet(sheets[src]) : null), [sheets, src]);
  const steps = useMemo(() => (actSheet ? cueSteps(actSheet) : []), [actSheet]);
  const list = typeof src === "number" ? steps : stageCues;
  const cur = cueAt >= 0 ? list[cueAt] : null;
  const curKeys = !cur ? {} : typeof src === "number" ? (cur.cue.keys || keysFromCue(cur.cue, cur.song)) : cur.keys || {};
  const curColor = !cur ? "" : typeof src === "number" ? (cur.cue.keys ? cur.cue.color : "") || "" : cur.color || "";
  const curBpm = !cur ? 120 : typeof src === "number" ? Number(cur.song.bpm) || 120 : cur.bpm || 120;
  const look = useMemo(() => {
    if (!playing || !cur) return null;
    if (typeof src === "number") return cur.cue.keys ? lookFromCue(cur.cue, cur.song) : cur.look;
    return lookFromKeys(cur.keys || {}, cur.color, cur.bpm);
  }, [playing, cur, src]);
  const go = (i) => { if (!list.length) return; setCueAt(clamp(i, 0, list.length - 1)); setPlaying(true); };
  useEffect(() => { setCueAt(-1); setAuto(false); }, [src]);
  // Auto: the next cue after 16 beats.
  useEffect(() => {
    if (!auto || !playing || !list.length) return undefined;
    const id = window.setTimeout(() => setCueAt((i) => (i + 1 < list.length ? i + 1 : (setAuto(false), i))), (60 / curBpm) * 16 * 1000);
    return () => window.clearTimeout(id);
  }, [auto, playing, cueAt, list.length, curBpm]);

  const setStageCue = (i, p) => setRig((r) => ({ ...r, cues: r.cues.map((c, k) => (k === i ? { ...c, ...p } : c)) }));
  const addStageCue = () => { setRig((r) => ({ ...r, cues: [...(r.cues || []), newStageCue((r.cues || []).length)] })); setCueAt(stageCues.length); setPlaying(true); };
  const removeStageCue = (i) => { setRig((r) => ({ ...r, cues: r.cues.filter((_, k) => k !== i) })); setCueAt(-1); };
  // The LD sets the look of an act's cue: kept on that cue (cue.keys).
  const setActCue = (p) => {
    if (typeof src !== "number" || !cur) return;
    const sheet = normalizeCueSheet(sheets[src]);
    const song = sheet.songs[cur.songIndex];
    if (!song) return;
    const base = { keys: curKeys, color: curColor, ...p };
    if (cur.cue.id && song.cues.some((q) => q.id === cur.cue.id)) song.cues = song.cues.map((q) => (q.id === cur.cue.id ? { ...q, ...base } : q));
    else song.cues = [...song.cues, { id: newRigId(), at: "", look: cur.cue.look || "", color: "", ...base }];
    setSheets((all) => all.map((x, k) => (k === src ? sheet : x)));
    setTouchedActs(true);
  };
  const toggleCueKey = (id) => {
    const k = id === "blackout" ? { blackout: !curKeys.blackout } : { ...curKeys, blackout: false, [id]: !curKeys[id] };
    setPlaying(true);
    if (typeof src === "number") setActCue({ keys: k });
    else setStageCue(cueAt, { keys: k });
  };
  const setCueColor = (c) => { setPlaying(true); if (typeof src === "number") setActCue({ color: c }); else setStageCue(cueAt, { color: c }); };

  const shownMembers = useMemo(() => {
    if (!acts || !acts.length) return members;
    return actMembers3D(acts[typeof src === "number" ? src : clamp(startAct, 0, acts.length - 1)], colors);
  }, [acts, src, startAct, colors, members]);

  const key = "min-h-[40px] px-3 rounded-[6px] border text-[12.5px] font-semibold flex items-center gap-1.5 tracking-[0.02em]";
  const keyOff = { background: MA.key, borderColor: MA.line, color: "#d6d6d6" };
  const keyOn = { background: "#3a2b00", borderColor: MA.amber, color: MA.amber };
  // A quick command: icon over its name on a phone, side by side when there's room.
  const qk = "min-h-[46px] px-1 rounded-[6px] border text-[11.5px] sm:text-[12.5px] font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 leading-tight text-center";
  const step = "w-10 h-10 rounded-[6px] border flex items-center justify-center text-white/80 shrink-0";
  const lbl = "text-[10px] tracking-[0.16em]";
  const mono = { fontFamily: SCENE_MONO, color: MA.amber };
  const groups = rigGroups(rig);
  const pickedLabel = one ? `${rigTypeLabel(one.type)}${isTruss(one.type) ? " truss" : ""}${one.label ? ` · ${one.label}` : ""}`
    : (() => { const g = rigGroups({ items: picked }); return g.map((x) => `${x.ids.length} ${x.label}${x.ids.length > 1 ? (x.type === "truss" ? "es" : "s") : ""}`).join(" + "); })();

  // --- Quick commands, over the stage, for what's picked. ---
  const quick = sel.length > 0 && tab === "rig" && (
    <div className="absolute left-2 right-2 bottom-2 rounded-[10px] border p-2 flex flex-col gap-2" style={{ background: "rgba(16,16,16,0.94)", borderColor: moving ? MA.amber : "#2f4d1f" }} role="toolbar" aria-label="Picked">
      <div className="flex items-center gap-2 px-1">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: moving ? "#8a8f96" : MA.green }} />
        <span className="text-[13.5px] font-semibold truncate">{pickedLabel}</span>
        <span className="ml-auto text-[11px] text-white/50 shrink-0">{moving ? <><span className="hidden sm:inline">Drag it, or tap where it goes · </span>Tap it to place</> : "Placed"}</span>
      </div>
      {adding ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {FIXTURE_TYPES.filter((t) => t.type !== "fog").map((t) => (
              <button key={t.type} type="button" onClick={() => setAdding((a) => ({ ...a, type: t.type }))} aria-pressed={adding.type === t.type}
                className={key + " shrink-0"} style={adding.type === t.type ? keyOn : keyOff}><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{t.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className={lbl} style={mono}>HOW MANY</span>
            <button type="button" className={step} style={keyOff} aria-label="Fewer" onClick={() => setAdding((a) => ({ ...a, count: Math.max(1, a.count - 1) }))}><Minus className="w-4 h-4" /></button>
            <span className="w-8 text-center text-[16px] font-bold tabular-nums">{adding.count}</span>
            <button type="button" className={step} style={keyOff} aria-label="More" onClick={() => setAdding((a) => ({ ...a, count: Math.min(24, a.count + 1) }))}><Plus className="w-4 h-4" /></button>
            <button type="button" onClick={() => setAdding(null)} className="ml-auto text-white/55 text-[13px] px-2 min-h-[40px]">Cancel</button>
            <button type="button" onClick={hangLights} className={key} style={{ background: MA.amber, borderColor: MA.amber, color: "#111" }}>Add {adding.count}</button>
          </div>
        </div>
      ) : (
        <>
          {/* Quick commands: big keys in one row. */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${one && isTruss(one.type) && !moving ? 5 : 4}, minmax(0, 1fr))` }}>
            <button type="button" onClick={() => setMoving((m) => !m)} aria-pressed={moving} className={qk} style={moving ? keyOn : keyOff}><Move className="w-4 h-4" />Move</button>
            <button type="button" onClick={duplicate} className={qk} style={keyOff}><Copy className="w-4 h-4" />Duplicate</button>
            <button type="button" onClick={remove} className={qk} style={{ ...keyOff, color: "#f87171" }}><Trash2 className="w-4 h-4" />Delete</button>
            {one && isTruss(one.type) && !moving && (
              <button type="button" onClick={() => setAdding({ type: "spot", count: 4 })} className={qk} style={keyOff}><Lightbulb className="w-4 h-4" />Add lights</button>
            )}
            <button type="button" onClick={place} className={qk} style={{ background: MA.green, borderColor: MA.green, color: "#111" }}><Check className="w-4 h-4" />Place</button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {lights.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className={lbl + " w-9"} style={mono}>TILT</span>
                <button type="button" className={step} style={keyOff} aria-label="Tilt back" onClick={() => nudge("tilt", -10, -90, 90)}><Minus className="w-4 h-4" /></button>
                <span className="w-11 text-center text-[14px] font-semibold tabular-nums">{lights.every((l) => l.tilt === lights[0].tilt) ? `${lights[0].tilt}°` : "±"}</span>
                <button type="button" className={step} style={keyOff} aria-label="Tilt forward" onClick={() => nudge("tilt", 10, -90, 90)}><Plus className="w-4 h-4" /></button>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className={lbl + " w-9"} style={mono}>TURN</span>
              <button type="button" className={step} style={keyOff} aria-label="Turn left" onClick={() => nudge("rot", -15)}><RotateCcw className="w-4 h-4" /></button>
              <span className="w-11 text-center text-[14px] font-semibold tabular-nums">{picked.every((i) => norm360(i.rot) === norm360(picked[0].rot)) ? `${norm360(picked[0].rot)}°` : "±"}</span>
              <button type="button" className={step} style={keyOff} aria-label="Turn right" onClick={() => nudge("rot", 15)}><RotateCw className="w-4 h-4" /></button>
            </span>
          </div>
        </>
      )}
    </div>
  );

  const rigPanel = (
    <>
      {/* What's on the stage, by kind: tap a kind to pick them all. */}
      <div className="rounded-[8px] border p-2.5 flex flex-col gap-2" style={{ background: MA.panel, borderColor: MA.line }}>
        <span className={lbl} style={mono}>ON STAGE</span>
        {groups.length ? (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const on = g.ids.length === sel.length && g.ids.every((id) => sel.includes(id));
              return (
                <button key={g.type} type="button" onClick={() => (on ? pick([]) : pick(g.ids))} aria-pressed={on} className={key} style={on ? keyOn : keyOff}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />{g.label}<span className="tabular-nums text-white/55">×{g.ids.length}</span>
                </button>
              );
            })}
          </div>
        ) : <p className="text-white/40 text-[12.5px]">Nothing rigged yet.</p>}
      </div>
      {picked.length > 0 && (
        <div className="rounded-[8px] border p-3 flex flex-col gap-3" style={{ background: MA.panel, borderColor: one && !isTruss(one.type) ? one.color : "#3d5c2a" }}>
          {one && (
            <input value={one.label} onChange={(e) => patch(one.id, { label: e.target.value })} placeholder="Name (e.g. SL wash 1)" aria-label="Name" maxLength={40}
              className="min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none" />
          )}
          <div className="flex items-center gap-2">
            <span className={lbl + " w-14"} style={mono}>HEIGHT</span>
            <button type="button" className={step} style={keyOff} aria-label="Lower" onClick={() => nudge("h", -1, 0, 80)}><Minus className="w-4 h-4" /></button>
            <span className="w-14 text-center text-white text-[15px] font-semibold tabular-nums">{picked.every((i) => i.h === picked[0].h) ? `${picked[0].h} ft` : "±1 ft"}</span>
            <button type="button" className={step} style={keyOff} aria-label="Higher" onClick={() => nudge("h", 1, 0, 80)}><Plus className="w-4 h-4" /></button>
          </div>
          {one && (isTruss(one.type) || one.type === "led_bar") && (
            <div className="flex items-center gap-2">
              <span className={lbl + " w-14"} style={mono}>{one.type === "truss_circle" ? "SIZE" : "LENGTH"}</span>
              <input type="range" min="0.05" max={one.type === "led_bar" ? 0.4 : 1.1} step="0.01" value={one.len} onChange={(e) => patch(one.id, { len: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="Length" />
              <span className="w-12 text-right text-white/70 text-[13px] tabular-nums">{Math.round(one.len * rig.width_ft)} ft</span>
            </div>
          )}
          {lights.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={lbl + " w-14"} style={mono}>COLOR</span>
              {RIG_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => patchMany(lights.map((l) => l.id), () => ({ color: c }))} aria-label={`Color ${c}`} aria-pressed={lights.every((l) => l.color === c)}
                  className="w-7 h-7 rounded-full border-2" style={{ background: c, borderColor: lights.every((l) => l.color === c) ? "#fff" : "transparent" }} />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className={lbl} style={mono}>TRUSS</span>
        <div className="flex flex-wrap gap-1.5">
          {TRUSS_TYPES.map((t) => <button key={t.type} type="button" onClick={() => add(t.type)} className={key} style={keyOff}><Plus className="w-3.5 h-3.5 text-white/45" />{t.label}</button>)}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={lbl} style={mono}>FIXTURES</span>
        <div className="flex flex-wrap gap-1.5">
          {FIXTURE_TYPES.map((t) => (
            <button key={t.type} type="button" onClick={() => add(t.type)} className={key} style={keyOff}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={lbl} style={mono}>STAGE</span>
        <input type="number" inputMode="numeric" min="8" max="200" value={rig.width_ft} onChange={(e) => setRig((r) => ({ ...r, width_ft: clamp(Number(e.target.value) || 8, 8, 200) }))} aria-label="Stage width in feet"
          className="w-16 min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2 text-[14px] text-white text-center" />
        <span className="text-white/45 text-[12.5px]">ft wide ×</span>
        <input type="number" inputMode="numeric" min="6" max="150" value={rig.depth_ft} onChange={(e) => setRig((r) => ({ ...r, depth_ft: clamp(Number(e.target.value) || 6, 6, 150) }))} aria-label="Stage depth in feet"
          className="w-16 min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2 text-[14px] text-white text-center" />
        <span className="text-white/45 text-[12.5px]">ft deep</span>
      </div>
    </>
  );

  const cuesPanel = (
    <>
      {acts && acts.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {acts.map((a, i) => (
            <button key={i} type="button" onClick={() => setSrc(i)} aria-pressed={src === i} className={key + " shrink-0"} style={src === i ? keyOn : keyOff}>{a.band_name || `Act ${i + 1}`}</button>
          ))}
          <button type="button" onClick={() => setSrc("stage")} aria-pressed={src === "stage"} className={key + " shrink-0"} style={src === "stage" ? keyOn : keyOff}>Stage cues</button>
        </div>
      )}
      {/* The playback. */}
      <div className="grid grid-cols-5 gap-1.5">
        <button type="button" onClick={() => go(cueAt - 1)} disabled={cueAt <= 0} aria-label="Back a cue" className="h-14 rounded-[6px] border flex items-center justify-center disabled:opacity-40" style={keyOff}><SkipBack className="w-5 h-5" /></button>
        <button type="button" onClick={() => { setAuto((a) => !a); setPlaying(true); if (cueAt < 0) go(0); }} disabled={!list.length} aria-pressed={auto} aria-label={auto ? "Stop auto" : "Auto"}
          className="h-14 rounded-[6px] border flex flex-col items-center justify-center text-[10px] font-bold tracking-[0.1em] disabled:opacity-40" style={auto ? { background: "#0f2f37", borderColor: MA.cyan, color: MA.cyan } : keyOff}>{auto ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}AUTO</button>
        <button type="button" onClick={() => go(cueAt + 1)} disabled={!list.length || cueAt >= list.length - 1} aria-label="Go: next cue"
          className="col-span-2 h-14 rounded-[6px] text-[20px] font-black tracking-[0.16em] flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: MA.amber, color: "#111" }}>GO<SkipForward className="w-5 h-5" /></button>
        <button type="button" onClick={() => { setPlaying(false); setAuto(false); }} aria-label="Release" className="h-14 rounded-[6px] border flex flex-col items-center justify-center text-[10px] font-bold tracking-[0.1em]" style={keyOff}><Square className="w-4 h-4" />REL</button>
      </div>
      <div className="flex flex-col gap-1">
        {typeof src === "number" ? (
          steps.length ? steps.map((x, i) => (
            <button key={i} type="button" onClick={() => go(i)} className="min-h-[42px] px-2.5 rounded-[6px] border text-left flex items-center gap-2"
              style={i === cueAt ? { background: "#3a2b00", borderColor: MA.amber } : { background: "#1b1b1b", borderColor: "#2a2a2a" }}>
              <span className="w-6 text-[11px] tabular-nums" style={{ fontFamily: SCENE_MONO, color: i === cueAt ? MA.amber : "#888" }}>{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] text-white/50 truncate">{x.song.title || `Song ${x.songIndex + 1}`}{x.cue.at ? ` · ${x.cue.at.trim()}` : ""}</span>
                <span className="block text-[13.5px] text-white truncate">{x.cue.look || "—"}</span>
              </span>
              {x.cue.keys && <span className="text-[9.5px] tracking-[0.12em] px-1.5 py-0.5 rounded border" style={{ fontFamily: SCENE_MONO, color: MA.green, borderColor: "#2f4d1f" }}>SET</span>}
            </button>
          )) : <p className="text-white/45 text-[13px]">No cue sheet from {acts[src]?.band_name || "this act"} yet. It comes in with their intake (Lighting cues).</p>
        ) : (
          <>
            {stageCues.map((c, i) => (
              <button key={c.id} type="button" onClick={() => go(i)} className="min-h-[42px] px-2.5 rounded-[6px] border text-left flex items-center gap-2"
                style={i === cueAt ? { background: "#3a2b00", borderColor: MA.amber } : { background: "#1b1b1b", borderColor: "#2a2a2a" }}>
                <span className="w-6 text-[11px] tabular-nums" style={{ fontFamily: SCENE_MONO, color: i === cueAt ? MA.amber : "#888" }}>{i + 1}</span>
                {c.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />}
                <span className="flex-1 min-w-0 text-[13.5px] text-white truncate">{c.name}</span>
                <span className="text-[11px] text-white/45 truncate max-w-[45%]">{LOOK_KEYS.filter((k) => c.keys[k.id]).map((k) => k.label).join(", ")}</span>
              </button>
            ))}
            <button type="button" onClick={addStageCue} className="h-11 rounded-[6px] border border-dashed border-[#3a3a3a] text-[13px] font-semibold text-white/75 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />New cue</button>
          </>
        )}
      </div>
      {/* The look of the cue that's up. */}
      {cur && (
        <div className="rounded-[8px] border p-3 flex flex-col gap-3" style={{ background: MA.panel, borderColor: MA.amber }}>
          <div className="flex items-center gap-2">
            <span className={lbl} style={mono}>CUE {cueAt + 1}</span>
            {typeof src === "number" ? (
              <span className="text-[13px] text-white/70 truncate">{cur.cue.at ? `${cur.cue.at.trim()}: ` : ""}{cur.cue.look || "—"}</span>
            ) : (
              <>
                <input value={cur.name} onChange={(e) => setStageCue(cueAt, { name: e.target.value })} aria-label="Cue name" maxLength={60}
                  className="flex-1 min-w-0 min-h-[36px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white focus:outline-none" />
                <button type="button" onClick={() => removeStageCue(cueAt)} aria-label="Delete cue" className="w-9 h-9 flex items-center justify-center text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {LOOK_KEYS.map((k) => {
              const on = !!curKeys[k.id];
              return (
                <button key={k.id} type="button" onClick={() => toggleCueKey(k.id)} aria-pressed={on} className="h-12 rounded-[6px] border text-[12px] font-bold leading-tight px-1"
                  style={on ? (k.id === "blackout" ? { background: "#3a0d0d", borderColor: "#ef4444", color: "#fca5a5" } : keyOn) : keyOff}>{k.label}</button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={lbl + " w-12"} style={mono}>COLOR</span>
            <button type="button" onClick={() => setCueColor("")} aria-pressed={!curColor} className="h-7 px-2 rounded-full border text-[11px]" style={!curColor ? { borderColor: "#fff", color: "#fff" } : { borderColor: "#444", color: "#999" }}>{typeof src === "number" ? "Their color" : "Rig"}</button>
            {RIG_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setCueColor(c)} aria-label={`Cue color ${c}`} aria-pressed={curColor === c}
                className="w-7 h-7 rounded-full border-2" style={{ background: c, borderColor: curColor === c ? "#fff" : "transparent" }} />
            ))}
          </div>
          {typeof src !== "number" && (
            <div className="flex items-center gap-2">
              <span className={lbl + " w-12"} style={mono}>BPM</span>
              <input type="range" min="60" max="180" value={cur.bpm} onChange={(e) => setStageCue(cueAt, { bpm: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="BPM" />
              <span className="w-10 text-right text-white text-[14px] tabular-nums">{cur.bpm}</span>
            </div>
          )}
        </div>
      )}
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col text-white" style={{ height: "100dvh", background: MA.bg }} role="dialog" aria-label="Rig the stage">
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 border-b" style={{ borderColor: MA.line, background: "#101010" }}>
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 -ml-1 flex items-center justify-center text-white/70"><ChevronLeft className="w-6 h-6" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.2em]" style={mono}>{title}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={nameLabel} aria-label="Stage name" maxLength={80}
            className="w-full bg-transparent text-white text-[17px] font-semibold placeholder:text-white/30 focus:outline-none" />
        </div>
        {onSave && (
          <button type="button" onClick={() => onSave({ name: name.trim(), rig, ...(touchedActs ? { acts: (acts || []).map((a, i) => ({ ...a, lighting_cues: sheets[i] })) } : {}) })} disabled={saving || !name.trim()}
            className="h-10 px-4 rounded-[6px] font-bold text-[14px] disabled:opacity-40" style={{ background: MA.amber, color: "#111" }}>{saving ? "Saving…" : "Save"}</button>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="relative lg:flex-1 min-h-0 h-[52dvh] lg:h-auto">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading the stage…</div>}>
            <Stage3D rig={rig} members={shownMembers} look={look} mode={tab === "rig" ? "build" : "view"} selected={tab === "rig" ? sel : []} moving={moving ? sel : []}
              onTapItem={onTapItem} onTapDeck={onTapDeck} onDragStart={onDragStart} onMoveItems={onMoveItems} />
          </Suspense>
          {!items.length && <p className="absolute top-3 left-0 right-0 text-center text-white/45 text-[13px] pointer-events-none px-8">An empty stage. Add trusses and fixtures to rig it.</p>}
          {tab === "cues" && cur && (
            <div className="absolute left-3 right-3 bottom-3 rounded-[8px] bg-black/70 border border-[#333] px-3 py-2 pointer-events-none">
              <div className="text-[10px] tracking-[0.16em]" style={mono}>CUE {cueAt + 1} / {list.length}{typeof src === "number" ? ` · ${(cur.song.title || `SONG ${cur.songIndex + 1}`).toUpperCase()}` : ""}</div>
              <div className="text-[15px] font-semibold truncate">{typeof src === "number" ? `${cur.cue.at ? `${cur.cue.at.trim()}: ` : ""}${cur.cue.look || "—"}` : cur.name}</div>
            </div>
          )}
          {quick}
        </div>
        <div className="lg:w-[380px] shrink-0 flex-1 lg:flex-none min-h-0 overflow-y-auto overscroll-contain p-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t lg:border-t-0 lg:border-l" style={{ borderColor: MA.line, background: "#121212" }}>
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5" role="tablist">
              {[["rig", "RIG"], ["cues", "CUES"]].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); if (id === "cues") pick([]); }}
                  className="flex-1 h-10 rounded-[6px] border text-[13px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, ...(tab === id ? { background: MA.amber, borderColor: MA.amber, color: "#111" } : keyOff) }}>{label}</button>
              ))}
            </div>
            {tab === "rig" ? rigPanel : cuesPanel}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
