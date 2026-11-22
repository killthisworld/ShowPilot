// The DJ press kit (job 457, Jay 2026-11-22): DJ mode's Profile tab.
//
// The kit is kept in the DJ's artist template (saved_templates, category
// 'artist', data.dj_kit = true), so intake forms keep filling the act's
// name, photo, genres and contact from it. Kit-only fields are prefixed
// kit_ so they never collide with what an artist template already holds:
//   kit_city, kit_bio, kit_mixes [{ title, url }], kit_photos [{ url }],
//   kit_logo_url, kit_links [{ kind, url }]
// Shared fields: name (the template's name), photo_url, genre_tags,
// contact_name / contact_email / contact_phone.
// The public link is a row in dj_press_kits (token) read by get_dj_press_kit.
import { supabase } from "@/api/supabaseClient";
import { emptyArtistTemplate, normalizeArtistTemplate } from "@/lib/showTemplates";

// Platforms a DJ links to, in the order they're offered.
export const KIT_PLATFORMS = ["Instagram", "SoundCloud", "Mixcloud", "Resident Advisor", "Spotify", "Bandcamp", "YouTube", "TikTok", "Beatport", "Website"];

// Name the platform from a pasted link, so the DJ only pastes.
export function platformOf(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("instagram.")) return "Instagram";
  if (u.includes("soundcloud.")) return "SoundCloud";
  if (u.includes("mixcloud.")) return "Mixcloud";
  if (u.includes("ra.co") || u.includes("residentadvisor.")) return "Resident Advisor";
  if (u.includes("spotify.")) return "Spotify";
  if (u.includes("bandcamp.")) return "Bandcamp";
  if (u.includes("youtube.") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("tiktok.")) return "TikTok";
  if (u.includes("beatport.")) return "Beatport";
  return "Website";
}

// A link someone typed without https:// still opens.
export function href(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export const kitUrl = (token) => `${window.location.origin}/kit/${token}`;

// The DJ's kit: their template (made if they have none) and the share link
// row, if they've made one.
export async function loadKit(fallbackName = "") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { data: rows, error } = await supabase
    .from("saved_templates").select("id, name, data, created_at")
    .eq("owner_id", user.id).eq("category", "artist").order("created_at");
  if (error) throw error;
  let t = (rows || []).find((r) => r.data?.dj_kit) || (rows || [])[0] || null;
  if (!t) {
    const name = fallbackName || user.user_metadata?.full_name || "";
    const { data: made, error: e2 } = await supabase
      .from("saved_templates")
      .insert({ owner_id: user.id, category: "artist", name: name || "My DJ name", data: { ...emptyArtistTemplate(), dj_kit: true } })
      .select("id, name, data").single();
    if (e2) throw e2;
    t = made;
  }
  const { data: link } = await supabase.from("dj_press_kits").select("token, template_id, show_dates").eq("owner_id", user.id).maybeSingle();
  return { userId: user.id, template: { id: t.id, name: t.name || "", data: normalizeArtistTemplate(t.data || {}) }, link: link || null };
}

export async function saveKit(id, name, data) {
  const { error } = await supabase
    .from("saved_templates")
    .update({ name: (name || "").trim() || "My DJ name", data: { ...data, dj_kit: true }, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// The share link: made the first time, then the same one every time.
export async function ensureKitLink(userId, templateId, current) {
  if (current?.token && current.template_id === templateId) return current;
  const { data, error } = await supabase
    .from("dj_press_kits")
    .upsert({ owner_id: userId, template_id: templateId }, { onConflict: "owner_id" })
    .select("token, template_id, show_dates").single();
  if (error) {
    if (/dj_press_kits/.test(error.message || "")) throw new Error("Sharing needs a database update first. Try again soon.");
    throw error;
  }
  return data;
}

export async function setKitShowDates(userId, templateId, on) {
  const { data, error } = await supabase
    .from("dj_press_kits")
    .upsert({ owner_id: userId, template_id: templateId, show_dates: !!on }, { onConflict: "owner_id" })
    .select("token, template_id, show_dates").single();
  if (error) throw error;
  return data;
}

// Press photos, logo and the main photo are public: they're for flyers.
export async function uploadKitImage(userId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/djkit/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("profile-photos").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
}

export async function fetchPublicKit(token) {
  const { data, error } = await supabase.rpc("get_dj_press_kit", { p_token: token });
  if (error) throw error;
  return data || null;
}
