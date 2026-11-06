import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, RotateCcw, Smartphone, Monitor, X } from "lucide-react";
import { createFilm, recordFilm, FILM_SECONDS } from "@/lib/afterShowFilm";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Stellar Birth, the after-the-show film (job 239), full screen. It plays
// through; when it ends the screen offers Save video, Replay and Back to sky.
// Vertical (phone) or horizontal (TV / computer), for watching and saving.
// Used by fans in their sky after the show and by the host as a preview.
const SUN = "#FFB347";

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const im = new Image();
    im.crossOrigin = "anonymous"; // keeps the canvas recordable
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

let fontsReady = null;
function loadFonts() {
  if (!fontsReady) {
    fontsReady = document.fonts
      ? Promise.all([
        document.fonts.load('700 100px "Barlow Condensed"'),
        document.fonts.load('500 32px "IBM Plex Mono"'),
        document.fonts.load("600 36px Inter"),
      ]).catch(() => {})
      : Promise.resolve();
  }
  return fontsReady;
}

export default function AfterShowFilm({ stars, title, dateLine, imageUrl, show, fileName = "stellar-birth", onClose, preview = false }) {
  const canvasRef = useRef(null);
  const filmRef = useRef(null);
  const imgRef = useRef(undefined);
  const [orientation, setOrientation] = useState(() => (typeof window !== "undefined" && window.innerWidth > window.innerHeight ? "landscape" : "portrait"));
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ended, setEnded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState("");
  const land = orientation === "landscape";

  const start = useCallback(() => {
    setEnded(false); setNote("");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { filmRef.current.still(12); setProgress(1); setEnded(true); return; }
    filmRef.current.play(() => setEnded(true), setProgress);
  }, []);

  // Build the film for the chosen orientation. It plays on open; switching
  // Vertical / Horizontal afterwards only redraws it (Replay plays it).
  const opened = useRef(false);
  useEffect(() => {
    let off = false;
    setReady(false);
    const img = imgRef.current !== undefined ? Promise.resolve(imgRef.current) : loadImage(imageUrl);
    Promise.all([img, loadFonts()]).then(([im]) => {
      imgRef.current = im;
      if (off || !canvasRef.current) return;
      filmRef.current?.stop();
      filmRef.current = createFilm(canvasRef.current, { stars, title, dateLine, image: im, show, orientation });
      setReady(true);
      if (!opened.current) { opened.current = true; start(); }
      else { filmRef.current.still(12); setProgress(0); setEnded(true); }
    });
    return () => { off = true; filmRef.current?.stop(); };
  }, [orientation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !recording) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, recording]);

  const save = async () => {
    if (!filmRef.current || recording) return;
    setRecording(true); setEnded(false); setNote("");
    let msg = "";
    try {
      const { blob, ext } = await recordFilm(canvasRef.current, filmRef.current, setProgress);
      const name = `${fileName}-${land ? "horizontal" : "vertical"}.${ext}`;
      const file = new File([blob], name, { type: blob.type });
      // Phones: the share sheet has "Save Video". Elsewhere: a download.
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); msg = "Saved."; }
        catch (e) { if (e?.name !== "AbortError") throw e; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        msg = `Saved ${name} to your downloads.`;
      }
    } catch (e) {
      msg = e?.message === "unsupported" ? "This browser can't make the video. Try Safari or Chrome." : "Couldn't make the video. Try again.";
    }
    setRecording(false); setEnded(true); setNote(msg);
  };

  const secs = Math.min(Math.round(FILM_SECONDS), Math.floor(progress * FILM_SECONDS));
  const pick = (o) => { if (o !== orientation && !recording) setOrientation(o); };

  const orientToggle = (
    <div role="radiogroup" aria-label="Video shape" className="flex gap-1 p-1 rounded-full bg-white/[0.06] border border-white/15">
      {[["portrait", "Vertical", Smartphone], ["landscape", "Horizontal", Monitor]].map(([k, l, Icon]) => {
        const on = orientation === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={on} onClick={() => pick(k)} disabled={recording}
            className="h-9 px-3.5 rounded-full flex items-center gap-1.5 text-[13px] font-semibold disabled:opacity-50"
            style={on ? { background: SUN, color: "#1a0d00" } : { color: "rgba(255,255,255,0.75)" }}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        );
      })}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Stellar Birth"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center p-3">
        <canvas ref={canvasRef} className="block w-full h-full bg-black" style={{ objectFit: "contain" }} aria-label="Stellar Birth film" />
        {!ready && <div className="absolute w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: `${SUN}40`, borderTopColor: SUN }} />}

        {/* While it plays: just a way out (and the shape, before saving). */}
        {!ended && !recording && (
          <button type="button" onClick={onClose} aria-label="Back to sky" className="absolute top-5 right-5 w-11 h-11 rounded-full flex items-center justify-center text-white/80 bg-black/50 border border-white/20 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
        {preview && !recording && <div className="absolute top-6 left-6 px-2 py-1 rounded text-[10px] tracking-[0.14em] bg-black/60 text-white/70" style={{ fontFamily: SCENE_MONO }}>PREVIEW</div>}
        {recording && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 text-white text-[12px] tracking-[0.08em] whitespace-nowrap" style={{ fontFamily: SCENE_MONO }}>
            <span className="w-2 h-2 rounded-full bg-[#ff4d4d]" style={{ boxShadow: "0 0 8px #ff4d4d" }} />
            MAKING YOUR VIDEO 0:{String(secs).padStart(2, "0")} / 0:{Math.round(FILM_SECONDS)}
          </div>
        )}

        {/* After it ends: Save video, Replay, Back to sky. */}
        {ended && !recording && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/60">
            <div className="w-full max-w-sm flex flex-col items-center gap-3 text-center">
              <div className="text-[11px] tracking-[0.18em]" style={{ fontFamily: SCENE_MONO, color: SUN }}>STELLAR BIRTH</div>
              <div className="text-white text-[22px] font-bold leading-tight" style={{ textWrap: "balance" }}>{title}</div>
              <div className="mt-1">{orientToggle}</div>
              <button type="button" onClick={save} className="mt-1 w-full h-12 rounded-full flex items-center justify-center gap-2 text-[16px] font-bold text-[#1a0d00]" style={{ background: SUN }}>
                <Download className="w-5 h-5" /> Save video
              </button>
              <button type="button" onClick={start} className="w-full h-12 rounded-full flex items-center justify-center gap-2 text-[16px] font-semibold text-white border border-white/25 hover:bg-white/5">
                <RotateCcw className="w-4 h-4" /> Replay
              </button>
              <button type="button" onClick={onClose} className="w-full h-12 rounded-full flex items-center justify-center text-[16px] font-semibold text-white/80 hover:text-white">
                Back to sky
              </button>
              {note && <p className="m-0 text-[13px] text-white/65">{note}</p>}
            </div>
          </div>
        )}
      </div>
      <div className="w-full max-w-md mx-auto px-4 pb-4">
        <div className="h-[3px] rounded bg-white/10 overflow-hidden"><div className="h-full" style={{ width: `${progress * 100}%`, background: SUN }} /></div>
        {recording && <p className="mt-2 mb-0 text-center text-[13px] text-white/55">Keep this screen open while it plays through.</p>}
      </div>
    </div>,
    document.body
  );
}
