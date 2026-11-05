import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT } from "@/lib/sceneStyle";
import { localISO, shortDate } from "@/lib/needsMe";
import useAnnouncements, { ANNOUNCEMENTS_CHANGED } from "@/lib/announcements";

// "+" > Announce (job 73, "On the road" stage 2): one message to everyone on
// an event, or on all your upcoming events. It stays on their Needs me until
// they tap Got it; below, what you sent lately and how many have seen it.
export default function AnnouncePane({ accent, words, onSent }) {
  const [events, setEvents] = useState(null);
  const [scope, setScope] = useState("one"); // one | all
  const [token, setToken] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { sent } = useAnnouncements();
  const today = localISO();

  // Your upcoming events: the ones you own and the ones you're on.
  useEffect(() => {
    let off = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!off) setEvents([]); return; }
      const [owned, links] = await Promise.all([
        supabase.from("shows").select("id, share_token, event_name, band_name, venue, city, date").eq("owner_id", user.id).eq("archived", false),
        supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("archived", false),
      ]);
      const linked = await Promise.all((links.data || []).map(async (l) => {
        const { data } = await supabase.rpc("get_shared_gig", { p_token: l.share_token });
        return data ? { ...data, share_token: l.share_token } : null;
      }));
      const seen = new Set();
      const list = [...(owned.data || []), ...linked.filter(Boolean)]
        .filter((g) => g.share_token && !seen.has(g.share_token) && seen.add(g.share_token))
        .filter((g) => !g.date || g.date >= today)
        .sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || "").localeCompare(String(b.date || "")));
      if (!off) { setEvents(list); setToken((t) => t || list[0]?.share_token || ""); }
    })();
    return () => { off = true; };
  }, [today]);

  const targets = useMemo(() => (scope === "all" ? (events || []).map((g) => g.share_token) : token ? [token] : []), [scope, events, token]);

  const send = async () => {
    if (busy || !body.trim() || !targets.length) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("post_announcement", { p_tokens: targets, p_body: body.trim() });
    setBusy(false);
    if (error) { console.error(error); setErr("Couldn't send it. Try again."); return; }
    window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED));
    onSent?.();
  };

  const seg = (on) => (on ? { background: accent, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.7)" });
  const n = (events || []).length;

  return (
    <div className="flex flex-col gap-3.5 min-h-0 flex-1 overflow-y-auto pb-2 [&>*]:shrink-0">
      <h2 className="m-0 text-[28px] font-bold tracking-[0.02em] text-white" style={{ fontFamily: SCENE_FONT }}>Tell everyone</h2>
      <p className="m-0 -mt-1.5 text-[15px] text-white/60">It stays on their Needs me until they tap Got it.</p>

      {events === null ? (
        <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" /></div>
      ) : n === 0 ? (
        <p className="m-0 text-[15px] text-white/50">You're not on any upcoming {words.events.toLowerCase()} yet.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Send to" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1a1a1a]">
            <button type="button" role="radio" aria-checked={scope === "one"} onClick={() => setScope("one")} className="h-10 rounded-[9px] text-[15px] font-bold" style={seg(scope === "one")}>One {words.event.toLowerCase()}</button>
            <button type="button" role="radio" aria-checked={scope === "all"} onClick={() => setScope("all")} className="h-10 rounded-[9px] text-[15px] font-bold" style={seg(scope === "all")}>All upcoming · {n}</button>
          </div>
          {scope === "one" && (
            <select value={token} onChange={(e) => setToken(e.target.value)} aria-label={`Which ${words.event.toLowerCase()}`}
              className="h-[48px] px-3.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white text-base outline-none">
              {events.map((g) => <option key={g.share_token} value={g.share_token}>{[g.date ? shortDate(g.date) : null, eventTitle(g)].filter(Boolean).join(" · ")}</option>)}
            </select>
          )}
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setErr(""); }}
            maxLength={500}
            rows={4}
            placeholder="Bus call moved to 9:30"
            aria-label="Message"
            className="resize-none rounded-[14px] bg-[#151515] border border-[#2a2a2a] text-white text-[17px] p-4 outline-none focus:border-white/30 placeholder:text-white/30"
          />
          {err && <p className="m-0 text-[13px] text-red-400">{err}</p>}
          <button type="button" onClick={send} disabled={busy || !body.trim()} className="h-[52px] rounded-xl text-[16px] font-bold disabled:opacity-40" style={{ background: accent, color: "#0d0d0d" }}>
            {busy ? "Sending…" : scope === "all" ? `Send to ${n} ${n === 1 ? words.event.toLowerCase() : words.events.toLowerCase()}` : "Send"}
          </button>
        </>
      )}

      {sent.length > 0 && (
        <div className="pt-4 flex flex-col">
          <span className="text-[13px] text-white/50 pb-2">Sent lately</span>
          {sent.slice(0, 5).map((a) => (
            <div key={a.id} className="flex flex-col gap-0.5 py-3 border-t border-[#1f1f1f]">
              <span className="text-[15px] text-white break-words">{a.body}</span>
              <span className="text-[13px]" style={{ color: a.member_count && a.seen_count >= a.member_count ? "#8CFF3D" : "rgba(255,255,255,0.55)" }}>
                {a.event_title} · {a.member_count ? `${a.seen_count} of ${a.member_count} have seen it` : "Nobody else on it yet"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
