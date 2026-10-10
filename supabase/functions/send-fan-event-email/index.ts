// Supabase Edge Function: send-fan-event-email
//
// Called from the public fan event page (/e/:token) in two cases:
//   - ticket-link events: a fan ticks "Email me the event info"
//   - RSVP events (fan_page.entry = 'rsvp', pay at the door): a fan RSVPs with
//     name, email and party size. The RSVP is saved in fan_rsvps (RSVPing
//     again with the same email updates it) and the fan is emailed the info.
// Either way each fan gets ONE email per event through Resend.
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

const RSVP_WINDOW_MIN = 10;
const RSVP_MAX = 60; // new RSVPs per event per window

// deno-lint-ignore no-explicit-any
async function rsvp(admin: any, showId: string, token: string, email: string, body: any) {
  const name = String(body?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const guests = Number(body?.guests ?? 1);
  if (!name) return json({ error: "Add your name so the door has you on the list" }, 400);
  if (!Number.isInteger(guests) || guests < 1 || guests > 10) return json({ error: "Party size must be between 1 and 10" }, 400);

  const now = new Date().toISOString();
  const { data: existing } = await admin.from("fan_rsvps").select("id").eq("show_id", showId).eq("email", email).maybeSingle();
  let status: "rsvp_new" | "rsvp_updated" = "rsvp_updated";
  if (existing) {
    await admin.from("fan_rsvps").update({ name, guests, updated_at: now }).eq("id", existing.id);
  } else {
    const since = new Date(Date.now() - RSVP_WINDOW_MIN * 60_000).toISOString();
    const { count } = await admin.from("fan_rsvps").select("id", { count: "exact", head: true })
      .eq("show_id", showId).gte("created_at", since);
    if ((count ?? 0) >= RSVP_MAX) return json({ error: "Lots of RSVPs right now. Try again in a few minutes." }, 429);
    const { error: insErr } = await admin.from("fan_rsvps").insert({ show_id: showId, name, email, guests });
    if (insErr && insErr.code === "23505") {
      await admin.from("fan_rsvps").update({ name, guests, updated_at: now }).eq("show_id", showId).eq("email", email);
    } else if (insErr) {
      console.error(insErr);
      return json({ error: "Couldn't save your RSVP. Try again." }, 500);
    } else {
      status = "rsvp_new";
    }
  }

  // This fan's sky key (for the email link and the "See the sky" button), and
  // the host's RSVP email settings. Read with the service role so the RSVP
  // message never appears on the public fan page.
  const { data: mine } = await admin.from("fan_rsvps").select("sky_key").eq("show_id", showId).eq("email", email).maybeSingle();
  const { data: showRow } = await admin.from("shows").select("fan_page").eq("id", showId).maybeSingle();
  const cfg = showRow?.fan_page ?? {};
  const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/+$/, "");
  const skyKey = mine?.sky_key as string | undefined;

  // The RSVP is saved either way; the email is a bonus that shouldn't lose it.
  const r = await sendFanEventEmail(admin, {
    showId,
    fanToken: token,
    email,
    source: "rsvp",
    footer: "You RSVP'd on the event page, and you pay at the door. This is a one-time email about this show. The host can see your RSVP; you haven't been added to any mailing list.",
    extras: {
      subjectPrefix: "You're on the list: ",
      subjectOverride: typeof cfg.email_subject === "string" ? cfg.email_subject : undefined,
      hostMessage: typeof cfg.rsvp_message === "string" && cfg.rsvp_message.trim() ? cfg.rsvp_message.trim().slice(0, 2000) : undefined,
      keyLink: appUrl && skyKey ? `${appUrl}/e/${token}/sky?k=${skyKey}` : undefined,
      topRows: [["RSVP", `${name} · ${guests} ${guests === 1 ? "person" : "people"}`]],
    },
  });
  return json({ ok: true, status, emailed: r.status === "sent", already_emailed: r.status === "already_sent", sky_key: skyKey ?? null });
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: show, error: showErr } = await admin
      .from("shows").select("id").eq("fan_token", token).maybeSingle();
    if (showErr || !show) { if (showErr) console.error(showErr); return json({ error: "This event page isn't available" }, 404); }

    // RSVP events: save the RSVP, then email (once).
    const { data: ev, error: evErr } = await admin.rpc("get_fan_event", { p_token: token });
    if (evErr) { console.error(evErr); return json({ error: "Couldn't load the event" }, 500); }
    if (!ev) return json({ error: "This event page isn't available" }, 404);
    if (ev.rsvp) return await rsvp(admin, show.id, token, email, body);

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
