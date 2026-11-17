// New event as a web (job 321): what a manager / artist fills in on
// /event/new, and making the real event from it. No new tables: the event
// row, its acts (show_bands), invite links (gig_invites) and Paperwork
// (business records) all go through what's already there.
//
//   date & times   shows.date, venue_info.schedule (Load-in, Doors),
//                  manager_info.set_times (the first act's stage time)
//   venue          shows.venue / city / state, plus an invite link (venue)
//   acts           show_bands, filled from the act's template in My Templates
//   sound / lights manager_info.crew { sound, lights: "ours" | "venue" },
//                  plus an invite link for a tech they're bringing
//   promo          manager_info.promo [{ format, url, name }] (public images,
//                  like the event picture), manager_info.facebook_event
//   on file        the manager template's parts and the act's stage plot /
//                  photo, each one switchable for this event
//   paperwork      business records (W9 as Other, agreement, insurance, other):
//                  only the event's owner, venue side and manager side see them
//   co-hosts       invite links (manager / band)
import { supabase } from "@/api/supabaseClient";
import { applyTemplate, MANAGER_PART_FIELDS } from "@/lib/roleTemplates";
import { artistFromTemplate } from "@/lib/showTemplates";
import { modeOf } from "@/lib/templatePage";
import { fileRecord } from "@/lib/eventBusiness";

export const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : has(v));
const norm = (s) => String(s || "").trim().toLowerCase();
const uid = () => Math.random().toString(36).slice(2, 10);

// Promo sizes (picked first, then each gets its own upload).
export const PROMO_FORMATS = [
  { id: "sq", label: "Square", ratio: "1:1", r: 1, px: "1080 × 1080" },
  { id: "pt", label: "Portrait", ratio: "4:5", r: 0.8, px: "1080 × 1350" },
  { id: "st", label: "Story", ratio: "9:16", r: 0.5625, px: "1080 × 1920" },
  { id: "wd", label: "Wide", ratio: "16:9", r: 1.778, px: "1920 × 1080" },
  { id: "fb", label: "Event cover", ratio: "1.91:1", r: 1.91, px: "1200 × 628" },
  { id: "pr", label: "Print poster", ratio: "11×17", r: 0.647, px: "11 × 17 in" },
];
export const promoFormat = (id) => PROMO_FORMATS.find((p) => p.id === id);

export const MANAGER_PART_LABELS = {
  advance: "Advance checklist", travel: "Travel", guests: "Guest list", merch: "Merch", documents: "Documents",
};

export const emptyForm = () => ({
  date: "", loadIn: "", doors: "", onStage: "", name: "",
  venue: { name: "", city: "", state: "", pilotId: null, invite: true },
  acts: [], // [{ name }] in billing order, the first is the headliner
  crew: { sound: "venue", lights: "venue", soundPilot: "", lightsPilot: "" },
  promo: { picked: [], files: {}, facebook: "" }, // files: format -> { url, name }
  onFile: {}, // item key -> false when switched off for this event
  paper: { w9: null, agreement: null, coi: null, other: [] }, // File objects, filed on create
  people: [], // [{ id, role: "manager" | "band", label, pilotId }]
});

export const eventName = (f) => {
  if (has(f.name)) return f.name.trim();
  const act = f.acts[0]?.name?.trim();
  const venue = f.venue.name.trim();
  return act && venue ? `${act} at ${venue}` : act || venue || "";
};

// What the signed-in manager / artist brings: their card, their manager
// template, their acts, their Fellow Pilots.
export async function loadSources(userId) {
  const [me, mgr, acts, pilots] = await Promise.all([
    supabase.from("user_preferences").select("display_name, profile_photo_url, card_share_token, account_type, contact_phone, contact_email").eq("user_id", userId).maybeSingle(),
    supabase.from("saved_templates").select("name, data, updated_at").eq("owner_id", userId).eq("category", "manager").order("updated_at", { ascending: false }).limit(1),
    supabase.from("saved_templates").select("name, data").eq("owner_id", userId).eq("category", "artist"),
    supabase.from("fellow_pilots").select("id, pilot_user_id, display_name, job_title, contact_email, contact_phone, profile_photo_url").eq("owner_id", userId).order("display_name", { ascending: true }),
  ]);
  // contact_phone / contact_email may not exist on user_preferences: retry plain.
  let mine = me.data;
  if (me.error) {
    const again = await supabase.from("user_preferences").select("display_name, profile_photo_url, card_share_token, account_type").eq("user_id", userId).maybeSingle();
    mine = again.data;
  }
  return {
    me: mine || {},
    managerTpl: mgr.data?.[0] || null,
    acts: (acts.data || []).filter((t) => has(t.name)).map((t) => ({ name: t.name.trim(), data: t.data || {} })).sort((a, b) => a.name.localeCompare(b.name)),
    pilots: pilots.data || [],
  };
}

export const actTemplate = (sources, name) => sources.acts.find((t) => norm(t.name) === norm(name)) || null;

// The things on file for this event, from their templates: each can be
// switched off. [{ key, label, sub }]
export function onFileItems(sources, f) {
  const items = [];
  const tpls = f.acts.map((a) => actTemplate(sources, a.name)).filter(Boolean);
  const plotActs = tpls.filter((t) => filled(t.data.band_members) || has(t.data.stage_plot_url) || filled(t.data.stage_plot_files));
  if (plotActs.length) items.push({ key: "plot", label: "Stage plot & inputs", sub: plotActs.map((t) => t.name).join(", ") });
  const photoActs = tpls.filter((t) => has(t.data.photo_url));
  if (photoActs.length) items.push({ key: "photo", label: "Artist photo", sub: photoActs.map((t) => t.name).join(", ") });
  const data = sources.managerTpl?.data;
  if (data) {
    const section = data.section || {};
    for (const part of Object.keys(MANAGER_PART_LABELS)) {
      if (modeOf("manager", data, part) === "off") continue;
      if (!(MANAGER_PART_FIELDS[part] || []).some((k) => filled(section[k]))) continue;
      items.push({ key: `m_${part}`, label: MANAGER_PART_LABELS[part], sub: "From My Template" });
    }
  }
  return items;
}

// Promo images are public (they're for posting), kept with the event pictures.
export async function uploadPromo(userId, file, format) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${userId}/promo/${Date.now()}-${format}.${ext}`;
  const { error } = await supabase.storage.from("profile-photos").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { url: supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl, name: file.name };
}

const inviteUrl = (token) => `${window.location.origin}/gig/shared?invite=${token}`;

// Make the event. Returns { show, invites: [{ id, label, role, url, phone, email }], warnings }.
// The event row is made first; acts, the template, invites and paperwork
// follow, and a failure there is a warning, not a lost event.
export async function createEventFromWeb(userId, sources, f) {
  const warnings = [];
  const acts = f.acts.filter((a) => has(a.name)).map((a) => ({ name: a.name.trim() }));
  const first = acts[0] || null;
  const firstTpl = first ? actTemplate(sources, first.name) : null;
  const promo = f.promo.picked.filter((id) => f.promo.files[id]?.url).map((id) => ({ format: id, ...f.promo.files[id] }));
  const square = promo.find((p) => p.format === "sq") || promo[0] || null;
  const photoOn = f.onFile.photo !== false;
  const icon = square?.url || (photoOn ? firstTpl?.data?.photo_url : "") || null;
  const schedule = [["Load-in", f.loadIn], ["Doors", f.doors]].filter(([, t]) => has(t)).map(([label, time]) => ({ id: uid(), label, time }));

  const { data: show, error } = await supabase.from("shows").insert({
    owner_id: userId,
    event_name: eventName(f) || "New event",
    band_name: first?.name || "",
    venue: f.venue.name.trim() || null,
    city: f.venue.city.trim() || null,
    state: f.venue.state.trim() || null,
    date: f.date,
    ...(icon ? { icon_url: icon } : {}),
    included_sections: ["venue", "manager", "engineer"],
    status: "not_started",
    venue_info: schedule.length ? { schedule } : {},
    manager_info: {
      ...(first && has(f.onStage) ? { set_times: { [first.name]: f.onStage } } : {}),
      crew: { sound: f.crew.sound, lights: f.crew.lights },
      ...(promo.length ? { promo } : {}),
      ...(has(f.promo.facebook) ? { facebook_event: f.promo.facebook.trim() } : {}),
    },
  }).select().single();
  if (error) throw error;

  // Their manager template: contact always (it's them, in the middle), the
  // other parts unless switched off here.
  const data = sources.managerTpl?.data;
  if (data) {
    try {
      const parts = new Set(["contact"]);
      for (const part of Object.keys(MANAGER_PART_LABELS)) if (f.onFile[`m_${part}`] !== false && modeOf("manager", data, part) !== "off") parts.add(part);
      const patch = {};
      applyTemplate("manager", data, show, (k, v) => { patch[k] = v; }, parts);
      patch.manager_info = { ...(show.manager_info || {}), ...(patch.manager_info || {}) };
      const { error: e } = await supabase.from("shows").update(patch).eq("id", show.id);
      if (e) throw e;
    } catch (e) { console.error(e); warnings.push("Your template's info didn't all load. Add it from the event's Manager / Artist page."); }
  }

  // The acts, each from its template.
  if (acts.length) {
    const rows = acts.map((a, i) => {
      const t = actTemplate(sources, a.name);
      const row = t ? artistFromTemplate(a.name, t.data) : { band_name: a.name };
      if (f.onFile.plot === false) { row.band_members = []; row.stage_plot_url = ""; row.stage_plot_files = []; }
      if (!photoOn) delete row.photo_url;
      const len = Number(row.set_length_minutes);
      row.set_length_minutes = Number.isFinite(len) && len > 0 ? Math.round(len) : null;
      return { ...row, show_id: show.id, is_headliner: i === 0, sort_order: i, role: i === 0 ? "Headliner" : "Opener" };
    });
    const { error: e } = await supabase.from("show_bands").insert(rows);
    if (e) { console.error(e); warnings.push("The acts didn't save. Add them on the event's lineup."); }
  }

  // Invite links: the venue, a tech they're bringing, co-hosts.
  const pilot = (id) => sources.pilots.find((p) => p.id === id) || null;
  const asks = [];
  if (has(f.venue.name) && f.venue.invite) asks.push({ role: "venue", label: f.venue.name.trim(), p: pilot(f.venue.pilotId) });
  if (f.crew.sound === "ours" && f.crew.soundPilot) { const p = pilot(f.crew.soundPilot); if (p) asks.push({ role: "engineer", label: p.display_name || "Sound", p }); }
  if (f.crew.lights === "ours" && f.crew.lightsPilot) { const p = pilot(f.crew.lightsPilot); if (p) asks.push({ role: "lighting", label: p.display_name || "Lights", p }); }
  for (const x of f.people) { const p = pilot(x.pilotId); asks.push({ role: x.role, label: (x.label || "").trim() || p?.display_name || (x.role === "band" ? "Opening act" : "Co-host"), p }); }
  let invites = [];
  if (asks.length) {
    const { data: made, error: e } = await supabase.from("gig_invites").insert(asks.map((a) => ({
      show_id: show.id, invited_role: a.role, label: a.label, created_by: userId, granted_sections: [],
    }))).select("id, invite_token, invited_role, label");
    if (e) { console.error(e); warnings.push("The invite links didn't make. Use Invite on the event."); }
    else invites = (made || []).map((m, i) => ({ id: m.id, label: m.label, role: m.invited_role, url: inviteUrl(m.invite_token), phone: asks[i]?.p?.contact_phone || "", email: asks[i]?.p?.contact_email || "" }));
  }

  // Paperwork, filed for the owner, the venue side and the manager side.
  const files = [
    f.paper.w9 && { kind: "other", title: "W9", file: f.paper.w9 },
    f.paper.agreement && { kind: "agreement", title: "Performance agreement", file: f.paper.agreement },
    f.paper.coi && { kind: "coi", title: "Certificate of insurance", file: f.paper.coi },
    ...f.paper.other.map((file) => ({ kind: "other", title: file.name.replace(/\.[a-z0-9]+$/i, ""), file })),
  ].filter(Boolean);
  for (const r of files) {
    try { await fileRecord(show.id, r); }
    catch (e) { console.error(e); warnings.push(`${r.title} didn't upload. Add it from the event's Paperwork.`); }
  }

  return { show, invites, warnings };
}
