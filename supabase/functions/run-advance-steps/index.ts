// run-advance-steps (job 185): sends the venue's scheduled advance steps.
//
// pg_cron calls this every 15 minutes with the x-cron-secret header
// (event_advance_schedule_migration.sql; same secret as fan-countdown,
// check_digest_secret). It takes the due steps (claim_due_advance_steps) and:
// - chat: posts the message in the event's Mgmt / Artist room, from the
//   venue person who scheduled it;
// - task: adds a task for Mgmt / Artist;
// - email: sends the event link email to the act's contacts on the event
//   (manager contact, and acts' own emails from the intake form), From
//   "<Venue> via Show Pilot", Reply-To the venue; logged in event_link_sends.
// "Only if they haven't finished the event link" steps are skipped once every
// act on the link has answered all the required questions.
//
// Secrets: RESEND_API_KEY, EVENT_EMAIL_FROM (falls back to FAN_EMAIL_FROM), APP_URL.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { siteUrl } from "../_shared/fanEventEmail.ts";
import { EMAIL_RE, bareAddress, buildHtml, cleanName, fillEmail } from "../_shared/eventLinkEmail.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

const fmtDay = (d: string | null) =>
  d ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : "";
const timeOf = (schedule: any[], re: RegExp) => (Array.isArray(schedule) ? schedule : []).find((r) => re.test(r?.label || ""))?.time || "";

// Same rules as src/lib/eventLink.js isAnswered.
function isAnswered(ask: any, answer: any): boolean {
  if (answer === undefined || answer === null) return false;
  if (ask.type === "file") return !!(answer && answer.url);
  if (ask.type === "yesno") return answer.value === "yes" || answer.value === "no";
  if (ask.type === "inputs") return (Array.isArray(answer.members) && answer.members.some((m: any) => has(m?.name))) || (answer.files || []).length > 0;
  return has(answer);
}

// Same fill-ins as src/lib/savedReplies.js, plus {link} and {missing}.
function fill(text: string, vals: Record<string, string>) {
  return String(text || "").replace(/\{([a-z_]+)\}/g, (m, k) => (has(vals[k]) ? vals[k] : m));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const { data: ok } = await admin.rpc("check_digest_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) return json({ error: "Not allowed" }, 401);

  const { data: due, error: claimErr } = await admin.rpc("claim_due_advance_steps");
  if (claimErr) { console.error(claimErr); return json({ error: "Couldn't load steps" }, 500); }
  const steps: any[] = Array.isArray(due) ? due : [];
  const done: Record<string, number> = { sent: 0, skipped: 0, failed: 0 };
  const finish = async (id: string, status: "sent" | "skipped" | "failed", result: string | null = null) => {
    done[status] += 1;
    await admin.from("event_advance_steps").update({ status, result, sent_at: status === "sent" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
  };

  for (const step of steps) {
    try {
      const { data: show } = await admin.from("shows")
        .select("id, event_name, band_name, venue, city, state, date, owner_id, venue_info, manager_info")
        .eq("id", step.show_id).maybeSingle();
      if (!show) { await finish(step.id, "skipped", "The event is gone."); continue; }
      const vi = show.venue_info || {};
      const { data: bands } = await admin.from("show_bands").select("band_name, submitter_email, sort_order").eq("show_id", show.id).order("sort_order");
      const { data: link } = await admin.from("event_links").select("id, code, asks").eq("show_id", show.id).maybeSingle();
      const { data: responses } = link
        ? await admin.from("event_link_responses").select("answers").eq("link_id", link.id)
        : { data: [] as any[] };
      const required = (link?.asks || []).filter((a: any) => a?.required);
      const rs: any[] = responses || [];
      const complete = !!link && rs.length > 0 && rs.every((r) => required.every((a: any) => isAnswered(a, r.answers?.[a.key])));
      if (step.only_if_incomplete && complete) { await finish(step.id, "skipped", "Every act has finished the event link."); continue; }

      const missing = !link || rs.length === 0
        ? "everything on the event link"
        : required.filter((a: any) => rs.some((r) => !isAnswered(a, r.answers?.[a.key]))).map((a: any) => String(a.label || "").toLowerCase()).join(", ");
      const url = link ? `${siteUrl()}/v/${link.code}` : "";
      const acts = (bands || []).map((b: any) => b.band_name).filter(has);
      const vals: Record<string, string> = {
        act: acts[0] || show.band_name || "",
        event: show.event_name || show.band_name || "",
        date: fmtDay(show.date),
        venue: show.venue || "",
        address: [vi.address, [show.city, show.state].filter(has).join(", ")].filter(has).join(", "),
        load_in: timeOf(vi.schedule, /load[\s-]?in/i),
        doors: timeOf(vi.schedule, /doors?/i),
        curfew: timeOf(vi.schedule, /curfew/i),
        parking: vi.parking || "",
        link: url,
        missing,
      };

      if (step.how === "chat") {
        await admin.from("conversations").upsert({ show_id: show.id, kind: "section_room", section: "manager" }, { onConflict: "show_id,kind,section", ignoreDuplicates: true });
        const { data: room } = await admin.from("conversations").select("id").eq("show_id", show.id).eq("kind", "section_room").eq("section", "manager").maybeSingle();
        if (!room) { await finish(step.id, "failed", "No Mgmt / Artist room."); continue; }
        const body = fill(step.body || step.title, vals).slice(0, 4000);
        if (!body.trim()) { await finish(step.id, "skipped", "The message is empty."); continue; }
        const { error } = await admin.from("messages").insert({ conversation_id: room.id, sender_id: step.created_by, body });
        if (error) { console.error(error); await finish(step.id, "failed", "Couldn't post the message."); continue; }
        await finish(step.id, "sent");
        continue;
      }

      if (step.how === "task") {
        const title = fill(step.title || step.body, vals).slice(0, 200).trim();
        if (!title) { await finish(step.id, "skipped", "The task has no title."); continue; }
        const { data: last } = await admin.from("gig_tasks").select("sort_order").eq("show_id", show.id).eq("section", "manager").order("sort_order", { ascending: false }).limit(1).maybeSingle();
        const { error } = await admin.from("gig_tasks").insert({
          show_id: show.id, section: "manager", title, details: step.body && step.title ? fill(step.body, vals).slice(0, 4000) : null,
          created_by: step.created_by, sort_order: (last?.sort_order ?? -1) + 1, due_date: show.date || null,
        });
        if (error) { console.error(error); await finish(step.id, "failed", "Couldn't add the task."); continue; }
        await finish(step.id, "sent");
        continue;
      }

      // email: the event link email to the act's contacts.
      if (!link) { await finish(step.id, "skipped", "The event link hasn't been made yet."); continue; }
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromAddr = bareAddress(Deno.env.get("EVENT_EMAIL_FROM") || Deno.env.get("FAN_EMAIL_FROM") || "");
      if (!resendKey || !EMAIL_RE.test(fromAddr)) { await finish(step.id, "failed", "Email sending isn't set up yet."); continue; }
      const to = [...new Set([show.manager_info?.contact_email, ...(bands || []).map((b: any) => b.submitter_email)]
        .map((e) => String(e || "").trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
      const { data: supp } = to.length ? await admin.from("email_suppressions").select("email").in("email", to) : { data: [] as any[] };
      const blocked = new Set((supp || []).map((r: any) => r.email));
      const recipients = to.filter((e) => !blocked.has(e)).slice(0, 10);
      if (!recipients.length) { await finish(step.id, "skipped", "No act email on the event."); continue; }

      const { data: prefs } = await admin.from("user_preferences").select("display_name, contact_email, event_link_email").eq("user_id", step.created_by).maybeSingle();
      const { data: who } = await admin.auth.admin.getUserById(step.created_by);
      const own = vi.event_link_email && (has(vi.event_link_email.subject) || has(vi.event_link_email.body)) ? vi.event_link_email : null;
      const email = fillEmail(own || prefs?.event_link_email || null, { ...vals, name: prefs?.display_name || "" });
      const venueName = cleanName(show.venue) || cleanName(prefs?.display_name) || "The venue";
      const replyTo = [prefs?.contact_email, who?.user?.email].map((e) => String(e ?? "").trim()).find((e) => EMAIL_RE.test(e));
      const html = buildHtml(email.body, url, venueName);
      let sentN = 0;
      for (const addr of recipients) {
        const { data: row } = await admin.from("event_link_sends").insert({
          link_id: link.id, show_id: show.id, sent_by: step.created_by, to_email: addr, subject: email.subject, status: "queued",
        }).select("id").single();
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `advance-${step.id}-${addr}` },
          body: JSON.stringify({ from: `${venueName} via Show Pilot <${fromAddr}>`, to: [addr], subject: email.subject, text: email.body, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
        });
        if (res.ok) {
          sentN += 1;
          const out = await res.json().catch(() => ({}));
          if (row) await admin.from("event_link_sends").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: out?.id ?? null }).eq("id", row.id);
        } else {
          const errText = await res.text();
          console.error("Resend error:", res.status, errText);
          if (row) await admin.from("event_link_sends").update({ status: "failed", error: `${res.status}: ${errText.slice(0, 300)}` }).eq("id", row.id);
        }
      }
      if (sentN) await finish(step.id, "sent", `Emailed ${sentN} of ${recipients.length}.`);
      else await finish(step.id, "failed", "The email didn't send.");
    } catch (e) {
      console.error(e);
      await finish(step.id, "failed", "Something went wrong.");
    }
  }
  return json({ ...done, total: steps.length });
});
