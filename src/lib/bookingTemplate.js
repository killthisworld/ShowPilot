// Book a date from a template (job 349). A booking package is saved with
// the act's template in My Templates, as data.booking = { saved_at, data }:
// everything the package carries (deal and documents, promo, tech rider,
// hospitality, riders, contact) except the dates and who it goes to. The
// act itself (members, stage plot, notes) always comes fresh from the act's
// template, so a change there shows up in the next package too.
import { supabase } from "@/api/supabaseClient";
import { normalizeArtistTemplate } from "@/lib/showTemplates";

// Kept by the act's template, never by the booking snapshot.
export const ACT_KEYS = ["band_members", "stage_plot_url", "stage_plot_files", "general_notes", "artist_fx_notes", "set_length_minutes"];
const CONTACT_KEYS = ["submitter_name", "submitter_title", "submitter_phone", "submitter_email"];

const nameOf = (row) => String(row?.data?.band_name || row?.name || "").trim();

// The user's acts in My Templates, newest first.
export async function loadActTemplates(userId) {
  const { data, error } = await supabase.from("saved_templates")
    .select("id, name, data, updated_at").eq("owner_id", userId).eq("category", "artist")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, name: nameOf(r), data: r.data || {},
    booking: r.data?.booking && typeof r.data.booking === "object" && r.data.booking.data ? r.data.booking : null,
  }));
}

export const sameAct = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// A package filled from an act (and its booking template, when it has one).
// `empty` is a blank package; the contact you already have is kept unless
// the booking template has its own.
export function packageFromTemplate(act, cur, empty) {
  const d = normalizeArtistTemplate(act.data || {});
  const b = act.booking?.data || {};
  const out = { ...empty, ...b };
  CONTACT_KEYS.forEach((k) => { out[k] = b[k] || cur[k] || ""; });
  out.band_name = act.name || cur.band_name || "";
  out.genre_tags = (d.genre_tags && d.genre_tags.length ? d.genre_tags : b.genre_tags) || [];
  ACT_KEYS.forEach((k) => { if (d[k] !== undefined && d[k] !== null) out[k] = d[k]; });
  out.photo_url = d.photo_url || b.photo_url || "";
  return out;
}

// What a booking template keeps: the package without the act's own parts.
export function snapshotOf(data) {
  const s = { ...(data || {}) };
  ACT_KEYS.forEach((k) => { delete s[k]; });
  return s;
}

// Save the package as the act's booking template. Updates the act's
// template, or makes one for the act when there isn't one yet.
// Returns "updated" | "created". Throws with a message the person can read.
export async function saveBookingTemplate(userId, form, data) {
  const name = String(form.band_name || "").trim();
  if (!name) throw new Error("Name the act first: tap the middle of the web.");
  const acts = await loadActTemplates(userId);
  const act = acts.find((a) => sameAct(a.name, name));
  const booking = { saved_at: new Date().toISOString(), data: snapshotOf(data) };
  if (act) {
    const { error } = await supabase.from("saved_templates")
      .update({ data: { ...act.data, booking }, updated_at: new Date().toISOString() }).eq("id", act.id);
    if (error) throw error;
    return "updated";
  }
  const fresh = {
    band_name: name, genre_tags: form.genre_tags || [], photo_url: form.photo_url || "",
    band_members: form.band_members || [], stage_plot_url: form.stage_plot_url || "", stage_plot_files: form.stage_plot_files || [],
    general_notes: form.general_notes || "", artist_fx_notes: form.artist_fx_notes || [], booking,
  };
  const { error } = await supabase.from("saved_templates").insert({ owner_id: userId, category: "artist", name, data: fresh });
  if (error) {
    if (/TEMPLATE_LIMIT/.test(error.message || "")) throw new Error("Your plan's act limit is full, so this act can't be added to My Templates. Free one up there, or upgrade.");
    throw error;
  }
  return "created";
}
