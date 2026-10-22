// Saved venue / artist templates (My Templates, table saved_templates) use the
// same fields as a show's Venue Info and Performer sections, so a template
// can fill a show and a show's info can become a template one-to-one. These
// helpers are the single mapping both ways.

// Venue template data keys (the venue's name is the template's name).
export const VENUE_TEMPLATE_KEYS = [
  "city", "state", "contacts", "venue_checklist", "wifi_network", "wifi_password", "console", "power_notes",
  "venue_photo_url",
];

export const emptyVenueTemplate = () => ({
  city: "", state: "", contacts: [], venue_checklist: {}, wifi_network: "", wifi_password: "", console: "", power_notes: "",
  venue_photo_url: "",
});

export const emptyArtistTemplate = () => ({
  set_length_minutes: null, genre_tags: [], genre_tag: "", genre_color: "",
  band_members: [], stage_plot_url: "", stage_plot_files: [], general_notes: "", artist_fx_notes: [],
  photo_url: "",
});

// Older artist templates kept each member's notes on the member
// (band_members[i].notes). A show keeps them in artist_fx_notes by name.
export function normalizeArtistTemplate(data = {}) {
  const members = Array.isArray(data.band_members) ? data.band_members : [];
  const fx = Array.isArray(data.artist_fx_notes) ? [...data.artist_fx_notes] : [];
  members.forEach((m) => {
    if (m?.notes && m?.name && !fx.some((n) => n.artist_name === m.name)) fx.push({ artist_name: m.name, notes: m.notes });
  });
  const genres = Array.isArray(data.genre_tags) ? data.genre_tags : (data.genre_tag ? [data.genre_tag] : []);
  return {
    ...emptyArtistTemplate(),
    ...data,
    genre_tags: genres,
    genre_tag: genres[0] || "",
    band_members: members.map(({ notes, ...m }) => m),
    artist_fx_notes: fx,
  };
}

export function normalizeVenueTemplate(data = {}) {
  return { ...emptyVenueTemplate(), ...data };
}

// Show fields a venue template fills. Only what the template actually has:
// an empty field (or one an older template never had, like contacts) leaves
// the show's own value alone. Checklist items merge item by item.
const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : v !== undefined && v !== null && v !== "");
export function venueFromTemplate(name, data = {}, current = {}) {
  const out = { venue: name };
  VENUE_TEMPLATE_KEYS.forEach((k) => {
    if (!hasValue(data[k])) return;
    out[k] = k === "venue_checklist" ? { ...(current.venue_checklist || {}), ...data[k] } : data[k];
  });
  return out;
}

// Act fields an artist template fills (lineup role / order stay as they are).
export function artistFromTemplate(name, data = {}) {
  const d = normalizeArtistTemplate(data);
  return {
    band_name: name,
    set_length_minutes: d.set_length_minutes ?? null,
    genre_tags: d.genre_tags,
    genre_tag: d.genre_tag,
    genre_color: d.genre_color || "",
    band_members: d.band_members,
    stage_plot_url: d.stage_plot_url || "",
    stage_plot_files: d.stage_plot_files || [],
    general_notes: d.general_notes || "",
    artist_fx_notes: d.artist_fx_notes,
    // The artist's photo, only when the template has one (keeps the act's own otherwise).
    ...(d.photo_url ? { photo_url: d.photo_url } : {}),
  };
}
