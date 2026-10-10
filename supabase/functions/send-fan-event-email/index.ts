// Supabase Edge Function: send-fan-event-email
//
// Called from the public fan event page (/e/:token) when a fan ticks
// "Email me the event info". Sends ONE email per fan per event through Resend.
// The email itself is built and sent by ../_shared/fanEventEmail.ts, which the
// eventbrite-webhook function shares, so both paths send the same email.
//
// No login needed (fans don't have accounts), so:
//   - only what get_fan_event already shows publicly goes in the email
//   - each (event, email) is recorded once, so no address gets a second email
//   - new signups per event are capped in a short window
//
// Deploy: supabase functions deploy send-fan-event-email --no-verify-jwt
// Secrets: RESEND_API_KEY, FAN_EMAIL_FROM, APP_URL (see _shared/fanEventEmail.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFanEventEmail } from "../_shared/fanEventEmail.ts";

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

const STATUS_CODE: Record<string, number> = {
  page_off: 404, rate_limited: 429, not_configured: 500, error: 502,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!UUID_RE.test(token)) return json({ error: "Bad event link" }, 400);
    if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: "That email address doesn't look right" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: show, error: showErr } = await admin
      .from("shows").select("id").eq("fan_token", token).maybeSingle();
    if (showErr || !show) { if (showErr) console.error(showErr); return json({ error: "This event page isn't available" }, 404); }

    const r = await sendFanEventEmail(admin, {
      showId: show.id,
      fanToken: token,
      email,
      source: "fan_page",
      rateLimit: true,
      footer: "You asked for this on the event page. This is a one-time email about this show. Your address isn't added to any mailing list.",
    });
    if (!("error" in r)) return json({ ok: true, status: r.status });
    return json({ error: r.error }, STATUS_CODE[r.status] ?? 500);
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected server error" }, 500);
  }
});
