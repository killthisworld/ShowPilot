import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { emptyVenueTemplate, emptyArtistTemplate } from "@/lib/showTemplates";
import { normalizeRig, rigHasItems, isPerson, isInstrument, isRiser } from "@/lib/lightingRig";

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
    // Links waiting on this stage get it with its name (job 458).
    await syncIntakeRigs(row.id, { ...rig, name: clean });
    return row.id;
  }
  const { data, error } = await supabase.from("saved_templates").insert({ owner_id: user.id, category: "venue", name: clean, data: { ...emptyVenueTemplate(), lighting_rig: rig } }).select("id").single();
  if (error) throw error;
  return data.id;
}

// Intake links keep a copy of the stage they were sent with. Saving the
// stage updates that copy on the LD's links still waiting for an answer
// (job 427), so the act sees the stage as it was last saved - lights off
// and all. A link's copy belongs to this stage when it carries the stage's
// id (stage_id, links made since) or shares any item with it (older links).
export async function syncIntakeRigs(stageId, rig) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !rig) return;
    const { data } = await supabase.from("tour_manager_requests").select("id, lighting_rig")
      .eq("engineer_user_id", user.id).eq("status", "pending").not("lighting_rig", "is", null);
    const ids = new Set((rig.items || []).map((i) => i.id));
    const mine = (data || []).filter((r) => {
      const lr = r.lighting_rig || {};
      if (stageId && lr.stage_id) return lr.stage_id === stageId;
      return (lr.items || []).some((i) => ids.has(i.id));
    });
    await Promise.all(mine.map((r) => supabase.from("tour_manager_requests").update({ lighting_rig: { ...rig, ...(stageId ? { stage_id: stageId } : {}) } }).eq("id", r.id)));
  } catch (e) { console.error("Couldn't update intake links' stage", e); }
}

// --- Saving parts of a stage (job 407) ---------------------------------
// The lights (trusses, fixtures, LED screens) are the venue's; the band
// (people and instruments) is the artist's. Risers go with whichever the LD
// picks. parts: { lights, band, risers }.
export const isBandItem = (i) => isPerson(i.type) || isInstrument(i.type);
export const isLightsItem = (i) => !isBandItem(i) && !isRiser(i.type);
export function stagePart(rig, { lights = false, band = false, risers = false }) {
  const r = normalizeRig(rig);
  return { ...r, items: r.items.filter((i) => (lights && isLightsItem(i)) || (band && isBandItem(i)) || (risers && isRiser(i.type))), ...(lights ? {} : { cues: [] }) };
}

// The LD's bands: their artist templates (hasRig: a band on a 3D stage).
export function useLdBands(on = true) {
  const [bands, setBands] = useState(null);
  const load = useCallback(async () => {
    if (!on) { setBands([]); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBands([]); return; }
    const { data, error } = await supabase.from("saved_templates").select("id, name, data, updated_at")
      .eq("owner_id", user.id).eq("category", "artist").order("updated_at", { ascending: false, nullsFirst: false });
    if (error) { console.error(error); setBands([]); return; }
    // Every artist template; hasRig marks the ones with a band on a 3D stage.
    setBands((data || []).map((t) => ({ id: t.id, name: t.name || "", rig: normalizeRig(t.data?.lighting_rig), hasRig: rigHasItems(t.data?.lighting_rig), updated_at: t.updated_at })));
  }, [on]);
  useEffect(() => { load(); }, [load]);
  return [bands, load];
}

// Save a band to the artist template with this name (made if new). Its
// other info (genre, notes...) is kept.
export async function saveLdBand({ name, rig }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save bands");
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Name the artist");
  const { data: row } = await supabase.from("saved_templates").select("id, data").eq("owner_id", user.id).eq("category", "artist").eq("name", clean).maybeSingle();
  const now = new Date().toISOString();
  if (row) {
    const { error } = await supabase.from("saved_templates").update({ data: { ...(row.data || {}), lighting_rig: rig }, updated_at: now }).eq("id", row.id);
    if (error) throw error;
    return row.id;
  }
  const { data, error } = await supabase.from("saved_templates").insert({ owner_id: user.id, category: "artist", name: clean, data: { ...emptyArtistTemplate(), lighting_rig: rig } }).select("id").single();
  if (error) throw error;
  return data.id;
}

// The Save window's choice: the venue's stage gets what was ticked (it
// keeps the band too when the band is ticked); the band also goes to its
// artist template. Returns { venueId, bandId }.
export async function saveStageParts({ id = null, name, rig, parts, artist = "" }) {
  const out = {};
  if (parts.lights) out.venueId = await saveLdStage({ id, name, rig: stagePart(rig, parts) });
  if (parts.band) out.bandId = await saveLdBand({ name: artist, rig: stagePart(rig, { band: true, risers: parts.risers }) });
  return out;
}

const likeExact = (t) => t.replace(/[\\%_]/g, (m) => `\\${m}`); // a name, matched whatever its case

// An act's cue sheet kept with the LD's artist template for the band (job
// 434): saved from the event, and the starting sheet next time the act
// sends none. Matched by the band's name; the template is made if new.
export async function getLdBandCues(name) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("saved_templates").select("data").eq("owner_id", user.id).eq("category", "artist").ilike("name", likeExact(clean)).maybeSingle();
  return data?.data?.lighting_cues || null;
}
export async function saveLdBandCues({ name, cues }) {
  const clean = String(name || "").trim();
  if (!clean || !cues) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: row } = await supabase.from("saved_templates").select("id, data").eq("owner_id", user.id).eq("category", "artist").ilike("name", likeExact(clean)).maybeSingle();
  const now = new Date().toISOString();
  if (row) {
    const { error } = await supabase.from("saved_templates").update({ data: { ...(row.data || {}), lighting_cues: cues }, updated_at: now }).eq("id", row.id);
    if (error) throw error;
    return row.id;
  }
  const { data, error } = await supabase.from("saved_templates").insert({ owner_id: user.id, category: "artist", name: clean, data: { ...emptyArtistTemplate(), lighting_cues: cues } }).select("id").single();
  if (error) throw error;
  return data.id;
}
