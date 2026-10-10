import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

const G = "#8CFF3D";

// Owner-only RSVP list for a pay-at-the-door event, shown in Fan page
// settings. Reads fan_rsvps directly: RLS only returns RSVPs for events the
// signed-in user owns. "Copy list" gives a plain door list (name and party
// size, alphabetical) to paste anywhere or print.
export default function RsvpList({ showId }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => {
    setErr("");
    supabase
      .from("fan_rsvps")
      .select("id, name, email, guests, created_at")
      .eq("show_id", showId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setErr("Couldn't load RSVPs."); setRows([]); return; }
        setRows(data || []);
      });
  };
  useEffect(load, [showId]);

  const people = (rows || []).reduce((n, r) => n + (r.guests || 1), 0);
  const copy = async () => {
    const list = [...(rows || [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => `${r.name} (${r.guests})`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(`${list}\n\n${people} people, ${rows.length} RSVPs`);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { setErr("Couldn't copy. Try again."); }
  };
  const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <>
      <div className="mt-3.5 flex items-center gap-2">
        <span className="flex-1 text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>RSVPS</span>
        {rows && rows.length > 0 && (
          <button type="button" onClick={copy} className="text-[10px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: G }}>{copied ? "COPIED" : "COPY LIST"}</button>
        )}
        <button type="button" onClick={load} className="text-[10px] tracking-[0.1em] text-white/45 hover:text-white/80" style={{ fontFamily: SCENE_MONO }}>REFRESH</button>
      </div>
      <div className="mt-1.5 bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden">
        {rows === null ? (
          <div className="py-4 flex justify-center"><div className="w-4 h-4 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 px-3 py-2.5 border-b border-[#1c1c1c]">
              <span className="text-[28px] font-bold leading-none" style={{ fontFamily: SCENE_MONO, color: G }}>{people}</span>
              <span className="text-base font-semibold text-white/80">{people === 1 ? "person" : "people"} coming</span>
              <span className="ml-auto text-[12px] text-white/40">{rows.length} {rows.length === 1 ? "RSVP" : "RSVPs"}</span>
            </div>
            {rows.length === 0 && <p className="px-3 py-3 text-[14px] text-white/45">No RSVPs yet. Share the fan page link to get the word out.</p>}
            <div className="max-h-[240px] overflow-y-auto">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-[#181818] last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-white truncate">{r.name}</div>
                    <div className="text-[11px] text-white/40 truncate">{r.email}</div>
                  </div>
                  <span className="text-[11px] text-white/35 shrink-0">{when(r.created_at)}</span>
                  <span className="w-8 text-right text-base font-bold shrink-0" style={{ fontFamily: SCENE_MONO, color: "#fff" }}>×{r.guests}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {err && <p className="px-3 py-2 text-[13px] text-red-400">{err}</p>}
      </div>
    </>
  );
}
