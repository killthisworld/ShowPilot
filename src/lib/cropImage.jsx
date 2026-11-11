import React from "react";
import { createRoot } from "react-dom/client";
import ImageCropModal from "@/components/showpilot/ImageCropModal";

// Open the photo editor on a picked file and wait for the result (job 73,
// 2026-11-11), so any upload can add the edit step with one line:
//   const edited = await cropImage(file, { aspectW: 1, aspectH: 1, shape: "circle" });
//   if (!edited) return; // cancelled
// Resolves a File (JPEG), or null when cancelled. GIFs are passed through
// untouched: a canvas would keep only one frame of the animation.
export function cropImage(file, opts = {}) {
  if (!file) return Promise.resolve(null);
  if (file.type === "image/gif" || !/^image\//.test(file.type || "image/")) return Promise.resolve(file);
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (out) => {
      root.unmount();
      host.remove();
      resolve(out);
    };
    const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
    root.render(
      <ImageCropModal
        file={file}
        {...opts}
        onCancel={() => done(null)}
        onCropped={(blob) => done(new File([blob], `${base}.jpg`, { type: "image/jpeg" }))}
      />
    );
  });
}

// For an <input type="file" onChange>: the picked file, edited, or null.
export async function pickAndCrop(e, opts) {
  const file = e?.target?.files?.[0] || null;
  if (e?.target) e.target.value = "";
  return cropImage(file, opts);
}
