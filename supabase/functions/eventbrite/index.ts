// Supabase Edge Function: eventbrite
//
// Signed-in hosts use this to connect their Eventbrite account and link a
// Show Pilot event to an Eventbrite event, so real ticket buyers get the
// event-info email (sent by eventbrite-webhook). Tokens never reach the
// browser: they live in eventbrite_connections, which only this function and
// the webhook (service role) can read.
//
// POST { action, ... } with the user's session (verify_jwt on):
//   status      { show_id? }        -> { configured, connected, link }
//   start       { return_to }       -> { url }   (send the browser there)
//   finish      { code, state }     -> { return_to }
//   events      {}                  -> { events: [{ id, name, start, url, status }] }
//   link        { show_id, eb_event_id } -> { link }
//   unlink      { show_id }         -> { ok }
//   disconnect  {}                  -> { ok }
//
// Deploy: supabase functions deploy eventbrite
// Secrets: EVENTBRITE_CLIENT_ID, EVENTBRITE_CLIENT_SECRET, APP_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { eb, EB_AUTHORIZE, EB_TOKEN, ebConfig, EventbriteError, randomToken, webhookUrl } from "../_shared/eventbrite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STATE_TTL_MIN = 15;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sign in first" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });
    const cfg = ebConfig();
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    const getConnection = async () => {
      const { data } = await admin.from("eventbrite_connections").select("*").eq("owner_id", user.id).maybeSingle();
      return data as null | { access_token: string; organization_ids: string[]; webhook_secret: string; eb_user_id: string };
    };
    const ownsShow = async (showId: string) => {
      if (!UUID_RE.test(showId)) return false;
      const { data } = await admin.from("shows").select("owner_id").eq("id", showId).maybeSingle();
      return data?.owner_id === user.id;
    };

    // ---- status ----
    if (action === "status") {
      const conn = cfg.configured ? await getConnection() : null;
      let link = null;
      if (body?.show_id && (await ownsShow(String(body.show_id)))) {
        const { data } = await admin.from("eventbrite_event_links")
          .select("eb_event_id, eb_event_name, eb_event_url").eq("show_id", body.show_id).maybeSingle();
        link = data;
      }
      return json({ configured: cfg.configured, connected: !!conn, link });
    }

    if (!cfg.configured) return json({ error: "Eventbrite isn't set up on Show Pilot yet" }, 503);

    // ---- start: send the host to Eventbrite's consent screen ----
    if (action === "start") {
      const rt = String(body?.return_to ?? "/");
      const returnTo = rt.startsWith("/") && !rt.startsWith("//") ? rt.slice(0, 500) : "/";
      const cutoff = new Date(Date.now() - STATE_TTL_MIN * 60_000).toISOString();
      await admin.from("eventbrite_oauth_states").delete().eq("owner_id", user.id).lt("created_at", cutoff);
      const state = randomToken(24);
      const { error } = await admin.from("eventbrite_oauth_states").insert({ state, owner_id: user.id, return_to: returnTo });
      if (error) { console.error(error); return json({ error: "Couldn't start connecting" }, 500); }
      const p = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, state });
      return json({ url: `${EB_AUTHORIZE}?${p.toString()}` });
    }

    // ---- finish: Eventbrite sent the host back with a code ----
    if (action === "finish") {
      const code = String(body?.code ?? "");
      const state = String(body?.state ?? "");
      if (!code) return json({ error: "Missing code from Eventbrite" }, 400);
      const cutoff = new Date(Date.now() - STATE_TTL_MIN * 60_000).toISOString();
      // The state must be one this same user started in the last few minutes.
      const { data: st } = await admin.from("eventbrite_oauth_states")
        .select("state, return_to").eq("owner_id", user.id).eq("state", state).gte("created_at", cutoff).maybeSingle();
      if (!st) return json({ error: "That connect link expired. Start again from the fan page settings." }, 400);
      await admin.from("eventbrite_oauth_states").delete().eq("state", st.state);

      const tokRes = await fetch(EB_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code,
          redirect_uri: cfg.redirectUri,
        }),
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || !tok?.access_token) {
        console.error("Eventbrite token exchange failed", tokRes.status, JSON.stringify(tok).slice(0, 300));
        return json({ error: "Eventbrite didn't accept the connection. Try again." }, 502);
      }
      const accessToken = tok.access_token as string;

      const me = await eb(accessToken, "/users/me/");
      const orgs = await eb(accessToken, "/users/me/organizations/");
      const orgIds: string[] = (orgs?.organizations ?? []).map((o: { id: string }) => String(o.id));

      const existing = await getConnection();
      const secret = existing?.webhook_secret ?? randomToken(32);
      const { error: upErr } = await admin.from("eventbrite_connections").upsert({
        owner_id: user.id,
        eb_user_id: String(me.id),
        access_token: accessToken,
        organization_ids: orgIds,
        webhook_secret: secret,
        updated_at: new Date().toISOString(),
      });
      if (upErr) { console.error(upErr); return json({ error: "Couldn't save the connection" }, 500); }

      // One order.placed webhook per organization, pointing at our webhook
      // function with this connection's secret.
      for (const orgId of orgIds) {
        const { data: wh } = await admin.from("eventbrite_webhooks").select("owner_id").eq("organization_id", orgId).maybeSingle();
        if (wh) continue; // already registered (by this host earlier, or by a teammate in the same Eventbrite org)
        try {
          const created = await eb(accessToken, `/organizations/${orgId}/webhooks/`, {
            method: "POST",
            body: { endpoint_url: webhookUrl(secret), actions: "order.placed" },
          });
          await admin.from("eventbrite_webhooks").insert({ organization_id: orgId, owner_id: user.id, webhook_id: String(created.id) });
        } catch (e) {
          // The host may not be allowed to add webhooks to this org; carry on with the rest.
          console.error("Webhook create failed for org", orgId, e instanceof Error ? e.message : e);
        }
      }
      return json({ return_to: st.return_to || "/" });
    }

    const conn = await getConnection();
    if (!conn) return json({ error: "Connect Eventbrite first" }, 400);

    // ---- events: upcoming events the host can link ----
    if (action === "events") {
      const events: unknown[] = [];
      for (const orgId of conn.organization_ids) {
        const r = await eb(conn.access_token, `/organizations/${orgId}/events/?status=all&time_filter=current_future&order_by=start_asc&page_size=50`);
        for (const e of r?.events ?? []) {
          events.push({ id: String(e.id), name: e.name?.text ?? "Untitled event", start: e.start?.local ?? null, url: e.url ?? null, status: e.status ?? null });
        }
      }
      return json({ events });
    }

    // ---- link a Show Pilot event to an Eventbrite event ----
    if (action === "link") {
      const showId = String(body?.show_id ?? "");
      const ebEventId = String(body?.eb_event_id ?? "");
      if (!(await ownsShow(showId))) return json({ error: "Only the event owner can do that" }, 403);
      if (!/^\d+$/.test(ebEventId)) return json({ error: "Pick an Eventbrite event" }, 400);
      // A token can read other people's public events, so check it's the host's own.
      const ev = await eb(conn.access_token, `/events/${ebEventId}/`);
      if (!conn.organization_ids.includes(String(ev.organization_id))) {
        return json({ error: "That event isn't in your Eventbrite account" }, 403);
      }
      const link = { eb_event_id: ebEventId, eb_event_name: ev.name?.text ?? null, eb_event_url: ev.url ?? null };
      const { error } = await admin.from("eventbrite_event_links").upsert({ show_id: showId, owner_id: user.id, ...link });
      if (error) { console.error(error); return json({ error: "Couldn't save the link" }, 500); }
      return json({ link });
    }

    if (action === "unlink") {
      const showId = String(body?.show_id ?? "");
      if (!(await ownsShow(showId))) return json({ error: "Only the event owner can do that" }, 403);
      await admin.from("eventbrite_event_links").delete().eq("show_id", showId).eq("owner_id", user.id);
      return json({ ok: true });
    }

    // ---- disconnect: remove our webhooks and forget the token ----
    if (action === "disconnect") {
      const { data: hooks } = await admin.from("eventbrite_webhooks").select("organization_id, webhook_id").eq("owner_id", user.id);
      for (const h of hooks ?? []) {
        try { await eb(conn.access_token, `/webhooks/${h.webhook_id}/`, { method: "DELETE" }); }
        catch (e) { console.error("Webhook delete failed", h.webhook_id, e instanceof Error ? e.message : e); }
      }
      await admin.from("eventbrite_webhooks").delete().eq("owner_id", user.id);
      await admin.from("eventbrite_event_links").delete().eq("owner_id", user.id);
      await admin.from("eventbrite_connections").delete().eq("owner_id", user.id);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof EventbriteError) {
      console.error(e.message);
      if (e.status === 401) return json({ error: "Eventbrite signed you out. Reconnect Eventbrite." }, 401);
      return json({ error: "Eventbrite didn't respond as expected. Try again." }, 502);
    }
    console.error(e);
    return json({ error: "Unexpected server error" }, 500);
  }
});
