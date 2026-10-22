import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, MessageCircle, Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import useNeedsMe, { patchNeedsMe } from "@/hooks/useNeedsMe";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { chatTitle, sectionMeta, shortDate, timeAgo, localISO, vocab, visibleChats, hideChat, readHiddenEventRooms, hideEventRooms } from "@/lib/needsMe";
import { PhotoBar } from "@/components/showpilot/CompanyChats";
import { openRooms } from "@/lib/hiddenProfiles";
import RoomChatPanel from "@/components/showpilot/RoomChatPanel";
import { ROOM_META, ROOM_ORDER } from "@/pages/GigRooms";

// The company Chats page on desktop (job 129): the phone Chats tab
// (CompanyChats) laid out for a big screen. Your chats (newest first, unread
// on top, each over its event's photo) and your upcoming events' rooms down
// the left; the one you pick opens on the right, right there, no new page.
// Delete (the trash on hover) hides a chat the same way the phone's swipe
// does: it comes back when someone sends something new.
const BLUE = "#60A5FA";
const G = "#8CFF3D";

export default function CompanyChatsDesk({ preferences, gigs, gigsLoading = false }) {
  const accent = getAccountTypeStyle(preferences?.account_type).color;
  const words = vocab(preferences?.account_type);
  const { data, loading: chatsLoading, failed, reload } = useNeedsMe();
  const loading = chatsLoading || gigsLoading;
  const [gone, setGone] = useState(() => new Set());
  const [hiddenEvents, setHiddenEvents] = useState(() => readHiddenEventRooms());
  const [user, setUser] = useState(null);
  const [sel, setSel] = useState(null); // { kind: "chat", id } | { kind: "event", token }
  const today = localISO();

  useEffect(() => { supabase.auth.getUser().then(({ data: d }) => setUser(d?.user || null)); }, []);

  const chats = useMemo(() => {
    const list = visibleChats(data?.chats).filter((c) => !gone.has(c.id) && (!c.event_date || c.event_date >= today));
    return list.sort((a, b) => (b.unread > 0) - (a.unread > 0) || String(b.last_at).localeCompare(String(a.last_at)));
  }, [data, gone, today]);
  const byToken = useMemo(() => Object.fromEntries((gigs || []).filter((g) => g.share_token).map((g) => [g.share_token, g])), [gigs]);
  const upcoming = useMemo(() => {
    const active = new Set(chats.map((c) => c.share_token));
    return (gigs || [])
      .filter((g) => g.share_token && g.date && g.date >= today && (!hiddenEvents[g.share_token] || active.has(g.share_token)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 12);
  }, [gigs, today, hiddenEvents, chats]);

  // Open the newest chat (or the first event) when the page loads.
  useEffect(() => {
    if (sel || loading) return;
    if (chats[0]) setSel({ kind: "chat", id: chats[0].id });
    else if (upcoming[0]) setSel({ kind: "event", token: upcoming[0].share_token });
  }, [sel, loading, chats, upcoming]);

  const remove = (c) => {
    setGone((s) => new Set([...s, c.id]));
    patchNeedsMe((d) => ({ ...d, chats: (d.chats || []).filter((x) => x.id !== c.id) }));
    hideChat(c);
    if (sel?.kind === "chat" && sel.id === c.id) setSel(null);
  };
  const removeEvent = (g) => {
    hideEventRooms(g.share_token);
    setHiddenEvents((h) => ({ ...h, [g.share_token]: new Date().toISOString() }));
    chats.filter((c) => c.share_token === g.share_token).forEach(remove);
    if (sel?.kind === "event" && sel.token === g.share_token) setSel(null);
  };

  const chatColor = (c) => (c.kind === "direct" ? BLUE : c.kind === "general_room" ? "#9CA3AF" : sectionMeta(c.section).color);
  const selChat = sel?.kind === "chat" ? chats.find((c) => c.id === sel.id) || null : null;
  const selEvent = sel?.kind === "event" ? (gigs || []).find((g) => g.share_token === sel.token) || null : null;

  const trash = (label, onClick) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={`Delete ${label}`} title="Delete from your list"
      className="shrink-0 p-2 rounded-lg text-white/0 group-hover:text-white/55 hover:!text-red-400 hover:bg-black/40 focus:text-white/55 transition-colors">
      <Trash2 className="w-4 h-4" />
    </button>
  );

  return (
    <div className="h-screen flex flex-col bg-[#0d0d0d] overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="flex items-center gap-4 px-6 py-3 border-b border-[#1a1a1a] shrink-0">
        <h1 className="m-0 text-[30px] font-bold tracking-[0.04em] leading-none text-white" style={{ fontFamily: SCENE_FONT }}>CHATS</h1>
        {!loading && <span className="text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{chats.length} CONVERSATION{chats.length === 1 ? "" : "S"}</span>}
      </div>

      <div className="flex-1 min-h-0 flex gap-4 m-4">
        {/* Left: the list */}
        <div className="w-[420px] shrink-0 min-h-0 overflow-y-auto flex flex-col gap-5 pr-1">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
          ) : failed ? (
            <div className="rounded-xl bg-[#151515] border border-[#262626] p-4 flex items-center gap-3">
              <p className="flex-1 m-0 text-sm text-white/70">Couldn't load your chats just now.</p>
              <button onClick={reload} className="h-10 px-3.5 rounded-[10px] bg-[#1f1f1f] text-white text-[13px] font-semibold">Retry</button>
            </div>
          ) : chats.length === 0 && upcoming.length === 0 ? (
            <div className="rounded-xl bg-[#151515] border border-[#262626] p-5 flex flex-col items-center gap-2 text-center">
              <MessageCircle className="w-8 h-8 text-white/40" />
              <p className="m-0 text-base font-semibold text-white">No conversations yet</p>
              <p className="m-0 text-sm text-white/55">Your upcoming {words.events.toLowerCase()}' rooms show up here.</p>
            </div>
          ) : null}

          {!loading && chats.length > 0 && (
            <div className="flex flex-col gap-2 shrink-0">
              {chats.map((c) => {
                const color = chatColor(c);
                const title = chatTitle(c);
                const unread = Number(c.unread || 0);
                const on = selChat?.id === c.id;
                return (
                  <div key={c.id} role="button" tabIndex={0} aria-pressed={on} aria-label={`${title}, ${c.event_title || ""}`}
                    onClick={() => setSel({ kind: "chat", id: c.id })}
                    onKeyDown={(e) => { if (e.key === "Enter") setSel({ kind: "chat", id: c.id }); if (e.key === "Delete") remove(c); }}
                    className="group relative cursor-pointer rounded-xl overflow-hidden border border-[#262626]">
                    {on && <span aria-hidden="true" className="absolute inset-0 z-10 pointer-events-none border-2 rounded-xl" style={{ borderColor: color }} />}
                    <PhotoBar photo={byToken[c.share_token]?.icon_url} color={color} className="min-h-[88px] flex items-center gap-3 pl-4 pr-2 py-3">
                      <span className="flex-1 min-w-0 flex flex-col gap-1">
                        <span className="flex items-baseline gap-2">
                          <span className={`text-[16px] truncate ${unread ? "font-bold text-white" : "font-semibold text-white/90"}`}>{title}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-white/55">{timeAgo(c.last_at)}</span>
                        </span>
                        <span className={`text-[14px] truncate ${unread ? "text-white/90" : "text-white/60"}`}>{c.last_sender_name ? `${c.last_sender_name}: ` : ""}{c.last_body}</span>
                        <span className="text-[10.5px] tracking-[0.06em] truncate" style={{ fontFamily: SCENE_MONO, color }}>
                          {[c.event_title, c.event_date ? shortDate(c.event_date) : null].filter(Boolean).join(" · ").toUpperCase()}
                        </span>
                      </span>
                      {unread > 0 && <span className="min-w-[24px] h-[24px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center shrink-0" style={{ background: G, color: "#0d0d0d" }}>{unread}</span>}
                      {trash(title, () => remove(c))}
                    </PhotoBar>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && upcoming.length > 0 && (
            <div className="flex flex-col gap-2 shrink-0">
              <div className="text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>{words.event.toUpperCase()} ROOMS</div>
              <div className="flex flex-col gap-2">
                {upcoming.map((g) => {
                  const color = eventTypeColor(g.event_type) || accent;
                  const on = selEvent?.share_token === g.share_token;
                  return (
                    <div key={g.share_token} role="button" tabIndex={0} aria-pressed={on} aria-label={`${g.event_name || g.band_name || "Event"} rooms`}
                      onClick={() => setSel({ kind: "event", token: g.share_token })}
                      onKeyDown={(e) => { if (e.key === "Enter") setSel({ kind: "event", token: g.share_token }); }}
                      className="group relative cursor-pointer rounded-xl overflow-hidden border border-[#262626]">
                    {on && <span aria-hidden="true" className="absolute inset-0 z-10 pointer-events-none border-2 rounded-xl" style={{ borderColor: color }} />}
                      <PhotoBar photo={g.icon_url} color={color} className="min-h-[70px] flex items-center gap-3 pl-4 pr-2 py-3">
                        <span className="flex-1 min-w-0 flex flex-col gap-1">
                          <span className="text-[16px] font-semibold text-white truncate">{g.event_name || g.band_name || "Untitled"}</span>
                          <span className="text-[11px] text-white/60 truncate" style={{ fontFamily: SCENE_MONO }}>{[shortDate(g.date), g.venue].filter(Boolean).join(" · ").toUpperCase()}</span>
                        </span>
                        {trash(`${g.event_name || "event"} rooms`, () => removeEvent(g))}
                      </PhotoBar>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: the conversation */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-2xl border border-[#1f1f1f] bg-[#101010] overflow-hidden">
          {selChat ? (
            <Conversation
              key={selChat.id}
              roomId={selChat.id}
              user={user}
              title={chatTitle(selChat)}
              sub={[selChat.event_title, selChat.event_date ? shortDate(selChat.event_date) : null].filter(Boolean).join(" · ")}
              color={chatColor(selChat)}
              photo={byToken[selChat.share_token]?.icon_url}
              eventHref={selChat.share_token ? `/gig/web?token=${selChat.share_token}` : null}
            />
          ) : selEvent ? (
            <EventRooms key={selEvent.share_token} gig={selEvent} user={user} color={eventTypeColor(selEvent.event_type) || accent} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-white/40">
              <MessageCircle className="w-8 h-8" />
              <p className="m-0 text-sm">{loading ? "Loading…" : "Pick a chat on the left."}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Conversation({ roomId, user, title, sub, color, photo, eventHref, tabs = null }) {
  return (
    <>
      <PhotoBar photo={photo} color={color} className="shrink-0 px-5 py-3.5 flex items-center gap-3 border-b border-[#1f1f1f]">
        <span className="min-w-0 flex-1">
          <span className="block text-[20px] font-bold text-white truncate">{title}</span>
          {sub && <span className="block text-[11px] tracking-[0.06em] uppercase truncate" style={{ fontFamily: SCENE_MONO, color }}>{sub}</span>}
        </span>
        {eventHref && (
          <Link to={eventHref} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold tracking-[0.06em] bg-black/50 border border-white/15 text-white/80 hover:text-white">
            <ExternalLink className="w-3.5 h-3.5" /> OPEN EVENT
          </Link>
        )}
      </PhotoBar>
      {tabs}
      <div className="flex-1 min-h-0 flex flex-col">
        <RoomChatPanel roomId={roomId} user={user} fill placeholder={`Message ${title}...`} />
      </div>
    </>
  );
}

// An event picked from Event rooms: its rooms as tabs (General first).
function EventRooms({ gig, user, color }) {
  const [rooms, setRooms] = useState(null);
  const [active, setActive] = useState(null);
  useEffect(() => {
    let off = false;
    supabase.rpc("ensure_my_gig_room_membership", { p_token: gig.share_token }).then(({ data, error }) => {
      if (off) return;
      if (error) { console.error(error); setRooms([]); return; }
      const list = openRooms(data?.rooms).sort((a, b) => ROOM_ORDER.indexOf(a.section) - ROOM_ORDER.indexOf(b.section));
      setRooms(list);
      setActive(list[0]?.id || null);
    });
    return () => { off = true; };
  }, [gig.share_token]);
  if (rooms === null) return <div className="flex-1 flex items-center justify-center text-white/40 text-sm">Loading rooms…</div>;
  if (!rooms.length) return <div className="flex-1 flex items-center justify-center text-white/40 text-sm">You'll see this event's rooms once you're on one of its profiles.</div>;
  const room = rooms.find((r) => r.id === active) || rooms[0];
  const meta = ROOM_META[room.section] || { label: room.section, color: "#9CA3AF" };
  const tabs = rooms.length > 1 ? (
    <div className="shrink-0 flex gap-1.5 px-5 py-2.5 border-b border-[#1f1f1f]">
      {rooms.map((r) => {
        const m = ROOM_META[r.section] || { label: r.section, color: "#9CA3AF" };
        const on = r.id === room.id;
        return (
          <button key={r.id} type="button" onClick={() => setActive(r.id)} className="px-3 py-1.5 rounded-full text-[12px] font-bold tracking-[0.04em] border"
            style={on ? { background: m.color, color: "#0d0d0d", borderColor: m.color } : { color: m.color, borderColor: m.color + "55", background: m.color + "14" }}>
            {m.label}
          </button>
        );
      })}
    </div>
  ) : null;
  return (
    <Conversation
      key={room.id}
      roomId={room.id}
      user={user}
      title={meta.label}
      sub={[gig.event_name || gig.band_name, shortDate(gig.date), gig.venue].filter(Boolean).join(" · ")}
      color={meta.color || color}
      photo={gig.icon_url}
      eventHref={`/gig/web?token=${gig.share_token}`}
      tabs={tabs}
    />
  );
}
