import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

const G = "#8CFF3D";

// Owner-only RSVP list for a pay-at-the-door event, shown in Fan page
// settings. Reads fan_rsvps directly: RLS only returns RSVPs for events the
// signed-in user owns. With a lineup, it also shows how many people are
// coming for each artist. "Copy list" gives a plain door list (name and
// party size, alphabetical, grouped by artist when there's a lineup).
// The host can remove an RSVP (e.g. a test one); that also lets the same
// address get the confirmation email again if they RSVP for real.
export default function RsvpList({ showId, tall = false, capacity = null }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  // Remove: the row asks "Remove?" inline first, so one tap can't lose an RSVP.
  const [confirmId, setConfirmId] = useState(null);
  const [removing, setRemoving] = useState(null);

  const remove = async (r) => {
    setRemoving(r.id);
    setErr("");
    const { data, error } = await supabase.rpc("remove_fan_rsvp", { p_rsvp_id: r.id });
    setRemoving(null);
    setConfirmId(null);
    if (error || !data) { setErr("Couldn't remove that RSVP. Try again."); return; }
    setRows((rs) => (rs || []).filter((x) => x.id !== r.id));
  };

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
        <span className="flex-1 text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>RSVPS</span>
        {rows && rows.length > 0 && (
          <button type="button" onClick={copy} className="text-[11.5px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: G }}>{copied ? "COPIED" : "COPY LIST"}</button>
        )}
        <button type="button" onClick={load} className="text-[11.5px] tracking-[0.1em] text-white/55 hover:text-white/80" style={{ fontFamily: SCENE_MONO }}>REFRESH</button>
      </div>
      <div className="mt-1.5 bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden">
        {rows === null ? (
          <div className="py-4 flex justify-center"><div className="w-4 h-4 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 px-3 py-2.5 border-b border-[#1c1c1c]">
              <span className="text-[28px] font-bold leading-none" style={{ fontFamily: SCENE_MONO, color: G }}>{people}</span>
              <span className="text-base font-semibold text-white/80">{people === 1 ? "person" : "people"} coming</span>
              {capacity && <span className="text-[14px] text-white/55" style={{ fontFamily: SCENE_MONO }}>/ {capacity}</span>}
              {capacity && people >= capacity && <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold tracking-[0.1em] text-[#0d0d0d]" style={{ fontFamily: SCENE_MONO, background: G }}>FULL</span>}
              <span className="ml-auto text-[13.5px] text-white/55">{rows.length} {rows.length === 1 ? "RSVP" : "RSVPs"}</span>
            </div>
            {capacity && (
              <div className="px-3 pb-2.5 -mt-0.5 border-b border-[#1c1c1c]">
                <span className="block h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (people / capacity) * 100)}%`, background: G }} />
                </span>
                <span className="mt-1 block text-[12.5px] text-white/50">{people >= capacity ? "Full. New RSVPs are turned away." : `${capacity - people} ${capacity - people === 1 ? "spot" : "spots"} left`}</span>
              </div>
            )}
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
                    <div className="text-[13px] text-white/55 truncate">{[r.artist_name, r.email].filter(Boolean).join(" · ")}</div>
                  </div>
                  {confirmId === r.id ? (
                    <>
                      <span className="text-[14px] text-white/70 shrink-0">Remove?</span>
                      <button type="button" disabled={removing === r.id} onClick={() => remove(r)} className="px-3 py-1.5 rounded-md text-[14px] font-bold shrink-0 disabled:opacity-50" style={{ background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.5)", color: "#FF8A8A" }}>{removing === r.id ? "..." : "Remove"}</button>
                      <button type="button" onClick={() => setConfirmId(null)} className="px-2.5 py-1.5 text-[14px] text-white/60 hover:text-white shrink-0">Keep</button>
                    </>
                  ) : (
                    <>
                      <span className="text-[13px] text-white/50 shrink-0">{when(r.created_at)}</span>
                      <span className="w-8 text-right text-base font-bold shrink-0" style={{ fontFamily: SCENE_MONO, color: "#fff" }}>×{r.guests}</span>
                      <button type="button" onClick={() => setConfirmId(r.id)} aria-label={`Remove ${r.name}'s RSVP`} title="Remove RSVP" className="p-1 -mr-1 text-white/30 hover:text-[#FF8A8A] shrink-0"><X className="w-4 h-4" /></button>
                    </>
                  )}
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
