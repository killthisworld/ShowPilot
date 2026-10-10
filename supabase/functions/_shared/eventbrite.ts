// deno-lint-ignore-file no-explicit-any
// Small Eventbrite API helpers shared by the eventbrite and eventbrite-webhook
// edge functions.
//
// Secrets: EVENTBRITE_CLIENT_ID (the app's "API key"), EVENTBRITE_CLIENT_SECRET,
// APP_URL. The OAuth redirect URI registered on the Eventbrite app must be
// exactly `${APP_URL}/eventbrite/callback`.

export const EB_API = "https://www.eventbriteapi.com/v3";
export const EB_AUTHORIZE = "https://www.eventbrite.com/oauth/authorize";
export const EB_TOKEN = "https://www.eventbrite.com/oauth/token";

export class EventbriteError extends Error {
  constructor(public status: number, public body: string) {
    super(`Eventbrite ${status}: ${body.slice(0, 300)}`);
  }
}

// GET/POST/DELETE against the Eventbrite API with a host's token.
export async function eb(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {
  const url = path.startsWith("http") ? path : `${EB_API}${path}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new EventbriteError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export function ebConfig() {
  const clientId = Deno.env.get("EVENTBRITE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("EVENTBRITE_CLIENT_SECRET") ?? "";
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
  return {
    clientId,
    clientSecret,
    appUrl,
    redirectUri: `${appUrl}/eventbrite/callback`,
    configured: !!(clientId && clientSecret && appUrl),
  };
}

export function webhookUrl(secret: string) {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/eventbrite-webhook?k=${encodeURIComponent(secret)}`;
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
