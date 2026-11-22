// dj-request-reply (job 465): a DJ answers a date request from their press kit.
//
// POST { request_id, action: "accept" | "hold" | "decline", message } with the DJ's session.
//   accept  -> the night becomes one of the DJ's events (shows row they own,
//              so it's on their Bookings > Gigs and green on the press kit
//              calendar), and the promoter gets a confirmation email.
//   hold    -> (job 466) the night shows orange on the press kit calendar
//              while they talk details; the promoter gets the DJ's note.
//   decline -> the promoter gets the DJ's message.
// Hold and accept open a chat (job 466): the promoter's email has a private
// link to it (/r/<chat_token>) and the DJ's note is its first message. A held
// request can still be accepted or declined.
// The email goes out through Resend From "<DJ> via Show Pilot <EVENT_EMAIL_FROM>"
// with Reply-To the DJ, so the promoter can answer the DJ directly. A
// request without an email (phone only) is still answered; the app tells the
// DJ to text them instead. Each request can be answered once.
//
// Secrets: RESEND_API_KEY, EVENT_EMAIL_FROM (falls back to FAN_EMAIL_FROM).
// Deploy: verify_jwt on.
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
const bareAddress = (v: string) => { const m = v.match(/<([^>]+)>/); return (m ? m[1] : v).trim(); };
const cleanName = (v: unknown) => String(v ?? "").replace(/[\r\n<>"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const randomToken = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join(""); };

function buildHtml(message: string, facts: [string, string][], dj: string, accepted: boolean, chatUrl = "", held = false): string {
  const paras = esc(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const rows = facts.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#71717a;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`).join("");
  const badge = accepted
    ? `<div style="display:inline-block;background:#8CFF3D;color:#0d0d0d;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px;margin-bottom:16px">Confirmed</div>`
    : held
      ? `<div style="display:inline-block;background:#FB923C;color:#0d0d0d;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px;margin-bottom:16px">On hold for you</div>`
      : "";
  const chat = chatUrl
    ? `<div style="margin:22px 0 4px"><a href="${esc(chatUrl)}" style="display:inline-block;background:#FDE047;color:#0d0d0d;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Chat with ${esc(dj)}</a></div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="background:#ffffff;border-radius:14px;padding:26px 24px;border:1px solid #e4e4e7;font-size:15px">
${badge}${paras}
${rows ? `<table style="margin-top:8px;font-size:14px;border-collapse:collapse">${rows}</table>` : ""}
${chat}
</div>
<p style="margin:16px 4px 0;font-size:12px;color:#71717a;line-height:1.5">Sent by ${esc(dj)} with Show Pilot. Reply to this email to reach them directly.</p>
</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sign in first." }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

    const input = await req.json().catch(() => ({}));
    const id = String(input?.request_id ?? "");
    const action = String(input?.action ?? "");
    const message = String(input?.message ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
    if (!UUID_RE.test(id)) return json({ error: "Pick a request." }, 400);
    if (!["accept", "hold", "decline"].includes(action)) return json({ error: "Accept, hold or decline." }, 400);
    if (action === "decline" && !message) return json({ error: "Write a short message for them." }, 400);

    const { data: r } = await admin.from("dj_date_requests").select("*").eq("id", id).maybeSingle();
    if (!r || r.owner_id !== user.id) return json({ error: "That request isn't yours." }, 404);
    if (r.status !== "new" && r.status !== "hold") return json({ error: "You've already answered this one." }, 409);
    if (action === "hold" && r.status === "hold") return json({ error: "It's already on hold." }, 409);

    // Who the DJ is: their press kit name and contact, else their account.
    const { data: kitLink } = await admin.from("dj_press_kits").select("template_id").eq("owner_id", user.id).maybeSingle();
    const { data: tpl } = kitLink?.template_id
      ? await admin.from("saved_templates").select("name, data").eq("id", kitLink.template_id).maybeSingle()
      : { data: null };
    const { data: prefs } = await admin.from("user_preferences").select("display_name, contact_email").eq("user_id", user.id).maybeSingle();
    const dj = cleanName(tpl?.name) || cleanName(prefs?.display_name) || "The DJ";
    const replyTo = [tpl?.data?.contact_email, prefs?.contact_email, user.email].map((e) => String(e ?? "").trim()).find((e) => EMAIL_RE.test(e));

    // Hold and accept open the chat (job 466).
    const chatToken = action === "decline" ? null : (r.chat_token || randomToken());
    const chatUrl = chatToken ? `${siteUrl()}/r/${chatToken}` : "";

    let showId: string | null = null;
    if (action === "accept") {
      const { data: show, error } = await admin.from("shows").insert({
        owner_id: user.id,
        event_name: (r.event_name || "").trim() || (r.venue ? `${dj} at ${r.venue}` : `${dj} booking`),
        band_name: dj,
        venue: r.venue || null,
        city: r.city || null,
        date: r.date,
        event_time: r.set_time || null,
        status: "not_started",
        included_sections: ["venue", "manager", "engineer"],
        manager_info: {
          made_with: "dj_request",
          ...(r.set_time ? { set_times: { [dj]: r.set_time } } : {}),
          requested_by: { name: r.name, email: r.email, phone: r.phone, message: r.message },
        },
      }).select("id").single();
      if (error) { console.error(error); return json({ error: "Couldn't add it to your gigs. Try again." }, 500); }
      showId = show.id;
    }

    // Email the promoter, when they left an address and haven't opted out.
    let emailed = false;
    const to = String(r.email || "").trim().toLowerCase();
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddr = bareAddress(Deno.env.get("EVENT_EMAIL_FROM") || Deno.env.get("FAN_EMAIL_FROM") || "");
    if (EMAIL_RE.test(to) && resendKey && EMAIL_RE.test(fromAddr)) {
      const { data: supp } = await admin.from("email_suppressions").select("email").eq("email", to).maybeSingle();
      if (!supp) {
        const when = longDate(r.date);
        const subject = action === "accept" ? `${dj} confirmed ${when}` : action === "hold" ? `${dj} is holding ${when} for you` : `${dj} can't make ${when}`;
        const text = message || (action === "accept" ? `Hi ${r.name}, I'm confirmed for ${when}. Looking forward to it!` : action === "hold" ? `Hi ${r.name}, I'm holding ${when} for you. Let's go over the details before I confirm.` : "");
        const facts: [string, string][] = [["Date", when], ["Event", r.event_name], ["Venue", [r.venue, r.city].filter(Boolean).join(", ")], ["Set", r.set_time]];
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `dj-request-${r.id}-${action}` },
          body: JSON.stringify({
            from: `${dj} via Show Pilot <${fromAddr}>`,
            to: [to],
            subject,
            text: `${text}\n\n${facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")}${chatUrl ? `\n\nChat with ${dj}: ${chatUrl}` : ""}`,
            html: buildHtml(text, facts, dj, action === "accept", chatUrl, action === "hold"),
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
        if (res.ok) emailed = true;
        else console.error("Resend error:", res.status, (await res.text()).slice(0, 300));
      }
    }

    const now = new Date().toISOString();
    const { error: upErr } = await admin.from("dj_date_requests").update({
      status: action === "accept" ? "accepted" : action === "hold" ? "hold" : "declined",
      ...(showId ? { show_id: showId } : {}),
      ...(chatToken ? { chat_token: chatToken } : {}),
      reply: message,
      replied_at: now,
      reply_emailed: emailed,
      updated_at: now,
      ...(chatToken && message ? { last_message_at: now, last_sender: "dj", dj_seen_at: now, promoter_notified_at: emailed ? now : null } : {}),
    }).eq("id", r.id);
    if (upErr) console.error(upErr);
    // The DJ's note opens the chat.
    if (chatToken && message) {
      const { error: mErr } = await admin.from("dj_request_messages").insert({ request_id: r.id, sender: "dj", body: message.slice(0, 2000) });
      if (mErr) console.error(mErr);
    }

    return json({ ok: true, emailed, show_id: showId, chat_url: chatUrl || null, phone: emailed ? null : (r.phone || null) });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
