import React, { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Owner side of the sky messages (job 234): every message fans posted to the
// event's sky, newest first, with who wrote it (fans see no names). Hide takes
// a message out of the sky for everyone but its writer; Show puts it back.
const G = "#8CFF3D";

const dayLabel = (day) => {
  if (!day) return "";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (day === today) return "TODAY";
  return new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
};

export default function SkyPostsList({ showId }) {
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  const load = () => supabase.rpc("get_sky_posts", { p_show_id: showId }).then(({ data, error }) => {
    if (error) { setErr("Couldn't load the sky messages."); setPosts([]); return; }
    setPosts(Array.isArray(data) ? data : []);
  });
  useEffect(() => { load(); }, [showId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (p) => {
    setBusy(p.id); setErr("");
    const { error } = await supabase.rpc("set_sky_post_hidden", { p_post_id: p.id, p_hidden: !p.hidden });
    if (error) setErr("Couldn't change it. Try again.");
    else setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, hidden: !p.hidden } : x)));
    setBusy(null);
  };

  return (
    <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(10,12,28,0.85)", border: "1px solid #262b52" }}>
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4" style={{ color: G }} />
        <span className="text-[12px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: G }}>SKY MESSAGES</span>
        {posts && posts.length > 0 && <span className="ml-auto text-[12px] text-white/50" style={{ fontFamily: SCENE_MONO }}>{posts.length}</span>}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-white/60">Fans can post one message a day to the event's sky. Fans see them over the stars without names. Hide one to take it out of the sky.</p>
      {err && <p className="mt-2 text-[14px] text-red-400">{err}</p>}
      {posts === null ? (
        <div className="mt-3 w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      ) : posts.length === 0 ? (
        <p className="mt-3 text-[15px] text-white/45">No messages yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="rounded-xl px-3 py-2.5 flex items-start gap-3" style={{ background: "#05060f", border: "1px solid #1c2042", opacity: p.hidden ? 0.55 : 1 }}>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] tracking-[0.1em] text-white/55" style={{ fontFamily: SCENE_MONO }}>
                  {dayLabel(p.day)} · {(p.name || "Fan").toUpperCase()} · PARTY OF {p.guests}{p.hidden ? " · HIDDEN" : ""}
                </div>
                <p className="mt-0.5 text-[15px] leading-snug text-white break-words">{p.message}</p>
              </div>
              <button type="button" onClick={() => toggle(p)} disabled={busy === p.id}
                className="shrink-0 h-9 px-3 rounded-lg text-[13px] font-semibold border disabled:opacity-50"
                style={p.hidden ? { color: G, borderColor: "rgba(140,255,61,0.45)" } : { color: "rgba(255,255,255,0.8)", borderColor: "#2b2f5a" }}>
                {p.hidden ? "Show" : "Hide"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
