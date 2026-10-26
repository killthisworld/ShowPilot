import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Check, Copy, ExternalLink, Plus, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// This event's intake links (job 74, Oct 26): the Links feature on the Audio /
// Lighting web on desktop. Same links as Manage Links (tour_manager_requests),
// just the ones for this event: made for it (target_show_id) or that created
// it (created_show_id). Copy one, make a new one for this event (the event
// owner only, same as Calendar's "pick an event you already made"), or open
// every link in Manage Links.
const linkUrl = (r, userId, name) =>
  r.short_code
    ? `${window.location.origin}/intake/${r.short_code}`
    : `${window.location.origin}/tm-intake?token=${r.invite_token}&engineer=${userId}&name=${encodeURIComponent(name || "your engineer")}`;

const STATUS = {
  pending: { label: "WAITING", color: "#FF6A00" },
  submitted: { label: "FILLED IN", color: "#8CFF3D" },
  completed: { label: "FILLED IN", color: "#8CFF3D" },
};

export default function EventLinksSheet({ gig, user, isOwner, color = "#8CFF3D", onClose }) {
  const navigate = useNavigate();
  const [links, setLinks] = useState(null);
  const [copied, setCopied] = useState(null);
  const [making, setMaking] = useState(false);
  const [services, setServices] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("tour_manager_requests")
      .select("*")
      .eq("engineer_user_id", user.id)
      .or(`target_show_id.eq.${gig.id},created_show_id.eq.${gig.id}`)
      .order("created_at", { ascending: false });
    if (error) { console.error(error); setErr("Couldn't load the links."); setLinks([]); return; }
    setLinks(data || []);
  };
  useEffect(() => { load(); }, [gig.id, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = (r) => {
    navigator.clipboard?.writeText(linkUrl(r, user.id, r.engineer_name)).catch(() => {});
    setCopied(r.id);
    setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 1500);
  };

  const make = async () => {
    setMaking(true); setErr("");
    try {
      const { data: prefs } = await supabase.from("user_preferences").select("display_name").eq("user_id", user.id).maybeSingle();
      const engineerName = prefs?.display_name || user.user_metadata?.full_name || user.email || "";
      const { data, error } = await supabase
        .from("tour_manager_requests")
        .insert({
          engineer_user_id: user.id,
          engineer_name: engineerName,
          status: "pending",
          target_show_id: gig.id,
          event_name: gig.event_name || null,
          date: gig.date || null,
          include_services: services,
        })
        .select()
        .single();
      if (error) throw error;
      await load();
      copy(data);
    } catch (e) {
      console.error(e);
      setErr("Couldn't make a link. Try again.");
    }
    setMaking(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4" onClick={onClose}>
      <div role="dialog" aria-label="Intake links for this event" className="w-full max-w-[560px] max-h-[82vh] flex flex-col rounded-2xl bg-[#141414] border border-[#2a2a2a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-[#222]">
          <div className="min-w-0 flex-1">
            <h2 className="text-[24px] font-bold leading-tight" style={{ fontFamily: SCENE_FONT }}>Links</h2>
            <p className="text-[11px] tracking-[0.08em] text-white/50 truncate uppercase" style={{ fontFamily: SCENE_MONO }}>Intake links for {gig.event_name || gig.band_name || "this event"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg border border-[#333] flex items-center justify-center text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-2">
          {links === null && <p className="text-white/40 text-[14px]">Loading…</p>}
          {links && links.length === 0 && (
            <p className="text-white/50 text-[15px] leading-snug">No intake links for this event yet. Make one and send it to an act: what they fill in lands in this event's lineup.</p>
          )}
          {(links || []).map((r) => {
            const st = STATUS[r.status] || { label: (r.status || "").toUpperCase(), color: "#a3a3a3" };
            return (
              <div key={r.id} className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-[#1a1a1a] border border-[#262626]" style={{ borderLeft: `3px solid ${st.color}` }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold truncate">{r.band_name || r.submitter_name || "Not filled in yet"}</div>
                  <div className="text-[11px] text-white/50 truncate" style={{ fontFamily: SCENE_MONO }}>
                    <span style={{ color: st.color }}>{st.label}</span>
                    {r.created_at ? ` · MADE ${new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}` : ""}
                    {r.include_services ? " · WITH SERVICES" : ""}
                  </div>
                </div>
                <button type="button" onClick={() => copy(r)} className="shrink-0 h-9 px-3 rounded-lg border text-[13px] font-semibold flex items-center gap-1.5" style={copied === r.id ? { borderColor: color, color } : { borderColor: "#333", color: "rgba(255,255,255,0.8)" }}>
                  {copied === r.id ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
                </button>
              </div>
            );
          })}
          {err && <p className="text-red-400 text-[13px]">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-[#222] flex flex-wrap items-center gap-3">
          {isOwner && (
            <>
              <label className="flex items-center gap-2 text-[13px] text-white/70 cursor-pointer">
                <input type="checkbox" checked={services} onChange={(e) => setServices(e.target.checked)} className="accent-[#8CFF3D]" />
                Include additional services
              </label>
              <button type="button" onClick={make} disabled={making} className="h-10 px-4 rounded-[10px] flex items-center gap-1.5 text-[14px] font-bold disabled:opacity-60" style={{ background: color, color: "#0d0d0d" }}>
                <Plus className="w-4 h-4" /> {making ? "Making…" : "New link for this event"}
              </button>
            </>
          )}
          <button type="button" onClick={() => navigate("/manager-links")} className="ml-auto h-10 px-3 rounded-[10px] flex items-center gap-1.5 text-[13px] font-semibold text-white/70 hover:text-white border border-[#2a2a2a]">
            All my links <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
