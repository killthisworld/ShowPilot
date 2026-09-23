import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Send, User } from "lucide-react";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// The message history + live subscription + composer for one room
// (conversation id) - the guts of GigRooms.jsx's chat view, pulled out so
// both the standalone /gig/rooms page and Gig Web's Rooms tab can mount
// their own copy of the same, already-proven realtime logic instead of
// two versions drifting apart. `pilotCardBackTo`, if given, is where an
// avatar tap's "view pilot card" link should return to; omit it to leave
// a sender's avatar non-clickable. `fill=true` renders as two flex
// siblings (grow + pinned composer) for a full-height page like
// /gig/rooms; the default renders as a capped, self-contained box meant
// to sit inside a card, like Gig Web's Rooms tab.
export default function RoomChatPanel({ roomId, user, emptyLabel = "No messages yet - say hello.", placeholder = "Message...", pilotCardBackTo, maxHeight = 420, fill = false }) {
  const [messages, setMessages] = useState([]);
  const [senderProfiles, setSenderProfiles] = useState({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!roomId) { setMessages([]); return; }
    let cancelled = false;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", roomId)
        .order("created_at", { ascending: true });
      if (error) { console.error(error); return; }
      if (cancelled) return;
      setMessages(data || []);

      const { data: people, error: peopleError } = await supabase.rpc(
        "get_conversation_member_profiles",
        { p_conversation_id: roomId }
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
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          const senderId = payload.new.sender_id;
          setSenderProfiles((prev) => {
            if (prev[senderId]) return prev;
            supabase.rpc("get_conversation_member_profiles", { p_conversation_id: roomId })
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
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending || !roomId || !user) return;
    setSending(true);
    setDraft("");
    try {
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: roomId, sender_id: user.id, body });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      setDraft(body);
    }
    setSending(false);
  };

  if (!roomId) {
    return <p className="text-white/25 text-sm text-center py-6">No room yet.</p>;
  }

  const messageList = (
    <div
      className={fill ? "flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-3" : "overflow-y-auto space-y-3 pr-0.5"}
      style={fill ? undefined : { maxHeight }}
    >
      {messages.length === 0 && (
        <p className="text-white/25 text-sm text-center py-6">{emptyLabel}</p>
      )}
      {messages.map((m) => {
          const isMe = m.sender_id === user?.id;
          const profile = senderProfiles[m.sender_id];
          const senderColor = getAccountTypeStyle(profile?.accountType).color;
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
                profile?.cardToken && pilotCardBackTo ? (
                  <Link to={`/pilot/${profile.cardToken}`} className="shrink-0" title={profile.displayName || "View pilot card"} state={{ backTo: pilotCardBackTo }}>
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
  );

  const composer = (
    <div className={fill ? "shrink-0 border-t border-[#1a1a1a] px-4 py-3 max-w-lg mx-auto w-full" : "flex items-center gap-2 pt-3 mt-3 border-t border-[#1a1a1a]"}>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={placeholder}
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
  );

  if (fill) {
    return (
      <>
        {messageList}
        {composer}
      </>
    );
  }

  return (
    <div className="flex flex-col">
      {messageList}
      {composer}
    </div>
  );
}
