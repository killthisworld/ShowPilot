import jsPDF from "jspdf";
import { pdfSafe, DEFAULT_PDF_STYLE } from "@/lib/guestListPdf";

// Create PDFs (job 313): printable sheets for an event, in the same look as
// the guest list PDFs (background color or picture, font color). One
// layout engine, several documents:
//   lineupPdf, schedulePdf, setlistPdf, contactsPdf
// Each returns a File named "<Event> <Kind>.pdf".

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const dayLong = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "");
const toMin = (t) => {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i.exec(String(t || ""));
  if (!m) return 99999;
  let h = Number(m[1]) % 12; const ap = (m[3] || "").toLowerCase();
  if (ap.startsWith("p")) h += 12; else if (!ap && Number(m[1]) === 12) h = 12; else if (!ap) h = Number(m[1]);
  return h * 60 + Number(m[2] || 0);
};

// ---- the engine ----
// blocks: [{ type: "kv", rows: [[label, value]] }
//          { type: "table", heading?, cols: [{ label, w, align?, bold?, dim? }], rows: [[...cells]], check?: bool, size?: number }
//          { type: "big", heading, items: [{ n, title, note }] }   (set list: large type, one per page)
//          { type: "page" } ]
function sheetPdf({ title, lines = [], blocks = [], style = DEFAULT_PDF_STYLE, fileLabel }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 40, BOTTOM = H - 50;
  const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : d);
  const BG = hex(style?.bg, "#FFFFFF"), FONT = hex(style?.font, "#000000");
  const IMG = typeof style?.image === "string" && style.image.startsWith("data:image/") ? style.image : null;
  const FADE = Math.max(0, Math.min(0.85, Number(style?.fade ?? 0.55)));
  const alpha = (a) => doc.setGState(new doc.GState({ opacity: a, "stroke-opacity": a }));
  const ink = (a = 1) => { doc.setTextColor(FONT); alpha(a); };
  const tint = (a) => { doc.setFillColor(FONT); alpha(a); };
  const paintBg = () => {
    alpha(1);
    if (IMG) {
      doc.addImage(IMG, "JPEG", 0, 0, W, H, "pagebg", "FAST");
      if (FADE > 0) { doc.setFillColor(BG); alpha(FADE); doc.rect(0, 0, W, H, "F"); alpha(1); }
    } else if (BG.toUpperCase() !== "#FFFFFF") { doc.setFillColor(BG); doc.rect(0, 0, W, H, "F"); }
  };
  const wrap = (text, w) => {
    const out = []; let line = "";
    for (const word of pdfSafe(text).split(" ").filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (doc.getTextWidth(t) <= w) { line = t; continue; }
      if (line) out.push(line);
      let rest = word;
      while (doc.getTextWidth(rest) > w && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && doc.getTextWidth(rest.slice(0, cut)) > w) cut--;
        const soft = Math.max(rest.lastIndexOf("@", cut - 1), rest.lastIndexOf(".", cut - 1), rest.lastIndexOf("-", cut - 1)) + 1;
        if (soft > cut * 0.4) cut = soft;
        out.push(rest.slice(0, cut)); rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };
  let y;
  const newPage = (first = false) => { if (!first) doc.addPage(); paintBg(); y = M + 6; };
  const room = (h) => { if (y + h > BOTTOM) newPage(); };

  newPage(true);
  // Title + lines
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); ink(1);
  const tl = wrap(title || "Event", W - 2 * M);
  tl.forEach((l, i) => doc.text(l, M, y + i * 24)); y += 24 * (tl.length - 1) + 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(0.72);
  lines.filter(Boolean).forEach((l) => { wrap(l, W - 2 * M).forEach((ln) => { doc.text(ln, M, y); y += 14; }); });
  y += 12;

  for (const b of blocks) {
    if (b.type === "page") { newPage(); continue; }
    if (b.type === "kv") {
      const kvRows = (b.rows || []).filter(([, v]) => has(v));
      if (!kvRows.length) continue;
      if (b.heading) { room(30); doc.setFont("helvetica", "bold"); doc.setFontSize(13); ink(1); doc.text(pdfSafe(b.heading), M, y); y += 16; }
      doc.setFontSize(10.5);
      for (const [k, v] of kvRows) {
        doc.setFont("helvetica", "normal");
        const vl = wrap(v, W - 2 * M - 120);
        room(vl.length * 13 + 6);
        doc.setFont("helvetica", "bold"); ink(0.6); doc.text(pdfSafe(k).toUpperCase(), M, y);
        doc.setFont("helvetica", "normal"); ink(1); vl.forEach((ln, j) => doc.text(ln, M + 120, y + j * 13));
        y += vl.length * 13 + 5;
      }
      y += 10;
      continue;
    }
    if (b.type === "big") {
      // Set list: large, bold, numbered; meant to be read from the floor.
      room(60);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); ink(0.65);
      if (b.heading) { doc.text(pdfSafe(b.heading).toUpperCase(), M, y); y += 14; }
      tint(0.25); doc.rect(M, y, W - 2 * M, 1.2, "F"); y += 26;
      const n = (b.items || []).filter((it) => !it.brk).length;
      const size = n > 22 ? 17 : n > 16 ? 20 : n > 12 ? 24 : n > 8 ? 30 : 36;
      for (const it of b.items || []) {
        if (it.brk) {
          // A break (job 315): stop, don't go straight into the next song. A
          // full-width band, unnumbered, so the DJ and the stage see it coming.
          const bh = Math.max(26, size * 1.05);
          room(bh + 10);
          tint(0.14); doc.rect(M, y - size * 0.72, W - 2 * M, bh, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(Math.max(14, size * 0.62)); ink(0.9);
          doc.text(pdfSafe([it.title || "Break", it.note].filter(has).join("  ·  ")).toUpperCase(), W / 2, y - size * 0.72 + bh / 2 + Math.max(14, size * 0.62) * 0.35, { align: "center" });
          y += bh + size * 0.35;
          continue;
        }
        doc.setFont("helvetica", "bold"); doc.setFontSize(size);
        const tlines = wrap(it.title, W - 2 * M - size * 2.2);
        const noteH = has(it.note) ? size * 0.55 + 4 : 0;
        const h = tlines.length * size * 1.08 + noteH + size * 0.45;
        room(h);
        ink(0.45); doc.text(String(it.n), M + size * 1.5, y, { align: "right" });
        ink(1); tlines.forEach((ln, j) => doc.text(ln, M + size * 2.1, y + j * size * 1.08));
        let yy = y + (tlines.length - 1) * size * 1.08;
        if (has(it.note)) { doc.setFont("helvetica", "normal"); doc.setFontSize(size * 0.55); ink(0.7); yy += size * 0.62; doc.text(wrap(it.note, W - 2 * M - size * 2.2)[0], M + size * 2.1, yy); }
        y = yy + size * 1.0 + (has(it.note) ? 2 : 0);
      }
      if (!n) { doc.setFont("helvetica", "normal"); doc.setFontSize(12); ink(0.6); doc.text("No songs yet.", M, y); y += 20; }
      continue;
    }
    if (b.type === "table") {
      const size = b.size || 10.5, LINE = size * 1.2;
      const cols = b.check ? [{ label: "", w: 22, box: true }, ...b.cols] : b.cols;
      const total = cols.reduce((a, c) => a + c.w, 0);
      const k = (W - 2 * M) / total; // stretch to the page width
      const head = () => {
        tint(0.1); doc.rect(M, y - 12, W - 2 * M, 18, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); ink(0.85);
        let x = M + 4;
        for (const c of cols) { const w = c.w * k; if (c.label) doc.text(c.label.toUpperCase(), c.align === "right" ? x + w - 10 : x, y, c.align === "right" ? { align: "right" } : undefined); x += w; }
        y += 18;
      };
      if (b.heading) { room(48); doc.setFont("helvetica", "bold"); doc.setFontSize(13); ink(1); doc.text(pdfSafe(b.heading), M, y); y += 20; }
      room(40); head();
      (b.rows || []).forEach((row, i) => {
        const cells = b.check ? ["", ...row] : row;
        const laid = cells.map((c, j) => { const col = cols[j]; doc.setFont("helvetica", col.bold ? "bold" : "normal"); doc.setFontSize(size); return col.box ? [""] : col.align === "right" ? [pdfSafe(c)] : wrap(c, col.w * k - 8); });
        const rowH = 18 + (Math.max(...laid.map((l) => l.length)) - 1) * LINE;
        if (y - 12 + rowH > BOTTOM + 6) { newPage(); head(); }
        if (i % 2 === 1) { tint(0.05); doc.rect(M, y - 12, W - 2 * M, rowH, "F"); }
        let x = M + 4;
        laid.forEach((lines, j) => {
          const col = cols[j], w = col.w * k;
          if (col.box) { doc.setDrawColor(FONT); alpha(0.55); doc.setLineWidth(0.8); doc.rect(x + 1, y - 9, 10, 10); }
          else {
            doc.setFont("helvetica", col.bold ? "bold" : "normal"); doc.setFontSize(size); ink(col.dim ? 0.72 : 1);
            if (col.align === "right") doc.text(lines[0], x + w - 10, y, { align: "right" });
            else lines.forEach((ln, jj) => doc.text(ln, x, y + jj * LINE));
          }
          x += w;
        });
        y += rowH;
      });
      if (!(b.rows || []).length) { doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); ink(0.6); doc.text(b.empty || "Nothing here yet.", M + 4, y); y += 18; }
      y += 16;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); ink(0.5);
    doc.text("Made with ShowPilot  ·  showpilot.space", M, H - 24);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 24, { align: "right" });
  }
  const base = String(pdfSafe(title) || "Event").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Event";
  return new File([doc.output("blob")], `${base} ${fileLabel}.pdf`, { type: "application/pdf" });
}

const eventLines = (gig, extra) => [[dayLong(gig.date), [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")].filter(Boolean).join("  ·  "), extra];
const eventTitle = (gig) => gig.event_name || gig.band_name || "Event";

// Acts in playing order: by set time when there is one, else lineup order.
export function actsInOrder(gig) {
  const times = gig.manager_info?.set_times || {};
  return [...(gig.bands || [])].filter((b) => b.band_name)
    .map((b, i) => ({ b, i, t: times[b.band_name] }))
    .sort((a, z) => (has(a.t) && has(z.t) ? toMin(a.t) - toMin(z.t) : has(a.t) ? -1 : has(z.t) ? 1 : (a.b.sort_order ?? a.i) - (z.b.sort_order ?? z.i)))
    .map(({ b, t }) => ({ name: b.band_name, time: t || "", length: b.set_length_minutes ? `${b.set_length_minutes} min` : "", headliner: !!b.is_headliner }));
}

export function lineupPdf(gig, style) {
  const acts = actsInOrder(gig);
  return sheetPdf({
    title: eventTitle(gig), lines: eventLines(gig, `Lineup  ·  ${acts.length} act${acts.length === 1 ? "" : "s"}`), style, fileLabel: "Lineup",
    blocks: [{ type: "table", size: 13, cols: [{ label: "#", w: 30, align: "right", dim: true }, { label: "Act", w: 300, bold: true }, { label: "Set time", w: 90 }, { label: "Length", w: 80, dim: true }],
      rows: acts.map((a, i) => [String(i + 1), a.headliner ? `${a.name}  (headliner)` : a.name, a.time, a.length]), empty: "No acts on the lineup yet." }],
  });
}

export function schedulePdf(gig, runOfShow, style) {
  const vi = gig.venue_info || {};
  return sheetPdf({
    title: eventTitle(gig), lines: eventLines(gig, "Day-of schedule"), style, fileLabel: "Day of Show",
    blocks: [
      { type: "table", size: 12.5, cols: [{ label: "Time", w: 90, bold: true }, { label: "What", w: 410 }],
        rows: runOfShow.map((r) => [r.time || "--", `${r.label}${r.kind === "curfew" && vi.hard_curfew ? " (hard)" : ""}`]), empty: "No times yet." },
      { type: "kv", heading: "Good to know", rows: [
        ["Address", vi.address], ["Load-in", vi.load_in_location], ["Load-in notes", vi.load_in_notes], ["Parking", vi.parking],
        ["Load out by", vi.load_out_by], ["Green room", vi.green_room], ["Meals", vi.meals], ["Drink tickets", vi.drink_tickets],
        ["Wi-Fi", [gig.wifi_network, gig.wifi_password].filter(Boolean).join("  /  ")],
      ] },
    ],
  });
}

// setlists: manager_info.setlists; act: one act's name, or null for all.
export function setlistPdf(gig, setlists, act, style) {
  const lists = (Array.isArray(setlists) ? setlists : []).filter((s) => (!act || s.act === act) && (s.songs || []).some((x) => x.kind !== "break" && has(x.title)));
  const blocks = [];
  lists.forEach((s, i) => {
    if (i) blocks.push({ type: "page" });
    // Breaks (kind "break") sit between songs and aren't numbered (job 315).
    const all = (s.songs || []).filter((x) => x.kind === "break" || has(x.title));
    const count = all.filter((x) => x.kind !== "break").length;
    let num = 0;
    const items = all.map((x) => (x.kind === "break" ? { brk: true, title: has(x.title) ? x.title : "Break", note: x.notes } : { n: ++num, title: x.title, note: x.notes }));
    blocks.push({ type: "big", heading: `${s.act}  ·  ${count} song${count === 1 ? "" : "s"}`, items });
  });
  if (!blocks.length) blocks.push({ type: "big", heading: act || "Set list", items: [] });
  return sheetPdf({ title: eventTitle(gig), lines: eventLines(gig, "Set list"), style, fileLabel: act && lists.length === 1 ? `${act} Set List` : "Set List", blocks });
}

// Everyone to reach on the event: [role, name, phone, email or address].
export function contactRows(gig) {
  const vi = gig.venue_info || {}, mi = gig.manager_info || {}, ei = gig.engineer_info || {};
  const rows = [];
  if (gig.venue || vi.address) rows.push(["Venue", gig.venue || "", "", vi.address || ""]);
  if (mi.contact_name || mi.contact_phone || mi.contact_email) rows.push([mi.contact_title ? `Manager (${mi.contact_title})` : "Manager", mi.contact_name || "", mi.contact_phone || "", mi.contact_email || ""]);
  (gig.bands || []).forEach((b) => { if (b.band_name && (b.submitter_name || b.submitter_phone || b.submitter_email)) rows.push([`Act: ${b.band_name}`, b.submitter_name || "", b.submitter_phone || "", b.submitter_email || ""]); });
  const lightsToo = !!ei.lighting?.same_as_audio;
  [[lightsToo ? "Audio + Lighting" : "Audio", ei.audio], ...(lightsToo ? [] : [["Lighting", ei.lighting]])].forEach(([r, i]) => { if (i && (i.contact_name || i.contact_phone || i.contact_email)) rows.push([r, i.contact_name || "", i.contact_phone || "", i.contact_email || ""]); });
  return rows;
}

export function contactsPdf(gig, style) {
  const rows = contactRows(gig);
  return sheetPdf({
    title: eventTitle(gig), lines: eventLines(gig, "Contact sheet"), style, fileLabel: "Contacts",
    blocks: [{ type: "table", size: 11, cols: [{ label: "Role", w: 120, bold: true }, { label: "Name", w: 130, bold: true }, { label: "Phone", w: 100 }, { label: "Email / address", w: 180, dim: true }], rows, empty: "No contacts filled in yet." }],
  });
}

export const pdfCounts = (gig) => ({
  acts: (gig.bands || []).filter((b) => b.band_name).length,
  songs: (gig.manager_info?.setlists || []).reduce((a, s) => a + (s.songs || []).filter((x) => x.kind !== "break" && has(x.title)).length, 0),
  guests: (gig.manager_info?.guests || []).filter((g) => has(g.name)).length,
});

// ---- Pin to board (job 314) ----
// Non-tech profiles pin live sheets to the event's home. Pins live with the
// profile that pinned them (venue_info.pins, manager_info.pins), so only
// that profile's editors change them and everyone on the event reads them.
export const PIN_TYPES = ["schedule", "lineup", "setlist", "contacts", "guests"];
export const PIN_LABEL = { schedule: "Day-of schedule", lineup: "Lineup", setlist: "Set list", contacts: "Contact sheet", guests: "Guest list" };
export function readPins(gig) {
  const out = [];
  const take = (list, by) => (Array.isArray(list) ? list : []).forEach((p) => {
    if (p && PIN_TYPES.includes(p.type) && !out.some((o) => o.type === p.type)) out.push({ type: p.type, by, at: p.at || null });
  });
  take(gig.venue_info?.pins, "venue");
  take(gig.manager_info?.pins, "manager");
  return out.sort((a, b) => PIN_TYPES.indexOf(a.type) - PIN_TYPES.indexOf(b.type));
}

// The day's run of show, same rules as RoleWorkspace's buildRunOfShow (kept
// here so the pinned board doesn't import the whole workspace): the venue's
// schedule, each act's set time, the artist's arrival; after-midnight times
// sort last.
export function runOfShowFor(gig) {
  const vi = gig.venue_info || {}, mi = gig.manager_info || {};
  const rows = (vi.schedule || []).filter((r) => has(r.time) || has(r.label))
    .map((r) => ({ time: r.time, label: r.label, kind: /curfew/i.test(r.label || "") ? "curfew" : /door/i.test(r.label || "") ? "doors" : "venue" }));
  (gig.bands || []).forEach((b) => {
    const t = (mi.set_times || {})[b.band_name];
    if (b.band_name && has(t)) rows.push({ time: t, label: `${b.band_name}${b.set_length_minutes ? ` · ${b.set_length_minutes} min` : ""}`, kind: "set" });
  });
  if (has(mi.arrival_time)) rows.push({ time: mi.arrival_time, label: "Artist arrives", kind: "travel" });
  const key = (t) => { const v = toMin(t); return v === 99999 ? 99999 : v < 360 ? v + 1440 : v; };
  return rows.sort((a, b) => key(a.time) - key(b.time));
}
