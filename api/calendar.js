// Google Calendar (and Apple / Outlook) for every profile (job 411).
//
// https://showpilot.space/cal/<token>.ics (vercel.json sends it here) is a
// person's private calendar feed: every event they own or are linked into.
// They add it once from Settings > Account > Google Calendar and their
// calendar app keeps checking it, so new and changed events show up on their
// own (Google checks a subscribed calendar every few hours).
//
// The token is the only key (calendar_feeds, supabase/calendar_feed_migration.sql);
// calendar_feed_events returns just what a calendar entry needs.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// "20:00", "8 PM", "8:30pm" -> minutes after midnight, or null.
export function toMin(t) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)?/i.exec(String(t || ""));
  if (!m) return null;
  const hr = Number(m[1]), mi = Number(m[2] || 0);
  if (hr > 24 || mi > 59) return null;
  const ap = (m[3] || "").toLowerCase();
  let h = hr % 12;
  if (ap.startsWith("p")) h += 12;
  else if (!ap) h = hr === 24 ? 0 : hr;
  return h * 60 + mi;
}
// Times before 6 AM are after midnight, the same night (as the app's run of show).
const nightKey = (m) => (m === null ? null : m < 360 ? m + 1440 : m);
const pretty = (m) => {
  const h = Math.floor(m / 60) % 24, mi = m % 60;
  return `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// The event's run of show: the venue's times, each act's set, the artist's arrival.
export function runOfShow(ev) {
  const rows = (Array.isArray(ev.schedule) ? ev.schedule : [])
    .filter((r) => r && (has(r.time) || has(r.label)))
    .map((r) => ({ t: nightKey(toMin(r.time)), label: String(r.label || "").trim(), kind: /curfew/i.test(r.label || "") ? "curfew" : /door/i.test(r.label || "") ? "doors" : "venue" }));
  const sets = ev.set_times && typeof ev.set_times === "object" ? ev.set_times : {};
  (Array.isArray(ev.bands) ? ev.bands : []).forEach((b) => {
    const t = b && b.band_name ? sets[b.band_name] : null;
    if (has(t)) rows.push({ t: nightKey(toMin(t)), label: b.band_name, kind: "set", len: Number(b.set_length_minutes) || 0 });
  });
  if (has(ev.arrival_time)) rows.push({ t: nightKey(toMin(ev.arrival_time)), label: "Artist arrives", kind: "travel" });
  return rows.sort((a, b) => (a.t ?? 99999) - (b.t ?? 99999));
}

// When the event starts and ends, in minutes from the event day's midnight
// (past 1440 = after midnight). Doors, else the first set, else the event
// time, else the venue's first time; ends at curfew, else after the last
// set, else three hours on. No time anywhere: an all-day event.
export function eventSpan(ev) {
  const run = runOfShow(ev).filter((r) => r.t !== null);
  const first = (k) => run.find((r) => r.kind === k);
  const start = first("doors")?.t ?? first("set")?.t ?? nightKey(toMin(ev.event_time)) ?? run.find((r) => r.kind === "venue")?.t ?? null;
  if (start === null) return null;
  const curfew = first("curfew")?.t;
  const sets = run.filter((r) => r.kind === "set" && r.t >= start);
  const lastSet = sets.length ? sets[sets.length - 1] : null;
  let end = curfew !== undefined && curfew > start ? curfew : lastSet && lastSet.t + (lastSet.len || 60) > start ? lastSet.t + (lastSet.len || 60) : start + 180;
  if (end - start > 16 * 60) end = start + 180;
  return { start, end };
}

// ---- iCalendar ----
const escText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Lines over 75 bytes fold onto the next line, starting with a space.
function fold(line) {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const pad = (n) => String(n).padStart(2, "0");
const dayStr = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const utcStamp = (d) => `${dayStr(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
// A wall-clock time on the event's day (no time zone: shown as it's written,
// in the calendar's own zone, like the times on the event page).
function floating(dateIso, minutes) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return `${dayStr(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

export function buildIcs(events, origin) {
  const now = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Show Pilot//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Show Pilot",
    "X-WR-CALDESC:Your Show Pilot events: every event you create or are linked into.",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const ev of events || []) {
    if (!ev || !ev.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(ev.date || ""))) continue;
    const name = [ev.event_name, ev.band_name].find(has) || "Show";
    const where = [ev.venue, ev.address, [ev.city, ev.state].filter(has).join(", ")].filter(has)
      .filter((v, i, a) => !a.slice(0, i).some((p) => p.toLowerCase().includes(String(v).toLowerCase())));
    const link = `${origin}/open/${ev.id}`;
    const run = runOfShow(ev).filter((r) => r.t !== null && r.label);
    const desc = [
      ev.event_type && `${ev.event_type}${ev.venue ? ` at ${ev.venue}` : ""}`,
      run.length ? `Run of show:\n${run.map((r) => `${pretty(r.t)}  ${r.label}`).join("\n")}` : "",
      `Open in Show Pilot: ${link}`,
    ].filter(has).join("\n\n");
    const span = eventSpan(ev);
    const changed = ev.updated_at ? utcStamp(new Date(ev.updated_at)) : now;

    lines.push("BEGIN:VEVENT", `UID:${ev.id}@showpilot.space`, `DTSTAMP:${changed}`, `LAST-MODIFIED:${changed}`);
    if (span) {
      lines.push(`DTSTART:${floating(ev.date, span.start)}`, `DTEND:${floating(ev.date, span.end)}`);
    } else {
      const next = new Date(`${ev.date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${dayStr(next)}`);
    }
    lines.push(`SUMMARY:${escText(name)}`);
    if (where.length) lines.push(`LOCATION:${escText(where.join(", "))}`);
    lines.push(`DESCRIPTION:${escText(desc)}`, `URL:${link}`, "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export default async function handler(req, res) {
  const token = String((req.query || {}).t || "").replace(/\.ics$/i, "");
  if (!UUID.test(token)) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  let events = null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/calendar_feed_events`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    events = await r.json();
  } catch (e) {
    console.error(e);
    res.statusCode = 503;
    res.setHeader("Retry-After", "600");
    return res.end("Try again soon");
  }
  if (!Array.isArray(events)) {
    // An unknown or reset link.
    res.statusCode = 404;
    return res.end("Not found");
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "showpilot.space";
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="showpilot.ics"');
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Robots-Tag", "noindex");
  return res.end(buildIcs(events, `https://${host}`));
}
