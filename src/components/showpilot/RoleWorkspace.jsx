import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, Plus, Save, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import LoadTemplateButton from "@/components/showpilot/LoadTemplateButton";
import { TEMPLATE_TABS, templateFromGig, applyTemplate, suggestTemplateName } from "@/lib/roleTemplates";
import { artistFromTemplate } from "@/lib/showTemplates";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import DocumentsUploader from "@/components/showpilot/DocumentsUploader";
import { SECTION_OF } from "@/lib/eventRoles";
import ProfileWeb from "@/components/showpilot/ProfileWeb";
import TaskSheet, { claimText } from "@/components/showpilot/TaskSheet";
import { RequirementsList, ROLE_OPTIONS, BandDetails } from "@/pages/SharedGig";
import EventPaperwork, { paperworkState, paperworkSummary } from "@/components/showpilot/EventPaperwork";
import { useEventBusiness } from "@/lib/eventBusiness";
import VenuePhoto from "@/components/showpilot/VenuePhoto";
import SectionPhotoButton from "@/components/showpilot/SectionPhotoButton";
import { sectionPhoto, ownSectionPhoto } from "@/lib/sectionPhotos";

// Desktop workspace for one company role's section of an event (venue,
// manager/artist), laid out like Fan page
// settings: the section's parts as tabs on the left (ticked when filled
// in), the open part's editor in the middle, and a live summary that
// matters to that role on the right with Save. Works on the same data and
// save as RoleFullProfile's useRoleProfile hook (`p`): new fields live in
// each section's own JSON (venue_info, manager_info)
// and, for the venue, in shows.venue_info.

const G = "#8CFF3D";
const AMBER = "#FF6A00";
const ROLE_COLOR = { venue: "#60A5FA", manager: "#F87171", band: "#F87171", engineer: "#8CFF3D", lighting: "#8CFF3D" };
const ROLE_TITLE = { venue: "Venue", manager: "Manager", band: "Artist", engineer: "Audio", lighting: "Lighting" };

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
  return <div className="bg-[#111] border border-[#1f1f1f] rounded-xl overflow-hidden shrink-0 divide-y divide-[#1a1a1a]">{children}</div>;
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
// layout="web": instead of its own window, the workspace drives the Gig Web's
// profile web. Its tabs become the ring (portalled into `webSlot`, the hub's
// place on the page) and the open tab's editor renders here, below the web
// on a phone or beside it on desktop. Same tabs, same data, same Save.
// `template` switches it into template editing (My Templates): only the
// reusable tabs, no tasks / requests / other sections, and a name field.
// Shape: { name, setName }. `p` then edits the template instead of an event.
export default function RoleWorkspace({ role, p, onClose, onOpenRole, modal = false, layout, webSlot, leaving = false, onBack, onOpenFanPage, onOpenDj = null, focus = null, defaultOpen = false, selected = false, onInvite = null, showContent = true, initialTab = null, template = null, homeIcon = null, solo = false }) {
  const navigate = useNavigate();
  // The section of the event this circle belongs to (Manager and Artist share one, Audio and Lighting share one).
  const section = SECTION_OF[role] || role;
  const color = ROLE_COLOR[role] || G;
  const gig = p.gig;
  const ed = p.editable;
  // Task summary (TaskSheet) open over the workspace, by task id.
  const [openTaskId, setOpenTaskId] = useState(null);
  // Load template from the profile web's corner (job 124).
  const [tplOpen, setTplOpen] = useState(false);
  const [tplLoaded, setTplLoaded] = useState("");
  useEffect(() => { if (!tplLoaded) return undefined; const t = setTimeout(() => setTplLoaded(""), 4000); return () => clearTimeout(t); }, [tplLoaded]);
  const off = !ed;
  const [copied, setCopied] = useState("");
  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1600); } catch {}
  };

  // Section data and setters for each role.
  const vi = gig.venue_info || {};
  const setVi = (k, v) => p.update("venue_info", { ...(gig.venue_info || {}), [k]: v });
  const mi = gig.manager_info || {};
  const setMi = (k, v) => p.updateSection("manager_info", k, v);
  const ei = gig.engineer_info || {};

  // Business page (job 104, 116): Paperwork, with the deal inside it. Only
  // the event owner, the venue side and the manager / artist side get it;
  // the server decides (get_event_business), crew never see this tab.
  const bizOn = !template && !!gig.id && !!p.user && (role === "venue" || role === "manager");
  const { biz, reload: reloadBiz } = useEventBusiness(bizOn ? gig.id : null, bizOn);
  const bizTabs = () => {
    if (!bizOn || !biz?.can_view) return [];
    return [{
      key: "paperwork", label: "Paperwork",
      summary: paperworkSummary(biz.records, biz.deal),
      state: paperworkState(biz.records, biz.deal),
      render: () => <EventPaperwork gig={gig} biz={biz} onChanged={reloadBiz} color={color} userId={p.user?.id} />,
    }];
  };

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
            <VenuePhoto value={vi.photo_url || ""} onChange={(url) => setVi("photo_url", url)} editable={!off} accent={color} />
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

  // ======== AUDIO / LIGHTING ========
  const engineerTabs = () => {
    const crewTab = (key, label, hint) => {
      const info = ei[key] || {};
      const setE = (k, v) => p.updateEngineerRole(key, k, v);
      return {
        key, label,
        summary: [info.contact_name, info.contact_phone].filter(Boolean).join(" · ") || hint,
        state: stateOf(countFilled([info.contact_name, info.contact_phone, info.contact_email]), 3),
        render: () => (
          <>
            <In label="Name" value={info.contact_name} onChange={(v) => setE("contact_name", v)} disabled={off} placeholder="Name" />
            <Grid>
              <In label="Phone" value={info.contact_phone} onChange={(v) => setE("contact_phone", v)} disabled={off} placeholder="Phone" />
              <In label="Email" value={info.contact_email} onChange={(v) => setE("contact_email", v)} disabled={off} placeholder="Email" />
            </Grid>
          </>
        ),
      };
    };
    return [
      crewTab("audio", "Audio engineer", "Who is on sound"),
      crewTab("lighting", "Lighting tech", "Who is on lights"),
      requestsTab("engineer"),
    ];
  };
  const engineerTabsFor = (which) => {
    const all = engineerTabs();
    return all.filter((t) => t.key === which || t.key === "requests");
  };
  const engineerSide = () => {
    const run = buildRunOfShow(gig);
    const crew = [["Audio", ei.audio], ["Lighting", ei.lighting]].filter(([, i]) => i && (i.contact_name || i.contact_phone || i.contact_email));
    return {
      body: (
        <>
          <SideLabel>WHAT THE CREW SEES{gig.date ? ` · ${shortDate(gig.date).toUpperCase()}` : ""}</SideLabel>
          <div className="bg-[#151515] border border-[#262626] rounded-[10px] p-4 flex flex-col gap-2">
            <div className="text-[22px] font-bold leading-tight">{[gig.venue, gig.city].filter(Boolean).join(", ") || "Venue not set yet"}</div>
            {vi.load_in_location && <div className="text-[14px] text-white/55 leading-snug">Load in at {vi.load_in_location}.</div>}
            {run.length > 0 ? (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-y-1.5 mt-1 text-[16px]">
                {run.map((r, i) => (
                  <React.Fragment key={i}>
                    <span className="text-[13px]" style={{ fontFamily: SCENE_MONO, color: "rgba(255,255,255,0.6)" }}>{r.time || "--"}</span>
                    <span>{r.label}</span>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-white/35">Times from the venue and artist show up here once they are filled in.</p>
            )}
          </div>
          <SideLabel className="mt-1">CREW ON THIS EVENT</SideLabel>
          <div className="bg-[#151515] border border-[#262626] rounded-[10px] p-4 flex flex-col gap-2">
            {crew.length === 0 && <p className="text-[14px] text-white/40">No audio or lighting contacts yet.</p>}
            {crew.map(([label, i]) => (
              <div key={label} className="text-[15px]">
                <span className="text-[12px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{label.toUpperCase()}</span>
                <div className="font-semibold">{i.contact_name || "-"}</div>
                <div className="text-white/55 text-[14px]">{[i.contact_phone, i.contact_email].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </>
      ),
    };
  };

  // ======== MANAGER / ARTIST ========
  const DEFAULT_CHECKLIST = [
    ["Load-in time and dock", "Venue"], ["Soundcheck slot", "Venue"], ["Input list and stage plot sent", "Audio"],
    ["Set time and length", "Venue"], ["Hospitality rider accepted", "Venue"], ["Parking for van and trailer", "Venue"], ["Settlement contact on the night", "Venue"],
  ];
  const managerTabs = () => {
    const checklist = mi.checklist || [];
    const setItem = (i, k, v) => setMi("checklist", checklist.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
    const guests = mi.guests || [];
    const setGuests = (list) => p.update("manager_info", { ...mi, guests: list, guest_list: list.filter((g) => g.name).map((g) => (num(g.plus) > 0 ? `${g.name} +${num(g.plus)}` : g.name)).join(", ") });
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
            <VenuePhoto kind="artist" value={mi.photo_url || ""} onChange={(url) => setMi("photo_url", url)} editable={!off} accent={color} />
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
            <p className="text-[14px] text-white/50 -mt-2">Acts in playing order. Times flow to the day sheet and run of show. Press Save after reordering.</p>
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
                  {/* Members, inputs & stage plot for this act (job 108): the
                      same editor as the shared event page. Editable by whoever
                      can edit this section; read-only for everyone else
                      (e.g. Audio / Lighting). Saved with the section's Save. */}
                  {(() => {
                    const open = p.expandedBands?.has(i);
                    const n = (b.band_members || []).length;
                    const plot = (b.stage_plot_files || []).length;
                    const bits = [n ? `${n} member${n === 1 ? "" : "s"}` : null, plot ? "stage plot" : null].filter(Boolean).join(" · ");
                    return (
                      <div className="col-start-1 col-span-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => p.toggleExpanded?.(i)}
                          aria-expanded={!!open}
                          className="w-full h-10 px-3 rounded-[9px] border flex items-center gap-2 text-left text-[13px] font-semibold transition-colors"
                          style={{ borderColor: open ? color + "88" : "#262626", background: open ? color + "14" : "#111", color: open ? color : "rgba(255,255,255,0.7)" }}
                        >
                          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                          <span className="flex-1 min-w-0 truncate">Members, inputs & stage plot</span>
                          {bits && <span className="shrink-0 text-[11px] text-white/45" style={{ fontFamily: SCENE_MONO }}>{bits.toUpperCase()}</span>}
                        </button>
                        {open && (
                          <div className="mt-2 rounded-[10px] border border-[#222] bg-[#0f0f0f] p-2.5">
                            <BandDetails band={b} editable={ed} onUpdate={(field, val) => p.updateBand(i, field, val)} iemMonitorColors={p.iemMonitorColors || {}} />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
              {(gig.bands || []).length === 0 && <p className="px-4 py-4 text-white/35 text-[15px]">No acts yet.</p>}
            </TableBox>
            <AddButton color={color} disabled={!p.canEdit} onClick={p.addBand}>Add an act</AddButton>
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
                <div key={c.id || i} className="grid grid-cols-[28px_minmax(0,1fr)_130px_40px] gap-3 px-4 py-2 items-center" style={{ background: c.done ? "transparent" : "rgba(255,106,0,0.04)" }}>
                  <input type="checkbox" checked={!!c.done} onChange={(e) => setItem(i, "done", e.target.checked)} disabled={off} className="w-[18px] h-[18px]" style={{ accentColor: G }} aria-label={`Confirmed: ${c.label || "item"}`} />
                  <input value={c.label || ""} onChange={(e) => setItem(i, "label", e.target.value)} disabled={off} placeholder="What needs confirming" className={inputCls} aria-label="Checklist item" />
                  <select value={c.who || ""} onChange={(e) => setItem(i, "who", e.target.value)} disabled={off} className={inputCls} aria-label="Who confirms">
                    {["", "Venue", "Audio", "Lighting", "Artist"].map((w) => <option key={w} value={w}>{w || "Who"}</option>)}
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
            <Area label="Advancing notes" value={mi.advancing_notes} onChange={(v) => setMi("advancing_notes", v)} disabled={off} placeholder="Anything else agreed with the venue" />
          </>
        ),
      },
      {
        key: "travel", label: "Travel & lodging",
        summary: [mi.arrival_time && `Arrive ${mi.arrival_time}`, mi.hotel].filter(Boolean).join(" · ") || "Arrival, hotel, parking",
        state: stateOf(countFilled([mi.arrival_time, mi.hotel, mi.vehicle]), 3),
        render: () => (
          <>
            <Grid>{!template && <In label="Arrival time" value={mi.arrival_time} onChange={(v) => setMi("arrival_time", v)} disabled={off} placeholder="2:30 PM" />}<In label="Vehicle" value={mi.vehicle} onChange={(v) => setMi("vehicle", v)} disabled={off} placeholder="Sprinter van + 6x12 trailer" /></Grid>
            {!template && <In label="Hotel" value={mi.hotel} onChange={(v) => setMi("hotel", v)} disabled={off} placeholder="Hotel name, address, confirmation #" />}
            <Area label="Travel notes" value={mi.travel_notes} onChange={(v) => setMi("travel_notes", v)} disabled={off} placeholder="Flights, drive time from the last city, day after" />
          </>
        ),
      },
      {
        key: "guests", label: "Guest list",
        summary: guests.length ? `${used} on the list` : mi.guest_list || "Names for the door",
        state: guests.length || has(mi.guest_list) ? "done" : "empty",
        render: () => (
          <>
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
            <AddButton color={color} disabled={off} onClick={() => setGuests([...guests, { id: uid(), name: "", plus: "" }])}>Add a guest</AddButton>
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
    // Acts in the lineup that don't have a start time yet still show, in
    // playing order, so the run of show is never just a blank box.
    const untimed = (gig.bands || []).filter((b) => b.band_name && !has((mi.set_times || {})[b.band_name]));
    const sideBtn = "self-start mt-1 text-[13px] font-semibold px-3 py-1.5 rounded-md border";
    return {
      body: (
        <>
          <SideLabel>RUN OF SHOW{gig.date ? ` · ${shortDate(gig.date).toUpperCase()}` : ""}</SideLabel>
          <div className="bg-[#151515] border border-[#262626] rounded-[10px] p-4 flex flex-col gap-2">
            {run.length > 0 && (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-y-2 text-[16px]">
                {run.map((r, i) => (
                  <React.Fragment key={i}>
                    <span className="text-[13px]" style={{ fontFamily: SCENE_MONO, color: r.kind === "set" ? color : "rgba(255,255,255,0.55)" }}>{r.time || "--"}</span>
                    <span style={{ color: r.kind === "set" ? color : undefined, fontWeight: r.kind === "set" ? 700 : 400 }}>{r.label}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
            {untimed.length > 0 && (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-y-2 text-[16px]">
                {untimed.map((b, i) => (
                  <React.Fragment key={b.band_name + i}>
                    <span className="text-[13px] text-white/30" style={{ fontFamily: SCENE_MONO }}>--:--</span>
                    <span className="min-w-0">
                      <span className="font-semibold text-white/75">{b.band_name}</span>
                      <span className="ml-2 text-[10px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>TIME NEEDED</span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
            {!run.length && !untimed.length && (
              <p className="text-[14px] text-white/40">Add acts and set times in Lineup & set times. The venue's schedule and your arrival join them here.</p>
            )}
            {(untimed.length > 0 || !run.length) && active !== "lineup" && tabs.some((t) => t.key === "lineup") && (
              <button type="button" onClick={() => setActive("lineup")} className={sideBtn} style={{ color, borderColor: color + "66" }}>
                {untimed.length ? "Add set times" : "Open lineup"}
              </button>
            )}
          </div>
          <SideLabel className="mt-1">STILL WAITING ON</SideLabel>
          {Object.keys(waiting).length ? (
            Object.entries(waiting).map(([w, n]) => <SideRow key={w} left={`${w} · ${n} item${n === 1 ? "" : "s"}`} right="OPEN" rightColor={AMBER} />)
          ) : (mi.checklist || []).length ? (
            <p className="text-[14px] text-white/35">Everything on the checklist is confirmed.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-[14px] text-white/40">Nothing tracked yet. The advance checklist shows who still owes you an answer.</p>
              {ed ? (
                <button type="button" onClick={() => { setMi("checklist", DEFAULT_CHECKLIST.map(([label, who]) => ({ id: uid(), label, who, done: false }))); setActive("advance"); }}
                  className={`${sideBtn} border-[#2a2a2a] text-white/75 hover:text-white`}>Start the usual advance</button>
              ) : null}
            </div>
          )}
        </>
      ),
      action: run.length ? { label: copied === "run" ? "COPIED" : "COPY RUN OF SHOW", onClick: () => copy(text, "run") } : null,
    };
  };

  // Manager and Artist each get their half of the manager pages; Audio and
  // Lighting each get their own crew page. A template (one section saved
  // whole) still uses every page of its section.
  const MANAGER_PAGES = ["contact", "advance", "guests", "requests"];
  const ARTIST_PAGES = ["lineup", "travel", "merch", "requests"];
  const builders = {
    venue: venueTabs,
    manager: () => (template ? managerTabs() : managerTabs().filter((t) => MANAGER_PAGES.includes(t.key))),
    band: () => managerTabs().filter((t) => ARTIST_PAGES.includes(t.key)),
    engineer: () => (template ? engineerTabs() : engineerTabsFor("audio")),
    lighting: () => engineerTabsFor("lighting"),
  };
  const tabs = useMemo(
    () => {
      let list = builders[role]();
      if (template) return list.filter((t) => (TEMPLATE_TABS[role] || []).includes(t.key));
      const extra = bizTabs();
      if (extra.length) {
        const at = list.findIndex((t) => t.key === "requests");
        list = at === -1 ? [...list, ...extra] : [...list.slice(0, at), ...extra, ...list.slice(at)];
      }
      // Tasks aren't a page of the profile any more: they live in the Tasks
      // feature in the web's corner, which opens the event's task page
      // (/gig/tasks, Oct 21).
      return list;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, gig, ed, p.canEdit, biz]
  );
  const [active, setActive] = useState(initialTab || null);
  // "pages" layout (the event's main space): this profile is one dropdown, its
  // pages are dropdowns inside it. The web is only a way to reach them.
  const [blockOpen, setBlockOpen] = useState(!!defaultOpen);
  const blockRef = useRef(null);
  const rowRefs = useRef({});
  const reveal = (key) => {
    setBlockOpen(true);
    if (key) setActive(key);
    setTimeout(() => {
      const el = (key && rowRefs.current[key]) || blockRef.current;
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 60);
  };
  useEffect(() => {
    if (layout !== "pages" || !focus || !focus.n) return;
    // Solo (desktop): the profile's circle shows its page list, a page shows that page.
    if (solo) { setBlockOpen(true); setActive(focus.key || null); return; }
    reveal(focus.key || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);
  // The task summary, for this workspace's tasks (claim / let go / done /
  // details go through useRoleProfile, so the event web refreshes too).
  const openTask = openTaskId ? (gig.tasks || []).find((t) => t.id === openTaskId) : null;
  // Venue and Manager can fill their section from a saved template; it only
  // changes the screen until the section's Save.
  // Artist (job 125): an Artist template goes into the lineup as that act
  // (fills the act with the same name, or an empty one, else adds it).
  const canLoadTpl = ed && !template && !!p.user && (role === "venue" || role === "manager" || role === "band");
  const loadArtistAct = (n, data) => {
    const act = artistFromTemplate(n, data);
    const bands = [...(gig.bands || [])];
    const key = String(act.band_name || "").trim().toLowerCase();
    let i = bands.findIndex((b) => key && String(b.band_name || "").trim().toLowerCase() === key);
    if (i === -1) i = bands.findIndex((b) => !String(b.band_name || "").trim());
    if (i === -1) bands.push({ role: "N/A", ...act, sort_order: bands.length });
    else bands[i] = { ...bands[i], ...act };
    p.update("bands", bands);
  };
  const tplPicker = canLoadTpl ? (
    <>
      <LoadTemplateButton category={role === "band" ? "artist" : role} hideTrigger open={tplOpen} onOpenChange={setTplOpen}
        onLoad={(n, data) => { if (role === "band") loadArtistAct(n, data); else applyTemplate(role, data, gig, p.update); setTplLoaded(n); }} />
      {tplLoaded && createPortal(
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] px-4 py-2.5 rounded-xl bg-[#111] border border-[#2a2a2a] text-[14px] text-white shadow-[0_12px_30px_rgba(0,0,0,0.6)]">
          Loaded <b>{tplLoaded}</b>. Press Save to keep it.
        </div>, document.body)}
    </>
  ) : null;
  const taskSheet = openTask ? (
    <TaskSheet
      task={openTask}
      color={ROLE_COLOR[openTask.section] || color}
      label={SECTION_NAME[openTask.section] || openTask.section}
      userId={p.user?.id}
      signedIn={!!p.user}
      isOwner={!!p.permissions?.is_owner}
      canWork={openTask.section === "engineer" ? !!p.canEditSection?.("engineer") || !!p.canEditSection?.("lighting") : !!p.canEditSection?.(openTask.section)}
      onClose={() => setOpenTaskId(null)}
      onClaim={async () => { await p.claimTask(openTask.id, true); if (openTask.section === section) setActive("tasks"); }}
      onRelease={() => p.claimTask(openTask.id, false)}
      onDone={async () => { await p.markTaskDone(openTask.id, true); setOpenTaskId(null); }}
      onSaveDetails={(d) => p.setTaskDetails(openTask.id, d)}
      onSaveDue={p.setTaskDueDate ? (d) => p.setTaskDueDate(openTask.id, d) : undefined}
    />
  ) : null;
  const current = tabs.find((t) => t.key === active) || tabs.find((t) => t.key === "tasks" && t.state === "partial") || tabs[0];
  const side = template ? templateSide(role, color) : role === "venue" ? venueSide() : (role === "engineer" || role === "lighting") ? engineerSide() : managerSide();
  // Load a saved template into this event / save this section as one.
  const templateTools = ed && !template && p.user && role !== "engineer" && role !== "lighting" && role !== "band" ? (
    <TemplateTools role={role} color={color} gig={gig} update={p.update} userId={p.user.id} />
  ) : null;
  const counted = (list) => list.filter((t) => t.key !== "requests" && t.key !== "tasks");
  const doneTabs = counted(tabs).filter((t) => t.state === "done").length;
  const totalTabs = counted(tabs).length;
  const dateLabel = gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

  // The other company sections on this event, as simple progress lines.
  const included = () => true;
  const others = template ? [] : COMPANY_ROLES.filter((r) => r !== role && included(r)).map((r) => {
    const parts = counted(builders[r]());
    const openReqs = (gig.requirements || []).filter((q) => q.section === SECTION_OF[r] && q.status !== "confirmed").length;
    return { role: r, done: parts.filter((t) => t.state === "done").length, total: parts.length, openReqs, mine: !!p.canEditSection?.(SECTION_OF[r]) };
  });
  // Everything that's waiting on the person looking: open tasks the owner
  // pointed at any section they hold.
  const mySections = COMPANY_ROLES.filter((r) => p.canEditSection?.(SECTION_OF[r]));
  const neededFromMe = (gig.tasks || []).filter((t) => t.status !== "done" && mySections.includes(t.section));

  // Features (DCAs) sit in the web's four corners; empty corners are open
  // slots. Tasks are not a feature here: they open from the TASKS icon in the
  // event header (next to the fan page ticket), which carries your count.
  const featureDcas = [
    role === "band" && ed && gig.id ? { key: "dj", label: "DJ Tools", color: "#FDE047", onClick: () => (onOpenDj ? onOpenDj() : navigate(`/dj?show=${gig.id}`)) } : null,
    role === "manager" && onOpenFanPage ? { key: "fan", label: "Fan page", color: "#E4E0FF", onClick: onOpenFanPage } : null,
    canLoadTpl ? { key: "tpl", label: "Load template", color: "#FFFFFF", onClick: () => setTplOpen(true) } : null,
  ].filter(Boolean);

  // The profile's own picture (job 147): set from the center of its web.
  const photoControl = ed && !template && p.savePhoto ? (
    <SectionPhotoButton
      value={ownSectionPhoto(role, gig)}
      onSave={(url) => p.savePhoto(role, url)}
      color={color}
      label={ROLE_TITLE[role].toLowerCase()}
      wide={role === "venue" || role === "manager"}
    />
  ) : null;

  if (layout === "pages") {
    const dotColor = { done: G, partial: AMBER, empty: "rgba(255,255,255,0.22)" };
    const real = counted(tabs);
    const filled = real.filter((t) => t.state === "done").length;
    const openTaskCount = (gig.tasks || []).filter((t) => t.section === section && t.status !== "done").length;
    const web = webSlot
      ? createPortal(
          <ProfileWeb
            color={color}
            title={ROLE_TITLE[role]}
            sub={ed ? "CAN EDIT" : "VIEW ONLY"}
            tabs={tabs}
            activeKey={active}
            onPick={(k) => reveal(k)}
            dcas={featureDcas}
            onBack={onBack}
            leaving={leaving}
            home={{ title: gig.event_name || gig.band_name, imageUrl: homeIcon || gig.icon_url, eventType: gig.event_type, onClick: onBack }}
            imageUrl={sectionPhoto(role, gig)}
            photoControl={photoControl}
          />,
          webSlot
        )
      : null;
    // Desktop: the web picks what shows here. A profile shows its page list;
    // a page shows on its own, with a way back to the list.
    if (solo) {
      const page = tabs.find((t) => t.key === active) || null;
      // Save at the top of every profile board (job 128, just "SAVE"), pinned while you
      // scroll; the one at the bottom stays for long pages.
      const topSave = ed ? (
        <button type="button" onClick={p.handleSave} disabled={p.saving} className="shrink-0 px-4 py-2 rounded-[10px] text-[13px] font-bold tracking-[0.06em] disabled:opacity-60" style={{ background: G, color: "#0d0d0d" }}>
          {p.saved ? "SAVED ✓" : p.saving ? "SAVING..." : "SAVE"}
        </button>
      ) : null;
      return (
        <>
          {web}
          {taskSheet}{tplPicker}
          <div ref={blockRef} className="text-white flex flex-col gap-3" style={{ fontFamily: SCENE_FONT }}>
            {page ? (
              <>
                <div className="sticky top-0 z-20 -mx-5 px-5 py-2 -mt-2 flex items-center gap-3 bg-[#151515]">
                  <button type="button" onClick={() => setActive(null)} className="flex items-center gap-1 text-[14px] font-semibold text-white/55 hover:text-white shrink-0">
                    <ChevronLeft className="w-4 h-4" /> All {ROLE_TITLE[role]} pages
                  </button>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] tracking-[0.08em] text-white/45" style={{ fontFamily: SCENE_MONO }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: dotColor[page.state] || dotColor.empty }} />
                    {page.state === "done" ? "FILLED IN" : page.state === "partial" ? "IN PROGRESS" : "NOT STARTED"}{!ed ? " · VIEW ONLY" : ""}
                  </span>
                  {topSave}
                </div>
                <h2 className="text-[26px] font-bold leading-none">{page.label}</h2>
                <div className="flex flex-col gap-4 min-w-0 overflow-x-auto">
                  {page.key === "tasks" ? page.render() : <fieldset disabled={!ed} className="contents">{page.render()}</fieldset>}
                </div>
              </>
            ) : (
              <>
                <div className="sticky top-0 z-20 -mx-5 px-5 py-2 -mt-2 flex items-center gap-3 bg-[#151515]">
                  <span className="text-[11px] tracking-[0.08em] text-white/45" style={{ fontFamily: SCENE_MONO }}>
                    {[real.length ? `${filled}/${real.length} FILLED` : "", openTaskCount ? `${openTaskCount} OPEN TASK${openTaskCount === 1 ? "" : "S"}` : "", !ed ? "VIEW ONLY" : ""].filter(Boolean).join(" · ") || "PICK A PAGE"}
                  </span>
                  <span className="ml-auto" />
                  {topSave}
                </div>
                <div className="flex flex-col gap-1.5">
                  {tabs.map((t) => (
                    <button key={t.key} type="button" onClick={() => setActive(t.key)} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-[#232323] bg-[#151515] hover:border-white/25 text-left">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[t.state] || dotColor.empty }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold leading-tight truncate">{t.label}</span>
                        {t.summary && <span className="block text-[13px] text-white/40 leading-tight truncate mt-0.5">{t.summary}</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-white/30" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {ed && (
              <button type="button" onClick={p.handleSave} disabled={p.saving} className="mt-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] disabled:opacity-60" style={{ background: G, color: "#0d0d0d" }}>
                {p.saved ? "SAVED ✓" : p.saving ? "SAVING..." : "SAVE"}
              </button>
            )}
          </div>
        </>
      );
    }
    return (
      <>
        {web}
        {taskSheet}{tplPicker}
        <div ref={blockRef} className="rounded-2xl bg-[#111] text-white" style={{ fontFamily: SCENE_FONT, border: `1px solid ${selected ? color + "99" : "#1f1f1f"}`, boxShadow: selected ? `0 0 0 1px ${color}33, 0 0 18px ${color}22` : undefined, scrollMarginTop: 12 }}>
          <div className="flex items-center gap-1 pr-2">
            <button type="button" onClick={() => setBlockOpen((o) => !o)} aria-expanded={blockOpen} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 text-left">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[19px] font-bold leading-none tracking-wide truncate" style={{ color: blockOpen || selected ? color : undefined }}>{ROLE_TITLE[role]}</span>
                <span className="block mt-1 text-[11px] leading-none tracking-[0.08em] text-white/45 truncate" style={{ fontFamily: SCENE_MONO }}>
                  {[real.length ? `${filled}/${real.length} FILLED` : "", openTaskCount ? `${openTaskCount} TASK${openTaskCount === 1 ? "" : "S"}` : "", !ed ? "VIEW ONLY" : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ChevronDown className="w-4 h-4 shrink-0 text-white/40 transition-transform" style={{ transform: blockOpen ? "rotate(180deg)" : undefined }} />
            </button>
            {onInvite && (
              <button type="button" onClick={onInvite} aria-label={`Invite to ${ROLE_TITLE[role]}`} className="shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full border border-white/20 text-white/65 hover:text-white hover:border-white/40">
                <UserPlus className="w-3.5 h-3.5" /> Invite
              </button>
            )}
          </div>
          {blockOpen && (
            <div className="px-3 pb-3 flex flex-col gap-1.5">
              {tabs.map((t) => {
                const on = active === t.key;
                return (
                  <div key={t.key} ref={(el) => { rowRefs.current[t.key] = el; }} className="rounded-xl border bg-[#151515]" style={{ borderColor: on ? color + "66" : "#232323", scrollMarginTop: 12 }}>
                    <button type="button" onClick={() => setActive(on ? null : t.key)} aria-expanded={on} className="w-full flex items-center gap-3 px-3.5 py-3 text-left">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[t.state] || dotColor.empty }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold leading-tight truncate">{t.label}</span>
                        {!on && t.summary && <span className="block text-[13px] text-white/40 leading-tight truncate mt-0.5">{t.summary}</span>}
                      </span>
                      <ChevronDown className="w-4 h-4 shrink-0 text-white/35 transition-transform" style={{ transform: on ? "rotate(180deg)" : undefined }} />
                    </button>
                    {on && (
                      <div className="px-3.5 pb-3.5 flex flex-col gap-4 min-w-0 overflow-x-auto">
                        {t.key === "tasks" ? t.render() : <fieldset disabled={!ed} className="contents">{t.render()}</fieldset>}
                      </div>
                    )}
                  </div>
                );
              })}
              {ed && (
                <button type="button" onClick={p.handleSave} disabled={p.saving} className="mt-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] disabled:opacity-60" style={{ background: G, color: "#0d0d0d" }}>
                  {p.saved ? "SAVED ✓" : p.saving ? "SAVING..." : `SAVE ${ROLE_TITLE[role].toUpperCase()}`}
                </button>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  if (layout === "web") {
    // Features (DCAs) sit in the web's four corners (featureDcas, above).
    const dcas = featureDcas;
    const stateWord = { done: ["FILLED IN", G], partial: ["IN PROGRESS", AMBER], empty: ["NOT STARTED", "rgba(255,255,255,0.45)"] };
    const sw = stateWord[current?.state] || stateWord.empty;
    const web = webSlot
      ? createPortal(
          <ProfileWeb
            color={color}
            title={ROLE_TITLE[role]}
            sub={ed ? "CAN EDIT" : "VIEW ONLY"}
            tabs={tabs}
            activeKey={current?.key}
            onPick={setActive}
            dcas={dcas}
            onBack={onBack}
            leaving={leaving}
            home={{ title: gig.event_name || gig.band_name, imageUrl: homeIcon || gig.icon_url, eventType: gig.event_type, onClick: onBack }}
            imageUrl={sectionPhoto(role, gig)}
            photoControl={photoControl}
          />,
          webSlot
        )
      : null;
    if (!showContent) return web;
    // No web to pick tabs from (a template on a phone): a row of tab chips.
    const tabChips = !webSlot ? (
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {tabs.map((t) => {
          const on = current?.key === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setActive(t.key)} className="shrink-0 px-3 py-2 rounded-full text-[14px] font-semibold whitespace-nowrap" style={on ? { background: color, color: "#0d0d0d" } : { border: `1px solid ${color}55`, color: t.state === "empty" ? "rgba(255,255,255,0.6)" : "#fff" }}>
              {t.label}
            </button>
          );
        })}
      </div>
    ) : null;

    if (!ed) {
      const sectionTasks = (gig.tasks || []).filter((t) => t.section === section);
      const theirOpenReqs = reqs(section).filter((q) => q.status !== "confirmed");
      const myCompany = mySections.filter((r) => COMPANY_ROLES.includes(r) && r !== role);
      return (
        <>
          {web}
          {taskSheet}{tplPicker}
          <div className="flex flex-col gap-5 text-white" style={{ fontFamily: SCENE_FONT }}>
            {!p.user && (
              <p className="text-[15px] text-white/55 bg-[#111] border border-[#1f1f1f] rounded-[10px] px-4 py-3">Sign in to see what's needed from you and to open your own section.</p>
            )}
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h2 className="text-[24px] font-bold leading-none">{current?.label}</h2>
                <span className="text-[11px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color: sw[1] }}>{sw[0]}</span>
              </div>
              <p className="text-[15px] text-white/50">Only {ROLE_TITLE[role]} works on the details here. You can see where it's at and what's needed from you.</p>
            </section>
            <section>
              <SideLabel className="mb-2">NEEDED FROM YOU</SideLabel>
              {neededFromMe.length ? (
                <TaskList tasks={neededFromMe} editable onToggle={p.setTaskDone} color={G} showSection />
              ) : (
                <p className="text-[15px] text-white/40">Nothing waiting on you right now.</p>
              )}
            </section>
            {(theirOpenReqs.length > 0 || sectionTasks.some((t) => t.status !== "done")) && (
              <section>
                <SideLabel className="mb-2">{ROLE_TITLE[role].toUpperCase()} IS WAITING ON</SideLabel>
                <div className="flex flex-col gap-1.5">
                  {theirOpenReqs.map((q) => <SideRow key={q.id} left={q.name} right={(q.status || "requested").toUpperCase()} rightColor={q.status === "conflict" ? "#F87171" : AMBER} />)}
                  {sectionTasks.filter((t) => t.status !== "done").map((t) => (
                    <button key={t.id} type="button" onClick={() => setOpenTaskId(t.id)} className="text-left">
                      <SideRow left={t.title} right={t.claimed_by ? `CLAIMED · ${claimText(t, p.user?.id).toUpperCase()}` : "TASK"} rightColor={t.claimed_by ? color : AMBER} />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {myCompany.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {myCompany.map((r) => (
                  <button key={r} type="button" onClick={() => onOpenRole?.(r)} className="px-4 py-2.5 rounded-[10px] text-[15px] font-bold tracking-[0.04em]" style={{ border: `1px solid ${ROLE_COLOR[r]}73`, background: `${ROLE_COLOR[r]}1a`, color: ROLE_COLOR[r] }}>
                    OPEN {ROLE_TITLE[r].toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      );
    }

    return (
      <>
        {web}
        {taskSheet}{tplPicker}
        <div className="flex flex-col gap-4 text-white" style={{ fontFamily: SCENE_FONT }}>
          {tabChips}
          <div className="flex items-center gap-3">
            <h2 className="text-[24px] font-bold leading-none">{current?.label}</h2>
            <span className="text-[11px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color: sw[1] }}>{sw[0]}</span>
          </div>
          <div className="flex flex-col gap-4 min-w-0 overflow-x-auto">{current?.render()}</div>
          {templateTools}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-[#1c1c1c]">
            {side.action && (
              <button type="button" onClick={side.action.onClick} className="flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em]" style={{ border: `1px solid ${color}73`, background: `${color}1a`, color }}>
                {side.action.label}
              </button>
            )}
            <button type="button" onClick={p.handleSave} disabled={p.saving} className="flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] disabled:opacity-60" style={{ background: G, color: "#0d0d0d", boxShadow: "0 0 16px rgba(140,255,61,0.3)" }}>
              {p.saved ? "SAVED ✓" : p.saving ? "SAVING..." : "SAVE"}
            </button>
          </div>
        </div>
      </>
    );
  }

  const header = template ? (
    <header className="h-[72px] shrink-0 flex items-center gap-4 px-7 border-b border-[#1a1a1a]">
      <button type="button" onClick={onClose} className="flex items-center gap-1.5 text-[15px] font-semibold text-white/55 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> My Templates
      </button>
      <h1 className="text-[32px] font-bold tracking-wide leading-none whitespace-nowrap">{ROLE_TITLE[role]} template</h1>
      <input
        value={template.name}
        onChange={(e) => template.setName(e.target.value)}
        placeholder="Template name"
        aria-label="Template name"
        className="flex-1 min-w-0 max-w-[420px] bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[17px] font-semibold text-white placeholder:text-white/30 outline-none focus:border-white/40"
      />
      <div className="ml-auto flex items-center gap-3.5 shrink-0">
        <span className="text-[12px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color }}>{doneTabs} OF {totalTabs} FILLED IN</span>
        <div className="w-[150px] h-2 rounded bg-[#1f1f1f] overflow-hidden"><div className="h-full" style={{ width: `${totalTabs ? (doneTabs / totalTabs) * 100 : 0}%`, background: color }} /></div>
      </div>
    </header>
  ) : (
    <header className="h-[72px] shrink-0 flex items-center gap-4 px-7 border-b border-[#1a1a1a]">
      <button type="button" onClick={onClose} className="flex items-center gap-1.5 text-[15px] font-semibold text-white/55 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> {modal ? "Back to board" : "Event board"}
      </button>
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
    const sectionTasks = (gig.tasks || []).filter((t) => t.section === section);
    const theirOpenReqs = reqs(section).filter((q) => q.status !== "confirmed");
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
                    {sectionTasks.filter((t) => t.status !== "done").map((t) => (
                    <button key={t.id} type="button" onClick={() => setOpenTaskId(t.id)} className="text-left">
                      <SideRow left={t.title} right={t.claimed_by ? `CLAIMED · ${claimText(t, p.user?.id).toUpperCase()}` : "TASK"} rightColor={t.claimed_by ? color : AMBER} />
                    </button>
                  ))}
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
      {taskSheet}{tplPicker}

      <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_380px]">
        <div role="tablist" aria-orientation="vertical" className="min-h-0 overflow-y-auto border-r border-[#1c1c1c] px-5 py-4">
          <SideLabel className="mb-1.5">{template ? "WHAT THE TEMPLATE FILLS IN" : "YOUR SECTION"}</SideLabel>
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
            {templateTools}
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

const COMPANY_ROLES = ["venue", "manager", "band", "engineer", "lighting"];
const SECTION_NAME = { venue: "Venue", manager: "Manager / Artist", engineer: "Audio / Lighting" };

// Owner-assigned to-dos (gig_tasks). The section holder ticks them off;
// set_gig_task_status does its own permission check.
// The Current tasks node on a profile's web: what you've claimed first, then
// the section's unclaimed tasks you could pick up, then ones other people
// hold, then done. Each opens its summary (TaskSheet) to claim / finish it.
function CurrentTasks({ tasks, userId, color, onOpen }) {
  if (!tasks.length) return <p className="text-[15px] text-white/40">The event owner hasn't assigned anything to this section yet.</p>;
  const open = tasks.filter((t) => t.status !== "done");
  const groups = [
    ["YOURS", open.filter((t) => userId && t.claimed_by === userId), "Nothing claimed yet. Pick a task below and claim it."],
    ["UP FOR GRABS", open.filter((t) => !t.claimed_by), null],
    ["CLAIMED BY OTHERS", open.filter((t) => t.claimed_by && t.claimed_by !== userId), null],
    ["DONE", tasks.filter((t) => t.status === "done"), null],
  ];
  return (
    <div className="flex flex-col gap-4">
      {groups.map(([title, list, empty]) => (list.length || empty) ? (
        <section key={title}>
          <SideLabel className="mb-1.5">{title}{list.length ? ` · ${list.length}` : ""}</SideLabel>
          {list.length ? (
            <div className="bg-[#111] border border-[#1f1f1f] rounded-[10px] divide-y divide-[#1c1c1c]">
              {list.map((t) => {
                const done = t.status === "done";
                const who = claimText(t, userId);
                return (
                  <button key={t.id} type="button" onClick={() => onOpen(t.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
                    <span className="w-[20px] h-[20px] rounded-[5px] shrink-0 flex items-center justify-center" style={{ background: done ? color : "transparent", border: done ? "none" : `1px solid ${who === "You" ? color : "#3a3a3a"}` }}>
                      {done && <Check className="w-3.5 h-3.5 text-[#0d0d0d]" strokeWidth={3.2} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[16px] truncate ${done ? "line-through text-white/35" : ""}`}>{t.title}</span>
                      {(t.details || t.due_date || (who && who !== "You")) && (
                        <span className="block text-[12.5px] text-white/45 truncate">
                          {[who && who !== "You" && `Claimed by ${who}`, t.due_date && `Due ${new Date(t.due_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, t.details && t.details.split("\n")[0]].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[14px] text-white/40">{empty}</p>
          )}
        </section>
      ) : null)}
    </div>
  );
}

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

// Right column while editing a template: what it does and what stays out.
const TEMPLATE_LEFT_OUT = {
  venue: "Nothing is left out: every part of the venue section carries over.",
  manager: "Left out: the lineup, set times, arrival time and hotel. Advance items start unticked on each show.",
};
function templateSide(role, color) {
  return {
    body: (
      <>
        <SideLabel>HOW TEMPLATES WORK</SideLabel>
        <div className="bg-[#151515] border border-[#262626] rounded-[10px] p-4 flex flex-col gap-3 text-[15px] leading-snug text-white/75">
          <p>Fill this in once. On any event, open your {ROLE_TITLE[role]} section and press <span style={{ color }}>LOAD TEMPLATE</span> to drop it in.</p>
          <p>Loading only fills what the template has. Anything already on the event that the template leaves blank stays as it is. Files are added, not replaced.</p>
          <p className="text-white/50">{TEMPLATE_LEFT_OUT[role]}</p>
        </div>
      </>
    ),
    action: null,
  };
}

// LOAD TEMPLATE / SAVE AS TEMPLATE for a section on a real event. Loading
// only changes the screen; the section's own Save keeps it.
function TemplateTools({ role, color, gig, update, userId }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState(""); // "", "saving", "saved", "error"
  const [loaded, setLoaded] = useState("");

  const startSave = () => { setName(suggestTemplateName(role, gig)); setNaming(true); setState(""); };
  const save = async () => {
    const n = name.trim();
    if (!n) return;
    setState("saving");
    try {
      const data = templateFromGig(role, gig);
      const { data: existing } = await supabase.from("saved_templates").select("id").eq("owner_id", userId).eq("category", role).eq("name", n).maybeSingle();
      const { error } = existing
        ? await supabase.from("saved_templates").update({ data, updated_at: new Date().toISOString() }).eq("id", existing.id)
        : await supabase.from("saved_templates").insert({ owner_id: userId, category: role, name: n, data });
      if (error) throw error;
      setState("saved");
      setTimeout(() => { setNaming(false); setState(""); }, 1400);
    } catch (e) {
      console.error(e);
      setState("error");
    }
  };

  const pill = "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-[14px] font-bold tracking-[0.06em]";
  return (
    <div className="flex flex-col gap-2">
      {!naming ? (
        <div className="flex gap-2">
          <LoadTemplateButton
            category={role}
            onLoad={(n, data) => { applyTemplate(role, data, gig, update); setLoaded(n); }}
            className={pill}
            buttonStyle={{ border: "1px solid #2a2a2a", background: "#111", color: "rgba(255,255,255,0.85)" }}
          >
            <FolderOpen className="w-4 h-4" style={{ color }} /> LOAD TEMPLATE
          </LoadTemplateButton>
          <button type="button" onClick={startSave} className={pill} style={{ border: "1px solid #2a2a2a", background: "#111", color: "rgba(255,255,255,0.85)" }}>
            <Save className="w-4 h-4" style={{ color }} /> SAVE AS TEMPLATE
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-[10px] p-3" style={{ border: `1px solid ${color}55`, background: `${color}0d` }}>
          <span className="text-[11px] tracking-[0.12em] text-white/55" style={{ fontFamily: SCENE_MONO }}>SAVE THIS {ROLE_TITLE[role].toUpperCase()} SECTION AS A TEMPLATE</span>
          <div className="flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setNaming(false); }}
              placeholder="Template name"
              className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[16px] text-white placeholder:text-white/30 outline-none focus:border-white/40"
            />
            <button type="button" onClick={save} disabled={!name.trim() || state === "saving"} className="px-4 rounded-lg text-[14px] font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: color, color: "#0d0d0d" }}>
              {state === "saved" ? "SAVED ✓" : state === "saving" ? "..." : "SAVE"}
            </button>
            <button type="button" onClick={() => setNaming(false)} className="px-2 text-[13px] font-bold text-white/50">CANCEL</button>
          </div>
          <span className="text-[13px] text-white/45">{state === "error" ? "Couldn't save the template. Try again." : "Same name as one you have? It gets replaced. Dates and one-night details stay off."}</span>
        </div>
      )}
      {loaded && !naming && <span className="text-[13px]" style={{ color }}>Loaded “{loaded}”. Press Save to keep it on this event.</span>}
    </div>
  );
}
