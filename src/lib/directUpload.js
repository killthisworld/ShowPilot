// Uploads straight to Supabase Storage with progress and a stall timeout
// (job 462, 2026-11-22). The press kit editor's uploads used to spin
// forever on iPhones: the upload sometimes finished on the server but the
// app never heard back, or never started at all. This one reports how far
// it got, gives up with a readable message if nothing moves for a while,
// and doesn't wait on the sign-in lock for its token.
import { supabase } from "@/api/supabaseClient";

const BASE = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// The signed-in user's token. getSession() can wait on a lock that a
// background token refresh holds (iOS Safari, after the file picker puts the
// page in the background), so after 5 s use the stored session instead.
async function accessToken() {
  const stored = () => {
    try {
      const k = Object.keys(localStorage).find((x) => /^sb-.+-auth-token$/.test(x));
      const v = k ? JSON.parse(localStorage.getItem(k) || "null") : null;
      return v?.access_token || v?.currentSession?.access_token || null;
    } catch { return null; }
  };
  const fromClient = supabase.auth.getSession().then((r) => r?.data?.session?.access_token || null).catch(() => null);
  const t = await Promise.race([fromClient, new Promise((res) => setTimeout(() => res(null), 5000))]);
  return t || stored();
}

export const publicUrl = (bucket, path) => `${BASE}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;

// Resolves the file's public URL. onProgress gets 0..1.
export async function uploadDirect(bucket, path, blob, { contentType, onProgress, stallMs = 30000 } = {}) {
  const token = await accessToken();
  if (!token) throw new Error("You're signed out. Sign in again and retry.");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stall = null;
    const arm = () => {
      clearTimeout(stall);
      stall = setTimeout(() => { xhr.abort(); reject(new Error("The upload stopped moving. Check your signal and try again.")); }, stallMs);
    };
    xhr.open("POST", `${BASE}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", KEY);
    xhr.setRequestHeader("Content-Type", contentType || blob.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => { arm(); if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      clearTimeout(stall);
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); resolve(publicUrl(bucket, path)); return; }
      let msg = "";
      try { const j = JSON.parse(xhr.responseText || "{}"); msg = j.message || j.error || ""; } catch { /* not JSON */ }
      if (xhr.status === 413 || /maximum allowed size|too large/i.test(msg)) reject(new Error("That file is bigger than Show Pilot's upload limit."));
      else if (/bucket/i.test(msg)) reject(new Error("Uploads here need a database update first. Try again soon."));
      else reject(new Error(msg || `Upload failed (${xhr.status}). Try again.`));
    };
    xhr.onerror = () => { clearTimeout(stall); reject(new Error("No connection. Check your signal and try again.")); };
    arm();
    xhr.send(blob);
  });
}

// Phone photos are 3-12 MB (and HEIC on iPhones): make them a JPEG at most
// `max` px on the long side before uploading. PNGs keep transparency (logos).
// Anything the browser can't read goes up as it is.
export async function shrinkImage(file, { max = 2400, quality = 0.86 } = {}) {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const keepPng = file.type === "image/png";
    if (scale === 1 && (file.type === "image/jpeg" || keepPng) && file.size < 2.5 * 1024 * 1024) { bmp.close?.(); return file; }
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const type = keepPng ? "image/png" : "image/jpeg";
    const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
    return blob || file;
  } catch {
    return file;
  }
}
