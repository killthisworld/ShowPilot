// Shared by send-fan-event-email (fan page opt-in) and eventbrite-webhook
// (real ticket buyers): builds the one-time event-info email and sends it
// through Resend, recording it in fan_email_signups so each address gets it
// once per event.
//
// Secrets: RESEND_API_KEY, FAN_EMAIL_FROM, APP_URL.

// deno-lint-ignore-file no-explicit-any

export const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Same rules as src/lib/links.js: only real http(s) addresses become links.
export function normalizeLink(input: unknown): string | null {
  const raw = String(input || "").trim();
  if (!raw || /\s/.test(raw)) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProtocol);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes(".") || u.hostname.startsWith(".") || u.hostname.endsWith(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type FanEvent = {
  event_name?: string; band_name?: string; event_type?: string;
  date?: string; venue?: string; address?: string; city?: string; state?: string;
  door_time?: string; show_time?: string; ages?: string;
  ticket_link?: string; ticket_price?: string; note?: string; flyer_url?: string;
  rsvp?: boolean; door_price?: string; lineup?: { id: string; name: string }[];
};

// Extra bits for one kind of email (e.g. an RSVP confirmation).
export type EmailExtras = {
  topRows?: [string, string][]; // shown first in the details table
  subjectPrefix?: string;       // e.g. "You're on the list: "
  subjectOverride?: string;     // host-written subject; replaces the default
  hostMessage?: string;         // host-written note just for this email (e.g. RSVPs)
  keyLink?: string;             // RSVP sky key: link to /e/<token>/sky?k=<key>
  attachedNames?: string[];     // files attached to this email (filled in by sendFanEventEmail)
};

export function buildEmail(ev: FanEvent, pageUrl: string | null, footer: string, extras: EmailExtras = {}) {
  const title = ev.event_name || ev.band_name || "Your event";
  const dateLong = ev.date
    ? new Date(ev.date + "T00:00:00Z").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
      })
    : "";
  const place = [ev.city, ev.state].filter(Boolean).join(", ");
  const fullAddress = ev.address ? [ev.address, place].filter(Boolean).join(", ") : place;
  const mapQuery = ev.address ? fullAddress : [ev.venue, place].filter(Boolean).join(" ");
  const mapsUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;
  const ticketUrl = normalizeLink(ev.ticket_link);

  // All-day Google Calendar link (door/show times are free text, so we don't guess a clock time).
  let calUrl: string | null = null;
  if (ev.date && /^\d{4}-\d{2}-\d{2}$/.test(ev.date)) {
    const start = ev.date.replace(/-/g, "");
    const d = new Date(ev.date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    const end = d.toISOString().slice(0, 10).replace(/-/g, "");
    const details = [
      ev.door_time && `Doors ${ev.door_time}`,
      ev.show_time && `Show ${ev.show_time}`,
      pageUrl,
    ].filter(Boolean).join("\n");
    const p = new URLSearchParams({
      action: "TEMPLATE", text: title, dates: `${start}/${end}`,
      location: [ev.venue, fullAddress].filter(Boolean).join(", "), details,
    });
    calUrl = `https://calendar.google.com/calendar/render?${p.toString()}`;
  }

  const rows: [string, string][] = [...(extras.topRows ?? [])];
  if (dateLong) rows.push(["DATE", dateLong]);
  if (ev.door_time) rows.push(["DOORS", ev.door_time]);
  if (ev.show_time) rows.push(["SHOW", ev.show_time]);
  if (ev.ages) rows.push(["AGES", ev.ages]);
  if (ev.venue) rows.push(["VENUE", ev.venue]);
  if (fullAddress) rows.push(["ADDRESS", fullAddress]);
  if (ev.ticket_price) rows.push(["TICKETS", ev.ticket_price]);
  if (ev.door_price) rows.push(["AT THE DOOR", ev.door_price]);
  if (extras.attachedNames?.length) rows.push(["ATTACHED", extras.attachedNames.join(", ")]);

  const mono = "'SFMono-Regular',Menlo,Consolas,monospace";
  const btn = (href: string, label: string, primary = false) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:10px;font-weight:700;letter-spacing:.06em;text-decoration:none;font-size:14px;${
      primary ? "background:#8CFF3D;color:#0d0d0d;" : "background:#1a1a1a;color:#ffffff;border:1px solid #333;"
    }">${esc(label)}</a>`;

  const html = `<!doctype html><html><body style="margin:0;background:#0d0d0d;">
<div style="max-width:520px;margin:0 auto;padding:28px 20px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ffffff;">
  <div style="font-family:${mono};font-size:11px;letter-spacing:.14em;color:#8a8a8a;">SHOWPILOT · EVENT INFO</div>
  ${ev.flyer_url ? `<img src="${esc(ev.flyer_url)}" alt="Event flyer" width="480" style="display:block;width:100%;max-width:480px;height:auto;margin:16px 0 4px;border-radius:12px;border:1px solid #262626;">` : ""}
  <h1 style="margin:14px 0 4px;font-size:30px;line-height:1.05;">${esc(title)}</h1>
  ${ev.band_name && ev.event_name && ev.band_name !== ev.event_name ? `<div style="font-size:18px;color:#cfcfcf;font-weight:600;">${esc(ev.band_name)}</div>` : ""}
  ${extras.keyLink ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 0;background:#0b0e24;border:1px solid #2b2f5a;border-radius:12px;"><tr>
    <td style="padding:10px 14px;font-size:14px;line-height:1.35;color:#d6d8f5;"><span style="font-weight:700;color:#ffffff;">Your star is in the sky.</span> Unlock your key to see it.</td>
    <td style="padding:8px 10px 8px 0;text-align:right;white-space:nowrap;"><a href="${esc(extras.keyLink)}" style="display:inline-block;padding:8px 14px;border-radius:999px;background:#8CFF3D;color:#0d0d0d;font-weight:700;text-decoration:none;font-size:13px;">Unlock your key</a></td>
  </tr></table>` : ""}
  ${extras.hostMessage ? `<div style="margin:20px 0 0;padding:14px;background:#141414;border:1px solid #262626;border-radius:12px;"><div style="font-family:${mono};font-size:11px;letter-spacing:.12em;color:#8a8a8a;">FROM THE HOST</div><div style="margin-top:6px;font-size:15px;line-height:1.45;white-space:pre-line;">${esc(extras.hostMessage)}</div></div>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;background:#141414;border:1px solid #262626;border-radius:12px;">
    ${rows.map(([k, v], i) => `<tr><td style="padding:10px 14px;${i ? "border-top:1px solid #222;" : ""}font-family:${mono};font-size:11px;letter-spacing:.12em;color:#8a8a8a;width:90px;vertical-align:top;">${k}</td><td style="padding:10px 14px;${i ? "border-top:1px solid #222;" : ""}font-size:15px;color:#ffffff;">${esc(v)}</td></tr>`).join("")}
  </table>
  ${ev.note ? `<div style="margin:0 0 20px;padding:14px;background:#141414;border:1px solid #262626;border-radius:12px;"><div style="font-family:${mono};font-size:11px;letter-spacing:.12em;color:#8a8a8a;">NOTE FROM THE ARTIST</div><div style="margin-top:6px;font-size:15px;white-space:pre-line;">${esc(ev.note)}</div></div>` : ""}
  <div>
    ${ticketUrl ? btn(ticketUrl, "TICKETS", true) : ""}
    ${mapsUrl ? btn(mapsUrl, "MAP") : ""}
    ${calUrl ? btn(calUrl, "ADD TO CALENDAR") : ""}
    ${pageUrl ? btn(pageUrl, "EVENT PAGE") : ""}
  </div>
  <p style="margin-top:24px;font-size:12px;line-height:1.5;color:#6f6f6f;">${esc(footer)}</p>
</div></body></html>`;

  const text = [
    title,
    ev.band_name && ev.event_name && ev.band_name !== ev.event_name ? ev.band_name : null,
    "",
    extras.keyLink ? `Your star is in the sky. Unlock your key: ${extras.keyLink}\n` : null,
    extras.hostMessage ? `From the host:\n${extras.hostMessage}\n` : null,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ev.note ? `\nNote from the artist:\n${ev.note}` : null,
    "",
    ticketUrl ? `Tickets: ${ticketUrl}` : null,
    mapsUrl ? `Map: ${mapsUrl}` : null,
    calUrl ? `Add to calendar: ${calUrl}` : null,
    pageUrl ? `Event page: ${pageUrl}` : null,
    "",
    footer,
  ].filter((l) => l !== null).join("\n");

  const custom = (extras.subjectOverride ?? "").trim().slice(0, 150);
  const subject = custom || (extras.subjectPrefix ?? "") + [title, dateLong].filter(Boolean).join(" · ");
  return { subject, html, text };
}

// Where the links in the email point: the APP_URL secret, or Show Pilot's
// live site if that secret is missing or blank, so a mistyped secret never
// strips the links out. (Deliberately not taken from the request: a caller
// could fake it and get Show Pilot to email someone links to another site.)
export const DEFAULT_SITE = "https://show-pilot.vercel.app";
export function siteUrl(): string {
  const fromEnv = (Deno.env.get("APP_URL") || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^\s/]+$/i.test(fromEnv)) return fromEnv;
  if (fromEnv) console.error(`APP_URL secret isn't a site address ("${fromEnv.slice(0, 60)}"); using ${DEFAULT_SITE}`);
  return DEFAULT_SITE;
}

// ---- Attachments ----
// Hosts upload up to 3 files (parking PDF, map, ...) in Fan page settings. They
// live in the private fan-files bucket and are listed in shows.fan_page.files.
// Only files in the show owner's own folder are attached, and a file that
// can't be read is skipped so the email still goes out.
const FAN_FILES_BUCKET = "fan-files";
const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const EXT: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};

export function safeFileName(name: unknown, type: string): string {
  const ext = EXT[type] || "";
  let base = String(name ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^\w .()\-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!base) base = "attachment";
  return ext ? `${base}.${ext}` : base;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function loadAttachments(admin: any, showId: string): Promise<{ filename: string; content: string }[]> {
  const { data: show, error } = await admin.from("shows").select("owner_id, fan_page").eq("id", showId).maybeSingle();
  if (error || !show) { if (error) console.error(error); return []; }
  const list = Array.isArray(show.fan_page?.files) ? show.fan_page.files.slice(0, MAX_FILES) : [];
  const out: { filename: string; content: string }[] = [];
  let total = 0;
  for (const f of list) {
    const path = String(f?.path ?? "");
    const type = String(f?.type ?? "");
    if (!path.startsWith(`${show.owner_id}/`) || path.includes("..") || !EXT[type]) continue;
    const { data: blob, error: dlErr } = await admin.storage.from(FAN_FILES_BUCKET).download(path);
    if (dlErr || !blob) { console.error("Attachment download failed:", path, dlErr); continue; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES || total + bytes.length > MAX_TOTAL_BYTES) continue;
    total += bytes.length;
    out.push({ filename: safeFileName(f?.name, type), content: toBase64(bytes) });
  }
  return out;
}

// New signups one event may take per window before the public opt-in starts
// refusing. Not applied to Eventbrite orders (those are proven sales).
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 60;

export type SendResult =
  | { status: "sent" | "already_sent" }
  | { status: "page_off" | "rate_limited" | "not_configured" | "error"; error: string };

// Sends the event-info email for one show to one address, once. Uses the
// show's public fan page view (get_fan_event), so anything the host hid on
// the page stays out of the email, and nothing is sent while the page is off.
// The venue block and attachments follow the confirmation rules below.
export async function sendFanEventEmail(
  admin: any,
  opts: {
    showId: string;
    fanToken: string;
    email: string;
    source: "fan_page" | "eventbrite" | "rsvp";
    ebOrderId?: string;
    footer: string;
    rateLimit?: boolean;
    extras?: EmailExtras;
  },
): Promise<SendResult> {
  const email = opts.email.trim().toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FAN_EMAIL_FROM");
  if (!resendKey || !from) {
    console.error("Missing RESEND_API_KEY or FAN_EMAIL_FROM");
    return { status: "not_configured", error: "Email isn't set up yet" };
  }
  const appUrl = siteUrl();

  const { data: ev, error: evErr } = await admin.rpc("get_fan_event", { p_token: opts.fanToken });
  if (evErr) { console.error(evErr); return { status: "error", error: "Couldn't load the event" }; }
  if (!ev) return { status: "page_off", error: "This event page isn't available" };

  // One email per address per event.
  const { data: existing } = await admin
    .from("fan_email_signups").select("id, sent_at")
    .eq("show_id", opts.showId).eq("email", email).maybeSingle();
  if (existing?.sent_at) return { status: "already_sent" };

  let signupId = existing?.id as string | undefined;
  if (!signupId) {
    if (opts.rateLimit) {
      const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
      const { count } = await admin
        .from("fan_email_signups").select("id", { count: "exact", head: true })
        .eq("show_id", opts.showId).gte("created_at", since);
      if ((count ?? 0) >= RATE_MAX) return { status: "rate_limited", error: "Lots of requests right now. Try again in a few minutes." };
    }
    const { data: inserted, error: insErr } = await admin
      .from("fan_email_signups")
      .insert({ show_id: opts.showId, email, source: opts.source, eb_order_id: opts.ebOrderId ?? null })
      .select("id").single();
    if (insErr) {
      // 23505 = another request for the same address got there first.
      if (insErr.code === "23505") return { status: "already_sent" };
      console.error(insErr);
      return { status: "error", error: "Couldn't save your request" };
    }
    signupId = inserted.id;
  }

  const pageUrl = appUrl ? `${appUrl}/e/${opts.fanToken}` : null;

  // The confirmation email (an RSVP, or an Eventbrite ticket purchase) is
  // the one that can carry the venue, address and map, plus the parking
  // PDFs and other attachments. The host picks where the venue shows
  // (fan_page.venue_where: page, email or both); the "email me the info"
  // opt-in only ever gets what's on the public page and no attachments.
  const confirmation = opts.source === "rsvp" || opts.source === "eventbrite";
  const event = { ...(ev as FanEvent) };
  const { data: show } = await admin
    .from("shows").select("venue, city, state, fan_page").eq("id", opts.showId).maybeSingle();
  const cfg = show?.fan_page ?? {};
  const venueHidden = Array.isArray(cfg.hidden) && cfg.hidden.includes("venue");
  const where = cfg.venue_where === "page" || cfg.venue_where === "email" ? cfg.venue_where : "both";
  const venueInEmail = !venueHidden && (confirmation ? where !== "page" : where !== "email");
  if (venueInEmail) {
    event.venue = show?.venue ?? undefined;
    event.address = typeof cfg.address === "string" && cfg.address.trim() ? cfg.address.trim() : undefined;
    event.city = show?.city ?? undefined;
    event.state = show?.state ?? undefined;
  } else {
    delete event.venue; delete event.address; delete event.city; delete event.state;
  }

  const attachments = confirmation ? await loadAttachments(admin, opts.showId) : [];
  const { subject, html, text } = buildEmail(event, pageUrl, opts.footer, {
    ...(opts.extras ?? {}),
    attachedNames: attachments.map((a) => a.filename),
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      // Resend drops a repeat with the same key, so a retry can't double-send.
      "Idempotency-Key": `fan-event-${signupId}`,
    },
    body: JSON.stringify({ from, to: [email], subject, html, text, ...(attachments.length ? { attachments } : {}) }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Resend error:", res.status, errText);
    await admin.from("fan_email_signups")
      .update({ last_error: `${res.status}: ${errText.slice(0, 500)}` }).eq("id", signupId);
    return { status: "error", error: "Couldn't send the email. Try again in a minute." };
  }

  await admin.from("fan_email_signups")
    .update({ sent_at: new Date().toISOString(), last_error: null }).eq("id", signupId);
  return { status: "sent" };
}
