import { supabase } from "@/api/supabaseClient";

// Personal event icons: anyone linked to a gig can give it their own image,
// which only they see (the owner's shared icon is the fallback). Stored in
// gig_user_icons, one row per (user, show). Every call is best-effort - if
// the table is missing or the read fails, lists simply fall back to the
// shared icon.
export async function fetchMyIcons() {
  try {
    const { data, error } = await supabase.from("gig_user_icons").select("show_id, icon_url");
    if (error || !data) return {};
    const map = {};
    data.forEach((r) => { if (r.icon_url) map[r.show_id] = r.icon_url; });
    return map;
  } catch {
    return {};
  }
}

export async function uploadIconImage(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const filePath = `${user.id}/event-icons/${Date.now()}.${ext || "png"}`;
  const { error } = await supabase.storage.from("profile-photos").upload(filePath, file);
  if (error) throw error;
  return supabase.storage.from("profile-photos").getPublicUrl(filePath).data.publicUrl;
}

export async function saveMyIcon(showId, url) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  if (!url) {
    const { error } = await supabase.from("gig_user_icons").delete().eq("user_id", user.id).eq("show_id", showId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("gig_user_icons")
    .upsert({ user_id: user.id, show_id: showId, icon_url: url, updated_at: new Date().toISOString() }, { onConflict: "user_id,show_id" });
  if (error) throw error;
}
