import jsPDF from "jspdf";
import { pdfSafe } from "@/lib/guestListPdf";
import { normalizeCueSheet } from "@/lib/cueSheet";
import { LOOK_KEYS, MOTIONS } from "@/lib/cueLooks";

// An act's lighting cue sheet as a PDF (job 418): what they filled in on the
// Lighting cues circle of the LD's intake - each song (BPM, feel, color) and
// its cues (when, the look, color, and the LD's functions if set), their
// notes, and their uploaded cue sheets (pictures drawn in, other files as
// links). Letter size, black on white, to view or print on the event.

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || "").trim());
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null;
};

// A picture as a data URL (null if it can't be read, e.g. blocked).
async function imageData(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(png|jpe?g|webp)/i.test(blob.type)) return null;
    const dataUrl = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
    const size = await new Promise((ok) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => ok(null); im.src = dataUrl; });
    if (!size) return null;
    // jsPDF draws JPEG and PNG; a WebP goes through a canvas first.
    if (/webp/i.test(blob.type)) {
      const c = document.createElement("canvas");
      c.width = size[0]; c.height = size[1];
      const im = new Image(); im.src = dataUrl; await im.decode();
      c.getContext("2d").drawImage(im, 0, 0);
      return { data: c.toDataURL("image/jpeg", 0.9), fmt: "JPEG", w: size[0], h: size[1] };
    }
    return { data: dataUrl, fmt: /png/i.test(blob.type) ? "PNG" : "JPEG", w: size[0], h: size[1] };
  } catch { return null; }
}

export async function cueSheetPdf({ actName = "", eventLine = "", sheet: raw }) {
  const sheet = normalizeCueSheet(raw);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  const room = (need) => { if (y + need > H - M) { doc.addPage(); y = M; } };
  const text = (t, x, size = 11, style = "normal", color = [20, 20, 20]) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color);
    doc.text(t, x, y);
  };
  const wrap = (t, width, size) => { doc.setFontSize(size); return doc.splitTextToSize(pdfSafe(t), width); };

  // Header
  text("LIGHTING CUES", M, 9, "bold", [110, 110, 110]); y += 22;
  text(pdfSafe(actName) || "Act", M, 22, "bold"); y += 18;
  if (eventLine) { text(pdfSafe(eventLine), M, 11, "normal", [90, 90, 90]); y += 8; }
  doc.setDrawColor(200); doc.setLineWidth(0.8); doc.line(M, y + 6, W - M, y + 6); y += 28;

  const songs = sheet.songs.filter((s) => s.title.trim() || s.cues.length);
  const colAt = M + 22, colLook = M + 110, colColor = W - M - 70;
  songs.forEach((s, si) => {
    room(60);
    // Song line: number, title, BPM / feel, its color.
    text(`${si + 1}`, M, 13, "bold", [140, 140, 140]);
    text(pdfSafe(s.title) || `Song ${si + 1}`, M + 22, 13, "bold");
    const meta = [s.bpm ? `${s.bpm} BPM` : "", pdfSafe(s.feel)].filter(Boolean).join(" · ");
    if (meta) text(meta, W - M - 140, 10, "normal", [90, 90, 90]);
    const sc = hex(s.color);
    if (sc) { doc.setFillColor(...sc); doc.circle(W - M - 6, y - 4, 5, "F"); }
    y += 16;
    if (!s.cues.length) { text("No cues", colAt, 10, "italic", [130, 130, 130]); y += 18; return; }
    // Column heads
    text("WHEN", colAt, 8, "bold", [130, 130, 130]); text("LOOK", colLook, 8, "bold", [130, 130, 130]); text("COLOR", colColor, 8, "bold", [130, 130, 130]);
    y += 12;
    s.cues.forEach((q, qi) => {
      const extra = [
        ...(q.keys ? LOOK_KEYS.filter((k) => q.keys[k.id]).map((k) => k.label) : []),
        ...(q.motion ? [`Motion: ${MOTIONS.find((m) => m.id === q.motion)?.label || q.motion}`] : []),
        ...(q.fadeIn ? [`Fade ${q.fadeIn}s`] : []),
      ].join(", ");
      const lookLines = wrap(q.look || "-", colColor - colLook - 12, 10.5);
      const atLines = wrap(q.at || "", colLook - colAt - 10, 10);
      const extraLines = extra ? wrap(extra, colColor - colLook - 12, 8.5) : [];
      const h = Math.max(lookLines.length, atLines.length) * 13 + extraLines.length * 11 + 6;
      room(h + 4);
      if (qi % 2 === 0) { doc.setFillColor(245, 245, 245); doc.rect(M + 14, y - 10, W - 2 * M - 14, h, "F"); }
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      doc.text(atLines, colAt, y);
      doc.setFontSize(10.5); doc.setTextColor(20, 20, 20);
      doc.text(lookLines, colLook, y);
      if (extraLines.length) { doc.setFontSize(8.5); doc.setTextColor(100, 100, 100); doc.text(extraLines, colLook, y + lookLines.length * 13); }
      const qc = hex(q.color) || hex(s.color);
      if (qc) { doc.setFillColor(...qc); doc.setDrawColor(170); doc.setLineWidth(0.5); doc.roundedRect(colColor, y - 9, 26, 11, 2, 2, "FD"); }
      y += h;
    });
    y += 14;
  });
  if (!songs.length) { text("No songs or cues typed in.", M, 11, "italic", [120, 120, 120]); y += 22; }

  // Notes
  if (sheet.notes.trim()) {
    const lines = wrap(sheet.notes, W - 2 * M, 11);
    room(30 + lines.length * 14);
    text("NOTES", M, 9, "bold", [110, 110, 110]); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    doc.text(lines, M, y); y += lines.length * 14 + 12;
  }

  // Their uploaded cue sheets: pictures drawn in, anything else as a link.
  if (sheet.files.length) {
    room(40);
    text("UPLOADED CUE SHEETS", M, 9, "bold", [110, 110, 110]); y += 18;
    for (const f of sheet.files) {
      const name = pdfSafe(f.name) || "Cue sheet";
      const img = /^image\//i.test(f.type || "") || /\.(png|jpe?g|webp)(\?|$)/i.test(f.url) ? await imageData(f.url) : null;
      if (img) {
        const maxW = W - 2 * M, maxH = H - 2 * M - 30;
        const k = Math.min(maxW / img.w, maxH / img.h, 1);
        const w = img.w * k, h = img.h * k;
        room(h + 26);
        text(name, M, 10, "bold"); y += 8;
        doc.addImage(img.data, img.fmt, M, y, w, h);
        y += h + 20;
      } else {
        room(18);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 80, 200);
        doc.textWithLink(`${name} (open)`, M, y, { url: f.url });
        y += 16;
      }
    }
  }
  // Page numbers
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`${pdfSafe(actName) || "Act"} · Lighting cues · ${p} / ${n}`, M, H - 24);
  }
  return doc;
}

// Opens the PDF in a new tab to view (or saves it if the tab is blocked).
// Call it from a tap: the tab is opened first so phones allow it.
export async function openCueSheetPdf(opts) {
  const tab = window.open("", "_blank");
  try {
    const doc = await cueSheetPdf(opts);
    const name = `${pdfSafe(opts.actName) || "Act"} - Lighting cues.pdf`;
    const url = URL.createObjectURL(doc.output("blob"));
    if (tab) tab.location.href = url;
    else { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
