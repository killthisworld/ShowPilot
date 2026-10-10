import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

const G = "#8CFF3D";

// Owner-only RSVP list for a pay-at-the-door event, shown in Fan page
// settings. Reads fan_rsvps directly: RLS only returns RSVPs for events the
// signed-in user owns. With a lineup, it also shows how many people are
// coming for each artist. "Copy list" gives a plain door list (name and
// party size, alphabetical, grouped by artist when there's a lineup).
export default function RsvpList({ showId, tall = false }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => {
    setErr("");
    supabase
      .from("fan_rsvps")
      .select("id, name, email, guests, artist_id, artist_name, created_at")
      .eq("show_id", showId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setErr("Couldn't load RSVPs."); setRows([]); return; }
        setRows(data || []);
      });
  };
  useEffect(load, [showId]);

  const people = (rows || []).reduce((n, r) => n + (r.guests || 1), 0);

  // People per artist, biggest draw first. RSVPs from before the lineup
  // existed (no artist) are grouped as "No pick".
  const byArtist = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) {
      const k = r.artist_name || null;
      const cur = m.get(k) || { name: k, people: 0, rsvps: [] };
      cur.people += r.guests || 1;
      cur.rsvps.push(r);
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.people - a.people);
  }, [rows]);
  const hasArtists = byArtist.some((g) => g.name);

  const copy = async () => {
    const line = (r) => `${r.name} (${r.guests})`;
    const byName = (a, b) => a.name.localeCompare(b.name);
    const list = hasArtists
      ? byArtist.map((g) => `${g.name || "No pick"}: ${g.people}\n${[...g.rsvps].sort(byName).map(line).join("\n")}`).join("\n\n")
      : [...(rows || [])].sort(byName).map(line).join("\n");
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
            {hasArtists && (
              <div className="px-3 py-2.5 border-b border-[#1c1c1c] space-y-1.5">
                {byArtist.map((g) => (
                  <div key={g.name || "none"} className="flex items-center gap-2.5">
                    <span className="w-[42%] min-w-0 truncate text-[14px] font-semibold" style={{ color: g.name ? "#fff" : "rgba(255,255,255,0.45)" }}>{g.name || "No pick"}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${people ? (g.people / people) * 100 : 0}%`, background: g.name ? G : "rgba(255,255,255,0.3)" }} />
                    </span>
                    <span className="w-8 text-right text-[14px] font-bold text-white" style={{ fontFamily: SCENE_MONO }}>{g.people}</span>
                  </div>
                ))}
              </div>
            )}
            {rows.length === 0 && <p className="px-3 py-3 text-[14px] text-white/45">No RSVPs yet. Share the fan page link to get the word out.</p>}
            <div className={tall ? "" : "max-h-[240px] overflow-y-auto"}>
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-[#181818] last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-white truncate">{r.name}</div>
                    <div className="text-[11px] text-white/40 truncate">{[r.artist_name, r.email].filter(Boolean).join(" · ")}</div>
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
