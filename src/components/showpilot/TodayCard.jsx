import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT } from "@/lib/sceneStyle";
import { dayTimes, nextCall, untilText, findTime, directionsUrl } from "@/lib/daySheet";
import DaySheet from "@/components/showpilot/DaySheet";
import GuestList from "@/components/showpilot/GuestList";

const has = (v) => v != null && String(v).trim() !== "";

// The show-day card at the top of Needs me (job 73, "On the road" stage 1):
// today's event, a countdown to the next call time, doors and the set, and
// the two things you reach for on the way - Directions and the day sheet.
export default function TodayCard({ gig: base, accent, todayWord = "Today" }) {
  const [gig, setGig] = useState(base);
  const [, tick] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [guests, setGuests] = useState(false);

  // The full event (venue schedule, set times), not just the list row.
  useEffect(() => {
    let off = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_shared_gig", { p_token: base.share_token });
      if (error) console.error(error);
      if (!off && data) setGig({ ...base, ...data, icon_url: base.icon_url || data.icon_url });
    })();
    return () => { off = true; };
  }, [base]);

  // Keep the countdown current.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const times = dayTimes(gig);
  const next = nextCall(times);
  const doors = findTime(times, /door/i);
  const set = times.find((t) => t.kind === "set" && (!gig.band_name || (t.label || "").startsWith(gig.band_name)))?.time
    || times.find((t) => t.kind === "set")?.time || "";
  const line = [doors && `Doors ${doors}`, set && `Set ${set}`].filter(Boolean).join(" · ");
  const maps = directionsUrl(gig);
  const place = [gig.venue, gig.city].filter(has).join(" · ");

  return (
    <>
      <section className="mx-5 mb-4 rounded-[18px] bg-[#151515] border border-[#2a2a2a] p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[12px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_FONT, color: accent }}>{todayWord.toUpperCase()}</span>
          <span className="text-[18px] font-semibold text-white truncate">{eventTitle(gig)}</span>
          {place && <span className="text-[14px] text-white/60 truncate">{place}</span>}
        </div>

        {next ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-white/55">{next.label} {next.inMin <= 0 ? "" : "in"}</span>
            <span className="text-[48px] leading-none font-bold" style={{ fontFamily: SCENE_FONT, color: accent }}>{untilText(next.inMin)}</span>
            {line && <span className="text-[14px] text-white/70">{line}</span>}
          </div>
        ) : line ? (
          <span className="text-[16px] text-white/80">{line}</span>
        ) : null}

        <div className={`grid gap-2.5 ${maps ? "grid-cols-2" : "grid-cols-1"}`}>
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" className="h-12 rounded-xl flex items-center justify-center text-[15px] font-bold no-underline" style={{ background: accent, color: "#0d0d0d" }}>Directions</a>
          )}
          <button type="button" onClick={() => setSheet(true)} className="h-12 rounded-xl bg-[#222] text-white text-[15px] font-semibold">Day sheet</button>
        </div>
        <button type="button" onClick={() => setGuests(true)} className="-mt-1 h-11 rounded-xl border border-[#333] text-white/85 text-[14px] font-semibold">Guest list</button>
      </section>
      {sheet && <DaySheet gig={gig} accent={accent} onClose={() => setSheet(false)} />}
      {guests && <GuestList gig={gig} accent={accent} onClose={() => setGuests(false)} />}
    </>
  );
}
