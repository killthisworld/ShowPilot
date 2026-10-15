import React, { useEffect, useState } from "react";
import { Download, QrCode, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { QR_DEFAULT, QR_SHAPES, normalizeQr, qrPng, qrSvg, scanWarning } from "@/lib/qrStyle";

const G = "#8CFF3D";

const FG_SWATCHES = ["#000000", "#1d4ed8", "#15803d", "#b91c1c", "#6d28d9", "#c2410c"];
const BG_SWATCHES = ["#ffffff", "#fef3c7", "#e0f2fe", "#dcfce7", "#fce7f3", "#f1f5f9"];

const slug = (s) => (s || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event";

function save(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Color row: a few safe swatches plus any color from the picker.
function ColorRow({ label, value, swatches, onChange }) {
  return (
    <div className="mt-3">
      <div className="text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>{label}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
            aria-pressed={value === c}
            className="w-7 h-7 rounded-full shrink-0"
            style={{ background: c, border: "1px solid rgba(255,255,255,0.25)", boxShadow: value === c ? `0 0 0 2px #0d0d0d, 0 0 0 4px ${G}` : "none" }}
          />
        ))}
        <label className="relative w-7 h-7 rounded-full overflow-hidden shrink-0 cursor-pointer" title="Pick any color" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)", border: "1px solid rgba(255,255,255,0.25)" }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Pick ${label} color`} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </label>
      </div>
    </div>
  );
}

// "QR" button for the fan page link. Opens a panel with a big QR code and
// PNG / SVG downloads for flyers, posters and socials. The owner can also
// pick the code's color, background and shape (`onSaveStyle` saves them with
// the event, so everyone who shares the QR shares the same look).
export default function FanQrCode({ url, eventName, style, onSaveStyle }) {
  const [open, setOpen] = useState(false);
  const saved = normalizeQr(style);
  const [draft, setDraft] = useState(saved);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const savedKey = JSON.stringify(saved);
  const dirty = JSON.stringify(draft) !== savedKey;

  // Start from the saved look each time the panel opens (or the saved look changes).
  useEffect(() => { if (open) { setDraft(normalizeQr(JSON.parse(savedKey))); setErr(""); setDone(false); } }, [open, savedKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  let svg = "";
  try { svg = url ? qrSvg(url, draft, 0) : ""; } catch { svg = ""; }
  const preview = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "";
  const warn = scanWarning(draft);
  const edit = (patch) => { setDone(false); setErr(""); setDraft((d) => ({ ...d, ...patch })); };

  const name = `${slug(eventName)}-qr`;
  const downloadPng = async () => {
    try { save(await qrPng(url, draft, 1200), `${name}.png`); } catch { setErr("Couldn't make the PNG."); }
  };
  const downloadSvg = () => {
    try {
      const href = URL.createObjectURL(new Blob([qrSvg(url, draft, 1200)], { type: "image/svg+xml" }));
      save(href, `${name}.svg`);
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch { setErr("Couldn't make the SVG."); }
  };
  const saveStyle = async () => {
    setSaving(true);
    setErr("");
    const ok = await onSaveStyle(draft);
    setSaving(false);
    if (ok) setDone(true); else setErr("Couldn't save the look. Try again.");
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
            <div className="mt-3 mx-auto w-full max-w-[300px] aspect-square rounded-xl overflow-hidden flex items-center justify-center" style={{ background: draft.bg }}>
              {preview ? <img src={preview} alt={`QR code that opens ${url}`} className="w-full h-full" /> : <div className="text-[13px] text-black/50">Couldn't make the QR code.</div>}
            </div>
            <p className="mt-3 text-center text-[11px] text-white/55 break-all" style={{ fontFamily: SCENE_MONO }}>{url}</p>

            {onSaveStyle && (
              <div className="mt-3 pt-1 border-t border-[#1f1f1f]">
                <div className="mt-3 text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>SHAPE</div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 bg-[#111] border border-[#1f1f1f] rounded-[10px] p-1.5" role="radiogroup" aria-label="QR code shape">
                  {QR_SHAPES.map(([k, text]) => {
                    const sel = draft.shape === k;
                    return (
                      <button key={k} type="button" role="radio" aria-checked={sel} onClick={() => edit({ shape: k })} className="py-2 rounded-[7px] text-[15px] font-semibold" style={sel ? { background: "rgba(140,255,61,0.14)", color: G, boxShadow: "inset 0 0 0 1px rgba(140,255,61,0.45)" } : { color: "rgba(255,255,255,0.6)" }}>{text}</button>
                    );
                  })}
                </div>
                <ColorRow label="CODE COLOR" value={draft.fg} swatches={FG_SWATCHES} onChange={(c) => edit({ fg: c })} />
                <ColorRow label="BACKGROUND" value={draft.bg} swatches={BG_SWATCHES} onChange={(c) => edit({ bg: c })} />
                {warn && <p className="mt-3 text-[13px] leading-snug text-amber-300/90">{warn}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={saveStyle} disabled={!dirty || saving} className="py-2.5 rounded-[10px] text-sm font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: G, color: "#0d0d0d" }}>
                    {saving ? "SAVING…" : done && !dirty ? "SAVED" : "SAVE LOOK"}
                  </button>
                  <button type="button" onClick={() => edit({ ...QR_DEFAULT })} disabled={JSON.stringify(draft) === JSON.stringify(QR_DEFAULT)} className="py-2.5 rounded-[10px] text-sm font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: "#111", border: "1px solid #2a2a2a", color: "rgba(255,255,255,0.7)" }}>RESET</button>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={!preview} onClick={downloadPng} className="flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: G, color: "#0d0d0d" }}>
                <Download className="w-4 h-4" /> PNG
              </button>
              <button type="button" disabled={!preview} onClick={downloadSvg} className="flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}>
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
