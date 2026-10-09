// Turns whatever someone typed into a ticket link into a real web address, or
// returns null when it isn't one (pasted text with spaces, a command, a
// phone number, etc.). Accepts "eventbrite.com/e/123" and adds https://.
export function normalizeLink(input) {
  const raw = String(input || "").trim();
  if (!raw || /\s/.test(raw)) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProtocol);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes(".") || u.hostname.startsWith(".") || u.hostname.endsWith(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
