import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { emptyVenueTemplate } from "@/lib/showTemplates";
import { normalizeRig, rigHasItems } from "@/lib/lightingRig";

// An LD's 3D stages (job 383): their venue templates, each with a lighting
// rig (data.lighting_rig). A stage saved from Rig the stage is a venue
// template with that name, so it also fills the venue on an event and is
// found by venue name for intake links and the event page.

export function useLdStages() {
  const [stages, setStages] = useState(null); // null = loading
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStages([]); return; }
    const { data, error } = await supabase.from("saved_templates").select("id, name, data, updated_at")
      .eq("owner_id", user.id).eq("category", "venue").order("updated_at", { ascending: false, nullsFirst: false });
    if (error) { console.error(error); setStages([]); return; }
    setStages((data || []).map((t) => ({ id: t.id, name: t.name || "", data: t.data || {}, rig: normalizeRig(t.data?.lighting_rig), hasRig: rigHasItems(t.data?.lighting_rig), updated_at: t.updated_at })));
  }, []);
  useEffect(() => { load(); }, [load]);
  return [stages, load];
}

// Save a stage: update the template it came from (or the one with this
// name), else make a new venue template. Returns its id.
export async function saveLdStage({ id = null, name, rig }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save stages");
  const clean = String(name || "").trim() || "My stage";
  let row = null;
  if (id) {
    const { data } = await supabase.from("saved_templates").select("id, data").eq("id", id).eq("owner_id", user.id).maybeSingle();
    row = data;
  }
  if (!row) {
    const { data } = await supabase.from("saved_templates").select("id, data").eq("owner_id", user.id).eq("category", "venue").eq("name", clean).maybeSingle();
    row = data;
  }
  const now = new Date().toISOString();
  if (row) {
    const { error } = await supabase.from("saved_templates").update({ name: clean, data: { ...(row.data || {}), lighting_rig: rig }, updated_at: now }).eq("id", row.id);
    if (error) throw error;
    return row.id;
  }
  const { data, error } = await supabase.from("saved_templates").insert({ owner_id: user.id, category: "venue", name: clean, data: { ...emptyVenueTemplate(), lighting_rig: rig } }).select("id").single();
  if (error) throw error;
  return data.id;
}
