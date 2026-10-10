// Supabase Edge Function: dj-drive
//
// Signed-in DJs use this to connect their own Google Drive, so the WAV sets
// artists send land straight in the DJ's Drive (Show Pilot never stores the
// audio). The refresh token never reaches the browser: it lives in
// dj_drive_connections, which only the edge functions (service role) can read.
//
// POST { action, ... } with the user's session (verify_jwt on):
//   status      {}                 -> { configured, connected, email, folder_url }
//   start       { return_to }      -> { url }   (send the browser there)
//   finish      { code, state }    -> { return_to, email }
//   disconnect  {}                 -> { ok }    (files already in Drive stay there)
//   check       {}                 -> { ok, reason? }  (is the saved connection still working)
//
// Deploy: supabase functions deploy dj-drive
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  accessTokenFor, createFolder, folderAlive, folderLink, G_AUTHORIZE, G_REVOKE, G_TOKEN, G_USERINFO,
  GoogleError, googleConfig, randomToken, SCOPES,
} from "../_shared/googleDrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STATE_TTL_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sign in first" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });
    const cfg = googleConfig();
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    const getConnection = async () => {
      const { data } = await admin.from("dj_drive_connections").select("*").eq("owner_id", user.id).maybeSingle();
      return data as null | { refresh_token: string; account_email: string | null; root_folder_id: string | null };
    };

    if (action === "status") {
      const conn = cfg.configured ? await getConnection() : null;
      return json({
        configured: cfg.configured,
        connected: !!conn,
        email: conn?.account_email ?? null,
        folder_url: conn?.root_folder_id ? folderLink(conn.root_folder_id) : null,
      });
    }

    if (!cfg.configured) return json({ error: "Google Drive isn't set up on Show Pilot yet" }, 503);

    // ---- start: send the DJ to Google's consent screen ----
    if (action === "start") {
      const rt = String(body?.return_to ?? "/dj");
      const returnTo = rt.startsWith("/") && !rt.startsWith("//") ? rt.slice(0, 500) : "/dj";
      const cutoff = new Date(Date.now() - STATE_TTL_MIN * 60_000).toISOString();
      await admin.from("dj_oauth_states").delete().eq("owner_id", user.id).lt("created_at", cutoff);
      const state = randomToken(24);
      const { error } = await admin.from("dj_oauth_states").insert({ state, owner_id: user.id, return_to: returnTo });
      if (error) { console.error(error); return json({ error: "Couldn't start connecting" }, 500); }
      const p = new URLSearchParams({
        response_type: "code",
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        scope: SCOPES,
        access_type: "offline",   // we need a refresh token: artists upload long after the DJ connects
        prompt: "consent",        // always return a refresh token, even on a reconnect
        include_granted_scopes: "true",
        state,
      });
      return json({ url: `${G_AUTHORIZE}?${p.toString()}` });
    }

    // ---- finish: Google sent the DJ back with a code ----
    if (action === "finish") {
      const code = String(body?.code ?? "");
      const state = String(body?.state ?? "");
      if (!code) return json({ error: "Google didn't send a connection code" }, 400);
      const cutoff = new Date(Date.now() - STATE_TTL_MIN * 60_000).toISOString();
      const { data: st } = await admin.from("dj_oauth_states")
        .select("state, return_to").eq("owner_id", user.id).eq("state", state).gte("created_at", cutoff).maybeSingle();
      if (!st) return json({ error: "That connect link expired. Start again from DJ Tools." }, 400);
      await admin.from("dj_oauth_states").delete().eq("state", st.state);

      const tokRes = await fetch(G_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
        }),
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || !tok?.access_token) {
        console.error("Google token exchange failed", tokRes.status, JSON.stringify(tok).slice(0, 300));
        return json({ error: "Google didn't accept the connection. Try again." }, 502);
      }
      const granted = String(tok.scope ?? "");
      if (!granted.includes("drive.file")) {
        return json({ error: "Show Pilot needs permission to add files to your Drive. Connect again and leave that box ticked." }, 400);
      }

      const existing = await getConnection();
      const refreshToken: string | undefined = tok.refresh_token ?? existing?.refresh_token;
      if (!refreshToken) return json({ error: "Google didn't give Show Pilot lasting access. Try connecting again." }, 502);

      let email: string | null = null;
      try {
        const ui = await fetch(G_USERINFO, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
        email = ui?.email ?? null;
      } catch { /* the email is only for display */ }

      // One "Show Pilot" folder at the top of their Drive holds every event.
      let rootId = existing?.root_folder_id ?? null;
      if (!(await folderAlive(tok.access_token, rootId))) rootId = await createFolder(tok.access_token, "Show Pilot");

      const { error: upErr } = await admin.from("dj_drive_connections").upsert({
        owner_id: user.id,
        provider: "google",
        account_email: email,
        refresh_token: refreshToken,
        root_folder_id: rootId,
        updated_at: new Date().toISOString(),
      });
      if (upErr) { console.error(upErr); return json({ error: "Couldn't save the connection" }, 500); }
      return json({ return_to: st.return_to || "/dj", email });
    }

    // ---- disconnect: forget the token (and revoke it at Google) ----
    if (action === "disconnect") {
      const conn = await getConnection();
      if (conn) {
        try { await fetch(`${G_REVOKE}?token=${encodeURIComponent(conn.refresh_token)}`, { method: "POST" }); }
        catch (e) { console.error("Revoke failed", e instanceof Error ? e.message : e); }
        await admin.from("dj_drive_connections").delete().eq("owner_id", user.id);
      }
      return json({ ok: true });
    }

    // ---- check: is the saved connection still working? ----
    if (action === "check") {
      const conn = await getConnection();
      if (!conn) return json({ ok: false, reason: "not_connected" });
      try { await accessTokenFor(conn.refresh_token); return json({ ok: true }); }
      catch { return json({ ok: false, reason: "expired" }); }
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof GoogleError) {
      console.error(e.message);
      return json({ error: "Google Drive didn't respond as expected. Try again." }, 502);
    }
    console.error(e);
    return json({ error: "Unexpected server error" }, 500);
  }
});
