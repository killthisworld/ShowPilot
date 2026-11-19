import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Clock, ChevronRight, Check, ExternalLink } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import NightSky from "@/components/showpilot/NightSky";
import EventBanner from "@/components/showpilot/EventBanner";
import { ActBar } from "@/components/showpilot/DjWeekMonths";
import { DJ_COLOR } from "@/lib/djTools";

// An event opened from the DJ Bookings tab (job 375, Jay 2026-11-19):
// /dj/event?token=<share token>. The event banner card, then an overview of
// what a DJ needs: the set (sets in, the bar, each act's slot and whether
// their set is in; tap to open it, or + Start the set) and the artists on
// the bill with their set times. Everything else about the event (venue,
// documents, people) is one tap away on the full event page.
const GREEN = "#8CFF3D";
const BLUE = "#60A5FA";
const RED = "#F87171";
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
const initials = (s) => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const clock = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h)) return String(t);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const STATUS = {
  submitted: { label: "Set in", color: GREEN },
  started: { label: "Started", color: BLUE },
  sent: { label: "Link sent", color: DJ_COLOR },
  none: { label: "No link yet", color: "rgba(255,255,255,0.4)" },
};
const statusOf = (s) => (s.status === "submitted" ? "submitted" : s.status === "started" ? "started" : s.link_sent_at ? "sent" : "none");

function Card({ title, right = null, children }) {
  return (
    <section className="rounded-2xl border border-[#262626] bg-[#0f1016]/90 backdrop-blur p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[11px] tracking-[0.16em] text-white/65 font-normal" style={mono}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function DjEvent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [gig, setGig] = useState(null);
  const [err, setErr] = useState("");
  const [setReq, setSetReq] = useState(undefined); // undefined loading, null none
  const [slots, setSlots] = useState([]);
  const [mine, setMine] = useState(false);

  useEffect(() => {
    let gone = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_shared_gig", { p_token: token });
      if (gone) return;
      if (error || !data) { console.error(error); setErr("Couldn't open this event. Check your signal and try again."); return; }
      setGig({ ...data, share_token: token });
      const { data: { user } } = await supabase.auth.getUser();
      if (!gone) setMine(!!user && data.owner_id === user.id);
      const { data: reqs } = await supabase.from("dj_set_requests").select("id, title, due_at").eq("show_id", data.id).limit(1);
      const r = (reqs || [])[0] || null;
      if (gone) return;
      setSetReq(r);
      if (r) {
        const { data: st } = await supabase.from("dj_set_slots").select("*").eq("request_id", r.id);
        if (!gone) setSlots([...(st || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
      }
    })();
    return () => { gone = true; };
  }, [token]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/dj/gigs"));
  const all = slots.length;
  const done = slots.filter((s) => s.status === "submitted").length;
  const due = setReq?.due_at ? new Date(setReq.due_at) : null;
  const late = due && due < new Date() && done < all;
  const dueDay = due ? due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  const setTimes = gig?.manager_info?.set_times || {};
  const artists = (gig?.bands || []).filter((b) => (b.band_name || "").trim());
  const fullEvent = gig ? (mine ? `/show/${gig.id}` : `/gig/web?token=${token}`) : "";

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#000" }}>
      <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}><NightSky seed="dj-gigs" dim={0.3} /></div>
      <main className="relative z-[1] max-w-[720px] mx-auto px-4 pt-4 lg:pt-8 pb-[120px] lg:pb-12 flex flex-col gap-3">
        <button type="button" onClick={back} className="self-start min-h-[44px] -ml-2 px-2 flex items-center gap-1.5 text-[15px] font-semibold text-white/80 hover:text-white">
          <ArrowLeft className="w-5 h-5" />Gigs
        </button>
        {err ? (
          <p className="m-0 py-10 text-center text-[15px] text-white/65">{err}</p>
        ) : !gig ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : (
          <>
            <EventBanner gig={gig} />

            {/* The set: how many are in, and each act's slot. */}
            {setReq === undefined ? null : setReq ? (
              <Card title="THE SET" right={(
                <span className="text-[22px] leading-none" style={{ ...cond, color: all && done >= all ? GREEN : "#fff" }}>{done}<span className="text-white/40">/{all}</span></span>
              )}>
                {all > 0 ? <ActBar slots={slots.map((s) => s.status || "waiting")} height={8} /> : <p className="m-0 text-[14px] text-white/55">No acts on the set yet.</p>}
                {due && done < all && (
                  <span className="self-start min-h-[26px] px-2.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5"
                    style={late ? { background: `${RED}22`, color: RED } : { background: `${DJ_COLOR}1c`, color: DJ_COLOR }}>
                    <Clock className="w-3.5 h-3.5" />{late ? `Overdue · was due ${dueDay}` : `Sets due ${dueDay}`}
                  </span>
                )}
                {all > 0 && (
                  <ol className="m-0 p-0 list-none flex flex-col divide-y divide-white/[0.07]">
                    {slots.map((s, i) => {
                      const st = STATUS[statusOf(s)];
                      const time = [clock(s.set_start), clock(s.set_end)].filter(Boolean).join("–");
                      return (
                        <li key={s.id} className="min-h-[48px] flex items-center gap-3 py-2">
                          <span className="w-6 text-[13px]" style={{ ...mono, color: DJ_COLOR }}>{String(i + 1).padStart(2, "0")}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[15.5px] font-semibold truncate">{s.artist_name || "Act"}</span>
                            {time && <span className="block text-[12.5px] text-white/55">{time}</span>}
                          </span>
                          <span className="shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: st.color }}>
                            {statusOf(s) === "submitted" ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />}
                            {st.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <button type="button" onClick={() => navigate(`/dj?event=${setReq.id}`)}
                  className="min-h-[46px] rounded-xl font-bold text-[15px] flex items-center justify-center gap-1.5" style={{ background: DJ_COLOR, color: "#0d0d0d" }}>
                  Open the set<ChevronRight className="w-4 h-4" strokeWidth={3} />
                </button>
              </Card>
            ) : (
              <Card title="THE SET">
                <p className="m-0 text-[14px] text-white/60">No set for this event yet.</p>
                {mine && (
                  <button type="button" onClick={() => navigate(`/dj?show=${gig.id}`)}
                    className="min-h-[46px] rounded-xl font-bold text-[15px] flex items-center justify-center gap-1.5" style={{ background: DJ_COLOR, color: "#0d0d0d" }}>
                    <Plus className="w-4 h-4" strokeWidth={3} />Start the set
                  </button>
                )}
              </Card>
            )}

            {/* The artists on the bill and their set times. */}
            {artists.length > 0 && (
              <Card title="ARTISTS" right={<span className="text-[12px] text-white/50" style={mono}>{artists.length}</span>}>
                <ul className="m-0 p-0 list-none flex flex-col divide-y divide-white/[0.07]">
                  {artists.map((b, i) => (
                    <li key={b.id || i} className="min-h-[52px] flex items-center gap-3 py-2">
                      <span className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 flex items-center justify-center text-[13px] font-bold" style={{ borderColor: DJ_COLOR, color: DJ_COLOR, background: "#1a1a10" }}>
                        {b.photo_url ? <img src={b.photo_url} alt="" className="w-full h-full object-cover" /> : initials(b.band_name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15.5px] font-semibold truncate">{b.band_name}</span>
                        {b.genre && <span className="block text-[12.5px] text-white/55 truncate">{b.genre}</span>}
                      </span>
                      {setTimes[b.band_name] && <span className="shrink-0 text-[13px] text-white/80 flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-white/45" />{setTimes[b.band_name]}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <button type="button" onClick={() => navigate(fullEvent)} className="self-center mt-1 min-h-[44px] px-3 flex items-center gap-1.5 text-[14px] font-semibold text-white/65 hover:text-white">
              Full event details<ExternalLink className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
