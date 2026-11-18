import React, { useSyncExternalStore } from "react";
import { Smartphone, Monitor } from "lucide-react";

// Phone or Desktop for the previews (job 346): "View as the venue" and the
// event link preview. Phone shows the same page inside a phone-sized frame
// (a real frame, so the page lays out as it does on a phone), Desktop shows
// it as is. The choice is kept for the visit.
const KEY = "sp.previewView";
const listeners = new Set();
const read = () => { try { return sessionStorage.getItem(KEY) === "phone" ? "phone" : "desktop"; } catch { return "desktop"; } };
let current = read();
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export function usePreviewView() {
  const view = useSyncExternalStore(subscribe, () => current, () => "desktop");
  const setView = (v) => {
    current = v;
    try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ }
    listeners.forEach((f) => f());
  };
  return [view, setView];
}

// Whether this page is the one inside the phone frame (no bar, no switch).
export const inPreviewFrame = () => {
  try { return new URLSearchParams(window.location.search).get("frame") === "1" || window.location.pathname.startsWith("/preview-frame"); } catch { return false; }
};

export function PreviewToggle({ view, setView, className = "" }) {
  const btn = (v, Icon, text) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
      className="h-8 px-3 rounded-full text-[12.5px] font-bold flex items-center gap-1.5 transition-colors"
      style={view === v ? { background: "#fff", color: "#0d0d0d" } : { color: "rgba(255,255,255,0.7)" }}>
      <Icon className="w-3.5 h-3.5" />{text}
    </button>
  );
  return (
    <div role="tablist" aria-label="Preview as" className={`flex items-center gap-0.5 p-0.5 rounded-full bg-black/40 border border-white/15 ${className}`}>
      {btn("phone", Smartphone, "Phone")}{btn("desktop", Monitor, "Desktop")}
    </div>
  );
}

// The phone: 390 wide, as tall as fits under the bar, centred, never out of frame.
export function PhoneFrame({ src, title }) {
  return (
    <div className="fixed inset-0 bg-[#05060d] flex justify-center items-start overflow-hidden" style={{ paddingTop: 76, paddingBottom: 16 }}>
      <iframe title={title} src={src} className="block rounded-[28px] border-[6px] border-[#2a2a2a] bg-black shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        style={{ width: "min(402px, calc(100vw - 24px))", height: "min(868px, calc(100dvh - 92px))" }} />
    </div>
  );
}
