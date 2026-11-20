import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { StagePlotView, instrumentsOf } from "@/components/showpilot/StagePlotView";

const G = "#8CFF3D";
const mono = { fontFamily: SCENE_MONO };
// Position, what they play, and vocals - each said once.
const memberLine = (m) => {
  const parts = [];
  const add = (t) => { if (t && !parts.some((x) => x.toLowerCase() === String(t).toLowerCase())) parts.push(String(t)); };
  add(m.position);
  instrumentsOf(m).forEach((x) => add(x.name));
  if (m.vocals && !parts.some((x) => /vocal|sing/i.test(x))) add("Vocals");
  return parts.join(" · ");
};
const niceDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");

// A stage plot shared by link (job 440): an audio engineer's "Share with
// LD". Anyone with the link sees who stands where and what they play; an LD
// signed in loads it, and it waits on their event for that date (the
// "Stage plots sent to you" box), like one sent to their account.
export default function PlotLink() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plot, setPlot] = useState(undefined); // undefined loading, null gone
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [claimed, setClaimed] = useState(null); // { events: [...] }

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_stage_plot_link", { p_token: token });
      if (live) setPlot(error || !data ? null : data);
    })();
    return () => { live = false; };
  }, [token, user?.id]);

  const here = `/plot/${token}`;
  const acts = plot?.acts || [];
  const actNames = acts.map((a) => (a.band_name || "").toLowerCase());
  const eventLine = [actNames.includes((plot?.event_name || "").toLowerCase()) ? "" : plot?.event_name, niceDate(plot?.event_date), plot?.venue].filter(Boolean).join(" · ");

  const findEvents = async () => {
    if (!plot?.event_date || !user) return [];
    const { data } = await supabase.from("shows").select("id, event_name, band_name, venue, date").eq("owner_id", user.id).eq("date", plot.event_date);
    return data || [];
  };
  const claim = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("claim_stage_plot_link", { p_token: token });
    if (error) { setBusy(false); setErr(error.message); return; }
    const events = await findEvents();
    setBusy(false);
    if (events.length === 1) { navigate(`/show/${events[0].id}`); return; }
    setClaimed({ events });
  };
  // Already loaded by this LD: show where it waits.
  useEffect(() => { if (plot?.mine && !claimed) findEvents().then((events) => setClaimed({ events })); }, [plot?.mine]); // eslint-disable-line react-hooks/exhaustive-deps

  const btn = "h-12 rounded-xl font-bold text-[15px] w-full flex items-center justify-center";
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="max-w-[560px] mx-auto px-4 pt-[max(20px,env(safe-area-inset-top))] pb-12 flex flex-col gap-4">
        <div>
          <div className="text-[10.5px] tracking-[0.2em]" style={{ ...mono, color: G }}>STAGE PLOT · FOR THE LD</div>
          <h1 className="text-[24px] font-bold leading-tight mt-1">
            {plot === undefined ? "Opening…" : plot === null ? "This link doesn't work" : acts.map((a) => a.band_name).filter(Boolean).join(", ") || "Stage plot"}
          </h1>
          {plot && <p className="text-white/55 text-[14px] mt-1">{[plot.from_name ? `From ${plot.from_name}` : "From the audio engineer", eventLine].filter(Boolean).join(" · ")}</p>}
          {plot === null && <p className="text-white/55 text-[14px] mt-1">Ask the audio engineer to share the stage plot again.</p>}
        </div>

        {plot && (
          <>
            {/* Who stands where and what they play, each act */}
            <div className="flex flex-col gap-2">
              {acts.map((a, i) => (
                <button key={i} type="button" onClick={() => setView(i)} className="text-left rounded-[12px] border border-[#262626] bg-[#121212] p-3 hover:border-[#8CFF3D]/50">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 text-[15.5px] font-semibold truncate">{a.band_name || "The act"}</div>
                    <span className="text-[11px] tracking-[0.12em]" style={{ ...mono, color: G }}>VIEW PLOT</span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {(a.band_members || []).map((m, k) => (
                      <div key={k} className="text-[13px] text-white/65 truncate">
                        <span className="text-white/90">{m.name || "Member"}</span>
                        {memberLine(m) ? ` · ${memberLine(m)}` : ""}
                      </div>
                    ))}
                    {!(a.band_members || []).length && <div className="text-[13px] text-white/40">No one on stage yet.</div>}
                  </div>
                </button>
              ))}
            </div>

            {/* Load it */}
            {!user ? (
              <div className="flex flex-col gap-2">
                <p className="text-white/60 text-[13.5px]">Sign in to ShowPilot to load the members onto your 3D stage.</p>
                <a href={`/login?redirect=${encodeURIComponent(here)}`} className={btn} style={{ background: G, color: "#111" }}>Sign in</a>
                <a href={`/register?role=lighting&redirect=${encodeURIComponent(here)}`} className={`${btn} border border-[#333] text-white`}>Make my account</a>
              </div>
            ) : plot.taken ? (
              <p className="text-white/60 text-[13.5px]">Someone else already loaded this stage plot. Ask the audio engineer to share it with you.</p>
            ) : claimed ? (
              <div className="rounded-[12px] border p-3 flex flex-col gap-2" style={{ borderColor: `${G}55`, background: "#0f150b" }}>
                <div className="text-[14.5px] font-semibold">It's waiting on your event.</div>
                <p className="text-white/60 text-[13px] leading-snug">
                  {claimed.events.length
                    ? "Open the event and tap Load under Stage plots sent to you."
                    : `Open your event${plot.event_date ? ` on ${niceDate(plot.event_date)}` : ""} (or make it) and tap Load under Stage plots sent to you.`}
                </p>
                {claimed.events.map((e) => (
                  <button key={e.id} type="button" onClick={() => navigate(`/show/${e.id}`)} className={btn} style={{ background: G, color: "#111" }}>
                    Open {e.event_name || e.band_name || "the event"}
                  </button>
                ))}
                {!claimed.events.length && <button type="button" onClick={() => navigate("/calendar")} className={btn} style={{ background: G, color: "#111" }}>Go to my calendar</button>}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={claim} disabled={busy} className={`${btn} disabled:opacity-60`} style={{ background: G, color: "#111" }}>
                  {busy ? "Loading…" : "Load onto my 3D stage"}
                </button>
                {err && <p className="text-[13px] text-red-400">{err}</p>}
              </div>
            )}
          </>
        )}
      </div>
      {view !== null && <StagePlotView acts={acts} start={view} lighting onClose={() => setView(null)} />}
    </div>
  );
}
