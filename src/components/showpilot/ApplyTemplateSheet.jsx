import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { artistFromTemplate } from "@/lib/showTemplates";
import { localISO, shortDate } from "@/lib/needsMe";
import { SCENE_FONT } from "@/lib/sceneStyle";

// "Band pack" (job 73, "On the road" stage 4): put an artist template on
// many upcoming dates at once - members, stage plot, notes, set length,
// photo, contact. On each event the act with the same name is filled (or an
// empty act, else it's added), the same as Load Artist on one event.
// "Keep what's already there" only fills what's empty on each date.
// Only events where you can change the lineup (owner or manager) can be
// picked; the rest are listed so you know why they're missing.

const empty = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

export function mergeAct(current, fromTemplate, keep) {
  if (!keep) return { ...current, ...fromTemplate };
  const out = { ...current, band_name: fromTemplate.band_name };
  Object.entries(fromTemplate).forEach(([k, v]) => { if (empty(current[k]) && !empty(v)) out[k] = v; });
  return out;
}

async function applyToEvent(token, name, data, keep) {
  const { data: gig, error } = await supabase.rpc("get_shared_gig", { p_token: token });
  if (error || !gig) throw error || new Error("Event not found");
  const act = artistFromTemplate(name, data);
  const bands = [...(gig.bands || [])];
  const key = String(name || "").trim().toLowerCase();
  let i = bands.findIndex((b) => key && String(b.band_name || "").trim().toLowerCase() === key);
  if (i === -1) i = bands.findIndex((b) => !String(b.band_name || "").trim());
  if (i === -1) bands.push({ role: "N/A", ...act, sort_order: bands.length });
  else bands[i] = mergeAct(bands[i], act, keep);
  const { error: saveErr } = await supabase.rpc("update_shared_gig", { p_token: token, p_updates: { bands } });
  if (saveErr) throw saveErr;
}

export default function ApplyTemplateSheet({ template, accent = "#F87171", onClose }) {
  const [events, setEvents] = useState(null); // [{ share_token, title, date, can }]
  const [picked, setPicked] = useState(() => new Set());
  const [keep, setKeep] = useState(true);
  const [run, setRun] = useState(null); // { done, total, failed: [] }
  const today = localISO();

  useEffect(() => {
    let off = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!off) setEvents([]); return; }
      const [owned, links] = await Promise.all([
        supabase.from("shows").select("share_token, event_name, band_name, venue, city, date").eq("owner_id", user.id).eq("archived", false),
        supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("archived", false),
      ]);
      const ownedRows = (owned.data || []).filter((g) => g.share_token);
      const ownedTokens = new Set(ownedRows.map((g) => g.share_token));
      const linked = await Promise.all((links.data || []).filter((l) => l.share_token && !ownedTokens.has(l.share_token)).map(async (l) => {
        const [g, p] = await Promise.all([
          supabase.rpc("get_shared_gig", { p_token: l.share_token }),
          supabase.rpc("get_gig_section_permissions", { p_token: l.share_token }),
        ]);
        if (!g.data) return null;
        const perms = p.data || {};
        const can = !!perms.is_owner || (perms.my_roles || []).includes("manager") || (perms.granted_sections || []).includes("manager");
        return { ...g.data, share_token: l.share_token, can };
      }));
      const list = [...ownedRows.map((g) => ({ ...g, can: true })), ...linked.filter(Boolean)]
        .filter((g) => !g.date || g.date >= today)
        .sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || "").localeCompare(String(b.date || "")))
        .map((g) => ({ share_token: g.share_token, title: eventTitle(g), date: g.date, venue: g.venue, can: g.can }));
      if (!off) {
        setEvents(list);
        setPicked(new Set(list.filter((g) => g.can).map((g) => g.share_token)));
      }
    })();
    return () => { off = true; };
  }, [today]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !run?.going) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, run]);

  const choosable = useMemo(() => (events || []).filter((g) => g.can), [events]);
  const blocked = useMemo(() => (events || []).filter((g) => !g.can), [events]);
  const n = picked.size;

  const toggle = (t) => setPicked((s) => { const x = new Set(s); if (x.has(t)) x.delete(t); else x.add(t); return x; });
  const allOn = choosable.length > 0 && choosable.every((g) => picked.has(g.share_token));

  const apply = async () => {
    const tokens = choosable.filter((g) => picked.has(g.share_token));
    if (!tokens.length) return;
    setRun({ going: true, done: 0, total: tokens.length, failed: [] });
    const failed = [];
    for (let k = 0; k < tokens.length; k++) {
      try { await applyToEvent(tokens[k].share_token, template.name, template.data, keep); }
      catch (e) { console.error(e); failed.push(tokens[k]); }
      setRun({ going: true, done: k + 1, total: tokens.length, failed: [...failed] });
    }
    setRun({ going: false, done: tokens.length, total: tokens.length, failed });
  };

  const finished = run && !run.going;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => !run?.going && onClose()} role="dialog" aria-modal="true" aria-label={`Put ${template.name} on your dates`}>
      <div className="w-full sm:max-w-md max-h-[88dvh] flex flex-col bg-[#111] border border-[#262626] rounded-t-[22px] sm:rounded-[22px] overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0">
            <h2 className="m-0 text-[28px] leading-none font-bold text-white tracking-[0.02em]" style={{ fontFamily: SCENE_FONT }}>Put on your dates</h2>
            <p className="m-0 mt-1.5 text-[14px] text-white/60 leading-snug">{template.name}: members, stage plot, notes and set length</p>
          </div>
          <button type="button" onClick={onClose} disabled={run?.going} aria-label="Close" className="w-11 h-11 -mr-2 -mt-1 flex items-center justify-center text-white/60 disabled:opacity-30"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5">
          {events === null ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
          ) : !events.length ? (
            <p className="m-0 py-6 text-[15px] text-white/55">No upcoming dates yet. Once you're on some, they show up here.</p>
          ) : finished ? (
            <div className="py-6 flex flex-col gap-3">
              <p className="m-0 text-[18px] font-semibold text-white">{run.total - run.failed.length} of {run.total} dates updated</p>
              {run.failed.length > 0 && (
                <p className="m-0 text-[14px] text-white/60 leading-snug">Couldn't update {run.failed.map((g) => g.title).join(", ")}. Check your signal and try those again.</p>
              )}
            </div>
          ) : (
            <>
              {choosable.length > 1 && (
                <button type="button" onClick={() => setPicked(allOn ? new Set() : new Set(choosable.map((g) => g.share_token)))} className="h-10 text-[13px] font-semibold" style={{ color: accent }}>
                  {allOn ? "Clear all" : "Pick all"}
                </button>
              )}
              {choosable.map((g) => {
                const on = picked.has(g.share_token);
                return (
                  <label key={g.share_token} className="flex items-center gap-3.5 min-h-[58px] border-b border-[#1f1f1f] cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => toggle(g.share_token)} disabled={run?.going} className="w-[22px] h-[22px] shrink-0" style={{ accentColor: accent }} />
                    <span className="w-[52px] shrink-0 text-[13px] text-white/55">{g.date ? shortDate(g.date) : "No date"}</span>
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-[16px] text-white truncate">{g.title}</span>
                      {g.venue && g.venue !== g.title && <span className="text-[12.5px] text-white/45 truncate">{g.venue}</span>}
                    </span>
                  </label>
                );
              })}
              {blocked.length > 0 && (
                <p className="m-0 pt-4 text-[13px] text-white/45 leading-snug">
                  {blocked.length === 1 ? "1 date isn't listed" : `${blocked.length} dates aren't listed`}: only the event's owner or manager can change its lineup ({blocked.map((g) => g.title).join(", ")}).
                </p>
              )}
              <label className="flex items-center gap-3 min-h-[52px] pt-3 text-[14px] text-white/85 cursor-pointer">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} disabled={run?.going} className="w-5 h-5 shrink-0" style={{ accentColor: accent }} />
                Keep anything already filled in on a date (only fill what's empty)
              </label>
            </>
          )}
        </div>

        <div className="px-5 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] border-t border-[#1f1f1f]">
          {finished || !events?.length ? (
            <button type="button" onClick={onClose} className="w-full h-[52px] rounded-xl text-[16px] font-bold flex items-center justify-center gap-2" style={{ background: accent, color: "#0d0d0d" }}>
              {finished && !run.failed.length && <Check className="w-5 h-5" />} Done
            </button>
          ) : (
            <button type="button" onClick={apply} disabled={!n || run?.going} className="w-full h-[52px] rounded-xl text-[16px] font-bold disabled:opacity-40" style={{ background: accent, color: "#0d0d0d" }}>
              {run?.going ? `Updating ${run.done} of ${run.total}…` : `Put on ${n} ${n === 1 ? "date" : "dates"}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
