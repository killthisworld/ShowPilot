import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, X, ChevronRight } from "lucide-react";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";

// The 5 roles a gig always has, in radial order. Position/color here
// intentionally match SharedGig's SECTION_COLORS and Home's progress bar,
// so this hub reads as another view of the same show rather than a new
// visual language to learn.
const ROLE_ORDER = ["venue", "promoter", "booking_agent", "manager", "engineer"];

// get_gigs_progress keys the combined Manager/Band section "manager_band";
// everywhere else in this file (permissions, invited_role, routing) it's
// just "manager" - this is the one place that mismatch has to be bridged.
const PROGRESS_KEY = { venue: "venue", promoter: "promoter", booking_agent: "booking_agent", manager: "manager_band", engineer: "engineer" };

const SECTION_LABELS = { venue: "Venue", promoter: "Promoter", booking_agent: "Booking Agent", manager: "Manager / Band", engineer: "Audio / Lighting" };

function roleClaimed(role, permissions) {
  if (role === "engineer") return !!(permissions?.claimed_roles?.includes("engineer") || permissions?.claimed_roles?.includes("lighting"));
  return !!permissions?.claimed_roles?.includes(role);
}
function roleInvited(role, permissions) {
  if (role === "engineer") return !!(permissions?.invited_roles?.includes("engineer") || permissions?.invited_roles?.includes("lighting"));
  return !!permissions?.invited_roles?.includes(role);
}

function profileHref(role, token) {
  return role === "venue" ? `/gig/venue?token=${token}` : `/gig/role?role=${role}&token=${token}`;
}

export default function GigWeb() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [gig, setGig] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      try {
        const [gigRes, permsRes] = await Promise.all([
          supabase.rpc("get_shared_gig", { p_token: token }),
          supabase.rpc("get_gig_section_permissions", { p_token: token }),
        ]);
        if (gigRes.error || !gigRes.data) { setNotFound(true); setLoading(false); return; }
        setGig(gigRes.data);
        setPermissions(permsRes.data || { is_owner: false, my_roles: [], claimed_roles: [], invited_roles: [], granted_sections: [] });

        // Best-effort - the ring for a role just reads 0% until this call
        // succeeds, so a stale/missing RPC never blocks the rest of the hub.
        const progRes = await supabase.rpc("get_gigs_progress", { p_show_ids: [gigRes.data.id] });
        if (!progRes.error && progRes.data?.[0]) setProgress(progRes.data[0].progress || {});
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !gig) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Gig not found</p>
          <p className="text-white/30 text-sm">This share link may be invalid.</p>
        </div>
      </div>
    );
  }

  const isIncluded = (role) => !gig.included_sections || gig.included_sections.includes(role);
  const roles = ROLE_ORDER.filter(isIncluded);
  const title = gig.event_name || gig.band_name || "Untitled Gig";
  const dateLabel = gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";

  const cx = 170, cy = 170, r = 128;
  const nodes = roles.map((role, i) => {
    const angle = (-90 + i * (360 / roles.length)) * (Math.PI / 180);
    const style = ACCOUNT_TYPE_STYLES[role] || ACCOUNT_TYPE_STYLES.engineer;
    const percent = Math.round((progress[PROGRESS_KEY[role]]?.percent || 0) * 100);
    return {
      role,
      x: Math.round((cx + r * Math.cos(angle)) * 10) / 10,
      y: Math.round((cy + r * Math.sin(angle)) * 10) / 10,
      style,
      percent,
      claimed: roleClaimed(role, permissions),
      invited: roleInvited(role, permissions),
    };
  });

  const activeCount = nodes.filter((n) => n.claimed).length;
  const selected = nodes.find((n) => n.role === selectedRole) || null;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate(`/gig/shared?token=${token}`)} className="p-1 text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-lg leading-tight truncate">{title}</h1>
            <p className="text-white/40 text-xs mt-0.5 truncate">{[dateLabel, gig.venue].filter(Boolean).join(" · ") || "Tap a role to see status"}</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto flex flex-col items-center">
        <div className="relative shrink-0" style={{ width: 340, height: 340 }}>
          <svg width="340" height="340" className="absolute left-0 top-0 pointer-events-none">
            {nodes.map((n) => (
              <line key={n.role} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#242424" strokeWidth="1.5" />
            ))}
          </svg>

          <div
            className="absolute flex flex-col items-center justify-center gap-1 rounded-[20px] bg-[#161616] border border-[#2a2a2a] px-3 py-2.5"
            style={{ left: cx, top: cy, transform: "translate(-50%, -50%)", width: 128, height: 108 }}
          >
            {dateLabel && <div className="text-[10px] font-semibold text-white/40 tracking-wide uppercase">{dateLabel}</div>}
            <div className="text-[13.5px] font-bold text-white text-center leading-tight">{title}</div>
          </div>

          {nodes.map((n) => {
            const Icon = n.style.icon;
            return (
              <button
                key={n.role}
                type="button"
                onClick={() => setSelectedRole(n.role)}
                className="absolute flex flex-col items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                style={{ left: n.x, top: n.y, transform: "translate(-50%, -50%)" }}
              >
                <div className="relative" style={{ width: 62, height: 62 }}>
                  <div
                    className="rounded-full flex items-center justify-center"
                    style={{ width: 62, height: 62, background: `conic-gradient(${n.style.color} ${n.percent * 3.6}deg, #1f1f1f 0deg)` }}
                  >
                    <div className="rounded-full flex items-center justify-center bg-[#0d0d0d]" style={{ width: 52, height: 52, color: n.style.color }}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  {n.claimed && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d0d0d]" style={{ background: n.style.color }} />}
                </div>
                <span className="text-[10.5px] text-white/50 w-[76px] text-center leading-tight">{n.style.label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-white/25 text-xs mt-6">{activeCount} of {nodes.length} roles active on this gig</p>
      </div>

      {selected && (
        <>
          <div onClick={() => setSelectedRole(null)} className="fixed inset-0 z-50 bg-black/60" />
          <div className="fixed left-0 right-0 bottom-0 z-50 bg-[#111111] border-t border-[#2a2a2a] rounded-t-[24px] px-5 pt-5 pb-7 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: selected.style.color }} />
                <span className="text-white font-semibold text-base">{SECTION_LABELS[selected.role]}</span>
              </div>
              <button onClick={() => setSelectedRole(null)} aria-label="Close" className="w-8 h-8 rounded-[10px] bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white/60" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>{selected.claimed ? "Claimed" : selected.invited ? "Invited, not yet claimed" : "Not invited yet"}</span>
                <span>{selected.percent}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#1f1f1f] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${selected.percent}%`, background: selected.style.color }} />
              </div>
            </div>

            <a
              href={`/gig/shared?token=${token}#section-${selected.role}`}
              className="flex items-center justify-between gap-2 bg-[#161616] border border-[#222222] rounded-[14px] px-4 py-3.5 text-white text-sm font-medium hover:bg-[#1a1a1a]"
            >
              View / edit this section on the Gig page
              <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
            </a>

            <a
              href={profileHref(selected.role, token)}
              className="flex items-center justify-center gap-1.5 font-bold text-sm rounded-[14px] px-4 py-3.5"
              style={{ background: selected.style.color, color: "#0d0d0d" }}
            >
              Open full profile →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
