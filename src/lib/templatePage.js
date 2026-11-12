// A company profile's one template, as a page they make their own (job 297).
// Kept inside the template's data as data.page:
//   look:   { cover_url, logo_url, color, title: a FONTS id }  (header and layout: no longer offered, job 299)
//   order:  section keys (built-in parts and custom section ids) in the order they show
//   names:  { key: "Their name for it" }
//   loads:  { key: "fill" | "ask" }  what happens on every new event
//           (left out = data.exclude, the same list the template already uses)
//   custom: [{ id, name, fields: [field] }]       sections of their own
//   extra:  { partKey: [field] }                  their own fields on a built-in section
//   hidden: { partKey: [fieldKey] }               built-in fields that don't load
// field: { id, label, kind: text|number|yesno|time|checklist|file|link, value }
//
// On an event, the section JSON (venue_info / manager_info) gets
//   layout: { order, names }  so the event's pages follow theirs,
//   custom_sections: [{ id, name, part?, fields }]  their own fields and sections.
import { VENUE_PARTS, SECTION_KEY, templateExclude, applyTemplate, MANAGER_PART_FIELDS, managerPartOf, eventExtras } from "@/lib/roleTemplates";
export { MANAGER_PART_FIELDS, managerPartOf };

export const MANAGER_PARTS = [
  { key: "contact", label: "Contact" },
  { key: "advance", label: "Advance checklist" },
  { key: "travel", label: "Travel" },
  { key: "guests", label: "Guest list" },
  { key: "merch", label: "Merch" },
  { key: "documents", label: "Documents" },
];
// Which manager_info fields belong to which section (job 297), so a section
// left out of the template stays off events too.

// Venue sections that only set things up (they never fill an event's pages
// by themselves): they're loaded from the Load template sheet.
const VENUE_ASK_DEFAULT = new Set(["deal", "event_link", "link_email", "task_presets", "advance"]);
// Kept in the template only (the event chat reads saved replies from it).
const TEMPLATE_ONLY = new Set(["replies"]);

export const FIELD_KINDS = [
  { kind: "text", label: "Text" },
  { kind: "number", label: "Number" },
  { kind: "yesno", label: "Yes / no" },
  { kind: "time", label: "Time" },
  { kind: "checklist", label: "Checklist" },
  { kind: "file", label: "Photo or file" },
  { kind: "link", label: "Link" },
];
export const kindLabel = (k) => FIELD_KINDS.find((f) => f.kind === k)?.label || "Text";

// Title fonts for the page and the package (job 299). The first three ship
// with the app; the rest load from Google Fonts the first time they're shown.
export const FONTS = [
  { id: "bold", label: "Bold", family: "'Barlow Condensed', sans-serif", weight: 700 },
  { id: "classic", label: "Classic", family: "Georgia, 'Times New Roman', serif", weight: 600 },
  { id: "clean", label: "Clean", family: "Inter, system-ui, sans-serif", weight: 700, spacing: "-0.01em" },
  { id: "poster", label: "Poster", gf: "Bebas+Neue", family: "'Bebas Neue', sans-serif", weight: 400, spacing: "0.02em" },
  { id: "groovy", label: "Groovy", gf: "Shrikhand", family: "'Shrikhand', serif", weight: 400 },
  { id: "elegant", label: "Elegant", gf: "Playfair+Display:wght@700", family: "'Playfair Display', serif", weight: 700 },
  { id: "slab", label: "Slab", gf: "Roboto+Slab:wght@700", family: "'Roboto Slab', serif", weight: 700 },
  { id: "retro", label: "Retro", gf: "Righteous", family: "'Righteous', sans-serif", weight: 400 },
  { id: "script", label: "Script", gf: "Pacifico", family: "'Pacifico', cursive", weight: 400 },
  { id: "western", label: "Western", gf: "Rye", family: "'Rye', serif", weight: 400 },
  { id: "typewriter", label: "Typewriter", gf: "Special+Elite", family: "'Special Elite', monospace", weight: 400 },
  { id: "marker", label: "Marker", gf: "Permanent+Marker", family: "'Permanent Marker', cursive", weight: 400 },
  { id: "rounded", label: "Rounded", gf: "Nunito:wght@800", family: "'Nunito', sans-serif", weight: 800 },
  { id: "gothic", label: "Gothic", gf: "UnifrakturMaguntia", family: "'UnifrakturMaguntia', serif", weight: 400 },
  { id: "mono", label: "Mono", gf: "Space+Mono:wght@700", family: "'Space Mono', monospace", weight: 700 },
];
const loadedFonts = new Set();
export function loadFont(id) {
  const f = FONTS.find((x) => x.id === id);
  if (!f?.gf || loadedFonts.has(f.id) || typeof document === "undefined") return;
  loadedFonts.add(f.id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=swap`;
  document.head.appendChild(link);
}
// The style for a title in this font (loads it if it needs to).
export function titleFont(id) {
  const f = FONTS.find((x) => x.id === id) || FONTS[0];
  loadFont(f.id);
  return { fontFamily: f.family, fontWeight: f.weight, ...(f.spacing ? { letterSpacing: f.spacing } : {}) };
}

export const COLORS = [
  { hex: "#60A5FA", label: "Blue" }, { hex: "#F5B342", label: "Amber" }, { hex: "#E879F9", label: "Violet" },
  { hex: "#34D399", label: "Teal" }, { hex: "#F1F1F1", label: "White" }, { hex: "#FB7185", label: "Rose" },
];

export const newId = () => Math.random().toString(36).slice(2, 10);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export const roleOfAccount = (type) => (type === "venue" ? "venue" : "manager");
export const builtInParts = (role) => (role === "venue" ? VENUE_PARTS : MANAGER_PARTS);

export function pageOf(data = {}) {
  const p = obj(data.page);
  const look = obj(p.look);
  return {
    look: {
      cover_url: look.cover_url || "", logo_url: look.logo_url || "", color: look.color || "",
      // The header is always the cover photo now (job 299 took the choice away).
      header: "photo",
      layout: look.layout === "list" ? "list" : "cards",
      title: FONTS.some((f) => f.id === look.title) ? look.title : "bold",
    },
    order: arr(p.order), names: obj(p.names), loads: obj(p.loads),
    custom: arr(p.custom), extra: obj(p.extra), hidden: obj(p.hidden),
  };
}

export const fieldFilled = (f) => {
  const v = f?.value;
  if (f?.kind === "yesno") return v === true || v === false;
  if (f?.kind === "checklist") return arr(v).some((i) => String(i?.text || "").trim());
  if (f?.kind === "file") return !!(v && v.url);
  return v !== undefined && v !== null && String(v).trim() !== "";
};
export const fieldText = (f) => {
  const v = f?.value;
  if (f?.kind === "yesno") return v === true ? "Yes" : v === false ? "No" : "";
  if (f?.kind === "checklist") return arr(v).map((i) => i?.text).filter(Boolean).join(", ");
  if (f?.kind === "file") return v?.name || (v?.url ? "File" : "");
  return v == null ? "" : String(v);
};

// How a section behaves on a new event.
export function modeOf(role, data, key) {
  if (templateExclude(data).includes(key)) return "off";
  if (TEMPLATE_ONLY.has(key)) return "kept";
  const set = pageOf(data).loads[key];
  if (set === "fill" || set === "ask") return set;
  return role === "venue" && VENUE_ASK_DEFAULT.has(key) ? "ask" : "fill";
}

// Every section of the template, in their order, with their names.
export function sectionList(role, data = {}, summaries = {}) {
  const page = pageOf(data);
  const built = builtInParts(role).map((p) => ({ key: p.key, label: page.names[p.key] || p.label, base: p.label, builtIn: true }));
  const custom = page.custom.map((c) => ({ key: c.id, label: c.name || "Untitled section", base: "", builtIn: false, fields: arr(c.fields) }));
  const all = [...built, ...custom];
  const pos = (k) => { const i = page.order.indexOf(k); return i === -1 ? 1000 + all.findIndex((s) => s.key === k) : i; };
  return all
    .sort((a, b) => pos(a.key) - pos(b.key))
    .map((s) => {
      const extra = s.builtIn ? arr(page.extra[s.key]) : [];
      const fields = s.builtIn ? extra : s.fields;
      const own = fields.filter(fieldFilled);
      const sum = s.builtIn ? summaries[s.key] || "" : "";
      const sub = [sum, ...own.slice(0, 2).map((f) => `${f.label}: ${fieldText(f)}`)].filter(Boolean).join(" · ");
      return { ...s, extra, mode: modeOf(role, data, s.key), sub, filled: !!sum || own.length > 0 };
    });
}

// ---- writing the page back into the template's data ----
export const withPage = (data, patch) => ({ ...data, page: { ...obj(data.page), ...patch } });
export function setMode(role, data, key, mode) {
  const ex = new Set(templateExclude(data));
  if (mode === "off") ex.add(key); else ex.delete(key);
  const page = pageOf(data);
  const loads = { ...page.loads };
  if (mode === "fill" || mode === "ask") loads[key] = mode;
  return withPage({ ...data, exclude: [...ex] }, { loads });
}

// ---- onto events ----
// eventExtras lives with applyTemplate (roleTemplates.js), which carries it.
export { eventExtras };

// Built-in fields hidden from loading (job 297).
export const hiddenFields = (data = {}) => new Set(Object.values(pageOf(data).hidden).flat());

// A new event gets the "fill it in" sections of its owner's own template.
// Called right after the event is made (the new-event page). Never throws:
// the event is made either way.
export async function autoFillNewEvent(supabase, userId, accountType, show) {
  try {
    if (!["venue", "manager", "band"].includes(accountType) || !show?.id) return;
    const role = roleOfAccount(accountType);
    const { data: rows } = await supabase.from("saved_templates").select("name, data").eq("owner_id", userId).eq("category", role).order("updated_at", { ascending: false }).limit(1);
    const tpl = rows?.[0];
    if (!tpl) return;
    const data = tpl.data || {};
    const fill = new Set(builtInParts(role).map((p) => p.key).filter((k) => modeOf(role, data, k) === "fill"));
    for (const c of pageOf(data).custom) if (modeOf(role, data, c.id) === "fill") fill.add(c.id);
    if (!fill.size) return;
    const patch = {};
    const update = (k, v) => { patch[k] = v; };
    applyTemplate(role, data, show, update, fill);
    const key = SECTION_KEY[role];
    patch[key] = { ...(show[key] || {}), ...(patch[key] || {}) };
    const look = pageOf(data).look;
    if (!show.icon_url && look.cover_url) patch.icon_url = look.cover_url;
    // Venue name on the event when it has none (the venue's own template).
    if (role === "venue" && !show.venue && patch.venue === undefined && tpl.name) patch.venue = tpl.name;
    const { error } = await supabase.from("shows").update(patch).eq("id", show.id);
    if (error) console.error("auto-fill", error);
  } catch (e) {
    console.error("auto-fill", e);
  }
}
