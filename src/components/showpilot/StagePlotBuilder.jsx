import React, { useState } from "react";
import jsPDF from "jspdf";
import { Download, FileDown, Loader2 } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { positionOfMember, positionColor, positionLabel } from "@/lib/stagePositions";
import { stageIconSvg, stageIconPng } from "@/lib/stageIcons";
import { memberLook } from "@/lib/customPositions";
import { isVocalInput, memberSings } from "@/components/showpilot/VocalsQuestion";

// Make a stage plot right on the intake form (job 249): every member from
// "Members and inputs" is a token the act drags onto the stage (audience at
// the bottom), then "Make my stage plot" draws a simple PDF - the stage with
// everyone placed, plus who plays what - and adds it to their stage plot
// files like an upload. Positions live on each member (stage_x / stage_y,
// 0-1 across and down the stage), so nothing new is stored anywhere else.
// Black stage, each member colored by their position (drums, keys, guitar...);
// `colors` are the link's engineer's own colors from Settings, else defaults.
const G = "#8CFF3D";
const MADE_PREFIX = "Stage plot - ";

const placed = (m) => typeof m.stage_x === "number" && typeof m.stage_y === "number";

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// The PDF (job 290): portrait letter on black. The stage centered across
// the top, as big as the page allows (same 4:3 as the app), everyone drawn as
// their instrument in their color. Below it: WHO PLAYS WHAT - each member's
// full line, "Name -> every instrument + Vocals -> IEM / Monitor" - then the
// INPUT LIST, one numbered row per input. Runs onto more pages if needed.
const BUS_DEFAULT = { IEM: "#EAB308", Monitor: "#F97316" };

export async function stagePlotPdf({ actName, members, getInstruments, colors, busColors = null }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const black = () => { doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, H, "F"); };
  black();
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(actName || "Stage plot", W / 2, M + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(150);
  doc.text(actName ? "STAGE PLOT  ·  made with ShowPilot" : "made with ShowPilot", W / 2, M + 30, { align: "center" });

  // Stage: full width between the margins, centered, 4:3.
  const sw = 520, sh = 390;
  const sx = (W - sw) / 2, sy = M + 40;
  doc.setDrawColor(200);
  doc.setLineWidth(1.5);
  doc.roundedRect(sx, sy, sw, sh, 8, 8);
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text("BACK OF STAGE", sx + sw / 2, sy + 16, { align: "center" });
  // The front: a thick bright edge, "STAGE FRONT", arrows down to the audience.
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(4);
  doc.line(sx + 2, sy + sh, sx + sw - 2, sy + sh);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("STAGE FRONT", sx + sw / 2, sy + sh - 9, { align: "center" });
  doc.setFillColor(255, 255, 255);
  [0.15, 0.32, 0.68, 0.85].forEach((f) => {
    const ax = sx + sw * f, ay = sy + sh + 8;
    doc.triangle(ax - 6, ay, ax + 6, ay, ax, ay + 9, "F");
  });
  doc.setFontSize(12);
  doc.text("AUDIENCE", sx + sw / 2, sy + sh + 25, { align: "center" });

  // Their own instruments keep their color and icon (job 274).
  const list = members.map((m, i) => {
    const { color, icon } = memberLook(m, getInstruments, colors);
    const insts = (getInstruments(m) || []).filter((x) => String(x?.name || "").trim());
    return { m, i, color, icon, insts, name: (m.name || "").trim() || `Member ${i + 1}` };
  });
  const icons = {};
  for (const { icon, color } of list) {
    const k = icon + color;
    if (!icons[k]) icons[k] = await stageIconPng(icon, color);
  }
  list.filter(({ m }) => placed(m)).forEach(({ m, icon, color, insts, name }) => {
    const cx = sx + m.stage_x * sw, cy = sy + m.stage_y * sh;
    doc.addImage(icons[icon + color], "PNG", cx - 24, cy - 24, 48, 48, icon + color, "FAST");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10.5);
    doc.text(name, cx, cy + 35, { align: "center" });
    const played = insts.filter((x) => !isVocalInput(x)).map((x) => x.name);
    const sub = played.join(", ") || (memberSings(m, insts) ? "Vocals" : "");
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...rgb(color));
      doc.text(doc.splitTextToSize(sub, 130), cx, cy + 47, { align: "center" });
    }
  });

  // Below the stage, onto more pages when it runs long.
  let y = sy + sh + 50;
  const room = (h) => { if (y + h > H - M) { doc.addPage(); black(); y = M + 12; } };
  const heading = (t) => {
    room(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(t, M, y);
    doc.setDrawColor(70);
    doc.setLineWidth(0.75);
    doc.line(M, y + 6, W - M, y + 6);
    y += 20;
  };

  // WHO PLAYS WHAT: the app's member line, written out in full.
  const buses = { ...BUS_DEFAULT, ...(busColors || {}) };
  heading("WHO PLAYS WHAT");
  list.forEach(({ m, icon, color, insts, name }) => {
    const played = insts.filter((x) => !isVocalInput(x)).map((x) => x.name);
    const sings = memberSings(m, insts);
    const what = [...played, ...(sings ? ["Vocals"] : [])].join(", ");
    const parts = [{ t: name, bold: true, c: [255, 255, 255] }];
    if (what) parts.push({ arrow: true }, { t: what, c: [215, 215, 215] });
    if (m.bus_type) parts.push({ arrow: true }, { t: m.bus_type, bold: true, c: rgb(buses[m.bus_type] || "#ffffff") });
    room(18);
    doc.addImage(icons[icon + color], "PNG", M, y - 11, 14, 14, icon + color, "FAST");
    // Word by word so a long line wraps under itself.
    let x = M + 20;
    doc.setFontSize(11);
    parts.forEach(({ t, bold, c, arrow }) => {
      // The app's arrow, drawn (the PDF's font has no arrow character).
      if (arrow) {
        if (x + 22 > W - M) { y += 14; room(14); x = M + 20; }
        doc.setDrawColor(110); doc.setFillColor(110, 110, 110); doc.setLineWidth(1);
        doc.line(x + 6, y - 3.5, x + 14, y - 3.5);
        doc.triangle(x + 13, y - 6.5, x + 13, y - 0.5, x + 17, y - 3.5, "F");
        x += 23;
        return;
      }
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(...c);
      const words = t.split(/(?<=,) /);
      words.forEach((w, k) => {
        const piece = k < words.length - 1 ? w + " " : w;
        const pw = doc.getTextWidth(piece);
        if (x + pw > W - M && x > M + 20) { y += 14; room(14); x = M + 20; }
        doc.text(piece, x, y);
        x += pw;
      });
    });
    y += 16;
  });

  // INPUT LIST: one numbered row per input.
  const rows = [];
  list.forEach(({ m, insts, name }) => {
    insts.forEach((x) => rows.push({ who: name, input: x.name, how: x.mic_di || "", p48: !!x.phantom_power }));
    if (memberSings(m, insts) && !insts.some(isVocalInput)) rows.push({ who: name, input: "Vocals", how: "Mic", p48: false });
  });
  // Two columns side by side, filled top to bottom, so a band's inputs
  // mostly fit under the stage; the rest carry on to the next page.
  if (rows.length) {
    y += 4;
    heading("INPUT LIST");
    const gap = 20, cw = (W - 2 * M - gap) / 2, RH = 14;
    const colX = (c) => M + c * (cw + gap);
    const at = (x) => ({ n: x, input: x + 22, who: x + 132, how: x + 192, p48: x + cw - 30 });
    const head = (cols) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(140);
      cols.forEach((c) => { const k = at(colX(c)); doc.text("CH", k.n, y); doc.text("INPUT", k.input, y); doc.text("MEMBER", k.who, y); doc.text("MIC/DI", k.how, y); doc.text("48V", k.p48, y); });
      y += 14;
    };
    let k = 0;
    while (k < rows.length) {
      room(RH + 16);
      const per = Math.max(1, Math.floor((H - M - y - 14 + 4) / RH));
      head(rows.length - k > per ? [0, 1] : [0]);
      for (let c = 0; c < 2 && k < rows.length; c++) {
        let ry = y;
        for (let j = 0; j < per && k < rows.length; j++, k++) {
          const r = rows[k], p = at(colX(c));
          if (k % 2 === 0) { doc.setFillColor(20, 20, 20); doc.rect(p.n - 4, ry - 10, cw + 4, RH, "F"); }
          doc.setFontSize(9.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(String(k + 1), p.n, ry);
          doc.setFont("helvetica", "normal");
          doc.text(doc.splitTextToSize(r.input, p.who - p.input - 6)[0], p.input, ry);
          doc.setTextColor(190);
          doc.text(doc.splitTextToSize(r.who, p.how - p.who - 6)[0], p.who, ry);
          doc.text(r.how || "-", p.how, ry);
          if (r.p48) { doc.setTextColor(...rgb(G)); doc.text("+48V", p.p48, ry); }
          ry += RH;
        }
      }
      y = H; // anything left starts a new page
    }
  }
  return doc;
}

// The Stage plot circle's buttons (job 252): the PDF is made from the stage the
// act built in "Build your stage" (Members and inputs), added to their stage
// plot files like an upload, and can be saved to their phone or computer.
// `downloadOnly` (intake, job 257): just a small "Download as PDF" link that
// makes the PDF and saves it to their device; nothing is added to the files.
export default function StagePlotPdfActions({ members = [], getInstruments, actName, files = [], onRemoveFile, onAddFile, colors = null, downloadOnly = false }) {
  const [making, setMaking] = useState(false);
  const [madeNote, setMadeNote] = useState("");
  const [made, setMade] = useState(null);
  const onCount = members.filter(placed).length;

  const make = async () => {
    setMaking(true);
    setMadeNote("");
    try {
      const doc = await stagePlotPdf({ actName, members, getInstruments, colors });
      const name = `${MADE_PREFIX}${(actName || "My act").replace(/[\\/:*?"<>|]+/g, "").trim()}.pdf`;
      // One made plot at a time: a new one replaces the last.
      files.map((f, i) => [f, i]).filter(([f]) => String(f.name || "").startsWith(MADE_PREFIX)).map(([, i]) => i).reverse().forEach((i) => onRemoveFile(i));
      const file = new File([doc.output("blob")], name, { type: "application/pdf" });
      await onAddFile(file);
      setMade(file);
      setMadeNote("Added to your stage plot files.");
    } catch (err) {
      console.error(err);
      setMadeNote("Couldn't make it. Try again.");
    }
    setMaking(false);
  };

  // Save to their phone or computer: the share sheet where there is one, else a download.
  const savePdf = async (f = made) => {
    if (!f?.name) return;
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: f.name }); return; }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const download = async () => {
    setMaking(true);
    try {
      const doc = await stagePlotPdf({ actName, members, getInstruments, colors });
      const name = `${MADE_PREFIX}${(actName || "My act").replace(/[\\/:*?"<>|]+/g, "").trim()}.pdf`;
      await savePdf(new File([doc.output("blob")], name, { type: "application/pdf" }));
    } catch (err) { console.error(err); }
    setMaking(false);
  };
  if (downloadOnly) {
    if (onCount === 0) return null;
    return (
      <button type="button" onClick={download} disabled={making} className="w-full h-full min-h-[52px] px-3 rounded-[12px] border-[1.5px] border-[#3a3a3a] text-white/75 text-[14px] flex items-center justify-center gap-2 hover:border-white/40 disabled:opacity-50">
        {making ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Download PDF
      </button>
    );
  }

  if (onCount === 0) {
    return <p className="text-[13px] text-white/45 text-center py-1">No stage plot? Put everyone on the stage above and ShowPilot makes one for you.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={make} disabled={making}
        className="min-h-[46px] rounded-xl font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: G, color: "#0d0d0d" }}>
        {making ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        {making ? "Making it…" : made ? "Make it again" : "Make my stage plot"}
      </button>
      {madeNote && <span className="text-center text-[12.5px]" style={{ color: madeNote.startsWith("Added") ? G : "#f87171" }}>{madeNote}</span>}
      {made && (
        <button type="button" onClick={savePdf} className="min-h-[46px] rounded-xl border font-semibold text-[14.5px] flex items-center justify-center gap-2" style={{ borderColor: G + "66", color: G, background: G + "12" }}>
          <Download className="w-4 h-4" /> Save PDF to my device
        </button>
      )}
    </div>
  );
}
