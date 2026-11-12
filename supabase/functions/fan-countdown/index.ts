// Fan countdown emails (job 78).
//
// Called every hour by pg_cron (see supabase/fan_countdown_migration.sql)
// with the x-cron-secret header. Asks the database which notches are due
// (fan_countdown_due: opened at 10 AM Eastern on their day, within the last
// 36 hours) and which RSVPs haven't had them, emails each fan through Resend
// and records the send so nobody gets a notch twice.
//
// Deploy with JWT verification off; the vault key guards it
// (check_digest_secret). Secrets: RESEND_API_KEY, FAN_EMAIL_FROM, APP_URL.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const DEFAULT_SITE = "https://show-pilot.vercel.app";
function siteUrl(): string {
  const fromEnv = (Deno.env.get("APP_URL") || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/i.test(fromEnv) ? fromEnv : DEFAULT_SITE;
}

type NotchFile = { path: string; name?: string; type?: string; size?: number };
type Notch = {
  id: string; days_before: number | string; type?: string; subject?: string; message?: string;
  kind?: string; title?: string; film?: boolean; files?: NotchFile[];
};
// What a notch's own files become (job 308): pictures shown in the email
// (private links), documents attached.
type Media = { pictures: string[]; attachments: { filename: string; content: string }[] };
const NO_MEDIA: Media = { pictures: [], attachments: [] };
type Ev = {
  event_name?: string; band_name?: string; date: string; door_time?: string; show_time?: string;
  venue?: string; address?: string; city?: string; state?: string; flyer_url?: string; door_price?: string;
};
type Rsvp = { rsvp_id: string; email: string; name: string | null; sky_key: string };
type Due = { show_id: string; fan_token: string; fan_slug: string | null; notch: Notch; event: Ev; rsvps: Rsvp[] | null };

const mono = "'SFMono-Regular',Menlo,Consolas,monospace";
const G = "#8CFF3D";
export const KIND_LABEL: Record<string, string> = {
  note: "a note from the artist", setlist: "a setlist tease", playlist: "the pre-show playlist",
  bts: "a behind-the-scenes look", doors: "doors & parking", merch: "a first look at the merch",
};

// Hype meter levels, 1 to 5 (job 234).
const HYPE: [string, string][] = [["👀", "CURIOUS"], ["🙂", "READY"], ["🔥", "HYPED"], ["🚀", "SO HYPED"], ["🤯", "LOSING IT"]];
const titleOf = (ev: Ev) => ev.event_name || ev.band_name || "the show";
const dateLong = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const whenWord = (d: number) => (d === 0 ? "Tonight" : d === 1 ? "Tomorrow" : d < 7 ? `${d} days to go` : d === 7 ? "One week to go" : d === 14 ? "Two weeks to go" : `${d} days to go`);

export function buildCountdownEmail(site: string, due: Due, fan: Rsvp, media: Media = NO_MEDIA) {
  const ev = due.event;
  const n = due.notch;
  // Below zero = after the show (job 244): -1 the day after, and so on.
  const raw = Number(n.days_before) || 0;
  const after = raw < 0;
  const d = Math.max(0, raw);
  const film = after && n.film === true;
  const unlock = n.type === "unlock" && !after;
  const title = titleOf(ev);
  const base = `${site}${due.fan_slug ? `/${due.fan_slug}` : `/rsvp/${due.fan_token}`}`;
  const sky = `${base}/sky?k=${encodeURIComponent(fan.sky_key)}`;
  const stop = `${site}/fan/unsubscribe?countdown=${encodeURIComponent(fan.sky_key)}`;
  const custom = String(n.subject || "").trim().slice(0, 150);
  const eyebrow = after ? (film ? "AFTER THE SHOW · STELLAR BIRTH" : "AFTER THE SHOW") : `${whenWord(d).toUpperCase()} · COUNTDOWN`;
  const subject = custom || (after
    ? (film ? `Stellar Birth: your night at ${title}` : `Thanks for coming: ${title}`)
    : unlock
    ? `A notch just turned: ${title}`
    : d === 0 ? `Tonight: ${title}` : d === 1 ? `Tomorrow: ${title}` : `${whenWord(d)}: ${title}`);
  const watch = `${sky}&film=1`;
  const message = String(n.message || "").trim();
  const place = [ev.city, ev.state].filter(Boolean).join(", ");
  const rows: [string, string][] = [];
  rows.push(["DATE", dateLong(ev.date)]);
  if (!after && ev.door_time) rows.push(["DOORS", ev.door_time]);
  if (!after && ev.show_time) rows.push(["SHOW", ev.show_time]);
  if (ev.venue) rows.push(["VENUE", ev.venue]);
  if (!after && (ev.address || place)) rows.push(["ADDRESS", [ev.address, place].filter(Boolean).join(", ")]);
  if (!after && ev.door_price) rows.push(["AT THE DOOR", ev.door_price]);
  if (media.attachments.length) rows.push(["ATTACHED", media.attachments.map((a) => a.filename).join(", ")]);
  // Hype meter (job 234): one tap opens the fan's sky and records the answer.
  const hypeLink = (lvl: number) => `${sky}&hype=${encodeURIComponent(n.id)}.${lvl}`;
  const postLink = `${sky}&post=1`;
  // Info or questions go to the host inside Show Pilot, per event (job 235).
  const askLink = `${sky}&ask=1`;
  const hypeCells = HYPE.map(([emoji, label], i) => `<td align="center" style="padding:0 3px;"><a href="${esc(hypeLink(i + 1))}" style="display:block;padding:10px 2px 8px;background:#0b0e24;border:1px solid #2b2f5a;border-radius:12px;color:#fff;text-decoration:none;"><span style="display:block;font-size:24px;line-height:1.1;">${emoji}</span><span style="display:block;margin-top:4px;font-family:${mono};font-size:9px;letter-spacing:.02em;white-space:nowrap;color:#b7bbe6;">${label}</span></a></td>`).join("");
  const teaser = unlock ? (n.title?.trim() || KIND_LABEL[n.kind || ""] || "something new") : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#05060f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05060f;"><tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;">
      <tr><td style="padding:0 2px 14px;">
        <div style="font-family:${mono};font-size:11px;letter-spacing:.16em;color:${film ? "#FFB347" : G};">${esc(eyebrow)}</div>
        <div style="margin-top:8px;font-size:30px;font-weight:700;line-height:1.08;">${esc(title)}</div>
        ${ev.band_name && ev.event_name && ev.band_name !== ev.event_name ? `<div style="margin-top:2px;font-size:17px;color:#d6d8f5;font-weight:600;">${esc(ev.band_name)}</div>` : ""}
      </td></tr>
      ${film ? `<tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0e24;border:1px solid #5a3f1c;border-radius:16px;"><tr><td style="padding:18px;">
          <div style="font-family:${mono};font-size:11px;letter-spacing:.14em;color:#FFB347;">STELLAR BIRTH</div>
          <div style="margin-top:8px;font-size:20px;font-weight:700;line-height:1.3;">${esc(fan.name ? `${fan.name}, every` : "Every")} star from the night came together.</div>
          <div style="margin-top:6px;font-size:15px;line-height:1.5;color:#d6d8f5;">Watch them pull together into one sun, then save the video to keep.</div>
          <a href="${esc(watch)}" style="display:inline-block;margin-top:14px;padding:12px 20px;background:#FFB347;color:#1a0d00;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;">Watch Stellar Birth &rsaquo;</a>
        </td></tr></table>
      </td></tr>` : ""}
      ${ev.flyer_url && !unlock ? `<tr><td style="padding:0 0 14px;"><img src="${esc(ev.flyer_url)}" alt="" width="520" style="display:block;width:100%;max-height:300px;object-fit:cover;border-radius:14px;border:1px solid #232849;"></td></tr>` : ""}
      ${unlock ? `<tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0e24;border:1px solid #2b2f5a;border-radius:16px;"><tr><td style="padding:18px;">
          <div style="font-family:${mono};font-size:11px;letter-spacing:.14em;color:#b7bbe6;">YOUR KEY TURNED A NOTCH</div>
          <div style="margin-top:8px;font-size:20px;font-weight:700;line-height:1.25;">${esc(fan.name ? `${fan.name}, something` : "Something")} new is waiting in the sky.</div>
          <div style="margin-top:6px;font-size:16px;line-height:1.35;color:${G};">${esc(teaser.charAt(0).toUpperCase() + teaser.slice(1))}</div>
          <a href="${esc(sky)}" style="display:inline-block;margin-top:14px;padding:12px 20px;background:${G};color:#0d0d0d;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;">Turn your key &rsaquo;</a>
        </td></tr></table>
      </td></tr>` : ""}
      ${message ? `<tr><td style="padding:0 0 14px;"><div style="padding:14px;background:#0e1128;border:1px solid #232849;border-radius:12px;"><div style="font-family:${mono};font-size:11px;letter-spacing:.12em;color:#7e83b8;">FROM THE HOST</div><div style="margin-top:6px;font-size:15px;line-height:1.45;white-space:pre-line;">${esc(message)}</div></div></td></tr>` : ""}
      <tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e1128;border:1px solid #232849;border-radius:12px;">
          ${rows.map(([k, v], i) => `<tr><td style="padding:10px 14px;${i ? "border-top:1px solid #1c2042;" : ""}font-family:${mono};font-size:11px;letter-spacing:.12em;color:#7e83b8;width:100px;vertical-align:top;">${k}</td><td style="padding:10px 14px;${i ? "border-top:1px solid #1c2042;" : ""}font-size:15px;">${esc(v)}</td></tr>`).join("")}
        </table>
      </td></tr>
      ${media.pictures.map((u) => `<tr><td style="padding:0 0 14px;"><img src="${esc(u)}" alt="" width="520" style="display:block;width:100%;height:auto;max-height:560px;object-fit:cover;border-radius:14px;border:1px solid #232849;"></td></tr>`).join("")}
      ${!unlock ? `<tr><td style="padding:0 0 6px;"><a href="${esc(sky)}" style="display:inline-block;padding:12px 20px;background:${G};color:#0d0d0d;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;">${after ? "Open your sky" : "Open your key"} &rsaquo;</a>
        <a href="${esc(base)}" style="display:inline-block;margin-left:6px;padding:12px 16px;border:1px solid #232849;border-radius:12px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">Event page</a></td></tr>` : ""}
      ${after ? "" : `<tr><td style="padding:18px 0 0;">
        <div style="padding:16px 12px 14px;background:#0e1128;border:1px solid #232849;border-radius:14px;text-align:center;">
          <div style="font-family:${mono};font-size:11px;letter-spacing:.14em;color:${G};">HOW HYPED ARE YOU?</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;table-layout:fixed;"><tr>${hypeCells}</tr></table>
          <div style="margin-top:12px;font-size:13px;line-height:1.45;color:#b7bbe6;">Tap one to open your sky. You can post a message there once a day for everyone coming to see.</div>
          <a href="${esc(postLink)}" style="display:inline-block;margin-top:10px;font-size:14px;font-weight:700;color:${G};text-decoration:none;">Post a message in the sky &rsaquo;</a>
        </div>
      </td></tr>`}
      <tr><td style="padding:16px 2px 0;font-size:14px;line-height:1.5;color:#d6d8f5;text-align:center;">
        Have info or a question? <a href="${esc(askLink)}" style="color:${G};font-weight:700;text-decoration:none;">Message the host &rsaquo;</a>
      </td></tr>
      <tr><td style="padding:22px 2px 0;font-size:12px;line-height:1.5;color:#7e83b8;">
        You're getting this because you RSVP'd to ${esc(title)} on Show Pilot. Your RSVP and key stay active either way.<br>
        <a href="${esc(stop)}" style="color:#b7bbe6;">Stop countdown emails</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  const text = [
    `${after ? "After the show" : whenWord(d)} · ${title}`,
    "",
    film ? `Stellar Birth: every star from the night came together. Watch it and save the video:\n${watch}\n` : null,
    unlock ? `Your key turned a notch. Something new is waiting in the sky: ${teaser}\n${sky}\n` : null,
    message ? `From the host:\n${message}\n` : null,
    ...media.pictures.map((u) => `Picture: ${u}`),
    media.pictures.length ? "" : null,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    unlock ? null : `${after ? "Open your sky" : "Open your key"}: ${sky}`,
    `Event page: ${base}`,
    "",
    ...(after ? [] : ["How hyped are you? Tap one:", ...HYPE.map(([emoji, label], i) => `${emoji} ${label}: ${hypeLink(i + 1)}`), `Post a message in the sky: ${postLink}`, ""]),
    `Have info or a question? Message the host: ${askLink}`,
    "",
    `Stop countdown emails: ${stop}`,
  ].filter((l) => l !== null).join("\n");

  return { subject, html, text, stop };
}

// The morning after the show (job 239): "Stellar Birth" is ready in the
// fan's sky. Links straight to it (&film=1).
type FilmDue = { show_id: string; fan_token: string; fan_slug: string | null; event: { event_name?: string; band_name?: string; date: string; venue?: string; title?: string; image?: string }; rsvps: Rsvp[] | null };
export function buildFilmEmail(site: string, due: FilmDue, fan: Rsvp) {
  const ev = due.event;
  const title = ev.title || ev.event_name || ev.band_name || "the show";
  const base = `${site}${due.fan_slug ? `/${due.fan_slug}` : `/rsvp/${due.fan_token}`}`;
  const sky = `${base}/sky?k=${encodeURIComponent(fan.sky_key)}`;
  const watch = `${sky}&film=1`;
  const ask = `${sky}&ask=1`;
  const stop = `${site}/fan/unsubscribe?countdown=${encodeURIComponent(fan.sky_key)}`;
  const when = [dateLong(ev.date), ev.venue].filter(Boolean).join(" · ");
  const subject = `Stellar Birth: your night at ${title}`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#05060f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05060f;"><tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;">
      <tr><td style="padding:0 2px 14px;">
        <div style="font-family:${mono};font-size:11px;letter-spacing:.16em;color:#FFB347;">AFTER THE SHOW · STELLAR BIRTH</div>
        <div style="margin-top:8px;font-size:30px;font-weight:700;line-height:1.08;">${esc(title)}</div>
        ${when ? `<div style="margin-top:4px;font-size:15px;color:#d6d8f5;">${esc(when)}</div>` : ""}
      </td></tr>
      ${ev.image ? `<tr><td style="padding:0 0 14px;"><img src="${esc(ev.image)}" alt="" width="520" style="display:block;width:100%;max-height:300px;object-fit:cover;border-radius:14px;border:1px solid #232849;"></td></tr>` : ""}
      <tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0e24;border:1px solid #2b2f5a;border-radius:16px;"><tr><td style="padding:18px;">
          <div style="font-size:20px;font-weight:700;line-height:1.3;">${esc(fan.name ? `${fan.name}, every` : "Every")} star from the night came together.</div>
          <div style="margin-top:6px;font-size:15px;line-height:1.5;color:#d6d8f5;">Everyone who RSVP'd was a star in the sky. Watch them pull together into one sun, then save the video to keep.</div>
          <a href="${esc(watch)}" style="display:inline-block;margin-top:14px;padding:12px 20px;background:#FFB347;color:#1a0d00;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;">Watch Stellar Birth &rsaquo;</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:6px 2px 0;font-size:14px;line-height:1.5;color:#d6d8f5;text-align:center;">
        Have info or a question? <a href="${esc(ask)}" style="color:${G};font-weight:700;text-decoration:none;">Message the host &rsaquo;</a>
      </td></tr>
      <tr><td style="padding:22px 2px 0;font-size:12px;line-height:1.5;color:#7e83b8;">
        You're getting this because you RSVP'd to ${esc(title)} on Show Pilot.<br>
        <a href="${esc(stop)}" style="color:#b7bbe6;">Stop these emails</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = [
    `Stellar Birth · ${title}`, when, "",
    `${fan.name ? `${fan.name}, every` : "Every"} star from the night came together. Watch it and save the video to keep:`,
    watch, "",
    `Have info or a question? Message the host: ${ask}`, "",
    `Stop these emails: ${stop}`,
  ].join("\n");
  return { subject, html, text, stop };
}

// A notch's pictures and documents (job 308). Only files in the event
// owner's own folder of the private fan-files bucket count. Pictures get a
// private link that lasts until a month after the show; PDFs are attached
// (5 MB each, 15 MB in all). A file that can't be read is skipped so the
// email still goes out.
const FAN_FILES = "fan-files";
const PIC_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE = 5 * 1024 * 1024, MAX_TOTAL = 15 * 1024 * 1024;
const safeName = (name: unknown) => {
  const base = String(name ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^\w .()\-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "attachment";
  return `${base}.pdf`;
};
const toBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
async function notchMedia(admin: any, item: Due): Promise<Media> {
  const files = Array.isArray(item.notch.files) ? item.notch.files.slice(0, 3) : [];
  if (!files.length) return NO_MEDIA;
  const { data: show } = await admin.from("shows").select("owner_id, date").eq("id", item.show_id).maybeSingle();
  if (!show?.owner_id) return NO_MEDIA;
  const ok = (f: NotchFile) => typeof f?.path === "string" && f.path.startsWith(`${show.owner_id}/`) && !f.path.includes("..");
  const day = 86_400;
  const untilShow = show.date ? Math.ceil((new Date(`${show.date}T00:00:00Z`).getTime() - Date.now()) / 1000) : 0;
  const seconds = Math.min(365 * day, Math.max(30 * day, untilShow + 30 * day));
  const out: Media = { pictures: [], attachments: [] };
  let total = 0;
  for (const f of files) {
    if (!ok(f)) continue;
    if (PIC_TYPES.includes(String(f.type))) {
      const { data, error } = await admin.storage.from(FAN_FILES).createSignedUrl(f.path, seconds);
      if (error || !data?.signedUrl) { console.error("Picture link failed", f.path, error); continue; }
      out.pictures.push(data.signedUrl);
    } else if (f.type === "application/pdf") {
      const { data: blob, error } = await admin.storage.from(FAN_FILES).download(f.path);
      if (error || !blob) { console.error("Attachment download failed", f.path, error); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > MAX_FILE || total + bytes.length > MAX_TOTAL) continue;
      total += bytes.length;
      out.attachments.push({ filename: safeName(f.name), content: toBase64(bytes) });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: ok } = await admin.rpc("check_digest_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (ok !== true) return new Response("Forbidden", { status: 403 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FAN_EMAIL_FROM");
  if (!resendKey || !from) return new Response(JSON.stringify({ error: "Email isn't set up" }), { status: 500 });

  const { data, error } = await admin.rpc("fan_countdown_due");
  if (error) { console.error(error); return new Response(JSON.stringify({ error: "due failed" }), { status: 500 }); }

  const due = (Array.isArray(data) ? data : []) as Due[];
  const site = siteUrl();
  let sent = 0, failed = 0;

  for (const item of due) {
    const done: string[] = [];
    const media = await notchMedia(admin, item); // once per notch, shared by every fan
    for (const fan of item.rsvps ?? []) {
      const { subject, html, text, stop } = buildCountdownEmail(site, item, fan, media);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          // One email per notch per RSVP, even if a run is retried.
          "Idempotency-Key": `fan-countdown-${item.show_id}-${item.notch.id}-${fan.rsvp_id}`,
        },
        body: JSON.stringify({ from, to: [fan.email], subject, html, text, headers: { "List-Unsubscribe": `<${stop}>` }, ...(media.attachments.length ? { attachments: media.attachments } : {}) }),
      });
      if (!res.ok) { failed++; console.error("Resend error", res.status, (await res.text()).slice(0, 300)); continue; }
      done.push(fan.rsvp_id);
      sent++;
      await new Promise((r) => setTimeout(r, 120)); // stay under Resend's rate limit
    }
    if (done.length) {
      const { error: markErr } = await admin.rpc("mark_countdown_sent", { p_show_id: item.show_id, p_notch: item.notch.id, p_rsvp_ids: done });
      if (markErr) console.error(markErr);
    }
  }

  // The morning after: Stellar Birth emails (job 239).
  const { data: filmData, error: filmError } = await admin.rpc("fan_film_due");
  if (filmError) console.error(filmError);
  const films = (Array.isArray(filmData) ? filmData : []) as FilmDue[];
  for (const item of films) {
    const done: string[] = [];
    for (const fan of item.rsvps ?? []) {
      const { subject, html, text, stop } = buildFilmEmail(site, item, fan);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `fan-film-${item.show_id}-${fan.rsvp_id}`,
        },
        body: JSON.stringify({ from, to: [fan.email], subject, html, text, headers: { "List-Unsubscribe": `<${stop}>` } }),
      });
      if (!res.ok) { failed++; console.error("Resend error", res.status, (await res.text()).slice(0, 300)); continue; }
      done.push(fan.rsvp_id);
      sent++;
      await new Promise((r) => setTimeout(r, 120));
    }
    if (done.length) {
      const { error: markErr } = await admin.rpc("mark_countdown_sent", { p_show_id: item.show_id, p_notch: "film", p_rsvp_ids: done });
      if (markErr) console.error(markErr);
    }
  }

  return new Response(JSON.stringify({ notches: due.length, films: films.length, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
