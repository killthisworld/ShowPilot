import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Send, MapPin, Ticket, FileSignature, User, Headphones, Users } from "lucide-react";

// Matches SharedGig.jsx's palette exactly, plus a neutral for the
// everyone-welcome General room - same color language the rest of the
// app already uses for these five sections.
const ROOM_META = {
  general: { label: "General", icon: Users, color: "#9CA3AF" },
  venue: { label: "Venue", icon: MapPin, color: "#FB923C" },
  promoter: { label: "Promoter", icon: Ticket, color: "#60A5FA" },
  booking_agent: { label: "Booking", icon: FileSignature, color: "#C026D3" },
  manager: { label: "Manager/Band", icon: User, color: "#EF4444" },
  engineer: { label: "Audio/Lighting", icon: Headphones, color: "#8CFF3D" },
};
const ROOM_ORDER = ["general", "venue", "promoter", "booking_agent", "manager", "engineer"];

// Colors a message bubble by the sender's own account type (not the room's
// color), so a mixed room like General still lets you tell people apart at
// a glance. band shares manager's color since they already share a room.
// lighting shares engineer's color for the same reason.
const ACCOUNT_TYPE_COLORS = {
  venue: "#FB923C",
  promoter: "#60A5FA",
  booking_agent: "#C026D3",
  manager: "#EF4444",
  band: "#EF4444",
  engineer: "#8CFF3D",
  lighting: "#8CFF3D",
};
const DEFAULT_SENDER_COLOR = "#9CA3AF";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function GigRooms() {
  const navigate = useNavigate();
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
  const [messages, setMessages] = useState([]);
  const [senderProfiles, setSenderProfiles] = useState({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

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
        const sorted = (data.rooms || []).sort((a, b) => ROOM_ORDER.indexOf(a.section) - ROOM_ORDER.indexOf(b.section));
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

  // Loads history for the active room and subscribes to new messages live.
  // Re-subscribes whenever the room switches, cleaning up the previous
  // channel so switching rooms repeatedly doesn't stack up subscriptions.
  useEffect(() => {
    if (!activeRoomId) return;
    let cancelled = false;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", activeRoomId)
        .order("created_at", { ascending: true });
      if (error) { console.error(error); return; }
      if (cancelled) return;
      setMessages(data || []);

      // user_preferences is locked down to "view your own row only", so a
      // direct select here would silently return nothing for anyone else's
      // profile. get_conversation_member_profiles is a SECURITY DEFINER RPC
      // that checks you're actually a participant in this room and, if so,
      // returns the public card fields for everyone in it.
      const { data: people, error: peopleError } = await supabase.rpc(
        "get_conversation_member_profiles",
        { p_conversation_id: activeRoomId }
      );
      if (peopleError) { console.error(peopleError); return; }
      const map = {};
      (people || []).forEach((p) => {
        map[p.user_id] = { displayName: p.display_name, photoUrl: p.profile_photo_url, cardToken: p.card_share_token, accountType: p.account_type };
      });
      if (!cancelled) setSenderProfiles((prev) => ({ ...prev, ...map }));
    };
    loadMessages();

    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeRoomId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          const senderId = payload.new.sender_id;
          setSenderProfiles((prev) => {
            if (prev[senderId]) return prev;
            supabase.rpc("get_conversation_member_profiles", { p_conversation_id: activeRoomId })
              .then(({ data }) => {
                const map = {};
                (data || []).forEach((p) => {
                  map[p.user_id] = { displayName: p.display_name, photoUrl: p.profile_photo_url, cardToken: p.card_share_token, accountType: p.account_type };
                });
                setSenderProfiles((p) => ({ ...p, ...map }));
              });
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeRoomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending || !activeRoomId) return;
    setSending(true);
    setDraft("");
    try {
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: activeRoomId, sender_id: user.id, body });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      setDraft(body);
    }
    setSending(false);
  };

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

  return (
    <div className="h-screen bg-[#0d0d0d] flex flex-col">
      <div className="shrink-0 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-lg leading-tight truncate">{gigTitle}</h1>
            <p className="text-white/40 text-xs mt-0.5">Rooms</p>
          </div>
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
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-3">
            {messages.length === 0 && (
              <p className="text-white/25 text-sm text-center pt-8">No messages yet in {activeMeta.label} - say hello.</p>
            )}
            {messages.map((m) => {
              const isMe = m.sender_id === user.id;
              const profile = senderProfiles[m.sender_id];
              const senderColor = ACCOUNT_TYPE_COLORS[profile?.accountType] || DEFAULT_SENDER_COLOR;
              const avatar = (
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-[#222] flex items-center justify-center">
                  {profile?.photoUrl ? (
                    <img src={profile.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-white/30" />
                  )}
                </div>
              );
              return (
                <div key={m.id} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                  {!isMe && (
                    profile?.cardToken ? (
                      <Link
                        to={`/pilot/${profile.cardToken}`}
                        className="shrink-0"
                        title={profile.displayName || "View pilot card"}
                        state={{ fromRoom: true }}
                      >
                        {avatar}
                      </Link>
                    ) : (
                      avatar
                    )
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${isMe ? "bg-[#8CFF3D] text-black" : "text-white"}`}
                    style={isMe ? undefined : { backgroundColor: senderColor + "26", borderLeft: `3px solid ${senderColor}` }}
                  >
                    {!isMe && (
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: senderColor }}>
                        {profile?.displayName || "Someone"}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? "text-black/50" : "text-white/30"}`}>{formatTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>

          <div className="shrink-0 border-t border-[#1a1a1a] px-4 py-3 max-w-lg mx-auto w-full">
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={`Message ${activeMeta.label}...`}
                className="flex-1 h-11 bg-[#161616] border border-[#222] rounded-full px-4 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#333]"
              />
              <button
                onClick={sendMessage}
                disabled={!draft.trim() || sending}
                className="w-11 h-11 shrink-0 rounded-full bg-[#8CFF3D] text-black flex items-center justify-center disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30 hover:bg-[#7ae62e] transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
