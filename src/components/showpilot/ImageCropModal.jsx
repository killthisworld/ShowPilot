import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

// A lightweight crop tool: drag the image to reposition, slider to zoom,
// exports exactly what's visible in the frame as a JPEG blob. No external
// libraries — just the Canvas API.
export default function ImageCropModal({ file, shape = "rect", aspectW = 1, aspectH = 1, onCancel, onCropped }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef(null);

  const VIEWPORT_W = 288;
  const VIEWPORT_H = Math.round((VIEWPORT_W * aspectH) / aspectW);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPointerDown = (e) => {
    setDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const onPointerUp = () => setDragging(false);

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;

    const outW = 600;
    const outH = Math.round((outW * aspectH) / aspectW);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    // Image is displayed pinned to the viewport height, scaled by `scale`,
    // and shifted by `offset` — this must match the inline style below exactly.
    const dispH = VIEWPORT_H * scale;
    const dispW = (img.naturalWidth / img.naturalHeight) * dispH;
    const dispX = (VIEWPORT_W - dispW) / 2 + offset.x;
    const dispY = (VIEWPORT_H - dispH) / 2 + offset.y;
    const factor = img.naturalHeight / dispH;

    const srcX = (0 - dispX) * factor;
    const srcY = (0 - dispY) * factor;
    const srcW = VIEWPORT_W * factor;
    const srcH = VIEWPORT_H * factor;

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    canvas.toBlob((blob) => { if (blob) onCropped(blob); }, "image/jpeg", 0.9);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center px-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#161616] rounded-2xl p-4 w-full max-w-sm">
        <p className="text-white text-sm font-semibold mb-3 text-center">Drag to reposition, slide to zoom</p>
        <div
          className={`relative overflow-hidden mx-auto bg-black ${shape === "circle" ? "rounded-full" : "rounded-xl"}`}
          style={{ width: VIEWPORT_W, height: VIEWPORT_H, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              alt=""
              draggable={false}
              className="absolute select-none"
              style={{
                left: "50%",
                top: "50%",
                height: VIEWPORT_H,
                width: "auto",
                maxWidth: "none",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                cursor: dragging ? "grabbing" : "grab",
              }}
            />
          )}
        </div>
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
          className="w-full mt-4 accent-[#8CFF3D]"
        />
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onCancel} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e]">
            Use Photo
          </Button>
        </div>
      </div>
    </div>
  );
}
