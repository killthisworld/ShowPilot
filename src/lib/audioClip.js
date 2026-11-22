// 15-second clips for the press kit's record (job 462, Jay 2026-11-22): the
// DJ picks any audio file, chooses 15 seconds of it, and the phone cuts that
// part out and turns it into a small MP3 (about 350 KB) before uploading.
// Any size or format the browser can play works, and storage stays tiny.
import { Mp3Encoder } from "@breezystack/lamejs";

export const CLIP_SECONDS = 15;
const RATE = 44100;
const FADE = 0.4; // seconds of fade in and out, so the clip doesn't click

const Ctx = () => window.AudioContext || window.webkitAudioContext;

// The whole file as audio. Throws a readable message when the browser can't
// read it (AIFF outside Safari, some FLAC, damaged files).
export async function decodeAudioFile(file) {
  const AC = Ctx();
  if (!AC) throw new Error("This browser can't open audio files.");
  const data = await file.arrayBuffer();
  const ctx = new AC();
  try {
    return await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    });
  } catch {
    throw new Error("This phone or browser can't read that file. Try a WAV or MP3 of it.");
  } finally {
    ctx.close?.();
  }
}

// Loudness bars for the waveform: n values 0..1.
export function peaks(buffer, n = 160) {
  const ch = [buffer.getChannelData(0), buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null];
  const len = buffer.length;
  const step = Math.max(1, Math.floor(len / n));
  const stride = Math.max(1, Math.floor(step / 400)); // sample ~400 points a bar: fast on long files
  const out = [];
  let top = 0.0001;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * step; j < Math.min(len, (i + 1) * step); j += stride) {
      const v = Math.max(Math.abs(ch[0][j]), ch[1] ? Math.abs(ch[1][j]) : 0);
      if (v > m) m = v;
    }
    out.push(m);
    if (m > top) top = m;
  }
  return out.map((v) => v / top);
}

// Where to start by default: a third of the way in (past the intro), or the start.
export const defaultStart = (duration) => Math.max(0, Math.min(duration - CLIP_SECONDS, duration * 0.33));

// The chosen 15 seconds as an MP3 Blob (stereo, 44.1 kHz, 192 kbps, short fades).
export async function encodeClip(buffer, start, seconds = CLIP_SECONDS) {
  const len = Math.min(seconds, Math.max(0.5, buffer.duration - start));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const frames = Math.ceil(len * RATE);
  const off = new OAC(2, frames, RATE);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const gain = off.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(1, Math.min(FADE, len / 4));
  gain.gain.setValueAtTime(1, Math.max(0, len - FADE));
  gain.gain.linearRampToValueAtTime(0, len);
  src.connect(gain).connect(off.destination);
  src.start(0, start, len);
  const out = await new Promise((resolve, reject) => {
    off.oncomplete = (e) => resolve(e.renderedBuffer);
    const p = off.startRendering();
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
  const toInt16 = (f) => {
    const a = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); a[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    return a;
  };
  const left = toInt16(out.getChannelData(0));
  const right = toInt16(out.getChannelData(1));
  const enc = new Mp3Encoder(2, RATE, 192);
  const parts = [];
  for (let i = 0; i < left.length; i += 1152) {
    const b = enc.encodeBuffer(left.subarray(i, i + 1152), right.subarray(i, i + 1152));
    if (b.length) parts.push(new Uint8Array(b));
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts, { type: "audio/mpeg" });
}

export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
