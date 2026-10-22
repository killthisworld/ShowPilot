// Templates for the company sections of an event (venue, manager /
// artist). A template is the reusable part of that
// section: the same fields the event workspace edits (RoleWorkspace), minus
// anything that only makes sense for one night (dates, sales, holds,
// contract stage, deposits, set times, hotel). Stored in saved_templates
// with category = the section's role.
//
// data shape: { section: {...section JSON...}, gig: {...event-level fields...} }
// Venue templates also keep the tech fields (city, state, wifi_network,
// wifi_password, console, power_notes) at the top level, so the same venue
// template loads on an engineer's show (showTemplates.js) and in the venue
// workspace.

export const COMPANY_TEMPLATE_ROLES = ["venue", "manager"];

// Which workspace tabs a template shows / carries.
export const TEMPLATE_TABS = {
  venue: ["address", "load_in", "schedule", "wifi_power", "house_gear", "hospitality", "documents"],
  manager: ["contact", "advance", "travel", "guests", "merch", "documents"],
};

// Where each role keeps its data on the event.
export const SECTION_KEY = {
  venue: "venue_info",
  manager: "manager_info",
};

// Event-level fields that belong to a role.
const GIG_KEYS = {
  venue: ["venue", "city", "state", "wifi_network", "wifi_password", "console", "power_notes", "venue_documents"],
  manager: [],
};

// One-night fields that never go into a template.
const EVENT_ONLY = {
  venue: [],
  manager: ["set_times", "arrival_time", "hotel"],
};

const VENUE_TECH_KEYS = ["city", "state", "wifi_network", "wifi_password", "console", "power_notes"];

const isEmpty = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

const newId = () => Math.random().toString(36).slice(2, 9);

// Strip per-night state out of list rows (tickets sold, checklist ticks).
function cleanSection(role, section) {
  const out = {};
  for (const [k, v] of Object.entries(section || {})) {
    if ((EVENT_ONLY[role] || []).includes(k)) continue;
    out[k] = v;
  }
  if (role === "manager" && Array.isArray(out.checklist)) out.checklist = out.checklist.map((c) => ({ ...c, done: false }));
  return out;
}

// Event -> template data.
export function templateFromGig(role, gig = {}) {
  const sectionKey = SECTION_KEY[role];
  const g = {};
  for (const k of GIG_KEYS[role] || []) if (!isEmpty(gig[k])) g[k] = gig[k];
  const data = { section: cleanSection(role, gig[sectionKey]), gig: g };
  if (role === "venue") {
    for (const k of VENUE_TECH_KEYS) if (!isEmpty(gig[k])) data[k] = gig[k];
    // The venue photo lives in venue_info.photo_url; engineer templates read it top-level.
    // Always written (empty when removed) so an old copy can't come back.
    data.venue_photo_url = data.section?.photo_url || "";
  }
  return data;
}

// Template data -> a gig-shaped object for editing the template in the
// workspace. Older / engineer venue templates only have the top-level
// tech fields, so those fill in too.
export function gigFromTemplate(role, name, data = {}) {
  const sectionKey = SECTION_KEY[role];
  const gig = { ...(data.gig || {}), [sectionKey]: { ...(data.section || {}) } };
  if (role === "venue") {
    for (const k of VENUE_TECH_KEYS) if (isEmpty(gig[k]) && !isEmpty(data[k])) gig[k] = data[k];
    if (isEmpty(gig.venue) && name) gig.venue = name;
    if (isEmpty(gig[sectionKey].photo_url) && !isEmpty(data.venue_photo_url)) gig[sectionKey].photo_url = data.venue_photo_url;
  }
  return gig;
}

// Default template name from what's filled in.
export function suggestTemplateName(role, gig = {}) {
  const s = gig[SECTION_KEY[role]] || {};
  if (role === "venue") return gig.venue || "";
  if (role === "manager") return gig.band_name || s.contact_name || "";
  return "";
}

// One-line summary for template lists and pickers.
export function templateSubtitle(role, data = {}) {
  const s = data.section || {};
  const g = data.gig || {};
  const parts = {
    venue: [[g.city || data.city, g.state || data.state].filter(Boolean).join(", "), s.capacity && `cap ${s.capacity}`, (g.console || data.console)],
    manager: [s.contact_name, Array.isArray(s.checklist) && s.checklist.length ? `${s.checklist.length}-item advance` : null, s.merch_split && `merch ${s.merch_split}`],
  }[role] || [];
  return parts.filter(Boolean).join(" · ");
}

const mergeDocs = (existing = [], incoming = []) => [
  ...(existing || []),
  ...(incoming || []).filter((d) => !(existing || []).some((e) => e.url === d.url)),
];

// Fill an event from a template. Filled-in template values win, empty ones
// leave the event alone; documents are added, not replaced. List rows get
// fresh ids so editing one event never touches another. Calls p.update so
// nothing is saved until the person presses Save.
export function applyTemplate(role, data = {}, gig, update) {
  const sectionKey = SECTION_KEY[role];
  const tpl = gigFromTemplate(role, "", data);
  for (const k of GIG_KEYS[role] || []) {
    const v = tpl[k];
    if (isEmpty(v)) continue;
    update(k, k.endsWith("_documents") ? mergeDocs(gig[k], v) : v);
  }
  const cur = gig[sectionKey] || {};
  const next = { ...cur };
  for (const [k, v] of Object.entries(tpl[sectionKey] || {})) {
    if (isEmpty(v)) continue;
    if (k === "documents") next[k] = mergeDocs(cur[k], v);
    else if (Array.isArray(v)) next[k] = v.map((row) => (row && typeof row === "object" ? { ...row, id: newId() } : row));
    else next[k] = v;
  }
  update(sectionKey, next);
}

// The signed-in artist's own profile for the performer intake forms: the
// most recently saved Artist template in My Templates, else the older
// single artist template (user_preferences.band_template).
export async function fetchMyArtistProfile(supabase, userId) {
  const { data: rows } = await supabase
    .from("saved_templates")
    .select("name, data, updated_at")
    .eq("owner_id", userId)
    .eq("category", "artist")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const row = rows?.[0];
  if (row) return { ...(row.data || {}), band_name: row.data?.band_name || row.name };
  const { data } = await supabase.from("user_preferences").select("band_template").eq("user_id", userId).maybeSingle();
  return data?.band_template || null;
}
