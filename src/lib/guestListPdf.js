import jsPDF from "jspdf";

// Door lists as a PDF (job 304), alphabetical, with a box to tick at the
// door. Letter size, black on white so it prints cleanly.
//
// kind "rsvps":  everyone who RSVP'd on the fan page
//   rows: [{ name, email, guests, artist_name, created_at }]
// kind "guests": the event's guest list (names the acts / management add)
//   rows: [{ name, plus, artist }]
export function guestListPdf({ kind = "rsvps", rows: input, eventName, eventDate, venue, closeAt, capacity }) {
  const guestsKind = kind === "guests";
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
  const fit = (text, w) => {
    let t = String(text ?? "");
    if (doc.getTextWidth(t) <= w) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > w) t = t.slice(0, -1);
    return `${t}…`;
  };

  // ---- Header ----
  let y = M + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(0);
  doc.text(fit(eventName || "Event", W - 2 * M), M, y);
  y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(70);
  const sub = [eventDate ? fmtDay(eventDate) : null, venue].filter(Boolean).join("  ·  ");
  if (sub) { doc.text(fit(sub, W - 2 * M), M, y); y += 15; }
  const closeLine = closeAt ? (new Date(closeAt) <= new Date() ? `RSVPs closed ${fmtWhen(closeAt)}` : `RSVPs close ${fmtWhen(closeAt)}`) : null;
  doc.text([`${guestsKind ? "Guest list" : "RSVPs"} as of ${fmtWhen(new Date().toISOString())}`, guestsKind ? null : closeLine].filter(Boolean).join("  ·  "), M, y);
  y += 22;

  // Totals
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0);
  doc.text(guestsKind
    ? `${people} ${people === 1 ? "person" : "people"}  ·  ${rows.length} ${rows.length === 1 ? "name" : "names"}`
    : `${people} ${people === 1 ? "person" : "people"}${capacity ? ` of ${capacity}` : ""}  ·  ${rows.length} ${rows.length === 1 ? "RSVP" : "RSVPs"}`, M, y);
  y += 16;
  if (hasArtists) {
    const m = new Map();
    for (const r of rows) { const k = r.artist_name || (guestsKind ? "No artist" : "No pick"); m.set(k, (m.get(k) || 0) + (r.guests || 1)); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50);
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
    doc.setFillColor(238); doc.rect(M, y - 12, W - 2 * M, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(40);
    let x = M + 4;
    for (const [t, w] of cols) { doc.text(t.toUpperCase(), right(t) ? x + w - 10 : x, y, right(t) ? { align: "right" } : undefined); x += w; }
    y += 18;
  };
  header();
  const sorted = [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  doc.setFontSize(10.5);
  sorted.forEach((r, i) => {
    if (y > BOTTOM) { doc.addPage(); y = M + 10; header(); doc.setFontSize(10.5); }
    if (i % 2 === 1) { doc.setFillColor(248); doc.rect(M, y - 12, W - 2 * M, 18, "F"); }
    let x = M + 4;
    doc.setDrawColor(120); doc.setLineWidth(0.8); doc.rect(x + 1, y - 9, 10, 10);
    x += cols[0][1];
    const cells = guestsKind
      ? [r.name, r.plus ? `+${r.plus}` : "", String(r.guests), ...(hasArtists ? [r.artist_name || "No artist"] : [])]
      : hasArtists
      ? [r.name, r.email, String(r.guests || 1), r.artist_name || "No pick", new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })]
      : [r.name, r.email, String(r.guests || 1), new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })];
    cells.forEach((c, k) => {
      const [t, w] = cols[k + 1];
      doc.setFont("helvetica", t === "Name" || t === "Party" ? "bold" : "normal"); doc.setTextColor(t === "Email" || t === "RSVP'd" || t === "Plus" ? 70 : 0);
      if (right(t)) doc.text(c, x + w - 10, y, { align: "right" });
      else doc.text(fit(c, w - 8), x, y);
      x += w;
    });
    y += 18;
  });
  if (!rows.length) { doc.setFont("helvetica", "normal"); doc.setTextColor(90); doc.text(guestsKind ? "No names on the guest list yet." : "No RSVPs yet.", M + 4, y); }

  // ---- Footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(130);
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
