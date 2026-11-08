import React, { useState } from "react";
import jsPDF from "jspdf";
import { Download, FileDown, Loader2 } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { positionOfMember, positionColor, positionLabel } from "@/lib/stagePositions";
import { stageIconSvg, stageIconPng } from "@/lib/stageIcons";

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

// The PDF: landscape letter on black. Stage on the left with everyone placed,
// each drawn as their instrument in their position's color; who plays what
// and the key on the right.
export async function stagePlotPdf({ actName, members, getInstruments, colors }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, W, H, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(actName || "Stage plot", M, M + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(150);
  doc.text(actName ? "STAGE PLOT  ·  made with ShowPilot" : "made with ShowPilot", M, M + 32);

  // Stage.
  const sx = M, sy = M + 52, sw = 470, sh = 400;
  doc.setDrawColor(200);
  doc.setLineWidth(1.5);
  doc.roundedRect(sx, sy, sw, sh, 8, 8);
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text("BACK OF STAGE", sx + sw / 2, sy + 16, { align: "center" });
  // The front (job 249): a thick bright edge, "STAGE FRONT", arrows down to the audience.
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
  doc.text("AUDIENCE", sx + sw / 2, sy + sh + 30, { align: "center" });

  const list = members.map((m, i) => {
    const pos = positionOfMember(m, getInstruments);
    return { m, i, pos, color: positionColor(pos, colors), inst: (getInstruments(m) || []).map((x) => x.name).filter(Boolean) };
  });
  // Each position's icon as an image, once.
  const icons = {};
  for (const { pos, color } of list) {
    const k = pos + color;
    if (!icons[k]) icons[k] = await stageIconPng(pos, color);
  }
  list.filter(({ m }) => placed(m)).forEach(({ m, i, pos, color, inst }) => {
    const cx = sx + m.stage_x * sw, cy = sy + m.stage_y * sh;
    doc.addImage(icons[pos + color], "PNG", cx - 20, cy - 20, 40, 40, pos + color, "FAST");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9.5);
    doc.text(m.name || `Member ${i + 1}`, cx, cy + 30, { align: "center" });
    if (inst.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...rgb(color));
      doc.text(doc.splitTextToSize(inst.join(", "), 120), cx, cy + 41, { align: "center" });
    }
  });

  // Who plays what.
  const lx = sx + sw + 30, lw = W - lx - M;
  let y = sy + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("WHO PLAYS WHAT", lx, y);
  y += 18;
  list.forEach(({ m, i, pos, color }) => {
    doc.addImage(icons[pos + color], "PNG", lx - 1, y - 10, 12, 12, pos + color, "FAST");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(m.name || `Member ${i + 1}`, lx + 13, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(190);
    (getInstruments(m) || []).filter((x) => x.name).forEach((x) => {
      const bits = [x.name, x.mic_di, x.phantom_power ? "+48V" : ""].filter(Boolean).join("  ·  ");
      doc.splitTextToSize(bits, lw - 13).forEach((line) => { doc.text(line, lx + 13, y); y += 11; });
    });
    y += 7;
  });

  // Color key: just the positions on this plot.
  const used = [...new Set(list.map((l) => l.pos))];
  if (used.length) {
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("KEY", lx, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    used.forEach((k) => {
      doc.addImage(icons[k + positionColor(k, colors)], "PNG", lx - 1, y - 10, 12, 12, k + positionColor(k, colors), "FAST");
      doc.setTextColor(220);
      doc.text(positionLabel(k), lx + 16, y);
      y += 14;
    });
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
