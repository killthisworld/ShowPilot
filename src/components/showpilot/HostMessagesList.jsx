import React, { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Owner side of "Message the host" (job 235): private messages fans sent
// about this event, newest first, with their name and email to reply to.
// Each event keeps its own, so nothing piles up in one inbox. Messages that
// were new when the list opened are marked NEW, then marked read.
const G = "#8CFF3D";

const when = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase() + " · "
    + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toUpperCase();
};

// fill: no height cap (the Chats page gives it the whole panel).
// onRead: called once the new messages have been marked read.
export default function HostMessagesList({ showId, fill = false, onRead }) {
  const [msgs, setMsgs] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_host_messages", { p_show_id: showId }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setErr("Couldn't load messages."); setMsgs([]); return; }
      const list = Array.isArray(data) ? data : [];
      setMsgs(list);
      if (list.some((m) => !m.read)) supabase.rpc("mark_host_messages_read", { p_show_id: showId }).then(({ error: e }) => { if (e) console.error(e); else onRead?.(); });
    });
    return () => { alive = false; };
  }, [showId]);

  const fresh = msgs ? msgs.filter((m) => !m.read).length : 0;

  return (
    <div className="mb-4 rounded-2xl p-4" style={{ background: "rgba(10,12,28,0.85)", border: `1px solid ${fresh ? "rgba(140,255,61,0.45)" : "#262b52"}` }}>
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4" style={{ color: G }} />
        <span className="text-[12px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: G }}>MESSAGES FROM FANS</span>
        {fresh > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-[#0d0d0d]" style={{ background: G, fontFamily: SCENE_MONO }}>{fresh} NEW</span>}
        {msgs && msgs.length > 0 && <span className="ml-auto text-[12px] text-white/50" style={{ fontFamily: SCENE_MONO }}>{msgs.length}</span>}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-white/60">Private notes and questions fans send you from their countdown emails and their sky. Only you see them.</p>
      {err && <p className="mt-2 text-[14px] text-red-400">{err}</p>}
      {msgs === null ? (
        <div className="mt-3 w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      ) : msgs.length === 0 ? (
        <p className="mt-3 text-[15px] text-white/45">No messages yet.</p>
      ) : (
        <ul className={`mt-3 space-y-2 ${fill ? "" : "max-h-[420px] overflow-y-auto"}`}>
          {msgs.map((m) => (
            <li key={m.id} className="rounded-xl px-3 py-2.5" style={{ background: "#05060f", border: `1px solid ${m.read ? "#1c2042" : "rgba(140,255,61,0.35)"}` }}>
              <div className="flex items-center gap-2 text-[11px] tracking-[0.1em] text-white/55" style={{ fontFamily: SCENE_MONO }}>
                {!m.read && <span className="shrink-0 whitespace-nowrap" style={{ color: G }}>NEW ·</span>}
                <span className="truncate">{(m.name || "Fan").toUpperCase()} · PARTY OF {m.guests}</span>
                <span className="ml-auto shrink-0">{when(m.at)}</span>
              </div>
              <p className="mt-1 text-[15px] leading-snug text-white whitespace-pre-line break-words">{m.message}</p>
              {m.email && (
                <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message about the show")}`}
                  className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold border" style={{ color: G, borderColor: "rgba(140,255,61,0.45)" }}>
                  <Mail className="w-3.5 h-3.5" /> Reply to {m.email}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
