import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Eye, EyeOff, FileText, ImagePlus, MapPin, Paperclip, Pencil, Plus, Share2, Ticket, Users, X } from "lucide-react";
import { shareLink } from "@/lib/share";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { uploadIconImage } from "@/lib/eventIcons";
import { normalizeLink, isTruncatedLink } from "@/lib/links";
import EventbriteLink from "@/components/showpilot/EventbriteLink";
import RsvpList from "@/components/showpilot/RsvpList";
import FanQrCode from "@/components/showpilot/FanQrCode";
import { fanUrl, cleanSlug, trimSlug, slugProblem, SLUG_MIN, SLUG_MAX } from "@/lib/fanUrl";

const G = "#8CFF3D";
const MAX_LINEUP = 12;
// Email attachments (parking PDF, map, ...): private fan-files bucket, see
// supabase/fan_files_migration.sql. The bucket enforces the size and types too.
const FAN_FILES = "fan-files";
const MAX_FILES = 3;
const MAX_FILE_MB = 5;
const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const fileSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

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

// Share the fan page link: the phone's share sheet (Messages, Instagram,
// WhatsApp...), or copies the link where there isn't one.
function ShareButton({ url, title }) {
  const [note, setNote] = useState("");
  const go = async () => {
    const r = await shareLink({ url, title: title || "Event", text: title ? `${title} on ShowPilot` : undefined });
    if (r === "copied" || r === "failed") {
      setNote(r === "copied" ? "COPIED" : "TRY AGAIN");
      setTimeout(() => setNote(""), 1800);
    }
  };
  return (
    <button
      type="button"
      onClick={go}
      aria-label="Share the fan page link"
      className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-bold tracking-[0.06em]"
      style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}
    >
      {note ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />} {note || "SHARE"}
    </button>
  );
}

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
const isField = (key) => FIELDS.some((f) => f.key === key);

// Editor palette: the same deep navy-black as the fan side, host green accent.
const NAVY = "#05060f";
const EDGE_LINE = "#232849";
const PANEL = "rgba(14,17,40,0.92)";
const SOFT = "#b7bbe6";
const DIM = "#7e83b8";
const Y = "#F2FF00";

// Owner-only fan page editor (job 90). The fan page itself is the editor: a
// live preview where tapping any part opens its editor and the eye hides it.
// Guests, Share and Setup are tabs. Every change, the RSVP limit and the QR
// look included, waits in one draft until the owner presses Publish, so fans
// never see half-done edits. Reads and writes the show row directly (owner
// RLS), like the event icon.
function OwnerSheet({ showId, onClose }) {
  const [row, setRow] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const fileRef = useRef(null);
  const attachRef = useRef(null);
  const desktop = useIsDesktop();
  const [tab, setTab] = useState("page"); // page | guests | share | setup
  const [editing, setEditing] = useState(null); // which part of the page is open
  const [stats, setStats] = useState(null); // local shows stats (job 92)
  const [countdownStats, setCountdownStats] = useState(null); // per-notch sent / opened (job 78)

  const SELECT = "fan_token, fan_slug, fan_page_enabled, fan_page, fan_countdown, promoter_info, event_name, band_name, icon_url, date, venue, city, state";
  const toDraft = (data) => {
    const cfg = data.fan_page || {};
    return {
      enabled: !!data.fan_page_enabled,
      slug: data.fan_slug || "",
      hidden: cfg.hidden || [],
      showTime: cfg.show_time || "",
      ages: cfg.ages || "",
      note: cfg.note || "",
      address: cfg.address || "",
      venueWhere: cfg.venue_where === "page" || cfg.venue_where === "email" ? cfg.venue_where : "both",
      flyer: cfg.flyer_url || "",
      ticketLink: data.promoter_info?.ticket_link || "",
      ticketPrice: data.promoter_info?.ticket_price || "",
      entry: cfg.entry === "rsvp" ? "rsvp" : "tickets",
      emailSubject: cfg.email_subject || "",
      rsvpMessage: cfg.rsvp_message || "",
      lineup: Array.isArray(cfg.lineup) ? cfg.lineup.map((a) => ({ id: String(a.id), name: String(a.name || "") })) : [],
      files: Array.isArray(cfg.files) ? cfg.files : [],
      // RSVP capacity: no limit, or a max number of people.
      capacityOn: typeof cfg.capacity === "number" && cfg.capacity >= 1,
      capacity: typeof cfg.capacity === "number" && cfg.capacity >= 1 ? String(Math.floor(cfg.capacity)) : "",
      // Fan Discover (job 85): list this event for fans nearby. Off by default.
      discover: cfg.discover === true,
      qr: cfg.qr || null,
      // Countdown (job 78): its own column, so unlocks never reach the public page early.
      countdown: {
        enabled: data.fan_countdown?.enabled === true,
        notches: Array.isArray(data.fan_countdown?.notches) ? data.fan_countdown.notches.slice(0, 5).map((n) => ({
          id: String(n.id || `n${Math.random().toString(36).slice(2, 8)}`), days_before: Math.max(0, Math.min(30, Number(n.days_before) || 0)),
          type: n.type === "unlock" ? "unlock" : "reminder", subject: n.subject || "", message: n.message || "", kind: n.kind || "",
          title: n.title || "", body: n.body || "", image_url: n.image_url || "", link_url: n.link_url || "",
        })) : [],
      },
    };
  };

  useEffect(() => {
    let alive = true;
    supabase.from("shows").select(SELECT).eq("id", showId).single().then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setErr("Couldn't load the fan page settings."); return; }
      setRow(data);
      setDraft(toDraft(data));
    });
    supabase.rpc("get_discover_stats", { p_show_id: showId }).then(({ data }) => { if (alive && data) setStats(data); });
    supabase.rpc("get_countdown_stats", { p_show_id: showId }).then(({ data }) => { if (alive && data) setCountdownStats(data); });
    return () => { alive = false; };
  }, [showId]);

  const set = (patch) => { setPublished(false); setErr(""); setConfirmClose(false); setDraft((d) => ({ ...d, ...patch })); };
  const url = row ? fanUrl(row.fan_slug, row.fan_token) : "";
  const linkPrefix = fanUrl("zz").slice(0, -2); // e.g. https://showpilot.space/
  const saved = row ? toDraft(row) : null;
  const changes = saved && draft ? Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k])).length : 0;

  const close = () => { if (changes && !confirmClose) { setConfirmClose(true); return; } onClose(); };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (editing) setEditing(null); else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  // Uploads right away (so the name and size show), but the file only goes
  // into emails once the owner presses Publish.
  const pickAttachments = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = "";
    if (!picked.length) return;
    const room = MAX_FILES - draft.files.length;
    if (picked.length > room) { setErr(`Up to ${MAX_FILES} files per event.`); return; }
    const bad = picked.find((f) => !FILE_TYPES.includes(f.type));
    if (bad) { setErr(`"${bad.name}" isn't a PDF or image. Attach PDFs, JPGs or PNGs.`); return; }
    const big = picked.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) { setErr(`"${big.name}" is over ${MAX_FILE_MB} MB. Try a smaller version.`); return; }
    setAttaching(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    const added = [];
    for (const f of picked) {
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-60);
      const path = `${uid}/${showId}/${Math.random().toString(36).slice(2, 10)}-${safe}`;
      const { error } = uid ? await supabase.storage.from(FAN_FILES).upload(path, f, { contentType: f.type }) : { error: true };
      if (error) { setErr(`Couldn't upload "${f.name}". Try again.`); break; }
      added.push({ path, name: f.name.slice(0, 80), size: f.size, type: f.type });
    }
    setAttaching(false);
    if (added.length) set({ files: [...draft.files, ...added] });
  };

  const publish = async () => {
    setErr("");
    let ticketLink = draft.ticketLink.trim();
    // RSVP events don't show the ticket link, so don't block saving on it.
    if (ticketLink && draft.entry !== "rsvp") {
      const ok = normalizeLink(ticketLink);
      if (!ok) {
        setTab("page"); setEditing("tickets");
        setErr(isTruncatedLink(ticketLink)
          ? "That ticket link is cut off (it has “…” in it), so it won't open. On the ticket site, tap Share or Copy link to get the full address, then paste that."
          : "The ticket link doesn't look like a web address. Paste the link where fans buy tickets, like eventbrite.com/e/your-show.");
        return;
      }
      ticketLink = ok;
    }
    const slugText = trimSlug(draft.slug);
    const slugErr = slugProblem(slugText);
    if (slugErr) { setTab("share"); setErr(`Custom link: ${slugErr}`); return; }
    let capacity = null;
    if (draft.capacityOn) {
      capacity = Number(draft.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
        setTab("setup");
        setErr("Enter the RSVP limit as a whole number of people, like 150, or choose No limit.");
        return;
      }
    }
    setSaving(true);
    // Ticket link and price live in the promoter section of the Gig Web, so
    // the promoter sees what's entered here and vice versa.
    const { data, error } = await supabase
      .from("shows")
      .update({
        fan_page_enabled: draft.enabled,
        fan_slug: slugText || null,
        fan_page: {
          ...(row.fan_page || {}),
          hidden: draft.hidden,
          show_time: draft.showTime.trim(),
          ages: draft.ages.trim(),
          note: draft.note.trim(),
          address: draft.address.trim(),
          venue_where: draft.venueWhere,
          flyer_url: draft.flyer,
          entry: draft.entry,
          email_subject: draft.emailSubject.trim(),
          rsvp_message: draft.rsvpMessage.trim(),
          lineup: draft.lineup.map((a) => ({ id: a.id, name: a.name.trim().slice(0, 80) })).filter((a) => a.name),
          files: draft.files,
          capacity,
          discover: draft.discover,
          qr: draft.qr,
        },
        promoter_info: { ...(row.promoter_info || {}), ticket_link: ticketLink, ticket_price: draft.ticketPrice.trim() },
        fan_countdown: {
          enabled: draft.countdown.enabled,
          notches: draft.countdown.notches.slice(0, 5).map((n) => ({
            id: n.id, days_before: n.days_before, type: n.type,
            subject: n.subject.trim().slice(0, 150), message: n.message.trim().slice(0, 1500),
            kind: n.type === "unlock" ? n.kind || "note" : "", title: n.title.trim().slice(0, 80), body: n.body.trim().slice(0, 2000),
            image_url: n.image_url, link_url: n.link_url.trim(),
          })),
        },
      })
      .eq("id", showId)
      .select(SELECT)
      .single();
    setSaving(false);
    if (error?.code === "23505") { setTab("share"); setErr("That custom link is already taken. Try another."); return; }
    if (error || !data) { setErr("Couldn't publish. Try again."); return; }
    // Clean up attachments the owner removed (best effort).
    const kept = new Set(draft.files.map((f) => f.path));
    const gone = (row.fan_page?.files || []).map((f) => f.path).filter((p) => p && !kept.has(p));
    if (gone.length) supabase.storage.from(FAN_FILES).remove(gone).catch(() => {});
    setRow(data);
    setDraft(toDraft(data));
    setPublished(true);
    setConfirmClose(false);
  };
  const discard = () => { setDraft(toDraft(row)); setErr(""); setConfirmClose(false); };

  const on = !!draft?.enabled;
  const rsvp = draft?.entry === "rsvp";
  const savedRsvp = row?.fan_page?.entry === "rsvp";
  const savedCap = typeof row?.fan_page?.capacity === "number" && row.fan_page.capacity >= 1 ? Math.floor(row.fan_page.capacity) : null;
  const inputCls = "w-full bg-[#0a0c1c] border border-[#262b52] rounded-lg px-3.5 py-3 text-white text-[16px] leading-snug placeholder:text-white/35 focus:outline-none focus:border-[#8CFF3D]/60";
  const isShown = (key) => key === "name" || !draft.hidden.includes(key);
  const showField = (key, show) => set({ hidden: show ? draft.hidden.filter((k) => k !== key) : [...new Set([...draft.hidden, key])] });

  // Lineup editing (saved with Publish like everything else).
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
    <div className={`${extra} text-[11.5px] tracking-[0.14em]`} style={{ fontFamily: SCENE_MONO, color: DIM }}>{text}</div>
  );
  const note = (text) => <p className="mt-2.5 text-[15px] leading-relaxed" style={{ color: SOFT }}>{text}</p>;
  const readOnly = (value, fallback) => (
    <div className="mt-2 px-3.5 py-3 rounded-lg bg-[#0a0c1c] border border-[#1c2042] text-[16px]" style={{ color: value ? "#fff" : "rgba(255,255,255,0.4)" }}>{value || fallback}</div>
  );
  const segmented = (options, value, onPick, aria) => (
    <div role="radiogroup" aria-label={aria} className="mt-2 grid gap-1 p-1 rounded-[10px] bg-[#0a0c1c] border border-[#1c2042]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([k, text]) => {
        const sel = value === k;
        return (
          <button key={String(k)} type="button" role="radio" aria-checked={sel} onClick={() => onPick(k)} className="py-2.5 rounded-[7px] text-[15px] font-semibold transition-colors"
            style={sel ? { background: "rgba(140,255,61,0.14)", color: G, boxShadow: "inset 0 0 0 1px rgba(140,255,61,0.45)" } : { color: "rgba(255,255,255,0.6)" }}>{text}</button>
        );
      })}
    </div>
  );

  const dateText = row?.date ? new Date(row.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const placeText = [row?.city, row?.state].filter(Boolean).join(", ");
  const doors = row?.promoter_info?.door_time || "";
  const title = row?.event_name || row?.band_name || "Untitled event";

  // ---- Editors for each part of the page ----
  const PARTS = {
    flyer: "Flyer image", name: "Name and icon", band: "Artist name", date: "Date", venue: "Venue and address",
    times: "Doors, show time, ages", note: "Note for fans", tickets: rsvp ? "Door price" : "Ticket link and price", lineup: "Lineup",
  };
  const editors = draft && {
    name: (
      <>
        <div className="mt-2 flex items-center gap-3">
          {row?.icon_url ? <img src={row.icon_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-[#262b52]" /> : <span className="w-12 h-12 rounded-xl bg-[#0a0c1c] border border-[#262b52]" />}
          <span className="text-lg font-bold text-white">{title}</span>
        </div>
        {note("Always on the fan page. Change the name and icon in the event itself.")}
      </>
    ),
    date: (<>{readOnly(dateText, "No date set")}{note("Fans see the event's date. Change it in the event itself, or hide it to keep it private.")}</>),
    venue: (
      <>
        {readOnly([row?.venue, placeText].filter(Boolean).join(", "), "No venue set on the event")}
        <input className={`${inputCls} mt-2`} placeholder="Street address (used for the map link)" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
        {label("WHERE FANS SEE IT", "mt-4")}
        {segmented([["page", "Fan page"], ["email", "Email only"], ["both", "Both"]], draft.venueWhere, (k) => set({ venueWhere: k }), "Where fans see the venue")}
        {note(draft.venueWhere === "email"
          ? `Only people who ${rsvp ? "RSVP" : "buy a ticket through Eventbrite"} get the venue, address and a map button, in their confirmation email.`
          : draft.venueWhere === "page" ? "The fan page shows the venue, address and map link. Confirmation emails leave them out."
            : "The fan page and the confirmation email both show the venue, address and map button.")}
      </>
    ),
    times: (
      <>
        {doors ? readOnly(`Doors ${doors}`) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Show time, e.g. 8:00 PM" value={draft.showTime} onChange={(e) => set({ showTime: e.target.value })} />
          <input className={inputCls} placeholder="Ages, e.g. 18+" value={draft.ages} onChange={(e) => set({ ages: e.target.value })} />
        </div>
        {doors && note("Doors time comes from the promoter section of the event.")}
      </>
    ),
    tickets: rsvp ? (
      <>
        <input className={`${inputCls} mt-2`} placeholder="Door price, e.g. $10 (optional)" value={draft.ticketPrice} onChange={(e) => set({ ticketPrice: e.target.value })} />
        {note("Shown on the RSVP card and in the RSVP email. Switch how fans get in under Setup.")}
      </>
    ) : (
      <>
        <div className="mt-2 grid grid-cols-[1fr_96px] gap-2">
          <input className={inputCls} placeholder="Ticket link (where fans buy)" inputMode="url" value={draft.ticketLink} onChange={(e) => set({ ticketLink: e.target.value })} />
          <input className={inputCls} placeholder="Price" value={draft.ticketPrice} onChange={(e) => set({ ticketPrice: e.target.value })} />
        </div>
        {note("The Get Tickets button opens this link. Switch to RSVP under Setup.")}
      </>
    ),
    band: (<>{readOnly(row?.band_name, "No artist set on the event")}{note("Shown under the event name. Change it in the event itself.")}</>),
    note: (<textarea className={`${inputCls} mt-2 min-h-[150px]`} placeholder="A short note for fans (set list teaser, anything to know before the night)" value={draft.note} onChange={(e) => set({ note: e.target.value })} />),
    flyer: (
      <div className="mt-2 flex items-center gap-3">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFlyer} />
        {draft.flyer && <img src={draft.flyer} alt="Flyer" className="w-20 h-20 rounded-lg object-cover border border-[#262b52]" />}
        <div className="flex flex-col items-start gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a0c1c] border border-[#262b52] text-white/85 text-[15px] font-semibold disabled:opacity-50">
            <ImagePlus className="w-4 h-4" /> {busy ? "Uploading..." : draft.flyer ? "Replace flyer" : "Add flyer image"}
          </button>
          {draft.flyer && <button type="button" onClick={() => set({ flyer: "" })} className="text-white/50 hover:text-white text-[14px]">Remove</button>}
        </div>
      </div>
    ),
    lineup: (
      <>
        <div className="mt-2 space-y-1.5">
          {draft.lineup.map((a, i) => (
            <div key={a.id} className="flex items-center gap-1.5">
              <input className={inputCls} maxLength={80} placeholder={i === 0 ? "Headliner" : "Artist name"} value={a.name} onChange={(e) => setArtist(i, e.target.value)} aria-label={`Artist ${i + 1}`} />
              <button type="button" onClick={() => moveArtist(i, -1)} disabled={i === 0} aria-label="Move up" className="p-2 rounded-lg text-white/50 hover:text-white disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={() => moveArtist(i, 1)} disabled={i === draft.lineup.length - 1} aria-label="Move down" className="p-2 rounded-lg text-white/50 hover:text-white disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={() => removeArtist(i)} aria-label={`Remove ${a.name || "artist"}`} className="p-2 rounded-lg text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {draft.lineup.length < MAX_LINEUP && (
            <button type="button" onClick={addArtist} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0a0c1c] border border-dashed border-[#262b52] text-white/80 text-[15px] font-semibold hover:text-white">
              <Plus className="w-4 h-4" /> Add artist
            </button>
          )}
        </div>
        {note("Fans pick who they're coming to see when they RSVP. You'll see the count for each artist under Guests.")}
      </>
    ),
  };

  const editorFor = (key) => {
    if (isField(key) && !isShown(key)) {
      return (
        <div className="mt-2">
          <p className="text-[15px]" style={{ color: SOFT }}>Hidden from fans.</p>
          <button type="button" onClick={() => showField(key, true)} className="mt-2 px-3.5 py-2.5 rounded-lg text-[15px] font-bold" style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}>Show to fans</button>
        </div>
      );
    }
    return editors[key];
  };

  // The open part's editor: a panel with its name, the eye and Done.
  const editorPanel = (k) => (
    <>
      {desktop && (
        <button type="button" onClick={() => setEditing(null)} className="mb-3 -ml-1 h-9 pl-2 pr-3.5 rounded-lg flex items-center gap-1.5 text-[14px] font-bold hover:bg-white/5" style={{ color: G }}>
          <ArrowLeft className="w-4 h-4" /> All parts
        </button>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[22px] font-bold text-white leading-tight flex-1 min-w-0 truncate">{PARTS[k]}</span>
        {isField(k) && <EyeToggle shown={isShown(k)} onToggle={() => showField(k, !isShown(k))} label={PARTS[k]} />}
        {!desktop && (
          <button type="button" onClick={() => setEditing(null)} className="px-3.5 py-2 rounded-lg text-[14px] font-bold tracking-[0.06em]" style={{ background: G, color: "#0d0d0d" }}>DONE</button>
        )}
      </div>
      {editorFor(k)}
    </>
  );

  // ---- The live preview: the fan page as fans will see it ----
  const part = (k, children) => {
    const hidden = isField(k) && !isShown(k);
    const open = editing === k && tab === "page";
    return (
      <div className="relative group">
        <button type="button" aria-label={`Edit ${PARTS[k]}`}
          onClick={(e) => {
            setTab("page");
            setEditing(open && !desktop ? null : k);
            // Phone: lift the part above the editor that slides up over the bottom.
            if (!desktop && !open) { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }
          }}
          className="block w-full text-left rounded-xl transition-[box-shadow,opacity] focus-visible:outline-none"
          style={{ opacity: hidden ? 0.38 : 1, boxShadow: open ? `0 0 0 2px ${G}, 0 0 18px rgba(140,255,61,0.25)` : "none" }}>
          <span className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: open ? "none" : "inset 0 0 0 1px rgba(140,255,61,0.45)" }} />
          {children}
        </button>
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {hidden && <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, background: "#000c", color: SOFT, border: `1px solid ${EDGE_LINE}` }}>HIDDEN</span>}
          {isField(k) && <EyeToggle small shown={!hidden} onToggle={() => showField(k, hidden)} label={PARTS[k]} />}
          <span aria-hidden="true" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: open ? G : "#000b", color: open ? "#0d0d0d" : G, border: `1px solid ${open ? G : "rgba(140,255,61,0.45)"}` }}><Pencil className="w-3.5 h-3.5" /></span>
        </span>
      </div>
    );
  };

  const preview = draft && (
    <div className="relative w-full max-w-[400px] mx-auto rounded-[26px] overflow-hidden" style={{ background: "#0b0b0d", border: `1px solid ${EDGE_LINE}`, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
      {!on && (
        <div className="sticky top-0 z-10 px-3 py-2 text-center text-[11px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, background: "#FF6A00", color: "#0d0d0d" }}>PAGE OFF · FANS CAN'T OPEN IT</div>
      )}
      <div className="px-3 pt-3 pb-4 space-y-2.5">
        {part("flyer", <>
          {draft.flyer ? (
            <img src={draft.flyer} alt="" className="w-full max-h-[300px] object-cover rounded-xl" />
          ) : (
            <span className="flex flex-col items-center justify-center gap-1.5 h-[120px] rounded-xl text-[14px] font-semibold" style={{ border: `1px dashed ${EDGE_LINE}`, color: DIM }}>
              <ImagePlus className="w-5 h-5" /> Add a flyer
            </span>
          )}
        </>)}
        {part("name", <>
          <span className="flex items-center gap-3 px-2 py-2 pr-12">
            {row?.icon_url ? <img src={row.icon_url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" /> : <span className="w-11 h-11 rounded-xl shrink-0" style={{ background: "#16163a" }} />}
            <span className="text-[26px] font-bold leading-[1.02] text-white">{title}</span>
          </span>
        </>)}
        {row?.band_name && row.band_name !== row.event_name && part("band", <span className="block px-2 py-1 pr-24 text-[17px] font-semibold text-white/80">{row.band_name}</span>)}
        {part("date", <>
          <span className="block px-2 py-1.5 pr-24 text-[12px] tracking-[0.1em] uppercase" style={{ fontFamily: SCENE_MONO, color: G }}>{dateText || "No date set"}</span>
        </>)}
        {part("times", <>
          <span className="flex rounded-[10px] overflow-hidden" style={{ background: "#111", border: "1px solid #1f1f1f" }}>
            {[["DOORS", doors, "#fff"], ["SHOW", draft.showTime, G], ["AGES", draft.ages, "rgba(255,255,255,0.7)"]].filter(([, v]) => v).map(([l, v, c], i, arr) => (
              <span key={l} className="flex-1 min-w-0 px-3 py-2" style={{ borderRight: i < arr.length - 1 ? "1px solid #1c1c1c" : "none" }}>
                <span className="block text-[9px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{l}</span>
                <span className="block text-[16px] font-semibold truncate" style={{ fontFamily: SCENE_MONO, color: c }}>{v}</span>
              </span>
            ))}
            {!doors && !draft.showTime && !draft.ages && <span className="px-3 py-3 text-[14px]" style={{ color: DIM }}>Add show time and ages</span>}
          </span>
        </>)}
        {part("note", <>
          <span className="block rounded-[10px] p-3 pr-24" style={{ background: "#111", border: "1px solid #1f1f1f" }}>
            <span className="block text-[9.5px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>NOTE FROM THE ARTIST</span>
            <span className="block mt-1.5 text-[16px] font-medium leading-snug text-white/90 whitespace-pre-line">{draft.note || <span style={{ color: DIM }}>Write a note for fans</span>}</span>
          </span>
        </>)}
        {part("venue", <>
          <span className="flex items-center gap-3 rounded-[10px] p-3 pr-24" style={{ background: "#111", border: "1px solid #1f1f1f" }}>
            <span className="w-[32px] h-[32px] rounded-lg flex items-center justify-center shrink-0" style={{ background: `${Y}24`, border: `1px solid ${Y}8c`, color: Y }}><MapPin className="w-4 h-4" /></span>
            <span className="min-w-0">
              <span className="block text-[16px] font-bold leading-tight truncate text-white">{draft.venueWhere === "email" ? "Location in your confirmation" : row?.venue || "No venue set"}</span>
              <span className="block text-[10px] tracking-[0.06em] uppercase text-white/50 mt-0.5 truncate" style={{ fontFamily: SCENE_MONO }}>{draft.venueWhere === "email" ? "Sent by email" : [draft.address, placeText].filter(Boolean).join(", ")}</span>
            </span>
          </span>
        </>)}
        {part("tickets", <>
          {rsvp ? (
            <span className="flex items-center justify-between rounded-xl px-4 py-3 text-[#0d0d0d]" style={{ background: G }}>
              <span className="flex items-center gap-2 text-[20px] font-bold tracking-[0.06em]"><Users className="w-5 h-5" /> RSVP</span>
              <span className="text-right leading-tight pr-20">
                <span className="block text-[9px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_MONO }}>PAY AT THE DOOR</span>
                {draft.ticketPrice && <span className="block text-[22px] font-bold leading-none" style={{ fontFamily: SCENE_MONO }}>{draft.ticketPrice}</span>}
              </span>
            </span>
          ) : (
            <span className="flex items-center justify-between rounded-xl px-4 py-3 text-[#0d0d0d]" style={{ background: G, boxShadow: "0 0 22px rgba(140,255,61,0.4)" }}>
              <span className="flex items-center gap-2 text-[20px] font-bold tracking-[0.06em]"><Ticket className="w-5 h-5" /> GET TICKETS</span>
              <span className="text-[22px] font-bold leading-none pr-20" style={{ fontFamily: SCENE_MONO }}>{draft.ticketPrice}</span>
            </span>
          )}
        </>)}
        {rsvp && part("lineup", <>
            <span className="block rounded-[10px] p-3 pr-12" style={{ background: "#111", border: "1px solid #1f1f1f" }}>
              <span className="block text-[14px] font-semibold text-white/80">Who are you coming to see?</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {draft.lineup.filter((a) => a.name.trim()).length
                  ? draft.lineup.filter((a) => a.name.trim()).map((a) => <span key={a.id} className="px-3 py-1.5 rounded-full text-[13px] font-semibold border border-white/20 text-white/85">{a.name}</span>)
                  : <span className="text-[14px]" style={{ color: DIM }}>Add the lineup (optional)</span>}
              </span>
            </span>
          </>)}
      </div>
    </div>
  );

  // ---- Setup: how fans get in, limit, local shows, email, attachments ----
  const section = (t, children, aside = null) => (
    <section className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE_LINE}` }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[18px] font-bold text-white">{t}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
  const setupTab = draft && (
    <div className="space-y-3">
      {section("How fans get in", <>
        {segmented([["tickets", "Ticket link"], ["rsvp", "RSVP, pay at door"]], draft.entry, (k) => set({ entry: k }), "How fans get in")}
        {note(rsvp ? "Fans RSVP on the fan page with their name, email and party size, and get the event info by email. You'll see them under Guests." : "Fans tap Get Tickets and buy wherever your ticket link goes.")}
      </>)}
      {rsvp && section("RSVP limit", <>
          {segmented([[false, "No limit"], [true, "Limit"]], !!draft.capacityOn, (k) => set({ capacityOn: k }), "RSVP limit")}
          {draft.capacityOn && (
            <label className="mt-2 flex items-center gap-2">
              <input type="number" inputMode="numeric" min={1} step={1} value={draft.capacity} placeholder="150" aria-label="Max people"
                onChange={(e) => set({ capacity: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
                className="w-[110px] bg-[#0a0c1c] border border-[#262b52] rounded-lg px-3 py-2.5 text-white text-base text-right focus:outline-none focus:border-[#8CFF3D]/60" style={{ fontFamily: SCENE_MONO }} />
              <span className="text-[15px]" style={{ color: SOFT }}>people max</span>
            </label>
          )}
          {note(draft.capacityOn ? "Counts everyone in each party. When it's full, the RSVP form says RSVPs are full." : "Anyone can RSVP.")}
        </>)}
      {section("Local shows", <>
        {segmented([[false, "Not listed"], [true, "List in local shows"]], draft.discover, (k) => set({ discover: k }), "Local shows")}
        {draft.discover && (draft.hidden.includes("date") || draft.hidden.includes("venue"))
          ? <p className="mt-2.5 text-[15px] leading-relaxed text-[#FF6A00]">Fans nearby won't see it yet: local shows need the date and venue shown, so fans know when and where. Show them on the page, or leave this off to keep the event private.</p>
          : note(draft.discover
            ? `Fan accounts in ${row?.city || "this event's city"}${row?.state ? `, ${row.state}` : ""} who turned on local shows see it in Discover as a flyer card. It drops off after the show.`
            : "Only people with the link see this page. Turn this on to also show it to fans nearby in Show Pilot's local shows.")}
        {draft.discover && !row?.state && <p className="mt-2 text-[14px] text-[#FF6A00]">This event has no city or state yet, so it can't be matched to fans nearby. Add them in the event itself.</p>}
        {(row?.fan_page?.discover === true || (stats && stats.seen > 0)) && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[["SEEN BY", stats?.seen, stats?.seen_7d, "fans landed on your card in Discover"], ["TAPPED THROUGH", stats?.tapped, stats?.tapped_7d, "opened your fan page from it"]].map(([l, all, week, hint]) => (
              <div key={l} className="rounded-xl px-3 py-2.5 bg-[#0a0c1c] border border-[#1c2042]" title={hint}>
                <div className="text-[10.5px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: DIM }}>{l}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-[26px] font-bold leading-none text-white" style={{ fontFamily: SCENE_MONO }}>{all ?? "–"}</span>
                  <span className="text-[13px]" style={{ color: SOFT }}>{all === 1 ? "fan" : "fans"}</span>
                </div>
                <div className="mt-1 text-[12px]" style={{ color: week ? G : DIM }}>{week ? `+${week} this week` : "none this week"}</div>
              </div>
            ))}
          </div>
        )}
      </>)}
      {rsvp && section("RSVP email", <>
          {label("SUBJECT", "mt-3")}
          <input className={`${inputCls} mt-1.5`} maxLength={150} placeholder={`You're on the list: ${title}`} value={draft.emailSubject} onChange={(e) => set({ emailSubject: e.target.value })} />
          {label("MESSAGE TO PEOPLE WHO RSVP", "mt-3.5")}
          <textarea className={`${inputCls} mt-1.5 min-h-[140px]`} maxLength={2000} placeholder="Where to enter, what to bring, parking" value={draft.rsvpMessage} onChange={(e) => set({ rsvpMessage: e.target.value })} />
          {note("Every RSVP email also has the flyer, the event details and the fan's key to the event sky.")}
        </>)}
      {section("Email attachments", <>
        <input ref={attachRef} type="file" multiple accept={FILE_TYPES.join(",")} className="hidden" onChange={pickAttachments} />
        <div className="mt-2 space-y-1.5">
          {draft.files.map((f, i) => (
            <div key={f.path} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#0a0c1c] border border-[#1c2042]">
              <FileText className="w-4 h-4 text-white/50 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-white">{f.name}</span>
              <span className="text-[13px] text-white/50 shrink-0">{fileSize(f.size || 0)}</span>
              <button type="button" onClick={() => set({ files: draft.files.filter((_, j) => j !== i) })} aria-label={`Remove ${f.name}`} className="p-1 text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {draft.files.length < MAX_FILES && (
            <button type="button" onClick={() => attachRef.current?.click()} disabled={attaching} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a0c1c] border border-dashed border-[#262b52] text-white/80 text-[15px] font-semibold hover:text-white disabled:opacity-50">
              <Paperclip className="w-4 h-4" /> {attaching ? "Uploading..." : "Attach a file"}
            </button>
          )}
        </div>
        {note(`Parking instructions, a map, anything fans need. PDFs or images, ${MAX_FILE_MB} MB each. Only sent with the confirmation email ${rsvp ? "to people who RSVP" : "to Eventbrite ticket buyers"}, never shown on the public page.`)}
      </>, <span className="text-[12px]" style={{ fontFamily: SCENE_MONO, color: DIM }}>{draft.files.length}/{MAX_FILES}</span>)}
      {!rsvp && !savedRsvp && row?.fan_page_enabled && section("Ticket buyer emails", <>
          <EventbriteLink showId={showId} onLinked={(link) => { if (!draft.ticketLink.trim() && link?.eb_event_url) set({ ticketLink: link.eb_event_url }); }} />
        </>)}
    </div>
  );

  // ---- Share: the link, QR, share sheet and the custom link name ----
  const shareTab = draft && row && (
    <div className="space-y-3">
      {!row.fan_page_enabled && (
        <p className="rounded-2xl p-4 text-[15px] leading-relaxed" style={{ background: "rgba(255,106,0,0.1)", border: "1px solid rgba(255,106,0,0.45)", color: "#ffb27a" }}>
          The page isn't live yet. Turn it on at the top and press Publish, then share this link.
        </p>
      )}
      {section("Link", <>
        <div className="mt-2 px-3 py-2.5 rounded-lg truncate text-[14px] text-white/85 bg-[#0a0c1c] border border-[#1c2042]" style={{ fontFamily: SCENE_MONO }}>{url}</div>
        <div className="mt-2 flex gap-1.5 [&>button]:flex-1 [&>button]:justify-center">
          <button type="button" onClick={copy} className="flex items-center px-3 py-2 rounded-lg text-sm font-bold tracking-[0.06em]"
            style={{ background: copied ? G : "rgba(140,255,61,0.1)", border: `1px solid ${copied ? G : "rgba(140,255,61,0.4)"}`, color: copied ? "#0d0d0d" : G }}>{copied ? "COPIED" : "COPY"}</button>
          <FanQrCode url={url} eventName={title} style={draft.qr} onSaveStyle={async (style) => { set({ qr: style }); return true; }} />
          <ShareButton url={url} title={title} />
        </div>
        {row.fan_page_enabled && (
          <a href={url} className="mt-2 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[14px] font-bold tracking-[0.06em]" style={{ color: G, border: `1px solid ${EDGE_LINE}` }}>
            OPEN THE FAN PAGE <ChevronRight className="w-3.5 h-3.5" />
          </a>
        )}
        {JSON.stringify(draft.qr) !== JSON.stringify(saved?.qr) && <p className="mt-2 text-[13px]" style={{ color: SOFT }}>New QR look saved to your draft. Publish to keep it.</p>}
      </>)}
      {section("Custom link", <>
        <div className="mt-2 flex items-center bg-[#0a0c1c] border border-[#262b52] rounded-lg focus-within:border-[#8CFF3D]/60 overflow-hidden">
          <span className="pl-3 pr-0.5 text-[14px] text-white/45 shrink-0" style={{ fontFamily: SCENE_MONO }}>{linkPrefix.replace(/^https?:\/\//, "")}</span>
          <input value={draft.slug} onChange={(e) => set({ slug: cleanSlug(e.target.value) })} onBlur={() => set({ slug: trimSlug(draft.slug) })}
            placeholder={cleanSlug(title || "my-event").replace(/-+$/, "").slice(0, 20) || "my-event"} maxLength={SLUG_MAX}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Custom link name"
            className="flex-1 min-w-0 bg-transparent py-2.5 pr-3 text-white text-[14px] placeholder:text-white/30 focus:outline-none" style={{ fontFamily: SCENE_MONO }} />
        </div>
        <p className="mt-1.5 text-[13px] leading-snug" style={{ color: slugProblem(trimSlug(draft.slug)) ? "#f87171" : DIM }}>
          {slugProblem(trimSlug(draft.slug)) || (trimSlug(draft.slug) !== (row.fan_slug || "")
            ? `Publish to change the link. Your QR code and shared links will use the new one.${row.fan_slug ? " The old name will stop working." : ""}`
            : `Pick an easy name to share, like the event name. ${SLUG_MIN}-${SLUG_MAX} letters, numbers and hyphens.`)}
        </p>
      </>)}
    </div>
  );

  // ---- Guests: the RSVP list ----
  const guestsTab = row && (savedRsvp && row.fan_page_enabled ? (
    <RsvpList showId={showId} tall={desktop} capacity={savedCap} />
  ) : (
    <div className="rounded-2xl p-5 text-center" style={{ background: PANEL, border: `1px dashed ${EDGE_LINE}` }}>
      <Users className="w-7 h-7 mx-auto" style={{ color: G }} />
      <p className="mt-2 text-[17px] font-bold text-white">{savedRsvp ? "Your guest list starts when the page is live" : "Guest lists are for RSVP events"}</p>
      <p className="mt-1 text-[15px] leading-relaxed" style={{ color: SOFT }}>{savedRsvp ? "Turn the page on and publish, then RSVPs show up here." : "Switch how fans get in to RSVP under Setup and publish. Everyone who RSVPs shows up here."}</p>
      {!savedRsvp && <button type="button" onClick={() => setTab("setup")} className="mt-3 px-4 py-2.5 rounded-lg text-[14px] font-bold" style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}>Open Setup</button>}
    </div>
  ));

  // ---- Countdown (job 78): up to 5 notches, each an email to RSVP'd fans ----
  const cd = draft?.countdown || { enabled: false, notches: [] };
  const setCd = (patch) => set({ countdown: { ...cd, ...patch } });
  const setNotch = (id, patch) => setCd({ notches: cd.notches.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const newNotchId = () => `n${Math.random().toString(36).slice(2, 8)}`;
  const blankNotch = (days, type, extra = {}) => ({ id: newNotchId(), days_before: days, type, subject: "", message: "", kind: type === "unlock" ? "note" : "", title: "", body: "", image_url: "", link_url: "", ...extra });
  const QUICK = {
    reminder: () => [blankNotch(1, "reminder", { subject: `Get ready for ${title}` })],
    full: () => [
      blankNotch(14, "reminder"),
      blankNotch(7, "unlock", { kind: "note", title: "A note from the artist" }),
      blankNotch(3, "unlock", { kind: "setlist", title: "Setlist tease" }),
      blankNotch(1, "unlock", { kind: "doors", title: "Doors & parking" }),
      blankNotch(0, "reminder", { subject: `Tonight: ${title}` }),
    ],
  };
  const sortedNotches = [...cd.notches].sort((a, b) => b.days_before - a.days_before);
  const dayCounts = cd.notches.reduce((m, n) => ({ ...m, [n.days_before]: (m[n.days_before] || 0) + 1 }), {});
  const notchDate = (d) => {
    if (!row?.date) return null;
    const t = new Date(row.date + "T00:00:00");
    t.setDate(t.getDate() - d);
    return t;
  };
  const DAY_PICKS = [[0, "Morning of"], [1, "Day before"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"]];
  const KINDS = [["note", "Artist note"], ["setlist", "Setlist tease"], ["playlist", "Playlist"], ["bts", "Behind the scenes"], ["doors", "Doors & parking"], ["merch", "Merch first look"]];
  const [uploadingNotch, setUploadingNotch] = useState(null);
  const notchImageRef = useRef(null);
  const pickNotchImage = async (e) => {
    const file = e.target.files?.[0];
    const id = uploadingNotch;
    e.target.value = "";
    if (!file || !id) { setUploadingNotch(null); return; }
    if (file.size > 4 * 1024 * 1024) { setErr("Images must be under 4 MB."); setUploadingNotch(null); return; }
    try { const url = await uploadIconImage(file); setNotch(id, { image_url: url }); } catch { setErr("Couldn't upload the image."); }
    setUploadingNotch(null);
  };
  const chip = (on, label, onClick, key) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={on} className="px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap"
      style={on ? { background: "rgba(140,255,61,0.14)", color: G, boxShadow: "inset 0 0 0 1px rgba(140,255,61,0.5)" } : { color: SOFT, boxShadow: `inset 0 0 0 1px ${EDGE_LINE}` }}>{label}</button>
  );

  const countdownTab = draft && (
    <div className="space-y-3">
      <input ref={notchImageRef} type="file" accept="image/*" className="hidden" onChange={pickNotchImage} />
      {section("Countdown", <>
        {segmented([[false, "Off"], [true, "On"]], !!cd.enabled, (k) => setCd({ enabled: k, notches: k && !cd.notches.length ? QUICK.reminder() : cd.notches }), "Countdown")}
        {note(cd.enabled
          ? "Each notch is an email to everyone who RSVP'd, sent at 10 AM Eastern on its day. An Unlock also reveals something in the event's sky and turns a notch on the fan's key. Fans who RSVP late see past unlocks right away."
          : "Keep fans excited before the show with up to 5 emails, each one turning a notch on their key. Off by default.")}
        {cd.enabled && !rsvp && <p className="mt-2 text-[14px] leading-relaxed text-[#FF6A00]">Countdown emails go to people who RSVP. Switch how fans get in to RSVP under Setup, or the countdown won't send.</p>}
        {cd.enabled && !row?.date && <p className="mt-2 text-[14px] text-[#FF6A00]">This event has no date yet, so the countdown can't be scheduled.</p>}
        {cd.enabled && draft.hidden.includes("date") && <p className="mt-2 text-[14px] text-[#FF6A00]">The date is hidden on the fan page, so the countdown won't run. Show the date to use it.</p>}
        {cd.enabled && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-[12px] self-center" style={{ color: DIM, fontFamily: SCENE_MONO }}>QUICK START</span>
            {chip(false, "Day-before reminder", () => setCd({ notches: QUICK.reminder() }), "q1")}
            {chip(false, "Full countdown (5)", () => setCd({ notches: QUICK.full() }), "q2")}
          </div>
        )}
      </>)}

      {cd.enabled && sortedNotches.map((n, idx) => {
        const when = notchDate(n.days_before);
        const passed = when && new Date(when.getTime() + 10 * 3600 * 1000) < new Date();
        const st = countdownStats?.[n.id];
        const unlock = n.type === "unlock";
        return (
          <section key={n.id} className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${unlock ? "rgba(140,255,61,0.35)" : EDGE_LINE}` }}>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0" style={{ background: unlock ? G : "#1c2042", color: unlock ? "#0d0d0d" : "#fff", fontFamily: SCENE_MONO }}>{idx + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-bold text-white truncate">{unlock ? "Unlock" : "Reminder"} · {n.days_before === 0 ? "morning of" : `${n.days_before} ${n.days_before === 1 ? "day" : "days"} before`}</span>
                <span className="block text-[12px]" style={{ color: passed ? "#FF6A00" : DIM, fontFamily: SCENE_MONO }}>
                  {when ? `${when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()} · 10 AM ET` : "NO DATE"}{passed ? " · ALREADY PASSED" : ""}
                  {st ? ` · SENT ${st.sent} · OPENED ${st.opened}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => setCd({ notches: cd.notches.filter((x) => x.id !== n.id) })} aria-label="Remove notch" className="p-2 rounded-lg text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>

            {label("WHEN", "mt-3")}
            <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
              {DAY_PICKS.map(([d, l]) => chip(n.days_before === d, l, () => setNotch(n.id, { days_before: d }), d))}
              <label className="flex items-center gap-1.5 ml-1">
                <input type="number" inputMode="numeric" min={0} max={30} value={n.days_before} aria-label="Days before the show"
                  onChange={(e) => setNotch(n.id, { days_before: Math.max(0, Math.min(30, Number(e.target.value.replace(/[^0-9]/g, "")) || 0)) })}
                  className="w-[64px] bg-[#0a0c1c] border border-[#262b52] rounded-lg px-2 py-1.5 text-white text-[14px] text-right focus:outline-none focus:border-[#8CFF3D]/60" style={{ fontFamily: SCENE_MONO }} />
                <span className="text-[13px]" style={{ color: SOFT }}>days before</span>
              </label>
            </div>
            {dayCounts[n.days_before] > 1 && <p className="mt-1.5 text-[13px] text-[#FF6A00]">Two notches go out the same day. Fans get both emails.</p>}
            {passed && <p className="mt-1.5 text-[13px]" style={{ color: SOFT }}>This day has passed, so it won't email. Fans see it as already turned in the sky.</p>}

            {label("TYPE", "mt-3")}
            {segmented([["reminder", "Reminder"], ["unlock", "Unlock"]], n.type, (k) => setNotch(n.id, { type: k, kind: k === "unlock" ? (n.kind || "note") : n.kind }), "Notch type")}

            {label("EMAIL SUBJECT", "mt-3")}
            <input className={`${inputCls} mt-1.5`} maxLength={150} value={n.subject} onChange={(e) => setNotch(n.id, { subject: e.target.value })}
              placeholder={unlock ? `A notch just turned: ${title}` : n.days_before === 0 ? `Tonight: ${title}` : n.days_before === 1 ? `Tomorrow: ${title}` : `${n.days_before} days to go: ${title}`} />
            {label("MESSAGE (OPTIONAL)", "mt-3")}
            <textarea className={`${inputCls} mt-1.5 min-h-[80px]`} maxLength={1500} value={n.message} onChange={(e) => setNotch(n.id, { message: e.target.value })}
              placeholder={unlock ? "A line to go with the unlock" : "Anything fans should know. Date, doors, venue and their key are added automatically."} />

            {unlock && (
              <div className="mt-3 rounded-xl p-3" style={{ background: "#0a0c1c", border: "1px solid #1c2042" }}>
                <div className="text-[11.5px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: G }}>WHAT IT UNLOCKS IN THE SKY</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {KINDS.map(([k, l]) => chip(n.kind === k, l, () => setNotch(n.id, { kind: k }), k))}
                </div>
                <input className={`${inputCls} mt-2.5`} maxLength={80} value={n.title} onChange={(e) => setNotch(n.id, { title: e.target.value })} placeholder="Title fans see, e.g. Three songs we've never played live" />
                <textarea className={`${inputCls} mt-2 min-h-[90px]`} maxLength={2000} value={n.body} onChange={(e) => setNotch(n.id, { body: e.target.value })} placeholder="The text that unlocks" />
                <div className="mt-2 flex items-center gap-2.5">
                  {n.image_url && <img src={n.image_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-[#262b52]" />}
                  <button type="button" disabled={!!uploadingNotch} onClick={() => { setUploadingNotch(n.id); notchImageRef.current?.click(); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#05060f] border border-[#262b52] text-white/85 text-[14px] font-semibold disabled:opacity-50">
                    <ImagePlus className="w-4 h-4" /> {uploadingNotch === n.id ? "Uploading..." : n.image_url ? "Replace image" : "Add an image"}
                  </button>
                  {n.image_url && <button type="button" onClick={() => setNotch(n.id, { image_url: "" })} className="text-[13px] text-white/50 hover:text-white">Remove</button>}
                </div>
                <input className={`${inputCls} mt-2`} inputMode="url" value={n.link_url} onChange={(e) => setNotch(n.id, { link_url: e.target.value })} placeholder="Link (playlist, merch, video), optional" />
              </div>
            )}
          </section>
        );
      })}

      {cd.enabled && cd.notches.length < 5 && (
        <button type="button" onClick={() => setCd({ notches: [...cd.notches, blankNotch([7, 3, 14, 1, 0, 2, 5, 10, 21, 30].find((d) => !dayCounts[d]) ?? 0, "reminder")] })}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[15px] font-bold" style={{ color: G, border: `1px dashed ${EDGE_LINE}` }}>
          <Plus className="w-4 h-4" /> Add a notch ({cd.notches.length}/5)
        </button>
      )}
    </div>
  );

  const TABS = [
    { id: "page", label: "Page" },
    { id: "guests", label: "Guests" },
    { id: "share", label: "Share" },
    { id: "countdown", label: "Countdown" },
    { id: "setup", label: "Setup" },
  ];
  const tabBar = (
    <div role="tablist" aria-label="Fan page" className="flex gap-1 p-1 rounded-full" style={{ background: "rgba(14,17,40,0.85)", border: `1px solid ${EDGE_LINE}` }}>
      {TABS.map((t) => {
        const sel = tab === t.id;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={sel} onClick={() => { setTab(t.id); if (t.id !== "page" && !desktop) setEditing(null); }}
            className="flex-auto h-9 rounded-full text-[13px] font-bold tracking-[0.01em] transition-colors whitespace-nowrap px-2.5" style={{ background: sel ? G : "transparent", color: sel ? "#0d0d0d" : SOFT }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const statusPill = row && (
    <span className="text-[11px] font-bold tracking-[0.12em] px-2 py-1 rounded-md" style={{ fontFamily: SCENE_MONO, color: row.fan_page_enabled ? G : DIM, background: row.fan_page_enabled ? "rgba(140,255,61,0.1)" : "transparent", border: `1px solid ${row.fan_page_enabled ? "rgba(140,255,61,0.4)" : EDGE_LINE}` }}>
      {row.fan_page_enabled ? "LIVE" : "OFF"}
    </span>
  );
  const pageSwitch = draft && (
    <button type="button" onClick={() => set({ enabled: !draft.enabled })} aria-pressed={on} aria-label={on ? "Turn the page off" : "Turn the page on"}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-sm font-bold"
      style={{ background: on ? "rgba(140,255,61,0.1)" : "#0a0c1c", border: `1px solid ${on ? "rgba(140,255,61,0.45)" : EDGE_LINE}`, color: on ? G : SOFT }}>
      <span className="relative w-8 h-[18px] rounded-[9px] shrink-0" style={{ background: on ? G : "#262b52" }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full transition-[left]" style={{ left: on ? 16 : 2, background: on ? "#0d0d0d" : "rgba(255,255,255,0.6)" }} />
      </span>
      {on ? "On" : "Off"}
    </button>
  );
  const header = (
    <div className="flex items-center gap-2.5">
      <span className="text-[26px] font-bold text-white leading-none">Fan page</span>
      {statusPill}
      <span className="flex-1" />
      {pageSwitch}
      <button type="button" onClick={close} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: SOFT, border: `1px solid ${EDGE_LINE}` }}><X className="w-4 h-4" /></button>
    </div>
  );

  // The one place anything goes live.
  const publishBar = draft && (
    <div className="px-4 py-3 flex items-center gap-3" style={{ borderTop: `1px solid ${EDGE_LINE}`, background: "rgba(5,6,15,0.96)", paddingBottom: desktop ? undefined : "max(12px, env(safe-area-inset-bottom))" }}>
      <div className="min-w-0 flex-1 text-[14px] leading-snug">
        {err ? <span className="text-red-400">{err}</span>
          : confirmClose ? <span className="text-[#FF6A00]">Leave without publishing {changes} {changes === 1 ? "change" : "changes"}?</span>
            : changes ? <span className="text-white"><b>{changes}</b> {changes === 1 ? "change" : "changes"} fans can't see yet</span>
              : published ? <span style={{ color: G }}>Published. Live for everyone who opens the page.</span>
                : <span style={{ color: DIM }}>{row?.fan_page_enabled ? "Everything's live." : "Page is off."} Tap any part of the page to edit it.</span>}
      </div>
      {confirmClose ? (
        <>
          <button type="button" onClick={() => setConfirmClose(false)} className="px-3.5 py-2.5 rounded-lg text-[14px] font-bold" style={{ color: SOFT, border: `1px solid ${EDGE_LINE}` }}>Keep editing</button>
          <button type="button" onClick={onClose} className="px-3.5 py-2.5 rounded-lg text-[14px] font-bold" style={{ background: "#FF6A00", color: "#0d0d0d" }}>Discard</button>
        </>
      ) : (
        <>
          {changes > 0 && <button type="button" onClick={discard} className="px-3 py-2.5 rounded-lg text-[14px] font-semibold" style={{ color: SOFT }}>Undo all</button>}
          <button type="button" onClick={publish} disabled={saving || !changes}
            className="px-5 py-2.5 rounded-lg text-[15px] font-bold tracking-[0.08em] disabled:opacity-40"
            style={{ background: G, color: "#0d0d0d", boxShadow: changes ? "0 0 18px rgba(140,255,61,0.45)" : "none" }}>
            {saving ? "PUBLISHING..." : "PUBLISH"}
          </button>
        </>
      )}
    </div>
  );

  const loading = !row && (
    <div className="flex-1 flex items-center justify-center">
      {err ? <p className="text-[15px] text-red-400">{err}</p> : <div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />}
    </div>
  );
  const starfield = { background: `radial-gradient(1px 1px at 12% 18%, #ffffff55, transparent), radial-gradient(1px 1px at 72% 32%, #ffffff40, transparent), radial-gradient(1px 1px at 40% 78%, #ffffff35, transparent), radial-gradient(1px 1px at 88% 82%, #ffffff40, transparent), ${NAVY}` };
  const tabContent = { guests: guestsTab, share: shareTab, setup: setupTab, countdown: countdownTab };

  if (desktop) {
    // Desktop: tabs across the top; the live preview always on the left, the
    // open part's editor (or the Guests / Share / Setup tab) on the right.
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ fontFamily: SCENE_FONT }}>
        <div className="absolute inset-0 bg-black/70" onClick={close} />
        <div className="relative w-full max-w-[1120px] h-[min(94vh,880px)] flex flex-col rounded-[22px] overflow-hidden" style={{ ...starfield, border: `1px solid ${EDGE_LINE}`, boxShadow: "0 24px 70px rgba(0,0,0,0.7)" }}>
          <div className="px-6 pt-5 pb-3.5 space-y-3.5" style={{ borderBottom: `1px solid ${EDGE_LINE}` }}>
            {header}
            {row && <div className="max-w-[640px]">{tabBar}</div>}
          </div>
          {loading || (
            <div className="flex-1 min-h-0 grid grid-cols-[minmax(380px,460px)_1fr]">
              <div className="min-h-0 overflow-y-auto px-6 py-5" style={{ borderRight: `1px solid ${EDGE_LINE}` }}>
                <div className="mb-2.5 text-center text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: DIM }}>WHAT FANS SEE · TAP TO EDIT</div>
                {preview}
              </div>
              <div className="min-h-0 overflow-y-auto px-6 py-5">
                {tab === "page" ? (
                  editing ? <div className="max-w-[560px]">{editorPanel(editing)}</div> : (
                    <div className="max-w-[560px]">
                      <h3 className="text-[22px] font-bold text-white">Edit your page</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: SOFT }}>Tap any part of the page on the left to edit it. The eye hides a part from fans. Nothing changes for fans until you press Publish.</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {Object.keys(PARTS).filter((k) => k !== "lineup" || rsvp).filter((k) => k !== "band" || (row?.band_name && row.band_name !== row.event_name)).map((k) => (
                          <button key={k} type="button" onClick={() => setEditing(k)} className="flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl text-left" style={{ background: PANEL, border: `1px solid ${EDGE_LINE}` }}>
                            <span className="text-[15px] font-semibold" style={{ color: isField(k) && !isShown(k) ? DIM : "#fff" }}>{PARTS[k]}</span>
                            {isField(k) && !isShown(k) ? <EyeOff className="w-4 h-4" style={{ color: DIM }} /> : <ChevronRight className="w-4 h-4" style={{ color: DIM }} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                ) : <div className="max-w-[640px]">{tabContent[tab]}</div>}
              </div>
            </div>
          )}
          {row && publishBar}
        </div>
      </div>
    );
  }

  // Phone: a tall sheet. Page = the preview; tapping a part slides its editor
  // up over the bottom of the preview.
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ fontFamily: SCENE_FONT }}>
      <div className="absolute inset-0 bg-black/70" onClick={close} />
      <div className="relative w-full max-w-lg h-[94dvh] flex flex-col rounded-t-[22px] overflow-hidden" style={{ ...starfield, borderTop: `1px solid ${EDGE_LINE}`, boxShadow: "0 -10px 40px rgba(0,0,0,0.6)" }}>
        <div className="shrink-0 px-4 pt-2.5 pb-3 space-y-3">
          <div className="w-10 h-1 rounded-sm mx-auto" style={{ background: EDGE_LINE }} />
          {header}
          {row && tabBar}
        </div>
        {loading || (
          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0 overflow-y-auto px-4 pb-6" style={{ paddingBottom: tab === "page" && editing ? "62%" : undefined }}>
              {tab === "page" ? (
                <>
                  <div className="mb-2 text-center text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: DIM }}>WHAT FANS SEE · TAP TO EDIT</div>
                  {preview}
                </>
              ) : tabContent[tab]}
            </div>
            {tab === "page" && editing && (
              <div className="absolute inset-x-0 bottom-0 max-h-[60%] overflow-y-auto rounded-t-[20px] px-4 pt-4 pb-5" style={{ background: "#0b0d20", borderTop: `1px solid ${EDGE_LINE}`, boxShadow: "0 -12px 30px rgba(0,0,0,0.6)" }}>
                {editorPanel(editing)}
              </div>
            )}
          </div>
        )}
        {row && publishBar}
      </div>
    </div>
  );
}

// Show / hide a part of the page from fans.
function EyeToggle({ shown, onToggle, label, small = false }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-pressed={shown} aria-label={shown ? `Hide ${label} from fans` : `Show ${label} to fans`}
      className={`${small ? "w-7 h-7" : "h-9 px-3 gap-1.5"} rounded-full flex items-center justify-center text-[13px] font-bold`}
      style={{ background: small ? "#000b" : shown ? "rgba(140,255,61,0.1)" : "#0a0c1c", color: shown ? G : DIM, border: `1px solid ${shown ? "rgba(140,255,61,0.45)" : EDGE_LINE}` }}>
      {shown ? <Eye className={small ? "w-3.5 h-3.5" : "w-4 h-4"} /> : <EyeOff className={small ? "w-3.5 h-3.5" : "w-4 h-4"} />}
      {!small && (shown ? "Shown" : "Hidden")}
    </button>
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

  const url = info?.fan_token ? fanUrl(info.fan_slug, info.fan_token) : "";
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
          <span className="text-[12px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: info?.enabled ? G : "rgba(255,255,255,0.45)" }}>{info === undefined ? "" : info?.enabled ? "LIVE" : "OFF"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {info === undefined && <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>}

        {info !== undefined && !info?.enabled && (
          <p className="mt-2 text-[15px] font-medium leading-tight text-white/50">The host hasn't turned on the public page for this event yet. Only the owner can switch it on and edit it.</p>
        )}

        {info?.enabled && (
          <>
            <p className="mt-1 text-[15px] font-medium leading-tight text-white/50">This is the page fans see. Only the event owner can edit it.</p>
            <div className="mt-3 bg-[#111] border border-[#1f1f1f] rounded-[10px] p-1.5">
              <div className="px-1.5 pt-0.5 pb-1.5 truncate text-[13.5px] text-white/80" style={{ fontFamily: SCENE_MONO }}>{url}</div>
              <div className="flex gap-1.5 [&>button]:flex-1 [&>button]:justify-center">
                <button type="button" onClick={copy} className="flex items-center px-3 py-2 rounded-lg text-sm font-bold tracking-[0.06em]" style={{ background: copied ? G : "rgba(140,255,61,0.1)", border: `1px solid ${copied ? G : "rgba(140,255,61,0.4)"}`, color: copied ? "#0d0d0d" : G }}>{copied ? "COPIED" : "COPY"}</button>
                <FanQrCode url={url} style={info.qr} />
                <ShareButton url={url} />
              </div>
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
