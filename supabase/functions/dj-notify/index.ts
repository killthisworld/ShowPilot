// dj-notify (job 469): emails a DJ about things they need to answer.
//
// POST { kind: "new_request", id }  with the x-cron-secret header.
// Called by the database (dj_notify_migration.sql) through pg_net when a
// promoter asks for a date on the DJ's press kit; the DJ gets an email with
// the request and a button to Bookings › Requests. (Lock-screen alerts are
// queued by the database itself and sent by send-push.)
//
// The email goes to the press kit's contact email, else the account email,
// unless that address has opted out (email_suppressions). One email per
// request (Resend idempotency key).
//
// Secrets: RESEND_API_KEY, EVENT_EMAIL_FROM (falls back to FAN_EMAIL_FROM), APP_URL.
// Deploy: verify_jwt OFF (the vault key is checked here, check_digest_secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { esc, siteUrl } from "../_shared/fanEventEmail.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const bareAddress = (v: string) => { const m = v.match(/<([^>]+)>/); return (m ? m[1] : v).trim(); };
const cleanName = (v: unknown) => String(v ?? "").replace(/[\r\n<>"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { data: ok } = await admin.rpc("check_digest_secret", { p_secret: req.headers.get("x-cron-secret") || "" });
    if (ok !== true) return json({ error: "Not allowed" }, 401);

    const input = await req.json().catch(() => ({}));
    if (input?.kind !== "new_request") return json({ error: "Unknown kind" }, 400);
    const id = String(input?.id ?? "");
    if (!UUID_RE.test(id)) return json({ error: "Bad id" }, 400);

    const { data: r } = await admin.from("dj_date_requests").select("*").eq("id", id).maybeSingle();
    if (!r) return json({ error: "Not found" }, 404);
    if (r.status !== "new") return json({ skipped: "already answered" });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddr = bareAddress(Deno.env.get("EVENT_EMAIL_FROM") || Deno.env.get("FAN_EMAIL_FROM") || "");
    if (!resendKey || !EMAIL_RE.test(fromAddr)) return json({ skipped: "email not set up" });

    // Where the DJ reads email: their press kit contact, else their account.
    const { data: kit } = await admin.from("dj_press_kits").select("template_id").eq("owner_id", r.owner_id).maybeSingle();
    const { data: tpl } = kit?.template_id ? await admin.from("saved_templates").select("name, data").eq("id", kit.template_id).maybeSingle() : { data: null };
    const { data: u } = await admin.auth.admin.getUserById(r.owner_id);
    const to = [tpl?.data?.contact_email, u?.user?.email].map((e) => String(e ?? "").trim().toLowerCase()).find((e) => EMAIL_RE.test(e)) || "";
    if (!to) return json({ skipped: "no address" });
    const { data: supp } = await admin.from("email_suppressions").select("email").eq("email", to).maybeSingle();
    if (supp) return json({ skipped: "opted out" });

    const who = cleanName(r.name) || "A promoter";
    const when = longDate(r.date);
    const link = `${siteUrl()}/dj/gigs?tab=requests`;
    const facts: [string, string][] = [
      ["Date", when], ["Event", r.event_name], ["Venue", [r.venue, r.city].filter(Boolean).join(", ")],
      ["Set", r.set_time], ["Email", r.email], ["Phone", r.phone],
    ];
    const rows = facts.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#71717a;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`).join("");
    const note = String(r.message || "").trim();
    const subject = `${who} wants to book you for ${when}`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:28px 20px"><div style="background:#fff;border-radius:14px;padding:26px 24px;border:1px solid #e4e4e7;font-size:15px">
<div style="display:inline-block;background:#FDE047;color:#0d0d0d;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px;margin-bottom:16px">New date request</div>
<p style="margin:0 0 14px;line-height:1.55"><b>${esc(who)}</b> asked for <b>${esc(when)}</b> on your press kit.</p>
${note ? `<p style="margin:0 0 16px;line-height:1.55;white-space:pre-line;padding:12px 14px;background:#f4f4f5;border-radius:10px">${esc(note.slice(0, 1500))}</p>` : ""}
<table style="margin:0 0 20px;font-size:14px;border-collapse:collapse">${rows}</table>
<a href="${esc(link)}" style="display:inline-block;background:#FDE047;color:#0d0d0d;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Accept, hold or decline</a>
</div><p style="margin:16px 4px 0;font-size:12px;color:#71717a">Sent by Show Pilot because someone used your press kit.</p></div></body></html>`;
    const text = `${who} asked for ${when} on your press kit.\n\n${note ? `${note}\n\n` : ""}${facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nAccept, hold or decline: ${link}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `dj-newreq-${r.id}` },
      body: JSON.stringify({
        from: `Show Pilot <${fromAddr}>`,
        to: [to],
        subject,
        text,
        html,
        ...(EMAIL_RE.test(String(r.email || "")) ? { reply_to: String(r.email).trim() } : {}),
      }),
    });
    if (!res.ok) {
      console.error("Resend error:", res.status, (await res.text()).slice(0, 300));
      return json({ error: "Email failed" }, 502);
    }
    return json({ emailed: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  }
});
