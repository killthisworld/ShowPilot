import React, { useEffect } from "react";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { shortDate, timeAgo } from "@/lib/needsMe";
import { PhotoBar } from "@/components/showpilot/CompanyChats";
import HostMessagesList from "@/components/showpilot/HostMessagesList";

// Fan messages in the Chats page (job 236): one bar per event fans have
// messaged, and the view that opens it. Fan side is Show Pilot green.
export const FAN_G = "#8CFF3D";

export function FansHeading({ count }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>
      FANS
      {count > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-[#0d0d0d]" style={{ background: FAN_G, fontFamily: SCENE_MONO }}>{count} NEW</span>}
    </div>
  );
}

// The bar's content: event, newest message, NEW count.
export function FanThreadBar({ t, photo, className = "", right = null }) {
  const unread = Number(t.unread || 0);
  return (
    <PhotoBar photo={photo} color={FAN_G} className={`flex items-center gap-3 pl-4 pr-3 py-3 ${className}`}>
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="flex items-baseline gap-2">
          <span className={`text-[16px] truncate ${unread ? "font-bold text-white" : "font-semibold text-white/90"}`}>Fans · {eventTitle(t)}</span>
          <span className="ml-auto shrink-0 text-[11px] text-white/55">{timeAgo(t.last_at)}</span>
        </span>
        <span className={`text-[14px] truncate ${unread ? "text-white/90" : "text-white/60"}`}>{t.last_name ? `${t.last_name}: ` : ""}{t.last_message}</span>
        <span className="flex items-center gap-1.5 text-[10.5px] tracking-[0.06em] truncate" style={{ fontFamily: SCENE_MONO, color: FAN_G }}>
          <Mail className="w-3 h-3 shrink-0" />
          {[`${t.total} ${Number(t.total) === 1 ? "MESSAGE" : "MESSAGES"}`, t.date ? shortDate(t.date) : null].filter(Boolean).join(" · ").toUpperCase()}
        </span>
      </span>
      {unread > 0 && <span className="min-w-[24px] h-[24px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center shrink-0" style={{ background: FAN_G, color: "#0d0d0d" }}>{unread}</span>}
      {right}
    </PhotoBar>
  );
}

// One event's fan messages: a header bar, then the list (marks them read).
export function FanThreadView({ t, photo, onRead, onBack = null }) {
  return (
    <>
      <PhotoBar photo={photo} color={FAN_G} className="shrink-0 px-4 py-3.5 flex items-center gap-3 border-b border-[#1f1f1f]">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to chats" className="shrink-0 w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-white bg-black/40 border border-white/15">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[20px] font-bold text-white truncate">Fans · {eventTitle(t)}</span>
          <span className="block text-[11px] tracking-[0.06em] uppercase truncate" style={{ fontFamily: SCENE_MONO, color: FAN_G }}>
            {[t.date ? shortDate(t.date) : null, t.venue, "Only you see these"].filter(Boolean).join(" · ")}
          </span>
        </span>
        {t.share_token && (
          <Link to={`/gig/web?token=${t.share_token}`} className="shrink-0 hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold tracking-[0.06em] bg-black/50 border border-white/15 text-white/80 hover:text-white">
            <ExternalLink className="w-3.5 h-3.5" /> OPEN EVENT
          </Link>
        )}
      </PhotoBar>
      <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ background: "#05060f" }}>
        <HostMessagesList key={t.show_id} showId={t.show_id} fill onRead={onRead} />
      </div>
    </>
  );
}

// Phone: the view as a full-screen sheet over the Chats tab.
export function FanThreadSheet({ t, photo, onRead, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0d0d0d]" role="dialog" aria-modal="true" aria-label={`Fan messages, ${eventTitle(t)}`} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <FanThreadView t={t} photo={photo} onRead={onRead} onBack={onClose} />
    </div>
  );
}
