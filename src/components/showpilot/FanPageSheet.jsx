import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { ArrowDown, ArrowUp, Check, ChevronRight, ImagePlus, Plus, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { uploadIconImage } from "@/lib/eventIcons";
import { normalizeLink, isTruncatedLink } from "@/lib/links";
import EventbriteLink from "@/components/showpilot/EventbriteLink";
import RsvpList from "@/components/showpilot/RsvpList";

const G = "#8CFF3D";
const MAX_LINEUP = 12;

// Desktop gets a wide two-column panel; phones keep the bottom sheet.
function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const fn = () => setOn(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);
  return on;
}

const newArtistId = () => Math.random().toString(36).slice(2, 10);

// What the owner can switch on or off. Only the name and icon are always
// shown: date and venue are optional too, so private events, speakeasies and
// small business events can keep them off the public page.
const FIELDS = [
  { key: "date", label: "Date" },
  { key: "venue", label: "Venue and address" },
  { key: "times", label: "Doors and show time" },
  { key: "tickets", label: "Ticket link and price" },
  { key: "band", label: "Artist name" },
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
  const desktop = useIsDesktop();

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
      entry: cfg.entry === "rsvp" ? "rsvp" : "tickets",
      emailSubject: cfg.email_subject || "",
      rsvpMessage: cfg.rsvp_message || "",
      lineup: Array.isArray(cfg.lineup) ? cfg.lineup.map((a) => ({ id: String(a.id), name: String(a.name || "") })) : [],
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
    // RSVP events don't show the ticket link, so don't block saving on it.
    if (ticketLink && draft.entry !== "rsvp") {
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
          entry: draft.entry,
          email_subject: draft.emailSubject.trim(),
          rsvp_message: draft.rsvpMessage.trim(),
          lineup: draft.lineup.map((a) => ({ id: a.id, name: a.name.trim().slice(0, 80) })).filter((a) => a.name),
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
  const rsvp = draft?.entry === "rsvp";
  const savedRsvp = row?.fan_page?.entry === "rsvp";
  const inputCls = "w-full bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#8CFF3D]/60";

  // Lineup editing (saved with Update like everything else).
  const setArtist = (i, name) => set({ lineup: draft.lineup.map((a, j) => (j === i ? { ...a, name } : a)) });
  const addArtist = () => draft.lineup.length < MAX_LINEUP && set({ lineup: [...draft.lineup, { id: newArtistId(), name: "" }] });
  const removeArtist = (i) => set({ lineup: draft.lineup.filter((_, j) => j !== i) });
  const moveArtist = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= draft.lineup.length) return;
    const next = [...draft.lineup];
    [next[i], next[j]] = [next[j], next[i]];
    set({ lineup: next });
  };

  const label = (text, extra = "mt-3.5") => (
    <div className={`${extra} text-[10px] tracking-[0.14em] text-white/45`} style={{ fontFamily: SCENE_MONO }}>{text}</div>
  );

  // ---- Blocks (arranged differently on phone and desktop) ----
  const statusBlock = row && draft && (
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
    </>
  );

  const linkBlock = on && row && (
    <div className="mt-2.5 flex items-center gap-2 bg-[#111] border border-[#1f1f1f] rounded-[10px] py-1.5 pl-3 pr-1.5">
      <span className="flex-1 truncate text-xs text-white/75" style={{ fontFamily: SCENE_MONO }}>{url}</span>
      <button
        type="button"
        onClick={copy}
        className="px-3 py-2 rounded-lg text-sm font-bold tracking-[0.06em]"
        style={{ background: copied ? G : "rgba(140,255,61,0.1)", border: `1px solid ${copied ? G : "rgba(140,255,61,0.4)"}`, color: copied ? "#0d0d0d" : G }}
      >{copied ? "COPIED" : "COPY"}</button>
    </div>
  );

  const rsvpBlock = on && row?.fan_page_enabled && savedRsvp && <RsvpList showId={showId} tall={desktop} />;

  const visibilityBlock = on && draft && (
    <>
      {label("WHAT FANS CAN SEE")}
      <div className="mt-1.5 bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 py-[9px] border-b border-[#1c1c1c]">
          <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0" style={{ background: G, border: `1px solid ${G}` }}><Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.2} /></span>
          <span className="flex-1 text-base font-semibold text-white">Name and icon</span>
          <span className="text-[9.5px] tracking-[0.08em] text-white/40" style={{ fontFamily: SCENE_MONO }}>ALWAYS</span>
        </div>
        {FIELDS.map((f, i) => {
          const shown = !draft.hidden.includes(f.key);
          return (
            <button key={f.key} type="button" onClick={() => toggleField(f.key)} className="w-full flex items-center gap-2.5 px-3 py-[9px] text-left" style={{ borderBottom: i < FIELDS.length - 1 ? "1px solid #1c1c1c" : "none" }}>
              <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0" style={{ background: shown ? G : "transparent", border: `1px solid ${shown ? G : "#3a3a3a"}` }}>
                {shown && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.2} />}
              </span>
              <span className="flex-1 text-base font-semibold" style={{ color: shown ? "#fff" : "rgba(255,255,255,0.45)" }}>{f.key === "tickets" && rsvp ? "Door price" : f.label}</span>
            </button>
          );
        })}
      </div>

      {label("HOW FANS GET IN")}
      <div className="mt-1.5 grid grid-cols-2 gap-1 p-1 bg-[#111] border border-[#1f1f1f] rounded-[10px]">
        {[["tickets", "Ticket link"], ["rsvp", "RSVP, pay at door"]].map(([k, text]) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ entry: k })}
            className="py-2 rounded-lg text-sm font-bold tracking-[0.04em]"
            style={draft.entry === k ? { background: G, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.6)" }}
          >{text}</button>
        ))}
      </div>
      {rsvp && <p className="mt-1.5 text-[13px] leading-snug text-white/45">Fans RSVP on the fan page with their name, email and party size, and get the event info by email. You'll see the list here.</p>}
    </>
  );

  // The lineup is only used by the RSVP form ("who are you coming to see"),
  // so it's only edited in RSVP mode and never shown on the fan page itself.
  const lineupBlock = on && draft && rsvp && (
    <>
      {label("LINEUP")}
      <div className="mt-1.5 space-y-1.5">
        {draft.lineup.map((a, i) => (
          <div key={a.id} className="flex items-center gap-1.5">
            <input className={inputCls} maxLength={80} placeholder={i === 0 ? "Headliner" : "Artist name"} value={a.name} onChange={(e) => setArtist(i, e.target.value)} aria-label={`Artist ${i + 1}`} />
            <button type="button" onClick={() => moveArtist(i, -1)} disabled={i === 0} aria-label="Move up" className="p-2 rounded-lg text-white/50 hover:text-white disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
            <button type="button" onClick={() => moveArtist(i, 1)} disabled={i === draft.lineup.length - 1} aria-label="Move down" className="p-2 rounded-lg text-white/50 hover:text-white disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
            <button type="button" onClick={() => removeArtist(i)} aria-label={`Remove ${a.name || "artist"}`} className="p-2 rounded-lg text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>
          </div>
        ))}
        {draft.lineup.length < MAX_LINEUP && (
          <button type="button" onClick={addArtist} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111] border border-dashed border-[#2a2a2a] text-white/70 text-sm font-semibold hover:text-white">
            <Plus className="w-4 h-4" /> Add artist
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-white/40">
        Only shown in the RSVP form, where fans pick who they're coming to see. You'll see the count for each artist.
      </p>
    </>
  );

  const detailsBlock = on && draft && (
    <>
      {label("FAN PAGE DETAILS")}
      {rsvp ? (
        <input className={`${inputCls} mt-1.5`} placeholder="Door price, e.g. $10 (optional)" value={draft.ticketPrice} onChange={(e) => set({ ticketPrice: e.target.value })} />
      ) : (
        <div className="mt-1.5 grid grid-cols-[1fr_88px] gap-2">
          <input className={inputCls} placeholder="Ticket link (where fans buy)" inputMode="url" value={draft.ticketLink} onChange={(e) => set({ ticketLink: e.target.value })} />
          <input className={inputCls} placeholder="Price" value={draft.ticketPrice} onChange={(e) => set({ ticketPrice: e.target.value })} />
        </div>
      )}
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
  );

  const emailBlock = on && draft && rsvp && (
    <>
      {label("RSVP EMAIL")}
      <input className={`${inputCls} mt-1.5`} maxLength={150} placeholder="Subject (optional)" value={draft.emailSubject} onChange={(e) => set({ emailSubject: e.target.value })} />
      <textarea className={`${inputCls} mt-2 min-h-[70px]`} maxLength={2000} placeholder="A message only people who RSVP get (where to enter, what to bring, parking)" value={draft.rsvpMessage} onChange={(e) => set({ rsvpMessage: e.target.value })} />
      <p className="mt-1.5 text-[12px] leading-snug text-white/40">Leave the subject empty to use "You're on the list: event name and date". Every RSVP email also has the flyer, the event details and the fan's key to the event sky, where each RSVP is a star.</p>
    </>
  );

  // Only once the page is live: the buyer email is built from it.
  const eventbriteBlock = on && row?.fan_page_enabled && !savedRsvp && !rsvp && (
    <EventbriteLink
      showId={showId}
      onLinked={(link) => { if (!draft.ticketLink.trim() && link?.eb_event_url) set({ ticketLink: link.eb_event_url }); }}
    />
  );

  const actionsBlock = row && draft && (
    <>
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
  );

  const header = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="text-2xl font-bold flex-1 text-white">Fan page</span>
        <span className="text-[10px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: row?.fan_page_enabled ? G : "rgba(255,255,255,0.45)" }}>{row?.fan_page_enabled ? "LIVE" : "OFF"}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <p className="mt-1 text-[15px] font-medium leading-tight text-white/50">A public page for this event. Crew details, cues and contacts are never on it. Changes go live when you press Update.</p>
      {!row && !err && <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>}
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
    </>
  );

  if (desktop) {
    // Desktop: one wide panel. Settings in two columns on the left (they
    // scroll if they must); the link, RSVPs and the Update button stay put
    // on the right.
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" style={{ fontFamily: SCENE_FONT }}>
        <div className="absolute inset-0 bg-black/65" onClick={onClose} />
        <div className="relative w-full max-w-[1180px] h-[min(86vh,860px)] flex flex-col bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="px-6 pt-5 pb-3 border-b border-[#1c1c1c]">{header}</div>
          {row && draft && (
            <div className="flex-1 min-h-0 grid grid-cols-[1fr_400px]">
              <div className="min-h-0 overflow-y-auto px-6 pb-6">
                <div className="grid grid-cols-2 gap-x-6">
                  <div>
                    {statusBlock}
                    {visibilityBlock}
                  </div>
                  <div>
                    {lineupBlock}
                    {detailsBlock}
                    {emailBlock}
                    {eventbriteBlock}
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex flex-col border-l border-[#1c1c1c] bg-[#0a0a0a] px-5 pb-5">
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {on ? linkBlock : <p className="mt-4 text-[15px] text-white/45">Turn the public page on to get its link{rsvp ? " and start taking RSVPs" : ""}.</p>}
                  {rsvpBlock}
                  {on && row.fan_page_enabled && !savedRsvp && (
                    <p className="mt-4 text-[14px] leading-snug text-white/45">Switch "How fans get in" to RSVP, pay at door and press Update to take RSVPs here.</p>
                  )}
                </div>
                <div className="pt-1 border-t border-[#1c1c1c]">{actionsBlock}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ fontFamily: SCENE_FONT }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto bg-[#0d0d0d] border-t border-[#2a2a2a] rounded-t-[18px] px-4 pt-2.5 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
        <div className="w-10 h-1 rounded-sm bg-[#2a2a2a] mx-auto mb-3" />
        {header}
        {row && draft && (
          <>
            {statusBlock}
            {linkBlock}
            {rsvpBlock}
            {visibilityBlock}
            {detailsBlock}
            {lineupBlock}
            {emailBlock}
            {eventbriteBlock}
            {actionsBlock}
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
