import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Power, UserRound, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Undo2, Redo2, Copy, Trash2, Minus, Plus, Move, Check, Lightbulb } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { TRUSS_TYPES, FIXTURE_TYPES, RIG_COLORS, isTruss, isPerson, isRiser, isLight, newRigItem, normalizeRig, rigTypeLabel, lightsOnTruss, rigGroups, newRigId } from "@/lib/lightingRig";
import { LOOK_KEYS, lookFromKeys, lookFromCue, keysFromCue, cueSteps, newStageCue, cueSecs } from "@/lib/cueLooks";
import { STAGE_POSITIONS } from "@/lib/stagePositions";
import { stageIconSvg } from "@/lib/stageIcons";
import { CueRow, useCuePlayer } from "@/components/showpilot/CueRow";
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
  const [rig, setRigNow] = useState(() => normalizeRig(start));
  // Undo / redo (job 388): every change to the rig goes through here. Quick
  // runs of changes (a slider, typing a name) count as one step.
  const hist = useRef({ past: [], future: [], at: 0 });
  const [, bump] = useState(0);
  const setRig = (fn) => setRigNow((prev) => {
    const next = typeof fn === "function" ? fn(prev) : fn;
    if (next === prev) return prev;
    const h = hist.current;
    const now = Date.now();
    if (!(h.past.length && now - h.at < 350)) h.past = [...h.past.slice(-79), prev];
    h.at = now;
    h.future = [];
    return next;
  });
  const [sel, setSel] = useState([]);
  const [moving, setMoving] = useState(false); // the picked ones are in hand (grey)
  const [adding, setAdding] = useState(null); // { type, count } - lights onto a truss
  const [tab, setTab] = useState(startTab); // rig | cues
  const [sheets, setSheets] = useState(() => (acts || []).map((a) => a?.lighting_cues || null));
  const [touchedActs, setTouchedActs] = useState(false);
  const [src, setSrc] = useState(acts && acts.length ? clamp(startAct, 0, acts.length - 1) : "stage");
  const [cueAt, setCueAt] = useState(-1);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null); // a new stage cue, until Save
  const [play, startPlay, stopPlay] = useCuePlayer();
  const [newPerson, setNewPerson] = useState({ name: "", part: "" });
  const [rigDark, setRigDark] = useState(false); // all the lights off (job 392)
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
  const lights = picked.filter((i) => isLight(i.type));
  const aimable = picked.filter((i) => !isPerson(i.type) && !isRiser(i.type)); // tilt and height
  const people = items.filter((i) => isPerson(i.type));
  const partColor = (part) => STAGE_POSITIONS.find((p) => p.key === part)?.color || "#E5E7EB";
  // Someone on the stage (job 389): Bob on drums, or just Bob.
  const addPerson = () => {
    const nm = newPerson.name.trim();
    if (!nm) return;
    addItems([{ ...newRigItem("person", rig), x: 0.5, y: 0.6, label: nm, part: newPerson.part, color: partColor(newPerson.part) }]);
    setNewPerson({ name: "", part: "" });
  };
  const patchMany = (ids, fn) => setRig((r) => ({ ...r, items: r.items.map((i) => (ids.includes(i.id) ? { ...i, ...fn(i) } : i)) }));
  const patch = (id, p) => patchMany([id], () => p);
  const pick = (ids, inHand = false) => { setSel(ids); setMoving(inHand && ids.length > 0); setAdding(null); };
  const addItems = (list) => { setRig((r) => ({ ...r, items: [...r.items, ...list] })); pick(list.map((i) => i.id), true); setTab("rig"); };
  const add = (type) => addItems([newRigItem(type, rig)]);
  // A truss goes with its lights; a copy of a truss brings copies of them.
  const remove = () => { const gone = [...sel, ...hungOn(sel)]; setRig((r) => ({ ...r, items: r.items.filter((i) => !gone.includes(i.id)) })); pick([]); };
  const duplicate = () => {
    const ids = {};
    picked.forEach((i) => { ids[i.id] = newRigId(); });
    const shift = (i) => ({ x: clamp(i.x + 0.06, 0, 1), y: clamp(i.y + 0.04, 0, 1) });
    const copies = picked.map((i) => ({ ...i, id: ids[i.id], ...shift(i), ...(i.on && ids[i.on] ? { on: ids[i.on] } : {}) }));
    const kids = items.filter((i) => i.on && ids[i.on] && !ids[i.id]).map((i) => ({ ...i, id: newRigId(), on: ids[i.on], ...shift(i) }));
    setRig((r) => ({ ...r, items: [...r.items, ...copies, ...kids] }));
    pick(copies.map((i) => i.id), true);
    setTab("rig");
  };
  const place = () => pick([]);
  const hangLights = () => {
    if (!one || !isTruss(one.type) || !adding) return;
    addItems(lightsOnTruss(one, adding.type, adding.count, rig));
  };
  // Lights hung on these trusses (job 388): they move, turn, rise and go with them.
  const hungOn = (ids, list = items) => list.filter((i) => i.on && ids.includes(i.on) && !ids.includes(i.id)).map((i) => i.id);
  const nudge = (k, by, lo, hi) => setRig((r) => {
    const W = r.width_ft, D = r.depth_ft;
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
    const out = {};
    sel.forEach((id) => {
      const t = byId[id];
      if (!t) return;
      out[id] = { [k]: k === "rot" ? norm360((t.rot || 0) + by) : clamp((t[k] || 0) + by, lo, hi) };
      const kids = r.items.filter((i) => i.on === id && !sel.includes(i.id));
      kids.forEach((c) => {
        if (k === "h") out[c.id] = { h: clamp((c.h || 0) + (out[id].h - (t.h || 0)), 0, 80) };
        else if (k === "rot") {
          // Round the truss's centre, and turned with it.
          const a = (by * Math.PI) / 180;
          const dx = (c.x - t.x) * W, dy = (c.y - t.y) * D;
          out[c.id] = { x: clamp(t.x + (dx * Math.cos(a) - dy * Math.sin(a)) / W, 0, 1), y: clamp(t.y + (dx * Math.sin(a) + dy * Math.cos(a)) / D, 0, 1), rot: norm360((c.rot || 0) + by) };
        }
      });
    });
    return { ...r, items: r.items.map((i) => (out[i.id] ? { ...i, ...out[i.id] } : i)) };
  });
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [rig, ...h.future];
    h.at = 0;
    setRigNow(prev);
    setSel((s) => s.filter((id) => prev.items.some((i) => i.id === id)));
    setAdding(null);
    bump((n) => n + 1);
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    const next = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, rig];
    h.at = 0;
    setRigNow(next);
    setSel((s) => s.filter((id) => next.items.some((i) => i.id === id)));
    setAdding(null);
    bump((n) => n + 1);
  };
  const canUndo = hist.current.past.length > 0;
  const canRedo = hist.current.future.length > 0;
  // Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z (or Ctrl+Y) - not while typing.
  const keysRef = useRef({});
  keysRef.current = { undo, redo };
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || /INPUT|TEXTAREA/.test(e.target?.tagName || "")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); keysRef.current.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); keysRef.current.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      patchMany([...sel, ...hungOn(sel)], (i) => ({ x: clamp(i.x + x - cx, 0, 1), y: clamp(i.y + y - cy, 0, 1) }));
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

  // --- Cues (job 389): tap a cue and it plays through once - its row fills
  // left to right for its length - then stops. Swipe a cue left to delete it.
  const stageCues = rig.cues || [];
  const actSheet = useMemo(() => (typeof src === "number" ? normalizeCueSheet(sheets[src]) : null), [sheets, src]);
  const steps = useMemo(() => (actSheet ? cueSteps(actSheet) : []), [actSheet]);
  const isAct = typeof src === "number";
  const list = isAct ? steps : stageCues;
  // The cue being edited: a new one (draft) or the one picked.
  const cur = draft || (cueAt >= 0 ? list[cueAt] : null);
  const curKeys = !cur ? {} : draft ? draft.keys : isAct ? (cur.cue.keys || keysFromCue(cur.cue, cur.song)) : cur.keys || {};
  const curColor = !cur ? "" : draft ? draft.color : isAct ? (cur.cue.keys ? cur.cue.color : "") || "" : cur.color || "";
  const secsOf = (c) => (!c ? 8 : c === draft || !isAct ? c.secs || 8 : cueSecs(c.cue.secs, c.song.bpm));
  const lookOf = (c) => (!c ? null : c === draft || !isAct ? lookFromKeys(c.keys || {}, c.color, c.bpm) : c.cue.keys ? lookFromCue(c.cue, c.song) : c.look);
  const playing = play ? (play.i === "draft" ? draft : list[play.i]) : null;
  const look = useMemo(() => lookOf(playing), [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const playCue = (i) => { setDraft(null); setCueAt(i); setEditing(true); startPlay(i, secsOf(list[i])); };
  useEffect(() => { setCueAt(-1); setDraft(null); setEditing(false); stopPlay(); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  // An edit plays the cue again, so the change is seen.
  const replay = (next) => (draft ? startPlay("draft", next?.secs || draft.secs) : cueAt >= 0 && startPlay(cueAt, next?.secs || secsOf(cur)));

  const setStageCue = (i, p) => setRig((r) => ({ ...r, cues: r.cues.map((c, k) => (k === i ? { ...c, ...p } : c)) }));
  const newCue = () => { const d = newStageCue(stageCues.length); setDraft(d); setCueAt(-1); setEditing(true); startPlay("draft", d.secs); };
  const saveCue = () => {
    if (draft) { setRig((r) => ({ ...r, cues: [...(r.cues || []), draft] })); setCueAt(stageCues.length); setDraft(null); }
    setEditing(false);
  };
  const deleteCue = (i) => {
    if (isAct) {
      const st = steps[i];
      if (!st?.cue?.id) return;
      const sheet = normalizeCueSheet(sheets[src]);
      const song = sheet.songs[st.songIndex];
      if (song) song.cues = song.cues.filter((q) => q.id !== st.cue.id);
      setSheets((all) => all.map((x, k) => (k === src ? sheet : x)));
      setTouchedActs(true);
    } else setRig((r) => ({ ...r, cues: r.cues.filter((_, k) => k !== i) }));
    if (cueAt === i) { setCueAt(-1); setEditing(false); }
    else if (cueAt > i) setCueAt(cueAt - 1);
    if (play?.i === i) stopPlay();
  };
  // The LD sets the look of an act's cue: kept on that cue (cue.keys).
  const setActCue = (p) => {
    if (!isAct || !cur) return;
    const sheet = normalizeCueSheet(sheets[src]);
    const song = sheet.songs[cur.songIndex];
    if (!song) return;
    const base = { keys: curKeys, color: curColor, ...p };
    if (cur.cue.id && song.cues.some((q) => q.id === cur.cue.id)) song.cues = song.cues.map((q) => (q.id === cur.cue.id ? { ...q, ...base } : q));
    else song.cues = [...song.cues, { id: newRigId(), at: "", look: cur.cue.look || "", color: "", ...base }];
    setSheets((all) => all.map((x, k) => (k === src ? sheet : x)));
    setTouchedActs(true);
  };
  const setCue = (p) => {
    if (draft) setDraft((d) => ({ ...d, ...p }));
    else if (isAct) setActCue(p);
    else setStageCue(cueAt, p);
    replay(p);
  };
  const toggleCueKey = (id) => setCue({ keys: id === "blackout" ? { blackout: !curKeys.blackout } : { ...curKeys, blackout: false, [id]: !curKeys[id] } });
  const setCueColor = (c) => setCue({ color: c });

  const shownMembers = useMemo(() => {
    if (!acts || !acts.length) return members;
    return actMembers3D(acts[typeof src === "number" ? src : clamp(startAct, 0, acts.length - 1)], colors);
  }, [acts, src, startAct, colors, members]);

  const key = "min-h-[40px] px-3 rounded-[6px] border text-[12.5px] font-semibold flex items-center gap-1.5 tracking-[0.02em]";
  const keyOff = { background: MA.key, borderColor: MA.line, color: "#d6d6d6" };
  const keyOn = { background: "#3a2b00", borderColor: MA.amber, color: MA.amber };
  // A quick command: icon over its name on a phone, side by side when there's room.
  const qk = "min-h-[46px] px-1 rounded-[6px] border text-[11.5px] sm:text-[12.5px] font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 leading-tight text-center";
  const aimKey = "w-9 h-9 rounded-[6px] border flex items-center justify-center text-white/80 shrink-0 disabled:opacity-30";
  const step = "w-10 h-10 rounded-[6px] border flex items-center justify-center text-white/80 shrink-0";
  const lbl = "text-[10px] tracking-[0.16em]";
  const mono = { fontFamily: SCENE_MONO, color: MA.amber };
  const groups = rigGroups(rig).filter((g) => g.type !== "person"); // people have their own list
  const pickedLabel = one ? `${rigTypeLabel(one.type)}${isTruss(one.type) ? " truss" : ""}${one.label ? ` · ${one.label}` : ""}`
    : (() => { const g = rigGroups({ items: picked }); return g.map((x) => `${x.ids.length} ${x.label}${x.ids.length > 1 ? (x.type === "truss" ? "es" : "s") : ""}`).join(" + "); })();

  const tiltShown = aimable.length && aimable.every((l) => l.tilt === aimable[0].tilt) ? `${aimable[0].tilt}°` : "±";
  const turnShown = picked.length && picked.every((i) => norm360(i.rot) === norm360(picked[0].rot)) ? `${norm360(picked[0].rot)}°` : "±";
  // A truss stood up on end, or laid flat again (job 392): standing, it sits on the deck.
  const standing = aimable.length > 0 && aimable.every((i) => isTruss(i.type) && Math.abs(i.tilt || 0) >= 80);
  const standUp = () => {
    const W = rig.width_ft, D = rig.depth_ft;
    patchMany(sel, (i) => {
      if (!isTruss(i.type)) return {};
      if (standing) return { tilt: 0, h: 18 };
      const span = i.type === "truss_box" ? i.len * 0.8 * D : i.len * W; // its size once upright
      return { tilt: 90, h: Math.round(span / 2 + 0.5) };
    });
  };
  const trussesPicked = picked.length > 0 && picked.every((i) => isTruss(i.type));
  const lightsOff = lights.length > 0 && lights.every((l) => l.off);

  // --- The edit box (jobs 387-392): what's picked - Move, Duplicate, Delete,
  // Add lights, Place - and its name, aim, height, length, color and on / off.
  // Over the stage on a computer, at the top of the panel on a phone.
  const editBox = (where) => sel.length > 0 && tab === "rig" && (
    <div className={`${where === "stage" ? "absolute left-2 right-2 bottom-2 max-h-[60%] overflow-y-auto overscroll-contain hidden lg:flex" : "flex lg:hidden"} rounded-[10px] border p-2 flex-col gap-2`}
      style={{ background: "rgba(16,16,16,0.95)", borderColor: moving ? MA.amber : "#2f4d1f" }} role="toolbar" aria-label="Picked">
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
          {/* Two columns on a computer: the commands and settings, then the aim. */}
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-4 lg:items-start">
            <div className="flex flex-col gap-2 min-w-0">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${one && isTruss(one.type) ? 5 : 4}, minmax(0, 1fr))` }}>
            <button type="button" onClick={() => setMoving((m) => !m)} aria-pressed={moving} className={qk} style={moving ? keyOn : keyOff}><Move className="w-4 h-4" />Move</button>
            <button type="button" onClick={duplicate} className={qk} style={keyOff}><Copy className="w-4 h-4" />Duplicate</button>
            <button type="button" onClick={remove} className={qk} style={{ ...keyOff, color: "#f87171" }}><Trash2 className="w-4 h-4" />Delete</button>
            {one && isTruss(one.type) && (
              <button type="button" onClick={() => setAdding({ type: "spot", count: 4 })} className={qk} style={keyOff}><Lightbulb className="w-4 h-4" />Add lights</button>
            )}
            <button type="button" onClick={place} className={qk} style={{ background: MA.green, borderColor: MA.green, color: "#111" }}><Check className="w-4 h-4" />Place</button>
          </div>
          {one && (
            <input value={one.label} onChange={(e) => patch(one.id, { label: e.target.value })} placeholder={isPerson(one.type) ? "Their name" : "Name (e.g. SL wash 1)"} aria-label="Name" maxLength={40}
              className="min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none" />
          )}
          {one && isRiser(one.type) && (
            // A riser's size (job 392): width x depth, and how tall.
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={lbl + " w-12"} style={mono}>SIZE</span>
              {[["rw", "Width", 1], ["rd", "Depth", 1], ["rh", "Height", 0.25]].map(([k, label, by]) => (
                <label key={k} className="flex items-center gap-1 text-[12px] text-white/60">
                  {label}
                  <input type="number" inputMode="decimal" min={k === "rh" ? 0.25 : 1} max={k === "rh" ? 10 : 60} step={by} value={one[k]} aria-label={`Riser ${label.toLowerCase()} in feet`}
                    onChange={(e) => { const v = Number(e.target.value); if (v > 0) patch(one.id, { [k]: Math.min(k === "rh" ? 10 : 60, v) }); }}
                    className="w-16 min-h-[36px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-1.5 text-[14px] text-white text-center" />
                  ft
                </label>
              ))}
            </div>
          )}
          {one && isPerson(one.type) && <PartChips value={one.part || ""} onChange={(part) => patch(one.id, { part, color: partColor(part) })} />}
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
              {/* On / off: an off light stays dark, cues too. */}
              <button type="button" onClick={() => patchMany(lights.map((l) => l.id), () => ({ off: !lightsOff }))} aria-pressed={!lightsOff}
                className={key + " ml-auto"} style={lightsOff ? keyOff : keyOn}><Power className="w-4 h-4" />{lightsOff ? "Off" : "On"}</button>
            </div>
          )}
            </div>
          <div className="flex items-start gap-3 flex-wrap">
            {/* Aim, all four ways: left / right turns it, up / down tilts it
                (people only turn). */}
            <div className="flex flex-col gap-1">
              <span className={lbl} style={mono}>AIM</span>
              <div className="grid grid-cols-3 gap-1" style={{ width: 116 }}>
                <span />
                <button type="button" disabled={!aimable.length} className={aimKey} style={keyOff} aria-label="Tilt up / upstage" onClick={() => nudge("tilt", -10, -90, 90)}><ChevronUp className="w-5 h-5" /></button>
                <span />
                <button type="button" className={aimKey} style={keyOff} aria-label="Turn left" onClick={() => nudge("rot", -15)}><ChevronLeft className="w-5 h-5" /></button>
                <span className="w-9 h-9 rounded-full border border-[#333] bg-[#0e0e0e]" aria-hidden="true" />
                <button type="button" className={aimKey} style={keyOff} aria-label="Turn right" onClick={() => nudge("rot", 15)}><ChevronRight className="w-5 h-5" /></button>
                <span />
                <button type="button" disabled={!aimable.length} className={aimKey} style={keyOff} aria-label="Tilt down / downstage" onClick={() => nudge("tilt", 10, -90, 90)}><ChevronDown className="w-5 h-5" /></button>
                <span />
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-4 min-w-0">
              <div className="flex gap-3 text-[13px] tabular-nums text-white/75">
                <span>Turn <b className="text-white">{turnShown}</b></span>
                {aimable.length > 0 && <span>Tilt <b className="text-white">{tiltShown}</b></span>}
              </div>
              {aimable.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className={lbl + " w-12"} style={mono}>HEIGHT</span>
                  <button type="button" className={aimKey} style={keyOff} aria-label="Lower" onClick={() => nudge("h", -1, 0, 80)}><Minus className="w-4 h-4" /></button>
                  <span className="w-12 text-center text-white text-[14px] font-semibold tabular-nums">{picked.every((i) => i.h === picked[0].h) ? `${picked[0].h} ft` : "±1"}</span>
                  <button type="button" className={aimKey} style={keyOff} aria-label="Higher" onClick={() => nudge("h", 1, 0, 80)}><Plus className="w-4 h-4" /></button>
                </div>
              )}
              {trussesPicked && (
                <button type="button" onClick={standUp} aria-pressed={standing} className={key + " self-start"} style={standing ? keyOn : keyOff}>{standing ? "Lay it flat" : "Stand it up"}</button>
              )}
            </div>
          </div>
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
      <div className="flex flex-col gap-1.5">
        <span className={lbl} style={mono}>RISERS</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => add("riser")} className={key} style={keyOff}><Plus className="w-3.5 h-3.5 text-white/45" />Riser</button>
        </div>
      </div>
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
      {/* People on the stage (job 389): a name, and what they play if anything. */}
      <div className="flex flex-col gap-2">
        <span className={lbl} style={mono}>PEOPLE</span>
        <div className="flex gap-1.5">
          <input value={newPerson.name} onChange={(e) => setNewPerson((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }}
            placeholder="Name (e.g. Bob)" aria-label="New person's name" maxLength={40}
            className="flex-1 min-w-0 min-h-[40px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none" />
          <button type="button" onClick={addPerson} disabled={!newPerson.name.trim()} className={key + " disabled:opacity-40"} style={{ background: MA.amber, borderColor: MA.amber, color: "#111" }}><Plus className="w-4 h-4" />Add</button>
        </div>
        <PartChips value={newPerson.part} onChange={(part) => setNewPerson((p) => ({ ...p, part }))} />
        {people.length > 0 && (
          <div className="flex flex-col gap-1">
            {people.map((p) => (
              <button key={p.id} type="button" onClick={() => pick([p.id])} aria-pressed={sel.includes(p.id)}
                className="min-h-[40px] px-2.5 rounded-[6px] border flex items-center gap-2 text-left" style={sel.includes(p.id) ? keyOn : { background: "#1b1b1b", borderColor: "#2a2a2a" }}>
                <PartIcon part={p.part} color={p.color} size={24} />
                <span className="text-[14px] font-semibold text-white truncate">{p.label || "Someone"}</span>
              </button>
            ))}
          </div>
        )}
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
      <p className="text-white/45 text-[12.5px] leading-snug">Tap a cue to play it through on the stage. Swipe one left to delete it.</p>
      <div className="flex flex-col gap-1">
        {isAct ? (
          steps.length ? steps.map((x, i) => (
            <CueRow key={x.cue.id || `s${x.songIndex}`} n={i + 1} title={x.cue.look || "—"} sub={`${x.song.title || `Song ${x.songIndex + 1}`}${x.cue.at ? ` · ${x.cue.at.trim()}` : ""}`}
              color={x.cue.color || x.song.color || ""} active={!draft && i === cueAt} play={play?.i === i ? play : null} onTap={() => playCue(i)}
              onDelete={x.cue.id ? () => deleteCue(i) : null}
              badge={x.cue.keys ? <span className="relative text-[9.5px] tracking-[0.12em] px-1.5 py-0.5 rounded border" style={{ fontFamily: SCENE_MONO, color: MA.green, borderColor: "#2f4d1f" }}>SET</span> : null} />
          )) : <p className="text-white/45 text-[13px]">No cue sheet from {acts[src]?.band_name || "this act"} yet. It comes in with their intake (Lighting cues).</p>
        ) : (
          <>
            {stageCues.map((c, i) => (
              <CueRow key={c.id} n={i + 1} title={c.name} sub={LOOK_KEYS.filter((k) => c.keys[k.id]).map((k) => k.label).join(", ")} color={c.color}
                active={!draft && i === cueAt} play={play?.i === i ? play : null} onTap={() => playCue(i)} onDelete={() => deleteCue(i)} />
            ))}
            {!draft && <button type="button" onClick={newCue} className="h-11 rounded-[6px] border border-dashed border-[#3a3a3a] text-[13px] font-semibold text-white/75 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />New cue</button>}
          </>
        )}
      </div>
      {/* The cue being made or changed; Save closes it (a new one is kept then). */}
      {cur && (draft || editing) && (
        <div className="rounded-[8px] border p-3 flex flex-col gap-3" style={{ background: MA.panel, borderColor: MA.amber }}>
          <div className="flex items-center gap-2">
            <span className={lbl} style={mono}>{draft ? "NEW CUE" : `CUE ${cueAt + 1}`}</span>
            {isAct && !draft ? (
              <span className="text-[13px] text-white/70 truncate">{cur.cue.at ? `${cur.cue.at.trim()}: ` : ""}{cur.cue.look || "—"}</span>
            ) : (
              <input value={cur.name} onChange={(e) => (draft ? setDraft((d) => ({ ...d, name: e.target.value })) : setStageCue(cueAt, { name: e.target.value }))} aria-label="Cue name" maxLength={60}
                className="flex-1 min-w-0 min-h-[36px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white focus:outline-none" />
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
            <button type="button" onClick={() => setCueColor("")} aria-pressed={!curColor} className="h-7 px-2 rounded-full border text-[11px]" style={!curColor ? { borderColor: "#fff", color: "#fff" } : { borderColor: "#444", color: "#999" }}>{isAct && !draft ? "Their color" : "Rig"}</button>
            {RIG_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setCueColor(c)} aria-label={`Cue color ${c}`} aria-pressed={curColor === c}
                className="w-7 h-7 rounded-full border-2" style={{ background: c, borderColor: curColor === c ? "#fff" : "transparent" }} />
            ))}
          </div>
          {(draft || !isAct) && (
            <div className="flex items-center gap-2">
              <span className={lbl + " w-12"} style={mono}>BPM</span>
              <input type="range" min="60" max="180" value={cur.bpm} onChange={(e) => setCue({ bpm: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="BPM" />
              <span className="w-10 text-right text-white text-[14px] tabular-nums">{cur.bpm}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={lbl + " w-12"} style={mono}>LENGTH</span>
            <input type="range" min="2" max="60" value={Math.round(secsOf(cur))} onChange={(e) => setCue({ secs: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="Length in seconds" />
            <span className="w-10 text-right text-white text-[14px] tabular-nums">{Math.round(secsOf(cur))}s</span>
          </div>
          <div className="flex items-center gap-2">
            {draft && <button type="button" onClick={() => { setDraft(null); setEditing(false); stopPlay(); }} className="text-white/55 text-[13px] px-2 min-h-[42px]">Cancel</button>}
            <button type="button" onClick={saveCue} className="ml-auto h-11 px-5 rounded-[6px] font-bold text-[14px] flex items-center gap-1.5" style={{ background: MA.green, color: "#111" }}><Check className="w-4 h-4" />Save cue</button>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col text-white" style={{ height: "100dvh", background: MA.bg }} role="dialog" aria-label="Rig the stage">
      <style>{"@keyframes sp-cue-fill { from { width: 0% } to { width: 100% } }"}</style>
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 border-b" style={{ borderColor: MA.line, background: "#101010" }}>
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 -ml-1 flex items-center justify-center text-white/70"><ChevronLeft className="w-6 h-6" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.2em]" style={mono}>{title}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={nameLabel} aria-label="Stage name" maxLength={80}
            className="w-full bg-transparent text-white text-[17px] font-semibold placeholder:text-white/30 focus:outline-none" />
        </div>
        <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo" className="w-10 h-10 rounded-[6px] border flex items-center justify-center disabled:opacity-30" style={keyOff}><Undo2 className="w-[18px] h-[18px]" /></button>
        <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo" className="w-10 h-10 rounded-[6px] border flex items-center justify-center disabled:opacity-30" style={keyOff}><Redo2 className="w-[18px] h-[18px]" /></button>
        {onSave && (
          <button type="button" onClick={() => onSave({ name: name.trim(), rig, ...(touchedActs ? { acts: (acts || []).map((a, i) => ({ ...a, lighting_cues: sheets[i] })) } : {}) })} disabled={saving || !name.trim()}
            className="h-10 px-4 rounded-[6px] font-bold text-[14px] disabled:opacity-40" style={{ background: MA.amber, color: "#111" }}>{saving ? "Saving…" : "Save"}</button>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="relative lg:flex-1 min-h-0 h-[52dvh] lg:h-auto">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading the stage…</div>}>
            <Stage3D rig={rig} members={shownMembers} look={look} dark={rigDark && !look} mode={tab === "rig" ? "build" : "view"} selected={tab === "rig" ? sel : []} moving={moving ? sel : []}
              onTapItem={onTapItem} onTapDeck={onTapDeck} onDragStart={onDragStart} onMoveItems={onMoveItems} />
          </Suspense>
          {!items.length && <p className="absolute top-3 left-0 right-0 text-center text-white/45 text-[13px] pointer-events-none px-8">An empty stage. Add trusses and fixtures to rig it.</p>}
          {tab === "cues" && playing && (
            <div className="absolute left-3 right-3 bottom-3 rounded-[8px] bg-black/70 border border-[#333] px-3 py-2 pointer-events-none overflow-hidden">
              <span key={play.key} aria-hidden="true" className="absolute left-0 top-0 bottom-0" style={{ background: (playing === draft || !isAct ? playing.color : playing.cue.color || playing.song.color) || MA.amber, opacity: 0.3, animation: `sp-cue-fill ${play.secs}s linear forwards` }} />
              <div className="relative text-[10px] tracking-[0.16em]" style={mono}>{play.i === "draft" ? "NEW CUE" : `CUE ${play.i + 1} / ${list.length}`}{isAct && play.i !== "draft" ? ` · ${(playing.song.title || `SONG ${playing.songIndex + 1}`).toUpperCase()}` : ""}</div>
              <div className="relative text-[15px] font-semibold truncate">{playing === draft || !isAct ? playing.name : `${playing.cue.at ? `${playing.cue.at.trim()}: ` : ""}${playing.cue.look || "—"}`}</div>
            </div>
          )}
          {editBox("stage")}
          {/* The house lights of the rig: all on / all off (job 392). */}
          {tab === "rig" && items.some((i) => isLight(i.type)) && (
            <button type="button" onClick={() => setRigDark((d) => !d)} aria-pressed={!rigDark} className={key + " absolute top-2 right-2"} style={rigDark ? keyOff : keyOn}>
              <Power className="w-4 h-4" />Lights {rigDark ? "off" : "on"}
            </button>
          )}
        </div>
        <div className="lg:w-[380px] shrink-0 flex-1 lg:flex-none min-h-0 overflow-y-auto overscroll-contain p-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t lg:border-t-0 lg:border-l" style={{ borderColor: MA.line, background: "#121212" }}>
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5" role="tablist">
              {[["rig", "RIG"], ["cues", "CUES"]].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); if (id === "cues") pick([]); else stopPlay(); }}
                  className="flex-1 h-10 rounded-[6px] border text-[13px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, ...(tab === id ? { background: MA.amber, borderColor: MA.amber, color: "#111" } : keyOff) }}>{label}</button>
              ))}
            </div>
            {tab === "rig" && editBox("panel")}
            {tab === "rig" ? rigPanel : cuesPanel}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// What someone plays (jobs 389, 390): the stage plot's instrument icons, or
// none - the icon alone, the name read out for screen readers.
function PartIcon({ part, color, size = 26 }) {
  if (!part) return <UserRound className="shrink-0" style={{ width: size, height: size, color: color || "#E5E7EB" }} aria-hidden="true" />;
  return <span aria-hidden="true" className="block shrink-0 [&>svg]:w-full [&>svg]:h-full" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: stageIconSvg(part, color, size) }} />;
}
function PartChips({ value, onChange }) {
  const chip = "w-12 h-12 rounded-[10px] border flex items-center justify-center";
  return (
    <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Plays">
      <button type="button" onClick={() => onChange("")} aria-pressed={!value} aria-label="No instrument" title="No instrument" className={chip}
        style={!value ? { background: "#2a2a2a", borderColor: "#E5E7EB" } : { background: "#161616", borderColor: "#333" }}><PartIcon part="" color={!value ? "#fff" : "#9a9a9a"} size={24} /></button>
      {STAGE_POSITIONS.map((p) => (
        <button key={p.key} type="button" onClick={() => onChange(p.key)} aria-pressed={value === p.key} aria-label={p.label} title={p.label} className={chip}
          style={value === p.key ? { background: p.color + "33", borderColor: p.color } : { background: "#161616", borderColor: "#333" }}><PartIcon part={p.key} color={p.color} size={30} /></button>
      ))}
    </div>
  );
}
