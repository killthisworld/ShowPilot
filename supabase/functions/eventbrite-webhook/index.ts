// Supabase Edge Function: eventbrite-webhook
//
// Eventbrite calls this on every order.placed in a connected host's
// organization. We never trust the payload itself: it only tells us an order
// id. We then read that order from Eventbrite with the host's own token. That
// read is the proof the sale is real (and gives us the buyer's email). If the
// order's event is linked to a Show Pilot event, the buyer gets the one-time
// event-info email (same email as the fan page opt-in, once per address).
//
// The URL carries ?k=<webhook_secret>, a random value per connection that
// only Eventbrite (who we gave the URL to) knows. It tells us whose token to
// use, and an unknown or missing k is refused.
//
// Deploy: supabase functions deploy eventbrite-webhook --no-verify-jwt
// (Eventbrite can't send a Supabase login, so JWT checking must be off.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { eb, EventbriteError } from "../_shared/eventbrite.ts";
import { sendFanEventEmail } from "../_shared/fanEventEmail.ts";

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ORDER_URL_RE = /^https:\/\/www\.eventbriteapi\.com\/v3\/orders\/(\d+)\/?(\?.*)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const FOOTER =
  "You're getting this because you bought tickets for this show on Eventbrite. It's a one-time email with the event info. You haven't been added to any mailing list.";

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "Method not allowed" }, 405);

  const secret = new URL(req.url).searchParams.get("k") ?? "";
  if (secret.length < 32) return ok({ error: "Unknown webhook" }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const { data: conn } = await admin.from("eventbrite_connections")
      .select("owner_id, access_token").eq("webhook_secret", secret).maybeSingle();
    if (!conn) return ok({ error: "Unknown webhook" }, 401);

    const payload = await req.json().catch(() => ({}));
    const action = payload?.config?.action;
    if (action !== "order.placed") return ok({ ok: true, skipped: action ?? "no action" }); // e.g. Eventbrite's test ping

    const m = ORDER_URL_RE.exec(String(payload?.api_url ?? ""));
    if (!m) return ok({ ok: true, skipped: "not an order url" });
    const orderId = m[1];

    // Read the order ourselves, with the host's token.
    let order: { status?: string; email?: string; event_id?: string | number };
    try {
      order = await eb(conn.access_token, `/orders/${orderId}/`);
    } catch (e) {
      if (e instanceof EventbriteError && (e.status === 401 || e.status === 403 || e.status === 404)) {
        console.error("Order not readable with this connection", orderId, e.status);
        return ok({ ok: true, skipped: "order not readable" });
      }
      throw e; // anything else: 500 so Eventbrite retries
    }
    if (order.status !== "placed") return ok({ ok: true, skipped: `order ${order.status}` });
    const email = String(order.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return ok({ ok: true, skipped: "no buyer email" });

    const { data: links } = await admin.from("eventbrite_event_links")
      .select("show_id").eq("eb_event_id", String(order.event_id));
    if (!links?.length) return ok({ ok: true, skipped: "event not linked" });

    let retry = false;
    for (const l of links) {
      const { data: show } = await admin.from("shows").select("id, fan_token").eq("id", l.show_id).maybeSingle();
      if (!show?.fan_token) continue;
      const r = await sendFanEventEmail(admin, {
        showId: show.id,
        fanToken: show.fan_token,
        email,
        source: "eventbrite",
        ebOrderId: orderId,
        footer: FOOTER,
      });
      console.log("eventbrite order", orderId, "show", show.id, "->", r.status);
      if (r.status === "error") retry = true; // Resend hiccup: let Eventbrite retry; the idempotency key prevents doubles
    }
    return retry ? ok({ error: "Send failed, retry" }, 500) : ok();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return ok({ error: "Unexpected server error" }, 500);
  }
});
