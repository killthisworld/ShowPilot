// Supabase Edge Function: send-fan-event-email
//
// Called from the public fan event page (/e/:token) when a fan asks to be
// emailed the event info. Sends ONE email per fan per event through Resend.
//
// No login needed (fans don't have accounts), so this function:
//   - only ever emails what get_fan_event already shows publicly (the host's
//     hidden sections stay hidden in the email too)
//   - records each (event, email) once, so the same address never gets a
//     second email for the same event
//   - caps how many new signups one event can take in a short window
//
// Deploy:
//   supabase functions deploy send-fan-event-email --no-verify-jwt
// Secrets (supabase secrets set NAME=value):
//   RESEND_API_KEY   from resend.com -> API Keys
//   FAN_EMAIL_FROM   e.g. "ShowPilot <events@yourdomain.com>" (domain verified in Resend)
//   APP_URL          e.g. "https://showpilot.app" (used for the "view event page" link)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// New signups one event may take per window before we start refusing.
// Generous for a real on-sale rush, low enough to stop someone looping.
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 60;

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Same rules as src/lib/links.js: only real http(s) addresses become links.
function normalizeLink(input: unknown): string | null {
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

type FanEvent = {
  event_name?: string; band_name?: string; event_type?: string;
  date?: string; venue?: string; address?: string; city?: string; state?: string;
  door_time?: string; show_time?: string; ages?: string;
  ticket_link?: string; ticket_price?: string; note?: string; flyer_url?: string;
};

function buildEmail(ev: FanEvent, pageUrl: string | null) {
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

  const rows: [string, string][] = [];
  if (dateLong) rows.push(["DATE", dateLong]);
  if (ev.door_time) rows.push(["DOORS", ev.door_time]);
  if (ev.show_time) rows.push(["SHOW", ev.show_time]);
  if (ev.ages) rows.push(["AGES", ev.ages]);
  if (ev.venue) rows.push(["VENUE", ev.venue]);
  if (fullAddress) rows.push(["ADDRESS", fullAddress]);
  if (ev.ticket_price) rows.push(["TICKETS", ev.ticket_price]);

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
  <p style="margin-top:24px;font-size:12px;line-height:1.5;color:#6f6f6f;">You asked for this on the event page. This is a one-time email about this show. Your address isn't added to any mailing list.</p>
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
    "You asked for this on the event page. This is a one-time email about this show.",
  ].filter((l) => l !== null).join("\n");

  const subject = [title, dateLong].filter(Boolean).join(" · ");
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!UUID_RE.test(token)) return json({ error: "Bad event link" }, 400);
    if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: "That email address doesn't look right" }, 400);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("FAN_EMAIL_FROM");
    if (!resendKey || !from) {
      console.error("Missing RESEND_API_KEY or FAN_EMAIL_FROM");
      return json({ error: "Email isn't set up yet" }, 500);
    }
    const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/+$/, "");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Same public view the fan page shows; null if the page is off or archived.
    const { data: ev, error: evErr } = await admin.rpc("get_fan_event", { p_token: token });
    if (evErr) { console.error(evErr); return json({ error: "Couldn't load the event" }, 500); }
    if (!ev) return json({ error: "This event page isn't available" }, 404);

    const { data: show, error: showErr } = await admin
      .from("shows").select("id").eq("fan_token", token).maybeSingle();
    if (showErr || !show) { console.error(showErr); return json({ error: "This event page isn't available" }, 404); }

    // One email per address per event.
    const { data: existing } = await admin
      .from("fan_email_signups").select("id, sent_at")
      .eq("show_id", show.id).eq("email", email).maybeSingle();
    if (existing?.sent_at) return json({ ok: true, status: "already_sent" });

    let signupId = existing?.id as string | undefined;
    if (!signupId) {
      const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
      const { count } = await admin
        .from("fan_email_signups").select("id", { count: "exact", head: true })
        .eq("show_id", show.id).gte("created_at", since);
      if ((count ?? 0) >= RATE_MAX) return json({ error: "Lots of requests right now. Try again in a few minutes." }, 429);

      const { data: inserted, error: insErr } = await admin
        .from("fan_email_signups").insert({ show_id: show.id, email }).select("id").single();
      if (insErr) {
        // 23505 = another request for the same address got there first.
        if ((insErr as { code?: string }).code === "23505") return json({ ok: true, status: "already_sent" });
        console.error(insErr);
        return json({ error: "Couldn't save your request" }, 500);
      }
      signupId = inserted.id;
    }

    const pageUrl = appUrl ? `${appUrl}/e/${token}` : null;
    const { subject, html, text } = buildEmail(ev as FanEvent, pageUrl);

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
      return json({ error: "Couldn't send the email. Try again in a minute." }, 502);
    }

    await admin.from("fan_email_signups")
      .update({ sent_at: new Date().toISOString(), last_error: null }).eq("id", signupId);
    return json({ ok: true, status: "sent" });
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected server error" }, 500);
  }
});
