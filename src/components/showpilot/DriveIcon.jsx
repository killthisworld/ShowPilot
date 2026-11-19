import React, { useEffect, useRef, useState } from "react";
import { HardDrive, FolderOpen, Loader2 } from "lucide-react";

// Google Drive as one icon (job 362, Jay 2026-11-19): a dot says connected
// (green), expired (orange) or not connected (grey). Not connected: tap to
// connect. Connected: tap for the folder and Disconnect.
const G = "#8CFF3D";
const AMBER = "#FF6A00";

export default function DriveIcon({ drive = {}, onConnect, onDisconnect, size = 44 }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) { setOpen(false); setConfirm(false); } };
    document.addEventListener("mousedown", off);
    document.addEventListener("touchstart", off);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("touchstart", off); };
  }, [open]);

  const off = drive.configured === false;
  const state = drive.loading ? "loading" : off ? "off" : drive.connected ? "on" : drive.expired ? "expired" : "none";
  const dot = state === "on" ? G : state === "expired" ? AMBER : "#6b6b6b";
  const label = { loading: "Google Drive", off: "Google Drive isn't on yet", on: "Google Drive connected", expired: "Google Drive needs reconnecting", none: "Connect Google Drive" }[state];
  const tap = () => {
    if (state === "loading") return;
    if (state === "none" || state === "expired") { onConnect?.(); return; }
    setOpen((o) => !o);
    setConfirm(false);
  };

  return (
    <div ref={ref} className="relative shrink-0" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <button type="button" onClick={tap} aria-label={label} title={label} aria-expanded={state === "on" || state === "off" ? open : undefined}
        className="relative rounded-[12px] border bg-[#111]/80 backdrop-blur flex items-center justify-center text-white/85 hover:text-white"
        style={{ width: size, height: size, borderColor: state === "on" ? `${G}55` : state === "expired" ? `${AMBER}88` : "#2a2a2a" }}>
        {state === "loading" ? <Loader2 className="w-5 h-5 animate-spin text-white/40" /> : <HardDrive className="w-5 h-5" />}
        {state !== "loading" && (
          <span aria-hidden="true" className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full" style={{ background: dot, boxShadow: "0 0 0 2px #111" }} />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[240px] rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] shadow-xl p-2 flex flex-col gap-1">
          {off ? (
            <p className="m-0 px-2.5 py-2 text-[13.5px] text-white/70">Google Drive isn't on for Show Pilot yet.</p>
          ) : (
            <>
              <div className="px-2.5 pt-1.5 pb-1 flex items-center gap-2 text-[13.5px] font-semibold">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: G }} />
                <span className="truncate">{drive.email || "Drive connected"}</span>
              </div>
              {drive.folder_url && (
                <a href={drive.folder_url} target="_blank" rel="noreferrer" className="min-h-[40px] flex items-center gap-2 px-2.5 rounded-lg text-sm text-white/85 hover:bg-white/5">
                  <FolderOpen className="w-4 h-4" />Open the folder
                </a>
              )}
              {onDisconnect && (confirm ? (
                <div className="px-2.5 py-2 text-sm flex items-center gap-2">
                  <button type="button" onClick={() => { setOpen(false); setConfirm(false); onDisconnect(); }} className="px-2.5 py-1.5 rounded-lg text-red-300 border border-red-400/40">Disconnect</button>
                  <button type="button" onClick={() => setConfirm(false)} className="text-white/55">Keep</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirm(true)} className="min-h-[40px] text-left px-2.5 rounded-lg text-sm text-white/50 hover:text-red-300 hover:bg-white/5">Disconnect</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
