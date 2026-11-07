import React, { useEffect, useState } from "react";
import { ChevronDown, Check, Pipette } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { EVENT_COLOR_CHOICES } from "@/lib/eventTypes";
import { STAGE_POSITIONS, positionColor, inkOn } from "@/lib/stagePositions";

// "Stage plot colors" in Settings > Customize (job 249), for audio / lighting
// engineers: a color per position (drums, keys, guitar...). Stage plots that
// acts make on this engineer's intake links use these colors. Saved to
// user_preferences.stage_plot_colors straight away; Default clears one.
const PRESETS = [...EVENT_COLOR_CHOICES, "#8CFF3D", "#FBBF24", "#FB923C", "#F472B6"];

export default function StagePlotColors({ preferences, onSaved }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState(preferences?.stage_plot_colors || {});
  const [editing, setEditing] = useState(null);
  const [savedKey, setSavedKey] = useState(null);
  const [custom, setCustom] = useState("#ffffff");
  const [error, setError] = useState("");
  useEffect(() => { setMine(preferences?.stage_plot_colors || {}); }, [preferences?.stage_plot_colors]);

  const pick = async (key, color) => {
    setError("");
    const next = { ...mine };
    if (color) next[key] = color; else delete next[key];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error: e } = await supabase.from("user_preferences").upsert({ user_id: user.id, stage_plot_colors: next }, { onConflict: "user_id" });
      if (e) throw e;
      setMine(next);
      setEditing(null);
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
      onSaved?.();
    } catch (e) {
      console.error(e);
      setError("Couldn't save that color. Try again.");
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-[#1f1f1f] bg-[#111]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-[12px] font-semibold tracking-[0.1em] text-white/80" style={{ fontFamily: SCENE_MONO }}>STAGE PLOT COLORS</span>
        <span className="ml-auto flex -space-x-1">
          {STAGE_POSITIONS.slice(0, 6).map((p) => (
            <span key={p.key} className="w-3 h-3 rounded-full border border-[#111]" style={{ background: positionColor(p.key, mine) }} />
          ))}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-white/40 text-[11px] leading-snug mb-2">The color for each position on stage plots acts make on your intake links.</p>
          <div className="divide-y divide-[#1c1c1c]">
            {STAGE_POSITIONS.map((p) => {
              const c = positionColor(p.key, mine);
              const isOpen = editing === p.key;
              return (
                <div key={p.key} className="py-2">
                  <button type="button" onClick={() => { setEditing(isOpen ? null : p.key); setCustom(c); }} className="w-full flex items-center gap-2.5 text-left" aria-label={`Change color for ${p.label}`}>
                    <span className="w-5 h-5 rounded-md shrink-0" style={{ background: c, boxShadow: isOpen ? `0 0 0 2px #0d0d0d, 0 0 0 3px ${c}` : "none" }} />
                    <span className="flex-1 min-w-0 text-[14px] text-white truncate">{p.label}</span>
                    <span className="text-[9px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: savedKey === p.key ? "#8CFF3D" : "rgba(255,255,255,0.35)" }}>
                      {savedKey === p.key ? "SAVED" : mine[p.key] ? "YOURS" : "DEFAULT"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {PRESETS.map((choice) => (
                        <button key={choice} type="button" onClick={() => pick(p.key, choice)} aria-label={`Use ${choice}`}
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-transform hover:scale-110"
                          style={{ background: choice, boxShadow: choice.toLowerCase() === c.toLowerCase() ? "0 0 0 2px #0d0d0d, 0 0 0 3px #fff" : "none" }}>
                          {choice.toLowerCase() === c.toLowerCase() && <Check className="w-3.5 h-3.5" style={{ color: inkOn(choice) }} strokeWidth={3} />}
                        </button>
                      ))}
                      <label className="relative h-7 pl-1.5 pr-2 rounded-md border border-[#2a2a2a] flex items-center gap-1.5 cursor-pointer hover:border-white/40 text-[10px] tracking-[0.08em] text-white/70" style={{ fontFamily: SCENE_MONO }} title="Pick any color">
                        <span className="w-4 h-4 rounded-sm" style={{ background: custom }} />
                        <Pipette className="w-3 h-3" /> CUSTOM
                        <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`Custom color for ${p.label}`} />
                      </label>
                      {custom.toLowerCase() !== c.toLowerCase() && (
                        <button type="button" onClick={() => pick(p.key, custom)} className="h-7 px-2.5 rounded-md text-[11px] font-bold tracking-[0.06em]" style={{ background: custom, color: inkOn(custom), fontFamily: SCENE_MONO }}>SET</button>
                      )}
                      {mine[p.key] && (
                        <button type="button" onClick={() => pick(p.key, null)} className="h-7 px-2 rounded-md border border-[#2a2a2a] text-[10px] tracking-[0.08em] text-white/60 hover:text-white flex items-center gap-1.5" style={{ fontFamily: SCENE_MONO }}>
                          <span className="w-3 h-3 rounded-sm" style={{ background: p.color }} /> DEFAULT
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
