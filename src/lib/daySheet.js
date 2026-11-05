import { buildRunOfShow, parseTime } from "@/components/showpilot/RoleWorkspace";

// The show day, read off the event (job 73, "On the road" stage 1): the
// times, where to go, and who to call. Built from what's already on the
// event - the venue's schedule, the acts' set times, the venue info and each
// profile's contact - so nobody types a day sheet by hand.

const has = (v) => v != null && String(v).trim() !== "";
const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
// After midnight (load-out, curfew) counts as late the same night.
const lateKey = (min) => (min < 6 * 60 ? min + 24 * 60 : min);

export function dayTimes(gig) {
  return buildRunOfShow(gig).map((r) => ({ ...r, min: parseTime(r.time) }));
}

// The next thing on today's schedule, and how long until it.
// { label, time, inMin } or null when nothing's left (or no times).
export function nextCall(times, now = minutesNow()) {
  const at = lateKey(now);
  const next = times.find((t) => t.min != null && lateKey(t.min) >= at);
  if (!next) return null;
  return { label: next.label, time: next.time, inMin: lateKey(next.min) - at };
}

export function untilText(min) {
  if (min <= 0) return "now";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m} min`;
}

export function findTime(times, re) {
  return times.find((t) => re.test(t.label || ""))?.time || "";
}

export function venueAddress(gig) {
  const vi = gig.venue_info || {};
  return [vi.address, [gig.city, gig.state].filter(Boolean).join(", ")].filter(has).join(", ");
}

// Directions on any phone: Google Maps opens the app or the site.
export function directionsUrl(gig) {
  const q = [gig.venue, venueAddress(gig)].filter(has).join(", ");
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : "";
}

// Everyone on the event with a name and a way to reach them.
export function dayContacts(gig) {
  const mi = gig.manager_info || {};
  const ei = gig.engineer_info || {};
  const out = [];
  const add = (name, role, phone, email, color) => {
    if (has(name) || has(phone)) out.push({ name: name || role, role, phone: phone || "", email: email || "", color });
  };
  add(mi.contact_name, mi.contact_title || "Manager / artist", mi.contact_phone, mi.contact_email, "#F87171");
  add(ei.audio?.contact_name, "Audio", ei.audio?.contact_phone, ei.audio?.contact_email, "#8CFF3D");
  if (!ei.lighting?.same_as_audio) add(ei.lighting?.contact_name, "Lighting", ei.lighting?.contact_phone, ei.lighting?.contact_email, "#8CFF3D");
  return out;
}

// The day sheet as plain text, for Share (texts, email, notes).
export function daySheetText(gig, title) {
  const times = dayTimes(gig);
  const vi = gig.venue_info || {};
  const date = gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  const lines = [`${title}${date ? ` · ${date}` : ""}`];
  if (gig.venue) lines.push(gig.venue);
  const addr = venueAddress(gig);
  if (addr) lines.push(addr);
  if (times.length) { lines.push("", ...times.map((t) => `${t.time || "--"}  ${t.label}`)); }
  const extra = [
    ["Load-in", vi.load_in_location], ["Parking", vi.parking],
    ["Wi-Fi", [gig.wifi_network, gig.wifi_password].filter(has).join(" / ")],
  ].filter(([, v]) => has(v));
  if (extra.length) lines.push("", ...extra.map(([k, v]) => `${k}: ${v}`));
  const people = dayContacts(gig).filter((c) => c.phone);
  if (people.length) lines.push("", ...people.map((c) => `${c.name} (${c.role}): ${c.phone}`));
  return lines.join("\n");
}
