// Supabase Edge Function: dj-set-upload
//
// Used by the artist's set page (/dj/set/<token>), which needs no account. The
// slot's own token is the permission: every action checks it, and only ever
// touches that slot's folder in the DJ's Google Drive.
//
// The WAV bytes never pass through Show Pilot. `start` opens a Google Drive
// resumable upload session in the slot's folder and hands the session URL to
// the browser, which uploads straight to Google. `finish` then checks the file
// really landed in that folder before recording it.
//
// POST { action, token, ... } (no session needed):
//   start     { name, size }                     -> { upload_url }
//   finish    { file_id, sample_rate, bit_depth, channels, duration_sec } -> { file }
//   remove    { file_id }                        -> { ok }   (moves it to the DJ's Drive bin)
//   finalize  {}                                 -> { ok }   (renames files "01 - Title.wav" in set order)
//
// Deploy: supabase functions deploy dj-set-upload --no-verify-jwt
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  accessTokenFor, createFolder, drive, DRIVE_UPLOAD, folderAlive, GoogleError, googleConfig, safeName,
} from "../_shared/googleDrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TOKEN_RE = /^[0-9a-f]{32}$/;
const MAX_FILES_PER_SLOT = 150;
const MAX_WAV_BYTES = 4 * 1024 ** 3; // a standard WAV can't be bigger than 4 GB
const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

// The browser that will upload must be our own site (Google ties the session to this origin).
function allowedOrigin(origin: string | null, appUrl: string) {
  if (!origin) return null;
  try {
    const o = new URL(origin);
    const app = appUrl ? new URL(appUrl) : null;
    if (app && o.origin === app.origin) return o.origin;
    if (o.hostname === "localhost" || o.hostname === "127.0.0.1") return o.origin;
    if (o.protocol === "https:" && o.hostname.endsWith(".vercel.app")) return o.origin; // preview deploys
  } catch { /* fall through */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const cfg = googleConfig();
    if (!cfg.configured) return json({ error: "Uploads aren't switched on yet. Ask the DJ." }, 503);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const token = String(body?.token ?? "");
    if (!TOKEN_RE.test(token)) return json({ error: "This link isn't valid" }, 404);

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const { data: slot } = await admin.from("dj_set_slots")
      .select("id, request_id, owner_id, position, artist_name, tracks, drive_folder_id").eq("token", token).maybeSingle();
    if (!slot) return json({ error: "This link isn't valid" }, 404);
    const { data: request } = await admin.from("dj_set_requests")
      .select("id, title, event_date, drive_folder_id").eq("id", slot.request_id).maybeSingle();
    const { data: conn } = await admin.from("dj_drive_connections")
      .select("refresh_token, root_folder_id").eq("owner_id", slot.owner_id).maybeSingle();
    if (!request || !conn) return json({ error: "The DJ hasn't connected their Google Drive yet, so files can't be sent. Your track list still saves." }, 409);

    let gtoken: string;
    try { gtoken = await accessTokenFor(conn.refresh_token); }
    catch { return json({ error: "The DJ's Google Drive connection has expired. Let them know so they can reconnect it." }, 409); }

    // Event folder -> artist folder, made on first use and remade if the DJ deleted them.
    const slotFolder = async (): Promise<string> => {
      let rootId = conn.root_folder_id as string | null;
      if (!(await folderAlive(gtoken, rootId))) {
        rootId = await createFolder(gtoken, "Show Pilot");
        await admin.from("dj_drive_connections").update({ root_folder_id: rootId }).eq("owner_id", slot.owner_id);
      }
      let eventId = request.drive_folder_id as string | null;
      if (!(await folderAlive(gtoken, eventId))) {
        const label = [request.event_date, request.title].filter(Boolean).join(" – ");
        eventId = await createFolder(gtoken, label, rootId);
        await admin.from("dj_set_requests").update({ drive_folder_id: eventId }).eq("id", request.id);
      }
      let slotId = slot.drive_folder_id as string | null;
      if (!(await folderAlive(gtoken, slotId))) {
        const label = `${String(slot.position).padStart(2, "0")} – ${slot.artist_name || "Artist"}`;
        slotId = await createFolder(gtoken, label, eventId);
        await admin.from("dj_set_slots").update({ drive_folder_id: slotId }).eq("id", slot.id);
      }
      return slotId!;
    };

    // ---- start: open a resumable upload session in the artist's folder ----
    if (action === "start") {
      const name = String(body?.name ?? "");
      const size = num(body?.size, 44, MAX_WAV_BYTES);
      if (!/\.wav$/i.test(name)) return json({ error: "Only WAV files can be sent." }, 400);
      if (size === null) return json({ error: "That file is too big for a WAV, or empty." }, 400);
      const origin = allowedOrigin(req.headers.get("Origin"), cfg.appUrl);
      if (!origin) return json({ error: "Uploads only work from the Show Pilot site." }, 403);
      const { count } = await admin.from("dj_set_files").select("id", { count: "exact", head: true }).eq("slot_id", slot.id);
      if ((count ?? 0) >= MAX_FILES_PER_SLOT) return json({ error: "This set already has the most files allowed." }, 400);

      const folderId = await slotFolder();
      const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=resumable&fields=id,name,size,webViewLink`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gtoken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "audio/wav",
          "X-Upload-Content-Length": String(size),
          Origin: origin, // lets the artist's browser send the bytes to this session directly
        },
        body: JSON.stringify({ name: safeName(name, 120), parents: [folderId], mimeType: "audio/wav" }),
      });
      const uploadUrl = res.headers.get("Location");
      if (!res.ok || !uploadUrl) throw new GoogleError(res.status, await res.text());
      return json({ upload_url: uploadUrl });
    }

    // ---- finish: confirm the file is in this artist's folder, then record it ----
    if (action === "finish") {
      const fileId = String(body?.file_id ?? "");
      if (!/^[\w-]{10,200}$/.test(fileId)) return json({ error: "Missing file" }, 400);
      if (!slot.drive_folder_id) return json({ error: "Upload not found" }, 404);
      let f;
      try {
        f = await drive(gtoken, `/files/${encodeURIComponent(fileId)}`, { query: { fields: "id,name,size,parents,webViewLink,trashed" } });
      } catch (e) {
        if (e instanceof GoogleError && e.status === 404) return json({ error: "Upload not found" }, 404);
        throw e;
      }
      if (f.trashed || !(f.parents ?? []).includes(slot.drive_folder_id)) return json({ error: "Upload not found" }, 404);
      const row = {
        slot_id: slot.id,
        drive_file_id: f.id,
        name: f.name,
        size_bytes: f.size ? Number(f.size) : null,
        sample_rate: num(body?.sample_rate, 8000, 768000),
        bit_depth: num(body?.bit_depth, 8, 64),
        channels: num(body?.channels, 1, 32),
        duration_sec: num(body?.duration_sec, 0, 86400),
        web_view_link: f.webViewLink ?? null,
      };
      const { error } = await admin.from("dj_set_files").upsert(row, { onConflict: "drive_file_id" });
      if (error) { console.error(error); return json({ error: "Couldn't record the file" }, 500); }
      return json({ file: { id: row.drive_file_id, name: row.name, size_bytes: row.size_bytes, sample_rate: row.sample_rate, bit_depth: row.bit_depth, channels: row.channels, duration_sec: row.duration_sec } });
    }

    // ---- remove: the artist swapped or dropped a track ----
    if (action === "remove") {
      const fileId = String(body?.file_id ?? "");
      const { data: rec } = await admin.from("dj_set_files").select("id").eq("slot_id", slot.id).eq("drive_file_id", fileId).maybeSingle();
      if (!rec) return json({ ok: true });
      try { await drive(gtoken, `/files/${encodeURIComponent(fileId)}`, { method: "PATCH", body: { trashed: true } }); }
      catch (e) { if (!(e instanceof GoogleError && e.status === 404)) throw e; }
      await admin.from("dj_set_files").delete().eq("id", rec.id);
      return json({ ok: true });
    }

    // ---- finalize: name the files in play order so the folder sorts itself ----
    if (action === "finalize") {
      const tracks = Array.isArray(slot.tracks) ? slot.tracks : [];
      let i = 0;
      for (const t of tracks) {
        i += 1;
        if (!t?.file_id) continue;
        const title = safeName([t.artist, t.title].filter(Boolean).join(" - ") || `Track ${i}`, 100);
        try {
          await drive(gtoken, `/files/${encodeURIComponent(t.file_id)}`, {
            method: "PATCH", query: { fields: "id" }, body: { name: `${String(i).padStart(2, "0")} - ${title}.wav` },
          });
        } catch (e) { console.error("Rename failed", t.file_id, e instanceof Error ? e.message : e); }
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof GoogleError) {
      console.error(e.message);
      return json({ error: "Google Drive didn't respond as expected. Try again in a moment." }, 502);
    }
    console.error(e);
    return json({ error: "Unexpected server error" }, 500);
  }
});
