// Putting a tech on an event (job 326): the venue side or the manager /
// artist side can set the audio engineer or lighting tech, from their Fellow
// Pilots (the tech's digital card) or as a name, phone and email.
// assign_gig_tech (supabase/assign_tech_migration.sql) merges just those
// fields into engineer_info[role].
import { supabase } from "@/api/supabaseClient";

export async function assignTech(token, role, tech) {
  const { data, error } = await supabase.rpc("assign_gig_tech", { p_token: token, p_role: role, p_tech: tech });
  if (error) throw error;
  return data || {};
}

// A Fellow Pilot as a tech: their card and how to reach them.
export const pilotTech = (p) => ({
  contact_name: p?.display_name || "",
  contact_phone: p?.contact_phone || "",
  contact_email: p?.contact_email || "",
  card_user_id: p?.pilot_user_id || null,
  card_share_token: p?.card_share_token || null,
});

// The signed-in person's Fellow Pilots, once per page visit.
let cache = null;
export async function loadFellowPilots() {
  if (cache) return cache;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("fellow_pilots")
    .select("id, pilot_user_id, display_name, job_title, contact_email, contact_phone, profile_photo_url, card_share_token")
    .eq("owner_id", user.id).order("display_name", { ascending: true });
  if (error) { console.error(error); return []; }
  cache = data || [];
  return cache;
}
// Techs first (their job title says so), then everyone else.
export const techsFirst = (pilots) => {
  const tech = (p) => /engineer|audio|sound|foh|monitor|light|ld\b|tech/i.test(p.job_title || "");
  return [...pilots.filter(tech), ...pilots.filter((p) => !tech(p))];
};
