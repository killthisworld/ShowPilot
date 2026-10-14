import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, MessageCircle } from "lucide-react";
import useNeedsMe from "@/hooks/useNeedsMe";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { chatHref, chatTitle, sectionMeta, shortDate, timeAgo, localISO, vocab } from "@/lib/needsMe";

const BLUE = "#60A5FA";

// The company phone layout's Chats tab: every chat you're in across all your
// events, newest first, unread on top. Below it, a quick way into any
// upcoming event's rooms to start a conversation there.
export default function CompanyChats({ preferences, gigs }) {
  const navigate = useNavigate();
  const accent = getAccountTypeStyle(preferences?.account_type).color;
  const words = vocab(preferences?.account_type);
  const { data, loading, failed, reload } = useNeedsMe();

  const chats = useMemo(() => {
    const list = [...(data?.chats || [])];
    return list.sort((a, b) => (b.unread > 0) - (a.unread > 0) || String(b.last_at).localeCompare(String(a.last_at)));
  }, [data]);

  const upcoming = useMemo(() => {
    const today = localISO();
    return (gigs || []).filter((g) => g.share_token && g.date && g.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [gigs]);

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
      ) : chats.length === 0 ? (
        <div className="rounded-xl bg-[#151515] border border-[#262626] p-5 flex flex-col items-center gap-2 text-center">
          <MessageCircle className="w-8 h-8 text-white/40" />
          <p className="m-0 text-base font-semibold text-white">No conversations yet</p>
          <p className="m-0 text-sm text-white/55">Open an {words.event}'s rooms below to start one.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#111] border border-[#1f1f1f] divide-y divide-[#1f1f1f] overflow-hidden">
          {chats.map((c) => {
            const color = c.kind === "direct" ? BLUE : c.kind === "general_room" ? "#9CA3AF" : sectionMeta(c.section).color;
            const title = chatTitle(c);
            const unread = Number(c.unread || 0);
            return (
              <button key={c.id} onClick={() => navigate(chatHref(c))} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-[#181818]">
                <span className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center font-bold text-[15px]" style={{ background: color + "1c", border: `2px solid ${color}`, color }}>
                  {title.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <span className="flex items-baseline gap-2">
                    <span className={`text-[15px] truncate ${unread ? "font-bold text-white" : "font-semibold text-white/85"}`}>{title}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-white/45">{timeAgo(c.last_at)}</span>
                  </span>
                  <span className={`text-[13px] truncate ${unread ? "text-white/80" : "text-white/50"}`}>
                    {c.last_sender_name ? `${c.last_sender_name}: ` : ""}{c.last_body}
                  </span>
                  <span className="text-[10.5px] text-white/40 truncate" style={{ fontFamily: SCENE_MONO }}>
                    {[c.event_title, c.event_date ? shortDate(c.event_date) : null].filter(Boolean).join(" · ").toUpperCase()}
                  </span>
                </span>
                {unread > 0 && (
                  <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center shrink-0" style={{ background: BLUE, color: "#0d0d0d" }}>{unread}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="pt-6 flex flex-col gap-2">
          <div className="text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>{words.event.toUpperCase()} ROOMS</div>
          <div className="rounded-xl bg-[#111] border border-[#1f1f1f] divide-y divide-[#1f1f1f] overflow-hidden">
            {upcoming.map((g) => (
              <button key={g.share_token} onClick={() => navigate(`/gig/rooms?token=${g.share_token}`)} className="w-full flex items-center gap-3 px-3.5 min-h-[52px] py-2 text-left active:bg-[#181818]">
                <span className="w-12 shrink-0 text-[11px] text-white/55" style={{ fontFamily: SCENE_MONO }}>{shortDate(g.date).toUpperCase()}</span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{g.event_name || g.band_name || "Untitled"}</span>
                <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
