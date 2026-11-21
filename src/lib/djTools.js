import { supabase } from "@/api/supabaseClient";

// DJ Tools' own accent (lemon): no role, event type, Linked or status color uses it.
export const DJ_COLOR = "#FDE047";

// The DJ pages on a computer (job 452): the full width beside the rail, with
// a header bar across the top like the Sets page, instead of a narrow column
// in the middle. Phones keep their own layout.
export const DESK_MAIN = "max-w-[1080px] mx-auto px-4 lg:max-w-none lg:mx-0 lg:px-6 lg:pt-0 lg:pb-12";
export const DESK_HEADER = "lg:-mx-6 lg:px-6 lg:min-h-[69px] lg:py-3 lg:border-b lg:border-[#1a1a1a] lg:flex lg:items-center lg:gap-4 lg:mb-2";

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
// The link an act gets: short (/s/<8-letter code>, job 375) once the slot
// has a code, else the long /dj/set/<token> (which keeps working). Pass the
// slot; a bare token gives the long link.
export const slotLink = (slot) => {
  const s = typeof slot === "string" ? { token: slot } : slot || {};
  return s.short_code ? `${window.location.origin}/s/${s.short_code}` : `${window.location.origin}/dj/set/${s.token}`;
};

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

// The audio files a set takes (job 378, Jay 2026-11-19): the DJ picks one or
// more when making the set; WAV when none were picked (sets made before).
export const AUDIO_TYPES = [
  { key: "wav", label: "WAV", exts: [".wav"], mime: "audio/wav,audio/x-wav" },
  { key: "aiff", label: "AIFF", exts: [".aif", ".aiff"], mime: "audio/aiff,audio/x-aiff" },
  { key: "flac", label: "FLAC", exts: [".flac"], mime: "audio/flac,audio/x-flac" },
  { key: "mp3", label: "MP3", exts: [".mp3"], mime: "audio/mpeg" },
  { key: "m4a", label: "M4A / AAC", exts: [".m4a"], mime: "audio/mp4,audio/x-m4a" },
];
export const fileTypes = (list) => {
  const ok = (Array.isArray(list) ? list : []).filter((k) => AUDIO_TYPES.some((t) => t.key === k));
  return ok.length ? ok : ["wav"];
};
// For <input type="file" accept>.
export const acceptFor = (list) => AUDIO_TYPES.filter((t) => fileTypes(list).includes(t.key)).flatMap((t) => [...t.exts, ...t.mime.split(",")]).join(",");
// The type of a file by its name, or null.
export const typeOfFile = (name) => {
  const n = String(name || "").toLowerCase();
  return AUDIO_TYPES.find((t) => t.exts.some((e) => n.endsWith(e)))?.key || null;
};
// "WAV", "WAV or MP3", "WAV, AIFF or FLAC"
export const typesLabel = (list) => {
  const l = AUDIO_TYPES.filter((t) => fileTypes(list).includes(t.key)).map((t) => t.label.split(" ")[0]);
  return l.length > 1 ? `${l.slice(0, -1).join(", ")} or ${l[l.length - 1]}` : l[0];
};
