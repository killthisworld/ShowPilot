import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

// "Asked to work" at the top of a tech's Home (job 246, step 4): venues asking
// if you're free. Each opens the rundown with I'm in / Can't make it. Hidden
// when nobody's asking.
const BLUE = "#60A5FA";
const fmt = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");

export default function TechAsksCard({ accent = "#8CFF3D", className = "" }) {
  const [asks, setAsks] = useState([]);
  useEffect(() => {
    let live = true;
    supabase.rpc("list_my_tech_asks").then(({ data, error }) => {
      if (error) { console.error(error); return; }
      if (live && Array.isArray(data)) setAsks(data);
    });
    return () => { live = false; };
  }, []);
  if (!asks.length) return null;
  return (
    <div className={`rounded-2xl border bg-[#111] p-3 flex flex-col gap-2 ${className}`} style={{ borderColor: `${accent}66` }}>
      <div className="flex items-center gap-2 px-1">
        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
        <p className="m-0 text-[10.5px] tracking-[0.14em] font-medium" style={{ fontFamily: SCENE_MONO, color: accent }}>ASKED TO WORK</p>
        <span className="ml-auto text-[10px] text-white/45" style={{ fontFamily: SCENE_MONO }}>{asks.length}</span>
      </div>
      {asks.map((a) => (
        <Link key={a.code} to={`/t/${a.code}`} className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl border border-dashed min-h-[60px] active:bg-white/5" style={{ borderColor: `${accent}55` }}>
          <span className="w-[46px] h-[50px] rounded-[10px] bg-[#0b0b0b] border border-[#262626] flex flex-col items-center justify-center shrink-0">
            <span className="text-[9.5px] tracking-[0.1em] text-white/55" style={{ fontFamily: SCENE_MONO }}>{a.date ? new Date(`${a.date}T00:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "TBD"}</span>
            <span className="text-[20px] font-bold leading-none text-white">{a.date ? new Date(`${a.date}T00:00:00`).getDate() : "?"}</span>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-white truncate">{a.title || "A show"}</span>
            <span className="block text-[12.5px] text-white/60 truncate">{[fmt(a.date), a.venue, a.load_in && `load-in ${a.load_in}`, a.inputs ? `${a.inputs} inputs` : ""].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="shrink-0 text-[10px] font-bold tracking-[0.1em] px-2 py-1 rounded" style={{ fontFamily: SCENE_MONO, color: BLUE, background: `${BLUE}1f` }}>ARE YOU FREE?</span>
          <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
        </Link>
      ))}
    </div>
  );
}
