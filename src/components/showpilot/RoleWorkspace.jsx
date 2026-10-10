import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import DocumentsUploader from "@/components/showpilot/DocumentsUploader";
import DjLineupPanel from "@/components/showpilot/DjLineupPanel";
import { RequirementsList, ROLE_OPTIONS } from "@/pages/SharedGig";

// Desktop workspace for one company role's section of an event (venue,
// promoter, booking agent, manager/artist), laid out like Fan page
// settings: the section's parts as tabs on the left (ticked when filled
// in), the open part's editor in the middle, and a live summary that
// matters to that role on the right with Save. Works on the same data and
// save as RoleFullProfile's useRoleProfile hook (`p`): new fields live in
// each section's own JSON (promoter_info, booking_agent_info, manager_info)
// and, for the venue, in shows.venue_info.

const G = "#8CFF3D";
const AMBER = "#F59E0B";
const ROLE_COLOR = { venue: "#FB923C", promoter: "#60A5FA", booking_agent: "#D946EF", manager: "#F87171" };
const ROLE_TITLE = { venue: "Venue", promoter: "Promoter", booking_agent: "Booking Agent", manager: "Manager / Artist" };

// ---------- small helpers ----------
const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "");
const countFilled = (vals) => vals.filter(has).length;
const stateOf = (filled, total) => (filled === 0 ? "empty" : filled >= total ? "done" : "partial");
const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—");
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// "3:00 PM", "3pm", "15:00", "9" -> minutes after midnight (null if unreadable).
export function parseTime(s) {
  const m = String(s || "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p)?\.?m?\.?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] || "0", 10);
  if (m[3] === "p" && h < 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  // Show-day times without am/pm: 1-6 are afternoon/evening, not early morning.
  if (!m[3] && h >= 1 && h <= 6) h += 12;
  return h * 60 + min;
}
const sortKey = (t) => {
  const v = parseTime(t);
  if (v === null) return 9999;
  return v < 6 * 60 ? v + 24 * 60 : v; // after midnight sorts last (load-out, curfew)
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
const shortDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const countdown = (dateStr) => {
  const n = daysUntil(dateStr);
  if (n === null) return "";
  if (n < 0) return "DONE";
  if (n === 0) return "TODAY";
  return `${n} DAY${n === 1 ? "" : "S"}`;
};

// Merged times for the day: the venue's schedule plus each act's set time
// from the lineup (manager_info.set_times, keyed by act name).
export function buildRunOfShow(gig) {
  const vi = gig.venue_info || {};
  const mi = gig.manager_info || {};
  const rows = (vi.schedule || [])
    .filter((r) => has(r.time) || has(r.label))
    .map((r) => ({ time: r.time, label: r.label, kind: /curfew/i.test(r.label || "") ? "curfew" : /door/i.test(r.label || "") ? "doors" : "venue" }));
  (gig.bands || []).forEach((b) => {
    const t = (mi.set_times || {})[b.band_name];
    if (b.band_name && has(t)) rows.push({ time: t, label: `${b.band_name}${b.set_length_minutes ? ` · ${b.set_length_minutes} min` : ""}`, kind: "set" });
  });
  if (has(mi.arrival_time)) rows.push({ time: mi.arrival_time, label: "Artist arrives", kind: "travel" });
  return rows.sort((a, b) => sortKey(a.time) - sortKey(b.time));
}

// ---------- form bits ----------
const labelCls = "text-[11px] tracking-[0.12em] text-white/50";
const inputCls =
  "w-full h-10 px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40 disabled:opacity-60";

function In({ label, value, onChange, placeholder, disabled, type = "text", className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>{label.toUpperCase()}</span>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className={inputCls} />
    </label>
  );
}
function Area({ label, value, onChange, placeholder, disabled, rows = 3 }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>{label.toUpperCase()}</span>
      <textarea rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className={`${inputCls} h-auto py-2 resize-none`} />
    </label>
  );
}
function Grid({ cols = 2, children }) {
  return <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{children}</div>;
}
function AddButton({ color, onClick, children, disabled }) {
  if (disabled) return null;
  return (
    <button type="button" onClick={onClick} className="self-start flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[15px] font-bold" style={{ border: `1px dashed ${color}88`, color }}>
      <Plus className="w-4 h-4" /> {children}
    </button>
  );
}
function TableBox({ children }) {
  return <div className="bg-[#111] border border-[#1f1f1f] rounded-xl overflow-hidden divide-y divide-[#1a1a1a]">{children}</div>;
}
function SideLabel({ children, className = "" }) {
  return <div className={`text-[11px] tracking-[0.12em] text-white/45 ${className}`} style={{ fontFamily: SCENE_MONO }}>{children}</div>;
}
function SideRow({ left, right, rightColor, highlight }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-[15px]" style={{ background: highlight ? `${highlight}14` : "#111", border: `1px solid ${highlight ? `${highlight}66` : "#1f1f1f"}` }}>
      <span className="min-w-0 truncate">{left}</span>
      <span className="text-[11.5px] shrink-0" style={{ fontFamily: SCENE_MONO, color: rightColor || "rgba(255,255,255,0.55)" }}>{right}</span>
    </div>
  );
}

// ---------- the workspace ----------
export default function RoleWorkspace({ role, p, onClose, onOpenRole, modal = false }) {
  const color = ROLE_COLOR[role] || G;
  const gig = p.gig;
  const ed = p.editable;
  const off = !ed;
  const [copied, setCopied] = useState("");
  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1600); } catch {}
  };

  // Section data and setters for each role.
  const vi = gig.venue_info || {};
  const setVi = (k, v) => p.update("venue_info", { ...(gig.venue_info || {}), [k]: v });
  const pi = gig.promoter_info || {};
  const setPi = (k, v) => p.updateSection("promoter_info", k, v);
  const bi = gig.booking_agent_info || {};
  const setBi = (k, v) => p.updateSection("booking_agent_info", k, v);
  const mi = gig.manager_info || {};
  const setMi = (k, v) => p.updateSection("manager_info", k, v);

  const reqs = (section) => (gig.requirements || []).filter((r) => r.section === section);
  const requestsTab = (section) => {
    const list = reqs(section);
    const open = list.filter((r) => r.status !== "confirmed").length;
    return {
      key: "requests",
      label: "Requests",
      summary: list.length ? `${list.length} logged · ${open} open` : "Things you need from others",
      state: list.length === 0 ? "empty" : open ? "partial" : "done",
      render: () => (
        <>
          <p className="text-[15px] text-white/55 -mt-2">Each request has its own status. Click a status to move it between requested, confirmed and conflict.</p>
          <RequirementsList requirements={list} editable={ed} onAdd={(name, value) => p.addRequirement(section, name, value)} onUpdateStatus={p.updateRequirementStatus} onDelete={p.deleteRequirement} />
        </>
      ),
    };
  };
  const docsTab = (docs, onChange, folder, summaryNoun = "files") => ({
    key: "documents",
    label: "Documents",
    summary: has(docs) ? `${docs.length} ${docs.length === 1 ? "file" : summaryNoun}` : "Upload contracts, riders, plots",
    state: has(docs) ? "done" : "empty",
    render: () => <DocumentsUploader documents={docs} onChange={onChange} uploadPathPrefix={`gig_docs/${gig.id}/${folder}`} editable={ed} />,
  });

  // ======== VENUE ========
  const venueTabs = () => {
    const schedule = vi.schedule || [];
    const setRow = (i, k, v) => setVi("schedule", schedule.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
    return [
      {
        key: "address", label: "Venue & address",
        summary: [gig.venue, vi.address].filter(Boolean).join(" · ") || "Name and street address",
        state: stateOf(countFilled([gig.venue, gig.city, vi.address]), 3),
        render: () => (
          <>
            <In label="Venue" value={gig.venue} onChange={(v) => p.update("venue", v)} disabled={off} placeholder="Venue name" />
            <In label="Street address" value={vi.address} onChange={(v) => setVi("address", v)} disabled={off} placeholder="1604 8th Ave S" />
            <Grid><In label="City" value={gig.city} onChange={(v) => p.update("city", v)} disabled={off} /><In label="State" value={gig.state} onChange={(v) => p.update("state", v)} disabled={off} /></Grid>
            <Grid><In label="Capacity" value={vi.capacity} onChange={(v) => setVi("capacity", v)} disabled={off} placeholder="250" /><In label="Age policy" value={vi.age_policy} onChange={(v) => setVi("age_policy", v)} disabled={off} placeholder="18+ · 21+ to drink" /></Grid>
          </>
        ),
      },
      {
        key: "load_in", label: "Load-in & parking",
        summary: vi.load_in_location || "Where and how crew load in",
        state: stateOf(countFilled([vi.load_in_location, vi.parking]), 2),
        render: () => (
          <>
            <In label="Load-in point" value={vi.load_in_location} onChange={(v) => setVi("load_in_location", v)} disabled={off} placeholder="Back dock on 8th Ave" />
            <Area label="Parking" value={vi.parking} onChange={(v) => setVi("parking", v)} disabled={off} placeholder="One van spot at the dock, trailers on the street after 6" />
            <Area label="Load-in notes" value={vi.load_in_notes} onChange={(v) => setVi("load_in_notes", v)} disabled={off} placeholder="Stairs, elevator, push distance, who meets the artist" />
          </>
        ),
      },
      {
        key: "schedule", label: "Schedule & curfew",
        summary: schedule.length ? schedule.filter((r) => /door|curfew/i.test(r.label || "")).map((r) => `${r.label} ${r.time}`).join(" · ") || `${schedule.length} times` : "Load-in, doors, curfew",
        state: schedule.length === 0 ? "empty" : schedule.some((r) => /curfew/i.test(r.label || "")) ? "done" : "partial",
        render: () => (
          <>
            <p className="text-[15px] text-white/55 -mt-2">These times go on everyone's day sheet. Artist set times come from the Manager / Artist lineup.</p>
            <TableBox>
              <div className="grid grid-cols-[130px_minmax(0,1fr)_40px] gap-3 px-4 py-2 text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}><span>TIME</span><span>WHAT</span><span /></div>
              {schedule.map((r, i) => (
                <div key={r.id || i} className="grid grid-cols-[130px_minmax(0,1fr)_40px] gap-3 px-4 py-2 items-center">
                  <input value={r.time || ""} onChange={(e) => setRow(i, "time", e.target.value)} disabled={off} placeholder="7:00 PM" className={inputCls} style={{ fontFamily: SCENE_MONO, fontSize: 14 }} aria-label="Time" />
                  <input value={r.label || ""} onChange={(e) => setRow(i, "label", e.target.value)} disabled={off} placeholder="Doors" className={inputCls} aria-label="What happens" />
                  {ed && <button type="button" onClick={() => setVi("schedule", schedule.filter((_, idx) => idx !== i))} aria-label="Remove time" className="p-2 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
              {schedule.length === 0 && <p className="px-4 py-4 text-white/35 text-[15px]">No times yet.</p>}
            </TableBox>
            <div className="flex items-center gap-4 flex-wrap">
              <AddButton color={color} disabled={off} onClick={() => setVi("schedule", [...schedule, { id: uid(), time: "", label: "" }])}>Add a time</AddButton>
              {ed && schedule.length === 0 && (
                <button type="button" onClick={() => setVi("schedule", ["Load-in", "Soundcheck", "Doors", "Curfew"].map((label) => ({ id: uid(), time: "", label })))} className="text-[15px] font-semibold text-white/70 hover:text-white px-3 py-2 rounded-lg border border-[#2a2a2a]">Start with load-in, soundcheck, doors, curfew</button>
              )}
              <label className="flex items-center gap-2.5 text-[15px] text-white/75">
                <input type="checkbox" checked={!!vi.hard_curfew} onChange={(e) => setVi("hard_curfew", e.target.checked)} disabled={off} className="w-[18px] h-[18px]" style={{ accentColor: color }} />
                Hard curfew (the venue is fined if it runs over)
              </label>
            </div>
            <Grid><In label="Load-out by" value={vi.load_out_by} onChange={(v) => setVi("load_out_by", v)} disabled={off} placeholder="12:30 AM" /></Grid>
          </>
        ),
      },
      {
        key: "wifi_power", label: "Wi-Fi & power",
        summary: [gig.wifi_network, gig.power_notes].filter(Boolean).join(" · ") || "Network, password, circuits",
        state: stateOf(countFilled([gig.wifi_network, gig.wifi_password, gig.power_notes]), 3),
        render: () => (
          <>
            <Grid><In label="Wi-Fi network" value={gig.wifi_network} onChange={(v) => p.update("wifi_network", v)} disabled={off} /><In label="Wi-Fi password" value={gig.wifi_password} onChange={(v) => p.update("wifi_password", v)} disabled={off} /></Grid>
            <Area label="Power" value={gig.power_notes} onChange={(v) => p.update("power_notes", v)} disabled={off} placeholder="2 × 20A stage left, shore power for the bus" />
          </>
        ),
      },
      {
        key: "house_gear", label: "House gear",
        summary: [gig.console, vi.pa].filter(Boolean).join(" · ") || "Console, PA, backline",
        state: stateOf(countFilled([gig.console, vi.pa, vi.backline]), 3),
        render: () => (
          <>
            <Grid><In label="Console" value={gig.console} onChange={(v) => p.update("console", v)} disabled={off} placeholder="Yamaha CL5" /><In label="PA" value={vi.pa} onChange={(v) => setVi("pa", v)} disabled={off} placeholder="L-Acoustics Kara, 2 subs a side" /></Grid>
            <Area label="Backline" value={vi.backline} onChange={(v) => setVi("backline", v)} disabled={off} placeholder="House drum kit (shells only), bass amp" />
            <Area label="Mics, monitors and lighting" value={vi.mics_monitors} onChange={(v) => setVi("mics_monitors", v)} disabled={off} placeholder="6 wedges on 4 mixes, 12 SM58s, house LD on request" />
          </>
        ),
      },
      {
        key: "hospitality", label: "Hospitality",
        summary: [vi.green_room, vi.meals].filter(Boolean).join(" · ") || "Green room, meals, drink tickets",
        state: stateOf(countFilled([vi.green_room, vi.meals, vi.drink_tickets]), 3),
        render: () => (
          <>
            <In label="Green room" value={vi.green_room} onChange={(v) => setVi("green_room", v)} disabled={off} placeholder="Upstairs, one room, shower" />
            <Grid><In label="Meals" value={vi.meals} onChange={(v) => setVi("meals", v)} disabled={off} placeholder="Dinner buyout $15 per person" /><In label="Drink tickets" value={vi.drink_tickets} onChange={(v) => setVi("drink_tickets", v)} disabled={off} placeholder="2 per member" /></Grid>
            <Area label="Notes" value={vi.hospitality_notes} onChange={(v) => setVi("hospitality_notes", v)} disabled={off} placeholder="Towels, water on stage, guest wristbands at the box office" />
          </>
        ),
      },
      docsTab(gig.venue_documents, (docs) => p.update("venue_documents", docs), "venue"),
      requestsTab("venue"),
    ];
  };

  const venueSide = () => {
    const run = buildRunOfShow(gig);
    const sheet = [
      `${gig.event_name || gig.band_name || "Show"} · ${gig.date ? shortDate(gig.date) : ""} · ${gig.venue || ""}`.trim(),
      vi.address ? `Address: ${vi.address}${gig.city ? `, ${gig.city}` : ""}` : null,
      vi.load_in_location ? `Load-in: ${vi.load_in_location}` : null,
      vi.parking ? `Parking: ${vi.parking}` : null,
      ...run.map((r) => `${r.time || "--"}  ${r.label}${r.kind === "curfew" && vi.hard_curfew ? " (hard)" : ""}`),
      gig.wifi_network ? `Wi-Fi: ${gig.wifi_network}${gig.wifi_password ? ` / ${gig.wifi_password}` : ""}` : null,
      gig.console ? `House console: ${gig.console}` : null,
    ].filter(Boolean).join("\n");
    return {
      body: (
        <>
          <SideLabel>DAY SHEET · WHAT CREW SEE</SideLabel>
          <div className="bg-[#151515] border border-[#262626] rounded-[10px] p-4 flex flex-col gap-2">
            <div className="text-[22px] font-bold leading-tight">{[gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null, gig.venue].filter(Boolean).join(" · ") || "Your venue"}</div>
            {(vi.load_in_location || vi.parking) && <div className="text-[14px] text-white/55 leading-snug">{[vi.load_in_location && `Load in at ${vi.load_in_location}.`, vi.parking].filter(Boolean).join(" ")}</div>}
            {run.length > 0 ? (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-y-1.5 mt-1 text-[16px]">
                {run.map((r, i) => {
                  const c = r.kind === "curfew" ? "#f87171" : r.kind === "doors" ? color : r.kind === "set" ? ROLE_COLOR.manager : null;
                  return (
                    <React.Fragment key={i}>
                      <span className="text-[13px]" style={{ fontFamily: SCENE_MONO, color: c || "rgba(255,255,255,0.6)" }}>{r.time || "--"}</span>
                      <span style={{ color: c || undefined }}>{r.label}{r.kind === "curfew" && vi.hard_curfew ? " (hard)" : ""}</span>
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <p className="text-[14px] text-white/35">Add times under Schedule & curfew and they show up here.</p>
            )}
            {(gig.wifi_network || gig.console) && <div className="text-[14px] text-white/55 border-t border-dashed border-[#2a2a2a] pt-2">{[gig.wifi_network && `Wi-Fi ${gig.wifi_network}`, gig.console && `House console ${gig.console}`].filter(Boolean).join(" · ")}</div>}
          </div>
          <a href={`/gig/venue?token=${new URLSearchParams(window.location.search).get("token") || ""}`} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#111] border border-[#1f1f1f] text-[15px] text-white/80 hover:text-white">
            Other events at this venue <ChevronRight className="w-4 h-4 text-white/35" />
          </a>
        </>
      ),
      action: { label: copied === "sheet" ? "COPIED" : "COPY DAY SHEET", onClick: () => copy(sheet, "sheet") },
    };
  };

  // ======== PROMOTER ========
  const promoterTabs = () => {
    const tiers = pi.tiers || [];
    const setTier = (i, k, v) => setPi("tiers", tiers.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
    const expenses = pi.expenses || [];
    const setExp = (i, k, v) => setPi("expenses", expenses.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
    const alloc = pi.guest_alloc || {};
    const setAlloc = (k, v) => setPi("guest_alloc", { ...alloc, [k]: v });
    const expTotal = expenses.reduce((a, e) => a + (num(e.amount) || 0), 0);
    return [
      {
        key: "contact", label: "Contact",
        summary: [pi.contact_name, pi.company].filter(Boolean).join(" · ") || "Who runs this show",
        state: stateOf(countFilled([pi.contact_name, pi.contact_phone, pi.contact_email]), 3),
        render: () => (
          <>
            <Grid><In label="Name" value={pi.contact_name} onChange={(v) => setPi("contact_name", v)} disabled={off} /><In label="Company" value={pi.company} onChange={(v) => setPi("company", v)} disabled={off} placeholder="Southbound Presents" /></Grid>
            <Grid><In label="Phone" value={pi.contact_phone} onChange={(v) => setPi("contact_phone", v)} disabled={off} /><In label="Email" value={pi.contact_email} onChange={(v) => setPi("contact_email", v)} disabled={off} /></Grid>
          </>
        ),
      },
      {
        key: "doors", label: "Doors & capacity",
        summary: [pi.door_time && `Doors ${pi.door_time}`, pi.capacity && `Cap ${pi.capacity}`].filter(Boolean).join(" · ") || "Door time and capacity",
        state: stateOf(countFilled([pi.door_time, pi.capacity]), 2),
        render: () => (
          <>
            <Grid><In label="Door time" value={pi.door_time} onChange={(v) => setPi("door_time", v)} disabled={off} placeholder="7:00 PM" /><In label="Capacity" value={pi.capacity} onChange={(v) => setPi("capacity", v)} disabled={off} placeholder="250" /></Grid>
            <Area label="Door notes" value={pi.door_notes} onChange={(v) => setPi("door_notes", v)} disabled={off} placeholder="Will call at the box office, wristbands for 21+" />
          </>
        ),
      },
      {
        key: "tickets", label: "Tickets",
        summary: tiers.length ? `${tiers.length} tier${tiers.length === 1 ? "" : "s"}${pi.ticket_link ? " · link set" : ""}` : pi.ticket_price ? `${pi.ticket_price}` : "Tiers, link, comps",
        state: stateOf(countFilled([tiers.length ? tiers : pi.ticket_price, pi.ticket_link]), 2),
        render: () => (
          <>
            <TableBox>
              <div className="grid grid-cols-[minmax(0,1fr)_100px_90px_90px_40px] gap-3 px-4 py-2 text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}><span>TIER</span><span>PRICE</span><span>QTY</span><span>SOLD</span><span /></div>
              {tiers.map((t, i) => (
                <div key={t.id || i} className="grid grid-cols-[minmax(0,1fr)_100px_90px_90px_40px] gap-3 px-4 py-2 items-center">
                  <input value={t.name || ""} onChange={(e) => setTier(i, "name", e.target.value)} disabled={off} placeholder="Advance" className={inputCls} aria-label="Tier name" />
                  <input value={t.price || ""} onChange={(e) => setTier(i, "price", e.target.value)} disabled={off} placeholder="$20" className={inputCls} aria-label="Price" />
                  <input value={t.qty || ""} onChange={(e) => setTier(i, "qty", e.target.value)} disabled={off} placeholder="120" className={inputCls} aria-label="Quantity" />
                  <input value={t.sold || ""} onChange={(e) => setTier(i, "sold", e.target.value)} disabled={off} placeholder="0" className={inputCls} aria-label="Sold" />
                  {ed && <button type="button" onClick={() => setPi("tiers", tiers.filter((_, idx) => idx !== i))} aria-label="Remove tier" className="p-2 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
              {tiers.length === 0 && <p className="px-4 py-4 text-white/35 text-[15px]">No tiers yet. Add early bird, advance, day of, or a single price.</p>}
            </TableBox>
            <AddButton color={color} disabled={off} onClick={() => setPi("tiers", [...tiers, { id: uid(), name: "", price: "", qty: "", sold: "" }])}>Add a tier</AddButton>
            <Grid cols={3}>
              <In label="Ticket link" value={pi.ticket_link} onChange={(v) => setPi("ticket_link", v)} disabled={off} placeholder="https://" />
              <In label="Headline price" value={pi.ticket_price} onChange={(v) => setPi("ticket_price", v)} disabled={off} placeholder="$20" />
              <In label="Comps held" value={pi.comps} onChange={(v) => setPi("comps", v)} disabled={off} placeholder="12" />
            </Grid>
            <Grid><In label="Break-even (tickets)" value={pi.break_even} onChange={(v) => setPi("break_even", v)} disabled={off} placeholder="160" /><In label="Fees" value={pi.fees} onChange={(v) => setPi("fees", v)} disabled={off} placeholder="Passed to buyer" /></Grid>
          </>
        ),
      },
      {
        key: "marketing", label: "Marketing",
        summary: [pi.announce_date && `Announce ${shortDate(pi.announce_date)}`, pi.on_sale_date && `On sale ${shortDate(pi.on_sale_date)}`].filter(Boolean).join(" · ") || "Announce, on-sale, press",
        state: stateOf(countFilled([pi.announce_date, pi.on_sale_date, pi.marketing_notes]), 3),
        render: () => (
          <>
            <Grid cols={3}>
              <In type="date" label="Announce" value={pi.announce_date} onChange={(v) => setPi("announce_date", v)} disabled={off} />
              <In type="date" label="On sale" value={pi.on_sale_date} onChange={(v) => setPi("on_sale_date", v)} disabled={off} />
              <In type="date" label="Final push" value={pi.final_push_date} onChange={(v) => setPi("final_push_date", v)} disabled={off} />
            </Grid>
            <Area label="Press, assets and links" value={pi.marketing_notes} onChange={(v) => setPi("marketing_notes", v)} disabled={off} placeholder="Need hi-res photo and bio from the artist; radio spot booked" rows={4} />
          </>
        ),
      },
      {
        key: "guests", label: "Guest list allocation",
        summary: ["artist", "venue", "promoter"].filter((k) => has(alloc[k])).map((k) => `${k[0].toUpperCase() + k.slice(1)} ${alloc[k]}`).join(" · ") || "Who gets how many spots",
        state: stateOf(countFilled([alloc.artist, alloc.venue, alloc.promoter]), 3),
        render: () => (
          <>
            <p className="text-[15px] text-white/55 -mt-2">The artist's number shows on their guest list as their limit.</p>
            <Grid cols={3}>
              <In label="Artist" value={alloc.artist} onChange={(v) => setAlloc("artist", v)} disabled={off} placeholder="10" />
              <In label="Venue" value={alloc.venue} onChange={(v) => setAlloc("venue", v)} disabled={off} placeholder="6" />
              <In label="Promoter" value={alloc.promoter} onChange={(v) => setAlloc("promoter", v)} disabled={off} placeholder="4" />
            </Grid>
          </>
        ),
      },
      {
        key: "settlement", label: "Settlement",
        summary: expenses.length ? `${expenses.length} costs · ${money(expTotal)}` : pi.settlement_notes ? "Notes added" : "Costs and the split on the night",
        state: stateOf(countFilled([expenses, pi.settlement_notes]), 2),
        render: () => (
          <>
            <TableBox>
              <div className="grid grid-cols-[minmax(0,1fr)_140px_40px] gap-3 px-4 py-2 text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}><span>SHOW COST</span><span>AMOUNT</span><span /></div>
              {expenses.map((x, i) => (
                <div key={x.id || i} className="grid grid-cols-[minmax(0,1fr)_140px_40px] gap-3 px-4 py-2 items-center">
                  <input value={x.label || ""} onChange={(e) => setExp(i, "label", e.target.value)} disabled={off} placeholder="Sound and lights" className={inputCls} aria-label="Cost" />
                  <input value={x.amount || ""} onChange={(e) => setExp(i, "amount", e.target.value)} disabled={off} placeholder="$400" className={inputCls} aria-label="Amount" />
                  {ed && <button type="button" onClick={() => setPi("expenses", expenses.filter((_, idx) => idx !== i))} aria-label="Remove cost" className="p-2 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
              {expenses.length > 0 && <div className="flex justify-between px-4 py-2.5 text-[16px] font-semibold"><span>Total costs</span><span style={{ fontFamily: SCENE_MONO }}>{money(expTotal)}</span></div>}
            </TableBox>
            <AddButton color={color} disabled={off} onClick={() => setPi("expenses", [...expenses, { id: uid(), label: "", amount: "" }])}>Add a cost</AddButton>
            <Area label="Settlement notes" value={pi.settlement_notes} onChange={(v) => setPi("settlement_notes", v)} disabled={off} placeholder="Cash at end of night, settle with the TM in the office" />
          </>
        ),
      },
      docsTab(pi.documents, (docs) => setPi("documents", docs), "promoter"),
      requestsTab("promoter"),
    ];
  };

  const promoterSide = () => {
    const tiers = pi.tiers || [];
    const sold = tiers.reduce((a, t) => a + (num(t.sold) || 0), 0);
    const gross = tiers.reduce((a, t) => a + (num(t.sold) || 0) * (num(t.price) || 0), 0);
    const cap = num(pi.capacity) || num(vi.capacity);
    const comps = num(pi.comps) || 0;
    const be = num(pi.break_even);
    const pct = cap ? Math.min(100, (sold / cap) * 100) : 0;
    const dates = [
      ["Announce", pi.announce_date], ["On sale", pi.on_sale_date], ["Final push", pi.final_push_date], ["Show", gig.date],
    ].filter(([, d]) => d);
    return {
      body: (
        <>
          <SideLabel>SALES SNAPSHOT</SideLabel>
          <div className="bg-[#151515] border border-[#262626] rounded-[10px] p-4 flex flex-col gap-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] leading-none" style={{ fontFamily: SCENE_MONO, color }}>{sold}</span>
              <span className="text-[17px] text-white/60">{cap ? `of ${cap} sold · ${Math.round(pct)}%` : "sold"}</span>
            </div>
            {cap > 0 && (
              <>
                <div className="relative h-3.5 rounded-full bg-[#1f1f1f] overflow-hidden">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: color }} />
                  <div className="absolute inset-y-0" style={{ left: `${pct}%`, width: `${Math.min(100 - pct, (comps / cap) * 100)}%`, background: `${color}66` }} />
                  {be > 0 && <div className="absolute inset-y-0 w-0.5 bg-[#8CFF3D]" style={{ left: `${Math.min(100, (be / cap) * 100)}%` }} />}
                </div>
                {be > 0 && <div className="text-[13px]" style={{ color: sold >= be ? G : AMBER }}>{sold >= be ? `Past break-even by ${sold - be} tickets.` : `${be - sold} tickets to break even.`}</div>}
              </>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[[money(gross), "gross"], [comps, "comps"], [cap ? Math.max(0, cap - sold - comps) : "—", "left"]].map(([v, l]) => (
                <div key={l} className="bg-[#111] border border-[#1f1f1f] rounded-lg py-2"><div className="text-[17px]" style={{ fontFamily: SCENE_MONO }}>{v}</div><div className="text-[13px] text-white/50">{l}</div></div>
              ))}
            </div>
            {tiers.length === 0 && <p className="text-[13px] text-white/40">Add ticket tiers with what's sold to see sales here.</p>}
          </div>
          <SideLabel className="mt-1">KEY DATES</SideLabel>
          {dates.length ? dates.map(([l, d]) => {
            const n = daysUntil(d);
            return <SideRow key={l} left={`${l} · ${shortDate(d)}`} right={countdown(d)} rightColor={n !== null && n < 0 ? G : n !== null && n <= 7 ? AMBER : undefined} />;
          }) : <p className="text-[14px] text-white/35">Set announce and on-sale dates under Marketing.</p>}
        </>
      ),
      action: pi.ticket_link ? { label: copied === "link" ? "COPIED" : "COPY TICKET LINK", onClick: () => copy(pi.ticket_link, "link") } : null,
    };
  };

  // ======== BOOKING AGENT ========
  const STAGES = [
    ["offer_sent", "Offer sent"], ["accepted", "Offer accepted"], ["contract_sent", "Contract out for signature"], ["signed", "Signed"], ["deposit", "Deposit received"],
  ];
  const DEAL_TYPES = [["flat", "Flat guarantee"], ["vs", "Guarantee vs %"], ["door", "Door split"], ["bonus", "Plus bonus"]];
  const dealSummary = (b) => {
    const g = has(b.guarantee) ? b.guarantee : null;
    const pc = has(b.percent) ? `${String(b.percent).replace(/%$/, "")}%` : null;
    const costs = has(b.costs) ? ` after ${b.costs} costs` : "";
    if (b.deal_type === "flat" && g) return `${g} flat`;
    if (b.deal_type === "vs" && g && pc) return `${g} vs ${pc} of net${costs}`;
    if (b.deal_type === "door" && pc) return `${pc} of the door${costs}`;
    if (b.deal_type === "bonus" && g) return `${g} plus ${b.bonus || "bonus"}`;
    return null;
  };
  const setDeal = (k, v) => {
    const next = { ...bi, [k]: v };
    const s = dealSummary(next);
    p.update("booking_agent_info", s ? { ...next, deal_terms: s } : next);
  };
  const bookingTabs = () => {
    const stageIdx = STAGES.findIndex(([k]) => k === bi.contract_stage);
    const setStage = (k) => {
      const label = STAGES.find(([key]) => key === k)?.[1];
      const dates = { ...(bi.contract_dates || {}) };
      if (!dates[k]) dates[k] = new Date().toISOString().slice(0, 10);
      p.update("booking_agent_info", { ...bi, contract_stage: k, contract_status: label, contract_dates: dates });
    };
    return [
      {
        key: "contact", label: "Contact",
        summary: [bi.contact_name, bi.agency_contact].filter(Boolean).join(" · ") || "Agent and agency",
        state: stateOf(countFilled([bi.contact_name, bi.contact_phone || bi.contact_email, bi.agency_contact]), 3),
        render: () => (
          <>
            <Grid><In label="Agent" value={bi.contact_name} onChange={(v) => setBi("contact_name", v)} disabled={off} /><In label="Agency" value={bi.agency_contact} onChange={(v) => setBi("agency_contact", v)} disabled={off} placeholder="Northstar Agency" /></Grid>
            <Grid><In label="Phone" value={bi.contact_phone} onChange={(v) => setBi("contact_phone", v)} disabled={off} /><In label="Email" value={bi.contact_email} onChange={(v) => setBi("contact_email", v)} disabled={off} /></Grid>
          </>
        ),
      },
      {
        key: "deal", label: "Offer & deal",
        summary: bi.deal_terms || "Guarantee, split, radius",
        state: stateOf(countFilled([bi.deal_type, bi.guarantee || bi.percent, bi.deal_terms]), 3),
        render: () => {
          const price = num((pi.tiers || []).find((t) => has(t.price))?.price) || num(pi.ticket_price);
          const cap = num(pi.capacity) || num(vi.capacity);
          const g = num(bi.guarantee) || 0;
          const pc = (num(bi.percent) || 0) / 100;
          const costs = num(bi.costs) || 0;
          const walk = (n) => {
            const net = Math.max(0, n * price - costs);
            if (bi.deal_type === "flat") return [g, "guarantee"];
            if (bi.deal_type === "door") return [pc * net, "split"];
            if (bi.deal_type === "vs") return pc * net > g ? [pc * net, `${Math.round(pc * 100)}% wins`] : [g, "guarantee wins"];
            return [g, "guarantee"];
          };
          const canCalc = price > 0 && cap > 0 && bi.deal_type;
          return (
            <>
              <div role="radiogroup" aria-label="Deal type" className="grid grid-cols-4 gap-1 p-1 bg-[#111] border border-[#1f1f1f] rounded-[10px]">
                {DEAL_TYPES.map(([k, l]) => {
                  const on = bi.deal_type === k;
                  return <button key={k} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => setDeal("deal_type", k)} className="py-2 rounded-md text-[15px] font-bold" style={{ background: on ? color : "transparent", color: on ? "#0d0d0d" : "rgba(255,255,255,0.6)" }}>{l}</button>;
                })}
              </div>
              <Grid cols={3}>
                <In label="Guarantee" value={bi.guarantee} onChange={(v) => setDeal("guarantee", v)} disabled={off} placeholder="$1,500" />
                <In label={bi.deal_type === "bonus" ? "Bonus" : "Percentage"} value={bi.deal_type === "bonus" ? bi.bonus : bi.percent} onChange={(v) => setDeal(bi.deal_type === "bonus" ? "bonus" : "percent", v)} disabled={off} placeholder={bi.deal_type === "bonus" ? "$250 at sell-out" : "70"} />
                <In label="Show costs" value={bi.costs} onChange={(v) => setDeal("costs", v)} disabled={off} placeholder="$900" />
                <In label="Radius clause" value={bi.radius} onChange={(v) => setBi("radius", v)} disabled={off} placeholder="60 miles · 45 days" />
                <In label="Merch split" value={bi.merch_split} onChange={(v) => setBi("merch_split", v)} disabled={off} placeholder="85 / 15 soft goods" />
                <In label="Deal terms" value={bi.deal_terms} onChange={(v) => setBi("deal_terms", v)} disabled={off} placeholder="Filled in from the fields above" />
              </Grid>
              {canCalc && (
                <div className="bg-[#111] border border-[#1f1f1f] rounded-xl px-4 py-3">
                  <div className={labelCls} style={{ fontFamily: SCENE_MONO }}>WHAT THE ARTIST WALKS WITH · {money(price)} TICKETS, CAP {cap}</div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {[Math.round(cap * 0.6), Math.round(cap * 0.8), cap].map((n, i) => {
                      const [v, why] = walk(n);
                      return (
                        <div key={n}>
                          <div className="text-[14px] text-white/50">{i === 2 ? `Sell out (${n})` : `If ${n} sell`}</div>
                          <div className="text-[20px]" style={{ fontFamily: SCENE_MONO, color: i === 2 ? color : undefined }}>{money(v)}</div>
                          <div className="text-[13px] text-white/45">{why}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!canCalc && <p className="text-[14px] text-white/40">Pick a deal type; once the promoter adds capacity and a ticket price, this shows what the artist walks with at different crowd sizes.</p>}
            </>
          );
        },
      },
      {
        key: "holds", label: "Holds",
        summary: [bi.hold_level, bi.confirm_by && `confirm by ${shortDate(bi.confirm_by)}`].filter(Boolean).join(" · ") || "Hold and confirm-by date",
        state: stateOf(countFilled([bi.hold_level, bi.confirm_by]), 2),
        render: () => (
          <>
            <div role="radiogroup" aria-label="Hold" className="grid grid-cols-4 gap-1 p-1 bg-[#111] border border-[#1f1f1f] rounded-[10px]">
              {["1st hold", "2nd hold", "3rd hold", "Confirmed"].map((l) => {
                const on = bi.hold_level === l;
                return <button key={l} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => setBi("hold_level", l)} className="py-2 rounded-md text-[15px] font-bold" style={{ background: on ? color : "transparent", color: on ? "#0d0d0d" : "rgba(255,255,255,0.6)" }}>{l}</button>;
              })}
            </div>
            <Grid><In type="date" label="Confirm by" value={bi.confirm_by} onChange={(v) => setBi("confirm_by", v)} disabled={off} /></Grid>
            <Area label="Other holds and routing" value={bi.holds_notes} onChange={(v) => setBi("holds_notes", v)} disabled={off} placeholder="Oct 31 Atlanta confirmed, Nov 2 Louisville 2nd hold" />
          </>
        ),
      },
      {
        key: "contract", label: "Contract",
        summary: stageIdx >= 0 ? STAGES[stageIdx][1] : bi.contract_status || "Where the paperwork stands",
        state: stageIdx >= 3 ? "done" : stageIdx >= 0 || has(bi.contract_status) ? "partial" : "empty",
        render: () => (
          <>
            <p className="text-[15px] text-white/55 -mt-2">Click the step the deal has reached. Today's date is noted on each step.</p>
            <div className="flex flex-col gap-2">
              {STAGES.map(([k, l], i) => {
                const done = i <= stageIdx;
                return (
                  <button key={k} type="button" disabled={off} onClick={() => setStage(k)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left" style={{ background: i === stageIdx ? `${color}14` : "#111", border: `1px solid ${i === stageIdx ? `${color}88` : "#1f1f1f"}` }}>
                    <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ background: done ? G : "transparent", border: done ? "none" : "2px solid #3a3a3a" }}>{done && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3} />}</span>
                    <span className="flex-1 text-[17px] font-semibold">{l}</span>
                    <span className="text-[12px] text-white/45" style={{ fontFamily: SCENE_MONO }}>{(bi.contract_dates || {})[k] ? shortDate(bi.contract_dates[k]).toUpperCase() : ""}</span>
                  </button>
                );
              })}
            </div>
          </>
        ),
      },
      {
        key: "deposit", label: "Deposit & payments",
        summary: [bi.deposit_amount, bi.deposit_due && `due ${shortDate(bi.deposit_due)}`, bi.deposit_received && "received"].filter(Boolean).join(" · ") || "Deposit and balance",
        state: bi.deposit_received ? "done" : stateOf(countFilled([bi.deposit_amount, bi.deposit_due]), 3),
        render: () => (
          <>
            <Grid><In label="Deposit" value={bi.deposit_amount} onChange={(v) => setBi("deposit_amount", v)} disabled={off} placeholder="$750 (50%)" /><In type="date" label="Due" value={bi.deposit_due} onChange={(v) => setBi("deposit_due", v)} disabled={off} /></Grid>
            <label className="flex items-center gap-2.5 text-[16px] text-white/80">
              <input type="checkbox" checked={!!bi.deposit_received} onChange={(e) => setBi("deposit_received", e.target.checked)} disabled={off} className="w-[18px] h-[18px]" style={{ accentColor: color }} />
              Deposit received
            </label>
            <Area label="Balance and payment notes" value={bi.balance_notes} onChange={(v) => setBi("balance_notes", v)} disabled={off} placeholder="Balance in cash at settlement" />
          </>
        ),
      },
      docsTab(bi.documents, (docs) => setBi("documents", docs), "booking_agent"),
      requestsTab("booking_agent"),
    ];
  };

  const bookingSide = () => {
    const stageIdx = STAGES.findIndex(([k]) => k === bi.contract_stage);
    const deadlines = [["Confirm hold", bi.confirm_by], ["Deposit", bi.deposit_received ? null : bi.deposit_due], ["Show", gig.date]].filter(([, d]) => d);
    const summary = [
      `${gig.event_name || gig.band_name || "Show"} · ${gig.date ? shortDate(gig.date) : ""} · ${gig.venue || ""}`,
      bi.deal_terms && `Deal: ${bi.deal_terms}`,
      bi.radius && `Radius: ${bi.radius}`,
      bi.merch_split && `Merch: ${bi.merch_split}`,
      bi.deposit_amount && `Deposit: ${bi.deposit_amount}${bi.deposit_due ? ` due ${shortDate(bi.deposit_due)}` : ""}`,
      stageIdx >= 0 && `Status: ${STAGES[stageIdx][1]}`,
    ].filter(Boolean).join("\n");
    return {
      body: (
        <>
          <SideLabel>DEAL PIPELINE</SideLabel>
          <ol className="flex flex-col">
            {STAGES.map(([k, l], i) => {
              const done = i < stageIdx || (i === stageIdx && i === STAGES.length - 1);
              const cur = i === stageIdx && !done;
              return (
                <li key={k} className="flex gap-3 items-start">
                  <span className="flex flex-col items-center">
                    <span className="w-5 h-5 rounded-full box-border" style={{ background: done || (i <= stageIdx && !cur) ? G : "transparent", border: cur ? `3px solid ${color}` : done || i <= stageIdx ? "none" : "2px solid #3a3a3a" }} />
                    {i < STAGES.length - 1 && <span className="w-0.5 h-7" style={{ background: i < stageIdx ? G : "#2a2a2a" }} />}
                  </span>
                  <span>
                    <span className="block text-[17px] font-semibold leading-tight" style={{ color: cur ? color : i <= stageIdx ? "#fff" : "rgba(255,255,255,0.5)" }}>{l}</span>
                    {(bi.contract_dates || {})[k] && <span className="block text-[13px] text-white/45">{shortDate(bi.contract_dates[k])}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <SideLabel className="mt-1">DEADLINES</SideLabel>
          {deadlines.length ? deadlines.map(([l, d]) => {
            const n = daysUntil(d);
            const warn = n !== null && n >= 0 && n <= 7;
            return <SideRow key={l} left={`${l} · ${shortDate(d)}`} right={countdown(d)} rightColor={warn ? AMBER : undefined} highlight={warn ? AMBER : null} />;
          }) : <p className="text-[14px] text-white/35">Add a confirm-by date and deposit due date.</p>}
        </>
      ),
      action: { label: copied === "deal" ? "COPIED" : "COPY DEAL SUMMARY", onClick: () => copy(summary, "deal") },
    };
  };

  // ======== MANAGER / ARTIST ========
  const DEFAULT_CHECKLIST = [
    ["Load-in time and dock", "Venue"], ["Soundcheck slot", "Venue"], ["Input list and stage plot sent", "Audio"],
    ["Set time and length", "Promoter"], ["Hospitality rider accepted", "Venue"], ["Parking for van and trailer", "Venue"], ["Settlement contact on the night", "Promoter"],
  ];
  const managerTabs = () => {
    const checklist = mi.checklist || [];
    const setItem = (i, k, v) => setMi("checklist", checklist.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
    const guests = mi.guests || [];
    const setGuests = (list) => p.update("manager_info", { ...mi, guests: list, guest_list: list.filter((g) => g.name).map((g) => (num(g.plus) > 0 ? `${g.name} +${num(g.plus)}` : g.name)).join(", ") });
    const limit = num((pi.guest_alloc || {}).artist);
    const used = guests.reduce((a, g) => a + (g.name ? 1 + (num(g.plus) || 0) : 0), 0);
    const setTimes = mi.set_times || {};
    const doneCount = checklist.filter((c) => c.done).length;
    return [
      {
        key: "contact", label: "Contact",
        summary: [mi.contact_name, mi.contact_title].filter(Boolean).join(" · ") || "Who's running the artist side",
        state: stateOf(countFilled([mi.contact_name, mi.contact_phone, mi.contact_email]), 3),
        render: () => (
          <>
            <Grid><In label="Name" value={mi.contact_name} onChange={(v) => setMi("contact_name", v)} disabled={off} /><In label="Title" value={mi.contact_title} onChange={(v) => setMi("contact_title", v)} disabled={off} placeholder="Manager, tour manager, member" /></Grid>
            <Grid><In label="Phone" value={mi.contact_phone} onChange={(v) => setMi("contact_phone", v)} disabled={off} /><In label="Email" value={mi.contact_email} onChange={(v) => setMi("contact_email", v)} disabled={off} /></Grid>
          </>
        ),
      },
      {
        key: "lineup", label: "Lineup & set times",
        summary: (gig.bands || []).length ? `${gig.bands.length} act${gig.bands.length === 1 ? "" : "s"}${Object.values(setTimes).some(has) ? " · set times in" : ""}` : "Acts, order, set times",
        state: (gig.bands || []).filter((b) => b.band_name).length === 0 ? "empty" : (gig.bands || []).every((b) => !b.band_name || has(setTimes[b.band_name])) ? "done" : "partial",
        render: () => (
          <>
            <p className="text-[15px] text-white/55 -mt-2">Put the acts in playing order. Set times go on the venue's day sheet, your run of show and each artist's set upload page.</p>
            <TableBox>
              {(gig.bands || []).map((b, i) => (
                // Two lines per act so it fits the workspace column at any width:
                // order + name on top, billing / length / start time underneath.
                <div key={i} className="grid grid-cols-[52px_minmax(0,1fr)_36px] gap-x-2 gap-y-2 px-3 py-3 items-center">
                  <div className="flex items-center gap-0.5 row-span-2 self-start pt-1.5">
                    <span className="w-6 text-right text-[18px] font-bold tabular-nums" style={{ color }}>{i + 1}</span>
                    {p.canEdit && (
                      <span className="flex flex-col">
                        <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => { const list = [...gig.bands]; [list[i - 1], list[i]] = [list[i], list[i - 1]]; p.update("bands", list); }} className="p-0.5 text-white/40 hover:text-white disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button type="button" aria-label="Move later" disabled={i === gig.bands.length - 1} onClick={() => { const list = [...gig.bands]; [list[i + 1], list[i]] = [list[i], list[i + 1]]; p.update("bands", list); }} className="p-0.5 text-white/40 hover:text-white disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
                      </span>
                    )}
                  </div>
                  <input value={b.band_name || ""} onChange={(e) => {
                    const old = b.band_name;
                    p.updateBand(i, "band_name", e.target.value);
                    if (old && has(setTimes[old])) { const t = { ...setTimes, [e.target.value]: setTimes[old] }; delete t[old]; setMi("set_times", t); }
                  }} disabled={!p.canEdit} placeholder="Act name" className={`${inputCls} font-semibold`} aria-label="Act name" />
                  {p.canEdit ? <button type="button" onClick={() => p.removeBand(i)} aria-label="Remove act" className="p-2 text-white/30 hover:text-red-400 justify-self-center"><Trash2 className="w-4 h-4" /></button> : <span />}
                  <div className="col-start-2 col-span-2 grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-2">
                    <label className="grid gap-1 min-w-0">
                      <span className="text-[10px] tracking-[0.1em] text-white/40" style={{ fontFamily: SCENE_MONO }}>BILLING</span>
                      <select value={b.role || "N/A"} onChange={(e) => p.updateBand(i, "role", e.target.value)} disabled={!p.canEdit} className={inputCls} aria-label="Billing">
                        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 min-w-0">
                      <span className="text-[10px] tracking-[0.1em] text-white/40" style={{ fontFamily: SCENE_MONO }}>MINUTES</span>
                      <input value={b.set_length_minutes || ""} onChange={(e) => p.updateBand(i, "set_length_minutes", e.target.value.replace(/[^0-9]/g, ""))} disabled={!p.canEdit} placeholder="45" inputMode="numeric" className={inputCls} aria-label="Set length in minutes" />
                    </label>
                    <label className="grid gap-1 min-w-0">
                      <span className="text-[10px] tracking-[0.1em] text-white/40" style={{ fontFamily: SCENE_MONO }}>ON AT</span>
                      <input value={setTimes[b.band_name] || ""} onChange={(e) => setMi("set_times", { ...setTimes, [b.band_name]: e.target.value })} disabled={off || !b.band_name} placeholder="9:00 PM" className={inputCls} aria-label="Set time" />
                    </label>
                  </div>
                </div>
              ))}
              {(gig.bands || []).length === 0 && <p className="px-4 py-4 text-white/35 text-[15px]">No acts yet.</p>}
            </TableBox>
            <AddButton color={color} disabled={!p.canEdit} onClick={p.addBand}>Add an act</AddButton>
            <p className="text-[13px] text-white/40">Members, stage plots and FX notes for each act stay on the phone lineup view and the act's own intake link. Press Save to keep a new order.</p>
            {gig.id && <DjLineupPanel gig={gig} setTimes={setTimes} color={color} canEdit={p.canEdit} />}
          </>
        ),
      },
      {
        key: "advance", label: "Advance checklist",
        summary: checklist.length ? `${doneCount} of ${checklist.length} confirmed` : "What's been confirmed with whom",
        state: checklist.length === 0 ? "empty" : doneCount === checklist.length ? "done" : "partial",
        render: () => (
          <>
            <p className="text-[15px] text-white/55 -mt-2">Tick each item once the other side confirms it.</p>
            <TableBox>
              {checklist.map((c, i) => (
                <div key={c.id || i} className="grid grid-cols-[28px_minmax(0,1fr)_130px_40px] gap-3 px-4 py-2 items-center" style={{ background: c.done ? "transparent" : "rgba(245,158,11,0.04)" }}>
                  <input type="checkbox" checked={!!c.done} onChange={(e) => setItem(i, "done", e.target.checked)} disabled={off} className="w-[18px] h-[18px]" style={{ accentColor: G }} aria-label={`Confirmed: ${c.label || "item"}`} />
                  <input value={c.label || ""} onChange={(e) => setItem(i, "label", e.target.value)} disabled={off} placeholder="What needs confirming" className={inputCls} aria-label="Checklist item" />
                  <select value={c.who || ""} onChange={(e) => setItem(i, "who", e.target.value)} disabled={off} className={inputCls} aria-label="Who confirms">
                    {["", "Venue", "Promoter", "Booking Agent", "Audio", "Lighting", "Artist"].map((w) => <option key={w} value={w}>{w || "Who"}</option>)}
                  </select>
                  {ed && <button type="button" onClick={() => setMi("checklist", checklist.filter((_, idx) => idx !== i))} aria-label="Remove item" className="p-2 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
              {checklist.length === 0 && <p className="px-4 py-4 text-white/35 text-[15px]">No checklist yet.</p>}
            </TableBox>
            <div className="flex gap-3 flex-wrap">
              <AddButton color={color} disabled={off} onClick={() => setMi("checklist", [...checklist, { id: uid(), label: "", who: "", done: false }])}>Add an item</AddButton>
              {ed && checklist.length === 0 && (
                <button type="button" onClick={() => setMi("checklist", DEFAULT_CHECKLIST.map(([label, who]) => ({ id: uid(), label, who, done: false })))} className="text-[15px] font-semibold text-white/75 hover:text-white px-3.5 py-2 rounded-lg border border-[#2a2a2a]">Start with the usual advance</button>
              )}
            </div>
            <Area label="Advancing notes" value={mi.advancing_notes} onChange={(v) => setMi("advancing_notes", v)} disabled={off} placeholder="Anything else agreed with the venue or promoter" />
          </>
        ),
      },
      {
        key: "travel", label: "Travel & lodging",
        summary: [mi.arrival_time && `Arrive ${mi.arrival_time}`, mi.hotel].filter(Boolean).join(" · ") || "Arrival, hotel, parking",
        state: stateOf(countFilled([mi.arrival_time, mi.hotel, mi.vehicle]), 3),
        render: () => (
          <>
            <Grid><In label="Arrival time" value={mi.arrival_time} onChange={(v) => setMi("arrival_time", v)} disabled={off} placeholder="2:30 PM" /><In label="Vehicle" value={mi.vehicle} onChange={(v) => setMi("vehicle", v)} disabled={off} placeholder="Sprinter van + 6x12 trailer" /></Grid>
            <In label="Hotel" value={mi.hotel} onChange={(v) => setMi("hotel", v)} disabled={off} placeholder="Hotel name, address, confirmation #" />
            <Area label="Travel notes" value={mi.travel_notes} onChange={(v) => setMi("travel_notes", v)} disabled={off} placeholder="Flights, drive time from the last city, day after" />
          </>
        ),
      },
      {
        key: "guests", label: "Guest list",
        summary: guests.length ? `${used}${limit ? ` of ${limit}` : ""} spots used` : mi.guest_list || "Names for the door",
        state: guests.length || has(mi.guest_list) ? "done" : "empty",
        render: () => (
          <>
            <p className="text-[15px] text-white/55 -mt-2">{limit ? `The promoter gave the artist ${limit} spots. ${used} used so far.` : "The promoter can set how many spots the artist gets under their Guest list allocation."}</p>
            <TableBox>
              {guests.map((g, i) => (
                <div key={g.id || i} className="grid grid-cols-[minmax(0,1fr)_90px_40px] gap-3 px-4 py-2 items-center">
                  <input value={g.name || ""} onChange={(e) => setGuests(guests.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} disabled={off} placeholder="Name" className={inputCls} aria-label="Guest name" />
                  <input value={g.plus || ""} onChange={(e) => setGuests(guests.map((x, idx) => (idx === i ? { ...x, plus: e.target.value.replace(/[^0-9]/g, "") } : x)))} disabled={off} placeholder="+0" className={inputCls} aria-label="Plus ones" />
                  {ed && <button type="button" onClick={() => setGuests(guests.filter((_, idx) => idx !== i))} aria-label="Remove guest" className="p-2 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
              {guests.length === 0 && <p className="px-4 py-4 text-white/35 text-[15px]">{mi.guest_list ? `Current list: ${mi.guest_list}` : "No guests yet."}</p>}
            </TableBox>
            <AddButton color={color} disabled={off || (limit > 0 && used >= limit)} onClick={() => setGuests([...guests, { id: uid(), name: "", plus: "" }])}>Add a guest</AddButton>
          </>
        ),
      },
      {
        key: "merch", label: "Merch",
        summary: [mi.merch_table, mi.merch_seller].filter(Boolean).join(" · ") || "Table, seller, split",
        state: stateOf(countFilled([mi.merch_table, mi.merch_seller, mi.merch_split]), 3),
        render: () => (
          <>
            <Grid><In label="Table" value={mi.merch_table} onChange={(v) => setMi("merch_table", v)} disabled={off} placeholder="By the bar, 6ft table + power" /><In label="Seller" value={mi.merch_seller} onChange={(v) => setMi("merch_seller", v)} disabled={off} placeholder="Artist sells / venue seller" /></Grid>
            <Grid><In label="Split" value={mi.merch_split} onChange={(v) => setMi("merch_split", v)} disabled={off} placeholder="85 / 15 soft goods" /></Grid>
            <Area label="Merch notes" value={mi.merch_notes} onChange={(v) => setMi("merch_notes", v)} disabled={off} placeholder="Card reader, count-in and count-out times" />
          </>
        ),
      },
      docsTab(mi.documents, (docs) => setMi("documents", docs), "manager"),
      requestsTab("manager"),
    ];
  };

  const managerSide = () => {
    const run = buildRunOfShow(gig);
    const waiting = {};
    (mi.checklist || []).filter((c) => !c.done && c.label).forEach((c) => { const w = c.who || "Unassigned"; waiting[w] = (waiting[w] || 0) + 1; });
    const text = [`${gig.event_name || gig.band_name || "Show"} · ${gig.date ? shortDate(gig.date) : ""} · ${gig.venue || ""}`, ...run.map((r) => `${r.time || "--"}  ${r.label}`)].join("\n");
    return {
      body: (
        <>
          <SideLabel>RUN OF SHOW{gig.date ? ` · ${shortDate(gig.date).toUpperCase()}` : ""}</SideLabel>
          <div className="bg-[#151515] border border-[#262626] rounded-[10px] p-4">
            {run.length ? (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-y-2 text-[16px]">
                {run.map((r, i) => (
                  <React.Fragment key={i}>
                    <span className="text-[13px]" style={{ fontFamily: SCENE_MONO, color: r.kind === "set" ? color : "rgba(255,255,255,0.55)" }}>{r.time || "--"}</span>
                    <span style={{ color: r.kind === "set" ? color : undefined, fontWeight: r.kind === "set" ? 700 : 400 }}>{r.label}</span>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-white/40">Set times, your arrival and the venue's schedule show up here as they're filled in.</p>
            )}
          </div>
          <SideLabel className="mt-1">STILL WAITING ON</SideLabel>
          {Object.keys(waiting).length ? Object.entries(waiting).map(([w, n]) => <SideRow key={w} left={`${w} · ${n} item${n === 1 ? "" : "s"}`} right="OPEN" rightColor={AMBER} />) : <p className="text-[14px] text-white/35">{(mi.checklist || []).length ? "Everything on the checklist is confirmed." : "Start the advance checklist to track who you're waiting on."}</p>}
        </>
      ),
      action: run.length ? { label: copied === "run" ? "COPIED" : "COPY RUN OF SHOW", onClick: () => copy(text, "run") } : null,
    };
  };

  const builders = { venue: venueTabs, promoter: promoterTabs, booking_agent: bookingTabs, manager: managerTabs };
  const tabs = useMemo(
    () => {
      const list = builders[role]();
      // Owner-assigned to-dos for this section sit at the top, ahead of the
      // section's own parts, so the holder sees them first.
      const myTasks = (gig.tasks || []).filter((t) => t.section === role);
      const open = myTasks.filter((t) => t.status !== "done");
      return [
        {
          key: "tasks",
          label: "Your tasks",
          summary: myTasks.length ? `${open.length} open · ${myTasks.length - open.length} done` : "Nothing assigned yet",
          state: myTasks.length === 0 ? "empty" : open.length ? "partial" : "done",
          render: () => <TaskList tasks={myTasks} editable={ed} onToggle={p.setTaskDone} color={color} />,
        },
        ...list,
      ];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, gig, ed, p.canEdit]
  );
  const [active, setActive] = useState(null);
  const current = tabs.find((t) => t.key === active) || tabs.find((t) => t.key === "tasks" && t.state === "partial") || tabs[1] || tabs[0];
  const side = role === "venue" ? venueSide() : role === "promoter" ? promoterSide() : role === "booking_agent" ? bookingSide() : managerSide();
  const counted = (list) => list.filter((t) => t.key !== "requests" && t.key !== "tasks");
  const doneTabs = counted(tabs).filter((t) => t.state === "done").length;
  const totalTabs = counted(tabs).length;
  const dateLabel = gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

  // The other company sections on this event, as simple progress lines.
  const included = (r) => !gig.included_sections || gig.included_sections.includes(r);
  const others = COMPANY_ROLES.filter((r) => r !== role && included(r)).map((r) => {
    const parts = counted(builders[r]());
    const openReqs = (gig.requirements || []).filter((q) => q.section === r && q.status !== "confirmed").length;
    return { role: r, done: parts.filter((t) => t.state === "done").length, total: parts.length, openReqs, mine: !!p.canEditSection?.(r) };
  });
  // Everything that's waiting on the person looking: open tasks the owner
  // pointed at any section they hold.
  const mySections = [...COMPANY_ROLES, "engineer"].filter((r) => p.canEditSection?.(r));
  const neededFromMe = (gig.tasks || []).filter((t) => t.status !== "done" && mySections.includes(t.section));

  const header = (
    <header className="h-[72px] shrink-0 flex items-center gap-4 px-7 border-b border-[#1a1a1a]">
      <button type="button" onClick={onClose} className="flex items-center gap-1.5 text-[15px] font-semibold text-white/55 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> {modal ? "Back to board" : "Event board"}
      </button>
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
      <h1 className="text-[32px] font-bold tracking-wide leading-none whitespace-nowrap">{ROLE_TITLE[role]}</h1>
      <span className="text-[12px] tracking-[0.08em] text-white/55 border border-[#262626] rounded-md px-2.5 py-1.5 truncate uppercase" style={{ fontFamily: SCENE_MONO }}>
        {[gig.event_name || gig.band_name, dateLabel, gig.venue].filter(Boolean).join(" · ")}
      </span>
      <div className="ml-auto flex items-center gap-3.5 shrink-0">
        <span className="text-[12px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color }}>{doneTabs} OF {totalTabs} FILLED IN</span>
        <div className="w-[150px] h-2 rounded bg-[#1f1f1f] overflow-hidden"><div className="h-full" style={{ width: `${totalTabs ? (doneTabs / totalTabs) * 100 : 0}%`, background: color }} /></div>
      </div>
    </header>
  );

  const otherSections = others.length > 0 && (
    <>
      <SideLabel className="mt-5 mb-1.5">OTHER SECTIONS</SideLabel>
      <div className="bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden divide-y divide-[#1c1c1c]">
        {others.map((o) => (
          <button key={o.role} type="button" onClick={() => onOpenRole?.(o.role)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-white/[0.03]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ROLE_COLOR[o.role] }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-tight truncate">{ROLE_TITLE[o.role]}{o.mine && !p.permissions?.is_owner ? " · yours" : ""}</span>
              <span className="block text-[12.5px] leading-tight truncate mt-0.5 text-white/42" style={{ color: "rgba(255,255,255,0.42)" }}>
                {o.done} of {o.total} filled in{o.openReqs ? ` · ${o.openReqs} open request${o.openReqs === 1 ? "" : "s"}` : ""}
              </span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 text-white/20" />
          </button>
        ))}
      </div>
    </>
  );

  // Someone else's section: just where they're at and what's needed from
  // the viewer - not their working details.
  if (!ed) {
    const sectionTasks = (gig.tasks || []).filter((t) => t.section === role);
    const theirOpenReqs = reqs(role).filter((q) => q.status !== "confirmed");
    return (
      <Shell modal={modal} onClose={onClose}>
        {header}
        <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-[#1c1c1c] px-5 py-4">
            {mySections.filter((r) => COMPANY_ROLES.includes(r)).length > 0 && (
              <>
                <SideLabel className="mb-1.5">YOUR SECTION{mySections.length > 1 ? "S" : ""}</SideLabel>
                <div className="flex flex-col gap-2">
                  {mySections.filter((r) => COMPANY_ROLES.includes(r)).map((r) => (
                    <button key={r} type="button" onClick={() => onOpenRole?.(r)} className="py-2.5 rounded-[10px] text-[15px] font-bold tracking-[0.04em]" style={{ border: `1px solid ${ROLE_COLOR[r]}73`, background: `${ROLE_COLOR[r]}1a`, color: ROLE_COLOR[r] }}>
                      OPEN {ROLE_TITLE[r].toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
            {otherSections}
          </div>
          <div className="min-h-0 overflow-y-auto px-8 py-6">
            <div className="max-w-[760px] flex flex-col gap-6">
              {!p.user && (
                <p className="text-[15px] text-white/55 bg-[#111] border border-[#1f1f1f] rounded-[10px] px-4 py-3">Sign in to see what's needed from you and to open your own section.</p>
              )}
              <section>
                <SideLabel className="mb-2">NEEDED FROM YOU</SideLabel>
                {neededFromMe.length ? (
                  <TaskList tasks={neededFromMe} editable onToggle={p.setTaskDone} color={G} showSection />
                ) : (
                  <p className="text-[15px] text-white/40">Nothing waiting on you right now.</p>
                )}
              </section>
              <section>
                <SideLabel className="mb-2">WHERE {ROLE_TITLE[role].toUpperCase()} IS AT</SideLabel>
                <div className="bg-[#111] border border-[#1f1f1f] rounded-[10px] divide-y divide-[#1c1c1c]">
                  {counted(tabs).map((t) => (
                    <div key={t.key} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center" style={{ background: t.state === "done" ? G : "transparent", border: t.state === "done" ? "none" : `1px solid ${t.state === "partial" ? AMBER : "#3a3a3a"}` }}>
                        {t.state === "done" && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.2} />}
                      </span>
                      <span className="flex-1 text-[16px] font-semibold">{t.label}</span>
                      <span className="text-[12px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color: t.state === "done" ? G : t.state === "partial" ? AMBER : "rgba(255,255,255,0.35)" }}>
                        {t.state === "done" ? "DONE" : t.state === "partial" ? "IN PROGRESS" : "NOT STARTED"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              {(theirOpenReqs.length > 0 || sectionTasks.some((t) => t.status !== "done")) && (
                <section>
                  <SideLabel className="mb-2">{ROLE_TITLE[role].toUpperCase()} IS WAITING ON</SideLabel>
                  <div className="flex flex-col gap-1.5">
                    {theirOpenReqs.map((q) => <SideRow key={q.id} left={q.name} right={(q.status || "requested").toUpperCase()} rightColor={q.status === "conflict" ? "#F87171" : AMBER} />)}
                    {sectionTasks.filter((t) => t.status !== "done").map((t) => <SideRow key={t.id} left={t.title} right="TASK" rightColor={AMBER} />)}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell modal={modal} onClose={onClose}>
      {header}

      <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_380px]">
        <div role="tablist" aria-orientation="vertical" className="min-h-0 overflow-y-auto border-r border-[#1c1c1c] px-5 py-4">
          <SideLabel className="mb-1.5">YOUR SECTION</SideLabel>
          <div className="bg-[#111] border border-[#1f1f1f] rounded-[10px] overflow-hidden divide-y divide-[#1c1c1c]">
            {tabs.map((t) => {
              const on = current?.key === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(t.key)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
                  style={{ background: on ? `${color}14` : "transparent", boxShadow: on ? `inset 3px 0 0 ${color}` : "none" }}
                >
                  <span
                    className="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center"
                    style={{ background: t.state === "done" ? G : "transparent", border: t.state === "done" ? "none" : `1px solid ${t.state === "partial" ? AMBER : "#3a3a3a"}` }}
                    aria-label={t.state === "done" ? "Filled in" : t.state === "partial" ? "Partly filled in" : "Not started"}
                  >
                    {t.state === "done" && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.2} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold leading-tight truncate" style={{ color: t.state === "empty" ? "rgba(255,255,255,0.65)" : "#fff" }}>{t.label}</span>
                    <span className="block text-[12.5px] leading-tight truncate mt-0.5" style={{ color: t.state === "partial" ? AMBER : "rgba(255,255,255,0.42)" }}>{t.summary}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: on ? color : "rgba(255,255,255,0.2)" }} />
                </button>
              );
            })}
          </div>
          {otherSections}
        </div>

        <div role="tabpanel" className="min-h-0 overflow-y-auto px-7 py-5 flex flex-col gap-4">
          <h2 className="text-[28px] font-bold leading-none">{current?.label}</h2>
          {current?.render()}
        </div>

        <aside className="min-h-0 flex flex-col border-l border-[#1c1c1c] bg-[#0a0a0a]">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-3 flex flex-col gap-3">{side.body}</div>
          <div className="shrink-0 px-5 pt-3 pb-5 border-t border-[#1c1c1c] flex flex-col gap-2.5">
            {side.action && (
              <button type="button" onClick={side.action.onClick} className="py-3 rounded-[10px] text-[16px] font-bold tracking-[0.06em]" style={{ border: `1px solid ${color}73`, background: `${color}1a`, color }}>
                {side.action.label}
              </button>
            )}
            <button type="button" onClick={p.handleSave} disabled={p.saving} className="py-3 rounded-[10px] text-[16px] font-bold tracking-[0.06em] disabled:opacity-60" style={{ background: G, color: "#0d0d0d", boxShadow: "0 0 16px rgba(140,255,61,0.3)" }}>
              {p.saved ? "SAVED ✓" : p.saving ? "SAVING..." : "SAVE"}
            </button>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

// Full page (its own window) or a pop-up over Gig Web, like the Fan page
// editor: dimmed backdrop, rounded panel, click outside or Esc to go back.
function Shell({ modal, onClose, children }) {
  useEffect(() => {
    if (!modal) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, onClose]);
  if (!modal) {
    return <div className="h-screen flex flex-col bg-[#0d0d0d] text-white" style={{ fontFamily: SCENE_FONT }}>{children}</div>;
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ fontFamily: SCENE_FONT }}>
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-[1320px] h-[min(94vh,880px)] flex flex-col bg-[#0d0d0d] text-white border border-[#2a2a2a] rounded-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

const COMPANY_ROLES = ["venue", "promoter", "booking_agent", "manager"];
const SECTION_NAME = { venue: "Venue", promoter: "Promoter", booking_agent: "Booking Agent", manager: "Manager / Artist", engineer: "Audio / Lighting" };

// Owner-assigned to-dos (gig_tasks). The section holder ticks them off;
// set_gig_task_status does its own permission check.
function TaskList({ tasks, editable, onToggle, color, showSection = false }) {
  if (!tasks.length) return <p className="text-[15px] text-white/40">The event owner hasn't assigned anything to this section yet.</p>;
  const sorted = [...tasks].sort((a, b) => (a.status === "done") - (b.status === "done"));
  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-[10px] divide-y divide-[#1c1c1c]">
      {sorted.map((t) => {
        const done = t.status === "done";
        return (
          <label key={t.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer">
            <input type="checkbox" className="sr-only" checked={done} disabled={!editable} onChange={() => onToggle?.(t.id, !done)} />
            <span className="w-[20px] h-[20px] rounded-[5px] shrink-0 flex items-center justify-center" style={{ background: done ? color : "transparent", border: done ? "none" : "1px solid #3a3a3a" }}>
              {done && <Check className="w-3.5 h-3.5 text-[#0d0d0d]" strokeWidth={3.2} />}
            </span>
            <span className={`flex-1 text-[16px] ${done ? "line-through text-white/35" : ""}`}>{t.title}</span>
            {showSection && <span className="text-[11.5px] tracking-[0.08em] text-white/40 uppercase" style={{ fontFamily: SCENE_MONO }}>{SECTION_NAME[t.section] || t.section}</span>}
          </label>
        );
      })}
    </div>
  );
}
