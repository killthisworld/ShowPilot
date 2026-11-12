import jsPDF from "jspdf";

// Door lists as a PDF (job 304), alphabetical, with a box to tick at the
// door. Letter size; black on white unless a style is chosen (job 307):
//   style: { bg: "#rrggbb", font: "#rrggbb", image: JPEG data URL or null,
//            fade: 0..0.85 }  (fade lays the background color over the
//            picture so the list stays readable)
//
// kind "rsvps":  everyone who RSVP'd on the fan page
//   rows: [{ name, email, guests, artist_name, created_at }]
// kind "guests": the event's guest list (names the acts / management add)
//   rows: [{ name, plus, artist }]
// The PDF's built-in font only has Western letters (Windows-1252). Anything
// else, such as emoji, comes out as garbage and is measured wrong, so it can
// run into the next column (job 312). Fancy letters become plain ones
// (NFKC), and characters the font can't draw are dropped.
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfSafe(text) {
  const t = String(text ?? "").normalize("NFKC");
  let out = "";
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)) out += ch;
    else if (c === 0x09 || c === 0x0a) out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

export const DEFAULT_PDF_STYLE = { bg: "#FFFFFF", font: "#000000", image: null, fade: 0.55 };

export function guestListPdf({ kind = "rsvps", rows: rawInput, eventName: rawEventName, eventDate, venue: rawVenue, closeAt, capacity, style = DEFAULT_PDF_STYLE }) {
  const guestsKind = kind === "guests";
  // Every name, email and artist made safe for the PDF font (job 312); a name
  // that was only emoji falls back to "(name)".
  const eventName = pdfSafe(rawEventName), venue = pdfSafe(rawVenue);
  const input = (rawInput || []).map((r) => ({
    ...r,
    name: r.name == null ? r.name : (pdfSafe(r.name) || (String(r.name).trim() ? "(name)" : "")),
    ...(r.email != null ? { email: pdfSafe(r.email) } : {}),
    ...(r.artist_name != null ? { artist_name: pdfSafe(r.artist_name) } : {}),
    ...(r.artist != null ? { artist: pdfSafe(r.artist) } : {}),
  }));
  // One shape for both: guests = everyone in the party, artist_name = who for.
  const rows = guestsKind
    ? input.filter((g) => String(g.name || "").trim()).map((g) => ({ name: String(g.name).trim(), guests: 1 + (Number(g.plus) || 0), plus: Number(g.plus) || 0, artist_name: g.artist || null }))
    : input;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 40, BOTTOM = H - 46;
  const people = rows.reduce((n, r) => n + (r.guests || 1), 0);
  const hasArtists = rows.some((r) => r.artist_name);
  const fmtDay = (d) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const fmtWhen = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`; };
  // ---- Colors (job 307) ----
  const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : d);
  const BG = hex(style?.bg, "#FFFFFF"), FONT = hex(style?.font, "#000000");
  const IMG = typeof style?.image === "string" && style.image.startsWith("data:image/") ? style.image : null;
  const FADE = Math.max(0, Math.min(0.85, Number(style?.fade ?? 0.55)));
  const alpha = (a) => doc.setGState(new doc.GState({ opacity: a, "stroke-opacity": a }));
  const ink = (a = 1) => { doc.setTextColor(FONT); alpha(a); };      // text in the font color
  const tint = (a) => { doc.setFillColor(FONT); alpha(a); };        // bands and stripes
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
  const fit = (text, w) => {
    let t = String(text ?? "");
    if (doc.getTextWidth(t) <= w) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > w) t = t.slice(0, -1);
    return `${t}…`;
  };

  // ---- Header ----
  let y = M + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); ink(1);
  doc.text(fit(eventName || "Event", W - 2 * M), M, y);
  y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(0.72);
  const sub = [eventDate ? fmtDay(eventDate) : null, venue].filter(Boolean).join("  ·  ");
  if (sub) { doc.text(fit(sub, W - 2 * M), M, y); y += 15; }
  const closeLine = closeAt ? (new Date(closeAt) <= new Date() ? `RSVPs closed ${fmtWhen(closeAt)}` : `RSVPs close ${fmtWhen(closeAt)}`) : null;
  doc.text([`${guestsKind ? "Guest list" : "RSVPs"} as of ${fmtWhen(new Date().toISOString())}`, guestsKind ? null : closeLine].filter(Boolean).join("  ·  "), M, y);
  y += 22;

  // Totals
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); ink(1);
  doc.text(guestsKind
    ? `${people} ${people === 1 ? "person" : "people"}  ·  ${rows.length} ${rows.length === 1 ? "name" : "names"}`
    : `${people} ${people === 1 ? "person" : "people"}${capacity ? ` of ${capacity}` : ""}  ·  ${rows.length} ${rows.length === 1 ? "RSVP" : "RSVPs"}`, M, y);
  y += 16;
  if (hasArtists) {
    const m = new Map();
    for (const r of rows) { const k = r.artist_name || (guestsKind ? "No artist" : "No pick"); m.set(k, (m.get(k) || 0) + (r.guests || 1)); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); ink(0.8);
    const parts = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`);
    const lines = doc.splitTextToSize(`${guestsKind ? "Guests of" : "Coming for"}  ${parts.join("   ·   ")}`, W - 2 * M);
    doc.text(lines, M, y); y += lines.length * 13;
  }
  y += 10;

  // ---- Table ----
  const cols = guestsKind
    ? (hasArtists ? [["", 22], ["Name", 250], ["Plus", 50], ["Party", 50], ["Guest of", 160]] : [["", 22], ["Name", 380], ["Plus", 60], ["Party", 70]])
    : hasArtists
      ? [["", 22], ["Name", 128], ["Email", 178], ["Party", 40], ["Coming for", 112], ["RSVP'd", 52]]
      : [["", 22], ["Name", 170], ["Email", 228], ["Party", 50], ["RSVP'd", 62]];
  const right = (t) => t === "Party" || t === "Plus";
  const header = () => {
    tint(0.1); doc.rect(M, y - 12, W - 2 * M, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); ink(0.85);
    let x = M + 4;
    for (const [t, w] of cols) { doc.text(t.toUpperCase(), right(t) ? x + w - 10 : x, y, right(t) ? { align: "right" } : undefined); x += w; }
    y += 18;
  };
  header();
  const sorted = [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base", numeric: true }));
  doc.setFontSize(10.5);
  // Long names, emails and artists wrap onto more lines instead of being cut
  // off (job 311), so the door can read every one. An email breaks after
  // its @ or a dot when it has to.
  const LINE = 12.5;
  const wrap = (text, w) => {
    const out = [];
    let line = "";
    const push = () => { if (line) out.push(line); line = ""; };
    for (const word of String(text ?? "").split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (doc.getTextWidth(tryLine) <= w) { line = tryLine; continue; }
      push();
      let rest = word;
      while (doc.getTextWidth(rest) > w) {
        let cut = rest.length - 1;
        while (cut > 1 && doc.getTextWidth(rest.slice(0, cut)) > w) cut--;
        // Prefer breaking right after @ . - _ when that keeps most of the line.
        const soft = Math.max(rest.lastIndexOf("@", cut - 1), rest.lastIndexOf(".", cut - 1), rest.lastIndexOf("-", cut - 1), rest.lastIndexOf("_", cut - 1)) + 1;
        if (soft > cut * 0.4) cut = soft;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    push();
    return out.length ? out : [""];
  };
  sorted.forEach((r, i) => {
    const cells = guestsKind
      ? [r.name, r.plus ? `+${r.plus}` : "", String(r.guests), ...(hasArtists ? [r.artist_name || "No artist"] : [])]
      : hasArtists
      ? [r.name, r.email, String(r.guests || 1), r.artist_name || "No pick", new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })]
      : [r.name, r.email, String(r.guests || 1), new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })];
    // Work out each cell's lines first (bold names measure wider).
    const laid = cells.map((c, k) => {
      const [t, w] = cols[k + 1];
      doc.setFont("helvetica", t === "Name" || t === "Party" ? "bold" : "normal");
      return right(t) || t === "RSVP'd" ? [c] : wrap(c, w - 8);
    });
    const rowH = 18 + (Math.max(...laid.map((l) => l.length)) - 1) * LINE;
    if (y - 12 + rowH > BOTTOM + 6) { doc.addPage(); paintBg(); y = M + 10; header(); doc.setFontSize(10.5); }
    if (i % 2 === 1) { tint(0.05); doc.rect(M, y - 12, W - 2 * M, rowH, "F"); }
    let x = M + 4;
    doc.setDrawColor(FONT); alpha(0.55); doc.setLineWidth(0.8); doc.rect(x + 1, y - 9, 10, 10);
    x += cols[0][1];
    laid.forEach((lines, k) => {
      const [t, w] = cols[k + 1];
      doc.setFont("helvetica", t === "Name" || t === "Party" ? "bold" : "normal"); ink(t === "Email" || t === "RSVP'd" || t === "Plus" ? 0.72 : 1);
      if (right(t)) doc.text(lines[0], x + w - 10, y, { align: "right" });
      else lines.forEach((ln, j) => doc.text(ln, x, y + j * LINE));
      x += w;
    });
    y += rowH;
  });
  if (!rows.length) { doc.setFont("helvetica", "normal"); ink(0.65); doc.text(guestsKind ? "No names on the guest list yet." : "No RSVPs yet.", M + 4, y); }

  // ---- Footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); ink(0.5);
    doc.text("Made with ShowPilot  ·  showpilot.space", M, H - 24);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 24, { align: "right" });
  }

  const base = String(eventName || "Event").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Event";
  return new File([doc.output("blob")], `${base} ${guestsKind ? "Guest List" : "RSVPs"}.pdf`, { type: "application/pdf" });
}

// Hand a file over: the share sheet on phones (Save to Files, AirDrop),
// else a download. Returns "shared", "downloaded" or "" (cancelled).
export async function saveOrShare(file) {
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); return "shared"; }
  } catch (e) { if (e?.name === "AbortError") return ""; }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
