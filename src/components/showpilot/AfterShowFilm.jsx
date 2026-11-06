import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, RotateCcw, X } from "lucide-react";
import { createFilm, recordFilm, FILM_SECONDS } from "@/lib/afterShowFilm";
import { SCENE_MONO } from "@/lib/sceneStyle";

// The after-the-show film (job 239), full screen: plays once, then Replay and
// Save video (records a fresh play and hands the phone the file). Used by
// fans in their sky after the show and by the host as a preview.
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

export default function AfterShowFilm({ stars, title, dateLine, imageUrl, show, fileName = "after-the-show", onClose, preview = false }) {
  const canvasRef = useRef(null);
  const filmRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let off = false;
    const fonts = document.fonts
      ? Promise.all([
        document.fonts.load('700 100px "Barlow Condensed"'),
        document.fonts.load('500 32px "IBM Plex Mono"'),
        document.fonts.load("600 36px Inter"),
      ]).catch(() => {})
      : Promise.resolve();
    Promise.all([loadImage(imageUrl), fonts]).then(([img]) => {
      if (off || !canvasRef.current) return;
      filmRef.current = createFilm(canvasRef.current, { stars, title, dateLine, image: img, show });
      setReady(true);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { filmRef.current.still(12); setDone(true); }
      else filmRef.current.play(() => setDone(true), setProgress);
    });
    return () => { off = true; filmRef.current?.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !recording) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, recording]);

  const replay = () => { setDone(false); setNote(""); filmRef.current?.play(() => setDone(true), setProgress); };

  const save = async () => {
    if (!filmRef.current || recording) return;
    setRecording(true); setDone(false); setNote("");
    try {
      const { blob, ext } = await recordFilm(canvasRef.current, filmRef.current, setProgress);
      const name = `${fileName}.${ext}`;
      const file = new File([blob], name, { type: blob.type });
      // Phones: the share sheet has "Save Video". Elsewhere: a download.
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); setNote("Saved."); }
        catch (e) { if (e?.name !== "AbortError") throw e; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNote(`Saved ${name} to your downloads.`);
      }
    } catch (e) {
      setNote(e?.message === "unsupported" ? "This browser can't make the video. Try Safari or Chrome." : "Couldn't make the video. Try again.");
    }
    setRecording(false); setDone(true);
  };

  const secs = Math.min(Math.round(FILM_SECONDS), Math.floor(progress * FILM_SECONDS));

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black flex flex-col items-center justify-center" role="dialog" aria-modal="true" aria-label="Your night, after the show"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center p-3">
        <canvas ref={canvasRef} className="max-w-full max-h-full rounded-[18px]" style={{ aspectRatio: "9 / 16", height: "100%", objectFit: "contain", background: "#000" }} aria-label="After the show film" />
        {!ready && <div className="absolute w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: `${SUN}40`, borderTopColor: SUN }} />}
        {recording && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 text-white text-[12px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO }}>
            <span className="w-2 h-2 rounded-full bg-[#ff4d4d]" style={{ boxShadow: "0 0 8px #ff4d4d" }} />
            MAKING YOUR VIDEO 0:{String(secs).padStart(2, "0")} / 0:{Math.round(FILM_SECONDS)}
          </div>
        )}
        {preview && !recording && <div className="absolute top-6 left-6 px-2 py-1 rounded text-[10px] tracking-[0.14em] bg-black/60 text-white/70" style={{ fontFamily: SCENE_MONO }}>PREVIEW</div>}
      </div>
      <div className="w-full max-w-md px-4 pb-4 flex flex-col gap-2.5">
        <div className="h-[3px] rounded bg-white/10 overflow-hidden"><div className="h-full" style={{ width: `${progress * 100}%`, background: SUN }} /></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} disabled={recording} aria-label="Close" className="w-12 h-12 rounded-full flex items-center justify-center text-white border border-white/20 disabled:opacity-40"><X className="w-5 h-5" /></button>
          <button type="button" onClick={replay} disabled={!ready || recording} className="h-12 px-4 rounded-full flex items-center gap-2 text-[15px] font-semibold text-white border border-white/20 disabled:opacity-40"><RotateCcw className="w-4 h-4" /> Replay</button>
          <button type="button" onClick={save} disabled={!ready || recording} className="flex-1 h-12 rounded-full flex items-center justify-center gap-2 text-[15px] font-bold text-[#1a0d00] disabled:opacity-50" style={{ background: SUN }}>
            <Download className="w-4 h-4" /> {recording ? "Making video…" : "Save video"}
          </button>
        </div>
        {note && <p className="m-0 text-center text-[13px] text-white/65">{note}</p>}
        {recording && <p className="m-0 text-center text-[13px] text-white/55">Keep this screen open while it plays through.</p>}
      </div>
    </div>,
    document.body
  );
}
