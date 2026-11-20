// Named templates (job 434). On top of the house template (the venue /
// manager template in My Templates), an account keeps as many named
// templates as it likes, of two kinds:
//   offer  Make an offer (venues): data.offers
//   event  Create event (venues, managers / artists): data.event_webs
// Each item is { id, name, saved_at, data, times? }. They live in the house
// template row (accounts keep one venue / manager template), always written
// here from a fresh read so a stale page can't drop them; My Templates keeps
// them as they are when it saves the house template (keepNamed).
// The single offer template of job 429 (data.offer) shows as "House offer"
// and moves into the list the first time the list is written.
import { supabase } from "@/api/supabaseClient";
import { emptyVenueTemplate } from "@/lib/showTemplates";

export const LIST_KEY = { offer: "offers", event: "event_webs" };
export const KIND_LABEL = { offer: "Offer", event: "Event" };
const NAMED_KEYS = ["offers", "event_webs", "offer"];
const newId = () => Math.random().toString(36).slice(2, 10);
const norm = (s) => String(s || "").trim().toLowerCase();

async function houseRow(userId, category) {
  const { data, error } = await supabase.from("saved_templates")
    .select("id, name, data, updated_at").eq("owner_id", userId).eq("category", category)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  return rows.find((r) => NAMED_KEYS.some((k) => r.data?.[k])) || rows[0] || null;
}

// The named templates of one kind in a template row's data.
export function namedList(rowData, kind) {
  const d = rowData || {};
  const raw = d[LIST_KEY[kind]];
  const list = Array.isArray(raw) ? raw.filter((x) => x && x.id && x.data && typeof x.data === "object") : [];
  if (kind === "offer" && d.offer?.data && !list.some((x) => x.id === "house")) {
    list.unshift({ id: "house", name: "House offer", saved_at: d.offer.saved_at || "", data: d.offer.data, times: d.offer.times || null });
  }
  return list;
}

// { row, items }: the house template row and its named templates of a kind.
export async function loadNamed(userId, category, kind) {
  const row = await houseRow(userId, category);
  return { row, items: namedList(row?.data, kind) };
}

async function writeList(userId, category, kind, change, fallbackName) {
  const row = await houseRow(userId, category);
  const next = change(namedList(row?.data, kind));
  const key = LIST_KEY[kind];
  if (row) {
    const data = { ...(row.data || {}), [key]: next };
    if (kind === "offer") delete data.offer; // now in the list
    const { error } = await supabase.from("saved_templates").update({ data, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw error;
    return next;
  }
  const base = category === "venue" ? emptyVenueTemplate() : { section: {}, gig: {} };
  const { error } = await supabase.from("saved_templates").insert({ owner_id: userId, category, name: String(fallbackName || "").trim() || "My template", data: { ...base, [key]: next } });
  if (error) {
    if (/TEMPLATE_LIMIT/.test(error.message || "")) throw new Error("Your plan's template limit is full, so this can't be saved. Free one up in My Templates, or upgrade.");
    throw error;
  }
  return next;
}

// Save under a name: the same name (any case) updates that template, a new
// name makes a new one. Returns { item, how: "updated" | "created" }.
export async function saveNamed(userId, category, kind, { name, data, times = null }, fallbackName = "") {
  const nm = String(name || "").trim();
  if (!nm) throw new Error("Give the template a name first.");
  let item = null; let how = "created";
  await writeList(userId, category, kind, (list) => {
    const at = list.findIndex((x) => norm(x.name) === norm(nm));
    item = { id: at >= 0 ? list[at].id : newId(), name: nm, saved_at: new Date().toISOString(), data, ...(times ? { times } : {}) };
    if (at >= 0) { how = "updated"; return list.map((x, i) => (i === at ? item : x)); }
    return [...list, item];
  }, fallbackName);
  return { item, how };
}

export async function renameNamed(userId, category, kind, id, name) {
  const nm = String(name || "").trim();
  if (!nm) throw new Error("Give it a name.");
  return writeList(userId, category, kind, (list) => list.map((x) => (x.id === id ? { ...x, name: nm } : x)));
}

export async function removeNamed(userId, category, kind, id) {
  return writeList(userId, category, kind, (list) => list.filter((x) => x.id !== id));
}

// When My Templates saves the house template, keep the named templates as
// they are in the database now (they're only changed here).
export async function keepNamed(rowId, data) {
  if (!rowId) return data;
  const { data: fresh } = await supabase.from("saved_templates").select("data").eq("id", rowId).maybeSingle();
  const out = { ...(data || {}) };
  NAMED_KEYS.forEach((k) => { if (fresh?.data && fresh.data[k] !== undefined) out[k] = fresh.data[k]; else delete out[k]; });
  return out;
}

export const savedOn = (iso) => {
  try { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""; } catch { return ""; }
};
