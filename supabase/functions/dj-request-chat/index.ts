// dj-request-chat (job 466): a message in the chat between a DJ and the
// promoter who asked for a date (held or confirmed requests only).
//
// POST { token, body }       the promoter, from their private link (no account)
// POST { request_id, body }  the DJ, with their session
// -> { message }
// The other side gets an email about it, at most once every NOTIFY_GAP_MIN
// minutes per chat and only if they haven't looked at it since. The DJ's email
// links to their Chats; the promoter's to their private link.
//
// Secrets: RESEND_API_KEY, EVENT_EMAIL_FROM (falls back to FAN_EMAIL_FROM), APP_URL.
// Deploy: verify_jwt OFF (promoters have no account; the token or the DJ's
// session is checked here).
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
const NOTIFY_GAP_MIN = 30;
const MAX_PER_DAY = 120; // per chat, per side
const bareAddress = (v: string) => { const m = v.match(/<([^>]+)>/); return (m ? m[1] : v).trim(); };
const cleanName = (v: unknown) => String(v ?? "").replace(/[\r\n<>"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const input = await req.json().catch(() => ({}));
    const body = String(input?.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!body) return json({ error: "Write a message." }, 400);
    if (body.length > 2000) return json({ error: "That message is too long." }, 400);

    let r: Record<string, any> | null = null;
    let sender: "dj" | "promoter";
    const token = String(input?.token ?? "");
    if (token) {
      if (token.length < 24) return json({ error: "This chat link isn't right." }, 404);
      const { data } = await admin.from("dj_date_requests").select("*").eq("chat_token", token).maybeSingle();
      r = data;
      sender = "promoter";
    } else {
      const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Sign in first." }, 401);
      const id = String(input?.request_id ?? "");
      if (!UUID_RE.test(id)) return json({ error: "Pick a chat." }, 400);
      const { data } = await admin.from("dj_date_requests").select("*").eq("id", id).maybeSingle();
      r = data && data.owner_id === user.id ? data : null;
      sender = "dj";
    }
    if (!r) return json({ error: "This chat isn't available." }, 404);
    if (r.status !== "hold" && r.status !== "accepted") return json({ error: "This chat is closed." }, 409);

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await admin.from("dj_request_messages").select("id", { count: "exact", head: true })
      .eq("request_id", r.id).eq("sender", sender).gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_DAY) return json({ error: "That's a lot of messages today. Try again tomorrow." }, 429);

    const { data: msg, error } = await admin.from("dj_request_messages").insert({ request_id: r.id, sender, body })
      .select("id, sender, body, created_at").single();
    if (error) { console.error(error); return json({ error: "Couldn't send it. Try again." }, 500); }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { last_message_at: now, last_sender: sender, ...(sender === "dj" ? { dj_seen_at: now } : { promoter_seen_at: now }) };

    // Let the other side know, now and then.
    const other = sender === "dj" ? "promoter" : "dj";
    const seen = r[`${other}_seen_at`] ? Date.parse(r[`${other}_seen_at`]) : 0;
    const notified = r[`${other}_notified_at`] ? Date.parse(r[`${other}_notified_at`]) : 0;
    const quiet = Date.now() - notified > NOTIFY_GAP_MIN * 60_000 || seen > notified;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddr = bareAddress(Deno.env.get("EVENT_EMAIL_FROM") || Deno.env.get("FAN_EMAIL_FROM") || "");
    if (quiet && resendKey && EMAIL_RE.test(fromAddr)) {
      const { data: kit } = await admin.from("dj_press_kits").select("template_id").eq("owner_id", r.owner_id).maybeSingle();
      const { data: tpl } = kit?.template_id ? await admin.from("saved_templates").select("name, data").eq("id", kit.template_id).maybeSingle() : { data: null };
      const dj = cleanName(tpl?.name) || "The DJ";
      let to = "";
      let link = "";
      let fromName = "";
      if (other === "promoter") {
        to = String(r.email || "").trim().toLowerCase();
        link = `${siteUrl()}/r/${r.chat_token}`;
        fromName = `${dj} via Show Pilot`;
      } else {
        const { data: u } = await admin.auth.admin.getUserById(r.owner_id);
        to = [tpl?.data?.contact_email, u?.user?.email].map((e) => String(e ?? "").trim().toLowerCase()).find((e) => EMAIL_RE.test(e)) || "";
        link = `${siteUrl()}/?view=chats&thread=${r.id}`;
        fromName = `${cleanName(r.name) || "A promoter"} via Show Pilot`;
      }
      if (EMAIL_RE.test(to)) {
        const { data: supp } = await admin.from("email_suppressions").select("email").eq("email", to).maybeSingle();
        if (!supp) {
          const who = sender === "dj" ? dj : cleanName(r.name) || "The promoter";
          const about = [r.event_name, longDate(r.date)].filter(Boolean).join(", ");
          const subject = `New message from ${who} about ${about}`;
          const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:28px 20px"><div style="background:#fff;border-radius:14px;padding:26px 24px;border:1px solid #e4e4e7;font-size:15px">
<p style="margin:0 0 6px;color:#71717a;font-size:13px">${esc(who)} wrote:</p>
<p style="margin:0 0 18px;line-height:1.55;white-space:pre-line">${esc(body)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#FDE047;color:#0d0d0d;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Open the chat</a>
</div><p style="margin:16px 4px 0;font-size:12px;color:#71717a">About ${esc(about)}. Sent with Show Pilot.</p></div></body></html>`;
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `dj-chat-${msg.id}` },
            body: JSON.stringify({ from: `${fromName} <${fromAddr}>`, to: [to], subject, text: `${who} wrote:\n\n${body}\n\nOpen the chat: ${link}`, html }),
          });
          if (res.ok) patch[`${other}_notified_at`] = now;
          else console.error("Resend error:", res.status, (await res.text()).slice(0, 300));
        }
      }
    }
    const { error: upErr } = await admin.from("dj_date_requests").update(patch).eq("id", r.id);
    if (upErr) console.error(upErr);
    return json({ message: { id: msg.id, sender: msg.sender, body: msg.body, at: msg.created_at } });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
