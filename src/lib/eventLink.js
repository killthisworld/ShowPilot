// The venue's event link (job 176): one link per event that acts open to read
// the info the venue chose to share and fill in a checklist. Server side is
// supabase/event_link_migration.sql; the public page is pages/EventLink.jsx
// at /v/<code>; the venue's builder is components/showpilot/EventLinkBuilder.jsx.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { dealSummary } from "@/lib/eventBusiness";

export const EVENT_LINK_BUCKET = "stage-plots"; // anonymous uploads are allowed here (storage_anon_upload_migration.sql)

// Types an ask can have. "yesno" answers { value: "yes" | "no", note }.
export const ASK_TYPES = {
  text: { label: "Short answer" },
  longtext: { label: "Paragraph" },
  file: { label: "Upload" },
  yesno: { label: "Yes / no" },
  inputs: { label: "Members and inputs" },
};

// The checklist a venue starts from.
export const DEFAULT_ASKS = [
  { key: "blurb", label: "Band blurb", type: "longtext", required: true, hint: "About 50 words, for the event page" },
  { key: "links", label: "Website and socials", type: "longtext", required: false, hint: "Links" },
  { key: "photo", label: "Hi-res band photo", type: "file", required: true, hint: "Upload" },
  { key: "fb_flyer", label: "Facebook flyer", type: "file", required: true, hint: "1200 × 628 px" },
  { key: "print_flyer", label: "Printed flyer", type: "file", required: false, hint: "11 × 17" },
  { key: "inputs", label: "Input list and stage plot", type: "inputs", required: true, hint: "Who plays what, and where they stand" },
  { key: "house_kit", label: "Using the house kit?", type: "yesno", required: true, hint: "And what you bring" },
  { key: "mailing", label: "Mailing address", type: "text", required: false, hint: "For payment, if needed" },
  { key: "contact", label: "Day-of contact", type: "text", required: true, hint: "Name and phone" },
];

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const line = (label, v) => (has(v) ? `${label}: ${String(v).trim()}` : null);

// The info blocks a venue can share, built from the event. Each is plain text
// the venue can edit before sending; what is sent is that text, not live data.
// `run` is the merged run of show ([{time, label}]), `deal` the event deal.
export function buildBlocks(gig, deal, run = []) {
  const vi = gig.venue_info || {};
  const t = (deal && deal.terms) || {};
  const blocks = [];
  const add = (key, title, lines) => {
    const body = lines.filter(Boolean).join("\n");
    if (body) blocks.push({ key, title, body, on: true });
  };
  add("times", "The day", run.map((r) => `${r.time || "--"}  ${r.label}`));
  add("where", "Address and parking", [
    [gig.venue, vi.address, [gig.city, gig.state].filter(Boolean).join(", ")].filter(has).join(" · "),
    line("Load in", vi.load_in_location), line("Parking", vi.parking), line("Notes", vi.load_in_notes),
  ]);
  add("deal", "The deal", [
    dealSummary(t),
    has(t.door_after) ? `After: ${t.door_after}` : null,
    line("Bonuses", t.bonus), line("Merch", t.merch_split),
    line("Deposit", t.deposit_amount), line("Balance", t.balance_terms), line("Paid by", t.payment_method),
  ]);
  add("gear", "House gear and backline", [
    line("Console", gig.console), line("PA", vi.pa), line("Backline", vi.backline), line("Mics, monitors, lighting", vi.mics_monitors),
  ]);
  add("hospitality", "Hospitality", [
    line("Green room", vi.green_room), line("Meals", vi.meals), line("Drink tickets", vi.drink_tickets), vi.hospitality_notes,
  ]);
  add("power", "Wi-Fi and power", [
    line("Wi-Fi", gig.wifi_network ? `${gig.wifi_network}${gig.wifi_password ? ` / ${gig.wifi_password}` : ""}` : ""), line("Power", gig.power_notes),
  ]);
  return blocks;
}

// The venue's email for sending the link (job 176). Saved once on the
// account (user_preferences.event_link_email), filled in per event.
export const EMAIL_FIELDS = [
  { key: "event", label: "Event name" },
  { key: "date", label: "Date" },
  { key: "venue", label: "Venue" },
  { key: "link", label: "Event link" },
  { key: "name", label: "Your name" },
];
export const DEFAULT_EMAIL = {
  subject: "{event} at {venue}, {date}",
  body: "Hi,\n\nHere's everything for {event} at {venue} on {date}: times, the deal and what we need from you.\n\nOpen this link, read through, and fill in the short form at the bottom:\n{link}\n\nIf anything's unclear, ask right on that page.\n\nThanks,\n{name}",
};
// Fill a template's {placeholders}; the link is always in the body even if
// the template left it out.
export function fillEmail(tpl, vals) {
  const t = { ...DEFAULT_EMAIL, ...(tpl || {}) };
  const fill = (str) => String(str || "").replace(/\{(event|date|venue|link|name)\}/g, (_, k) => vals[k] || "");
  let body = fill(t.body);
  if (vals.link && !body.includes(vals.link)) body = `${body.trimEnd()}\n\n${vals.link}`;
  return { subject: fill(t.subject).trim(), body };
}

export const eventLinkUrl = (code) => `${window.location.origin}/v/${code}`;

// ---------- venue side ----------
export function useEventLink(showId, enabled = true) {
  const [data, setData] = useState(null); // { can_view, link, responses }
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!showId || !enabled) { setData(null); return null; }
    setLoading(true);
    const { data: d, error } = await supabase.rpc("get_event_link_admin", { p_show: showId });
    setLoading(false);
    if (error) { console.error(error); setData({ can_view: false, error: true }); return null; }
    setData(d || { can_view: false });
    return d;
  }, [showId, enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export async function saveEventLink(showId, { blocks, asks, message, remindDays }) {
  const { data, error } = await supabase.rpc("save_event_link", {
    p_show: showId,
    p_blocks: (blocks || []).filter((b) => b.on !== false).map(({ key, title, body }) => ({ key, title, body })),
    p_asks: asks || [],
    p_message: message || "",
    p_remind_days: remindDays ?? null,
  });
  if (error) throw error;
  return data;
}

// Is this ask answered? Used by the venue's grid and the act's checklist.
export function isAnswered(ask, answer) {
  if (answer === undefined || answer === null) return false;
  if (ask.type === "file") return !!(answer && answer.url);
  if (ask.type === "yesno") return answer.value === "yes" || answer.value === "no";
  if (ask.type === "inputs") {
    return (Array.isArray(answer.members) && answer.members.some((m) => has(m.name))) || (answer.files || []).length > 0;
  }
  return has(answer);
}

// ---------- act side (no account) ----------
const tokenKey = (code) => `event_link_resp_${String(code).toUpperCase()}`;
export const getStoredToken = (code) => { try { return localStorage.getItem(tokenKey(code)) || null; } catch { return null; } };
export const storeToken = (code, token) => { try { localStorage.setItem(tokenKey(code), token); } catch {} };

export async function fetchPublicLink(code, token) {
  const { data, error } = await supabase.rpc("get_event_link_public", { p_code: code, p_token: token || null });
  if (error) throw error;
  return data;
}

export async function saveResponse(code, token, actName, answers, submit = false) {
  const { data, error } = await supabase.rpc("save_event_link_response", {
    p_code: code, p_token: token || null, p_act_name: actName || "", p_answers: answers || {}, p_submit: !!submit,
  });
  if (error) throw error;
  if (data?.token) storeToken(code, data.token);
  return data;
}

export async function uploadActFile(code, file) {
  const path = `event_link_${String(code).toUpperCase()}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from(EVENT_LINK_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { url: supabase.storage.from(EVENT_LINK_BUCKET).getPublicUrl(path).data.publicUrl, name: file.name, type: file.type };
}
