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
import React from "react";
import { supabase } from "@/api/supabaseClient";
import { emptyArtistTemplate, normalizeArtistTemplate } from "@/lib/showTemplates";
import { shrinkImage, uploadDirect } from "@/lib/directUpload";

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

const LINK_COLS = "*";

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
  // All columns, so this still works before the round-2 switches exist.
  const { data: link } = await supabase.from("dj_press_kits").select("*").eq("owner_id", user.id).maybeSingle();
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
    .select(LINK_COLS).single();
  if (error) {
    if (/dj_press_kits/.test(error.message || "")) throw new Error("Sharing needs a database update first. Try again soon.");
    throw error;
  }
  return data;
}

// The press kit's switches (job 459): show_dates, show_history, take_requests.
export async function setKitFlags(userId, templateId, flags) {
  const { data, error } = await supabase
    .from("dj_press_kits")
    .upsert({ owner_id: userId, template_id: templateId, ...flags }, { onConflict: "owner_id" })
    .select(LINK_COLS).single();
  if (error) throw error;
  return data;
}

// What Show Pilot knows about the DJ's nights (job 459): upcoming dates,
// booked days, holds and the "Played at" history. Empty until the round-2
// database update is in.
export async function fetchMyExtras(name = "") {
  const { data, error } = await supabase.rpc("get_my_dj_kit_extras", { p_name: name });
  if (error) { console.error(error); return { dates: [], booked: [], holds: [], history: [] }; }
  return data || { dates: [], booked: [], holds: [], history: [] };
}

// A promoter asking for a night, from the press kit. Throws the database's
// own readable message (booked night, too many requests...).
export async function requestDate(token, r) {
  const { data, error } = await supabase.rpc("request_dj_date", {
    p_token: token, p_date: r.date, p_name: r.name, p_email: r.email || "", p_phone: r.phone || "",
    p_event_name: r.event_name || "", p_venue: r.venue || "", p_city: r.city || "", p_set_time: r.set_time || "",
    p_message: r.message || "",
  });
  if (error) throw new Error(error.message || "Couldn't send it. Try again.");
  return data;
}

// The DJ's date requests (Bookings): new and on hold, soonest first.
export async function listRequests() {
  const { data, error } = await supabase.from("dj_date_requests").select("*").in("status", ["new", "hold"]).order("date");
  if (error) { console.error(error); return []; }
  return (data || []).filter((r) => r.date >= todayIso());
}

export async function setRequestStatus(id, status) {
  const { error } = await supabase.from("dj_date_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  window.dispatchEvent(new Event("dj-requests-changed"));
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Press photos, logo, banner and the profile pic are public: they're for
// flyers. Shrunk on the phone first, then uploaded with progress (job 462).
export async function uploadKitImage(userId, file, { onProgress, max = 2400 } = {}) {
  const img = await shrinkImage(file, { max });
  const ext = img.type === "image/png" ? "png" : img.type === "image/jpeg" ? "jpg" : ((file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg");
  const path = `${userId}/djkit/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return uploadDirect("profile-photos", path, img, { contentType: img.type || file.type || undefined, onProgress });
}

export async function fetchPublicKit(token) {
  const { data, error } = await supabase.rpc("get_dj_press_kit", { p_token: token });
  if (error) throw error;
  return data || null;
}

// New date requests, for the Bookings tab's badge in DJ mode (job 459).
// Checked when the app opens and whenever it comes back to the front.
export function useNewRequestCount(enabled = true) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!enabled) return undefined;
    let gone = false;
    const load = async () => {
      const { count, error } = await supabase.from("dj_date_requests").select("id", { count: "exact", head: true }).eq("status", "new").gte("date", todayIso());
      if (!gone && !error) setN(count || 0);
    };
    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("dj-requests-changed", load);
    return () => { gone = true; document.removeEventListener("visibilitychange", onVis); window.removeEventListener("dj-requests-changed", load); };
  }, [enabled]);
  return n;
}

// A track on the press kit's record (jobs 460-462): the DJ picks any audio
// file and 15 seconds of it (DjClipPicker); the phone makes that a small MP3
// and it goes up to the DJ's own folder of the dj-kit-audio bucket.
const AUDIO_EXT = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", wav: "audio/wav", wave: "audio/wav", aif: "audio/aiff", aiff: "audio/aiff", aifc: "audio/aiff", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus", webm: "audio/webm", alac: "audio/mp4", caf: "audio/x-caf", wma: "audio/x-ms-wma", amr: "audio/amr" };
export const TRACK_ACCEPT = ["audio/*", ...Object.keys(AUDIO_EXT).map((e) => `.${e}`)].join(",");
const extOf = (name) => (String(name || "").split(".").pop() || "").toLowerCase();
export const isAudioFile = (f) => (f?.type || "").startsWith("audio/") || !!AUDIO_EXT[extOf(f?.name)];
export async function uploadKitClip(userId, blob, { onProgress } = {}) {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
  const url = await uploadDirect("dj-kit-audio", path, blob, { contentType: "audio/mpeg", onProgress });
  return { url, path };
}

// Tracks taken off the record: delete their files (best effort).
export async function removeKitTracks(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  const { error } = await supabase.storage.from("dj-kit-audio").remove(list);
  if (error) console.error(error);
}

// A track's title from its file name: "02 - Night Drive (Edit).mp3" -> "Night Drive (Edit)".
export const titleFromFile = (name) => String(name || "").replace(/\.[^.]+$/, "").replace(/^\s*\d{1,3}\s*[-_.)]\s*/, "").replace(/[_]+/g, " ").trim() || "Untitled";
