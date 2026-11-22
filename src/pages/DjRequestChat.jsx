import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DJ_COLOR } from "@/lib/djTools";
import { loadPromoterChat, sendChat } from "@/lib/djKit";
import DjRequestChatView from "@/components/showpilot/DjRequestChatView";

// The promoter's chat with a DJ (job 466): /r/:token, the private link in
// their hold / confirmation email. No account needed. One screen: who and
// what on top, the chat below.
const HOLD = "#FB923C";
const GREEN = "#8CFF3D";
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export default function DjRequestChat() {
  const { token } = useParams();
  const [chat, setChat] = useState(undefined); // undefined loading, null gone
  const refresh = useCallback(() => loadPromoterChat(token).then(setChat).catch((e) => { console.error(e); setChat((c) => (c === undefined ? null : c)); }), [token]);
  useEffect(() => {
    refresh();
    const iv = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 5000);
    return () => clearInterval(iv);
  }, [refresh]);
  useEffect(() => { if (chat?.dj_name) document.title = `Chat with ${chat.dj_name}`; }, [chat?.dj_name]);

  const send = async (body) => {
    const m = await sendChat({ token }, body);
    if (m) setChat((c) => ({ ...c, messages: [...(c?.messages || []), m] }));
  };

  if (chat === undefined) return <div className="h-[100dvh] bg-black flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin" style={{ color: DJ_COLOR }} /></div>;
  if (chat === null) {
    return (
      <div className="h-[100dvh] bg-black text-white flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <h1 className="m-0 text-[22px] font-bold">This chat isn't available</h1>
        <p className="m-0 text-[15px] text-white/60">The request may have been declined, or the link mistyped.</p>
      </div>
    );
  }
  const accepted = chat.status === "accepted";
  return (
    <div className="h-[100dvh] bg-[#0b0b0e] text-white flex flex-col items-center" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="w-full max-w-[760px] h-full flex flex-col sm:border-x sm:border-white/10">
        <header className="shrink-0 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 border-b border-white/10 flex items-center gap-3">
          <span className="w-11 h-11 shrink-0 rounded-full overflow-hidden bg-[#1c1d24] flex items-center justify-center" style={{ boxShadow: `0 0 0 2px ${DJ_COLOR}` }}>
            {chat.dj_photo ? <img src={chat.dj_photo} alt="" className="w-full h-full object-cover" /> : <span className="text-[15px] font-bold" style={{ color: DJ_COLOR }}>{(chat.dj_name || "DJ").slice(0, 2).toUpperCase()}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[17px] font-bold truncate">{chat.dj_name}</h1>
            <div className="text-[12.5px] text-white/60 truncate">{[longDate(chat.date), chat.event_name, chat.venue].filter(Boolean).join(" · ")}</div>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-full text-[11.5px] font-bold" style={{ background: accepted ? GREEN : HOLD, color: "#000" }}>{accepted ? "Confirmed" : "On hold for you"}</span>
        </header>
        <DjRequestChatView messages={chat.messages || []} me="promoter" names={{ dj: chat.dj_name }} onSend={send} />
        <a href="https://get.showpilot.space" className="shrink-0 pb-2 text-center text-[11px] text-white/35 no-underline">Made with Show Pilot</a>
      </div>
    </div>
  );
}
