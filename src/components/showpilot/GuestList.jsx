import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Search, X, Plus, Minus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT } from "@/lib/sceneStyle";

// The event's guest list on the phone (job 73, "On the road" stage 3).
// Everyone on the event shares one list: the band adds names, the door
// searches and checks people in. Tap "In" again to undo a check-in.
export default function GuestList({ gig, accent = "#8CFF3D", onClose }) {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [plus, setPlus] = useState(0);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_guest_list", { p_token: gig.share_token });
    if (error) { console.error(error); setFailed(true); setList((l) => l || []); return; }
    setFailed(false);
    setList(Array.isArray(data) ? data : []);
  }, [gig.share_token]);

  useEffect(() => { load(); }, [load]);
  // Pick up names others add while the door has it open.
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const people = list || [];
  const heads = (g) => 1 + Number(g.plus_ones || 0);
  const total = people.reduce((n, g) => n + heads(g), 0);
  const inCount = people.filter((g) => g.checked_in_at).reduce((n, g) => n + heads(g), 0);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? people.filter((g) => `${g.name} ${g.note || ""} ${g.added_by_name || ""}`.toLowerCase().includes(q)) : people;
    // Still to arrive first, then who's in.
    return [...rows].sort((a, b) => Number(!!a.checked_in_at) - Number(!!b.checked_in_at));
  }, [people, query]);

  const toggle = async (g) => {
    const next = !g.checked_in_at;
    setList((l) => l.map((x) => (x.id === g.id ? { ...x, checked_in_at: next ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.rpc("check_in_guest", { p_id: g.id, p_in: next });
    if (error) { console.error(error); load(); }
  };

  const remove = async (g) => {
    setList((l) => l.filter((x) => x.id !== g.id));
    const { error } = await supabase.rpc("remove_guest", { p_id: g.id });
    if (error) { console.error(error); load(); }
  };

  const add = async () => {
    const n = name.trim();
    if (!n || adding) return;
    setAdding(true); setErr("");
    const { error } = await supabase.rpc("add_guest", { p_token: gig.share_token, p_name: n, p_plus: plus, p_note: null });
    setAdding(false);
    if (error) { console.error(error); setErr("Couldn't add that name. Try again."); return; }
    setName(""); setPlus(0);
    load();
  };

  return createPortal(
    <div className="fixed inset-0 z-[65] bg-[#0d0d0d] flex flex-col" role="dialog" aria-modal="true" aria-label="Guest list" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg w-full mx-auto flex flex-col min-h-0 flex-1">
        <div className="flex items-center px-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
        </div>
        <div className="px-6 pt-2 flex items-end gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h1 className="m-0 text-[40px] leading-none tracking-[0.04em] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>GUEST LIST</h1>
            <p className="m-0 text-[15px] text-white/60 truncate">{eventTitle(gig)}</p>
          </div>
          {total > 0 && (
            <div className="flex flex-col items-end shrink-0">
              <span className="text-[32px] leading-none font-bold" style={{ fontFamily: SCENE_FONT, color: accent }}>{inCount}/{total}</span>
              <span className="text-[11px] text-white/50">in</span>
            </div>
          )}
        </div>

        {people.length > 5 && (
          <div className="px-6 pt-5">
            <label className="flex items-center gap-2.5 h-[52px] px-4 rounded-[14px] bg-[#151515] border border-[#2a2a2a] focus-within:border-white/30">
              <Search className="w-[18px] h-[18px] text-white/45 shrink-0" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a name" aria-label="Search the guest list" className="flex-1 min-w-0 bg-transparent text-white text-[17px] outline-none placeholder:text-white/35" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="w-8 h-8 flex items-center justify-center text-white/50"><X className="w-4 h-4" /></button>}
            </label>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-3 pb-4">
          {list === null ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
          ) : failed && !people.length ? (
            <p className="m-0 py-6 text-[15px] text-white/55">Couldn't load the guest list. Check your signal and try again.</p>
          ) : !people.length ? (
            <p className="m-0 py-6 text-[15px] text-white/55">No names yet. Add the first one below.</p>
          ) : shown.length === 0 ? (
            <p className="m-0 py-6 text-[15px] text-white/55">Nobody called "{query}" on the list.</p>
          ) : shown.map((g) => {
            const isIn = !!g.checked_in_at;
            const sub = [g.plus_ones ? `+${g.plus_ones}` : null, g.note, g.added_by_name ? `added by ${g.added_by_name}` : null].filter(Boolean).join(" · ");
            return (
              <div key={g.id} className="flex items-center gap-3 min-h-[64px] border-b border-[#1f1f1f]">
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className={`text-[17px] truncate ${isIn ? "text-white/50" : "text-white"}`}>{g.name}</span>
                  {sub && <span className="text-[13px] text-white/45 truncate">{sub}</span>}
                </span>
                {g.can_remove && !isIn && (
                  <button type="button" onClick={() => remove(g)} aria-label={`Remove ${g.name}`} className="w-10 h-10 flex items-center justify-center text-white/35 hover:text-white/70"><X className="w-[18px] h-[18px]" /></button>
                )}
                <button
                  type="button"
                  onClick={() => toggle(g)}
                  aria-pressed={isIn}
                  aria-label={isIn ? `${g.name} is in. Tap to undo` : `Check in ${g.name}`}
                  className="h-11 min-w-[92px] px-4 rounded-[10px] text-[14px] font-bold shrink-0"
                  style={isIn ? { color: "#8CFF3D", border: "1px solid rgba(140,255,61,0.35)" } : { background: accent, color: "#0d0d0d" }}
                >
                  {isIn ? "In" : "Check in"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-6 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-[#1f1f1f] flex flex-col gap-2">
          {err && <p className="m-0 text-[13px] text-red-400">{err}</p>}
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              placeholder="Add a name"
              aria-label="Add a name"
              maxLength={120}
              className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-[#151515] border border-[#2a2a2a] text-white text-[16px] outline-none focus:border-white/30 placeholder:text-white/35"
            />
            <div className="flex items-center h-12 rounded-xl bg-[#151515] border border-[#2a2a2a] shrink-0" aria-label="Plus ones">
              <button type="button" onClick={() => setPlus((p) => Math.max(0, p - 1))} aria-label="One fewer plus one" className="w-9 h-full flex items-center justify-center text-white/60"><Minus className="w-4 h-4" /></button>
              <span className="w-7 text-center text-[14px] text-white">+{plus}</span>
              <button type="button" onClick={() => setPlus((p) => Math.min(20, p + 1))} aria-label="One more plus one" className="w-9 h-full flex items-center justify-center text-white/60"><Plus className="w-4 h-4" /></button>
            </div>
            <button type="button" onClick={add} disabled={!name.trim() || adding} className="h-12 px-4 rounded-xl text-[15px] font-bold shrink-0 disabled:opacity-40" style={{ background: accent, color: "#0d0d0d" }}>Add</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
