// Reads a file's own header to prove it is a real WAV (not an MP3 renamed to
// .wav) and pulls out its quality: sample rate, bit depth, channels, length.
// Only the header is read (a few bytes per chunk), never the whole file, so
// it's instant even for a 2 GB set.

const ascii = (dv, off, len) => {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
  return s;
};

const readBytes = async (file, start, len) => new DataView(await file.slice(start, start + len).arrayBuffer());

const FORMAT_NAMES = { 1: "PCM", 3: "32-bit float", 0xfffe: "PCM" };

// Resolves { ok: true, sampleRate, bitDepth, channels, durationSec, format }
// or { ok: false, reason } with a sentence the artist can act on.
export async function inspectWav(file) {
  if (!file) return { ok: false, reason: "No file." };
  if (!/\.wav$/i.test(file.name)) return { ok: false, reason: `${file.name} isn't a .wav file. Only WAV is accepted.` };
  if (file.size < 44) return { ok: false, reason: `${file.name} is empty or damaged.` };

  const head = await readBytes(file, 0, 12);
  const riff = ascii(head, 0, 4);
  if (riff === "RF64") return { ok: false, reason: `${file.name} is an RF64 file (over 4 GB). Export it as a standard WAV under 4 GB, or split the set.` };
  if (riff !== "RIFF" || ascii(head, 8, 4) !== "WAVE") {
    return { ok: false, reason: `${file.name} isn't really a WAV (it may be an MP3 or AAC renamed to .wav). Export a WAV from your audio software.` };
  }

  let fmt = null;
  let dataBytes = null;
  let off = 12;
  // Walk the chunk list; skip anything that isn't fmt or data (LIST, bext, iXML, JUNK...).
  for (let guard = 0; guard < 64 && off + 8 <= file.size; guard++) {
    const h = await readBytes(file, off, 8);
    const id = ascii(h, 0, 4);
    const size = h.getUint32(4, true);
    if (id === "fmt ") {
      const f = await readBytes(file, off + 8, Math.min(size, 40));
      let format = f.getUint16(0, true);
      if (format === 0xfffe && size >= 26) {
        // WAVE_FORMAT_EXTENSIBLE: the real format is the first 2 bytes of the sub-format GUID.
        format = f.getUint16(24, true) === 3 ? 3 : 1;
      }
      fmt = {
        format,
        channels: f.getUint16(2, true),
        sampleRate: f.getUint32(4, true),
        byteRate: f.getUint32(8, true),
        bitDepth: f.getUint16(14, true),
      };
    } else if (id === "data") {
      dataBytes = size;
      break;
    }
    off += 8 + size + (size % 2); // chunks are padded to an even length
  }

  if (!fmt) return { ok: false, reason: `${file.name} has no audio format information. Re-export it as a WAV.` };
  if (fmt.format !== 1 && fmt.format !== 3) {
    return { ok: false, reason: `${file.name} is a compressed WAV. Export it as uncompressed PCM WAV.` };
  }
  if (dataBytes === null) return { ok: false, reason: `${file.name} has no audio in it, or it was cut short while copying.` };
  if (!fmt.sampleRate || !fmt.channels || !fmt.bitDepth) return { ok: false, reason: `${file.name} looks damaged.` };

  const byteRate = fmt.byteRate || (fmt.sampleRate * fmt.channels * fmt.bitDepth) / 8;
  return {
    ok: true,
    sampleRate: fmt.sampleRate,
    bitDepth: fmt.bitDepth,
    channels: fmt.channels,
    durationSec: byteRate ? Math.round((dataBytes / byteRate) * 10) / 10 : null,
    format: FORMAT_NAMES[fmt.format] || "PCM",
  };
}

// "48 kHz · 24-bit · Stereo · 6:12"
export function describeWav(m) {
  if (!m) return "";
  const khz = m.sampleRate % 1000 === 0 ? m.sampleRate / 1000 : (m.sampleRate / 1000).toFixed(1);
  const ch = m.channels === 1 ? "Mono" : m.channels === 2 ? "Stereo" : `${m.channels} ch`;
  return [`${khz} kHz`, `${m.bitDepth}-bit${m.format === "32-bit float" ? " float" : ""}`, ch, formatDuration(m.durationSec)].filter(Boolean).join(" · ");
}

export function formatDuration(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return "";
  const s = Math.round(Number(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// Below CD quality is flagged so the artist can fix it before the night.
export function qualityWarning(m) {
  if (!m) return null;
  if (m.sampleRate < 44100) return "Lower than CD quality (sample rate under 44.1 kHz).";
  if (m.bitDepth < 16) return "Lower than CD quality (under 16-bit).";
  return null;
}

export function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
