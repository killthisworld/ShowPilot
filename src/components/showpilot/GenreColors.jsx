import React, { useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { addGenreTag } from "@/lib/eventTypes";

// "Genre colors" in Settings > Customize: the person's genre tags with their
// colors. Tap a tag to pick a new color (saved straight away); "Add" saves a
// new genre to the same list the event forms and filters use.
const CHOICES = ["#EF4444", "#FF6A00", "#EAB308", "#8CFF3D", "#14B8A6", "#3B82F6", "#8B5CF6", "#EC4899", "#9CA3AF"];

export default function GenreColors({ preferences, onSaved }) {
  const [tags, setTags] = useState(preferences?.genre_tags || []);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false); // a dropdown like the other Customize sections (job 267)
  const [error, setError] = useState("");
  useEffect(() => { setTags(preferences?.genre_tags || []); }, [preferences?.genre_tags]);

  const save = async (next) => {
    const prev = tags;
    setTags(next);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase.from("user_preferences").update({ genre_tags: next }).eq("user_id", user.id);
    if (err) {
      console.error(err);
      setTags(prev);
      setError("Couldn't save that color. Try again.");
      return;
    }
    onSaved?.();
  };

  const pick = (name, color) => {
    save(tags.map((t) => (t.name === name ? { ...t, color } : t)));
    setEditing(null);
  };

  const add = async () => {
    const input = window.prompt("Add a new genre:");
    if (!input || !input.trim()) return;
    try {
      const saved = await addGenreTag({ ...preferences, genre_tags: tags }, input);
      if (saved) onSaved?.();
    } catch (e) {
      console.error(e);
      setError("Couldn't add that genre. Try again.");
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-[#1f1f1f] bg-[#111]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-[12px] font-semibold tracking-[0.1em] text-white/80" style={{ fontFamily: SCENE_MONO }}>GENRE COLORS</span>
        <span className="ml-auto flex -space-x-1">
          {tags.slice(0, 6).map((t) => (
            <span key={t.name} className="w-3 h-3 rounded-full border border-[#111]" style={{ background: t.color || "#9CA3AF" }} />
          ))}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
      <div className="px-3 pb-3">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => setEditing(editing === t.name ? null : t.name)}
            className="h-8 px-2.5 rounded-full flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#1a1a1a]"
            style={{ border: `1.5px solid ${t.color || "#9CA3AF"}`, fontFamily: "Inter, system-ui, sans-serif" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: t.color || "#9CA3AF" }} />
            {t.name}
          </button>
        ))}
        <button type="button" onClick={add} className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[13px] font-semibold text-white/70 border border-dashed border-[#3a3a3a]">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] tracking-[0.1em] text-white/50 mr-1" style={{ fontFamily: SCENE_MONO }}>{editing.toUpperCase()}</span>
          {CHOICES.map((c) => (
            <button key={c} type="button" aria-label={`Use ${c} for ${editing}`} onClick={() => pick(editing, c)} className="w-7 h-7 rounded-md" style={{ background: c, boxShadow: "0 0 0 1px rgba(255,255,255,0.15)" }} />
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
      )}
    </div>
  );
}
