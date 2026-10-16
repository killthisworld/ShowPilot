// Fan countdown emails (job 78).
//
// Called every hour by pg_cron (see supabase/fan_countdown_migration.sql)
// with the x-cron-secret header. Asks the database which notches are due
// (fan_countdown_due: opened at 10 AM Eastern on their day, within the last
// 36 hours) and which RSVPs haven't had them, emails each fan through Resend
// and records the send so nobody gets a notch twice.
//
// Deploy with JWT verification off; the vault key guards it
// (check_digest_secret). Secrets: RESEND_API_KEY, FAN_EMAIL_FROM, APP_URL.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const DEFAULT_SITE = "https://show-pilot.vercel.app";
function siteUrl(): string {
  const fromEnv = (Deno.env.get("APP_URL") || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/i.test(fromEnv) ? fromEnv : DEFAULT_SITE;
}

type Notch = {
  id: string; days_before: number | string; type?: string; subject?: string; message?: string;
  kind?: string; title?: string;
};
type Ev = {
  event_name?: string; band_name?: string; date: string; door_time?: string; show_time?: string;
  venue?: string; address?: string; city?: string; state?: string; flyer_url?: string; door_price?: string;
};
type Rsvp = { rsvp_id: string; email: string; name: string | null; sky_key: string };
type Due = { show_id: string; fan_token: string; fan_slug: string | null; notch: Notch; event: Ev; rsvps: Rsvp[] | null };

const mono = "'SFMono-Regular',Menlo,Consolas,monospace";
const G = "#8CFF3D";
export const KIND_LABEL: Record<string, string> = {
  note: "a note from the artist", setlist: "a setlist tease", playlist: "the pre-show playlist",
  bts: "a behind-the-scenes look", doors: "doors & parking", merch: "a first look at the merch",
};

const titleOf = (ev: Ev) => ev.event_name || ev.band_name || "the show";
const dateLong = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const whenWord = (d: number) => (d === 0 ? "Tonight" : d === 1 ? "Tomorrow" : d < 7 ? `${d} days to go` : d === 7 ? "One week to go" : d === 14 ? "Two weeks to go" : `${d} days to go`);

export function buildCountdownEmail(site: string, due: Due, fan: Rsvp) {
  const ev = due.event;
  const n = due.notch;
  const d = Math.max(0, Number(n.days_before) || 0);
  const unlock = n.type === "unlock";
  const title = titleOf(ev);
  const base = `${site}${due.fan_slug ? `/${due.fan_slug}` : `/rsvp/${due.fan_token}`}`;
  const sky = `${base}/sky?k=${encodeURIComponent(fan.sky_key)}`;
  const stop = `${site}/fan/unsubscribe?countdown=${encodeURIComponent(fan.sky_key)}`;
  const custom = String(n.subject || "").trim().slice(0, 150);
  const subject = custom || (unlock
    ? `A notch just turned: ${title}`
    : d === 0 ? `Tonight: ${title}` : d === 1 ? `Tomorrow: ${title}` : `${whenWord(d)}: ${title}`);
  const message = String(n.message || "").trim();
  const place = [ev.city, ev.state].filter(Boolean).join(", ");
  const rows: [string, string][] = [];
  rows.push(["DATE", dateLong(ev.date)]);
  if (ev.door_time) rows.push(["DOORS", ev.door_time]);
  if (ev.show_time) rows.push(["SHOW", ev.show_time]);
  if (ev.venue) rows.push(["VENUE", ev.venue]);
  if (ev.address || place) rows.push(["ADDRESS", [ev.address, place].filter(Boolean).join(", ")]);
  if (ev.door_price) rows.push(["AT THE DOOR", ev.door_price]);
  const teaser = unlock ? (n.title?.trim() || KIND_LABEL[n.kind || ""] || "something new") : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#05060f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05060f;"><tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;">
      <tr><td style="padding:0 2px 14px;">
        <div style="font-family:${mono};font-size:11px;letter-spacing:.16em;color:${G};">${esc(whenWord(d).toUpperCase())} · COUNTDOWN</div>
        <div style="margin-top:8px;font-size:30px;font-weight:700;line-height:1.08;">${esc(title)}</div>
        ${ev.band_name && ev.event_name && ev.band_name !== ev.event_name ? `<div style="margin-top:2px;font-size:17px;color:#d6d8f5;font-weight:600;">${esc(ev.band_name)}</div>` : ""}
      </td></tr>
      ${ev.flyer_url && !unlock ? `<tr><td style="padding:0 0 14px;"><img src="${esc(ev.flyer_url)}" alt="" width="520" style="display:block;width:100%;max-height:300px;object-fit:cover;border-radius:14px;border:1px solid #232849;"></td></tr>` : ""}
      ${unlock ? `<tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0e24;border:1px solid #2b2f5a;border-radius:16px;"><tr><td style="padding:18px;">
          <div style="font-family:${mono};font-size:11px;letter-spacing:.14em;color:#b7bbe6;">YOUR KEY TURNED A NOTCH</div>
          <div style="margin-top:8px;font-size:20px;font-weight:700;line-height:1.25;">${esc(fan.name ? `${fan.name}, something` : "Something")} new is waiting in the sky.</div>
          <div style="margin-top:6px;font-size:16px;line-height:1.35;color:${G};">${esc(teaser.charAt(0).toUpperCase() + teaser.slice(1))}</div>
          <a href="${esc(sky)}" style="display:inline-block;margin-top:14px;padding:12px 20px;background:${G};color:#0d0d0d;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;">Turn your key &rsaquo;</a>
        </td></tr></table>
      </td></tr>` : ""}
      ${message ? `<tr><td style="padding:0 0 14px;"><div style="padding:14px;background:#0e1128;border:1px solid #232849;border-radius:12px;"><div style="font-family:${mono};font-size:11px;letter-spacing:.12em;color:#7e83b8;">FROM THE HOST</div><div style="margin-top:6px;font-size:15px;line-height:1.45;white-space:pre-line;">${esc(message)}</div></div></td></tr>` : ""}
      <tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e1128;border:1px solid #232849;border-radius:12px;">
          ${rows.map(([k, v], i) => `<tr><td style="padding:10px 14px;${i ? "border-top:1px solid #1c2042;" : ""}font-family:${mono};font-size:11px;letter-spacing:.12em;color:#7e83b8;width:100px;vertical-align:top;">${k}</td><td style="padding:10px 14px;${i ? "border-top:1px solid #1c2042;" : ""}font-size:15px;">${esc(v)}</td></tr>`).join("")}
        </table>
      </td></tr>
      ${!unlock ? `<tr><td style="padding:0 0 6px;"><a href="${esc(sky)}" style="display:inline-block;padding:12px 20px;background:${G};color:#0d0d0d;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;">Open your key &rsaquo;</a>
        <a href="${esc(base)}" style="display:inline-block;margin-left:6px;padding:12px 16px;border:1px solid #232849;border-radius:12px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">Event page</a></td></tr>` : ""}
      <tr><td style="padding:22px 2px 0;font-size:12px;line-height:1.5;color:#7e83b8;">
        You're getting this because you RSVP'd to ${esc(title)} on Show Pilot. Your RSVP and key stay active either way.<br>
        <a href="${esc(stop)}" style="color:#b7bbe6;">Stop countdown emails</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  const text = [
    `${whenWord(d)} · ${title}`,
    "",
    unlock ? `Your key turned a notch. Something new is waiting in the sky: ${teaser}\n${sky}\n` : null,
    message ? `From the host:\n${message}\n` : null,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    unlock ? null : `Open your key: ${sky}`,
    `Event page: ${base}`,
    "",
    `Stop countdown emails: ${stop}`,
  ].filter((l) => l !== null).join("\n");

  return { subject, html, text, stop };
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: ok } = await admin.rpc("check_digest_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (ok !== true) return new Response("Forbidden", { status: 403 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FAN_EMAIL_FROM");
  if (!resendKey || !from) return new Response(JSON.stringify({ error: "Email isn't set up" }), { status: 500 });

  const { data, error } = await admin.rpc("fan_countdown_due");
  if (error) { console.error(error); return new Response(JSON.stringify({ error: "due failed" }), { status: 500 }); }

  const due = (Array.isArray(data) ? data : []) as Due[];
  const site = siteUrl();
  let sent = 0, failed = 0;

  for (const item of due) {
    const done: string[] = [];
    for (const fan of item.rsvps ?? []) {
      const { subject, html, text, stop } = buildCountdownEmail(site, item, fan);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          // One email per notch per RSVP, even if a run is retried.
          "Idempotency-Key": `fan-countdown-${item.show_id}-${item.notch.id}-${fan.rsvp_id}`,
        },
        body: JSON.stringify({ from, to: [fan.email], subject, html, text, headers: { "List-Unsubscribe": `<${stop}>` } }),
      });
      if (!res.ok) { failed++; console.error("Resend error", res.status, (await res.text()).slice(0, 300)); continue; }
      done.push(fan.rsvp_id);
      sent++;
      await new Promise((r) => setTimeout(r, 120)); // stay under Resend's rate limit
    }
    if (done.length) {
      const { error: markErr } = await admin.rpc("mark_countdown_sent", { p_show_id: item.show_id, p_notch: item.notch.id, p_rsvp_ids: done });
      if (markErr) console.error(markErr);
    }
  }

  return new Response(JSON.stringify({ notches: due.length, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
