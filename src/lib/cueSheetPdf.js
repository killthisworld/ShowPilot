import jsPDF from "jspdf";
import { pdfSafe, DEFAULT_PDF_STYLE } from "@/lib/guestListPdf";
import { normalizeCueSheet } from "@/lib/cueSheet";

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

// Job 451: simpler, and styled like the other PDFs (the PDF style sheet:
// a background color or picture, and the font color). Each song is its main
// color as a dot in front of the name, the tempo if given, and its cues
// underneath. Then their notes and uploaded cue sheets.
export async function cueSheetPdf({ actName = "", eventLine = "", sheet: raw, style = DEFAULT_PDF_STYLE }) {
  const sheet = normalizeCueSheet(raw);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 54;
  // Colors (the PDF style sheet).
  const okHex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : d);
  const BG = okHex(style?.bg, "#FFFFFF"), FONT = okHex(style?.font, "#000000");
  const IMG = typeof style?.image === "string" && style.image.startsWith("data:image/") ? style.image : null;
  const FADE = Math.max(0, Math.min(0.85, Number(style?.fade ?? 0.55)));
  const alpha = (v) => doc.setGState(new doc.GState({ opacity: v, "stroke-opacity": v }));
  const ink = (v = 1) => { doc.setTextColor(FONT); alpha(v); };
  const paintBg = () => {
    alpha(1);
    if (IMG) {
      doc.addImage(IMG, "JPEG", 0, 0, W, H, "pagebg", "FAST");
      if (FADE > 0) { doc.setFillColor(BG); alpha(FADE); doc.rect(0, 0, W, H, "F"); alpha(1); }
    } else if (BG.toUpperCase() !== "#FFFFFF") {
      doc.setFillColor(BG); doc.rect(0, 0, W, H, "F");
    }
  };
  paintBg();
  let y = M;
  const room = (need) => { if (y + need > H - M) { doc.addPage(); paintBg(); y = M; } };
  const text = (t, x, size, style2 = "normal", a = 1) => { doc.setFont("helvetica", style2); doc.setFontSize(size); ink(a); doc.text(t, x, y); alpha(1); };
  const wrap = (t, width, size, style2 = "normal") => { doc.setFont("helvetica", style2); doc.setFontSize(size); return doc.splitTextToSize(pdfSafe(t), width); };

  // Header: the act, the event.
  text("LIGHTING CUES", M, 9, "bold", 0.55); y += 26;
  wrap(actName || "Act", W - 2 * M, 24, "bold").slice(0, 2).forEach((l) => { text(l, M, 24, "bold"); y += 26; });
  if (eventLine) { y -= 6; text(pdfSafe(eventLine), M, 11.5, "normal", 0.65); y += 10; }
  doc.setDrawColor(FONT); alpha(0.25); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); alpha(1); y += 30;

  // Songs: color dot, name, tempo; the cues under it.
  const songs = sheet.songs.filter((s) => s.title.trim() || s.cues.length);
  const cueX = M + 22;
  songs.forEach((s, si) => {
    const title = s.title.trim() || `Song ${si + 1}`;
    const cueLines = s.cues.map((q) => wrap([q.at && q.at.trim() ? `${q.at.trim()}:` : "", q.look || ""].filter(Boolean).join(" ") || "-", W - M - cueX, 11.5));
    const firstCue = cueLines[0] ? cueLines[0].length * 15 : 0;
    room(34 + firstCue);
    const c = hex(s.color);
    if (c) { doc.setFillColor(...c); alpha(1); doc.circle(M + 6, y - 5, 6, "F"); }
    else { doc.setDrawColor(FONT); alpha(0.4); doc.setLineWidth(0.8); doc.circle(M + 6, y - 5, 5.5, "S"); alpha(1); }
    const titleLines = wrap(title, W - M - cueX - 90, 15, "bold");
    text(titleLines[0], cueX, 15, "bold");
    if (s.bpm) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(0.65); doc.text(`${String(s.bpm).trim()} BPM`, W - M, y, { align: "right" }); alpha(1); }
    y += 20;
    titleLines.slice(1).forEach((l) => { y -= 2; text(l, cueX, 15, "bold"); y += 18; });
    cueLines.forEach((lines) => {
      room(lines.length * 15 + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(11.5); ink(0.9);
      doc.text(lines, cueX, y); alpha(1);
      y += lines.length * 15 + 3;
    });
    if (!cueLines.length) { text("No cues yet", cueX, 11, "italic", 0.5); y += 15; }
    y += 16;
  });
  if (!songs.length) { text("No songs or cues typed in.", M, 11.5, "italic", 0.6); y += 24; }

  // Notes
  if (sheet.notes.trim()) {
    const lines = wrap(sheet.notes, W - 2 * M, 11.5);
    room(34 + Math.min(lines.length, 6) * 15);
    text("NOTES", M, 9, "bold", 0.55); y += 18;
    lines.forEach((l) => { room(16); text(l, M, 11.5, "normal", 0.9); y += 15; });
    y += 12;
  }

  // Their uploaded cue sheets: pictures drawn in, anything else as a link.
  if (sheet.files.length) {
    room(40);
    text("UPLOADED CUE SHEETS", M, 9, "bold", 0.55); y += 18;
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
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); ink(1);
        doc.textWithLink(`${name} (open)`, M, y, { url: f.url });
        y += 16;
      }
    }
  }
  // Page numbers
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(8); ink(0.5);
    doc.text(`${pdfSafe(actName) || "Act"} · Lighting cues`, M, H - 26);
    doc.text(`Page ${p} of ${n}`, W - M, H - 26, { align: "right" });
    alpha(1);
  }
  return doc;
}

// The PDF as a file to save or share (job 451).
export async function cueSheetFile(opts) {
  const doc = await cueSheetPdf(opts);
  const base = (pdfSafe(opts.actName) || "Act").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Act";
  return new File([doc.output("blob")], `${base} - Lighting cues.pdf`, { type: "application/pdf" });
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
