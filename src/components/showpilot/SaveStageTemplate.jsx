import React, { useState } from "react";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { normalizeArtistTemplate } from "@/lib/showTemplates";

// Save an act's stage to My Templates (job 254), for artists / managers (from
// their intake form) and engineers (from the show-night stage plot). It's an
// artist template (saved_templates, category "artist", named after the act):
// the members with their stage positions, inputs, vocals and monitors, plus
// the stage plot files. Saving again under the same name updates it; the
// template's other fields (genres, set length, photo...) are kept.
export async function saveStageTemplate(act) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save templates");
  const name = (act.band_name || "").trim() || "My act";
  const stage = {
    band_members: (act.band_members || []).map(({ notes, ...m }) => m),
    stage_plot_files: act.stage_plot_files || [],
    ...(act.stage_plot_url ? { stage_plot_url: act.stage_plot_url } : {}),
  };
  const { data: existing } = await supabase.from("saved_templates").select("id, data").eq("owner_id", user.id).eq("category", "artist").eq("name", name).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("saved_templates").update({ data: { ...(existing.data || {}), ...stage }, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }
  const fresh = normalizeArtistTemplate({
    set_length_minutes: act.set_length_minutes ?? null,
    genre_tags: act.genre_tags || [],
    general_notes: act.general_notes || "",
    ...(act.photo_url ? { photo_url: act.photo_url } : {}),
    ...stage,
  });
  const { error } = await supabase.from("saved_templates").insert({ owner_id: user.id, category: "artist", name, data: fresh });
  if (error) throw error;
  return "saved";
}

export default function SaveStageTemplateButton({ act, className = "" }) {
  const [state, setState] = useState("idle"); // idle | saving | saved | updated | error
  const save = async () => {
    setState("saving");
    try { setState(await saveStageTemplate(act)); } catch (e) { console.error(e); setState("error"); }
  };
  const label = state === "saving" ? "Saving…" : state === "saved" ? "Saved to My Templates" : state === "updated" ? "Updated in My Templates" : state === "error" ? "Couldn't save. Try again" : "Save to my templates";
  const done = state === "saved" || state === "updated";
  return (
    <button type="button" onClick={save} disabled={state === "saving" || !(act?.band_members || []).length}
      className={`min-h-[44px] px-4 rounded-xl border font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-40 ${className}`}
      style={{ borderColor: done ? "#8CFF3D" : "#3a3a3a", color: state === "error" ? "#f87171" : done ? "#8CFF3D" : "rgba(255,255,255,0.8)" }}>
      {state === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
      {label}
    </button>
  );
}
