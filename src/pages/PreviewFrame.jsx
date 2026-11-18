import React from "react";
import PackageView from "@/pages/PackageView";

// What sits inside the phone frame of a preview (job 346): the page runs in
// its own small window, so it lays out exactly as it does on a phone. The
// package comes from the window that opened the frame.
export default function PackagePreviewFrame() {
  let pkg = null;
  try { pkg = window.parent?.__spPkgPreview || null; } catch { /* not allowed */ }
  if (!pkg) return <div className="min-h-screen bg-[#05060d] text-white/60 flex items-center justify-center text-sm px-6 text-center">Open the preview from the package.</div>;
  return <PackageView previewPkg={pkg} onClosePreview={() => {}} />;
}
