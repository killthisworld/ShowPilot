import React, { useEffect, useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { guestListPdf, saveOrShare } from "@/lib/guestListPdf";
import PdfStyleSheet from "@/components/showpilot/PdfStyleSheet";

const G = "#8CFF3D";
const uid = () => Math.random().toString(36).slice(2, 9);

// The event's guest list in the fan page's Guests tab (job 304). It's the
// same list as Guest list in the management profile (shows.manager_info
// .guests: { id, name, plus, artist }), so names added in either place show
// in both. Each name can say which act on the event they're a guest of.
// Create PDF makes the door copy.
//
// Saves read the latest manager_info first and change only the guest list,
// so nothing else on the management side is overwritten.
export const guestSummary = (list) =>
  list.filter((g) => g.name).map((g) => (Number(g.plus) > 0 ? `${g.name} +${Number(g.plus)}` : g.name)).join(", ");

export default function EventGuestList({ showId, lineup = [], eventName = "", eventDate = null, venue = null }) {
  const [guests, setGuests] = useState(null);
  const [acts, setActs] = useState([]);
  const [name, setName] = useState("");
  const [artist, setArtist] = useState("");
  const [plus, setPlus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    const [{ data, error }, bands] = await Promise.all([
      supabase.from("shows").select("manager_info").eq("id", showId).single(),
      supabase.from("show_bands").select("band_name").eq("show_id", showId),
    ]);
    if (error) { setErr("Couldn't load the guest list."); setGuests([]); return; }
    setGuests(Array.isArray(data?.manager_info?.guests) ? data.manager_info.guests : []);
    setActs((bands.data || []).map((b) => b.band_name).filter(Boolean));
  };
  useEffect(() => { load(); }, [showId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who a guest can be on the list for: the fan page lineup and the event's acts.
  const artists = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const n of [...lineup.map((a) => a.name), ...acts]) {
      const t = String(n || "").trim();
      if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
    }
    return out;
  }, [lineup, acts]);
  useEffect(() => { if (artists.length === 1 && !artist) setArtist(artists[0]); }, [artists, artist]);

  // Read the latest, change only the guest list, write it back.
  const save = async (change) => {
    setBusy(true); setErr("");
    const { data: cur, error: readErr } = await supabase.from("shows").select("manager_info").eq("id", showId).single();
    if (readErr) { setBusy(false); setErr("Couldn't save. Try again."); return false; }
    const mi = cur?.manager_info || {};
    const next = change(Array.isArray(mi.guests) ? mi.guests : []);
    const { error } = await supabase.from("shows").update({ manager_info: { ...mi, guests: next, guest_list: guestSummary(next) } }).eq("id", showId);
    setBusy(false);
    if (error) { setErr("Couldn't save. Try again."); return false; }
    setGuests(next);
    return true;
  };

  const add = async (e) => {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!n) { setErr("Add the guest's name."); return; }
    const ok = await save((list) => [...list, { id: uid(), name: n, plus: plus ? String(plus) : "", ...(artist ? { artist } : {}) }]);
    if (ok) { setName(""); setPlus(0); }
  };
  const remove = (g) => save((list) => list.filter((x) => (x.id ? x.id !== g.id : x !== g && x.name !== g.name)));

  const shown = (guests || []).filter((g) => g.name);
  const people = shown.reduce((n, g) => n + 1 + (Number(g.plus) || 0), 0);
  const sorted = [...shown].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const [styling, setStyling] = useState(false);
  // Create PDF opens the style screen (job 307).
  const makePdf = async (style) => { await saveOrShare(guestListPdf({ kind: "guests", rows: shown, eventName, eventDate, venue, style })); };

  const inputCls = "h-11 bg-[#0a0c1c] border border-[#262b52] rounded-lg px-3 text-white text-base placeholder:text-white/30 focus:outline-none focus:border-[#8CFF3D]/60";
  return (
    <>
      {styling && <PdfStyleSheet title="Guest list" eventName={eventName} onCreate={makePdf} onClose={() => setStyling(false)} />}
      <form onSubmit={add} className="mt-3 rounded-[10px] p-3 bg-[#111] border border-[#1f1f1f]" noValidate>
        <div className="text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>ADD A GUEST</div>
        <input className={`${inputCls} mt-2 w-full`} placeholder="Name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setErr(""); }} aria-label="Guest name" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {artists.length > 0 && (
            <select value={artist} onChange={(e) => setArtist(e.target.value)} aria-label="Guest of" className={`${inputCls} flex-1 min-w-[160px] [color-scheme:dark]`}>
              <option value="">Guest of…</option>
              {artists.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1.5" aria-label="Plus ones">
            <button type="button" onClick={() => setPlus((p) => Math.max(0, p - 1))} aria-label="One fewer" className="w-9 h-9 rounded-lg border border-[#262b52] text-white/70 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
            <span className="w-9 text-center text-base font-bold text-white" style={{ fontFamily: SCENE_MONO }}>+{plus}</span>
            <button type="button" onClick={() => setPlus((p) => Math.min(20, p + 1))} aria-label="One more" className="w-9 h-9 rounded-lg border border-[#262b52] text-white/70 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          </div>
          <button type="submit" disabled={busy} className="h-11 px-4 rounded-lg text-[15px] font-bold text-[#0d0d0d] disabled:opacity-50" style={{ background: G }}>Add</button>
        </div>
        {err && <p className="mt-2 mb-0 text-[13px] text-[#FF6B6B]">{err}</p>}
      </form>

      <div className="mt-3.5 flex items-center gap-2">
        <span className="flex-1 text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>GUEST LIST</span>
        {shown.length > 0 && <button type="button" onClick={() => setStyling(true)} className="text-[11.5px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: G }}>CREATE PDF</button>}
      </div>
      <div className="mt-1.5 bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden">
        {guests === null ? (
          <div className="py-4 flex justify-center"><div className="w-4 h-4 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 px-3 py-2.5 border-b border-[#1c1c1c]">
              <span className="text-[28px] font-bold leading-none" style={{ fontFamily: SCENE_MONO, color: G }}>{people}</span>
              <span className="text-base font-semibold text-white/80">{people === 1 ? "person" : "people"} on the list</span>
              <span className="ml-auto text-[13.5px] text-white/55">{shown.length} {shown.length === 1 ? "name" : "names"}</span>
            </div>
            {shown.length === 0 && <p className="px-3 py-3 text-[14px] text-white/45">No guests yet. Names added here or in the management profile's Guest list show up in both.</p>}
            {sorted.map((g) => (
              <div key={g.id || g.name} className="flex items-center gap-2.5 px-3 py-2 border-b border-[#181818] last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-white truncate">{g.name}</div>
                  {g.artist && <div className="text-[13px] text-white/55 truncate">Guest of {g.artist}</div>}
                </div>
                {Number(g.plus) > 0 && <span className="text-base font-bold text-white shrink-0" style={{ fontFamily: SCENE_MONO }}>+{Number(g.plus)}</span>}
                <button type="button" onClick={() => remove(g)} disabled={busy} aria-label={`Remove ${g.name}`} className="p-1 -mr-1 text-white/30 hover:text-[#FF8A8A] shrink-0 disabled:opacity-40"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
