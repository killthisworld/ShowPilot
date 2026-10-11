import React, { useEffect, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import {
  buildEventTypeOptions, eventTypeColor, defaultEventTypeColor, getMyEventTypeColors,
  saveMyEventTypeColor, EVENT_COLOR_CHOICES,
} from "@/lib/eventTypes";

// "Event colors" in the Settings drawer: every event type this person deals
// with (the built-ins, ones they added, and any type on their own or linked
// events), each with a swatch. Tap a swatch, pick a color, and it's saved
// straight away; it only changes this person's screens. Default puts the
// type back to the built-in color.
export default function EventTypeColors({ preferences, onSaved }) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState(() => buildEventTypeOptions([], preferences?.custom_event_types));
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
      const extra = Object.keys(getMyEventTypeColors()).map((k) => ({ event_type: k }));
      if (alive) setTypes(buildEventTypeOptions([...shows, ...extra], preferences?.custom_event_types));
    })().catch((e) => console.error(e));
    return () => { alive = false; };
  }, [open, preferences?.custom_event_types]);

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
              const custom = !!mine[key(t)];
              const isOpen = editing === t;
              return (
                <div key={t} className="py-2">
                  <button type="button" onClick={() => setEditing(isOpen ? null : t)} className="w-full flex items-center gap-2.5 text-left" aria-label={`Change color for ${t}`}>
                    <span className="w-5 h-5 rounded-md shrink-0" style={{ background: c, boxShadow: isOpen ? `0 0 0 2px #0d0d0d, 0 0 0 3px ${c}` : "none" }} />
                    <span className="flex-1 min-w-0 text-[14px] text-white truncate">{t}</span>
                    <span className="text-[9px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: savedType === t ? "#8CFF3D" : "rgba(255,255,255,0.35)" }}>
                      {savedType === t ? "SAVED" : custom ? "YOURS" : "DEFAULT"}
                    </span>
                  </button>
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
                      {custom && (
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
          {error && <p className="mt-2 text-[12px] text-[#FF6B6B]">{error}</p>}
        </div>
      )}
    </div>
  );
}
