// How far along each profile on an event is (job 172), from the same pages
// and the same "filled in" rules as the profile's own pages on the web
// (RoleWorkspace), including pages someone marked done. Requests and
// Paperwork aren't counted (they're running lists, not fields to fill).
import { isPageMarkedDone } from "@/lib/donePages";

const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "");
const stateOf = (vals) => {
  const n = vals.filter(has).length;
  return n === 0 ? "empty" : n >= vals.length ? "done" : "partial";
};

export function profilePageStates(role, gig) {
  if (!gig) return [];
  const vi = gig.venue_info || {};
  const mi = gig.manager_info || {};
  const ei = gig.engineer_info || {};
  let pages = [];
  if (role === "venue") {
    const schedule = vi.schedule || [];
    pages = [
      ["address", stateOf([gig.venue, gig.city, vi.address])],
      ["load_in", stateOf([vi.load_in_location, vi.parking])],
      ["schedule", schedule.length === 0 ? "empty" : schedule.some((r) => /curfew/i.test(r.label || "")) ? "done" : "partial"],
      ["wifi_power", stateOf([gig.wifi_network, gig.wifi_password, gig.power_notes])],
      ["house_gear", stateOf([gig.console, vi.pa, vi.backline])],
      ["hospitality", stateOf([vi.green_room, vi.meals, vi.drink_tickets])],
    ];
  } else if (role === "manager") {
    const checklist = mi.checklist || [];
    const done = checklist.filter((c) => c.done).length;
    pages = [
      ["contact", stateOf([mi.contact_name, mi.contact_phone, mi.contact_email])],
      ["advance", checklist.length === 0 ? "empty" : done === checklist.length ? "done" : "partial"],
      ["guests", (mi.guests || []).length || has(mi.guest_list) ? "done" : "empty"],
    ];
  } else if (role === "band") {
    const acts = (gig.bands || []).filter((b) => b.band_name);
    const times = mi.set_times || {};
    pages = [
      ["lineup", acts.length === 0 ? "empty" : acts.every((b) => has(times[b.band_name])) ? "done" : "partial"],
      ["travel", stateOf([mi.arrival_time, mi.hotel, mi.vehicle])],
      ["merch", stateOf([mi.merch_table, mi.merch_seller, mi.merch_split])],
    ];
  } else if (role === "engineer" || role === "lighting") {
    const k = role === "engineer" ? "audio" : "lighting";
    const info = ei[k] || {};
    pages = [[k, stateOf([info.contact_name, info.contact_phone, info.contact_email])]];
  }
  return pages.map(([key, state]) => ({ key, state: isPageMarkedDone(role, gig, key) ? "done" : state }));
}

// 0-100: a done page counts whole, a partly filled one counts half.
export function profilePercent(role, gig) {
  const pages = profilePageStates(role, gig);
  if (!pages.length) return 0;
  const score = pages.reduce((a, p) => a + (p.state === "done" ? 1 : p.state === "partial" ? 0.5 : 0), 0);
  return Math.round((score / pages.length) * 100);
}
