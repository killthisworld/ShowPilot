// Venue business records (job 104): the event's deal and its filed
// paperwork. Everything goes through the security-definer functions in
// supabase/venue_business_records_migration.sql, so only the event owner,
// the venue side and the manager / artist side ever get this data (never
// crew who only hold the share link). Files live in the private
// `business-records` bucket under <show id>/.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { VENUE_CHECKLIST_ITEMS } from "@/components/showpilot/VenueInfoFields";

export const RECORD_BUCKET = "business-records";

export const RECORD_KINDS = {
  agreement: { label: "Performance agreement", short: "AGREEMENT" },
  rider: { label: "Rider", short: "RIDER" },
  advance: { label: "Advance confirmations", short: "ADVANCE" },
  coi: { label: "Certificate of insurance", short: "INSURANCE" },
  other: { label: "Other record", short: "OTHER" },
};

export const DEAL_TYPES = [
  { key: "flat", label: "Guarantee" },
  { key: "door", label: "Door split" },
  { key: "vs", label: "Guarantee vs %" },
];

export const DEAL_STATUS = {
  draft: { label: "DRAFT", note: "Only you can see this until you send it." },
  sent: { label: "SENT", note: "Waiting for the manager / artist to accept or ask for changes." },
  accepted: { label: "ACCEPTED", note: "Agreed. File it under Paperwork to keep a dated copy." },
  changes_requested: { label: "CHANGES ASKED", note: "The manager / artist asked for changes." },
};

export const FORCE_MAJEURE_TEXT =
  "If the show can't happen because of something neither side controls (severe weather, natural disaster, fire, power or utility failure, government order, public health emergency, or similar), neither side owes the other the fee or damages. Any deposit is returned in full, or both sides can agree in writing to move the show to a new date.";
export const CANCELLATION_TEXT =
  "Venue cancels: the deposit is kept by the artist, plus the full fee if cancelled within 14 days of the show. Artist cancels: the deposit is returned in full. Either side can cancel without penalty if the other breaks a material term and doesn't fix it within 48 hours of written notice.";

// ---------- data ----------
export function useEventBusiness(showId, enabled = true) {
  const [biz, setBiz] = useState(null); // { can_view, venue, manager, is_owner, deal, records }
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!showId || !enabled) { setBiz(null); return null; }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_event_business", { p_show: showId });
    setLoading(false);
    if (error) { console.error(error); setBiz({ can_view: false, error: true }); return null; }
    setBiz(data || { can_view: false });
    return data;
  }, [showId, enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { biz, loading, reload, setBiz };
}

export async function saveDeal(showId, terms, status) {
  const { data, error } = await supabase.rpc("save_event_deal", { p_show: showId, p_terms: terms, p_status: status });
  if (error) throw error;
  return data;
}

// `seen` is the deal's updated_at as shown on screen: the answer only
// applies to that version (if the venue changed it meanwhile, it's refused).
export async function respondDeal(showId, accept, note, seen) {
  const { data, error } = await supabase.rpc("respond_event_deal", { p_show: showId, p_accept: accept, p_note: note || null, p_seen: seen });
  if (error) throw error;
  return data;
}

const safeName = (n) => (n || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);

// File a record. A picked File is uploaded to the event's private folder first.
export async function fileRecord(showId, { kind, title, snapshot = {}, file = null, signed = false, party = null, expiresOn = null, note = null }) {
  let filePath = null;
  let fileName = null;
  if (file) {
    fileName = file.name;
    filePath = `${showId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(RECORD_BUCKET).upload(filePath, file, { contentType: file.type || undefined });
    if (upErr) throw upErr;
  }
  const { data, error } = await supabase.rpc("file_business_record", {
    p_show: showId,
    p_kind: kind,
    p_title: title,
    p_snapshot: snapshot,
    p_file_path: filePath,
    p_file_name: fileName,
    p_signed: !!signed,
    p_party: party || null,
    p_expires_on: expiresOn || null,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function recordFileUrl(path) {
  const { data, error } = await supabase.storage.from(RECORD_BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data?.signedUrl;
}

export async function listVenueRecords() {
  const { data, error } = await supabase.rpc("list_venue_records");
  if (error) throw error;
  return data || [];
}

// ---------- helpers ----------
const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "");
const money = (v) => {
  if (!has(v)) return "";
  const s = String(v).trim();
  return /^[\d,.]+$/.test(s) ? `$${s}` : s;
};
export const fmtDate = (d) => (d ? new Date(String(d).length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const rowsOf = (pairs) => pairs.filter(([, v]) => has(v)).map(([k, v]) => [k, String(v)]);
const eventName = (gig) => gig.event_name || gig.band_name || "Show";
const acts = (gig) => (gig.bands || []).filter((b) => has(b.band_name));

export function dealSummary(terms = {}) {
  const t = terms || {};
  if (t.deal_type === "flat") return has(t.guarantee) ? `${money(t.guarantee)} guarantee` : "Guarantee";
  if (t.deal_type === "door") return has(t.door_percent) ? `${t.door_percent}% of the door` : "Door split";
  if (t.deal_type === "vs") return [money(t.guarantee), has(t.door_percent) ? `${t.door_percent}%` : ""].filter(Boolean).join(" vs ") || "Guarantee vs %";
  return "";
}

// Set times from the Manager / Artist lineup, for the agreement.
export function lineupRows(gig) {
  const st = (gig.manager_info || {}).set_times || {};
  return acts(gig).map((b) => [b.band_name, [st[b.band_name], b.set_length_minutes ? `${b.set_length_minutes} min` : ""].filter(Boolean).join(" · ") || "Time to be set"]);
}

// ---------- what gets filed ----------
// A snapshot is plain data the record viewer and print page render:
// { title, subtitle, sections: [{ heading, rows: [[label, value]], list: [text], text }] }
export function agreementSnapshot(gig, deal) {
  const t = deal?.terms || {};
  const type = DEAL_TYPES.find((d) => d.key === t.deal_type)?.label;
  return {
    title: "Performance agreement",
    subtitle: [eventName(gig), fmtDate(gig.date), gig.venue].filter(Boolean).join(" · "),
    sections: [
      { heading: "Event", rows: rowsOf([["Event", eventName(gig)], ["Date", fmtDate(gig.date)], ["Venue", gig.venue], ["City", [gig.city, gig.state].filter(Boolean).join(", ")], ["Doors", t.doors]]) },
      { heading: "Performers and set times", rows: lineupRows(gig) },
      { heading: "Fee", rows: rowsOf([["Deal", type], ["Guarantee", money(t.guarantee)], ["Door split", has(t.door_percent) ? `${t.door_percent}% ${t.door_after ? `after ${t.door_after}` : ""}`.trim() : ""], ["Bonuses", t.bonus], ["Merch", t.merch_split]]) },
      { heading: "Payment", rows: rowsOf([["Deposit", money(t.deposit_amount)], ["Deposit due", fmtDate(t.deposit_due)], ["Balance", t.balance_terms], ["Paid by", t.payment_method]]) },
      { heading: "Cancellation", text: t.cancellation || "" },
      { heading: "Weather and events nobody controls", text: t.force_majeure || "" },
      { heading: "Other terms", text: t.other_terms || "" },
      { heading: "Status", rows: rowsOf([["Deal status", DEAL_STATUS[deal?.status]?.label], ["Sent", fmtDateTime(deal?.sent_at)], ["Answered", fmtDateTime(deal?.responded_at)], ["Note from artist side", deal?.response_note]]) },
    ].filter((s) => (s.rows && s.rows.length) || has(s.text)),
  };
}

export function riderSnapshot(gig) {
  const vi = gig.venue_info || {};
  const provides = gig.venue_checklist || {};
  const provided = VENUE_CHECKLIST_ITEMS.map((i) => [i.label, provides[i.key]?.checked ? `Venue provides${provides[i.key]?.notes ? ` · ${provides[i.key].notes}` : ""}` : "Artist brings / not confirmed"]);
  const actSections = acts(gig).map((b) => {
    const members = (b.band_members || []).map((m) => {
      const inst = (m.instruments || []).filter((i) => has(i.name)).map((i) => `${i.name}${i.mic_di ? ` (${i.mic_di}${i.phantom_power ? ", phantom" : ""})` : ""}`).join(", ");
      return [m.name || "Member", [inst || m.instrument, m.bus_type ? `${m.bus_type} mix` : ""].filter(Boolean).join(" · ") || "—"];
    });
    const plots = [b.stage_plot_url, ...(b.stage_plot_files || []).map((f) => f?.url)].filter(Boolean);
    return {
      heading: `Tech rider · ${b.band_name}`,
      rows: [...members, ...rowsOf([["Set length", b.set_length_minutes ? `${b.set_length_minutes} min` : ""], ["Notes", b.general_notes]])],
      list: plots.map((u, i) => `Stage plot ${i + 1}: ${u}`),
    };
  });
  return {
    title: "Rider",
    subtitle: [eventName(gig), fmtDate(gig.date), gig.venue].filter(Boolean).join(" · "),
    sections: [
      { heading: "Hospitality", rows: rowsOf([["Green room", vi.green_room], ["Meals", vi.meals], ["Drink tickets", vi.drink_tickets], ["Notes", vi.hospitality_notes]]) },
      { heading: "House gear", rows: rowsOf([["Console", gig.console], ["PA", vi.pa], ["Backline", vi.backline], ["Mics, monitors, lighting", vi.mics_monitors], ["Power", gig.power_notes]]) },
      { heading: "Who provides what", rows: provided },
      ...actSections,
    ].filter((s) => (s.rows && s.rows.length) || (s.list && s.list.length)),
  };
}

export function advanceSnapshot(gig, deal) {
  const vi = gig.venue_info || {};
  const mi = gig.manager_info || {};
  const schedule = (vi.schedule || []).filter((r) => has(r.time) || has(r.label)).map((r) => [r.label || "—", r.time || "—"]);
  const checklist = (mi.checklist || []).filter((c) => has(c.label)).map((c) => [c.label, `${c.done ? "Confirmed" : "Open"}${c.who ? ` · ${c.who}` : ""}`]);
  const guests = (mi.guests || []).filter((g) => has(g.name)).map((g) => `${g.name}${Number(g.plus) > 0 ? ` +${g.plus}` : ""}`);
  return {
    title: "Advance confirmations",
    subtitle: [eventName(gig), fmtDate(gig.date), gig.venue].filter(Boolean).join(" · "),
    sections: [
      { heading: "Schedule", rows: [...schedule, ...rowsOf([["Hard curfew", vi.hard_curfew ? "Yes" : ""], ["Load-out by", vi.load_out_by]])] },
      { heading: "Load-in and parking", rows: rowsOf([["Address", [vi.address, gig.city].filter(Boolean).join(", ")], ["Load-in point", vi.load_in_location], ["Parking", vi.parking], ["Notes", vi.load_in_notes]]) },
      { heading: "Artist travel", rows: rowsOf([["Arrival", mi.arrival_time], ["Vehicle", mi.vehicle], ["Hotel", mi.hotel], ["Travel notes", mi.travel_notes]]) },
      { heading: "Advance checklist", rows: checklist },
      { heading: "Guest list", list: guests.length ? guests : (has(mi.guest_list) ? [mi.guest_list] : []) },
      { heading: "Artist-side contact", rows: rowsOf([["Name", mi.contact_name], ["Title", mi.contact_title], ["Phone", mi.contact_phone], ["Email", mi.contact_email]]) },
      { heading: "Settlement", rows: rowsOf([["Settles with", mi.contact_name], ["Deal", dealSummary(deal?.terms)]]) },
    ].filter((s) => (s.rows && s.rows.length) || (s.list && s.list.length)),
  };
}

// Days until a certificate expires (negative = expired).
export function daysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

// Insurance warnings for one event: missing, expired, or lapsing before the show.
export function coiWarning(records = [], eventDate) {
  const cois = records.filter((r) => r.kind === "coi");
  if (!cois.length) return { level: "missing", text: "No certificate of insurance on file" };
  const latest = cois.reduce((a, b) => (String(a.expires_on || "") > String(b.expires_on || "") ? a : b));
  if (!latest.expires_on) return null;
  const left = daysLeft(latest.expires_on);
  if (left < 0) return { level: "expired", text: `Insurance expired ${fmtDate(latest.expires_on)}` };
  if (eventDate && latest.expires_on < eventDate) return { level: "lapses", text: `Insurance ends ${fmtDate(latest.expires_on)}, before the show` };
  if (left <= 30) return { level: "soon", text: `Insurance ends in ${left} day${left === 1 ? "" : "s"}` };
  return null;
}
