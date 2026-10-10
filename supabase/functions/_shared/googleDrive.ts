// deno-lint-ignore-file no-explicit-any
// Google Drive helpers shared by the dj-drive and dj-set-upload edge functions.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL. The OAuth client's
// authorized redirect URI must be exactly `${APP_URL}/dj/drive/callback`, and
// APP_URL must also be listed as an authorized JavaScript origin (the artist's
// browser uploads straight to Google from that origin).
//
// Scope is drive.file: Show Pilot can only see and change files and folders it
// created itself, never the rest of the DJ's Drive.

export const G_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
export const G_TOKEN = "https://oauth2.googleapis.com/token";
export const G_REVOKE = "https://oauth2.googleapis.com/revoke";
export const G_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
export const DRIVE = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"].join(" ");
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export class GoogleError extends Error {
  constructor(public status: number, public body: string) {
    super(`Google ${status}: ${body.slice(0, 300)}`);
  }
}

export function googleConfig() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
  return {
    clientId,
    clientSecret,
    appUrl,
    redirectUri: `${appUrl}/dj/drive/callback`,
    configured: !!(clientId && clientSecret && appUrl),
  };
}

export function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Swap a refresh token for a short-lived access token.
export async function accessTokenFor(refreshToken: string): Promise<string> {
  const cfg = googleConfig();
  const res = await fetch(G_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) throw new GoogleError(res.status, JSON.stringify(body));
  return body.access_token as string;
}

export async function drive(token: string, path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<any> {
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  const res = await fetch(`${DRIVE}${path}${qs}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new GoogleError(res.status, text);
  return text ? JSON.parse(text) : {};
}

// Drive file names: keep them readable, drop characters that cause trouble
// when the DJ downloads the folder to a USB stick.
export function safeName(s: string, max = 80) {
  return (s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "Untitled";
}

export async function createFolder(token: string, name: string, parentId?: string | null): Promise<string> {
  const f = await drive(token, "/files", {
    method: "POST",
    query: { fields: "id" },
    body: { name: safeName(name, 120), mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) },
  });
  return f.id as string;
}

// True if the folder still exists and isn't in the bin (the DJ may have deleted it).
export async function folderAlive(token: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  try {
    const f = await drive(token, `/files/${encodeURIComponent(id)}`, { query: { fields: "id,trashed,mimeType" } });
    return f.mimeType === FOLDER_MIME && !f.trashed;
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 404 || e.status === 403)) return false;
    throw e;
  }
}

export const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;
