import { supabase } from "@/api/supabaseClient";

// Calls an edge function and returns its JSON, or throws an Error whose
// message is the function's own readable error.
async function call(fn, body, fallback) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data;
  let message = fallback;
  try {
    const b = await error.context?.json?.();
    if (b?.error) message = b.error;
  } catch { /* keep the fallback */ }
  throw new Error(message);
}

// The DJ's own Google Drive connection (needs their session).
export const driveCall = (action, params = {}) =>
  call("dj-drive", { action, ...params }, "Something went wrong talking to Google Drive. Try again.");

// The artist's set page (the slot token is the permission).
export const setUploadCall = (token, action, params = {}) =>
  call("dj-set-upload", { token, action, ...params }, "Something went wrong sending to the DJ's Drive. Try again.");

// The public link an artist gets for their slot.
export const slotLink = (token) => `${window.location.origin}/dj/set/${token}`;

// Uploads one file straight to a Google Drive resumable session. Resumes from
// where Google says it got to if the connection drops (up to a few times).
// Resolves the Drive file ({ id, name, ... }).
export function uploadToDrive(uploadUrl, file, onProgress, signal) {
  const total = file.size;

  const put = (start) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    const body = start > 0 ? file.slice(start) : file;
    if (start > 0) xhr.setRequestHeader("Content-Range", `bytes ${start}-${total - 1}/${total}`);
    xhr.upload.onprogress = (e) => onProgress?.(Math.min(total, start + e.loaded), total);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try { resolve({ done: true, file: JSON.parse(xhr.responseText) }); } catch { reject(new Error("Google sent back an unexpected answer.")); }
      } else if (xhr.status === 308) {
        resolve({ done: false });
      } else {
        reject(Object.assign(new Error(`Upload stopped (${xhr.status}).`), { retry: xhr.status >= 500 || xhr.status === 0 }));
      }
    };
    xhr.onerror = () => reject(Object.assign(new Error("The connection dropped."), { retry: true }));
    if (signal) signal.addEventListener("abort", () => { xhr.abort(); reject(new Error("Cancelled")); }, { once: true });
    xhr.send(body);
  });

  // Ask Google how many bytes it already has.
  const status = () => new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Range", `bytes */${total}`);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try { return resolve({ done: true, file: JSON.parse(xhr.responseText) }); } catch { /* fall through */ }
      }
      const range = xhr.getResponseHeader("Range"); // "bytes=0-12345", may be hidden by the browser
      const m = range && range.match(/bytes=0-(\d+)/);
      resolve({ done: false, next: m ? Number(m[1]) + 1 : 0 });
    };
    xhr.onerror = () => resolve({ done: false, next: 0 });
    xhr.send();
  });

  return (async () => {
    let start = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await put(start);
        if (r.done) return r.file;
      } catch (e) {
        if (!e.retry || signal?.aborted) throw e;
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
      const s = await status();
      if (s.done) return s.file;
      start = s.next;
    }
    throw new Error("The upload kept stopping. Check your connection and try that file again.");
  })();
}

export const GEAR_OPTIONS = [
  { key: "cdj", label: "CDJs" },
  { key: "turntables", label: "Turntables" },
  { key: "mixer", label: "DJ mixer" },
  { key: "usb", label: "Playing from USB" },
  { key: "laptop", label: "Bringing a laptop" },
  { key: "controller", label: "Bringing a controller" },
  { key: "mic", label: "Microphone" },
  { key: "monitors", label: "Booth monitors" },
];
