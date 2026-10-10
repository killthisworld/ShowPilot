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
  rsvp?: boolean; door_price?: string;
};

// Extra bits for one kind of email (e.g. an RSVP confirmation).
export type EmailExtras = {
  topRows?: [string, string][]; // shown first in the details table
  subjectPrefix?: string;       // e.g. "You're on the list: "
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

  const mono = "'SFMono-Regular',Menlo,Consolas,monospace";
  const btn = (href: string, label: string, primary = false) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:10px;font-weight:700;letter-spacing:.06em;text-decoration:none;font-size:14px;${
      primary ? "background:#8CFF3D;color:#0d0d0d;" : "background:#1a1a1a;color:#ffffff;border:1px solid #333;"
    }">${esc(label)}</a>`;

  const html = `<!doctype html><html><body style="margin:0;background:#0d0d0d;">
<div style="max-width:520px;margin:0 auto;padding:28px 20px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ffffff;">
  <div style="font-family:${mono};font-size:11px;letter-spacing:.14em;color:#8a8a8a;">SHOWPILOT · EVENT INFO</div>
  <h1 style="margin:14px 0 4px;font-size:30px;line-height:1.05;">${esc(title)}</h1>
  ${ev.band_name && ev.event_name && ev.band_name !== ev.event_name ? `<div style="font-size:18px;color:#cfcfcf;font-weight:600;">${esc(ev.band_name)}</div>` : ""}
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

  const subject = (extras.subjectPrefix ?? "") + [title, dateLong].filter(Boolean).join(" · ");
  return { subject, html, text };
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
  const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/+$/, "");

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
  const { subject, html, text } = buildEmail(ev as FanEvent, pageUrl, opts.footer, opts.extras);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      // Resend drops a repeat with the same key, so a retry can't double-send.
      "Idempotency-Key": `fan-event-${signupId}`,
    },
    body: JSON.stringify({ from, to: [email], subject, html, text }),
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
