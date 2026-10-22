import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, MessageCircle, Trash2 } from "lucide-react";
import useNeedsMe, { patchNeedsMe } from "@/hooks/useNeedsMe";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { chatHref, chatTitle, sectionMeta, shortDate, timeAgo, localISO, vocab, visibleChats, hideChat, readHiddenEventRooms, hideEventRooms } from "@/lib/needsMe";

const BLUE = "#60A5FA";
const G = "#8CFF3D";
const DELETE_W = 96;

// A full-width bar with the event's photo across it (job 73): the photo
// fills the bar, a dark wash on the left keeps the text readable, and a
// strip in `color` runs down the left edge.
function PhotoBar({ photo, color, children, className = "" }) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {photo ? (
        <img src={photo} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 -z-10" style={{ background: `linear-gradient(120deg, ${color}40, #151515 70%)` }} />
      )}
      <span className="absolute inset-0 -z-10" style={{ background: "linear-gradient(90deg, rgba(13,13,13,0.94) 0%, rgba(13,13,13,0.78) 55%, rgba(13,13,13,0.35) 100%)" }} />
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />
      {children}
    </div>
  );
}

// Swipe left to reveal Delete (job 73). Vertical scrolling still works: the
// row only follows the finger once the move is mostly sideways.
function SwipeRow({ onOpen, onDelete, children, label }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const moved = useRef(false);

  const down = (e) => { start.current = { x: e.clientX, y: e.clientY, base: x, axis: null }; moved.current = false; };
  const move = (e) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (s.axis === "x") { setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId); }
    }
    if (s.axis !== "x") return;
    moved.current = true;
    setX(Math.max(-DELETE_W - 24, Math.min(0, s.base + dx)));
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== "x") return;
    setDragging(false);
    setX((cur) => (cur < -DELETE_W / 2 ? -DELETE_W : 0));
  };
  const click = () => {
    if (moved.current) { moved.current = false; return; }
    if (x !== 0) { setX(0); return; }
    onOpen();
  };

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={onDelete}
        tabIndex={x === 0 ? -1 : 0}
        aria-label={`Delete ${label}`}
        className="absolute right-0 top-0 bottom-0 flex flex-col items-center justify-center gap-1 text-white text-[12px] font-bold tracking-[0.04em] bg-[#DC2626]"
        style={{ width: DELETE_W }}
      >
        <Trash2 className="w-5 h-5" /> Delete
      </button>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={click}
        onKeyDown={(e) => { if (e.key === "Enter") onOpen(); if (e.key === "Delete" || e.key === "Backspace") onDelete(); }}
        className="relative cursor-pointer select-none"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform 180ms ease-out", touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}

// The company phone layout's Chats tab: every chat you're in across all your
// events, newest first, unread on top, each bar showing its event's photo.
// Swipe a chat left to delete it from your list (it comes back if someone
// sends a new message). Below it, a quick way into any upcoming event's rooms
// (also swipe-to-delete). Only events that haven't happened yet are listed.
export default function CompanyChats({ preferences, gigs, gigsLoading = false }) {
  const navigate = useNavigate();
  const accent = getAccountTypeStyle(preferences?.account_type).color;
  const words = vocab(preferences?.account_type);
  const { data, loading: chatsLoading, failed, reload } = useNeedsMe();
  // Wait for Home's events too, so "No conversations yet" never flashes
  // before the event rooms arrive.
  const loading = chatsLoading || gigsLoading;
  const [gone, setGone] = useState(() => new Set());
  const [hiddenEvents, setHiddenEvents] = useState(() => readHiddenEventRooms());
  const today = localISO();

  // Chats for events that haven't happened yet (no date counts as upcoming).
  const chats = useMemo(() => {
    const list = visibleChats(data?.chats).filter((c) => !gone.has(c.id) && (!c.event_date || c.event_date >= today));
    return list.sort((a, b) => (b.unread > 0) - (a.unread > 0) || String(b.last_at).localeCompare(String(a.last_at)));
  }, [data, gone, today]);

  const byToken = useMemo(() => Object.fromEntries((gigs || []).filter((g) => g.share_token).map((g) => [g.share_token, g])), [gigs]);

  // An event's rooms row you deleted stays gone until one of its chats has
  // something new (it's back in the chat list above).
  const upcoming = useMemo(() => {
    const active = new Set(chats.map((c) => c.share_token));
    return (gigs || [])
      .filter((g) => g.share_token && g.date && g.date >= today && (!hiddenEvents[g.share_token] || active.has(g.share_token)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [gigs, today, hiddenEvents, chats]);

  const remove = (c) => {
    setGone((s) => new Set([...s, c.id]));
    // Drop it from the shared copy too, so the Chats badge and Needs me update.
    patchNeedsMe((d) => ({ ...d, chats: (d.chats || []).filter((x) => x.id !== c.id) }));
    hideChat(c);
  };
  const removeEvent = (g) => {
    hideEventRooms(g.share_token);
    setHiddenEvents((h) => ({ ...h, [g.share_token]: new Date().toISOString() }));
    chats.filter((c) => c.share_token === g.share_token).forEach(remove);
  };

  return (
    <div className="max-w-lg mx-auto pb-6 px-5" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 className="m-0 pt-[22px] pb-4 text-[34px] font-bold tracking-[0.04em] leading-none text-white" style={{ fontFamily: SCENE_FONT }}>CHATS</h1>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
      ) : failed ? (
        <div className="rounded-xl bg-[#151515] border border-[#262626] p-4 flex items-center gap-3">
          <p className="flex-1 m-0 text-sm text-white/70">Couldn't load your chats just now.</p>
          <button onClick={reload} className="h-11 px-3.5 rounded-[10px] bg-[#1f1f1f] text-white text-[13px] font-semibold">Retry</button>
        </div>
      ) : chats.length === 0 ? (upcoming.length > 0 ? null :
        <div className="rounded-xl bg-[#151515] border border-[#262626] p-5 flex flex-col items-center gap-2 text-center">
          <MessageCircle className="w-8 h-8 text-white/40" />
          <p className="m-0 text-base font-semibold text-white">No conversations yet</p>
          <p className="m-0 text-sm text-white/55">Your upcoming {words.events.toLowerCase()}' rooms show up here.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[#1f1f1f] divide-y divide-black overflow-hidden">
            {chats.map((c) => {
              const color = c.kind === "direct" ? BLUE : c.kind === "general_room" ? "#9CA3AF" : sectionMeta(c.section).color;
              const title = chatTitle(c);
              const unread = Number(c.unread || 0);
              const gig = byToken[c.share_token];
              return (
                <SwipeRow key={c.id} label={`${title}, ${c.event_title || ""}`} onOpen={() => navigate(chatHref(c))} onDelete={() => remove(c)}>
                  <PhotoBar photo={gig?.icon_url} color={color} className="min-h-[96px] flex items-center gap-3 pl-4 pr-3.5 py-3">
                    <span className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-[16px] truncate ${unread ? "font-bold text-white" : "font-semibold text-white/90"}`}>{title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-white/55">{timeAgo(c.last_at)}</span>
                      </span>
                      <span className={`text-[14px] truncate ${unread ? "text-white/90" : "text-white/60"}`}>
                        {c.last_sender_name ? `${c.last_sender_name}: ` : ""}{c.last_body}
                      </span>
                      <span className="text-[10.5px] tracking-[0.06em] truncate" style={{ fontFamily: SCENE_MONO, color }}>
                        {[c.event_title, c.event_date ? shortDate(c.event_date) : null].filter(Boolean).join(" · ").toUpperCase()}
                      </span>
                    </span>
                    {unread > 0 && (
                      <span className="min-w-[24px] h-[24px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center shrink-0" style={{ background: G, color: "#0d0d0d" }}>{unread}</span>
                    )}
                  </PhotoBar>
                </SwipeRow>
              );
            })}
          </div>
        </>
      )}

      {!loading && upcoming.length > 0 && (
        <div className={`${chats.length ? "pt-6" : ""} flex flex-col gap-2`}>
          <div className="text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>{words.event.toUpperCase()} ROOMS</div>
          <div className="rounded-xl border border-[#1f1f1f] divide-y divide-black overflow-hidden">
            {upcoming.map((g) => (
              <SwipeRow key={g.share_token} label={`${g.event_name || g.band_name || "Event"} rooms`} onOpen={() => navigate(`/gig/rooms?token=${g.share_token}`)} onDelete={() => removeEvent(g)}>
                <PhotoBar photo={g.icon_url} color={eventTypeColor(g.event_type) || accent} className="min-h-[76px] flex items-center gap-3 pl-4 pr-3.5 py-3">
                  <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="text-[16px] font-semibold text-white truncate">{g.event_name || g.band_name || "Untitled"}</span>
                    <span className="text-[11px] text-white/60 truncate" style={{ fontFamily: SCENE_MONO }}>{[shortDate(g.date), g.venue].filter(Boolean).join(" · ").toUpperCase()}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-white/60 shrink-0" />
                </PhotoBar>
              </SwipeRow>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
