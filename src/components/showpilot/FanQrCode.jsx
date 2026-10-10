import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

const G = "#8CFF3D";

// Black on white with a quiet zone: the most reliable thing for phone cameras
// to scan, on a flyer, a screen or a door sign. Medium error correction
// survives a fold, glare or a bit of tape.
const OPTS = { errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } };

const slug = (s) => (s || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event";

function save(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// "QR" button for the fan page link. Opens a panel with a big QR code and
// PNG / SVG downloads for flyers, posters and socials.
export default function FanQrCode({ url, eventName }) {
  const [open, setOpen] = useState(false);
  const [png, setPng] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !url) return undefined;
    let alive = true;
    setErr("");
    QRCode.toDataURL(url, { ...OPTS, width: 1200 })
      .then((d) => { if (alive) setPng(d); })
      .catch(() => { if (alive) setErr("Couldn't make the QR code."); });
    return () => { alive = false; };
  }, [open, url]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const name = `${slug(eventName)}-qr`;
  const downloadSvg = async () => {
    try {
      const svg = await QRCode.toString(url, { ...OPTS, type: "svg" });
      const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      save(href, `${name}.svg`);
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch { setErr("Couldn't make the SVG."); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="QR code for the fan page"
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-bold tracking-[0.06em]"
        style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}
      >
        <QrCode className="w-4 h-4" /> QR
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ fontFamily: SCENE_FONT }} role="dialog" aria-modal="true" aria-label="Fan page QR code">
          <div className="absolute inset-0 bg-black/75" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[380px] max-h-[94vh] overflow-y-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xl font-bold text-white">Fan page QR code</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="mt-3 mx-auto w-full max-w-[300px] aspect-square rounded-xl bg-white p-2 flex items-center justify-center">
              {png ? <img src={png} alt={`QR code that opens ${url}`} className="w-full h-full" /> : !err && <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />}
            </div>
            <p className="mt-3 text-center text-[11px] text-white/55 break-all" style={{ fontFamily: SCENE_MONO }}>{url}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={!png} onClick={() => save(png, `${name}.png`)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: G, color: "#0d0d0d" }}>
                <Download className="w-4 h-4" /> PNG
              </button>
              <button type="button" onClick={downloadSvg} className="flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm font-bold tracking-[0.06em]" style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}>
                <Download className="w-4 h-4" /> SVG
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-snug text-white/45">PNG for flyers, stories and posts. SVG stays sharp at any print size, from a door sign to a banner. Scan it with your phone before you print to make sure it opens.</p>
            {err && <p className="mt-2 text-[13px] text-red-400">{err}</p>}
          </div>
        </div>
      )}
    </>
  );
}
