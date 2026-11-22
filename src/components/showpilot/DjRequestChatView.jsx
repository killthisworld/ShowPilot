import React, { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { DJ_COLOR } from "@/lib/djTools";

// The chat itself (job 466), shared by the DJ (Chats > Requests)
// and the promoter (their private link): messages, newest at the
// bottom, and a box to write in. `me` is "dj" or "promoter".
const dayOf = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function DjRequestChatView({ messages, me, names, onSend, closed = false }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const end = useRef(null);
  const count = messages?.length || 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count]);

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError("");
    try { await onSend(body); setText(""); }
    catch (err) { setError(err.message || "Couldn't send it."); }
    finally { setSending(false); }
  };

  let lastDay = "";
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-1.5" aria-live="polite">
        {messages === null ? (
          <div className="m-auto"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : count === 0 ? (
          <p className="m-auto text-center text-[14px] text-white/50 max-w-[280px]">No messages yet. Say hi and sort out the details here.</p>
        ) : messages.map((m) => {
          const mine = m.sender === me;
          const day = dayOf(m.at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="self-center my-2 text-[11px] tracking-[0.08em] text-white/45 uppercase">{day}</div>}
              <div className={`max-w-[82%] flex flex-col ${mine ? "self-end items-end" : "self-start items-start"}`}>
                <div className={`px-3.5 py-2 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap break-words ${mine ? "rounded-br-md text-black" : "rounded-bl-md bg-[#1f2027] text-white"}`} style={mine ? { background: DJ_COLOR } : undefined}>
                  {m.body}
                </div>
                <span className="mt-0.5 px-1 text-[11px] text-white/40">{mine ? "You" : names?.[m.sender] || ""} · {timeOf(m.at)}</span>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={end} />
      </div>
      {closed ? (
        <p className="m-0 px-4 py-3 text-center text-[13px] text-white/50 border-t border-white/10">This chat is closed.</p>
      ) : (
        <form onSubmit={send} className="shrink-0 border-t border-white/10 p-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-end gap-2 bg-black/40">
          <label className="sr-only" htmlFor="chat-box">Message</label>
          <textarea
            id="chat-box"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 1024px)").matches) send(e); }}
            placeholder="Write a message"
            maxLength={2000}
            className="flex-1 min-h-[44px] max-h-[140px] px-3.5 py-2.5 rounded-2xl bg-[#14151b] border border-white/15 text-[15px] text-white placeholder:text-white/35 outline-none focus:border-[#FDE047] resize-none"
          />
          <button type="submit" disabled={sending || !text.trim()} aria-label="Send" className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center disabled:opacity-40" style={{ background: DJ_COLOR, color: "#000" }}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      )}
      {error && <p className="m-0 px-4 pb-2 text-[13px] text-[#F87171]" role="alert">{error}</p>}
    </div>
  );
}
