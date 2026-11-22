import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Loader2, MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { DJ_COLOR } from "@/lib/djTools";
import { listRequestThreads, loadThread, sendChat } from "@/lib/djKit";
import DjRequestChatView from "@/components/showpilot/DjRequestChatView";
import { ReplySheet } from "@/components/showpilot/DjDateRequests";

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
const HOLD = "#FB923C";
const GREEN = "#8CFF3D";
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const ago = (iso) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

// DJ mode's Chats (job 466): the event chats as before, plus a Requests tab
// (job 468, was In progress + Confirmed) with every held or confirmed date
// request chat, newest first, each labelled On hold or Confirmed.
// ?thread=<request id> opens that chat (the DJ's email links here).
export default function DjChatsShell({ children }) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const threadId = new URLSearchParams(search).get("thread");
  const [tab, setTab] = useState("events");
  const [threads, setThreads] = useState(null);
  const load = useCallback(() => listRequestThreads().then(setThreads), []);
  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("dj-chats-changed", load);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("dj-chats-changed", load); };
  }, [load]);
  const open = threads?.find((t) => t.id === threadId) || null;
  useEffect(() => { if (open) setTab("requests"); }, [open?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (threads || [])
    .filter((t) => t.status === "hold" || t.status === "accepted")
    .sort((a, b) => Date.parse(b.last_message_at || 0) - Date.parse(a.last_message_at || 0));
  const tabs = [["events", "Event chats", 0], ["requests", "Requests", list.filter((t) => t.unread).length]];
  const openThread = (id) => navigate(`/?view=chats&thread=${id}`);
  const closeThread = () => navigate("/?view=chats", { replace: true });

  return (
    <div className="flex flex-col" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg lg:max-w-none mx-auto w-full px-5 lg:px-6 pt-4 lg:pt-5">
        <div role="tablist" aria-label="Chats" className="flex gap-1 p-1 rounded-full bg-black/45 border border-white/10 lg:max-w-[520px]">
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="flex-1 min-h-[38px] px-2 rounded-full text-[13.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap" style={tab === k ? { background: DJ_COLOR, color: "#000" } : { color: "rgba(255,255,255,0.75)" }}>
              {label}
              {n > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center" style={tab === k ? { background: "#000", color: DJ_COLOR } : { background: GREEN, color: "#0d0d0d" }}>{n}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "events" ? children : (
        <div className="max-w-lg lg:max-w-[900px] mx-auto w-full px-5 lg:px-6 pt-4 pb-28 flex flex-col gap-2">
          {threads === null ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
          ) : list.length === 0 ? (
            <div className="rounded-xl bg-[#151515] border border-[#262626] p-5 flex flex-col items-center gap-2 text-center">
              <MessageCircle className="w-8 h-8 text-white/40" />
              <p className="m-0 text-base font-semibold text-white">No request chats yet</p>
              <p className="m-0 text-sm text-white/55">When you hold or accept a date request in Bookings › Requests, you can talk with the promoter here.</p>
            </div>
          ) : list.map((t) => {
            const dt = new Date(`${t.date}T00:00:00`);
            const color = t.status === "accepted" ? GREEN : HOLD;
            return (
              <button key={t.id} type="button" onClick={() => openThread(t.id)} className="w-full text-left rounded-xl bg-[#121318] border border-[#262626] hover:border-white/25 flex items-stretch overflow-hidden">
                <span className="w-[58px] shrink-0 flex flex-col items-center justify-center border-r border-dashed border-white/15 text-[10px] tracking-[0.1em] leading-tight" style={{ ...mono, color }}>
                  {MON[dt.getMonth()]}<span className="text-[22px] text-white tracking-normal" style={cond}>{dt.getDate()}</span>
                </span>
                <span className="min-w-0 flex-1 px-3 py-2.5 flex flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className={`text-[15.5px] truncate ${t.unread ? "font-bold text-white" : "font-semibold text-white/90"}`}>{t.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-white/50">{ago(t.last_message_at)}</span>
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 px-2 py-[1px] rounded-full text-[10.5px] font-bold" style={{ background: color, color: "#000" }}>{t.status === "accepted" ? "Confirmed" : "On hold"}</span>
                    <span className="text-[13px] text-white/60 truncate">{[t.event_name, t.venue].filter(Boolean).join(" · ") || "A night"}</span>
                  </span>
                </span>
                <span className="pr-3 flex items-center gap-2">
                  {t.unread && <span className="w-2.5 h-2.5 rounded-full" style={{ background: GREEN }} aria-label="New message" />}
                  <ChevronRight className="w-5 h-5 text-white/50" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && <ThreadScreen t={open} onClose={closeThread} onChanged={load} />}
    </div>
  );
}

// One chat, full screen.
function ThreadScreen({ t, onClose, onChanged }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState(null);
  const [answering, setAnswering] = useState(null);
  const refresh = useCallback(() => loadThread(t.id).then((m) => { if (m) setMessages(m); }), [t.id]);
  useEffect(() => {
    refresh();
    const iv = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 5000);
    return () => clearInterval(iv);
  }, [refresh]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !answering) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, answering]);
  const accepted = t.status === "accepted";
  const send = async (body) => {
    const m = await sendChat({ request_id: t.id }, body);
    if (m) setMessages((l) => [...(l || []), m]);
    onChanged?.();
  };
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[#0b0b0e] text-white flex flex-col lg:items-center" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="w-full lg:max-w-[760px] h-full flex flex-col lg:border-x lg:border-white/10">
        <header className="shrink-0 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 border-b border-white/10 flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold truncate">{t.name}</div>
            <div className="text-[12.5px] text-white/60 truncate">{[longDate(t.date), t.event_name, t.venue].filter(Boolean).join(" · ")}</div>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-full text-[11.5px] font-bold" style={{ background: accepted ? GREEN : HOLD, color: "#000" }}>{accepted ? "Confirmed" : "On hold"}</span>
        </header>
        {!accepted && (
          <div className="shrink-0 px-3 py-2 border-b border-white/10 flex gap-2">
            <button type="button" onClick={() => setAnswering("accept")} className="flex-1 min-h-[40px] rounded-full text-[14px] font-bold flex items-center justify-center gap-1.5" style={{ background: DJ_COLOR, color: "#000" }}><Check className="w-4 h-4" />Confirm booking</button>
            <button type="button" onClick={() => setAnswering("decline")} className="min-h-[40px] px-4 rounded-full border border-white/20 text-[14px] font-semibold">Decline</button>
          </div>
        )}
        <DjRequestChatView messages={messages} me="dj" names={{ promoter: t.name.split(/\s+/)[0] }} onSend={send} />
      </div>
      {answering && (
        <ReplySheet r={t} action={answering} onClose={() => setAnswering(null)} onDone={(_r, action, res) => {
          setAnswering(null);
          toast({ title: action === "accept" ? "Booked: it's on your Gigs" : "Declined", description: res?.emailed ? `${t.name} got an email.` : "" });
          window.dispatchEvent(new Event("dj-requests-changed"));
          onChanged?.();
          if (action === "decline") onClose(); else refresh();
        }} />
      )}
    </div>,
    document.body,
  );
}
