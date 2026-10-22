import React, { useState, useEffect } from "react";
import { DIRECT_MESSAGES_OPEN, openRooms } from "@/lib/hiddenProfiles";
import EventBackdrop from "@/components/showpilot/EventBackdrop";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/navHistory";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, MapPin, User, Headphones, Users, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import useIsDesktop from "@/hooks/useIsDesktop";
import BottomTabs from "@/components/showpilot/BottomTabs";
import RoomChatPanel from "@/components/showpilot/RoomChatPanel";

// Matches SharedGig.jsx's palette exactly, plus a neutral for the
// everyone-welcome General room - same color language the rest of the
// app already uses for these three sections.
export const ROOM_META = {
  general: { label: "General", icon: Users, color: "#9CA3AF" },
  venue: { label: "Venue", icon: MapPin, color: "#60A5FA" },
  manager: { label: "Manager/Artist", icon: User, color: "#EF4444" },
  engineer: { label: "Audio/Lighting", icon: Headphones, color: "#8CFF3D" },
};
export const ROOM_ORDER = ["general", "venue", "manager", "engineer"];

export default function GigRooms() {
  const navigate = useNavigate(); const goBack = useGoBack();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const preselectRoom = params.get("room");

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [gigTitle, setGigTitle] = useState("");
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setCheckingAuth(false);
    });
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    if (!user || !token) { setLoading(false); if (!token) setNotFound(true); return; }
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc("ensure_my_gig_room_membership", { p_token: token });
        if (error) throw error;
        setGigTitle(data.gig_title || "Gig");
        const sorted = openRooms(data.rooms).sort((a, b) => ROOM_ORDER.indexOf(a.section) - ROOM_ORDER.indexOf(b.section));
        setRooms(sorted);
        if (sorted.length > 0) {
          // A pilot-card back link can ask to land back on the specific
          // room the person was in rather than always defaulting to the
          // first one.
          const preselected = preselectRoom && sorted.find((r) => r.id === preselectRoom);
          setActiveRoomId(preselected ? preselected.id : sorted[0].id);
        }
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [checkingAuth, user, token]);

  // Keeps the URL's room= in sync with whichever room is selected, using
  // replace so switching rooms never adds history entries of its own. This
  // is what lets a pilot-card visit opened from here (which does add a
  // real entry) pop back via browser history to the exact room the person
  // left, instead of always landing back on the first one.
  useEffect(() => {
    if (!token || !activeRoomId) return;
    navigate(`/gig/rooms?token=${token}&room=${activeRoomId}`, { replace: true });
  }, [token, activeRoomId]);

  if (checkingAuth || loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Sign in to view Rooms</p>
          <button onClick={() => navigate("/login")} className="text-[#8CFF3D] text-sm hover:underline">Sign In</button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <p className="text-white/50 text-lg">Gig not found</p>
      </div>
    );
  }

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const activeMeta = ROOM_META[activeRoom?.section] || ROOM_META.general;

  const chat = rooms.length === 0 ? (
    <div className="flex-1 flex items-center justify-center px-6 text-center">
      <p className="text-white/30 text-sm">You'll see rooms here once you're connected to a section on this gig.</p>
    </div>
  ) : (
    <RoomChatPanel
      fill
      roomId={activeRoomId}
      user={user}
      emptyLabel={`No messages yet in ${activeMeta.label} - say hello.`}
      placeholder={`Message ${activeMeta.label}...`}
      pilotCardBackTo={`/gig/rooms?token=${token}&room=${activeRoomId}`}
    />
  );

  // Desktop (1024px+): the rooms down the left, the open room's chat filling
  // the rest, and the left rail.
  if (isDesktop) {
    return (
      <div className="h-screen bg-[#0d0d0d] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-6 h-[72px] border-b border-[#1a1a1a]">
          <button onClick={() => goBack(`/gig/web?token=${token}`)} className="p-2 -ml-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 shrink-0" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-2xl leading-tight truncate">{gigTitle}</h1>
            <p className="text-white/45 text-xs mt-0.5">Rooms</p>
          </div>
          {DIRECT_MESSAGES_OPEN && (
          <Link to={`/gig/messages?token=${token}`} className="ml-auto h-10 px-4 rounded-[10px] flex items-center gap-2 bg-[#161616] border border-[#262626] text-white/80 hover:text-white text-sm font-semibold">
            <Mail className="w-4 h-4" /> Private messages
          </Link>
          )}
        </div>
        <div className="flex-1 min-h-0 flex gap-4 px-5 py-4">
          <nav aria-label="Rooms" className="w-[260px] shrink-0 flex flex-col gap-1.5">
            {rooms.map((r) => {
              const meta = ROOM_META[r.section] || ROOM_META.general;
              const Icon = meta.icon;
              const active = r.id === activeRoomId;
              return (
                <button
                  key={r.id}
                  onClick={() => setActiveRoomId(r.id)}
                  aria-current={active ? "true" : undefined}
                  className="h-12 px-3.5 rounded-xl flex items-center gap-3 text-left text-[15px] font-semibold border transition-colors"
                  style={active
                    ? { color: meta.color, backgroundColor: meta.color + "1f", borderColor: meta.color + "66" }
                    : { color: "rgba(255,255,255,0.65)", borderColor: "#222", backgroundColor: "#121212" }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {meta.label}
                </button>
              );
            })}
          </nav>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-2xl border border-[#1f1f1f] bg-[#101010] overflow-hidden">
            {activeRoom && (
              <div className="shrink-0 px-6 py-3 border-b border-[#1a1a1a] flex items-center gap-2" style={{ color: activeMeta.color }}>
                <activeMeta.icon className="w-4 h-4" />
                <span className="text-sm font-bold tracking-wide">{activeMeta.label}</span>
              </div>
            )}
            {chat}
          </div>
        </div>
        <BottomTabs railOnly />
      </div>
    );
  }

  return (
    <div className="relative isolate h-[100dvh] bg-[#0d0d0d] flex flex-col overflow-hidden">
      {/* The event's photo behind the room (job 73). */}
      <EventBackdrop token={token} />
      <div className="shrink-0 bg-[#0d0d0d]/85 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => goBack(`/gig/web?token=${token}`)} className="p-1 text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-bold text-lg leading-tight truncate">{gigTitle}</h1>
            <p className="text-white/40 text-xs mt-0.5">Rooms</p>
          </div>
          {/* Private messages live here now that the event header has a single chat icon (job 119). */}
          {DIRECT_MESSAGES_OPEN && (
          <Link to={`/gig/messages?token=${token}`} aria-label="Private messages" className="shrink-0 h-10 px-3 rounded-xl flex items-center gap-1.5 bg-[#161616] border border-[#262626] text-white/80 hover:text-white text-[13px] font-semibold">
            <Mail className="w-4 h-4" /> Private
          </Link>
          )}
        </div>
        {rooms.length > 0 && (
          <div className="flex gap-1.5 px-4 pb-3 max-w-lg mx-auto overflow-x-auto">
            {rooms.map((r) => {
              const meta = ROOM_META[r.section] || ROOM_META.general;
              const Icon = meta.icon;
              const active = r.id === activeRoomId;
              return (
                <button
                  key={r.id}
                  onClick={() => setActiveRoomId(r.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors"
                  style={active
                    ? { color: meta.color, backgroundColor: meta.color + "22", borderColor: meta.color + "60" }
                    : { color: "rgba(255,255,255,0.4)", borderColor: "#222" }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p className="text-white/30 text-sm">You'll see rooms here once you're connected to a section on this gig.</p>
        </div>
      ) : (
        <RoomChatPanel
          fill
          roomId={activeRoomId}
          user={user}
          emptyLabel={`No messages yet in ${activeMeta.label} - say hello.`}
          placeholder={`Message ${activeMeta.label}...`}
          pilotCardBackTo={`/gig/rooms?token=${token}&room=${activeRoomId}`}
        />
      )}
    </div>
  );
}
