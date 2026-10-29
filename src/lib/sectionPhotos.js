// Each profile on an event has its own picture (job 147). It shows on that
// profile's circle on the event web and in the center of the profile's own
// web, under the profile's title. Where each one lives on the event:
// - Venue: venue_info.photo_url (the venue photo, job 145), else the profile
//   photo of the venue on the event
// - Manager: manager_info.photo_url (the manager / artist Contact photo, job 146),
//   else the manager's profile photo
// - Artist: manager_info.artist_photo_url, else the first act's photo, else the
//   artist's profile photo
// - Audio / Lighting: engineer_info.audio.photo_url / engineer_info.lighting.photo_url,
//   else the profile photo of the tech on the event
// Profile photos come from gig.tech_photos ({ audio, lighting, venue, manager,
// band }, from get_shared_gig: the owner if their account is that profile, else
// whoever accepted that profile's invite; supabase/tech_profile_photo_migration.sql
// and circle_profile_photos_migration.sql, jobs 74 and 187). So nobody has to
// upload a circle picture: only the event's own picture is uploaded.
const ENGINEER_KEY = { engineer: "audio", lighting: "lighting" };

// `profile: false` leaves out the profile-photo fallback (the event banner
// uses that: its picture is the event's own, not a person's profile photo).
export function sectionPhoto(role, gig, { profile = true } = {}) {
  if (!gig) return "";
  const tp = profile ? gig.tech_photos || {} : {};
  if (role === "venue") return gig.venue_info?.photo_url || tp.venue || "";
  if (role === "manager") return gig.manager_info?.photo_url || tp.manager || "";
  if (role === "band") return gig.manager_info?.artist_photo_url || (gig.bands || []).find((b) => b.photo_url)?.photo_url || tp.band || "";
  if (ENGINEER_KEY[role]) {
    const k = ENGINEER_KEY[role];
    return gig.engineer_info?.[k]?.photo_url || tp[k] || "";
  }
  return "";
}

// The section's own picture only (no fallback to an act photo), for editing.
export function ownSectionPhoto(role, gig) {
  if (role === "band") return gig?.manager_info?.artist_photo_url || "";
  if (ENGINEER_KEY[role]) return gig?.engineer_info?.[ENGINEER_KEY[role]]?.photo_url || "";
  return sectionPhoto(role, gig, { profile: false });
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
