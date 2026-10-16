// Weekly "new shows near you" email (job 93).
//
// Called every Thursday by pg_cron (see supabase/fan_digest_migration.sql)
// with the x-cron-secret header. Asks the database for this week's batch
// (fan_digest_batch: fans with local shows on and something new near them),
// sends each one a roundup through Resend and records what it covered so a
// show is never sent to the same fan twice.
//
// Deploy with JWT verification off; the key from the vault guards it instead
// (check_digest_secret). Secrets: RESEND_API_KEY, FAN_EMAIL_FROM, APP_URL.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Same helpers as _shared/fanEventEmail.ts, kept here so this function
// deploys as a single file.
const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const DEFAULT_SITE = "https://show-pilot.vercel.app";
function siteUrl(): string {
  const fromEnv = (Deno.env.get("APP_URL") || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/i.test(fromEnv) ? fromEnv : DEFAULT_SITE;
}

type Show = {
  show_id: string; fan_token: string; fan_slug: string | null; event_name: string | null; band_name: string | null;
  event_type: string | null; date: string; show_time: string | null; venue: string | null; city: string | null;
  state: string | null; flyer_url: string | null; entry: "rsvp" | "tickets"; price: string | null; local: boolean;
};
type Fan = { user_id: string; email: string; name: string | null; city: string | null; state: string; token: string; shows: Show[]; more: number };

const mono = "'SFMono-Regular',Menlo,Consolas,monospace";
const G = "#8CFF3D";

const pageLink = (site: string, s: Show) => `${site}${s.fan_slug ? `/${s.fan_slug}` : `/rsvp/${s.fan_token}`}`;
const dateLabel = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
const title = (s: Show) => s.event_name || s.band_name || "Untitled event";
const place = (s: Show) => [s.venue, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
const typeLabel = (t: string | null) => (t ? t.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : "");

export function buildDigest(fan: Fan, site: string) {
  const where = fan.city ? `${fan.city}, ${fan.state}` : fan.state;
  const n = fan.shows.length + fan.more;
  const subject = n === 1 ? `New near ${where}: ${title(fan.shows[0])}` : `${n} new shows near ${where} this week`;
  const discover = `${site}/?view=discover`;
  const unsubscribe = `${site}/fan/unsubscribe?t=${encodeURIComponent(fan.token)}`;

  const cards = fan.shows.map((s) => {
    const kicker = [typeLabel(s.event_type).toUpperCase(), dateLabel(s.date), s.show_time && String(s.show_time).toUpperCase()].filter(Boolean).join(" · ");
    const cta = s.entry === "rsvp" ? "RSVP" : "Get tickets";
    const price = s.price ? (s.entry === "rsvp" ? `${s.price} at the door` : `Tickets ${s.price}`) : "";
    return `
    <tr><td style="padding:0 0 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e1128;border:1px solid #232849;border-radius:16px;overflow:hidden;">
        ${s.flyer_url ? `<tr><td><a href="${esc(pageLink(site, s))}"><img src="${esc(s.flyer_url)}" alt="" width="520" style="display:block;width:100%;max-height:260px;object-fit:cover;border:0;"></a></td></tr>` : ""}
        <tr><td style="padding:16px 18px;">
          <div style="font-family:${mono};font-size:11px;letter-spacing:.12em;color:${G};">${esc(kicker)}</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;line-height:1.15;color:#fff;">${esc(title(s))}</div>
          ${s.band_name && s.event_name && s.band_name !== s.event_name ? `<div style="margin-top:2px;font-size:15px;color:#d6d8f5;">${esc(s.band_name)}</div>` : ""}
          <div style="margin-top:6px;font-size:14px;color:#b7bbe6;">${esc(place(s))}${s.local ? "" : " · nearby"}</div>
          ${price ? `<div style="margin-top:4px;font-family:${mono};font-size:12px;color:#c3c7ee;">${esc(price.toUpperCase())}</div>` : ""}
          <a href="${esc(pageLink(site, s))}" style="display:inline-block;margin-top:12px;padding:10px 18px;background:${G};color:#0d0d0d;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">${cta} &rsaquo;</a>
        </td></tr>
      </table>
    </td></tr>`;
  }).join("");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#05060f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05060f;"><tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;">
      <tr><td style="padding:0 2px 18px;">
        <div style="font-family:${mono};font-size:11px;letter-spacing:.16em;color:#b7bbe6;">SHOW PILOT · LOCAL SHOWS</div>
        <div style="margin-top:8px;font-size:30px;font-weight:700;line-height:1.1;">${n === 1 ? "A new show" : `${n} new shows`} near ${esc(where)}</div>
        <div style="margin-top:6px;font-size:15px;color:#b7bbe6;">${fan.name ? `Hey ${esc(fan.name)}, here's` : "Here's"} what hosts listed this week.</div>
      </td></tr>
      ${cards}
      ${fan.more ? `<tr><td style="padding:0 2px 14px;font-size:15px;color:#b7bbe6;">+ ${fan.more} more in Discover.</td></tr>` : ""}
      <tr><td style="padding:4px 2px 0;">
        <a href="${esc(discover)}" style="display:inline-block;padding:11px 18px;border:1px solid #232849;border-radius:10px;color:${G};font-weight:700;font-size:15px;text-decoration:none;">Open Discover &rsaquo;</a>
      </td></tr>
      <tr><td style="padding:26px 2px 0;font-size:12px;line-height:1.5;color:#7e83b8;">
        You're getting this because local shows is on in your Show Pilot fan profile. One email a week, only when something's new.<br>
        <a href="${esc(unsubscribe)}" style="color:#b7bbe6;">Stop these emails</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  const text = [
    `${n === 1 ? "A new show" : `${n} new shows`} near ${where}`,
    "",
    ...fan.shows.map((s) => `${title(s)} — ${dateLabel(s.date)} — ${place(s)}\n${pageLink(site, s)}`),
    fan.more ? `\n+ ${fan.more} more in Discover: ${discover}` : `\nDiscover: ${discover}`,
    "",
    `Stop these emails: ${unsubscribe}`,
  ].join("\n");

  return { subject, html, text, unsubscribe };
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: ok } = await admin.rpc("check_digest_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (ok !== true) return new Response("Forbidden", { status: 403 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FAN_EMAIL_FROM");
  if (!resendKey || !from) return new Response(JSON.stringify({ error: "Email isn't set up" }), { status: 500 });

  const { data, error } = await admin.rpc("fan_digest_batch");
  if (error) { console.error(error); return new Response(JSON.stringify({ error: "batch failed" }), { status: 500 }); }

  const fans = (Array.isArray(data) ? data : []) as Fan[];
  const site = siteUrl();
  const week = new Date().toISOString().slice(0, 10);
  let sent = 0, failed = 0;

  for (const fan of fans) {
    if (!fan.shows?.length) continue;
    const { subject, html, text, unsubscribe } = buildDigest(fan, site);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        // One digest per fan per run, even if the call is retried.
        "Idempotency-Key": `fan-digest-${fan.user_id}-${week}`,
      },
      body: JSON.stringify({
        from, to: [fan.email], subject, html, text,
        headers: { "List-Unsubscribe": `<${unsubscribe}>` },
      }),
    });
    if (!res.ok) { failed++; console.error("Resend error", res.status, (await res.text()).slice(0, 300)); continue; }
    // Record the shows in this email; any left in "+ N more" are still new
    // next week.
    const ids = fan.shows.map((s) => s.show_id);
    const { error: markErr } = await admin.rpc("mark_fan_digest_sent", { p_user_id: fan.user_id, p_show_ids: ids });
    if (markErr) console.error(markErr);
    sent++;
    await new Promise((r) => setTimeout(r, 120)); // stay well under Resend's rate limit
  }

  return new Response(JSON.stringify({ fans: fans.length, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
