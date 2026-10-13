import React, { useEffect, useState } from "react";
import { ChevronDown, Check, Plus, Pipette, Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import {
  buildEventTypeOptions, eventTypeColor, defaultEventTypeColor, getMyEventTypeColors,
  saveMyEventTypeColor, EVENT_COLOR_CHOICES, addCustomEventType, removeEventType, restoreEventType,
} from "@/lib/eventTypes";

// "Event colors" in the Settings drawer: every event type this person deals
// with (the built-ins, ones they added, and any type on their own or linked
// events), each with a swatch. Tap a swatch and pick a preset (saved straight
// away) or any color from the Custom picker (saved when you press Set); it
// only changes this person's screens. Default puts the type back to the built-in color.
// "Add an event type" at the bottom saves a new type (with its color) to the
// same list the event forms and Home filters use, so it shows up there too.
// The bin on a row deletes that type from every list (built-ins included);
// events that already have it keep it. Deleted types can be restored.

// Readable text on top of any picked color.
const inkOn = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 140 ? "#0d0d0d" : "#ffffff";
};

// Custom: the native picker only previews; nothing is saved until Set.
function CustomSwatch({ value, onPick, label = "Custom" }) {
  const [v, setV] = useState(value || "#ffffff");
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (value) { setV(value); setTouched(false); } }, [value]);
  const pending = touched && v.toLowerCase() !== (value || "").toLowerCase();
  return (
    <span className="flex items-center gap-1.5">
      <label className="relative h-7 pl-1.5 pr-2 rounded-md border border-[#2a2a2a] flex items-center gap-1.5 cursor-pointer hover:border-white/40 text-[10px] tracking-[0.08em] text-white/70" style={{ fontFamily: SCENE_MONO }} title="Pick any color">
        <span className="w-4 h-4 rounded-sm" style={{ background: pending ? v : "conic-gradient(#f87171, #fbbf24, #8cff3d, #22d3ee, #a78bfa, #f472b6, #f87171)", boxShadow: pending ? "0 0 0 1px rgba(255,255,255,0.4)" : "none" }} />
        <Pipette className="w-3 h-3" /> {pending ? v.toUpperCase() : label.toUpperCase()}
        <input type="color" value={v} onChange={(e) => { setV(e.target.value); setTouched(true); }} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`${label} color`} />
      </label>
      {pending && (
        <button type="button" onClick={() => onPick(v)} className="h-7 px-2.5 rounded-md text-[11px] font-bold tracking-[0.06em]" style={{ background: v, color: inkOn(v), boxShadow: "0 0 0 1px rgba(255,255,255,0.25)", fontFamily: SCENE_MONO }}>
          SET
        </button>
      )}
    </span>
  );
}

export default function EventTypeColors({ preferences, onSaved }) {
  const [open, setOpen] = useState(false);
  // Types found on this person's events (fetched when opened) plus their own
  // custom and deleted lists, kept locally so a change shows straight away.
  const [found, setFound] = useState([]);
  const [custom, setCustom] = useState(preferences?.custom_event_types || []);
  const [hidden, setHidden] = useState(preferences?.hidden_event_types || []);
  useEffect(() => { setCustom(preferences?.custom_event_types || []); }, [preferences?.custom_event_types]);
  useEffect(() => { setHidden(preferences?.hidden_event_types || []); }, [preferences?.hidden_event_types]);
  const types = React.useMemo(() => buildEventTypeOptions(found, custom, hidden), [found, custom, hidden]);
  const prefsNow = () => ({ ...preferences, custom_event_types: custom, hidden_event_types: hidden, event_type_colors: mine });
  const [confirmDel, setConfirmDel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [mine, setMine] = useState(() => getMyEventTypeColors());
  const [savedType, setSavedType] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setMine(getMyEventTypeColors()); }, [preferences?.event_type_colors]);

  // Types actually on this person's events, owned and linked, fetched the
  // first time the list is opened.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: owned }, { data: links }] = await Promise.all([
        supabase.from("shows").select("event_type").eq("owner_id", user.id),
        supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("archived", false),
      ]);
      const linked = await Promise.all((links || []).slice(0, 40).map(async (l) => {
        const { data } = await supabase.rpc("get_shared_gig", { p_token: l.share_token });
        return data ? { event_type: data.event_type } : null;
      }));
      const shows = [...(owned || []), ...linked.filter(Boolean)];
      if (alive) setFound(shows);
    })().catch((e) => console.error(e));
    return () => { alive = false; };
  }, [open]);

  const del = async (type) => {
    setError("");
    try {
      await removeEventType(prefsNow(), type);
      const k = key(type);
      setCustom((cs) => cs.filter((c) => key(c) !== k));
      setHidden((hs) => (hs.some((h) => key(h) === k) ? hs : [...hs, type]));
      setMine(getMyEventTypeColors());
      setConfirmDel(null);
      setEditing(null);
      onSaved?.();
    } catch (e) {
      console.error(e);
      setError("Couldn't delete that event type. Try again.");
    }
  };
  const restore = async (type) => {
    setError("");
    try {
      await restoreEventType(prefsNow(), type);
      setHidden((hs) => hs.filter((h) => key(h) !== key(type)));
      onSaved?.();
    } catch (e) {
      console.error(e);
      setError("Couldn't restore that event type. Try again.");
    }
  };

  const pick = async (type, color) => {
    setError("");
    try {
      const next = await saveMyEventTypeColor({ ...preferences, event_type_colors: mine }, type, color);
      setMine(next);
      setEditing(null);
      setSavedType(type);
      setTimeout(() => setSavedType((t) => (t === type ? null : t)), 1500);
      onSaved?.();
    } catch (e) {
      console.error(e);
      setError("Couldn't save that color. Try again.");
    }
  };

  const key = (t) => t.trim().toLowerCase();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#8B5CF6");
  const [adding, setAdding] = useState(false);
  const addType = async (e) => {
    e?.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError("");
    setAdding(true);
    try {
      const exists = types.find((t) => key(t) === key(name));
      const saved = exists || (await addCustomEventType(prefsNow(), name));
      const next = await saveMyEventTypeColor({ ...preferences, event_type_colors: mine }, saved, newColor);
      setMine(next);
      setHidden((hs) => hs.filter((h) => key(h) !== key(saved)));
      setCustom((cs) => (exists || cs.some((c) => key(c) === key(saved)) ? cs : [...cs, saved]));
      setNewName("");
      setSavedType(saved);
      setTimeout(() => setSavedType((t) => (t === saved ? null : t)), 1500);
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError("Couldn't add that event type. Try again.");
    }
    setAdding(false);
  };

  return (
    <div className="mb-4 rounded-lg border border-[#1f1f1f] bg-[#111]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-[12px] font-semibold tracking-[0.1em] text-white/80" style={{ fontFamily: SCENE_MONO }}>EVENT COLORS</span>
        <span className="ml-auto flex -space-x-1">
          {types.slice(0, 6).map((t) => (
            <span key={t} className="w-3 h-3 rounded-full border border-[#111]" style={{ background: eventTypeColor(t) }} />
          ))}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-3">
          <p className="text-white/40 text-[11px] leading-snug mb-2">Pick a color for each kind of event. Only you see your colors, on your own and linked events.</p>
          <div className="divide-y divide-[#1c1c1c]">
            {types.map((t) => {
              const c = eventTypeColor(t);
              const isMine = !!mine[key(t)];
              const isOpen = editing === t;
              return (
                <div key={t} className="py-2">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => { setEditing(isOpen ? null : t); setConfirmDel(null); }} className="flex-1 min-w-0 flex items-center gap-2.5 text-left" aria-label={`Change color for ${t}`}>
                      <span className="w-5 h-5 rounded-md shrink-0" style={{ background: c, boxShadow: isOpen ? `0 0 0 2px #0d0d0d, 0 0 0 3px ${c}` : "none" }} />
                      <span className="flex-1 min-w-0 text-[14px] text-white truncate">{t}</span>
                      <span className="text-[9px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: savedType === t ? "#8CFF3D" : "rgba(255,255,255,0.35)" }}>
                        {savedType === t ? "SAVED" : isMine ? "YOURS" : "DEFAULT"}
                      </span>
                    </button>
                    <button type="button" onClick={() => setConfirmDel(confirmDel === t ? null : t)} className="p-1 rounded text-white/25 hover:text-[#FF6B6B]" aria-label={`Delete ${t}`} title="Delete this event type">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {confirmDel === t && (
                    <div className="mt-2 rounded-md border border-[#FF6B6B]/40 bg-[#FF6B6B]/10 px-2.5 py-2">
                      <p className="text-[12px] text-white/80 leading-snug">Delete <b>{t}</b> from your event types? Events that already have it keep it.</p>
                      <div className="mt-1.5 flex gap-2">
                        <button type="button" onClick={() => del(t)} className="h-7 px-3 rounded-md text-[11px] font-bold tracking-[0.06em] bg-[#FF6B6B] text-[#0d0d0d]" style={{ fontFamily: SCENE_MONO }}>DELETE</button>
                        <button type="button" onClick={() => setConfirmDel(null)} className="h-7 px-3 rounded-md text-[11px] tracking-[0.06em] border border-[#2a2a2a] text-white/60 hover:text-white" style={{ fontFamily: SCENE_MONO }}>CANCEL</button>
                      </div>
                    </div>
                  )}
                  {isOpen && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {EVENT_COLOR_CHOICES.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => pick(t, choice)}
                          aria-label={`Use ${choice}`}
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-transform hover:scale-110"
                          style={{ background: choice, boxShadow: choice.toLowerCase() === c?.toLowerCase() ? "0 0 0 2px #0d0d0d, 0 0 0 3px #fff" : "none" }}
                        >
                          {choice.toLowerCase() === c?.toLowerCase() && <Check className="w-3.5 h-3.5 text-[#0d0d0d]" strokeWidth={3} />}
                        </button>
                      ))}
                      <CustomSwatch value={c} onPick={(color) => pick(t, color)} />
                      {isMine && (
                        <button type="button" onClick={() => pick(t, null)} className="h-7 px-2 rounded-md border border-[#2a2a2a] text-[10px] tracking-[0.08em] text-white/60 hover:text-white flex items-center gap-1.5" style={{ fontFamily: SCENE_MONO }}>
                          <span className="w-3 h-3 rounded-sm" style={{ background: defaultEventTypeColor(t) }} /> DEFAULT
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {hidden.length > 0 && (
            <div className="mt-1 pt-2 border-t border-[#1c1c1c] flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] tracking-[0.12em] text-white/35 mr-0.5" style={{ fontFamily: SCENE_MONO }}>DELETED</span>
              {hidden.map((h) => (
                <button key={h} type="button" onClick={() => restore(h)} className="h-6 pl-2 pr-1.5 rounded-full border border-[#2a2a2a] text-[11px] text-white/50 hover:text-white hover:border-white/40 flex items-center gap-1" title={`Restore ${h}`} aria-label={`Restore ${h}`}>
                  {h} <RotateCcw className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
          <form onSubmit={addType} className="mt-2 pt-3 border-t border-[#1c1c1c]">
            <span className="block text-[10px] tracking-[0.12em] text-white/45 mb-1.5" style={{ fontFamily: SCENE_MONO }}>ADD AN EVENT TYPE</span>
            <div className="flex items-center gap-2">
              <label className="relative w-8 h-8 shrink-0 rounded-md cursor-pointer" style={{ background: newColor, boxShadow: "0 0 0 1px rgba(255,255,255,0.15)" }} title="Pick its color">
                <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="New event type color" />
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Album Release"
                className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-[#0b0b0b] border border-[#2a2a2a] text-white text-[14px] placeholder:text-white/25 outline-none focus:border-white/40"
                aria-label="New event type name"
              />
              <button type="submit" disabled={!newName.trim() || adding} className="h-8 px-3 rounded-md flex items-center gap-1 text-[12px] font-bold text-[#0d0d0d] bg-[#8CFF3D] disabled:opacity-40" aria-label="Add event type">
                <Plus className="w-3.5 h-3.5" strokeWidth={3} /> Add
              </button>
            </div>
            <p className="text-white/35 text-[11px] leading-snug mt-1.5">It shows up in every event type list and filter.</p>
          </form>
          {error && <p className="mt-2 text-[12px] text-[#FF6B6B]">{error}</p>}
        </div>
      )}
    </div>
  );
}
