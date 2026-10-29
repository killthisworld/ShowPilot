import React, { useEffect, useState } from "react";
import { eventTitle } from "@/lib/eventTitle";
import { MapPin } from "lucide-react";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { sectionPhoto } from "@/lib/sectionPhotos";

// The event banner on tech phone event pages (job 134): the event photo as the
// background with the type tag, title, date and place over it - the same look
// as the top of the company phone's event Overview (EventOverviewSheet).
// No photo -> a glow in the event type's color.
export default function EventBanner({ gig, imageUrl, title }) {
  const color = eventTypeColor(gig.event_type) || "#8CFF3D";
  const name = title || eventTitle(gig);
  const when = gig.date ? new Date(gig.date + "T00:00:00") : null;
  const place = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  // No event picture: the venue's photo (job 163), else the headliner's /
  // an act's / the artist's photo (job 157).
  const headliner = (gig.bands || []).find((b) => b.photo_url && b.band_name && b.band_name === gig.band_name);
  const src = imageUrl || gig.icon_url || gig.venue_info?.photo_url || headliner?.photo_url || sectionPhoto("band", gig, { profile: false }) || "";
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const img = broken ? null : src;

  return (
    <div className="relative isolate overflow-hidden rounded-2xl border border-[#242424] min-h-[190px] flex flex-col justify-end px-4 pb-4 pt-10">
      {img ? (
        <img src={img} alt="" onError={() => setBroken(true)} className="absolute inset-0 -z-10 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 -z-10" style={{ background: `radial-gradient(120% 120% at 70% 0%, ${color}55, #0d0d0d 70%)` }} />
      )}
      <span className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(13,13,13,0.15) 0%, rgba(13,13,13,0.55) 45%, rgba(13,13,13,0.95) 100%)" }} />
      {gig.event_type && (
        <span className="self-start text-[10px] tracking-[0.1em] px-2 py-[3px] rounded mb-2" style={{ fontFamily: SCENE_MONO, color, background: "rgba(0,0,0,0.55)", border: `1px solid ${color}66` }}>
          {gig.event_type.toUpperCase()}
        </span>
      )}
      <h1 className="m-0 text-[30px] leading-[1.05] font-bold text-white tracking-[0.02em] break-words" style={{ fontFamily: SCENE_FONT }}>{name}</h1>
      <p className="m-0 mt-1.5 text-[12px] tracking-[0.08em] text-white/75 uppercase" style={{ fontFamily: SCENE_MONO }}>
        {[when ? when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "No date yet", gig.event_time].filter(Boolean).join(" · ")}
      </p>
      {place && (
        <p className="m-0 mt-1 flex items-center gap-1.5 text-[14px] text-white/80">
          <MapPin className="w-4 h-4 shrink-0" style={{ color }} />
          <span className="truncate">{place}</span>
        </p>
      )}
    </div>
  );
}
