// Make an offer from a template (job 429): a venue saves an offer as its
// offer template, kept on its venue template in My Templates as
// data.offer = { saved_at, data, times }. It carries everything except the
// dates and who it goes to: the venue's profile, the deal, room,
// hospitality, logistics and documents, plus the usual times (set time,
// load-in, billing) that each new date starts from.
import { supabase } from "@/api/supabaseClient";
import { emptyVenueTemplate } from "@/lib/showTemplates";

export const OFFER_KEYS = ["profile", "deal", "room", "hosp", "logi", "files"];
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// The venue templates, newest first, and the one holding the offer template.
export async function loadOfferTemplate(userId) {
  const { data, error } = await supabase.from("saved_templates")
    .select("id, name, data, updated_at").eq("owner_id", userId).eq("category", "venue")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const withOffer = rows.find((r) => isObj(r.data?.offer) && isObj(r.data.offer.data)) || null;
  return { rows, latest: rows[0] || null, row: withOffer, offer: withOffer ? withOffer.data.offer : null };
}

export function snapshotOf(data, wants) {
  const out = {};
  OFFER_KEYS.forEach((k) => { if (data?.[k] !== undefined) out[k] = data[k]; });
  const d0 = (Array.isArray(wants?.dates) ? wants.dates : [])[0] || {};
  const times = { set_time: d0.set_time || "", load_in: d0.load_in || "", billing: d0.billing || "" };
  return { data: out, times };
}

// Save it on the venue template that already has one, else the newest venue
// template, else a new venue template named after the venue.
// Returns "updated" | "created". Throws with a message the person can read.
export async function saveOfferTemplate(userId, data, wants, venueName) {
  const { row, latest } = await loadOfferTemplate(userId);
  const offer = { saved_at: new Date().toISOString(), ...snapshotOf(data, wants) };
  const target = row || latest;
  if (target) {
    const { error } = await supabase.from("saved_templates")
      .update({ data: { ...(target.data || {}), offer }, updated_at: new Date().toISOString() }).eq("id", target.id);
    if (error) throw error;
    return "updated";
  }
  const name = String(venueName || "").trim() || "My venue";
  const { error } = await supabase.from("saved_templates").insert({ owner_id: userId, category: "venue", name, data: { ...emptyVenueTemplate(), offer } });
  if (error) {
    if (/TEMPLATE_LIMIT/.test(error.message || "")) throw new Error("Your plan's venue template limit is full, so this can't be saved. Free one up in My Templates, or upgrade.");
    throw error;
  }
  return "created";
}
