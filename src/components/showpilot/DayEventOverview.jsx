import React, { useEffect, useState } from "react";
import { eventTitle } from "@/lib/eventTitle";
import { ArrowRight, Link2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { EventTypeGlyph } from "@/components/showpilot/EventTypeIcon";
import { buildRunOfShow } from "@/components/showpilot/RoleWorkspace";
import { SCENE_MONO } from "@/lib/sceneStyle";

// The calendar's right side on desktop (job 126): an overview of the event
// on the selected day. Shows what the calendar already has straight away,
// then fills in the run of show, lineup and open items from the event
// (get_shared_gig). Clicking the day again, or Open event, opens it.
const lbl = "text-[10.5px] tracking-[0.14em] text-white/45";

export default function DayEventOverview({ gig, color = "#8CFF3D", onOpen }) {
  const [full, setFull] = useState(null);
  useEffect(() => {
    let off = false;
    if (!gig?.share_token) return undefined;
    supabase.rpc("get_shared_gig", { p_token: gig.share_token }).then(({ data }) => { if (!off && data) setFull(data); });
    return () => { off = true; };
  }, [gig?.share_token]);

  const g = { ...gig, ...(full || {}) };
  const title = eventTitle(g);
  const place = [g.venue, [g.city, g.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const ros = full ? buildRunOfShow(g) : [];
  const acts = (g.bands || []).filter((b) => b.band_name);
  const openTasks = (g.tasks || []).filter((t) => t.status !== "done").length;
  const conflicts = (g.requirements || []).filter((r) => r.status === "conflict").length;
  const requests = (g.requirements || []).filter((r) => r.status === "requested").length;
  const photo = gig.icon_url || g.icon_url;

  return (
    <div className="flex flex-col gap-3.5">
      <button type="button" onClick={onOpen} aria-label={`Open ${title}`} className="relative w-full aspect-[16/9] rounded-md overflow-hidden border border-[#262626] flex items-center justify-center" style={{ background: photo ? "#111" : color + "1a" }}>
        {photo ? (
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <EventTypeGlyph type={g.event_type} style={{ width: 64, height: 64, color, opacity: 0.7, strokeWidth: 1.5 }} />
        )}
      </button>

      <div>
        <div className="flex items-center gap-1.5">
          {!g.is_owned && <Link2 className="w-3.5 h-3.5 shrink-0" style={{ color }} />}
          <h3 className="text-[22px] font-bold leading-tight text-white">{title}</h3>
        </div>
        {place && <p className="mt-1 text-[11px] tracking-[0.06em] uppercase text-white/55" style={{ fontFamily: SCENE_MONO }}>{place}</p>}
        <p className="mt-1 text-[10.5px] tracking-[0.06em]" style={{ fontFamily: SCENE_MONO, color }}>{g.is_owned ? "YOUR EVENT" : `FROM ${(g.owner_display_name || "SOMEONE").toUpperCase()}`}</p>
      </div>

      {full && (openTasks > 0 || conflicts > 0 || requests > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {conflicts > 0 && <span className="text-[10.5px] font-bold tracking-[0.08em] px-2 py-1 rounded" style={{ fontFamily: SCENE_MONO, background: "#FF6A00", color: "#0d0d0d" }}>{conflicts} CONFLICT{conflicts === 1 ? "" : "S"}</span>}
          {requests > 0 && <span className="text-[10.5px] font-bold tracking-[0.08em] px-2 py-1 rounded bg-white text-[#0d0d0d]" style={{ fontFamily: SCENE_MONO }}>{requests} REQUEST{requests === 1 ? "" : "S"}</span>}
          {openTasks > 0 && <span className="text-[10.5px] font-bold tracking-[0.08em] px-2 py-1 rounded" style={{ fontFamily: SCENE_MONO, background: "#3b2a12", color: "#FF9A3D", border: "1px solid #FF6A0066" }}>{openTasks} TASK{openTasks === 1 ? "" : "S"} OPEN</span>}
        </div>
      )}

      {ros.length > 0 && (
        <section>
          <div className={`${lbl} mb-1.5`} style={{ fontFamily: SCENE_MONO }}>RUN OF SHOW</div>
          <div className="rounded-md border border-[#242424] divide-y divide-[#1f1f1f]">
            {ros.map((r, i) => (
              <div key={i} className="grid grid-cols-[74px_minmax(0,1fr)] gap-2 px-2.5 py-1.5 text-[14px]">
                <span className="text-white/65 text-[12.5px]" style={{ fontFamily: SCENE_MONO }}>{r.time || "—"}</span>
                <span className="truncate" style={r.kind === "curfew" ? { color: "#FCA5A5" } : undefined}>{r.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {acts.length > 0 && (
        <section>
          <div className={`${lbl} mb-1.5`} style={{ fontFamily: SCENE_MONO }}>LINEUP</div>
          <div className="flex flex-col gap-1">
            {acts.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-[14.5px]">
                <span className="w-5 text-right text-[11px] text-white/40" style={{ fontFamily: SCENE_MONO }}>{i + 1}</span>
                <span className="truncate text-white">{b.band_name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!full && <p className="text-[12px] text-white/35" style={{ fontFamily: SCENE_MONO }}>LOADING DETAILS…</p>}

      <button type="button" onClick={onOpen} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[15px] font-bold text-[#0d0d0d]" style={{ background: color }}>
        Open event <ArrowRight className="w-4 h-4" />
      </button>
      <p className="-mt-1.5 text-center text-[11px] text-white/35">or click the day again</p>
    </div>
  );
}
