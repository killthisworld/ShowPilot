import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Check, Copy, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { MultitrackChip } from "@/components/showpilot/MultitrackQuestion";

// This event's intake links (job 74, Oct 26): the Links feature on the Audio /
// Lighting web on desktop. Everything Manage Links shows, for this event only:
// each link made for it (target_show_id) or that created it (created_show_id),
// with its additional act links (opener_requests) underneath, Submitted /
// Pending, the multi-track answer when services were included. Copy any link,
// add another act's link, delete, make a new link for this event (the event
// owner), or open every link in Manage Links.
const mainUrl = (r, userId) =>
  r.short_code
    ? `${window.location.origin}/intake/${r.short_code}`
    : `${window.location.origin}/tm-intake?token=${r.invite_token}&engineer=${userId}&name=${encodeURIComponent(r.engineer_name || "your engineer")}`;
const openerUrl = (o) =>
  o.short_code ? `${window.location.origin}/intake/${o.short_code}` : `${window.location.origin}/opener-intake?token=${o.invite_token}`;

function Status({ submitted, small = false }) {
  return (
    <span className={`shrink-0 font-bold uppercase tracking-wide rounded-full ${small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1"}`}
      style={submitted ? { background: "rgba(140,255,61,0.15)", color: "#8CFF3D" } : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }}>
      {submitted ? "Submitted" : "Pending"}
    </span>
  );
}

export default function EventLinksSheet({ gig, user, isOwner, color = "#8CFF3D", onClose }) {
  const navigate = useNavigate();
  const [links, setLinks] = useState(null);
  const [copied, setCopied] = useState(null);
  const [making, setMaking] = useState(false);
  const [services, setServices] = useState(false);
  const [adding, setAdding] = useState(null); // { id, include } while asking about services for another act's link
  const [busy, setBusy] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // link / opener id waiting for a second click
  const [err, setErr] = useState("");

  const load = async () => {
    const { data: reqs, error } = await supabase
      .from("tour_manager_requests")
      .select("*")
      .eq("engineer_user_id", user.id)
      .or(`target_show_id.eq.${gig.id},created_show_id.eq.${gig.id}`)
      .order("created_at", { ascending: false });
    if (error) { console.error(error); setErr("Couldn't load the links."); setLinks([]); return; }
    const ids = (reqs || []).map((r) => r.id);
    const byReq = {};
    if (ids.length) {
      const { data: openers, error: oErr } = await supabase
        .from("opener_requests").select("*").in("tour_manager_request_id", ids).order("order_index", { ascending: true });
      if (oErr) console.error(oErr);
      (openers || []).forEach((o) => { (byReq[o.tour_manager_request_id] = byReq[o.tour_manager_request_id] || []).push(o); });
    }
    setLinks((reqs || []).map((r) => ({ ...r, openers: byReq[r.id] || [] })));
  };
  useEffect(() => { load(); }, [gig.id, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = (key, url) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  const makeMain = async () => {
    setMaking(true); setErr("");
    try {
      const { data: prefs } = await supabase.from("user_preferences").select("display_name").eq("user_id", user.id).maybeSingle();
      const engineerName = prefs?.display_name || user.user_metadata?.full_name || user.email || "";
      const { data, error } = await supabase
        .from("tour_manager_requests")
        .insert({ engineer_user_id: user.id, engineer_name: engineerName, status: "pending", target_show_id: gig.id, event_name: gig.event_name || null, date: gig.date || null, include_services: services })
        .select().single();
      if (error) throw error;
      await load();
      copy(data.id, mainUrl(data, user.id));
    } catch (e) {
      console.error(e);
      setErr("Couldn't make a link. Try again.");
    }
    setMaking(false);
  };

  // Another act's link on the same event (Manage Links' "Generate Additional Link").
  const makeOpener = async (r, include) => {
    setAdding(null); setBusy(r.id); setErr("");
    try {
      const { data, error } = await supabase
        .from("opener_requests")
        .insert({ tour_manager_request_id: r.id, engineer_user_id: user.id, order_index: (r.openers?.length || 0) + 1, include_services: !!include })
        .select().single();
      if (error) throw error;
      await load();
      copy(data.id, openerUrl(data));
    } catch (e) {
      console.error(e);
      setErr("Couldn't make that link. Try again.");
    }
    setBusy(null);
  };

  const remove = async (kind, id) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel((c) => (c === id ? null : c)), 3000); return; }
    setConfirmDel(null); setBusy(id); setErr("");
    const { error } = await supabase.from(kind === "main" ? "tour_manager_requests" : "opener_requests").delete().eq("id", id);
    if (error) { console.error(error); setErr("Couldn't delete that link."); } else await load();
    setBusy(null);
  };

  const copyBtn = (key, url) => (
    <button type="button" onClick={() => copy(key, url)} className="shrink-0 h-8 px-2.5 rounded-lg border text-[12px] font-semibold flex items-center gap-1.5" style={copied === key ? { borderColor: color, color } : { borderColor: "#333", color: "rgba(255,255,255,0.8)" }}>
      {copied === key ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
    </button>
  );
  const delBtn = (kind, id) => (
    <button type="button" onClick={() => remove(kind, id)} disabled={busy === id} aria-label="Delete link" title="Delete link"
      className={`shrink-0 h-8 rounded-lg flex items-center justify-center text-[12px] font-semibold ${confirmDel === id ? "px-2.5 bg-red-500/15 text-red-400 border border-red-500/40" : "w-8 text-white/30 hover:text-red-400"}`}>
      {confirmDel === id ? "Delete?" : <Trash2 className="w-4 h-4" />}
    </button>
  );

  const submittedCount = (links || []).reduce((n, r) => n + (r.status === "submitted" ? 1 : 0) + r.openers.filter((o) => o.status === "submitted").length, 0);
  const totalCount = (links || []).reduce((n, r) => n + 1 + r.openers.length, 0);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4" onClick={onClose}>
      <div role="dialog" aria-label="Intake links for this event" className="w-full max-w-[600px] max-h-[86vh] flex flex-col rounded-2xl bg-[#141414] border border-[#2a2a2a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-[#222]">
          <div className="min-w-0 flex-1">
            <h2 className="text-[24px] font-bold leading-tight" style={{ fontFamily: SCENE_FONT }}>Links</h2>
            <p className="text-[11px] tracking-[0.08em] text-white/50 truncate uppercase" style={{ fontFamily: SCENE_MONO }}>
              {gig.event_name || gig.band_name || "This event"}{links && totalCount ? ` · ${submittedCount} of ${totalCount} submitted` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg border border-[#333] flex items-center justify-center text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {links === null && <p className="text-white/40 text-[14px]">Loading…</p>}
          {links && links.length === 0 && (
            <p className="text-white/50 text-[15px] leading-snug">No intake links for this event yet. Make one and send it to an act: what they fill in lands in this event's lineup.</p>
          )}
          {(links || []).map((r) => (
            <div key={r.id} className="rounded-xl bg-[#1a1a1a] border border-[#262626] p-3.5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold truncate">{r.band_name || r.submitter_name || "Main link"}</div>
                  <div className="text-[11px] text-white/45 truncate" style={{ fontFamily: SCENE_MONO }}>
                    MADE {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                    {r.submitter_name && r.band_name ? ` · FROM ${r.submitter_name.toUpperCase()}` : ""}
                  </div>
                  {r.include_services && r.status === "submitted" && <div className="mt-1.5"><MultitrackChip value={r.multitrack_interest} /></div>}
                </div>
                <Status submitted={r.status === "submitted"} />
                {copyBtn(r.id, mainUrl(r, user.id))}
                {delBtn("main", r.id)}
              </div>

              {r.openers.map((o) => (
                <div key={o.id} className="flex items-center gap-2 bg-[#111] rounded-lg pl-3 pr-1.5 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13px] text-white/75 truncate">Opener {o.order_index}{o.band_name ? ` — ${o.band_name}` : ""}</span>
                    {o.include_services && o.status === "submitted" && <div className="mt-1"><MultitrackChip value={o.multitrack_interest} small /></div>}
                  </div>
                  <Status submitted={o.status === "submitted"} small />
                  {copyBtn(o.id, openerUrl(o))}
                  {delBtn("opener", o.id)}
                </div>
              ))}

              {adding?.id === r.id ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2">
                  <span className="text-[13px] text-white/65">Include additional services?</span>
                  {[[true, "Yes"], [false, "No"]].map(([v, t]) => (
                    <button key={t} type="button" onClick={() => setAdding({ id: r.id, include: v })} className="h-8 px-3 rounded-lg border text-[13px] font-semibold"
                      style={adding.include === v ? { borderColor: color, color, background: color + "1a" } : { borderColor: "#333", color: "rgba(255,255,255,0.6)" }}>{t}</button>
                  ))}
                  <button type="button" onClick={() => makeOpener(r, adding.include)} className="ml-auto h-8 px-3 rounded-lg text-[13px] font-bold" style={{ background: color, color: "#0d0d0d" }}>Make link</button>
                  <button type="button" onClick={() => setAdding(null)} className="h-8 px-2 text-[13px] text-white/45 hover:text-white">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding({ id: r.id, include: !!r.include_services })} disabled={busy === r.id}
                  className="h-9 rounded-lg border text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ borderColor: color + "55", color }}>
                  <Plus className="w-3.5 h-3.5" /> {busy === r.id ? "Making…" : "Link for another act"}
                </button>
              )}
            </div>
          ))}
          {err && <p className="text-red-400 text-[13px]">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-[#222] flex flex-wrap items-center gap-3">
          {isOwner && (
            <>
              <label className="flex items-center gap-2 text-[13px] text-white/70 cursor-pointer">
                <input type="checkbox" checked={services} onChange={(e) => setServices(e.target.checked)} className="accent-[#8CFF3D]" />
                Include additional services
              </label>
              <button type="button" onClick={makeMain} disabled={making} className="h-10 px-4 rounded-[10px] flex items-center gap-1.5 text-[14px] font-bold disabled:opacity-60" style={{ background: color, color: "#0d0d0d" }}>
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
