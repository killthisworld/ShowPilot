import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function GigRooms() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [gigTitle, setGigTitle] = useState("");
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [senderNames, setSenderNames] = useState({});
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
        if (sorted.length > 0) setActiveRoomId(sorted[0].id);
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [checkingAuth, user, token]);

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

      const senderIds = [...new Set((data || []).map((m) => m.sender_id))];
      if (senderIds.length > 0) {
        const { data: people } = await supabase
          .from("user_preferences")
          .select("user_id, display_name")
          .in("user_id", senderIds);
        const map = {};
        (people || []).forEach((p) => { map[p.user_id] = p.display_name; });
        if (!cancelled) setSenderNames((prev) => ({ ...prev, ...map }));
      }
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
          setSenderNames((prev) => {
            if (prev[senderId]) return prev;
            supabase.from("user_preferences").select("display_name").eq("user_id", senderId).maybeSingle()
              .then(({ data }) => { if (data) setSenderNames((p) => ({ ...p, [senderId]: data.display_name })); });
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
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${isMe ? "bg-[#8CFF3D] text-black" : "bg-[#1a1a1a] text-white"}`}>
                    {!isMe && (
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: activeMeta.color }}>
                        {senderNames[m.sender_id] || "Someone"}
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
