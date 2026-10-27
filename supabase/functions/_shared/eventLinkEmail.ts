// The event link email (jobs 183, 185): one place for how it looks, its
// default wording and its fill-ins. send-event-link-email still has its own
// copy of the HTML; run-advance-steps uses this one.
import { esc } from "./fanEventEmail.ts";

export const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

// "Name <addr@x>" or "addr@x" -> "addr@x"
export function bareAddress(v: string): string {
  const m = v.match(/<([^>]+)>/);
  return (m ? m[1] : v).trim();
}
// A display name that can't break the From header.
export const cleanName = (v: unknown) => String(v ?? "").replace(/[\r\n<>"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

// Same as src/lib/eventLink.js DEFAULT_EMAIL.
export const DEFAULT_EMAIL = {
  subject: "{event} at {venue}, {date}",
  body: "Hi,\n\nHere's everything for {event} at {venue} on {date}: times, the deal and what we need from you.\n\nOpen this link, read through, and fill in the short form at the bottom:\n{link}\n\nIf anything's unclear, ask right on that page.\n\nThanks,\n{name}",
};

export function fillEmail(tpl: { subject?: string; body?: string } | null, vals: Record<string, string>) {
  const t = { ...DEFAULT_EMAIL, ...(tpl || {}) };
  const fill = (s: string) => String(s || "").replace(/\{(event|date|venue|link|name)\}/g, (_m, k) => vals[k] || "");
  let body = fill(t.body);
  if (vals.link && !body.includes(vals.link)) body = `${body.trimEnd()}\n\n${vals.link}`;
  return { subject: fill(t.subject).replace(/[\r\n]+/g, " ").trim().slice(0, 200), body: body.slice(0, 8000) };
}

export function buildHtml(body: string, link: string, venue: string): string {
  const paras = esc(body)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="background:#ffffff;border-radius:14px;padding:26px 24px;border:1px solid #e4e4e7;font-size:15px">
${paras}
<div style="margin:22px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#60A5FA;color:#0d0d0d;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Open the event link</a></div>
</div>
<p style="margin:16px 4px 0;font-size:12px;color:#71717a;line-height:1.5">Sent by ${esc(venue)} with Show Pilot. Reply to this email to reach them directly.</p>
</div></body></html>`;
}
