import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, ImagePlus, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { DEFAULT_PDF_STYLE } from "@/lib/guestListPdf";

const G = "#8CFF3D";
const BGS = ["#FFFFFF", "#0D0D0D", "#10142E", "#F5EFE0", "#1B3A2A", "#3A0E2E"];
const FONTS = ["#000000", "#FFFFFF", "#8CFF3D", "#FFB347", "#7FD8FF", "#FF6FB5"];
const KEEP = "showpilot_pdf_style";

// How light a color is, 0 (black) to 1 (white).
const light = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const readKept = () => {
  try { const v = JSON.parse(localStorage.getItem(KEEP) || "null"); return v && typeof v === "object" ? v : null; } catch { return null; }
};

// A phone photo, cropped to fill a letter page and made a JPEG, so the PDF
// stays small and the picture covers the whole page.
function pageImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const W = 1224, H = 1584; // letter at 144 dpi
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      c.getContext("2d").drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    im.src = url;
  });
}

// Create PDF opens this first (job 307): pick a background (a color, or a
// picture with the color faded over it) and the font color, see it on a
// small page, then Create PDF. The last colors are remembered on this
// device; the picture is not.
// destinations (job 313, Create PDFs): { docsLabel, docsDefault } shows two
// switches, Save to my phone and Add to the event's Documents, and onCreate
// gets (style, { phone, docs }).
export default function PdfStyleSheet({ title = "Guest list", eventName = "", onCreate, onClose, destinations = null, extra = null, previewLine = "24 people · 18 names" }) {
  const kept = readKept();
  const [bg, setBg] = useState(kept?.bg || DEFAULT_PDF_STYLE.bg);
  const [font, setFont] = useState(kept?.font || DEFAULT_PDF_STYLE.font);
  const [fade, setFade] = useState(typeof kept?.fade === "number" ? kept.fade : DEFAULT_PDF_STYLE.fade);
  const [mode, setMode] = useState("color");
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toPhone, setToPhone] = useState(true);
  const [toDocs, setToDocs] = useState(!!destinations?.docsDefault);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the words readable: a dark background with dark words (or light on
  // light) flips the words to white (or black).
  const pickBg = (c) => {
    setBg(c);
    if (Math.abs(light(c) - light(font)) < 0.35) setFont(light(c) > 0.5 ? "#000000" : "#FFFFFF");
  };
  const pickImage = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    try { setImage(await pageImage(f)); setMode("picture"); } catch { setErr("Couldn't use that picture. Try another one."); }
  };

  const style = { bg, font, fade, image: mode === "picture" ? image : null };
  const create = async () => {
    if (mode === "picture" && !image) { setErr("Choose a picture first, or pick Color."); return; }
    if (destinations && !toPhone && !toDocs) { setErr("Pick where the PDF goes: your phone, Documents, or both."); return; }
    try { localStorage.setItem(KEEP, JSON.stringify({ bg, font, fade })); } catch { /* fine */ }
    setBusy(true); setErr("");
    try { await onCreate(style, destinations ? { phone: toPhone, docs: toDocs } : undefined); onClose(); }
    catch { setErr("Couldn't make the PDF. Try again."); }
    setBusy(false);
  };

  const swatch = (c, on, pick, label) => (
    <button key={c} type="button" onClick={() => pick(c)} aria-label={label} aria-pressed={on}
      className="w-9 h-9 rounded-full shrink-0" style={{ background: c, boxShadow: on ? `0 0 0 2px #0d0d0d, 0 0 0 4px ${G}` : "inset 0 0 0 1px rgba(255,255,255,0.25)" }} />
  );
  const custom = (value, pick, label) => (
    <label className="relative w-9 h-9 rounded-full shrink-0 overflow-hidden cursor-pointer" title="Any color" aria-label={label}
      style={{ background: "conic-gradient(#f43f5e,#eab308,#22c55e,#06b6d4,#6366f1,#d946ef,#f43f5e)" }}>
      <input type="color" value={value} onChange={(e) => pick(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  );
  const label = (t) => <div className="mt-4 mb-2 text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>{t}</div>;

  // The small page: same layout as the PDF.
  const preview = (
    <div className="relative w-[150px] sm:w-[190px] shrink-0 rounded-md overflow-hidden" style={{ aspectRatio: "8.5 / 11", background: bg, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }} aria-label="Preview">
      {mode === "picture" && image && (
        <>
          <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: bg, opacity: fade }} />
        </>
      )}
      <div className="relative p-[9%] text-left" style={{ color: font, fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div className="font-bold text-[11px] leading-tight truncate">{eventName || "Your event"}</div>
        <div className="text-[6px] opacity-70 mt-0.5">{title}</div>
        <div className="font-bold text-[7px] mt-1.5">{previewLine}</div>
        <div className="mt-1.5 h-[7px] rounded-[1px]" style={{ background: font, opacity: 0.12 }} />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="relative flex items-center gap-1 h-[8px] mt-[1px]">
            {i % 2 === 1 && <span className="absolute inset-0" style={{ background: font, opacity: 0.06 }} />}
            <span className="relative w-[5px] h-[5px] border" style={{ borderColor: font, opacity: 0.6 }} />
            <span className="relative h-[3px] rounded-full" style={{ background: font, width: `${40 + ((i * 17) % 30)}%`, opacity: 0.9 }} />
          </div>
        ))}
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-black/70" role="dialog" aria-modal="true" aria-label="Style your PDF" onClick={onClose}>
      <div className="w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#121212] border border-[#262626] p-5 text-white" style={{ fontFamily: SCENE_FONT, paddingBottom: "max(20px, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-[22px] font-bold leading-none">Style your PDF</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="mt-4 flex gap-5">
          {preview}
          <div className="min-w-0 flex-1">
            {label("BACKGROUND")}
            <div role="radiogroup" aria-label="Background" className="flex gap-1 p-1 rounded-xl bg-[#0a0a0a] border border-[#232323]">
              {[["color", "Color"], ["picture", "Picture"]].map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => { setMode(k); if (k === "picture" && !image) fileRef.current?.click(); }}
                  className="flex-1 h-9 rounded-lg text-[14px] font-bold"
                  style={mode === k ? { background: "rgba(140,255,61,0.12)", color: G, border: "1px solid rgba(140,255,61,0.45)" } : { color: "rgba(255,255,255,0.6)", border: "1px solid transparent" }}>{l}</button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            {mode === "picture" && (
              <div className="mt-2.5 flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="h-9 px-3 rounded-lg border border-[#333] text-[14px] font-semibold flex items-center gap-1.5 text-white/85">
                  <ImagePlus className="w-4 h-4" /> {image ? "Change picture" : "Choose a picture"}
                </button>
              </div>
            )}
          </div>
        </div>

        {label(mode === "picture" ? "COLOR OVER THE PICTURE" : "BACKGROUND COLOR")}
        <div className="flex flex-wrap gap-2.5">
          {BGS.map((c) => swatch(c, bg.toUpperCase() === c, pickBg, `Background ${c}`))}
          {custom(bg, pickBg, "Any background color")}
        </div>
        {mode === "picture" && (
          <label className="mt-3 flex items-center gap-3 text-[14px] text-white/70">
            <span className="w-14 shrink-0">Fade</span>
            <input type="range" min={0} max={0.85} step={0.05} value={fade} onChange={(e) => setFade(Number(e.target.value))} className="flex-1 accent-[#8CFF3D]" aria-label="How much the color fades the picture" />
            <span className="w-10 text-right" style={{ fontFamily: SCENE_MONO }}>{Math.round(fade * 100)}%</span>
          </label>
        )}

        {label("FONT COLOR")}
        <div className="flex flex-wrap gap-2.5">
          {FONTS.map((c) => swatch(c, font.toUpperCase() === c, setFont, `Font ${c}`))}
          {custom(font, setFont, "Any font color")}
        </div>

        {extra}
        {destinations && (<>
          {label("WHERE IT GOES")}
          <div className="flex flex-col gap-2">
            {[[toPhone, setToPhone, "Save to my phone", "Share sheet on phones, a download on computers."], [toDocs, setToDocs, destinations.docsLabel, "Everyone with access to this profile on the event can open it."]].map(([on, set, l, sub]) => (
              <button key={l} type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="flex items-center gap-3 text-left px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#232323]">
                <span className="w-10 h-6 rounded-full relative shrink-0 transition-colors" style={{ background: on ? G : "#333" }}>
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-[#0d0d0d] transition-all" style={{ left: on ? 18 : 2 }} />
                </span>
                <span className="min-w-0"><span className="block text-[15px] font-semibold">{l}</span><span className="block text-[13px] text-white/50">{sub}</span></span>
              </button>
            ))}
          </div>
        </>)}
        {err && <p className="mt-3 mb-0 text-[14px] text-[#FF6B6B]">{err}</p>}
        <div className="mt-5 flex items-center gap-3">
          <button type="button" onClick={() => { setBg(DEFAULT_PDF_STYLE.bg); setFont(DEFAULT_PDF_STYLE.font); setMode("color"); setFade(DEFAULT_PDF_STYLE.fade); }} className="text-[14px] text-white/55 hover:text-white">Plain black on white</button>
          <span className="flex-1" />
          <button type="button" onClick={create} disabled={busy} className="h-12 px-5 rounded-full flex items-center gap-2 text-[16px] font-bold text-[#0d0d0d] disabled:opacity-60" style={{ background: G }}>
            <FileText className="w-5 h-5" /> {busy ? "Making..." : "Create PDF"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
