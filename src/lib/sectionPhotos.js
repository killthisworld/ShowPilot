// Each profile on an event has its own picture (job 147). It shows on that
// profile's circle on the event web and in the center of the profile's own
// web, under the profile's title. Where each one lives on the event:
// - Venue: venue_info.photo_url (the venue photo, job 145)
// - Manager: manager_info.photo_url (the manager / artist Contact photo, job 146)
// - Artist: manager_info.artist_photo_url, else the first act's photo
// - Audio / Lighting: engineer_info.audio.photo_url / engineer_info.lighting.photo_url,
//   else the profile photo of the tech on the event (gig.tech_photos, from
//   get_shared_gig: the owner if they're a tech, else whoever accepted the
//   Audio / Lighting invite; supabase/tech_profile_photo_migration.sql)
const ENGINEER_KEY = { engineer: "audio", lighting: "lighting" };

export function sectionPhoto(role, gig) {
  if (!gig) return "";
  if (role === "venue") return gig.venue_info?.photo_url || "";
  if (role === "manager") return gig.manager_info?.photo_url || "";
  if (role === "band") return gig.manager_info?.artist_photo_url || (gig.bands || []).find((b) => b.photo_url)?.photo_url || "";
  if (ENGINEER_KEY[role]) {
    const k = ENGINEER_KEY[role];
    return gig.engineer_info?.[k]?.photo_url || gig.tech_photos?.[k] || "";
  }
  return "";
}

// The section's own picture only (no fallback to an act photo), for editing.
export function ownSectionPhoto(role, gig) {
  if (role === "band") return gig?.manager_info?.artist_photo_url || "";
  if (ENGINEER_KEY[role]) return gig?.engineer_info?.[ENGINEER_KEY[role]]?.photo_url || "";
  return sectionPhoto(role, gig);
}

// The update_gig_section call that saves `url` (or "" to remove) for a role,
// built on the event as the profile page has it: [section, updates, localPatch]
// where localPatch is { field, value } for the page's own copy.
export function sectionPhotoSave(role, gig, url, engineerSection = "engineer") {
  if (role === "venue") {
    const venue_info = { ...(gig.venue_info || {}), photo_url: url };
    return ["venue", { venue_info }, { field: "venue_info", value: venue_info }];
  }
  if (role === "manager" || role === "band") {
    const manager_info = { ...(gig.manager_info || {}), [role === "band" ? "artist_photo_url" : "photo_url"]: url };
    return ["manager", manager_info, { field: "manager_info", value: manager_info }];
  }
  const k = ENGINEER_KEY[role];
  const ei = gig.engineer_info || {};
  const engineer_info = { ...ei, [k]: { ...(ei[k] || {}), photo_url: url } };
  return [engineerSection, engineer_info, { field: "engineer_info", value: engineer_info }];
}
