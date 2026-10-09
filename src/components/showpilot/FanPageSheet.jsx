import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Check, ChevronRight, ImagePlus, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { uploadIconImage } from "@/lib/eventIcons";
import { normalizeLink, isTruncatedLink } from "@/lib/links";

const G = "#8CFF3D";

// What the owner can switch on or off. Name, icon, date and venue are the
// page itself and are always shown.
const FIELDS = [
  { key: "times", label: "Doors and show time" },
  { key: "tickets", label: "Ticket link and price" },
  { key: "band", label: "Band / artist name" },
  { key: "note", label: "Note from the artist" },
  { key: "flyer", label: "Flyer image" },
];

// Owner-only sheet that turns the public fan page on or off and picks what
// it shows. Everything is edited as a draft and written in one go when the
// owner presses Update, so the page fans see only changes when they say so.
// Reads and writes the show row directly (owner RLS), like the event icon.
function OwnerSheet({ showId, onClose }) {
  const [row, setRow] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updated, setUpdated] = useState(false);
  const fileRef = useRef(null);

  const toDraft = (data) => {
    const cfg = data.fan_page || {};
    return {
      enabled: !!data.fan_page_enabled,
      hidden: cfg.hidden || [],
      showTime: cfg.show_time || "",
      ages: cfg.ages || "",
      note: cfg.note || "",
      address: cfg.address || "",
      flyer: cfg.flyer_url || "",
      ticketLink: data.promoter_info?.ticket_link || "",
      ticketPrice: data.promoter_info?.ticket_price || "",
    };
  };

  useEffect(() => {
    let alive = true;
    supabase
      .from("shows")
      .select("fan_token, fan_page_enabled, fan_page, promoter_info")
      .eq("id", showId)
      .single()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) { setErr("Couldn't load the fan page settings."); return; }
        setRow(data);
        setDraft(toDraft(data));
      });
    return () => { alive = false; };
  }, [showId]);

  const set = (patch) => { setUpdated(false); setErr(""); setDraft((d) => ({ ...d, ...patch })); };
  const url = row ? `${window.location.origin}/e/${row.fan_token}` : "";
  const dirty = row && draft && JSON.stringify(draft) !== JSON.stringify(toDraft(row));

  const toggleField = (key) => set({ hidden: draft.hidden.includes(key) ? draft.hidden.filter((k) => k !== key) : [...draft.hidden, key] });
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setErr("Couldn't copy. Select the link and copy it."); }
  };
  const pickFlyer = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setErr("Flyer must be under 4 MB."); return; }
    setBusy(true);
    try { set({ flyer: await uploadIconImage(file) }); } catch { setErr("Couldn't upload the flyer."); }
    setBusy(false);
  };

  const update = async () => {
    setErr("");
    let ticketLink = draft.ticketLink.trim();
    if (ticketLink) {
      const ok = normalizeLink(ticketLink);
      if (!ok) {
        setErr(isTruncatedLink(ticketLink)
          ? "That ticket link is cut off (it has “…” in it), so it won't open. On the ticket site, tap Share or Copy link to get the full address, then paste that."
          : "The ticket link doesn't look like a web address. Paste the link where fans buy tickets, like eventbrite.com/e/your-show.");
        return;
      }
      ticketLink = ok;
    }
    setSaving(true);
    // Ticket link and price live in the promoter section of the Gig Web, so
    // the promoter sees what's entered here and vice versa.
    const { data, error } = await supabase
      .from("shows")
      .update({
        fan_page_enabled: draft.enabled,
        fan_page: {
          ...(row.fan_page || {}),
          hidden: draft.hidden,
          show_time: draft.showTime.trim(),
          ages: draft.ages.trim(),
          note: draft.note.trim(),
          address: draft.address.trim(),
          flyer_url: draft.flyer,
        },
        promoter_info: { ...(row.promoter_info || {}), ticket_link: ticketLink, ticket_price: draft.ticketPrice.trim() },
      })
      .eq("id", showId)
      .select("fan_token, fan_page_enabled, fan_page, promoter_info")
      .single();
    setSaving(false);
    if (error || !data) { setErr("Couldn't update. Try again."); return; }
    setRow(data);
    setDraft(toDraft(data));
    setUpdated(true);
  };

  const on = !!draft?.enabled;
  const inputCls = "w-full bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#8CFF3D]/60";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ fontFamily: SCENE_FONT }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto bg-[#0d0d0d] border-t border-[#2a2a2a] rounded-t-[18px] px-4 pt-2.5 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
        <div className="w-10 h-1 rounded-sm bg-[#2a2a2a] mx-auto mb-3" />
        <div className="flex items-center gap-2.5">
          <span className="text-2xl font-bold flex-1 text-white">Fan page</span>
          <span className="text-[10px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: row?.fan_page_enabled ? G : "rgba(255,255,255,0.45)" }}>{row?.fan_page_enabled ? "LIVE" : "OFF"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <p className="mt-1 text-[15px] font-medium leading-tight text-white/50">A public page for this event. Crew details, cues and contacts are never on it. Changes go live when you press Update.</p>

        {!row && !err && <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>}
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

        {row && draft && (
          <>
            <button
              type="button"
              onClick={() => set({ enabled: !draft.enabled })}
              className="mt-3 w-full flex items-center gap-3 px-3.5 py-3 rounded-[10px] text-left text-white"
              style={{ background: on ? "rgba(140,255,61,0.08)" : "#111", border: `1px solid ${on ? "rgba(140,255,61,0.4)" : "#1f1f1f"}`, boxShadow: on ? "0 0 14px rgba(140,255,61,0.2)" : "none" }}
            >
              <span className="relative w-10 h-[22px] rounded-[11px] shrink-0" style={{ background: on ? G : "#2a2a2a" }}>
                <span className="absolute top-[3px] w-4 h-4 rounded-full" style={{ left: on ? 21 : 3, background: on ? "#0d0d0d" : "rgba(255,255,255,0.6)" }} />
              </span>
              <span className="text-lg font-bold tracking-[0.04em]">{on ? "Public page is on" : "Public page is off"}</span>
            </button>

            {!on && (
              <p className="mt-3 text-[15px] font-medium leading-tight text-white/50">Off. Only people you've invited to the event can see it. Turn it on to get a link you can share.</p>
            )}

            {on && (
              <>
                <div className="mt-2.5 flex items-center gap-2 bg-[#111] border border-[#1f1f1f] rounded-[10px] py-1.5 pl-3 pr-1.5">
                  <span className="flex-1 truncate text-xs text-white/75" style={{ fontFamily: SCENE_MONO }}>{url}</span>
                  <button
                    type="button"
                    onClick={copy}
                    className="px-3 py-2 rounded-lg text-sm font-bold tracking-[0.06em]"
                    style={{ background: copied ? G : "rgba(140,255,61,0.1)", border: `1px solid ${copied ? G : "rgba(140,255,61,0.4)"}`, color: copied ? "#0d0d0d" : G }}
                  >{copied ? "COPIED" : "COPY"}</button>
                </div>

                <div className="mt-3.5 text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>WHAT FANS CAN SEE</div>
                <div className="mt-1.5 bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 py-[9px] border-b border-[#1c1c1c]">
                    <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0" style={{ background: G, border: `1px solid ${G}` }}><Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.2} /></span>
                    <span className="flex-1 text-base font-semibold text-white">Name, icon, date, venue</span>
                    <span className="text-[9.5px] tracking-[0.08em] text-white/40" style={{ fontFamily: SCENE_MONO }}>ALWAYS</span>
                  </div>
                  {FIELDS.map((f, i) => {
                    const shown = !draft.hidden.includes(f.key);
                    return (
                      <button key={f.key} type="button" onClick={() => toggleField(f.key)} className="w-full flex items-center gap-2.5 px-3 py-[9px] text-left" style={{ borderBottom: i < FIELDS.length - 1 ? "1px solid #1c1c1c" : "none" }}>
                        <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0" style={{ background: shown ? G : "transparent", border: `1px solid ${shown ? G : "#3a3a3a"}` }}>
                          {shown && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.2} />}
                        </span>
                        <span className="flex-1 text-base font-semibold" style={{ color: shown ? "#fff" : "rgba(255,255,255,0.45)" }}>{f.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3.5 text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>FAN PAGE DETAILS</div>
                <div className="mt-1.5 grid grid-cols-[1fr_88px] gap-2">
                  <input className={inputCls} placeholder="Ticket link (where fans buy)" inputMode="url" value={draft.ticketLink} onChange={(e) => set({ ticketLink: e.target.value })} />
                  <input className={inputCls} placeholder="Price" value={draft.ticketPrice} onChange={(e) => set({ ticketPrice: e.target.value })} />
                </div>
                <input className={`${inputCls} mt-2`} placeholder="Venue street address (used for the map link)" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Show time, e.g. 8:00 PM" value={draft.showTime} onChange={(e) => set({ showTime: e.target.value })} />
                  <input className={inputCls} placeholder="Ages, e.g. 18+" value={draft.ages} onChange={(e) => set({ ages: e.target.value })} />
                </div>
                <textarea className={`${inputCls} mt-2 min-h-[70px]`} placeholder="A short note for fans (set list teaser, anything to know before the night)" value={draft.note} onChange={(e) => set({ note: e.target.value })} />

                <div className="mt-2 flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFlyer} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#111] border border-[#2a2a2a] text-white/80 text-sm font-semibold disabled:opacity-50">
                    <ImagePlus className="w-4 h-4" /> {draft.flyer ? "Replace flyer" : "Add flyer image"}
                  </button>
                  {draft.flyer && (
                    <>
                      <img src={draft.flyer} alt="" className="w-9 h-9 rounded-md object-cover border border-[#2a2a2a]" />
                      <button type="button" onClick={() => set({ flyer: "" })} className="text-white/40 hover:text-white text-xs">Remove</button>
                    </>
                  )}
                </div>
              </>
            )}

            <div className="mt-4 flex gap-2">
              {on && row.fan_page_enabled && (
                <a href={url} className="flex-1 flex items-center justify-center gap-1.5 py-[11px] rounded-[10px] text-base font-bold tracking-[0.06em]" style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}>
                  PREVIEW PAGE <ChevronRight className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={update}
                disabled={saving || (!dirty && !updated)}
                className="flex-1 py-[11px] rounded-[10px] text-base font-bold tracking-[0.06em] disabled:opacity-40"
                style={{ background: G, color: "#0d0d0d", boxShadow: dirty ? "0 0 16px rgba(140,255,61,0.4)" : "none" }}
              >
                {saving ? "UPDATING..." : updated && !dirty ? "UPDATED ✓" : "UPDATE"}
              </button>
            </div>
            {dirty && <p className="mt-2 text-center text-[12px] text-[#F59E0B]">You have changes that fans can't see yet. Press Update to publish them.</p>}
            {!dirty && updated && <p className="mt-2 text-center text-[12px] text-white/45">Live now for everyone who opens the fan page.</p>}
          </>
        )}
      </div>
    </div>
  );
}

// Read-only version for anyone linked to the event who isn't its owner: they
// can open and copy the fan page link once the owner has turned it on, but
// only the owner can change it.
function ViewerSheet({ shareToken, onClose }) {
  const [info, setInfo] = useState(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_fan_link", { p_share_token: shareToken }).then(({ data, error }) => {
      if (alive) setInfo(error ? null : data || null);
    });
    return () => { alive = false; };
  }, [shareToken]);

  const url = info?.fan_token ? `${window.location.origin}/e/${info.fan_token}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ fontFamily: SCENE_FONT }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0d0d0d] border-t border-[#2a2a2a] rounded-t-[18px] px-4 pt-2.5 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
        <div className="w-10 h-1 rounded-sm bg-[#2a2a2a] mx-auto mb-3" />
        <div className="flex items-center gap-2.5">
          <span className="text-2xl font-bold flex-1 text-white">Fan page</span>
          <span className="text-[10px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: info?.enabled ? G : "rgba(255,255,255,0.45)" }}>{info === undefined ? "" : info?.enabled ? "LIVE" : "OFF"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {info === undefined && <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>}

        {info !== undefined && !info?.enabled && (
          <p className="mt-2 text-[15px] font-medium leading-tight text-white/50">The host hasn't turned on the public page for this event yet. Only the owner can switch it on and edit it.</p>
        )}

        {info?.enabled && (
          <>
            <p className="mt-1 text-[15px] font-medium leading-tight text-white/50">This is the page fans see. Only the event owner can edit it.</p>
            <div className="mt-3 flex items-center gap-2 bg-[#111] border border-[#1f1f1f] rounded-[10px] py-1.5 pl-3 pr-1.5">
              <span className="flex-1 truncate text-xs text-white/75" style={{ fontFamily: SCENE_MONO }}>{url}</span>
              <button type="button" onClick={copy} className="px-3 py-2 rounded-lg text-sm font-bold tracking-[0.06em]" style={{ background: copied ? G : "rgba(140,255,61,0.1)", border: `1px solid ${copied ? G : "rgba(140,255,61,0.4)"}`, color: copied ? "#0d0d0d" : G }}>{copied ? "COPIED" : "COPY"}</button>
            </div>
            <a href={url} className="mt-3 flex items-center justify-center gap-1.5 py-[11px] rounded-[10px] text-base font-bold tracking-[0.06em]" style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}>
              VIEW PAGE <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </>
        )}

        <button type="button" onClick={onClose} className="mt-3 w-full py-[11px] rounded-[10px] bg-[#111] border border-[#2a2a2a] text-white/70 text-base font-bold tracking-[0.06em]">DONE</button>
      </div>
    </div>
  );
}

// Owner (has showId) gets the editor; everyone else linked to the event
// (has shareToken) gets the read-only view.
export default function FanPageSheet({ showId, shareToken, onClose }) {
  if (showId) return <OwnerSheet showId={showId} onClose={onClose} />;
  if (shareToken) return <ViewerSheet shareToken={shareToken} onClose={onClose} />;
  return null;
}
