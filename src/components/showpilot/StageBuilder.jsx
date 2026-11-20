import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tag, Music2, Power, UserRound, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Undo2, Redo2, Copy, Trash2, RotateCw, RotateCcw, Minus, Plus, Move, Check, Lightbulb } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { TRUSS_TYPES, FIXTURE_TYPES, RIG_COLORS, isTruss, isPerson, isRiser, isLight, isInstrument, isScreen, spinsFully, newRigItem, normalizeRig, rigTypeLabel, lightsOnTruss, rigGroups, rigNamedGroups, newRigId, trussToStage, stageToTruss, snapPlace } from "@/lib/lightingRig";
import { MOTIONS, LOOK_KEYS, lookFromKeys, lookFromCue, keysFromCue, cueSteps, newStageCue, cueSecs } from "@/lib/cueLooks";
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
  // On a phone the rig side is two short panes, RIG and PEOPLE, so nothing
  // needs a long scroll; a computer shows both at once (job 401).
  const [rigPane, setRigPane] = useState("rig");
  const [sheets, setSheets] = useState(() => (acts || []).map((a) => a?.lighting_cues || null));
  const [touchedActs, setTouchedActs] = useState(false);
  const [src, setSrc] = useState(acts && acts.length ? clamp(startAct, 0, acts.length - 1) : "stage");
  const [cueAt, setCueAt] = useState(-1);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null); // a new stage cue, until Save
  const [play, startPlay, stopPlay] = useCuePlayer();
  const [newPerson, setNewPerson] = useState({ name: "", part: "", alone: false }); // alone: an instrument with no one at it (job 395)
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
  const aimable = picked.filter((i) => !isPerson(i.type) && !isRiser(i.type) && !isInstrument(i.type)); // tilt and height
  const people = items.filter((i) => isPerson(i.type));
  const gear = items.filter((i) => isInstrument(i.type)); // instruments with no one at them (job 394)
  const partLabel = (part) => STAGE_POSITIONS.find((p) => p.key === part)?.label || "Instrument";
  const addInstrument = (part) => addItems([{ ...newRigItem("instrument", rig), x: 0.7, y: 0.6, part, color: partColor(part) }]);
  const partColor = (part) => STAGE_POSITIONS.find((p) => p.key === part)?.color || "#E5E7EB";
  // Someone on the stage (job 389): Bob on drums, or just Bob.
  const canAdd = newPerson.alone ? !!newPerson.part : !!newPerson.name.trim();
  const addPerson = () => {
    if (!canAdd) return;
    if (newPerson.alone) addInstrument(newPerson.part);
    else addItems([{ ...newRigItem("person", rig), x: 0.5, y: 0.6, label: newPerson.name.trim(), part: newPerson.part, color: partColor(newPerson.part) }]);
    setNewPerson((p) => ({ name: "", part: "", alone: p.alone }));
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
    const name = String(adding.name || "").trim();
    addItems(lightsOnTruss(one, adding.type, adding.count, rig).map((l) => (name ? { ...l, group: name } : l)));
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
      // Trusses turn, tilt and roll all the way round (job 392); lights tilt to 90.
      const round = k === "rot" || ((k === "tilt" || k === "roll") && spinsFully(t.type));
      const v = (t[k] || 0) + by;
      out[id] = { [k]: !round ? clamp(v, lo, hi) : k === "rot" ? norm360(v) : ((((v + 180) % 360) + 360) % 360) - 180 };
      const kids = r.items.filter((i) => i.on === id && !sel.includes(i.id));
      kids.forEach((c) => {
        if (k === "h") out[c.id] = { h: clamp((c.h || 0) + (out[id].h - (t.h || 0)), 0, 80) };
        else if (k === "rot" || k === "tilt" || k === "roll") {
          // Where it hangs on the truss stays put as the truss turns, tilts
          // or rolls (jobs 388, 398): into the truss's frame and back out.
          const local = stageToTruss(t, [(c.x - t.x) * W, (c.h || 0) - (t.h || 0), (c.y - t.y) * D]);
          const [dx, dy, dz] = trussToStage({ ...t, ...out[id] }, local);
          out[c.id] = { x: clamp(t.x + dx / W, 0, 1), y: clamp(t.y + dz / D, 0, 1), h: clamp((t.h || 0) + dy, 0, 80), ...(k === "rot" ? { rot: norm360((c.rot || 0) + by) } : {}) };
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
  const onTapItem = (id, x, y) => {
    // Someone in hand, tapped onto a riser: they go up there (job 393).
    const tapped = items.find((i) => i.id === id);
    if (moving && sel.length && !sel.includes(id) && tapped && isRiser(tapped.type) && typeof x === "number") return onTapDeck(x, y);
    if (sel.includes(id) && moving) return place(); // tap it again: placed
    if (sel.includes(id)) return sel.length > 1 ? pick([id]) : pick([]);
    pick([id]);
  };
  const onTapDeck = (x, y) => {
    if (moving && sel.length && x !== null) {
      // Tap where it goes: the picked ones move there together.
      let cx = picked.reduce((n, i) => n + i.x, 0) / picked.length;
      let cy = picked.reduce((n, i) => n + i.y, 0) / picked.length;
      // One truss / screen: click to place, lined up with the stage and the
      // rest of the rig (job 399).
      if (one && spinsFully(one.type)) { const sn = snapPlace(x, y, rig, [...sel, ...hungOn(sel)]); x = sn.x; y = sn.y; cx = one.x; cy = one.y; }
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
  // A cue's look, on its lights (none picked = all) with its fade in (job 393).
  const lookOf = (c) => {
    if (!c) return null;
    const own = c === draft || !isAct;
    const base = own ? lookFromKeys(c.keys || {}, c.color, c.bpm) : c.cue.keys ? lookFromCue(c.cue, c.song) : c.look;
    const q = own ? c : c.cue;
    return { ...base, only: q.lights && q.lights.length ? q.lights : null, fadeIn: Number(q.fadeIn) || 0, motion: q.motion || "", speed: Number(q.speed) || 1 };
  };
  const playing = play ? (play.i === "draft" ? draft : list[play.i]) : null;
  const look = useMemo(() => lookOf(playing), [playing, play?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tapping a cue plays it; its arrow opens its settings (job 398).
  const playCue = (i) => { setDraft(null); if (cueAt !== i) setEditing(false); setCueAt(i); startPlay(i, secsOf(list[i])); };
  const toggleEdit = (i) => { setDraft(null); if (editing && cueAt === i) { setEditing(false); return; } setCueAt(i); setEditing(true); };
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
  // The cue's lights (job 393): none picked = all of them.
  const curLights = !cur ? [] : (draft ? draft.lights : isAct ? cur.cue.lights : cur.lights) || [];
  // Named groups first (job 402), then by kind.
  // A named light shows once (job 404): under its name, not again under its kind.
  const unnamed = { items: (rig.items || []).filter((i) => !String(i.group || "").trim()) };
  const lightGroups = [...rigNamedGroups(rig), ...rigGroups(unnamed).filter((g) => g.type !== "truss" && isLight(g.type))];
  const setCueLights = (ids) => setCue({ lights: ids });
  const toggleCueLight = (id) => {
    const it = items.find((i) => i.id === id);
    if (!it || !isLight(it.type)) return;
    setCueLights(curLights.includes(id) ? curLights.filter((x) => x !== id) : [...curLights, id]);
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
  // A command in the edit box: icon over its name on a phone, in a column on a computer.
  const cmd = "h-11 lg:h-9 px-1 lg:px-2.5 rounded-[6px] border text-[11px] lg:text-[12.5px] font-semibold flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-0.5 lg:gap-2 leading-tight";
  // One move with its value: TURN  [<]  15  [>]  (aria labels on the buttons).
  const stepRow = (label, value, less, more, lessName, moreName, LessIcon, MoreIcon) => (
    <div className="flex items-center gap-1.5">
      <span className={lbl + " w-12"} style={mono}>{label}</span>
      <button type="button" className={aimKey} style={keyOff} aria-label={lessName} onClick={less}><LessIcon className="w-4 h-4" /></button>
      <span className="w-12 text-center text-white text-[14px] font-semibold tabular-nums">{value}</span>
      <button type="button" className={aimKey} style={keyOff} aria-label={moreName} onClick={more}><MoreIcon className="w-4 h-4" /></button>
    </div>
  );
  const aimKey = "w-9 h-9 rounded-[6px] border flex items-center justify-center text-white/80 shrink-0 disabled:opacity-30";
  const step = "w-10 h-10 rounded-[6px] border flex items-center justify-center text-white/80 shrink-0";
  const lbl = "text-[10px] tracking-[0.16em]";
  const mono = { fontFamily: SCENE_MONO, color: MA.amber };
  const groups = [...rigNamedGroups(rig), ...rigGroups(unnamed).filter((g) => g.type !== "person" && g.type !== "riser" && g.type !== "instrument")]; // named groups first; people, risers, instruments listed on their own
  const sharedGroup = picked.length > 1 && picked[0].group && picked.every((i) => i.group === picked[0].group) ? picked[0].group : "";
  const pickedLabel = sharedGroup ? `${sharedGroup} · ${picked.length} lights` : one && isInstrument(one.type) ? `${partLabel(one.part)} · no one at it` : one ? `${rigTypeLabel(one.type)}${isTruss(one.type) ? " truss" : ""}${one.label ? ` · ${one.label}` : ""}`
    : (() => { const g = rigGroups({ items: picked }); return g.map((x) => `${x.ids.length} ${x.label}${x.ids.length > 1 ? (x.type === "truss" ? "es" : "s") : ""}`).join(" + "); })();

  const tiltShown = aimable.length && aimable.every((l) => l.tilt === aimable[0].tilt) ? `${aimable[0].tilt}°` : "±";
  const turnShown = picked.length && picked.every((i) => norm360(i.rot) === norm360(picked[0].rot)) ? `${norm360(picked[0].rot)}°` : "±";
  // Trusses and LED screens turn, tilt and roll all the way round.
  const trussesPicked = picked.length > 0 && picked.every((i) => spinsFully(i.type));
  const lightsOff = lights.length > 0 && lights.every((l) => l.off);

  // --- The edit box (jobs 387-392): what's picked - Move, Duplicate, Delete,
  // Add lights, Place - and its name, aim, height, length, color and on / off.
  // Over the stage on a computer, at the top of the panel on a phone.
  const editBox = (where) => sel.length > 0 && tab === "rig" && (
    <div className={`${where === "stage" ? "absolute left-2 right-2 bottom-2 max-h-[60%] overflow-y-auto overscroll-contain hidden lg:flex" : "flex lg:hidden"} rounded-[10px] border p-2 flex-col gap-2`}
      style={{ background: "#101010", borderColor: moving ? MA.amber : "#2f4d1f" }} role="toolbar" aria-label="Picked">
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
          {/* A name for the group (job 402): picked together from On stage, and in cues. */}
          <input value={adding.name || ""} onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} placeholder="Name them (e.g. Front spots) - optional" aria-label="Name this group of lights" maxLength={40}
            className="min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none" />
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
          {/* Organized in three parts (job 392): the commands, what it is
              (name, size, instrument, length, color), and how it sits (aim). */}
          <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[112px_minmax(0,1fr)_auto] lg:gap-4 lg:items-start">
            <div className="grid gap-1.5 lg:flex lg:flex-col" style={{ gridTemplateColumns: `repeat(${one && isTruss(one.type) ? 5 : 4}, minmax(0, 1fr))` }}>
              <button type="button" onClick={place} className={cmd} style={{ background: MA.green, borderColor: MA.green, color: "#111" }}><Check className="w-4 h-4 shrink-0" />Place</button>
              <button type="button" onClick={() => setMoving((m) => !m)} aria-pressed={moving} className={cmd} style={moving ? keyOn : keyOff}><Move className="w-4 h-4 shrink-0" />Move</button>
              <button type="button" onClick={duplicate} className={cmd} style={keyOff}><Copy className="w-4 h-4 shrink-0" />Duplicate</button>
              {one && isTruss(one.type) && (
                <button type="button" onClick={() => setAdding({ type: "spot", count: 4 })} className={cmd} style={keyOff}><Lightbulb className="w-4 h-4 shrink-0" />Add lights</button>
              )}
              <button type="button" onClick={remove} className={cmd} style={{ ...keyOff, color: "#f87171" }}><Trash2 className="w-4 h-4 shrink-0" />Delete</button>
            </div>
            <div className="flex flex-col gap-2 min-w-0">
            {one && (
              <input value={one.label} onChange={(e) => patch(one.id, { label: e.target.value })} placeholder={isPerson(one.type) ? "Their name" : isInstrument(one.type) ? "Label (e.g. spare synth)" : "Name (e.g. SL wash 1)"} aria-label="Name" maxLength={40}
                className={`${isPerson(one.type) ? "w-full max-w-[220px]" : ""} min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none`} />
            )}
            {one && isScreen(one.type) && (
            // An LED screen's size (job 398): width x height.
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={lbl + " w-12"} style={mono}>SIZE</span>
              {[["sw", "Width"], ["sh", "Height"]].map(([k, label]) => (
                <label key={k} className="flex items-center gap-1 text-[12px] text-white/60">
                  {label}
                  <input type="number" inputMode="decimal" min="1" max={k === "sw" ? 120 : 60} step="1" value={one[k]} aria-label={`Screen ${label.toLowerCase()} in feet`}
                    onChange={(e) => { const v = Number(e.target.value); if (v > 0) patch(one.id, { [k]: Math.min(k === "sw" ? 120 : 60, v) }); }}
                    className="w-16 min-h-[36px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-1.5 text-[14px] text-white text-center" />
                  ft
                </label>
              ))}
            </div>
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
            {one && (isPerson(one.type) || isInstrument(one.type)) && <PartChips small noNone={isInstrument(one.type)} value={one.part || ""} onChange={(part) => patch(one.id, { part, color: partColor(part) })} />}
            {one && (isTruss(one.type) || one.type === "led_bar") && (
              <div className="flex items-center gap-2">
                <span className={lbl + " w-14"} style={mono}>{one.type === "truss_circle" ? "SIZE" : "LENGTH"}</span>
                <input type="range" min="0.05" max={one.type === "led_bar" ? 0.4 : 1.1} step="0.01" value={one.len} onChange={(e) => patch(one.id, { len: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="Length" />
                <span className="w-12 text-right text-white/70 text-[13px] tabular-nums">{Math.round(one.len * rig.width_ft)} ft</span>
              </div>
            )}
            {lights.length > 1 && (
              // The picked lights' group name (job 402): name or rename them together.
              <div className="flex items-center gap-1.5">
                <span className={lbl + " w-14"} style={mono}>GROUP</span>
                <input value={lights.every((l) => (l.group || "") === (lights[0].group || "")) ? lights[0].group || "" : ""}
                  onChange={(e) => patchMany(lights.map((l) => l.id), () => ({ group: e.target.value.slice(0, 40) }))}
                  placeholder="Name these lights (e.g. Back wash)" aria-label="Group name for these lights" maxLength={40}
                  className="flex-1 min-w-0 min-h-[36px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none" />
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
            {/* How it sits: the aim pad, and each move with its value. */}
            <div className="flex items-start gap-3">
              <div className="hidden lg:grid grid-cols-3 gap-1 shrink-0" style={{ width: 116 }} role="group" aria-label="Aim">
                <span />
                <button type="button" disabled={!aimable.length} className={aimKey} style={keyOff} aria-label="Tilt up / upstage" onClick={() => nudge("tilt", trussesPicked ? -15 : -10, -90, 90)}><ChevronUp className="w-5 h-5" /></button>
                <span />
                <button type="button" className={aimKey} style={keyOff} aria-label="Turn left" onClick={() => nudge("rot", -15)}><ChevronLeft className="w-5 h-5" /></button>
                <span className="w-9 h-9 rounded-full border border-[#333] bg-[#0e0e0e] flex items-center justify-center text-[9px] tracking-[0.1em]" style={mono} aria-hidden="true">AIM</span>
                <button type="button" className={aimKey} style={keyOff} aria-label="Turn right" onClick={() => nudge("rot", 15)}><ChevronRight className="w-5 h-5" /></button>
                <span />
                <button type="button" disabled={!aimable.length} className={aimKey} style={keyOff} aria-label="Tilt down / downstage" onClick={() => nudge("tilt", trussesPicked ? 15 : 10, -90, 90)}><ChevronDown className="w-5 h-5" /></button>
                <span />
              </div>
              <div className="flex flex-col gap-1.5 min-w-0">
                {stepRow("TURN", turnShown, () => nudge("rot", -15), () => nudge("rot", 15), "Turn left", "Turn right", RotateCcw, RotateCw)}
                {aimable.length > 0 && stepRow("TILT", tiltShown, () => nudge("tilt", trussesPicked ? -15 : -10, -90, 90), () => nudge("tilt", trussesPicked ? 15 : 10, -90, 90), "Tilt up / upstage", "Tilt down / downstage", ChevronUp, ChevronDown)}
                {trussesPicked && stepRow("ROLL", picked.every((i) => (i.roll || 0) === (picked[0].roll || 0)) ? `${picked[0].roll || 0}°` : "±", () => nudge("roll", -15), () => nudge("roll", 15), "Roll left", "Roll right", RotateCcw, RotateCw)}
                {aimable.length > 0 && stepRow("HEIGHT", picked.every((i) => i.h === picked[0].h) ? `${picked[0].h} ft` : "±1", () => nudge("h", -1, 0, 80), () => nudge("h", 1, 0, 80), "Lower", "Higher", Minus, Plus)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Phone: only the pane that's up, and none while something's picked (its
  // edit box takes the space). Computer: everything.
  const pane = (p) => `${!sel.length && rigPane === p ? "flex" : "hidden"} lg:flex flex-col gap-3`;
  const rigPanel = (
    <>
      <div className={pane("rig")}>
      {/* What's on the stage, by kind: tap a kind to pick them all. */}
      <div className="lg:rounded-[8px] lg:border lg:p-2.5 flex flex-col gap-1.5 lg:gap-2" style={{ background: "transparent", borderColor: MA.line }}>
        <span className={lbl} style={mono}>ON STAGE</span>
        {groups.length ? (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const on = g.ids.length === sel.length && g.ids.every((id) => sel.includes(id));
              return (
                <button key={g.type} type="button" onClick={() => (on ? pick([]) : pick(g.ids))} aria-pressed={on} className={key} style={on ? keyOn : keyOff}>
                  {g.named ? <Tag className="w-3.5 h-3.5" style={{ color: g.color }} /> : <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />}{g.label}<span className="tabular-nums text-white/55">×{g.ids.length}</span>
                </button>
              );
            })}
          </div>
        ) : <p className="text-white/40 text-[12.5px]">Nothing rigged yet.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={lbl} style={mono}>TRUSS & SCREENS</span>
        <div className="flex flex-wrap gap-1.5">
          {TRUSS_TYPES.map((t) => <button key={t.type} type="button" onClick={() => add(t.type)} className={key} style={keyOff}><Plus className="w-3.5 h-3.5 text-white/45" />{t.label}</button>)}
          <button type="button" onClick={() => add("screen")} className={key} style={keyOff}><Plus className="w-3.5 h-3.5 text-white/45" /><span className="lg:hidden">Screen</span><span className="hidden lg:inline">LED screen</span></button>
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
          className="w-14 min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2 text-[14px] text-white text-center" />
        <span className="text-white/45 text-[12.5px]">×</span>
        <input type="number" inputMode="numeric" min="6" max="150" value={rig.depth_ft} onChange={(e) => setRig((r) => ({ ...r, depth_ft: clamp(Number(e.target.value) || 6, 6, 150) }))} aria-label="Stage depth in feet"
          className="w-14 min-h-[38px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2 text-[14px] text-white text-center" />
        <span className="text-white/45 text-[12.5px]">ft</span>
        {/* Risers go on the stage, so they're added here (job 394). */}
        <button type="button" onClick={() => add("riser")} className={key + " ml-1"} style={keyOff}><Plus className="w-3.5 h-3.5 text-white/45" />Riser</button>
      </div>
      </div>
      {/* People and instruments (jobs 389, 394, 395): one place to add both -
          a person (name, and what they play if anything) or just an
          instrument with no one at it. */}
      <div className={pane("people").replace("gap-3", "gap-2")}>
        <span className={lbl} style={mono}>PEOPLE & INSTRUMENTS</span>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Add">
          {[[false, "A person"], [true, "Just an instrument"]].map(([alone, label]) => (
            <button key={label} type="button" role="radio" aria-checked={newPerson.alone === alone}
              onClick={() => setNewPerson((p) => ({ ...p, alone, part: alone && !p.part ? "" : p.part }))}
              className={key + " justify-center"} style={newPerson.alone === alone ? keyOn : keyOff}>{alone ? <Music2 className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}{label}</button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {!newPerson.alone ? (
            <input value={newPerson.name} onChange={(e) => setNewPerson((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }}
              placeholder="Name (e.g. Bob)" aria-label="New person's name" maxLength={40}
              className="flex-1 min-w-0 min-h-[40px] rounded-[6px] bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none" />
          ) : (
            <span className="flex-1 min-w-0 self-center text-[12.5px] text-white/50">{newPerson.part ? `${partLabel(newPerson.part)}, no one at it` : "Pick the instrument"}</span>
          )}
          <button type="button" onClick={addPerson} disabled={!canAdd} className={key + " disabled:opacity-40"} style={{ background: MA.amber, borderColor: MA.amber, color: "#111" }}><Plus className="w-4 h-4" />Add</button>
        </div>
        <PartChips noNone={newPerson.alone} value={newPerson.part} onChange={(part) => setNewPerson((p) => ({ ...p, part }))} />
        {(people.length > 0 || gear.length > 0) && (
          // Small squares (job 392): the instrument icon over the name; an
          // instrument with no one at it is dashed.
          <div className="flex flex-wrap gap-1.5">
            {[...people, ...gear].map((p) => {
              const alone = isInstrument(p.type);
              const name = alone ? p.label || partLabel(p.part) : p.label || "Someone";
              return (
                <button key={p.id} type="button" onClick={() => pick([p.id])} aria-pressed={sel.includes(p.id)} aria-label={alone ? `${name}, no one at it` : name}
                  className="w-[68px] h-[68px] rounded-[8px] border flex flex-col items-center justify-center gap-1 px-1"
                  style={sel.includes(p.id) ? keyOn : { background: "#1b1b1b", borderColor: "#2a2a2a", borderStyle: alone ? "dashed" : "solid" }}>
                  <PartIcon part={p.part} color={p.color} size={28} />
                  <span className={`w-full text-center text-[11.5px] font-semibold truncate ${alone ? "text-white/70" : "text-white"}`}>{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  // The cue's settings, opened from its row's arrow (job 398) or for a new
  // one; Save closes it (a new one is kept then).
  const cueEditor = cur && (
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
          {/* 1, the lights: all of them, a kind, or tap them on the stage. */}
          <div className="flex flex-col gap-1.5">
            <span className={lbl} style={mono}>1 · LIGHTS</span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setCueLights([])} aria-pressed={!curLights.length} className={key} style={!curLights.length ? keyOn : keyOff}>All lights</button>
              {lightGroups.map((g) => {
                const n = g.ids.filter((id) => curLights.includes(id)).length;
                const all = n === g.ids.length;
                return (
                  <button key={g.type} type="button" aria-pressed={all}
                    onClick={() => setCueLights(all ? curLights.filter((id) => !g.ids.includes(id)) : [...new Set([...curLights, ...g.ids])])}
                    className={key} style={all ? keyOn : n ? { ...keyOff, borderColor: MA.amber, borderStyle: "dashed" } : keyOff}>
                    {g.named ? <Tag className="w-3.5 h-3.5" style={{ color: g.color }} /> : <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />}{g.label}<span className="tabular-nums text-white/55">{n && !all ? `${n}/${g.ids.length}` : `×${g.ids.length}`}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-[11.5px] text-white/45">{curLights.length ? `${curLights.length} light${curLights.length > 1 ? "s" : ""} in this cue · ` : ""}Tap lights on the stage to add or take them out.</span>
          </div>
          <span className={lbl} style={mono}>2 · FUNCTION</span>
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
          {/* Motion and speed (job 399): how the moving lights move, how fast it all goes. */}
          {(() => {
            const q = draft || (isAct ? cur.cue : cur);
            const sp = Number(q.speed) || 1;
            return (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className={lbl} style={mono}>MOTION</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MOTIONS.map((m) => (
                      <button key={m.id || "still"} type="button" onClick={() => setCue({ motion: m.id })} aria-pressed={(q.motion || "") === m.id}
                        className="h-10 rounded-[6px] border text-[12px] font-bold" style={(q.motion || "") === m.id ? keyOn : keyOff}>{m.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={lbl + " w-12"} style={mono}>SPEED</span>
                  <input type="range" min="0.25" max="4" step="0.25" value={sp} onChange={(e) => setCue({ speed: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="Speed" />
                  <span className="w-10 text-right text-white text-[14px] tabular-nums">×{sp}</span>
                </div>
              </>
            );
          })()}
          {/* 3, the fade: how long it takes to come up. */}
          <div className="flex items-center gap-2">
            <span className={lbl + " shrink-0 whitespace-nowrap"} style={mono}>3 · FADE</span>
            <input type="range" min="0" max="10" step="0.5" value={Number((draft ? draft.fadeIn : isAct ? cur.cue.fadeIn : cur.fadeIn) || 0)} onChange={(e) => setCue({ fadeIn: Number(e.target.value) })} className="flex-1 accent-[#FFB400]" aria-label="Fade in, seconds" />
            <span className="w-10 text-right text-white text-[14px] tabular-nums">{Number((draft ? draft.fadeIn : isAct ? cur.cue.fadeIn : cur.fadeIn) || 0)}s</span>
          </div>
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
      <p className="text-white/45 text-[12.5px] leading-snug">Tap a cue to play it through on the stage. Its arrow opens its settings; swipe one left to delete it.</p>
      <div className="flex flex-col gap-1">
        {isAct ? (
          steps.length ? steps.map((x, i) => (
            <React.Fragment key={x.cue.id || `s${x.songIndex}`}>
            <CueRow n={i + 1} title={x.cue.look || "—"} sub={`${x.song.title || `Song ${x.songIndex + 1}`}${x.cue.at ? ` · ${x.cue.at.trim()}` : ""}`}
              color={x.cue.color || x.song.color || ""} active={!draft && i === cueAt} play={play?.i === i ? play : null} onTap={() => playCue(i)}
              onDelete={x.cue.id ? () => deleteCue(i) : null}
              badge={x.cue.keys ? <span className="relative text-[9.5px] tracking-[0.12em] px-1.5 py-0.5 rounded border" style={{ fontFamily: SCENE_MONO, color: MA.green, borderColor: "#2f4d1f" }}>SET</span> : null}
              open={editing && !draft && cueAt === i} onToggleOpen={() => toggleEdit(i)} />
            {editing && !draft && cueAt === i && cueEditor}
            </React.Fragment>
          )) : <p className="text-white/45 text-[13px]">No cue sheet from {acts[src]?.band_name || "this act"} yet. It comes in with their intake (Lighting cues).</p>
        ) : (
          <>
            {stageCues.map((c, i) => (
              <React.Fragment key={c.id}>
                <CueRow n={i + 1} title={c.name} color={c.color} /* just the title once saved (job 398) */
                  active={!draft && i === cueAt} play={play?.i === i ? play : null} onTap={() => playCue(i)} onDelete={() => deleteCue(i)}
                  open={editing && !draft && cueAt === i} onToggleOpen={() => toggleEdit(i)} />
                {editing && !draft && cueAt === i && cueEditor}
              </React.Fragment>
            ))}
            {!draft && <button type="button" onClick={newCue} className="h-11 rounded-[6px] border border-dashed border-[#3a3a3a] text-[13px] font-semibold text-white/75 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />New cue</button>}
          </>
        )}
      </div>
      {draft && cueEditor}
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
        <div className="relative lg:flex-1 min-h-0 h-[44dvh] [@media(max-height:720px)]:h-[36dvh] lg:h-auto lg:[@media(max-height:720px)]:h-auto shrink-0">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-[13px]">Loading the stage…</div>}>
            <Stage3D rig={rig} members={shownMembers} look={look} dark={rigDark && !look}
              mode={tab === "rig" ? "build" : cur && (draft || editing) ? "pick" : "view"}
              selected={tab === "rig" ? sel : cur && (draft || editing) ? curLights : []} moving={moving && tab === "rig" ? sel : []}
              onTapItem={tab === "rig" ? onTapItem : toggleCueLight} onTapDeck={onTapDeck} onDragStart={onDragStart} onMoveItems={onMoveItems} />
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
            {/* RIG / PEOPLE / CUES on a phone, RIG / CUES on a computer; it stays
                at the top as the panel scrolls (job 401). */}
            <div className="flex gap-1.5 sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 bg-[#121212]" role="tablist">
              {[["rig", "RIG", ""], ["people", "PEOPLE", "lg:hidden"], ["cues", "CUES", ""]].map(([id, label, cls]) => {
                const on = id === "cues" ? tab === "cues" : tab === "rig" && (id === "rig" ? rigPane === "rig" : rigPane === "people");
                const onWide = id === "rig" ? tab === "rig" : on;
                return (
                  <button key={id} type="button" role="tab" aria-selected={on}
                    onClick={() => { if (id === "cues") { setTab("cues"); pick([]); } else { setTab("rig"); setRigPane(id); pick([]); stopPlay(); } }}
                    className={`flex-1 h-10 rounded-[6px] border text-[13px] font-bold tracking-[0.12em] ${cls} ${on ? "" : onWide ? "lg:!bg-[#FFB400] lg:!border-[#FFB400] lg:!text-[#111]" : ""}`}
                    style={{ fontFamily: SCENE_MONO, ...(on ? { background: MA.amber, borderColor: MA.amber, color: "#111" } : keyOff) }}>{label}</button>
                );
              })}
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
// Two rows of six (job 393); small in the edit box.
function PartChips({ value, onChange, small = false, noNone = false }) {
  const chip = `${small ? "h-10" : "h-12"} w-full rounded-[10px] border flex items-center justify-center`;
  return (
    <div className="grid grid-cols-6 gap-1.5" style={{ maxWidth: small ? 300 : 360 }} role="group" aria-label="Plays">
      {!noNone && <button type="button" onClick={() => onChange("")} aria-pressed={!value} aria-label="No instrument" title="No instrument" className={chip}
        style={!value ? { background: "#2a2a2a", borderColor: "#E5E7EB" } : { background: "#161616", borderColor: "#333" }}><PartIcon part="" color={!value ? "#fff" : "#9a9a9a"} size={24} /></button>}
      {STAGE_POSITIONS.filter((p) => p.key !== "other").map((p) => ( // no "Other" here (job 396)
        <button key={p.key} type="button" onClick={() => onChange(p.key)} aria-pressed={value === p.key} aria-label={p.label} title={p.label} className={chip}
          style={value === p.key ? { background: p.color + "33", borderColor: p.color } : { background: "#161616", borderColor: "#333" }}><PartIcon part={p.key} color={p.color} size={30} /></button>
      ))}
    </div>
  );
}
