import React, { useEffect, useState } from "react";
import { eventTitle } from "@/lib/eventTitle";
import { createPortal } from "react-dom";
import { ArrowLeft, MapPin, Phone, Mail, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { buildRunOfShow } from "@/components/showpilot/RoleWorkspace";
import FanPageButton from "@/components/showpilot/FanPageButton";
import { feedRows } from "@/lib/eventFeed";
import { eventTypeColor } from "@/lib/eventTypes";
import { HOLDERS, WEB_ROLES, WEB_LABELS } from "@/lib/eventRoles";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

const G = "#8CFF3D";
const AMBER = "#FF6A00";
const ROLE_COLOR = { venue: "#60A5FA", manager: "#F87171", band: "#F87171", engineer: "#8CFF3D", lighting: "#8CFF3D" };
const SECTION_LABEL = { venue: "Venue", manager: "Manager", engineer: "Audio / Lighting" };
const has = (v) => v != null && String(v).trim() !== "";

// The company phone's event Overview (job 73): what the Calendar opens when
// you tap an event. One read-only page with what you'd want on the go - the
// photo, when and where, the run of show, the lineup, who's on each profile,
// contacts, and what's still open - plus the fan page ticket. No event web
// on a phone (that's the desktop's job); open items get done on Needs me.
export default function EventOverviewSheet({ gig: base, onClose }) {
  const { user } = useAuth();
  const [gig, setGig] = useState(base);
  const [perms, setPerms] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let off = false;
    (async () => {
      const [g, p] = await Promise.all([
        supabase.rpc("get_shared_gig", { p_token: base.share_token }),
        supabase.rpc("get_gig_section_permissions", { p_token: base.share_token }),
      ]);
      if (off) return;
      if (g.error) console.error(g.error);
      if (p.error) console.error(p.error);
      if (g.data) setGig({ ...base, ...g.data, icon_url: base.icon_url || g.data.icon_url });
      setPerms(p.data || null);
      setLoading(false);
    })();
    return () => { off = true; };
  }, [base]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const color = eventTypeColor(gig.event_type) || G;
  const title = eventTitle(gig);
  const when = gig.date ? new Date(gig.date + "T00:00:00") : null;
  const vi = gig.venue_info || {};
  const mi = gig.manager_info || {};
  const place = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const ros = buildRunOfShow(gig);
  const acts = (gig.bands || []).filter((b) => b.band_name);
  const rows = loading ? [] : feedRows(gig, perms, user?.id || null);
  const facts = [
    ["Doors", (vi.schedule || []).find((r) => /door/i.test(r.label || ""))?.time],
    ["Capacity", vi.capacity],
    ["Ages", vi.age_policy],
    ["Curfew", vi.hard_curfew],
    ["Load-in", vi.load_in_location],
    ["Parking", vi.parking],
  ].filter(([, v]) => has(v));
  const contacts = [
    has(mi.contact_name) || has(mi.contact_phone) || has(mi.contact_email)
      ? { who: mi.contact_name || "Manager / Artist", role: mi.contact_title || "Manager / Artist", phone: mi.contact_phone, email: mi.contact_email, color: ROLE_COLOR.manager }
      : null,
  ].filter(Boolean);

  const label = (t, right) => (
    <div className="flex items-center text-[11px] tracking-[0.14em] text-white/50 mb-2" style={{ fontFamily: SCENE_MONO }}>
      {t}{right && <span className="ml-auto text-white/35">{right}</span>}
    </div>
  );
  const box = "rounded-xl border border-[#242424] bg-[#121212]";

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[#0d0d0d] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label={`${title} overview`} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Photo header */}
      <div className="relative isolate overflow-hidden min-h-[220px] flex flex-col justify-end px-5 pb-4" style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
        {gig.icon_url ? (
          <img src={gig.icon_url} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 -z-10" style={{ background: `radial-gradient(120% 120% at 70% 0%, ${color}55, #0d0d0d 70%)` }} />
        )}
        <span className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(13,13,13,0.25) 0%, rgba(13,13,13,0.55) 45%, #0d0d0d 100%)" }} />
        <button type="button" onClick={onClose} aria-label="Back to the calendar" className="absolute left-4 w-11 h-11 rounded-full bg-black/55 text-white flex items-center justify-center" style={{ top: "max(14px, env(safe-area-inset-top))" }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        {gig.event_type && (
          <span className="self-start text-[10px] tracking-[0.1em] px-2 py-[3px] rounded mb-2" style={{ fontFamily: SCENE_MONO, color, background: "rgba(0,0,0,0.55)", border: `1px solid ${color}66` }}>{gig.event_type.toUpperCase()}</span>
        )}
        <h1 className="m-0 text-[32px] leading-[1.05] font-bold text-white tracking-[0.02em]" style={{ fontFamily: SCENE_FONT }}>{title}</h1>
        <p className="m-0 mt-1.5 text-[12px] tracking-[0.08em] text-white/75 uppercase" style={{ fontFamily: SCENE_MONO }}>
          {[when ? when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "No date yet", gig.event_time].filter(Boolean).join(" · ")}
        </p>
        {place && (
          <p className="m-0 mt-1 flex items-center gap-1.5 text-[14px] text-white/80"><MapPin className="w-4 h-4 shrink-0" style={{ color }} /><span className="truncate">{place}</span></p>
        )}
        {has(vi.address) && <p className="m-0 mt-0.5 pl-[22px] text-[13px] text-white/55 truncate">{vi.address}</p>}
      </div>

      <div className="max-w-lg mx-auto px-5 pb-10 flex flex-col gap-5">
        {/* Fan page ticket, as on the calendar card */}
        <div className="flex items-center gap-3 empty:hidden">
          <FanPageButton show={gig} />
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: color + "40", borderTopColor: color }} /></div>
        ) : (
          <>
            {facts.length > 0 && (
              <section>
                {label("AT A GLANCE")}
                <div className={`${box} grid grid-cols-2`}>
                  {facts.map(([k, v], i) => (
                    <div key={k} className={`px-3 py-2.5 min-w-0 ${i % 2 === 0 ? "border-r border-[#1f1f1f]" : ""} ${i >= 2 ? "border-t border-[#1f1f1f]" : ""}`}>
                      <div className="text-[10px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{k.toUpperCase()}</div>
                      <div className="text-[15px] text-white mt-0.5 break-words">{v}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              {label("RUN OF SHOW")}
              {ros.length ? (
                <div className={`${box} divide-y divide-[#1f1f1f] overflow-hidden`}>
                  {ros.map((r, i) => (
                    <div key={i} className="grid grid-cols-[84px_10px_minmax(0,1fr)] items-center gap-2.5 px-3 py-2.5">
                      <span className="text-[13px] text-white/75" style={{ fontFamily: SCENE_MONO }}>{r.time || "—"}</span>
                      <span className="w-2 h-2 rounded-full" style={{ background: r.kind === "curfew" ? "#F87171" : r.kind === "set" || r.kind === "travel" ? ROLE_COLOR.manager : ROLE_COLOR.venue }} />
                      <span className="text-[15px] text-white truncate">{r.label || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`${box} m-0 px-3 py-3 text-[14px] text-white/45`}>No times yet.</p>
              )}
            </section>

            {acts.length > 0 && (
              <section>
                {label("LINEUP", `${acts.length} ACT${acts.length === 1 ? "" : "S"}`)}
                <div className={`${box} divide-y divide-[#1f1f1f] overflow-hidden`}>
                  {acts.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-5 text-right text-[16px] font-bold tabular-nums" style={{ color: ROLE_COLOR.band }}>{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] text-white truncate">{b.band_name}</span>
                        {b.role && b.role !== "N/A" && <span className="block text-[10.5px] tracking-[0.08em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{b.role.toUpperCase()}</span>}
                      </span>
                      <span className="text-[13px] text-white/70 shrink-0" style={{ fontFamily: SCENE_MONO }}>{(mi.set_times || {})[b.band_name] || ""}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              {label("WHO'S ON IT")}
              <div className={`${box} divide-y divide-[#1f1f1f] overflow-hidden`}>
                {WEB_ROLES.map((role) => {
                  const on = !!perms?.claimed_roles?.some((r) => HOLDERS[role].includes(r));
                  const invited = !on && !!perms?.invited_roles?.some((r) => HOLDERS[role].includes(r));
                  return (
                    <div key={role} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: on || invited ? ROLE_COLOR[role] : "#3a3a3a" }} />
                      <span className="flex-1 text-[15px] text-white">{WEB_LABELS[role]}</span>
                      <span className="text-[10.5px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color: on ? G : invited ? "#EAB308" : "rgba(255,255,255,0.4)" }}>{on ? "ON IT" : invited ? "INVITED" : "NOBODY YET"}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {contacts.length > 0 && (
              <section>
                {label("CONTACTS")}
                <div className={`${box} divide-y divide-[#1f1f1f] overflow-hidden`}>
                  {contacts.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] text-white truncate">{c.who}</span>
                        <span className="block text-[10.5px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color: c.color }}>{String(c.role).toUpperCase()}</span>
                      </span>
                      {has(c.phone) && <a href={`tel:${c.phone}`} aria-label={`Call ${c.who}`} className="w-11 h-11 rounded-[10px] bg-[#1f1f1f] text-white flex items-center justify-center"><Phone className="w-5 h-5" /></a>}
                      {has(c.email) && <a href={`mailto:${c.email}`} aria-label={`Email ${c.who}`} className="w-11 h-11 rounded-[10px] bg-[#1f1f1f] text-white flex items-center justify-center"><Mail className="w-5 h-5" /></a>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              {label("STILL OPEN", rows.length ? `${rows.length} OPEN` : "")}
              {rows.length === 0 ? (
                <p className={`${box} m-0 px-3 py-3 text-[14px] text-white/45 flex items-center gap-2`}><Check className="w-4 h-4" style={{ color: G }} /> Nothing waiting on anyone.</p>
              ) : (
                <>
                  <div className={`${box} divide-y divide-[#1f1f1f] overflow-hidden`}>
                    {rows.map((r) => {
                      const pill = r.kind === "conflict" ? ["CONFLICT", { background: AMBER, color: "#0d0d0d" }]
                        : r.kind === "request" ? ["REQUEST", { background: "#fff", color: "#0d0d0d" }]
                        : r.kind === "task" ? ["TASK", { background: "#3b2a12", color: "#FF9A3D", border: `1px solid ${AMBER}66` }]
                        : r.kind === "pending" ? ["PENDING", { background: AMBER, color: "#0d0d0d" }]
                        : ["INVITE", { background: "#2a2a2a", color: "#ddd" }];
                      const isInvite = r.kind === "invite" || r.kind === "pending";
                      const text = r.kind === "task" ? r.task.title : r.kind === "invite" ? `${WEB_LABELS[r.role]} has nobody yet` : r.kind === "pending" ? `${WEB_LABELS[r.role]} invite sent` : `${r.req.name}${r.req.value ? ` · ${r.req.value}` : ""}`;
                      const sec = r.kind === "pending" ? `${WEB_LABELS[r.role]} · waiting to accept` : isInvite ? WEB_LABELS[r.role] : SECTION_LABEL[r.section] || r.section;
                      const c = r.kind === "pending" ? AMBER : ROLE_COLOR[isInvite ? r.role : r.section] || "#9A9A9A";
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="shrink-0 w-[76px] text-center text-[10px] font-bold tracking-[0.1em] py-[4px] rounded" style={{ fontFamily: SCENE_MONO, ...pill[1] }}>{pill[0]}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-white leading-snug">{text}</span>
                            <span className="block text-[10.5px] tracking-[0.08em] mt-0.5" style={{ fontFamily: SCENE_MONO, color: c }}>{String(sec).toUpperCase()}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="m-0 mt-2 text-[12px] text-white/40">Check these off on Needs me.</p>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
