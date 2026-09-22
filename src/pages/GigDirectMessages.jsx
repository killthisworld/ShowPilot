import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Send, Plus, User, X } from "lucide-react";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Shared shape for a thread/roster entry coming back from either RPC, so
// the rest of the component doesn't care which one it came from.
function personFromRow(row) {
  return {
    userId: row.user_id ?? row.other_user_id,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    cardToken: row.card_token,
    accountType: row.account_type,
  };
}

function Avatar({ photoUrl, size = "w-7 h-7" }) {
  return (
    <div className={`${size} rounded-full overflow-hidden shrink-0 bg-[#222] flex items-center justify-center`}>
      {photoUrl ? (
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <User className="w-3.5 h-3.5 text-white/30" />
      )}
    </div>
  );
}

export default function GigDirectMessages() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const preselectThread = params.get("thread");

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [gigTitle, setGigTitle] = useState("");
  const [threads, setThreads] = useState([]);
  const [roster, setRoster] = useState([]);
  const [activeThread, setActiveThread] = useState(null); // { id, userId, displayName, photoUrl, cardToken, accountType }
  const [showRoster, setShowRoster] = useState(false);
  const [startingWith, setStartingWith] = useState(null); // userId currently being started
  const [messages, setMessages] = useState([]);
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
        const { data, error } = await supabase.rpc("ensure_my_gig_dm_threads", { p_token: token });
        if (error) throw error;
        setGigTitle(data.gig_title || "Gig");
        const loadedThreads = (data.threads || []).map((t) => ({ id: t.id, ...personFromRow(t) }));
        setRoster((data.roster || []).map(personFromRow));
        setThreads(loadedThreads);
        if (preselectThread) {
          const match = loadedThreads.find((t) => t.id === preselectThread);
          if (match) setActiveThread(match);
        }
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [checkingAuth, user, token]);

  // Keeps the URL's thread= in sync with whichever thread is open, using
  // replace so opening/closing a thread never adds history entries. A
  // pilot-card visit from here passes this exact URL back so returning
  // lands on the same conversation instead of the inbox.
  useEffect(() => {
    if (!token) return;
    const url = activeThread ? `/gig/messages?token=${token}&thread=${activeThread.id}` : `/gig/messages?token=${token}`;
    navigate(url, { replace: true });
  }, [token, activeThread?.id]);

  // Loads history for the open thread and subscribes to new messages live.
  useEffect(() => {
    if (!activeThread) { setMessages([]); return; }
    let cancelled = false;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", activeThread.id)
        .order("created_at", { ascending: true });
      if (error) { console.error(error); return; }
      if (!cancelled) setMessages(data || []);
    };
    loadMessages();

    const channel = supabase
      .channel(`dm-${activeThread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeThread.id}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeThread?.id]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending || !activeThread) return;
    setSending(true);
    setDraft("");
    try {
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: activeThread.id, sender_id: user.id, body });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      setDraft(body);
    }
    setSending(false);
  };

  const startThread = async (person) => {
    if (startingWith) return;
    setStartingWith(person.userId);
    try {
      const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
        p_token: token,
        p_other_user_id: person.userId,
      });
      if (error) throw error;
      const thread = { id: data.id, ...person };
      setThreads((prev) => (prev.some((t) => t.id === thread.id) ? prev : [thread, ...prev]));
      setShowRoster(false);
      setActiveThread(thread);
    } catch (e) {
      console.error(e);
    }
    setStartingWith(null);
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
          <p className="text-white/50 text-lg mb-2">Sign in to view Private Messages</p>
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

  return (
    <div className="h-screen bg-[#0d0d0d] flex flex-col">
      <div className="shrink-0 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => (activeThread ? setActiveThread(null) : navigate(`/gig/shared?token=${token}`))}
            className="p-1 text-white/60 hover:text-white shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {activeThread ? (
            <>
              {activeThread.cardToken ? (
                <Link
                  to={`/pilot/${activeThread.cardToken}`}
                  state={{ backTo: `/gig/messages?token=${token}&thread=${activeThread.id}` }}
                  className="shrink-0"
                >
                  <Avatar photoUrl={activeThread.photoUrl} size="w-9 h-9" />
                </Link>
              ) : (
                <Avatar photoUrl={activeThread.photoUrl} size="w-9 h-9" />
              )}
              <div className="min-w-0">
                <h1 className="text-white font-bold text-lg leading-tight truncate">{activeThread.displayName || "Someone"}</h1>
                <p className="text-[11px] mt-0.5" style={{ color: getAccountTypeStyle(activeThread.accountType).color }}>
                  {getAccountTypeStyle(activeThread.accountType).label}
                </p>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <h1 className="text-white font-bold text-lg leading-tight truncate">{gigTitle}</h1>
              <p className="text-white/40 text-xs mt-0.5">Private Messages</p>
            </div>
          )}
          {!activeThread && (
            <button
              onClick={() => setShowRoster(true)}
              className="flex items-center gap-1 bg-[#8CFF3D] text-black font-semibold text-xs px-3 py-2 rounded-xl hover:bg-[#7ae62e] transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>
      </div>

      {activeThread ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-3">
            {messages.length === 0 && (
              <p className="text-white/25 text-sm text-center pt-8">
                No messages yet with {activeThread.displayName || "this person"} - say hello.
              </p>
            )}
            {messages.map((m) => {
              const isMe = m.sender_id === user.id;
              const senderColor = getAccountTypeStyle(activeThread.accountType).color;
              return (
                <div key={m.id} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                  {!isMe && <Avatar photoUrl={activeThread.photoUrl} />}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${isMe ? "bg-[#8CFF3D] text-black" : "text-white"}`}
                    style={isMe ? undefined : { backgroundColor: senderColor + "26", borderLeft: `3px solid ${senderColor}` }}
                  >
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
                placeholder={`Message ${activeThread.displayName || "them"}...`}
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
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full">
          {threads.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-6 text-center pt-16">
              <p className="text-white/30 text-sm">No private messages yet. Tap "New" to message anyone on this gig.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {threads.map((t) => {
                const style = getAccountTypeStyle(t.accountType);
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveThread(t)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#161616] transition-colors text-left"
                  >
                    <Avatar photoUrl={t.photoUrl} size="w-10 h-10" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium text-sm truncate">{t.displayName || "Someone"}</p>
                      <p className="text-[11px]" style={{ color: style.color }}>{style.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showRoster && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4" onClick={() => setShowRoster(false)}>
          <div
            className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-md max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-base">New Message</h3>
              <button onClick={() => setShowRoster(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            {roster.length === 0 ? (
              <p className="text-white/30 text-sm py-6 text-center">No one else is on this gig yet.</p>
            ) : (
              <div className="space-y-1">
                {roster.map((p) => {
                  const style = getAccountTypeStyle(p.accountType);
                  return (
                    <button
                      key={p.userId}
                      onClick={() => startThread(p)}
                      disabled={!!startingWith}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-[#1e1e1e] transition-colors text-left disabled:opacity-50"
                    >
                      <Avatar photoUrl={p.photoUrl} size="w-9 h-9" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium text-sm truncate">{p.displayName || "Someone"}</p>
                        <p className="text-[11px]" style={{ color: style.color }}>{style.label}</p>
                      </div>
                      {startingWith === p.userId && (
                        <div className="w-4 h-4 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
