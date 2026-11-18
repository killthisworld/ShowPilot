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
//
// Venues (job 323) get the same web from their side: the venue in the middle,
// times pre-filled from their template's schedule, each act invited (an
// invite link per act), Sound / Lights from the house's side, House info from
// their venue template (each part switchable), and co-hosts / a promoter.
import { DATE_TBD } from "@/lib/dateRequest";
import { supabase } from "@/api/supabaseClient";
import { applyTemplate, MANAGER_PART_FIELDS, VENUE_PART_FIELDS, VENUE_PARTS, gigFromTemplate } from "@/lib/roleTemplates";
import { artistFromTemplate } from "@/lib/showTemplates";
import { modeOf } from "@/lib/templatePage";
import { fileRecord } from "@/lib/eventBusiness";

export const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// Is the date part of the form done: a date picked, or months asked for (job 329).
export const dateSettled = (f) => (f.dateMode === "request" ? (f.wants?.months || []).length > 0 : has(f.date));
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

// Venue parts that can come along from the venue template (the schedule is
// the Date & times circle; deal, link setup, replies and the rest stay in the
// template).
export const VENUE_FILE_PARTS = ["address", "load_in", "wifi_power", "house_gear", "hospitality", "documents"];
export const venuePartLabel = (k) => VENUE_PARTS.find((p) => p.key === k)?.label || k;

export const emptyForm = () => ({
  date: "", loadIn: "", doors: "", onStage: "", curfew: "", name: "",
  // "set" a settled date, or "request" one (months, nights, a note; job 329).
  dateMode: "set", wants: { months: [], days: [], note: "" },
  venue: { name: "", city: "", state: "", pilotId: null, invite: true },
  acts: [], // [{ name, pilotId?, invite? }] in billing order, the first is the headliner (venues invite each)
  // soundTech / lightsTech: typed in when they aren't a Fellow Pilot (job 326).
  crew: { sound: "venue", lights: "venue", soundPilot: "", lightsPilot: "", soundTech: { name: "", phone: "", email: "" }, lightsTech: { name: "", phone: "", email: "" } },
  promo: { picked: [], files: {}, facebook: "" }, // files: format -> { url, name }
  onFile: {}, // item key -> false when switched off for this event
  paper: { w9: null, agreement: null, coi: null, other: [] }, // File objects, filed on create
  people: [], // [{ id, role: "manager" | "band", label, pilotId }]
  // A stage plot uploaded here (manager side, when the venue does sound;
  // job 331): { url, name, type }, added to the headliner's plot files.
  stagePlot: null,
});

export const eventName = (f, venueName = "") => {
  if (has(f.name)) return f.name.trim();
  const act = f.acts[0]?.name?.trim();
  const venue = f.venue.name.trim() || venueName.trim();
  return act && venue ? `${act} at ${venue}` : act || venue || "";
};

// What the signed-in manager / artist brings: their card, their manager
// template, their acts, their Fellow Pilots.
export async function loadSources(userId, side = "manager") {
  const [me, mgr, acts, pilots] = await Promise.all([
    supabase.from("user_preferences").select("display_name, profile_photo_url, card_share_token, account_type, contact_phone, contact_email").eq("user_id", userId).maybeSingle(),
    supabase.from("saved_templates").select("name, data, updated_at").eq("owner_id", userId).eq("category", side === "venue" ? "venue" : "manager").order("updated_at", { ascending: false }).limit(1),
    supabase.from("saved_templates").select("name, data").eq("owner_id", userId).eq("category", "artist"),
    supabase.from("fellow_pilots").select("id, pilot_user_id, display_name, job_title, contact_email, contact_phone, profile_photo_url, card_share_token").eq("owner_id", userId).order("display_name", { ascending: true }),
  ]);
  // contact_phone / contact_email may not exist on user_preferences: retry plain.
  let mine = me.data;
  if (me.error) {
    const again = await supabase.from("user_preferences").select("display_name, profile_photo_url, card_share_token, account_type").eq("user_id", userId).maybeSingle();
    mine = again.data;
  }
  const tpl = mgr.data?.[0] || null;
  return {
    me: mine || {},
    managerTpl: side === "venue" ? null : tpl,
    venueTpl: side === "venue" ? tpl : null,
    acts: side === "venue" ? [] : (acts.data || []).filter((t) => has(t.name)).map((t) => ({ name: t.name.trim(), data: t.data || {} })).sort((a, b) => a.name.localeCompare(b.name)),
    pilots: pilots.data || [],
  };
}

export const actTemplate = (sources, name) => sources.acts.find((t) => norm(t.name) === norm(name)) || null;

// The venue as its template has it: name, city, state, and the schedule.
export function venueFromSources(sources) {
  const t = sources.venueTpl;
  const gig = t ? gigFromTemplate("venue", t.name, t.data || {}) : {};
  return {
    name: gig.venue || t?.name || sources.me?.display_name || "",
    city: gig.city || "", state: gig.state || "",
    schedule: Array.isArray(gig.venue_info?.schedule) ? gig.venue_info.schedule : [],
  };
}
const timeFor = (schedule, re) => (schedule.find((r) => re.test(r.label || "")) || {}).time || "";
// Times to start from: the venue template's load-in, doors and curfew.
export function venueTimes(sources) {
  const { schedule } = venueFromSources(sources);
  return { loadIn: timeFor(schedule, /load[\s-]?in/i), doors: timeFor(schedule, /doors?/i), curfew: timeFor(schedule, /curfew/i) };
}
// House info from the venue template: each part that has something in it.
export function venueFileItems(sources) {
  const t = sources.venueTpl;
  if (!t) return [];
  const data = t.data || {};
  const gig = gigFromTemplate("venue", t.name, data);
  const sec = gig.venue_info || {};
  return VENUE_FILE_PARTS.filter((part) => {
    if (modeOf("venue", data, part) === "off") return false;
    const f = VENUE_PART_FIELDS[part] || {};
    return (f.gig || []).some((k) => filled(gig[k])) || (f.section || []).some((k) => filled(sec[k]));
  }).map((part) => ({ key: `v_${part}`, label: venuePartLabel(part), sub: "From My Template" }));
}

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

// A stage plot file (image or PDF), public like the ones in My Templates.
export async function uploadStagePlot(userId, file) {
  const path = `events/${userId}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("stage-plots").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { url: supabase.storage.from("stage-plots").getPublicUrl(path).data.publicUrl, name: file.name, type: file.type || "" };
}

const inviteUrl = (token) => `${window.location.origin}/gig/shared?invite=${token}`;

// Make the event. Returns { show, invites: [{ id, label, role, url, phone, email }], warnings }.
// The event row is made first; acts, the template, invites and paperwork
// follow, and a failure there is a warning, not a lost event.
// side: "manager" (manager / artist accounts) or "venue" (job 323).
export async function createEventFromWeb(userId, sources, f, side = "manager") {
  // A requested date has no times yet; the event gets the stand-in date and keeps the request (lib/dateRequest.js).
  const requesting = f.dateMode === "request";
  if (requesting) f = { ...f, loadIn: "", doors: "", onStage: "", curfew: "" };
  const venueSide = side === "venue";
  const warnings = [];
  const acts = f.acts.filter((a) => has(a.name)).map((a) => ({ ...a, name: a.name.trim() }));
  const first = acts[0] || null;
  const firstTpl = first && !venueSide ? actTemplate(sources, first.name) : null;
  const pilot = (id) => (id ? sources.pilots.find((p) => p.id === id) || null : null);
  const promo = f.promo.picked.filter((id) => f.promo.files[id]?.url).map((id) => ({ format: id, ...f.promo.files[id] }));
  const square = promo.find((p) => p.format === "sq") || promo[0] || null;
  const photoOn = f.onFile.photo !== false;
  const icon = square?.url || (photoOn ? firstTpl?.data?.photo_url : "") || null;
  const house = venueSide ? venueFromSources(sources) : null;
  // The run of the night. A venue starts from its template's schedule, with
  // the times set here written over load-in, doors and curfew.
  const times = [["Load-in", f.loadIn, /load[\s-]?in/i], ["Doors", f.doors, /doors?/i], ...(venueSide ? [["Curfew", f.curfew, /curfew/i]] : [])];
  let schedule;
  if (venueSide) {
    schedule = (house.schedule || []).map((r) => ({ ...r, id: r.id || uid() }));
    for (const [label, time, re] of times) {
      const at = schedule.findIndex((r) => re.test(r.label || ""));
      if (at >= 0) schedule[at] = { ...schedule[at], time: time || schedule[at].time };
      else if (has(time)) schedule.push({ id: uid(), label, time });
    }
    schedule = schedule.filter((r) => has(r.time) || has(r.label));
  } else {
    schedule = times.filter(([, t]) => has(t)).map(([label, time]) => ({ id: uid(), label, time }));
  }

  // The techs this side is bringing go straight onto the event's Audio /
  // Lighting spots (job 326): a Fellow Pilot's card, or what was typed in.
  const bringing = venueSide ? "venue" : "ours";
  const techOf = (k) => {
    if (f.crew[k] !== bringing) return null;
    const p = pilot(f.crew[`${k}Pilot`]);
    if (p) return { contact_name: p.display_name || "", contact_phone: p.contact_phone || "", contact_email: p.contact_email || "", card_user_id: p.pilot_user_id || null, card_share_token: p.card_share_token || null };
    const t = f.crew[`${k}Tech`] || {};
    return has(t.name) ? { contact_name: t.name.trim(), contact_phone: (t.phone || "").trim(), contact_email: (t.email || "").trim() } : null;
  };
  const engineerInfo = {};
  const audioTech = techOf("sound");
  const lightTech = techOf("lights");
  if (audioTech) engineerInfo.audio = audioTech;
  if (lightTech) engineerInfo.lighting = lightTech;

  const { data: show, error } = await supabase.from("shows").insert({
    owner_id: userId,
    event_name: eventName(f, house?.name || "") || "New event",
    band_name: first?.name || "",
    venue: (venueSide ? house.name : f.venue.name).trim() || null,
    city: (venueSide ? house.city : f.venue.city).trim() || null,
    state: (venueSide ? house.state : f.venue.state).trim() || null,
    date: requesting ? DATE_TBD : f.date,
    ...(icon ? { icon_url: icon } : {}),
    included_sections: ["venue", "manager", "engineer"],
    status: "not_started",
    venue_info: schedule.length ? { schedule } : {},
    ...(Object.keys(engineerInfo).length ? { engineer_info: engineerInfo } : {}),
    manager_info: {
      ...(first && has(f.onStage) ? { set_times: { [first.name]: f.onStage } } : {}),
      crew: { sound: f.crew.sound, lights: f.crew.lights },
      ...(promo.length ? { promo } : {}),
      ...(has(f.promo.facebook) ? { facebook_event: f.promo.facebook.trim() } : {}),
      // Made from the New event web (Bookings lists a venue's, job 323).
      made_with: "event_web",
      ...(requesting ? { date_request: { months: f.wants.months || [], days: f.wants.days || [], note: (f.wants.note || "").trim() } } : {}),
    },
  }).select().single();
  if (error) throw error;

  // Their template. Manager: contact always (it's them, in the middle), the
  // other parts unless switched off here. Venue: the house info parts left on,
  // then the schedule as set here.
  const data = venueSide ? sources.venueTpl?.data : sources.managerTpl?.data;
  if (data) {
    try {
      const patch = {};
      if (venueSide) {
        const parts = new Set(["schedule"]);
        for (const part of VENUE_FILE_PARTS) if (f.onFile[`v_${part}`] !== false && modeOf("venue", data, part) !== "off") parts.add(part);
        applyTemplate("venue", data, show, (k, v) => { patch[k] = v; }, parts);
        patch.venue_info = { ...(show.venue_info || {}), ...(patch.venue_info || {}), ...(schedule.length ? { schedule } : {}) };
        // The name, city and state are already the template's.
        delete patch.venue; delete patch.city; delete patch.state;
      } else {
        const parts = new Set(["contact"]);
        for (const part of Object.keys(MANAGER_PART_LABELS)) if (f.onFile[`m_${part}`] !== false && modeOf("manager", data, part) !== "off") parts.add(part);
        applyTemplate("manager", data, show, (k, v) => { patch[k] = v; }, parts);
        patch.manager_info = { ...(show.manager_info || {}), ...(patch.manager_info || {}) };
      }
      const { error: e } = await supabase.from("shows").update(patch).eq("id", show.id);
      if (e) throw e;
    } catch (e) { console.error(e); warnings.push(`Your template's info didn't all load. Add it from the event's ${venueSide ? "Venue" : "Manager / Artist"} page.`); }
  }

  // The acts: from their template (manager side), or just the name and their
  // photo when picked from Fellow Pilots (a venue's invite fills in the rest).
  if (acts.length) {
    const rows = acts.map((a, i) => {
      const t = venueSide ? null : actTemplate(sources, a.name);
      const row = t ? artistFromTemplate(a.name, t.data) : { band_name: a.name };
      if (venueSide) { const p = pilot(a.pilotId); if (p?.profile_photo_url) row.photo_url = p.profile_photo_url; }
      if (!venueSide && f.onFile.plot === false) { row.band_members = []; row.stage_plot_url = ""; row.stage_plot_files = []; }
      if (!venueSide && i === 0 && f.stagePlot?.url) row.stage_plot_files = [...(row.stage_plot_files || []), f.stagePlot];
      if (!venueSide && !photoOn) delete row.photo_url;
      const len = Number(row.set_length_minutes);
      row.set_length_minutes = Number.isFinite(len) && len > 0 ? Math.round(len) : null;
      return { ...row, show_id: show.id, is_headliner: i === 0, sort_order: i, role: i === 0 ? "Headliner" : "Opener" };
    });
    const { error: e } = await supabase.from("show_bands").insert(rows);
    if (e) { console.error(e); warnings.push("The acts didn't save. Add them on the event's lineup."); }
  }

  // Invite links. Manager side: the venue, a tech they're bringing, co-hosts.
  // Venue side: each act, a house tech, co-hosts.
  const asks = [];
  if (venueSide) {
    for (const a of acts) if (a.invite !== false) { const p = pilot(a.pilotId); asks.push({ role: "band", label: a.name, p }); }
  } else if (has(f.venue.name) && f.venue.invite) asks.push({ role: "venue", label: f.venue.name.trim(), p: pilot(f.venue.pilotId) });
  const bring = venueSide ? "venue" : "ours";
  if (f.crew.sound === bring && f.crew.soundPilot) { const p = pilot(f.crew.soundPilot); if (p) asks.push({ role: "engineer", label: p.display_name || "Sound", p }); }
  if (f.crew.lights === bring && f.crew.lightsPilot) { const p = pilot(f.crew.lightsPilot); if (p) asks.push({ role: "lighting", label: p.display_name || "Lights", p }); }
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
    f.paper.agreement && { kind: "agreement", title: venueSide ? "Contract" : "Performance agreement", file: f.paper.agreement },
    f.paper.coi && { kind: "coi", title: "Certificate of insurance", file: f.paper.coi },
    ...f.paper.other.map((file) => ({ kind: "other", title: file.name.replace(/\.[a-z0-9]+$/i, ""), file })),
  ].filter(Boolean);
  for (const r of files) {
    try { await fileRecord(show.id, r); }
    catch (e) { console.error(e); warnings.push(`${r.title} didn't upload. Add it from the event's Paperwork.`); }
  }

  return { show, invites, warnings };
}
