import React, { useRef, useState } from "react";
import jsPDF from "jspdf";
import { ChevronsDown, Download, FileDown, Loader2, X } from "lucide-react";
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

const clamp = (v) => Math.min(0.95, Math.max(0.05, v));
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

export default function StagePlotBuilder({ members = [], getInstruments, onPlace, actName, files = [], onRemoveFile, onAddFile, colors = null }) {
  const stage = useRef(null);
  const [drag, setDrag] = useState(null); // member index being dragged
  const [picked, setPicked] = useState(null); // tapped token: shows "Take off stage"
  const [making, setMaking] = useState(false);
  const [madeNote, setMadeNote] = useState("");
  const [made, setMade] = useState(null); // the last made PDF, to save to their device

  const posFrom = (e) => {
    const r = stage.current.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  };
  const startDrag = (i) => (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); setDrag(i); setPicked(i); };
  const moveDrag = (e) => { if (drag === null) return; const [x, y] = posFrom(e); onPlace(drag, x, y); };
  const endDrag = () => setDrag(null);

  // Put a member on stage: the first free spot, front row left to right, then
  // the back row, then the middle (never on top of someone already there).
  const SPOTS = [0.2, 0.4, 0.6, 0.8].map((x) => [x, 0.66]).concat([0.2, 0.4, 0.6, 0.8].map((x) => [x, 0.3]), [0.3, 0.5, 0.7].map((x) => [x, 0.48]));
  const putOn = (i) => {
    const taken = members.filter(placed);
    const free = SPOTS.find(([x, y]) => !taken.some((m) => Math.abs(m.stage_x - x) < 0.12 && Math.abs(m.stage_y - y) < 0.12)) || [0.5, 0.5];
    onPlace(i, free[0], free[1]);
    setPicked(i);
  };
  const takeOff = (i) => { onPlace(i, null, null); setPicked(null); };

  // Save the made PDF to their phone or computer: the share sheet on phones
  // that have one (Save to Files / Photos / AirDrop...), else a download.
  const savePdf = async () => {
    if (!made) return;
    try {
      if (navigator.canShare?.({ files: [made] })) { await navigator.share({ files: [made], title: made.name }); return; }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    const url = URL.createObjectURL(made);
    const a = document.createElement("a");
    a.href = url;
    a.download = made.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

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

  const named = members.map((m, i) => ({ m, i })).filter(({ m }) => (m.name || "").trim() || (getInstruments(m) || []).some((x) => x.name));
  const off = named.filter(({ m }) => !placed(m));
  const onCount = named.length - off.length;

  if (!named.length) {
    return <p className="text-[13.5px] text-white/50 text-center py-3">Add your members in "Members and inputs" first, then place them here.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={stage}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(e) => { if (e.target === stage.current) setPicked(null); }}
        className="relative w-full rounded-[14px] border border-[#3a3a3a] border-b-4 border-b-white bg-black select-none"
        style={{ aspectRatio: "4 / 3", touchAction: "none" }}
        aria-label="Stage. Drag each member to where they stand."
      >
        <span className="absolute top-1.5 left-0 right-0 text-center text-[9.5px] tracking-[0.18em] text-white/30 pointer-events-none" style={{ fontFamily: SCENE_MONO }}>BACK OF STAGE</span>
        {/* The front: a thick bright edge with its name on it (job 249). */}
        <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10.5px] font-bold tracking-[0.18em] text-white pointer-events-none" style={{ fontFamily: SCENE_MONO }}>STAGE FRONT</span>
        {named.filter(({ m }) => placed(m)).map(({ m, i }) => {
          const inst = (getInstruments(m) || []).map((x) => x.name).filter(Boolean).join(", ");
          const pos = positionOfMember(m, getInstruments);
          const pc = positionColor(pos, colors);
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${m.stage_x * 100}%`, top: `${m.stage_y * 100}%`, zIndex: drag === i ? 3 : 2 }}>
              <button
                type="button"
                onPointerDown={startDrag(i)}
                aria-label={`${m.name || `Member ${i + 1}`}: drag to move`}
                className="w-12 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing [&>svg]:w-full [&>svg]:h-full"
                style={{ touchAction: "none", filter: drag === i || picked === i ? `drop-shadow(0 0 8px ${pc})` : "none" }}
                dangerouslySetInnerHTML={{ __html: stageIconSvg(pos, pc, 48) }}
              />
              <span className="mt-1 max-w-[96px] text-center text-[11px] font-semibold text-white leading-tight truncate pointer-events-none">{m.name || `Member ${i + 1}`}</span>
              {inst && <span className="max-w-[96px] text-center text-[10px] leading-tight truncate pointer-events-none" style={{ color: pc }}>{inst}</span>}
            </div>
          );
        })}
      </div>
      <div className="-mt-1 flex items-center justify-center gap-3 text-white" aria-label="The audience is this way">
        <ChevronsDown className="w-4 h-4" />
        <span className="text-[12px] font-bold tracking-[0.18em]" style={{ fontFamily: SCENE_MONO }}>AUDIENCE</span>
        <ChevronsDown className="w-4 h-4" />
      </div>

      {picked !== null && placed(members[picked] || {}) && (
        <button type="button" onClick={() => takeOff(picked)} className="self-center min-h-[36px] px-3 rounded-full border border-[#3a3a3a] text-[12.5px] text-white/60 flex items-center gap-1.5"><X className="w-3.5 h-3.5" />Take {members[picked]?.name || "them"} off stage</button>
      )}

      {off.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-white/50">Tap to put on stage, then drag into place:</span>
          <div className="flex flex-wrap gap-1.5">
            {off.map(({ m, i }) => (
              <button key={i} type="button" onClick={() => putOn(i)} className="min-h-[38px] px-3 rounded-full border text-[13px] font-semibold" style={{ borderColor: positionColor(positionOfMember(m, getInstruments), colors) + "88", color: positionColor(positionOfMember(m, getInstruments), colors) }}>
                + {m.name || `Member ${i + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={make}
        disabled={making || onCount === 0}
        className="min-h-[46px] rounded-xl font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: G, color: "#0d0d0d" }}
      >
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
