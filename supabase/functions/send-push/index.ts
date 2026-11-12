// Lock-screen alerts (job 305, round 1).
//
// Called every minute by pg_cron (supabase/push_migration.sql), only when
// alerts are waiting, with the x-cron-secret header. Asks the database what's
// waiting (push_due), sends each alert to each of that person's phones with
// the VAPID key, then reports back (mark_push_done): what went out, what
// failed (tried again next minute, up to 5 times) and which phones are gone
// (404 / 410 from the push service, removed).
//
// Deploy with JWT verification off; the vault key guards it
// (check_digest_secret):
//   supabase functions deploy send-push --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a URL or
// mailto: the push services can reach Show Pilot at).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Sub = { endpoint: string; p256dh: string; auth: string };
type Due = { id: string; title: string; body: string; url: string; tag: string | null; subs: Sub[] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: ok } = await db.rpc("check_digest_secret", { p_secret: req.headers.get("x-cron-secret") || "" });
  if (ok !== true) return json({ error: "Not allowed" }, 401);

  const pub = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("VAPID_SUBJECT") || "https://show-pilot.vercel.app";
  if (!pub || !priv) return json({ error: "VAPID keys not set" }, 500);
  webpush.setVapidDetails(subject, pub, priv);

  const { data, error } = await db.rpc("push_due", { p_limit: 200 });
  if (error) return json({ error: error.message }, 500);
  const due = (data || []) as Due[];

  const sent: string[] = [];
  const failed: string[] = [];
  const gone = new Set<string>();
  await Promise.all(due.map(async (d) => {
    if (!d.subs?.length) { sent.push(d.id); return; } // alerts turned off since: nothing to send
    const payload = JSON.stringify({ title: d.title, body: d.body, url: d.url, tag: d.tag });
    let anyOk = false;
    let anyRetry = false;
    await Promise.all(d.subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "high", topic: d.tag ? d.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined });
        anyOk = true;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) gone.add(s.endpoint);
        else { anyRetry = true; console.error("push failed", code, e?.body || e?.message); }
      }
    }));
    if (anyOk || !anyRetry) sent.push(d.id); else failed.push(d.id);
  }));

  const { error: markErr } = await db.rpc("mark_push_done", { p_sent: sent, p_failed: failed, p_gone: [...gone] });
  if (markErr) return json({ error: markErr.message }, 500);
  return json({ sent: sent.length, failed: failed.length, gone: gone.size });
});
