import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, FileText, ImagePlus, Paperclip, Plus, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { uploadIconImage } from "@/lib/eventIcons";
import { normalizeLink, isTruncatedLink } from "@/lib/links";
import EventbriteLink from "@/components/showpilot/EventbriteLink";
import RsvpList from "@/components/showpilot/RsvpList";
import FanQrCode from "@/components/showpilot/FanQrCode";

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
  const attachRef = useRef(null);
  const [attaching, setAttaching] = useState(false);
  const desktop = useIsDesktop();
  // Which "What fans can see" / setup tab is open. One at a time.
  const [tab, setTab] = useState("tickets");

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
      files: Array.isArray(cfg.files) ? cfg.files : [],
    };
  };

  useEffect(() => {
    let alive = true;
    supabase
      .from("shows")
      .select("fan_token, fan_page_enabled, fan_page, promoter_info, event_name, band_name, icon_url, date, venue, city, state")
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
  // into emails once the owner presses Update.
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
          files: draft.files,
        },
        promoter_info: { ...(row.promoter_info || {}), ticket_link: ticketLink, ticket_price: draft.ticketPrice.trim() },
      })
      .eq("id", showId)
      .select("fan_token, fan_page_enabled, fan_page, promoter_info, event_name, band_name, icon_url, date, venue, city, state")
      .single();
    setSaving(false);
    if (error || !data) { setErr("Couldn't update. Try again."); return; }
    // Clean up attachments the owner removed (best effort).
    const kept = new Set(draft.files.map((f) => f.path));
    const gone = (row.fan_page?.files || []).map((f) => f.path).filter((p) => p && !kept.has(p));
    if (gone.length) supabase.storage.from(FAN_FILES).remove(gone).catch(() => {});
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
  const note = (text) => <p className="mt-2 text-[13px] leading-snug text-white/45">{text}</p>;
  const readOnly = (value, fallback) => (
    <div className="mt-2 px-3 py-2 rounded-lg bg-[#111] border border-[#1f1f1f] text-sm" style={{ color: value ? "#fff" : "rgba(255,255,255,0.4)" }}>{value || fallback}</div>
  );

  // ---- Tabs: what fans can see (tick = shown) + setup ----
  const dateText = row?.date ? new Date(row.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const placeText = [row?.city, row?.state].filter(Boolean).join(", ");
  const doors = row?.promoter_info?.door_time || "";
  const clip = (t, n = 34) => (t && t.length > n ? t.slice(0, n - 1) + "…" : t);
  const shownTabs = draft ? [
    { key: "name", label: "Name and icon", always: true, summary: row?.event_name || row?.band_name || "Untitled event" },
    { key: "date", label: "Date", summary: dateText || "No date set" },
    { key: "venue", label: "Venue and address", summary: [row?.venue, draft.address].filter(Boolean).join(", ") || "No venue set" },
    { key: "times", label: "Doors, show time, ages", summary: [doors && `Doors ${doors}`, draft.showTime, draft.ages].filter(Boolean).join(" · ") || "Nothing added" },
    { key: "tickets", label: rsvp ? "Door price" : "Ticket link and price", summary: rsvp ? (draft.ticketPrice ? `${draft.ticketPrice} at the door` : "No price") : (draft.ticketLink ? clip(draft.ticketLink.replace(/^https?:\/\//, "")) : "No link yet") },
    { key: "band", label: "Artist name", summary: row?.band_name || "Not set" },
    { key: "note", label: "Note for fans", summary: draft.note ? clip(draft.note) : "Empty" },
    { key: "flyer", label: "Flyer image", summary: draft.flyer ? "Added" : "None" },
  ] : [];
  const setupTabs = draft ? [
    { key: "entry", label: "How fans get in", summary: rsvp ? "RSVP, pay at the door" : "Ticket link" },
    ...(rsvp ? [
      { key: "lineup", label: "Lineup", summary: draft.lineup.filter((a) => a.name.trim()).length ? `${draft.lineup.filter((a) => a.name.trim()).length} artists` : "No artists" },
      { key: "email", label: "RSVP email", summary: draft.emailSubject ? clip(draft.emailSubject) : "Default subject" },
    ] : []),
    { key: "files", label: "Email attachments", summary: draft.files.length ? `${draft.files.length} ${draft.files.length === 1 ? "file" : "files"}` : "None" },
    ...(!rsvp && !savedRsvp && row?.fan_page_enabled ? [{ key: "eventbrite", label: "Ticket buyer emails", summary: "Eventbrite" }] : []),
  ] : [];
  const allTabs = [...shownTabs, ...setupTabs];
  // Desktop always has one tab open; on a phone a tab can be closed.
  const activeTab = allTabs.some((t) => t.key === tab) ? tab : (desktop ? "entry" : "");
  const isShown = (key) => key === "name" || !draft.hidden.includes(key);
  const showField = (key, show) => set({ hidden: show ? draft.hidden.filter((k) => k !== key) : [...new Set([...draft.hidden, key])] });
  const openTab = (t) => {
    if (FIELDS.some((f) => f.key === t.key) && !isShown(t.key)) showField(t.key, true); // opening a hidden item shows it
    setTab(t.key);
  };

  const editors = {
    name: (
      <>
        <div className="mt-2 flex items-center gap-3">
          {row?.icon_url ? <img src={row.icon_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-[#2a2a2a]" /> : <span className="w-12 h-12 rounded-xl bg-[#111] border border-[#2a2a2a]" />}
          <span className="text-lg font-bold text-white">{row?.event_name || row?.band_name || "Untitled event"}</span>
        </div>
        {note("Always on the fan page. Change the name and icon in the event itself.")}
      </>
    ),
    date: (
      <>
        {readOnly(dateText, "No date set")}
        {note("Fans see the event's date. Change it in the event itself, or untick Date to keep it private.")}
      </>
    ),
    venue: (
      <>
        {readOnly([row?.venue, placeText].filter(Boolean).join(", "), "No venue set on the event")}
        <input className={`${inputCls} mt-2`} placeholder="Street address (used for the map link)" value={draft?.address || ""} onChange={(e) => set({ address: e.target.value })} />
        {note("Untick it for private events and speakeasies: the venue, address and map link stay off the page and out of emails.")}
      </>
    ),
    times: (
      <>
        {doors ? readOnly(`Doors ${doors}`) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Show time, e.g. 8:00 PM" value={draft?.showTime || ""} onChange={(e) => set({ showTime: e.target.value })} />
          <input className={inputCls} placeholder="Ages, e.g. 18+" value={draft?.ages || ""} onChange={(e) => set({ ages: e.target.value })} />
        </div>
        {doors && note("Doors time comes from the promoter section of the event.")}
      </>
    ),
    tickets: rsvp ? (
      <>
        <input className={`${inputCls} mt-2`} placeholder="Door price, e.g. $10 (optional)" value={draft?.ticketPrice || ""} onChange={(e) => set({ ticketPrice: e.target.value })} />
        {note("Shown on the RSVP card and in the RSVP email.")}
      </>
    ) : (
      <>
        <div className="mt-2 grid grid-cols-[1fr_96px] gap-2">
          <input className={inputCls} placeholder="Ticket link (where fans buy)" inputMode="url" value={draft?.ticketLink || ""} onChange={(e) => set({ ticketLink: e.target.value })} />
          <input className={inputCls} placeholder="Price" value={draft?.ticketPrice || ""} onChange={(e) => set({ ticketPrice: e.target.value })} />
        </div>
        {note("The Get Tickets button on the fan page opens this link.")}
      </>
    ),
    band: (
      <>
        {readOnly(row?.band_name, "No band or artist set on the event")}
        {note("Shown under the event name. Change it in the event itself.")}
      </>
    ),
    note: (
      <textarea className={`${inputCls} mt-2 min-h-[110px]`} placeholder="A short note for fans (set list teaser, anything to know before the night)" value={draft?.note || ""} onChange={(e) => set({ note: e.target.value })} />
    ),
    flyer: (
      <div className="mt-2 flex items-center gap-3">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFlyer} />
        {draft?.flyer && <img src={draft.flyer} alt="Flyer" className="w-20 h-20 rounded-lg object-cover border border-[#2a2a2a]" />}
        <div className="flex flex-col items-start gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#111] border border-[#2a2a2a] text-white/80 text-sm font-semibold disabled:opacity-50">
            <ImagePlus className="w-4 h-4" /> {busy ? "Uploading..." : draft?.flyer ? "Replace flyer" : "Add flyer image"}
          </button>
          {draft?.flyer && <button type="button" onClick={() => set({ flyer: "" })} className="text-white/40 hover:text-white text-xs">Remove</button>}
        </div>
      </div>
    ),
    entry: (
      <>
        <div className="mt-2 grid grid-cols-2 gap-1 p-1 bg-[#111] border border-[#1f1f1f] rounded-[10px]">
          {[["tickets", "Ticket link"], ["rsvp", "RSVP, pay at door"]].map(([k, text]) => (
            <button key={k} type="button" onClick={() => set({ entry: k })} className="py-2 rounded-lg text-sm font-bold tracking-[0.04em]" style={draft?.entry === k ? { background: G, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.6)" }}>{text}</button>
          ))}
        </div>
        {note(rsvp ? "Fans RSVP on the fan page with their name, email and party size, and get the event info by email. You'll see the list here." : "Fans tap Get Tickets and buy wherever your ticket link goes.")}
      </>
    ),
    lineup: draft && (
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
            <button type="button" onClick={addArtist} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111] border border-dashed border-[#2a2a2a] text-white/70 text-sm font-semibold hover:text-white">
              <Plus className="w-4 h-4" /> Add artist
            </button>
          )}
        </div>
        {note("Only shown in the RSVP form, where fans pick who they're coming to see. You'll see the count for each artist.")}
      </>
    ),
    email: (
      <>
        <input className={`${inputCls} mt-2`} maxLength={150} placeholder="Subject (optional)" value={draft?.emailSubject || ""} onChange={(e) => set({ emailSubject: e.target.value })} />
        <textarea className={`${inputCls} mt-2 min-h-[80px]`} maxLength={2000} placeholder="A message only people who RSVP get (where to enter, what to bring, parking)" value={draft?.rsvpMessage || ""} onChange={(e) => set({ rsvpMessage: e.target.value })} />
        {note(`Leave the subject empty to use "You're on the list: event name and date". Every RSVP email also has the flyer, the event details and the fan's key to the event sky.`)}
      </>
    ),
    files: draft && (
      <>
        <input ref={attachRef} type="file" multiple accept={FILE_TYPES.join(",")} className="hidden" onChange={pickAttachments} />
        <div className="mt-2 space-y-1.5">
          {draft.files.map((f, i) => (
            <div key={f.path} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#111] border border-[#1f1f1f]">
              <FileText className="w-4 h-4 text-white/50 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{f.name}</span>
              <span className="text-[11px] text-white/40 shrink-0">{fileSize(f.size || 0)}</span>
              <button type="button" onClick={() => set({ files: draft.files.filter((_, j) => j !== i) })} aria-label={`Remove ${f.name}`} className="p-1 text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {draft.files.length < MAX_FILES && (
            <button type="button" onClick={() => attachRef.current?.click()} disabled={attaching} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#111] border border-dashed border-[#2a2a2a] text-white/70 text-sm font-semibold hover:text-white disabled:opacity-50">
              <Paperclip className="w-4 h-4" /> {attaching ? "Uploading..." : "Attach a file"}
            </button>
          )}
        </div>
        {note(`Parking instructions, a map, anything fans need. PDFs or images, up to ${MAX_FILES} files, ${MAX_FILE_MB} MB each. Sent with every ${rsvp ? "RSVP confirmation" : "fan"} email, never shown on the public page.`)}
      </>
    ),
    eventbrite: (
      <EventbriteLink showId={showId} onLinked={(link) => { if (!draft.ticketLink.trim() && link?.eb_event_url) set({ ticketLink: link.eb_event_url }); }} />
    ),
  };

  const editorFor = (key) => {
    const isField = FIELDS.some((f) => f.key === key);
    if (isField && !isShown(key)) {
      return (
        <div className="mt-2">
          <p className="text-[14px] text-white/50">Hidden from fans.</p>
          <button type="button" onClick={() => showField(key, true)} className="mt-2 px-3 py-2 rounded-lg text-sm font-bold" style={{ background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}>Show to fans</button>
        </div>
      );
    }
    return editors[key];
  };

  // One row in the tab list. Tick = shown to fans; the rest of the row opens
  // its editor. Opening a hidden item shows it, since only shown items take info.
  const tabRow = (t, { field }) => {
    const shown = field ? isShown(t.key) : true;
    const active = activeTab === t.key;
    return (
      <div key={t.key} className="flex items-stretch" role="presentation">
        {field && (
          <button
            type="button"
            disabled={t.always}
            onClick={() => showField(t.key, !shown)}
            aria-label={t.always ? `${t.label} is always shown` : shown ? `Hide ${t.label} from fans` : `Show ${t.label} to fans`}
            className="pl-3 pr-1 flex items-center"
          >
            <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0" style={{ background: shown ? G : "transparent", border: `1px solid ${shown ? G : "#3a3a3a"}`, opacity: t.always ? 0.6 : 1 }}>
              {shown && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.2} />}
            </span>
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => (desktop || !active ? openTab(t) : setTab(""))}
          className={`flex-1 min-w-0 flex items-center gap-2 ${field ? "pl-2" : "pl-3"} pr-3 ${desktop ? "py-[4px]" : "py-[7px]"} text-left`}
        >
          <span className="min-w-0 flex-1">
            <span className={`block ${desktop ? "text-[14px]" : "text-[15px]"} font-semibold leading-tight truncate`} style={{ color: shown ? "#fff" : "rgba(255,255,255,0.45)" }}>{t.label}</span>
            <span className="block text-[11.5px] leading-tight truncate text-white/40">{field && !shown ? "Hidden from fans" : t.summary}</span>
          </span>
          {t.always && <span className="text-[9.5px] tracking-[0.08em] text-white/35" style={{ fontFamily: SCENE_MONO }}>ALWAYS</span>}
          {desktop ? <ChevronRight className="w-4 h-4 shrink-0" style={{ color: active ? G : "rgba(255,255,255,0.25)" }} /> : <ChevronDown className="w-4 h-4 shrink-0 transition-transform" style={{ color: active ? G : "rgba(255,255,255,0.25)", transform: active ? "rotate(180deg)" : "none" }} />}
        </button>
      </div>
    );
  };

  const tabGroup = (title, tabs, field) => (
    <>
      {label(title, "mt-3")}
      <div className="mt-1.5 bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden divide-y divide-[#1c1c1c]">
        {tabs.map((t) => (
          <div key={t.key} style={{ background: activeTab === t.key ? "rgba(140,255,61,0.06)" : "transparent", boxShadow: activeTab === t.key ? `inset 3px 0 0 ${G}` : "none" }}>
            {tabRow(t, { field })}
            {/* Phone: the open tab's editor sits right under its row. */}
            {!desktop && activeTab === t.key && <div className="px-3 pb-3">{editorFor(t.key)}</div>}
          </div>
        ))}
      </div>
    </>
  );

  // ---- Shared blocks ----
  const pageSwitch = row && draft && (
    <button
      type="button"
      onClick={() => set({ enabled: !draft.enabled })}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-sm font-bold"
      style={{ background: on ? "rgba(140,255,61,0.1)" : "#151515", border: `1px solid ${on ? "rgba(140,255,61,0.45)" : "#2a2a2a"}`, color: on ? G : "rgba(255,255,255,0.6)" }}
      aria-pressed={on}
    >
      <span className="relative w-8 h-[18px] rounded-[9px] shrink-0" style={{ background: on ? G : "#2a2a2a" }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full" style={{ left: on ? 16 : 2, background: on ? "#0d0d0d" : "rgba(255,255,255,0.6)" }} />
      </span>
      {on ? "Page on" : "Page off"}
    </button>
  );

  const offNote = <p className="mt-4 text-[15px] font-medium leading-snug text-white/50">The public page is off, so only people you've invited to the event can see it. Turn it on to set it up and get a link you can share.</p>;

  const linkBlock = on && row && (
    <div className="mt-2.5 flex items-center gap-2 bg-[#111] border border-[#1f1f1f] rounded-[10px] py-1.5 pl-3 pr-1.5">
      <span className="flex-1 truncate text-xs text-white/75" style={{ fontFamily: SCENE_MONO }}>{url}</span>
      <button
        type="button"
        onClick={copy}
        className="px-3 py-2 rounded-lg text-sm font-bold tracking-[0.06em]"
        style={{ background: copied ? G : "rgba(140,255,61,0.1)", border: `1px solid ${copied ? G : "rgba(140,255,61,0.4)"}`, color: copied ? "#0d0d0d" : G }}
      >{copied ? "COPIED" : "COPY"}</button>
      {row.fan_page_enabled && <FanQrCode url={url} eventName={row.event_name || row.band_name} />}
    </div>
  );

  const rsvpBlock = on && row?.fan_page_enabled && savedRsvp && <RsvpList showId={showId} tall={desktop} />;

  const actionsBlock = row && draft && (
    <>
      <div className="mt-3 flex gap-2">
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
      {err && row && <p className="mt-2 text-center text-[12px] text-red-400">{err}</p>}
    </>
  );

  const header = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="text-2xl font-bold flex-1 text-white">Fan page</span>
        {pageSwitch}
        <span className="text-[10px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: row?.fan_page_enabled ? G : "rgba(255,255,255,0.45)" }}>{row?.fan_page_enabled ? "LIVE" : "OFF"}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <p className="mt-1 text-[14px] font-medium leading-tight text-white/50">A public page for this event. Crew details, cues and contacts are never on it. Tick what fans see, open an item to fill it in, then press Update.</p>
      {!row && !err && <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>}
      {err && !row && <p className="mt-3 text-sm text-red-400">{err}</p>}
    </>
  );

  if (desktop) {
    // Desktop: tab list | open tab's editor | link, RSVPs, Update. Each
    // column fits the panel, so the page itself never scrolls.
    const active = allTabs.find((t) => t.key === activeTab);
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ fontFamily: SCENE_FONT }}>
        <div className="absolute inset-0 bg-black/65" onClick={onClose} />
        <div className="relative w-full max-w-[1240px] h-[min(94vh,860px)] flex flex-col bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="px-6 pt-4 pb-3 border-b border-[#1c1c1c]">{header}</div>
          {row && draft && (on ? (
            <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr_380px]">
              <div className="min-h-0 overflow-y-auto px-5 pb-4" role="tablist" aria-orientation="vertical">
                {tabGroup("WHAT FANS CAN SEE", shownTabs, true)}
                {tabGroup("SETUP", setupTabs, false)}
              </div>
              <div className="min-h-0 overflow-y-auto px-6 py-4 border-l border-[#1c1c1c]" role="tabpanel">
                {active && (
                  <>
                    <div className="text-xl font-bold text-white">{active.label}</div>
                    {editorFor(active.key)}
                  </>
                )}
              </div>
              <div className="min-h-0 flex flex-col border-l border-[#1c1c1c] bg-[#0a0a0a] px-5 pb-5">
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {linkBlock}
                  {rsvpBlock}
                  {row.fan_page_enabled && !savedRsvp && (
                    <p className="mt-4 text-[14px] leading-snug text-white/45">Switch How fans get in to RSVP, pay at door and press Update to take RSVPs here.</p>
                  )}
                </div>
                <div className="pt-1 border-t border-[#1c1c1c]">{actionsBlock}</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 px-6 pb-6">
              {offNote}
              <div className="max-w-sm">{actionsBlock}</div>
            </div>
          ))}
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
        {row && draft && (on ? (
          <>
            {linkBlock}
            {rsvpBlock}
            <div role="tablist">
              {tabGroup("WHAT FANS CAN SEE", shownTabs, true)}
              {tabGroup("SETUP", setupTabs, false)}
            </div>
            {actionsBlock}
          </>
        ) : (
          <>
            {offNote}
            {actionsBlock}
          </>
        ))}
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
              <FanQrCode url={url} />
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
