import React, { useState, useEffect, useRef } from "react";
import { RotateCw, FlipHorizontal2, RotateCcw } from "lucide-react";

// The photo editor: drag to reposition, slide or pinch to zoom, rotate and
// flip, then exports exactly what's in the frame as a JPEG blob. No external
// libraries, just the Canvas API.
// fit="height" (default) starts the image at the frame's height; fit="cover"
// starts it filling the whole frame (no bars), for wide frames like a venue
// photo. outWidth sets the exported width in pixels.
// aspect="image" (job 73, 2026-11-11): the frame takes the photo's own shape,
// so it starts showing the whole picture (flyers, posters) and can still be
// zoomed in to crop tighter.
// `src` (a URL) can be passed instead of `file` to re-edit a saved photo.
export default function ImageCropModal({ file, src = null, shape = "rect", aspectW = 1, aspectH = 1, aspect = null, onCancel, onCropped, fit = "height", outWidth = 600, title = "Drag to move, pinch or slide to zoom" }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [rotation, setRotation] = useState(0); // 0 / 90 / 180 / 270
  const [flip, setFlip] = useState(false);
  const [failed, setFailed] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const imgRef = useRef(null);
  const [nat, setNat] = useState(null); // the image's natural size, once loaded

  // The image as it'll be drawn: rotated 90/270 swaps its width and height.
  const turned = rotation % 180 !== 0;
  const shown = nat ? (turned ? { w: nat.h, h: nat.w } : nat) : null;
  const [aw, ah] = aspect === "image" && shown ? [shown.w, shown.h] : [aspectW, aspectH];

  const VIEWPORT_W = Math.min(300, typeof window !== "undefined" ? window.innerWidth - 56 : 300);
  const VIEWPORT_H = Math.min(Math.round((VIEWPORT_W * ah) / aw), 420);
  const VW = aspect === "image" ? Math.round((VIEWPORT_H * aw) / ah) : VIEWPORT_W;
  // Height the (rotated) image is shown at before zooming.
  const coverH = shown ? Math.max(VIEWPORT_H, (VW * shown.h) / shown.w) : VIEWPORT_H;
  const baseH = fit === "cover" || aspect === "image" ? coverH : VIEWPORT_H;

  useEffect(() => {
    let url = null;
    let off = false;
    setScale(1); setOffset({ x: 0, y: 0 }); setRotation(0); setFlip(false); setFailed(false); setNat(null);
    if (file) {
      url = URL.createObjectURL(file);
      setImgSrc(url);
    } else if (src) {
      // Re-editing a saved photo: fetch it as a blob so the canvas can export it.
      fetch(src).then((r) => r.blob()).then((b) => {
        if (off) return;
        url = URL.createObjectURL(b);
        setImgSrc(url);
      }).catch(() => { if (!off) setFailed(true); });
    }
    return () => { off = true; if (url) URL.revokeObjectURL(url); };
  }, [file, src]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const clampScale = (s) => Math.min(5, Math.max(1, s));
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
      setDragging(false);
      return;
    }
    setDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setScale(clampScale(pinch.current.s * (Math.hypot(a.x - b.x, a.y - b.y) / (pinch.current.d || 1))));
      return;
    }
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };
  const onWheel = (e) => setScale((s) => clampScale(s * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));

  const rotate = (d) => { setRotation((r) => (r + d + 360) % 360); setOffset({ x: 0, y: 0 }); };
  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); setRotation(0); setFlip(false); };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !shown) return;

    const outW = aspect === "image" ? Math.min(outWidth, shown.w) : outWidth;
    const outH = Math.round((outW * ah) / aw);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);

    // Mirror the on-screen transform: the (rotated, flipped) image is centered
    // in the frame at height baseH * scale, then shifted by `offset`.
    const k = outW / VW; // frame px -> output px
    const dispH = baseH * scale; // the rotated image's shown height
    const dispW = (shown.w / shown.h) * dispH;
    ctx.translate(outW / 2 + offset.x * k, outH / 2 + offset.y * k);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flip) ctx.scale(-1, 1);
    // Unrotated, the image's own width / height on screen:
    const w = (turned ? dispH : dispW) * k;
    const h = (turned ? dispW : dispH) * k;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    canvas.toBlob((blob) => { if (blob) onCropped(blob); }, "image/jpeg", 0.9);
  };

  // The element is laid out unrotated. Turned 90 / 270, its width is what
  // shows as height, so its width is baseH.
  const elStyle = shown
    ? turned
      ? { width: baseH, height: (nat.h / nat.w) * baseH }
      : { width: (nat.w / nat.h) * baseH, height: baseH }
    : { height: baseH, width: "auto" };

  const tool = "h-10 px-3 rounded-lg bg-[#222] text-white/85 text-[13px] font-semibold flex items-center gap-1.5";
  return (
    <div className="fixed inset-0 z-[95] bg-black/90 flex flex-col items-center justify-center px-4" onClick={onCancel} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#161616] rounded-2xl p-4 w-full max-w-sm" role="dialog" aria-modal="true" aria-label="Edit photo">
        <p className="text-white text-sm font-semibold mb-3 text-center">{title}</p>
        <div
          className={`relative overflow-hidden mx-auto bg-black ${shape === "circle" ? "rounded-full" : "rounded-xl"}`}
          style={{ width: VW, height: VIEWPORT_H, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {failed && <p className="absolute inset-0 m-0 flex items-center justify-center text-[13px] text-white/60 px-4 text-center">Couldn't open this photo. Upload it again instead.</p>}
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              alt=""
              crossOrigin={src && !file ? "anonymous" : undefined}
              draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="absolute select-none"
              style={{
                left: "50%",
                top: "50%",
                ...elStyle,
                maxWidth: "none",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`,
                cursor: dragging ? "grabbing" : "grab",
              }}
            />
          )}
        </div>
        <input
          type="range"
          min="1"
          max="5"
          step="0.05"
          value={scale}
          aria-label="Zoom"
          onChange={(e) => setScale(parseFloat(e.target.value))}
          className="w-full mt-4 accent-[#8CFF3D]"
        />
        <div className="flex gap-2 mt-3 justify-center">
          <button type="button" onClick={() => rotate(90)} className={tool} aria-label="Rotate"><RotateCw className="w-4 h-4" />Rotate</button>
          <button type="button" onClick={() => setFlip((f) => !f)} className={tool} aria-label="Flip" aria-pressed={flip}><FlipHorizontal2 className="w-4 h-4" />Flip</button>
          <button type="button" onClick={reset} className={tool} aria-label="Start over"><RotateCcw className="w-4 h-4" />Reset</button>
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className="flex-1 h-11 rounded-lg border border-[#2a2a2a] text-white/60 text-[14px] font-semibold hover:bg-white/5">Cancel</button>
          <button type="button" onClick={handleConfirm} disabled={!shown} className="flex-1 h-11 rounded-lg bg-[#8CFF3D] text-black text-[14px] font-bold hover:bg-[#7ae62e] disabled:opacity-40">Use photo</button>
        </div>
      </div>
    </div>
  );
}
