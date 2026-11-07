import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";

// "Are you free?" from a venue to a tech (job 246, step 4): a short rundown
// of the event (date, venue, times, who's playing) and I'm in / Can't make it.
// A yes puts the event on the tech's side with the acts' inputs and stage
// plots. No account needed to look; answering needs one.
const GREEN = "#8CFF3D";
const BLUE = "#60A5FA";
const RED = "#F87171";
const MONO = "'JetBrains Mono', monospace";
const COND = "'Barlow Condensed', sans-serif";
const btn = "w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center";
const fmt = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");

export default function TechAskView() {
  const { code } = useParams();
  const { user, isLoadingAuth } = useAuth();
  const [ask, setAsk] = useState(undefined);
  const [step, setStep] = useState("ask"); // ask | join | in | out
  const [share, setShare] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoadingAuth) return;
    supabase.rpc("get_booking_tech_ask", { p_code: code }).then(({ data, error: e }) => {
      if (e) console.error(e);
      setAsk(data || null);
    });
  }, [code, isLoadingAuth, user?.id]);

  const answer = async (yes) => {
    if (!user) { setStep("join"); return; }
    setBusy(true);
    setError("");
    try {
      const { data, error: e } = await supabase.rpc("answer_booking_tech_ask", { p_code: code, p_yes: yes });
      if (e) throw e;
      setShare(data?.share_token || "");
      setStep(yes ? "in" : "out");
    } catch (e) {
      console.error(e);
      setError(/someone else|for someone else/.test(e?.message || "") ? "This ask went to someone else." : "Couldn't send that. Try again.");
    }
    setBusy(false);
  };

  if (ask === undefined || isLoadingAuth) {
    return <div className="min-h-screen bg-[#05060d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>;
  }
  if (!ask) return <IntakeSent seed={code} bare><p className="text-white/70 text-[16px]">This ask isn't open any more.</p></IntakeSent>;

  const venueName = ask.asked_by?.name || ask.venue || "The venue";
  const here = `/t/${String(ask.code).toUpperCase()}`;
  const role = ask.role === "lighting" ? "lighting" : "engineer";

  if (step === "join") {
    return (
      <IntakeSent seed={code} title="Answer in one step" line={`Make a free ${role === "lighting" ? "lighting tech" : "audio engineer"} account and the show lands on your calendar with the acts' info.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          <a href={`/register?role=${role}&redirect=${encodeURIComponent(here)}`} className={btn} style={{ background: GREEN, color: "#0d0d0d" }}>Make my account</a>
          <a href={`/login?redirect=${encodeURIComponent(here)}`} className={`${btn} border border-[#333] text-white`}>I'm already on ShowPilot</a>
          <button type="button" onClick={() => setStep("ask")} className="mt-1 text-[14px] text-white/60">Back</button>
        </div>
      </IntakeSent>
    );
  }
  if (step === "in" || (ask.status === "in" && ask.is_mine)) {
    return (
      <IntakeSent seed={code} title="You're on it" line={`${ask.title || "The show"} at ${ask.venue || venueName} is on your calendar${ask.date ? ` for ${fmt(ask.date)}` : ""}, with the acts' inputs and stage plots.`}>
        {share && <a href={`/gig/web?token=${share}`} className={`mt-6 ${btn}`} style={{ background: GREEN, color: "#0d0d0d" }}>Open the show</a>}
        <a href="/" className="block mt-3 text-[14px] text-white/60 underline">Back to ShowPilot</a>
      </IntakeSent>
    );
  }
  if (step === "out" || (ask.status === "declined" && ask.is_mine)) {
    return <IntakeSent seed={code} title="Got it" line={`${venueName} knows you can't make it.`} />;
  }

  const sched = Array.isArray(ask.schedule) ? ask.schedule : [];
  const timeOf = (re) => sched.find((r) => re.test(r.label || ""))?.time || "";
  const chips = [["LOAD-IN", timeOf(/^load.?in/i)], ["DOORS", timeOf(/door/i)], ["CURFEW", timeOf(/curfew/i)]].filter(([, v]) => v);
  const askedBy = (cls) => (
    <div className={`items-center gap-3 ${cls}`}>
      <span className="w-9 h-9 lg:w-12 lg:h-12 rounded-full border-2 shrink-0 overflow-hidden" style={{ borderColor: BLUE, background: "#1b2433" }}>{ask.asked_by?.photo && <img src={ask.asked_by.photo} alt="" className="w-full h-full object-cover" />}</span>
      <span className="text-[14.5px] lg:text-[16px] text-white/80"><span className="font-bold text-white">{venueName}</span> asked if you're free{ask.role === "lighting" ? " for lights" : " for sound"}</span>
    </div>
  );
  // Phone: one column. Laptop: the event on the left, the answer on the right.
  return (
    <IntakeSent seed={code} bare wide>
      <div className="text-left flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:items-center">
        {askedBy("flex lg:hidden")}
        <div className="rounded-[18px] border border-[#262626] overflow-hidden bg-[#151515]/95">
          {ask.image ? <img src={ask.image} alt="" className="w-full h-[130px] lg:h-[210px] object-cover" /> : null}
          <div className="p-4 lg:p-6 flex flex-col gap-3 lg:gap-4">
            <div>
              <div className="text-[30px] lg:text-[44px] font-bold leading-none" style={{ fontFamily: COND }}>{ask.title || "A show"}</div>
              <div className="text-[14px] lg:text-[16px] text-white/75 mt-1">{[fmt(ask.date), ask.venue].filter(Boolean).join(" · ")}</div>
            </div>
            {chips.length > 0 && (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` }}>
                {chips.map(([k, v]) => (
                  <div key={k} className="rounded-[10px] bg-[#0f0f0f] border border-[#262626] p-2 lg:p-3 text-center">
                    <div className="text-[9.5px] lg:text-[10.5px] tracking-[0.1em] text-white/55" style={{ fontFamily: MONO }}>{k}</div>
                    <div className="text-[14px] lg:text-[17px] font-bold">{v}</div>
                  </div>
                ))}
              </div>
            )}
            {(ask.bands || []).length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] tracking-[0.12em] text-white/55" style={{ fontFamily: MONO }}>PLAYING</div>
                {ask.bands.map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 lg:px-3.5 lg:py-3 rounded-[10px] border" style={{ borderColor: `${RED}66`, background: "#1a1313" }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: RED }} />
                    <span className="flex-1 min-w-0 text-[14px] lg:text-[16px] font-bold truncate">{b.band_name}</span>
                    <span className="text-[12.5px] lg:text-[14px] text-white/65 shrink-0">{[b.set_time, b.inputs ? `${b.inputs} input${b.inputs === 1 ? "" : "s"}` : "", b.members ? `${b.members}-piece` : ""].filter(Boolean).join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:gap-5">
          {askedBy("hidden lg:flex")}
          {error && <p className="text-center lg:text-left text-[14px] text-red-400 m-0">{error}</p>}
          {ask.status === "asked" ? (
            <div className="flex flex-col gap-2.5">
              <button type="button" disabled={busy} onClick={() => answer(true)} className={`${btn} disabled:opacity-50`} style={{ background: GREEN, color: "#0d0d0d" }}>{busy ? "Sending…" : "I'm in"}</button>
              <button type="button" disabled={busy} onClick={() => answer(false)} className={`${btn} border border-[#333] text-white/80 disabled:opacity-50`}>Can't make it</button>
              <p className="text-center lg:text-left text-[12.5px] text-white/55">Saying yes puts the show on your calendar with their inputs and stage plot.</p>
            </div>
          ) : (
            <p className="text-center lg:text-left text-[14px] text-white/60">This one's been answered.</p>
          )}
        </div>
      </div>
    </IntakeSent>
  );
}
