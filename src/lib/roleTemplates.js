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
  venue: ["address", "load_in", "schedule", "wifi_power", "house_gear", "hospitality", "deal", "event_link", "link_email", "replies", "task_presets", "documents"],
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

// The parts of a venue template (job 185). The venue ticks which parts a
// template carries (data.exclude lists the ones left out; older templates
// have none, so everything is in), and ticks again which to load on each
// event. Each part owns these event fields; a field no part owns always
// loads, as before.
export const VENUE_PARTS = [
  { key: "address", label: "Venue & address" },
  { key: "load_in", label: "Load-in & parking" },
  { key: "schedule", label: "Schedule & curfew" },
  { key: "wifi_power", label: "Wi-Fi & power" },
  { key: "house_gear", label: "House gear" },
  { key: "hospitality", label: "Hospitality" },
  { key: "deal", label: "Deal terms" },
  { key: "event_link", label: "Event link setup" },
  { key: "link_email", label: "Event link email" },
  { key: "replies", label: "Saved replies" },
  { key: "task_presets", label: "Task presets" },
  { key: "documents", label: "Documents" },
];
const VENUE_PART_FIELDS = {
  address: { gig: ["venue", "city", "state"], section: ["address", "capacity", "age_policy", "photo_url"] },
  load_in: { section: ["load_in_location", "parking", "load_in_notes"] },
  schedule: { section: ["schedule", "hard_curfew", "load_out_by"] },
  wifi_power: { gig: ["wifi_network", "wifi_password", "power_notes"] },
  house_gear: { gig: ["console"], section: ["pa", "backline", "mics_monitors"] },
  hospitality: { section: ["green_room", "meals", "drink_tickets", "hospitality_notes"] },
  // The deal is private, so it never goes into the event's venue_info: the
  // template keeps it in section.tpl_deal and loading saves it as the
  // event's draft deal (RoleWorkspace).
  deal: { section: ["tpl_deal"] },
  event_link: { section: ["event_link_setup"] },
  link_email: { section: ["event_link_email"] },
  // Saved replies stay in the template (the event chat reads them from your
  // templates); task presets become the event's tasks when loaded.
  replies: { section: ["saved_replies"] },
  task_presets: { section: ["task_presets"] },
  documents: { gig: ["venue_documents"], section: ["documents"] },
};
export function venuePartOf(where, key) {
  for (const [part, f] of Object.entries(VENUE_PART_FIELDS)) if ((f[where] || []).includes(key)) return part;
  return null;
}
export const templateExclude = (data = {}) => (Array.isArray(data.exclude) ? data.exclude : []);
// Parts in this template that have something filled in (for the load sheet).
export function venuePartsWithContent(data = {}) {
  const ex = new Set(templateExclude(data));
  const s = data.section || {};
  const g = { ...(data.gig || {}) };
  for (const k of VENUE_TECH_KEYS) if (isEmpty(g[k]) && !isEmpty(data[k])) g[k] = data[k];
  return VENUE_PARTS.filter((pt) => {
    if (ex.has(pt.key) || pt.key === "replies") return false;
    const f = VENUE_PART_FIELDS[pt.key];
    return (f.gig || []).some((k) => !isEmpty(g[k])) || (f.section || []).some((k) => !isEmpty(s[k]));
  });
}
// Does the event already have something in this part?
export function venuePartOnEvent(gig = {}, part) {
  const f = VENUE_PART_FIELDS[part];
  if (!f) return false;
  const vi = gig.venue_info || {};
  return (f.gig || []).some((k) => !isEmpty(gig[k])) || (f.section || []).some((k) => !isEmpty(vi[k]));
}

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
    // Ticks marked done on one event never go into a template.
    delete data.section.done_pages;
    data.exclude = Array.isArray(gig.template_exclude) ? gig.template_exclude : [];
    const ex = new Set(data.exclude);
    // Engineers read these top-level; a part left out stays out for them too.
    for (const k of VENUE_TECH_KEYS) if (!isEmpty(gig[k]) && !ex.has(venuePartOf("gig", k))) data[k] = gig[k];
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
    gig.template_exclude = templateExclude(data);
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
// Venue (job 185): `parts` is the set of parts to load (default: every part
// the template includes); fields of other parts are left alone.
export function applyTemplate(role, data = {}, gig, update, parts = null) {
  const sectionKey = SECTION_KEY[role];
  const tpl = gigFromTemplate(role, "", data);
  const ex = new Set(templateExclude(data));
  const wanted = (where, k) => {
    if (role !== "venue") return true;
    // Saved as the event's deal / tasks instead, or only used from the template.
    if (where === "section" && (k === "tpl_deal" || k === "task_presets" || k === "saved_replies")) return false;
    const part = venuePartOf(where, k);
    if (!part) return true;
    return parts ? parts.has(part) : !ex.has(part);
  };
  for (const k of GIG_KEYS[role] || []) {
    const v = tpl[k];
    if (isEmpty(v) || !wanted("gig", k)) continue;
    update(k, k.endsWith("_documents") ? mergeDocs(gig[k], v) : v);
  }
  const cur = gig[sectionKey] || {};
  const next = { ...cur };
  for (const [k, v] of Object.entries(tpl[sectionKey] || {})) {
    if (isEmpty(v) || !wanted("section", k)) continue;
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
