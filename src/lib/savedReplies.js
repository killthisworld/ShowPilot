// Saved replies (job 185): answers a venue gives every act, kept in its venue
// templates (saved_templates.data.section.saved_replies). The event chat's
// Saved replies button lists them, filled in for that event.
import { supabase } from "@/api/supabaseClient";
import { templateExclude } from "@/lib/roleTemplates";

export const REPLY_FIELDS = [
  { key: "act", label: "Act" },
  { key: "event", label: "Event" },
  { key: "date", label: "Date" },
  { key: "venue", label: "Venue" },
  { key: "address", label: "Address" },
  { key: "load_in", label: "Load-in time" },
  { key: "doors", label: "Doors" },
  { key: "curfew", label: "Curfew" },
  { key: "parking", label: "Parking" },
];

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const fmtDay = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "");
const timeOf = (schedule, re) => (schedule || []).find((r) => re.test(r.label || ""))?.time || "";

// The fill-in values for one event (gig as get_shared_gig returns it).
export function replyValues(gig) {
  if (!gig) return {};
  const vi = gig.venue_info || {};
  const acts = (gig.bands || []).map((b) => b.band_name).filter(has);
  return {
    act: acts[0] || gig.band_name || "",
    event: gig.event_name || gig.band_name || "",
    date: fmtDay(gig.date),
    venue: gig.venue || "",
    address: [vi.address, [gig.city, gig.state].filter(has).join(", ")].filter(has).join(", "),
    load_in: timeOf(vi.schedule, /load[\s-]?in/i),
    doors: timeOf(vi.schedule, /doors?/i),
    curfew: timeOf(vi.schedule, /curfew/i),
    parking: vi.parking || "",
  };
}
// Anything with no value stays as {field} so the venue sees what to type in.
export function fillReply(body, vals = {}) {
  return String(body || "").replace(/\{([a-z_]+)\}/g, (m, k) => (has(vals[k]) ? vals[k] : m));
}

// The signed-in person's saved replies across their venue templates.
export async function fetchMySavedReplies(userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from("saved_templates").select("name, data").eq("owner_id", userId).eq("category", "venue");
  if (error) { console.error(error); return []; }
  const out = [];
  const seen = new Set();
  (data || []).forEach((t) => {
    if (templateExclude(t.data).includes("replies")) return;
    (t.data?.section?.saved_replies || []).forEach((r) => {
      const title = String(r?.title || "").trim();
      const body = String(r?.body || "").trim();
      if (!body) return;
      const k = `${title}\n${body}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ id: r.id || k, title: title || body.slice(0, 40), body, template: t.name });
    });
  });
  return out;
}
