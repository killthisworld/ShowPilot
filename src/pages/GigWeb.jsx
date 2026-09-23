import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, ChevronRight, MessageCircle, User, UserPlus } from "lucide-react";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { useRoleProfile, RoleProfileBody } from "@/pages/RoleFullProfile";
import { useGigInvite, InviteModal } from "@/pages/SharedGig";
import RoomChatPanel from "@/components/showpilot/RoomChatPanel";

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

// Renders standalone at /gig/web?token=... (reached from SharedGig's "Gig
// Web" button - a real page, real back button) and also embeds directly
// inside the constellation home screen (BandHome) as a front-of-page layer:
// passing `token`+`onClose` skips the URL read and swaps the back button
// for a close call, so the same component serves both without a fork.
//
// This is the whole gig, not a preview of it: the web at the top is a
// persistent selector (a role star, or the center hub for the overview),
// and everything below - status, Profile/Rooms tabs, and the bulletin
// board - re-renders for whichever is currently selected. There is no
// separate "open full profile" page to jump to anymore; tapping a star
// IS opening it.
export default function GigWeb({ token: tokenProp, onClose } = {}) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = tokenProp || params.get("token");
  const goBack = () => (onClose ? onClose() : navigate(`/gig/shared?token=${token}`));

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gig, setGig] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null); // null = center/overview
  const [activeTab, setActiveTab] = useState("profile"); // "profile" | "rooms"
  const [rooms, setRooms] = useState([]);
  const [roomMembers, setRoomMembers] = useState({}); // roomId -> member rows

  const loadGig = async () => {
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
  useEffect(() => { loadGig(); }, [token]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setCheckingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Rooms require a signed-in participant (the RPC itself rejects an
  // anonymous caller), so this only ever runs once auth resolves. A
  // visitor with no claimed/granted section on this gig legitimately
  // gets zero rooms back, including General - the Rooms tab's empty
  // state below handles that the same way GigRooms.jsx already does.
  useEffect(() => {
    if (checkingAuth || !user || !token) return;
    supabase.rpc("ensure_my_gig_room_membership", { p_token: token }).then(({ data, error }) => {
      if (!error && data) setRooms(data.rooms || []);
    });
  }, [checkingAuth, user, token]);

  // The "message someone in this room" roster only matters once the
  // Rooms tab is actually open on a specific role, so it's fetched lazily
  // per room and cached rather than pulled for every role up front.
  useEffect(() => {
    if (activeTab !== "rooms" || !selectedRole || !user) return;
    const room = rooms.find((r) => r.section === selectedRole);
    if (!room || roomMembers[room.id]) return;
    supabase.rpc("get_conversation_member_profiles", { p_conversation_id: room.id }).then(({ data, error }) => {
      if (!error) setRoomMembers((prev) => ({ ...prev, [room.id]: data || [] }));
    });
  }, [activeTab, selectedRole, rooms, user, roomMembers]);

  const selectRole = (role) => {
    setSelectedRole(role);
    setActiveTab("profile");
  };

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

  const selectedNode = selectedRole ? nodes.find((n) => n.role === selectedRole) : null;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={goBack} className="p-1 text-white/60 hover:text-white shrink-0">
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

          <button
            type="button"
            onClick={() => selectRole(null)}
            className="absolute flex flex-col items-center justify-center gap-1 rounded-[20px] bg-[#161616] border px-3 py-2.5 transition-colors"
            style={{
              left: cx, top: cy, transform: "translate(-50%, -50%)", width: 128, height: 108,
              borderColor: selectedRole === null ? "#8CFF3D" : "#2a2a2a",
              boxShadow: selectedRole === null ? "0 0 0 3px #8CFF3D33" : undefined,
            }}
          >
            {dateLabel && <div className="text-[10px] font-semibold text-white/40 tracking-wide uppercase">{dateLabel}</div>}
            <div className="text-[13.5px] font-bold text-white text-center leading-tight">{title}</div>
          </button>

          {nodes.map((n) => {
            const Icon = n.style.icon;
            const active = n.role === selectedRole;
            return (
              <button
                key={n.role}
                type="button"
                onClick={() => selectRole(n.role)}
                className="absolute flex flex-col items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                style={{ left: n.x, top: n.y, transform: "translate(-50%, -50%)" }}
              >
                <div className="relative" style={{ width: 62, height: 62 }}>
                  <div
                    className="rounded-full flex items-center justify-center"
                    style={{ width: 62, height: 62, background: `conic-gradient(${n.style.color} ${n.percent * 3.6}deg, #1f1f1f 0deg)`, boxShadow: active ? `0 0 0 3px ${n.style.color}55` : undefined }}
                  >
                    <div className="rounded-full flex items-center justify-center bg-[#0d0d0d]" style={{ width: 52, height: 52, color: n.style.color }}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  {n.claimed && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d0d0d]" style={{ background: n.style.color }} />}
                </div>
                <span className={`text-[10.5px] w-[76px] text-center leading-tight ${active ? "text-white" : "text-white/50"}`}>{n.style.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-lg mx-auto px-4 mt-5">
        <div className="flex items-center gap-2 mb-3">
          {selectedNode ? (
            <>
              <button
                type="button"
                onClick={() => selectRole(null)}
                className="flex items-center gap-1 text-white/40 hover:text-white text-xs font-semibold shrink-0 -ml-1 pl-1 pr-2 py-1 rounded-full hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Overview
              </button>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedNode.style.color }} />
              <span className="text-white font-semibold text-base truncate">{SECTION_LABELS[selectedRole]}</span>
              <span className="text-white/30 text-xs shrink-0 ml-auto">
                {selectedNode.claimed ? "Claimed" : selectedNode.invited ? "Invited" : "Not invited"} · {selectedNode.percent}%
              </span>
            </>
          ) : (
            <span className="text-white font-semibold text-base">Overview</span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={activeTab === "profile" ? { color: "#0d0d0d", background: "#8CFF3D" } : { color: "rgba(255,255,255,0.5)", background: "#161616" }}
          >
            {selectedRole ? "Profile" : "Board"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rooms")}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={activeTab === "rooms" ? { color: "#0d0d0d", background: "#8CFF3D" } : { color: "rgba(255,255,255,0.5)", background: "#161616" }}
          >
            Rooms
          </button>
        </div>

        <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-4 mb-4">
          {activeTab === "profile" ? (
            selectedRole ? (
              <ProfileTabPanel role={selectedRole} token={token} onChanged={loadGig} color={selectedNode?.style.color || "#8CFF3D"} requirements={gig.requirements} />
            ) : (
              <OverviewBoard nodes={nodes} onSelectRole={selectRole} />
            )
          ) : (
            <RoomsTabPanel
              selectedRole={selectedRole}
              roleLabel={selectedNode?.style.label}
              token={token}
              user={user}
              checkingAuth={checkingAuth}
              rooms={rooms}
              roomMembers={roomMembers}
            />
          )}
        </div>

        {!selectedRole && (
          <div className="mb-4">
            <OverviewActivityFeed nodes={nodes} requirements={gig.requirements} />
          </div>
        )}
      </div>
    </div>
  );
}

// The Profile tab for a selected role - the same fields/documents/
// requirements body RoleFullProfile.jsx renders on its own page, mounted
// here as its own independent copy (own fetch, own state) via the shared
// hook. `onChanged` refetches Gig Web's own gig/progress so the web's
// rings, the overview board and the bulletin board never sit stale after
// a save made right here.
function ProfileTabPanel({ role, token, onChanged, color, requirements }) {
  const p = useRoleProfile({ role, token, onChanged });
  // Invite is offered to the same people who can already edit this
  // section - the owner, or whoever holds/was granted it - so a manager
  // or promoter already in the seat can bring in a co-contact without
  // routing every invite through the owner.
  const invite = useGigInvite({ gigId: p.gig?.id, user: p.user });
  const inviteSectionKey = role === "engineer" ? "engineer_lighting" : role;
  // Whether there's any activity/actions-needed to lead with - gates both
  // the summary block itself and the divider under it, so a section with
  // nothing tracked yet goes straight into its fields with no dead space.
  const hasActivity = (requirements || []).some((r) => r.section === role);

  const goSignIn = (toRegister) => {
    const currentPath = window.location.pathname + window.location.search;
    try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
    window.location.href = `${toRegister ? "/register" : "/login"}?redirect=${encodeURIComponent(currentPath)}`;
  };

  if (p.loading || p.checkingAuth) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }
  if (p.notFound || !p.gig) {
    return <p className="text-white/40 text-sm text-center py-6">Couldn't load this section.</p>;
  }

  return (
    <div>
      {hasActivity && (
        <div className="mb-4">
          <RoleActivityFeed role={role} requirements={requirements} />
        </div>
      )}
      <div className={hasActivity ? "pt-4 border-t border-[#1f1f1f]" : ""}>
        {p.editable && (
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => invite.openInvite(inviteSectionKey, SECTION_LABELS[role])}
              className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
            >
              <UserPlus className="w-3 h-3" /> Invite
            </button>
          </div>
        )}
        <RoleProfileBody
          role={role}
          token={token}
          gig={p.gig}
          permissions={p.permissions}
          user={p.user}
          editable={p.editable}
          canEdit={p.canEdit}
          update={p.update}
          updateSection={p.updateSection}
          updateEngineerRole={p.updateEngineerRole}
          updateBand={p.updateBand}
          addBand={p.addBand}
          removeBand={p.removeBand}
          expandedBands={p.expandedBands}
          toggleExpanded={p.toggleExpanded}
          addRequirement={p.addRequirement}
          updateRequirementStatus={p.updateRequirementStatus}
          deleteRequirement={p.deleteRequirement}
          iemMonitorColors={p.iemMonitorColors}
          onSignIn={goSignIn}
        />
        {p.editable && (
          <button
            onClick={p.handleSave}
            disabled={p.saving}
            className="w-full mt-4 font-bold text-sm rounded-2xl px-4 py-3 disabled:opacity-50"
            style={{ background: color, color: "#0d0d0d" }}
          >
            {p.saved ? "Saved ✓" : p.saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
      <InviteModal
        inviteFor={invite.inviteFor}
        inviteRoleChoice={invite.inviteRoleChoice}
        inviteUrl={invite.inviteUrl}
        inviteCopied={invite.inviteCopied}
        generatingInvite={invite.generatingInvite}
        onClose={invite.closeInvite}
        onChooseEngineerRole={invite.chooseEngineerRole}
        onGenerate={invite.generateInvite}
        onCopy={invite.copyInviteUrl}
        onShare={invite.shareInviteUrl}
      />
    </div>
  );
}

// The Board tab for the center/overview node - "the profile of the
// center event itself" from the request: a rollup tile per role instead
// of fields to edit, since there's no single event-level section to edit
// here. Tapping a tile jumps straight to that role, same as its star.
// A 2-column grid instead of a stacked list halves the vertical space
// this takes for a typical 5-role gig, and the aligned grid reads as
// more structured than a loose list of rows.
function OverviewBoard({ nodes, onSelectRole }) {
  if (nodes.length === 0) {
    return <p className="text-white/30 text-sm text-center py-4">No roles on this gig yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {nodes.map((n) => {
        const Icon = n.style.icon;
        const statusLabel = n.claimed ? "Claimed" : n.invited ? "Invited" : "Not invited";
        const statusColor = n.claimed ? "#8CFF3D" : n.invited ? "#EAB308" : "rgba(255,255,255,0.35)";
        return (
          <button
            key={n.role}
            type="button"
            onClick={() => onSelectRole(n.role)}
            className="flex flex-col gap-1.5 bg-[#161616] hover:bg-[#1c1c1c] rounded-xl px-3 py-2.5 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: n.style.color + "18", color: n.style.color }}>
                <Icon className="w-3 h-3" />
              </div>
              <span className="text-white text-xs font-semibold truncate">{n.style.label}</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ color: statusColor, background: statusColor + "1A" }}>{statusLabel}</span>
              <span className="flex items-center gap-0.5 text-white/40 text-[10px] shrink-0">
                {n.percent}% <ChevronRight className="w-3 h-3 text-white/20" />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// The Rooms tab - the group chat for whatever's selected (a role's room,
// or General for the overview), plus, for a role, an inline roster of
// just that role's people with a Message button each so a PM can be
// started without leaving the web.
function RoomsTabPanel({ selectedRole, roleLabel, token, user, checkingAuth, rooms, roomMembers }) {
  const navigate = useNavigate();
  const [startingDM, setStartingDM] = useState(null);

  if (checkingAuth) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-6">
        <p className="text-white/50 text-sm mb-3">Sign in to view Rooms</p>
        <a href="/login" className="inline-block text-black bg-[#8CFF3D] text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#7ae62e]">Sign In</a>
      </div>
    );
  }

  const section = selectedRole || "general";
  const room = rooms.find((r) => r.section === section);
  if (!room) {
    return <p className="text-white/30 text-sm text-center py-6">You'll see this room once you're connected to a section on this gig.</p>;
  }

  const members = (roomMembers[room.id] || []).filter((m) => m.user_id !== user.id);

  const startDM = async (personId) => {
    if (startingDM) return;
    setStartingDM(personId);
    try {
      const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { p_token: token, p_other_user_id: personId });
      if (error) throw error;
      navigate(`/gig/messages?token=${token}&thread=${data.id}`);
    } catch (e) {
      console.error(e);
    }
    setStartingDM(null);
  };

  return (
    <div className="space-y-4">
      {selectedRole ? (
        members.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide">People in this room</p>
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between gap-2 bg-[#161616] rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-[#222] flex items-center justify-center">
                    {m.profile_photo_url ? <img src={m.profile_photo_url} alt="" className="w-full h-full object-cover" /> : <User className="w-3.5 h-3.5 text-white/30" />}
                  </div>
                  <span className="text-white text-sm truncate">{m.display_name || "Someone"}</span>
                </div>
                <button
                  onClick={() => startDM(m.user_id)}
                  disabled={!!startingDM}
                  className="flex items-center gap-1 text-[10px] font-semibold text-white/60 hover:text-white border border-white/15 hover:border-white/30 rounded-full px-2.5 py-1 shrink-0 disabled:opacity-50"
                >
                  <MessageCircle className="w-3 h-3" /> {startingDM === m.user_id ? "..." : "Message"}
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-white/30 text-xs">Everyone connected to this gig can post here.</p>
          <a href={`/gig/messages?token=${token}`} className="flex items-center gap-1 text-[10px] font-semibold text-white/60 hover:text-white border border-white/15 hover:border-white/30 rounded-full px-2.5 py-1 shrink-0">
            <MessageCircle className="w-3 h-3" /> Private Messages
          </a>
        </div>
      )}

      <RoomChatPanel
        roomId={room.id}
        user={user}
        emptyLabel="No messages yet - say hello."
        placeholder={`Message ${selectedRole ? roleLabel : "General"}...`}
      />
    </div>
  );
}

// The bulletin board underneath everything - "up to date progress and
// activity, connects yet to be made, and further development on ones
// that have been made" - built entirely from data that already exists
// (show_requirements' status/updated_at, invite claimed/invited state)
// rather than a new activity-log table.
function RequirementRow({ r, sectionTag }) {
  const color = r.status === "conflict" ? "#EF4444" : r.status === "confirmed" ? "#8CFF3D" : "#EAB308";
  return (
    <div className="flex items-center justify-between gap-2 bg-[#161616] rounded-lg px-3 py-2">
      <span className="text-white/70 text-xs truncate">
        {sectionTag && <span className="text-white/30 uppercase text-[9px] font-bold mr-1.5">{sectionTag}</span>}
        {r.name}{r.value ? ` — ${r.value}` : ""}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0" style={{ color, background: color + "1A" }}>
        {r.status || "requested"}
      </span>
    </div>
  );
}

function byRecent(a, b) {
  return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
}

function RoleActivityFeed({ role, requirements }) {
  const reqs = (requirements || []).filter((r) => r.section === role);
  if (reqs.length === 0) return null;
  const open = reqs.filter((r) => r.status !== "confirmed").sort(byRecent);
  const list = open.length > 0 ? open : [...reqs].sort(byRecent);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide">{open.length > 0 ? "Needs attention" : "Recent activity"}</p>
      <div className="flex flex-col gap-1">
        {list.slice(0, 4).map((r) => <RequirementRow key={r.id} r={r} />)}
      </div>
    </div>
  );
}

function OverviewActivityFeed({ nodes, requirements }) {
  const notInvited = nodes.filter((n) => !n.claimed && !n.invited);
  const pendingInvites = nodes.filter((n) => n.invited && !n.claimed);
  const allReqs = [...(requirements || [])].sort(byRecent);
  const needsAttention = allReqs.filter((r) => r.status !== "confirmed").slice(0, 4);
  const list = needsAttention.length > 0 ? needsAttention : allReqs.slice(0, 4);
  const hasConnections = notInvited.length > 0 || pendingInvites.length > 0;

  if (!hasConnections && list.length === 0) {
    return <p className="text-white/25 text-xs text-center py-3">All roles connected - nothing waiting on anyone right now.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {hasConnections && (
        <div className="flex flex-col gap-1.5">
          <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide">Connections yet to be made</p>
          <div className="flex flex-wrap gap-1.5">
            {pendingInvites.map((n) => (
              <span key={n.role} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ color: "#EAB308", background: "#EAB30818" }}>{n.style.label} invited</span>
            ))}
            {notInvited.map((n) => (
              <span key={n.role} className="text-[10px] font-semibold px-2 py-1 rounded-full text-white/40 bg-white/5">{n.style.label} not invited</span>
            ))}
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide">{needsAttention.length > 0 ? "Needs attention" : "Recent activity"}</p>
          <div className="flex flex-col gap-1">
            {list.map((r) => <RequirementRow key={r.id} r={r} sectionTag={SECTION_LABELS[r.section]?.split(" ")[0]} />)}
          </div>
        </div>
      )}
    </div>
  );
}
