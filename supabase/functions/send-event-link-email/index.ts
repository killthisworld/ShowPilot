// send-event-link-email (job 183): the venue sends its event link to acts
// from inside Show Pilot.
//
// POST { show_id, to: string[], subject, body, key_code? } with the venue's session.
// key_code (job 190): send that act's own key instead of the event's link.
// - Only someone who can open the event's link builder (the venue side or
//   the event owner, checked with their own session through
//   get_event_link_admin) can send, and only once the link exists.
// - Each address gets its own email through Resend, From
//   "<Venue> via Show Pilot <EVENT_EMAIL_FROM>", Reply-To the venue, so
//   answers land in the venue's own inbox.
// - Guardrails: up to MAX_PER_SEND addresses a time, MAX_PER_DAY a day per
//   account, the same address on the same event at most once every
//   RESEND_GAP_MIN minutes, and never an address in email_suppressions.
// - Every attempt is logged in event_link_sends (sent / failed / skipped).
//
// Secrets: RESEND_API_KEY, EVENT_EMAIL_FROM (falls back to FAN_EMAIL_FROM),
// APP_URL (see _shared/fanEventEmail.ts siteUrl).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { esc, siteUrl } from "../_shared/fanEventEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const MAX_PER_SEND = 25;
const MAX_PER_DAY = 150;
const RESEND_GAP_MIN = 10;
const MAX_SUBJECT = 200;
const MAX_BODY = 8000;

// "Name <addr@x>" or "addr@x" -> "addr@x"
function bareAddress(v: string): string {
  const m = v.match(/<([^>]+)>/);
  return (m ? m[1] : v).trim();
}
// A display name that can't break the From header.
const cleanName = (v: unknown) => String(v ?? "").replace(/[\r\n<>"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

function buildHtml(body: string, link: string, venue: string): string {
  // The venue's own words, escaped; links in it become clickable.
  const paras = esc(body)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="background:#ffffff;border-radius:14px;padding:26px 24px;border:1px solid #e4e4e7;font-size:15px">
${paras}
<div style="margin:22px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#60A5FA;color:#0d0d0d;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Open the event link</a></div>
</div>
<p style="margin:16px 4px 0;font-size:12px;color:#71717a;line-height:1.5">Sent by ${esc(venue)} with Show Pilot. Reply to this email to reach them directly.</p>
</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromRaw = Deno.env.get("EVENT_EMAIL_FROM") || Deno.env.get("FAN_EMAIL_FROM") || "";
    const fromAddr = bareAddress(fromRaw);
    if (!resendKey || !EMAIL_RE.test(fromAddr)) return json({ error: "Email sending isn't set up yet." }, 503);

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sign in first." }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const input = await req.json().catch(() => ({}));
    const showId = String(input?.show_id ?? "");
    if (!UUID_RE.test(showId)) return json({ error: "Pick an event." }, 400);
    const subject = String(input?.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT);
    let body = String(input?.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!subject || !body) return json({ error: "Write a subject and a message." }, 400);
    if (body.length > MAX_BODY) return json({ error: "That message is too long." }, 400);

    const wanted: string[] = [...new Set<string>((Array.isArray(input?.to) ? input.to : []).map((e: unknown) => String(e ?? "").trim().toLowerCase()).filter(Boolean))];
    if (!wanted.length) return json({ error: "Add at least one email address." }, 400);
    if (wanted.length > MAX_PER_SEND) return json({ error: `Up to ${MAX_PER_SEND} addresses at a time.` }, 400);
    const bad = wanted.filter((e) => !EMAIL_RE.test(e));
    if (bad.length) return json({ error: `Check ${bad.length === 1 ? "this address" : "these addresses"}: ${bad.join(", ")}` }, 400);

    // Same permission as the link builder, asked with the sender's own session.
    const { data: adminView, error: avErr } = await userClient.rpc("get_event_link_admin", { p_show: showId });
    if (avErr) { console.error(avErr); return json({ error: "Couldn't check this event." }, 500); }
    if (!adminView?.can_view) return json({ error: "Only the venue side of this event can send its link." }, 403);
    const link = adminView.link;
    if (!link?.id || !link?.code) return json({ error: "Create the link first." }, 400);

    // Daily cap per account.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: today } = await admin.from("event_link_sends").select("id", { count: "exact", head: true })
      .eq("sent_by", user.id).eq("status", "sent").gte("created_at", since);
    if ((today ?? 0) + wanted.length > MAX_PER_DAY) {
      return json({ error: `That's more than ${MAX_PER_DAY} emails in a day. Try again tomorrow.` }, 429);
    }

    const { data: show } = await admin.from("shows").select("venue, event_name, band_name").eq("id", showId).maybeSingle();
    const { data: prefs } = await admin.from("user_preferences").select("display_name, contact_email").eq("user_id", user.id).maybeSingle();
    const venueName = cleanName(show?.venue) || cleanName(prefs?.display_name) || "The venue";
    const replyTo = [prefs?.contact_email, user.email].map((e) => String(e ?? "").trim()).find((e) => EMAIL_RE.test(e));

    // An act's own key, if one was picked (it must belong to this event's form).
    let code = link.code;
    let keyCode: string | null = null;
    if (input?.key_code) {
      const { data: key } = await admin.from("event_link_keys").select("code").eq("link_id", link.id).eq("code", String(input.key_code).trim().toUpperCase()).maybeSingle();
      if (!key) return json({ error: "That act's key isn't on this event any more." }, 400);
      code = key.code;
      keyCode = key.code;
    }
    const url = `${siteUrl()}/v/${code}`;
    // The link is always in the email, whatever the template says.
    if (!body.includes(`/v/${code}`)) body = `${body}\n\n${url}`;
    const html = buildHtml(body, url, venueName);
    const from = `${venueName} via Show Pilot <${fromAddr}>`;

    const { data: supp } = await admin.from("email_suppressions").select("email").in("email", wanted);
    const suppressed = new Set((supp ?? []).map((r: { email: string }) => r.email));
    const gapSince = new Date(Date.now() - RESEND_GAP_MIN * 60_000).toISOString();
    const { data: recent } = await admin.from("event_link_sends").select("to_email")
      .eq("show_id", showId).eq("status", "sent").in("to_email", wanted).gte("created_at", gapSince);
    const justSent = new Set((recent ?? []).map((r: { to_email: string }) => r.to_email));

    const result = { sent: [] as string[], skipped: [] as { email: string; why: string }[], failed: [] as string[] };
    for (const email of wanted) {
      const skipWhy = suppressed.has(email) ? "This address asked not to get emails (or bounced)." : justSent.has(email) ? "Sent a few minutes ago." : "";
      const { data: row, error: insErr } = await admin.from("event_link_sends").insert({
        link_id: link.id, show_id: showId, sent_by: user.id, to_email: email, subject, key_code: keyCode,
        status: skipWhy ? "skipped" : "queued", error: skipWhy || null,
      }).select("id").single();
      if (insErr) { console.error(insErr); result.failed.push(email); continue; }
      if (skipWhy) { result.skipped.push({ email, why: skipWhy }); continue; }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `event-link-${row.id}` },
        body: JSON.stringify({ from, to: [email], subject, text: body, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend error:", res.status, errText);
        await admin.from("event_link_sends").update({ status: "failed", error: `${res.status}: ${errText.slice(0, 300)}` }).eq("id", row.id);
        result.failed.push(email);
        continue;
      }
      const sent = await res.json().catch(() => ({}));
      await admin.from("event_link_sends").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: sent?.id ?? null }).eq("id", row.id);
      result.sent.push(email);
    }
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong sending the email." }, 500);
  }
});
