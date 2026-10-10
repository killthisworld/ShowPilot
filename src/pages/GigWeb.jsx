import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, ChevronRight, MessageCircle, User, UserPlus, Plus, Check, Archive, Trash2, X, Ticket, ExternalLink } from "lucide-react";
import InviteSheet from "@/components/showpilot/InviteSheet";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import RoleWorkspace from "@/components/showpilot/RoleWorkspace";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { useRoleProfile, RoleProfileBody } from "@/pages/RoleFullProfile";
import { useGigInvite, InviteModal, Field } from "@/pages/SharedGig";
import RoomChatPanel from "@/components/showpilot/RoomChatPanel";
import { usePreferences } from "@/hooks/usePreferences";
import BottomTabs from "@/components/showpilot/BottomTabs";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import StatusStrip from "@/components/showpilot/StatusStrip";
import FlightLog from "@/components/showpilot/FlightLog";
import EventTypeIcon, { EventTypeGlyph } from "@/components/showpilot/EventTypeIcon";
import { eventTypeColor } from "@/lib/eventTypes";
import { fetchMyIcons, uploadIconImage, saveMyIcon } from "@/lib/eventIcons";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import useIsDesktop from "@/hooks/useIsDesktop";

// Short console-style codes for the role channel buttons.
const ROLE_CODES = { venue: "VENUE", promoter: "PROMO", booking_agent: "AGENT", manager: "MGMT/ART", engineer: "AUD/LTG" };

// Same account-type split every other main page uses to choose between the
// two bottom tab bars (SharedGig.jsx's isTechProductionAccount, HomeRouter's
// TECHNICAL_PRODUCTION_TYPES) - kept as its own constant here so Gig Web
// doesn't have to import a whole page just for this one check.
const TECHNICAL_PRODUCTION_TYPES = ["engineer", "lighting"];

// The 5 roles a gig always has, in radial order. Position/color here
// intentionally match SharedGig's SECTION_COLORS and Home's progress bar,
// so this hub reads as another view of the same show rather than a new
// visual language to learn.
const ROLE_ORDER = ["venue", "promoter", "booking_agent", "manager", "engineer"];

// get_gigs_progress keys the combined Manager/Artist section "manager_band";
// everywhere else in this file (permissions, invited_role, routing) it's
// just "manager" - this is the one place that mismatch has to be bridged.
const PROGRESS_KEY = { venue: "venue", promoter: "promoter", booking_agent: "booking_agent", manager: "manager_band", engineer: "engineer" };

const SECTION_LABELS = { venue: "Venue", promoter: "Promoter", booking_agent: "Booking Agent", manager: "Manager / Artist", engineer: "Audio / Lighting" };

function roleClaimed(role, permissions) {
  if (role === "engineer") return !!(permissions?.claimed_roles?.includes("engineer") || permissions?.claimed_roles?.includes("lighting"));
  return !!permissions?.claimed_roles?.includes(role);
}
function roleInvited(role, permissions) {
  if (role === "engineer") return !!(permissions?.invited_roles?.includes("engineer") || permissions?.invited_roles?.includes("lighting"));
  return !!permissions?.invited_roles?.includes(role);
}

// Mirrors set_gig_task_status's own permission check exactly - owner, holds
// the role, was granted the section, or is the first visitor to an
// invited-but-unclaimed section - computed from the permissions Gig Web
// already has at the top level, so the Tasks tab can show the right Mark
// done control for whichever role is selected without a second fetch.
function roleEditable(role, permissions) {
  if (!permissions) return false;
  if (permissions.is_owner) return true;
  const roleMatch = role === "engineer" ? ["engineer", "lighting"] : [role];
  if ((permissions.my_roles || []).some((r) => roleMatch.includes(r))) return true;
  if ((permissions.granted_sections || []).includes(role)) return true;
  return roleInvited(role, permissions) && !roleClaimed(role, permissions);
}

// Renders standalone at /gig/web?token=... (reached from SharedGig's "Gig
// Web" button - a real page, real back button) and also embeds directly
// inside the constellation home screen (BandHome) as a front-of-page layer:
// passing `token`+`onClose` skips the URL read and swaps the back button
// for a close call, so the same component serves both without a fork.
//
// This is the whole gig, not a preview of it: the web at the top is a
// persistent selector (a role star, or the center hub for the overview),
// and everything below - status, and the Profile/Board, Tasks and Rooms
// tabs - re-renders for whichever is currently selected. There is no
// separate "open full profile" page to jump to anymore; tapping a star
// IS opening it. The standalone page's back button goes home (this is
// now the primary place to work a gig, so there's no reason to detour
// through the old block-based SharedGig page on the way out), and the
// same 3-tab bar every other main page has stays pinned at the bottom
// here too, so leaving the web is never the only way out.
export default function GigWeb({ token: tokenProp, onClose, onGigChanged } = {}) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = tokenProp || params.get("token");
  const goBack = () => (onClose ? onClose() : navigate("/"));
  const { preferences } = usePreferences();
  const isDesktop = useIsDesktop();
  const isTechProductionAccount = TECHNICAL_PRODUCTION_TYPES.includes(preferences?.account_type || "engineer");

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gig, setGig] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [myIcon, setMyIcon] = useState(null); // this person's own icon for the gig, if any
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // A pilot-card visit opened from the Rooms tab passes back a role= and
  // tab=rooms so its own back button returns to the exact room the
  // person was chatting in, not just the overview - only meaningful for
  // the standalone /gig/web route (embedded usage via tokenProp always
  // starts fresh at Overview, since BandHome's own URL has no such params).
  const [selectedRole, setSelectedRole] = useState(() => {
    if (tokenProp) return null;
    const r = params.get("role");
    return r && r !== "general" ? r : null;
  }); // null = center/overview
  const [activeTab, setActiveTab] = useState(() => (!tokenProp && params.get("tab") === "rooms" ? "rooms" : "profile")); // "profile" | "tasks" | "rooms"
  // Whether the Profile tab shows the full editable fields (RoleProfileBody)
  // or stays collapsed behind "Open Full Profile". Resets to collapsed
  // every time a different role (or the same one again) is selected.
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomMembers, setRoomMembers] = useState({}); // roomId -> member rows
  // Owner-only gig management. Archive is reversible (Settings > Archived
  // has an Unarchive already, unchanged by this) so it fires straight
  // away; delete is permanent (cascades through every child table -
  // tasks, requirements, invites, rooms, everyone's linked copy) so it
  // sits behind a confirm step.
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFanSheet, setShowFanSheet] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const loadGig = async () => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    try {
      const [gigRes, permsRes] = await Promise.all([
        supabase.rpc("get_shared_gig", { p_token: token }),
        supabase.rpc("get_gig_section_permissions", { p_token: token }),
      ]);
      if (gigRes.error || !gigRes.data) { setNotFound(true); setLoading(false); return; }
      setGig(gigRes.data);
      fetchMyIcons().then((m) => setMyIcon(m[gigRes.data.id] || null));
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
  // A role workspace opened in its own window posts back after it saves.
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin === window.location.origin && e.data?.type === "showpilot:gig-changed" && e.data.token === token) loadGig();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [token]);

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
    if ((activeTab !== "rooms" && !isDesktop) || !selectedRole || !user) return;
    const room = rooms.find((r) => r.section === selectedRole);
    if (!room || roomMembers[room.id]) return;
    supabase.rpc("get_conversation_member_profiles", { p_conversation_id: room.id }).then(({ data, error }) => {
      if (!error) setRoomMembers((prev) => ({ ...prev, [room.id]: data || [] }));
    });
  }, [activeTab, selectedRole, rooms, user, roomMembers, isDesktop]);

  const selectRole = (role) => {
    setSelectedRole(role);
    setActiveTab("profile");
    setProfileExpanded(false);
  };

  // Tasks live on the gig itself (not per-role, like useRoleProfile's
  // requirements), since the Board tab needs to show all of them and a
  // task's section is just where it happens to point - so state and the
  // two mutations live here and get handed down to both the Board and
  // whichever role's Profile tab is open.
  const addTask = async (section, title) => {
    const { data, error } = await supabase.rpc("add_gig_task", { p_token: token, p_section: section, p_title: title });
    if (error) { console.error(error); throw error; }
    setGig((g) => ({ ...g, tasks: [...(g.tasks || []), data] }));
  };
  const completeTask = async (taskId, done = true) => {
    const { data, error } = await supabase.rpc("set_gig_task_status", { p_token: token, p_task_id: taskId, p_done: done });
    if (error) { console.error(error); throw error; }
    setGig((g) => ({ ...g, tasks: (g.tasks || []).map((t) => (t.id === taskId ? data : t)) }));
  };

  // Both go straight through the shows table (same RLS-gated pattern
  // Home.jsx's own archive/delete already use - owner_id = auth.uid() is
  // enforced server-side, this is just the same door from a second
  // room). `onGigChanged` lets an embedding page (BandHome's
  // constellation) drop the star immediately instead of waiting for a
  // full reload; the standalone /gig/web route doesn't need it since
  // goBack() already navigates home and remounts everything fresh there.
  const archiveShow = async () => {
    if (archiving || deleting || !gig?.id) return;
    setArchiving(true);
    try {
      const { error } = await supabase.from("shows").update({ archived: true }).eq("id", gig.id);
      if (error) throw error;
      onGigChanged?.();
      goBack();
    } catch (e) {
      console.error(e);
      setArchiving(false);
    }
  };

  const deleteShow = async () => {
    if (deleting || !gig?.id) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("shows").delete().eq("id", gig.id);
      if (error) throw error;
      onGigChanged?.();
      goBack();
    } catch (e) {
      console.error(e);
      setDeleting(false);
    }
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

  // Sized down slightly from the original 340/170/128 to bring the board
  // up into view sooner - icon size is untouched (still a comfortable tap
  // target), just the overall footprint and the spokes' reach. Radial
  // layout (angle = role index around a circle) has room to grow past 5
  // spokes later without a rework, for when connections between profiles
  // - not just profile-to-center - start adding their own lines to this
  // same web.
  const cx = 150, cy = 150, r = 112;
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

  const openTasks = (gig.tasks || []).filter((t) => t.status !== "done");
  const openTasksFor = (role) => openTasks.filter((t) => t.section === role).length;
  const avgPercent = nodes.length ? Math.round(nodes.reduce((a, n) => a + n.percent, 0) / nodes.length) : 0;
  const stripCells = selectedNode
    ? [
        { label: "FIELDS FILLED", value: `${selectedNode.percent}%`, color: selectedNode.style.color },
        { label: "OPEN TASKS", value: String(openTasksFor(selectedNode.role)), color: openTasksFor(selectedNode.role) ? "#F59E0B" : "#8CFF3D" },
        { label: "STATUS", value: selectedNode.claimed ? "CLAIMED" : selectedNode.invited ? "INVITED" : "OPEN", color: selectedNode.claimed ? "#8CFF3D" : selectedNode.invited ? "#EAB308" : "#9A9A9A" },
      ]
    : [
        { label: "ROLES CONFIRMED", value: `${nodes.filter((n) => n.claimed).length}/${nodes.length}`, color: "#8CFF3D" },
        { label: "OPEN TASKS", value: String(openTasks.length), color: openTasks.length ? "#F59E0B" : "#8CFF3D" },
        { label: "GIG READY", value: `${avgPercent}%`, color: avgPercent >= 100 ? "#8CFF3D" : "#60A5FA" },
      ];
  const tabCounts = {
    profile: selectedNode ? null : nodes.length,
    tasks: selectedNode ? openTasksFor(selectedNode.role) : openTasks.length,
    rooms: null,
  };

  const actionButtons = (() => {
    // Each action is an icon with a word under it, so none of them
    // has to be guessed at. Fan page is the public page for fans;
    // Archive hides the event (reversible); Delete removes it.
    const act = "flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md transition-colors";
    const cap = "text-[8px] tracking-[0.08em] leading-none";
    return (
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {(permissions?.is_owner || token) && (
          <button type="button" onClick={() => setShowFanSheet(true)} aria-label={permissions?.is_owner ? "Edit fan page" : "View fan page"} className={`${act} text-[#8CFF3D]/70 hover:text-[#8CFF3D]`}>
            <Ticket className="w-4 h-4" />
            <span className={cap} style={{ fontFamily: SCENE_MONO }}>FAN PAGE</span>
          </button>
        )}
        {permissions?.is_owner && (
          <>
            <button type="button" onClick={() => setShowArchiveConfirm(true)} disabled={archiving} aria-label="Archive gig" className={`${act} text-white/45 hover:text-white disabled:opacity-40`}>
              <Archive className="w-4 h-4" />
              <span className={cap} style={{ fontFamily: SCENE_MONO }}>ARCHIVE</span>
            </button>
            <button type="button" onClick={() => setShowDeleteConfirm(true)} aria-label="Delete gig" className={`${act} text-red-400/60 hover:text-red-400`}>
              <Trash2 className="w-4 h-4" />
              <span className={cap} style={{ fontFamily: SCENE_MONO }}>DELETE</span>
            </button>
          </>
        )}
      </div>
    );
  })();

  const overlays = (
    <>
      {showFanSheet && gig?.id && <FanPageSheet showId={permissions?.is_owner ? gig.id : undefined} shareToken={permissions?.is_owner ? undefined : token} onClose={() => setShowFanSheet(false)} />}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={() => !archiving && setShowArchiveConfirm(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-bold text-base">Archive this gig?</h3>
              <button onClick={() => setShowArchiveConfirm(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-white/40 text-xs mb-4">
              {title} will disappear from your home screen and its fan page will go offline. Nothing is deleted. You can bring it back any time from Settings, then Archived.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowArchiveConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] text-white/60 text-sm font-semibold hover:bg-white/5">Cancel</button>
              <button type="button" onClick={archiveShow} disabled={archiving} className="flex-1 py-2.5 rounded-xl bg-[#8CFF3D] text-black text-sm font-bold disabled:opacity-50">{archiving ? "Archiving..." : "Archive"}</button>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-bold text-base">Delete this gig?</h3>
              <button onClick={() => setShowDeleteConfirm(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-white/40 text-xs mb-4">
              This permanently deletes {title} — profiles, tasks, requirements, invites and every room's chat history. Anyone linked to it loses access. This can't be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/60 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteShow}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500/90 hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <DesktopGigWeb
        gig={gig} title={title} dateLabel={dateLabel} myIcon={myIcon} nodes={nodes}
        selectedRole={selectedRole} selectedNode={selectedNode} selectRole={selectRole}
        stripCells={stripCells} goBack={goBack} actionButtons={actionButtons} overlays={overlays}
        token={token} permissions={permissions} loadGig={loadGig} onGigChanged={onGigChanged}
        setMyIcon={setMyIcon} user={user} checkingAuth={checkingAuth} rooms={rooms} roomMembers={roomMembers}
        addTask={addTask} completeTask={completeTask} profileExpanded={profileExpanded} setProfileExpanded={setProfileExpanded}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24" style={{ fontFamily: SCENE_FONT }}>
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-3 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={goBack} className="p-1 text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <EventTypeIcon type={gig.event_type} imageUrl={myIcon || gig.icon_url} size={36} />
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-xl leading-tight truncate tracking-wide">{title}</h1>
            <p className="text-white/40 text-[10px] mt-0.5 truncate uppercase tracking-[0.1em]" style={{ fontFamily: SCENE_MONO }}>{[dateLabel, gig.venue].filter(Boolean).join(" · ") || "Tap a role to see status"}</p>
          </div>
          {actionButtons}
        </div>
      </div>

      <div className="px-4 pt-3 max-w-lg mx-auto">
        <StatusStrip cells={stripCells} />
      </div>

      <div className="px-4 pt-3 max-w-lg mx-auto flex flex-col items-center">
        <div className="relative shrink-0" style={{ width: 300, height: 300 }}>
          <svg width="300" height="300" className="absolute left-0 top-0 pointer-events-none" style={{ zIndex: 0 }}>
            {nodes.map((n) => (
              // Spokes stay neutral - selecting a role lights up its box, not its line.
              <line
                key={n.role}
                x1={cx} y1={cy} x2={n.x} y2={n.y}
                stroke={n.claimed ? "#4a4a4a" : "#383838"}
                strokeWidth={n.claimed ? 1.5 : 2.5}
                strokeLinecap="round"
                strokeDasharray={n.claimed ? undefined : "0.1 7"}
              />
            ))}
          </svg>

          <button
            type="button"
            onClick={() => selectRole(null)}
            className="absolute flex flex-col items-center justify-center gap-1 rounded-[20px] bg-[#161616] border px-3 py-2.5 transition-colors overflow-hidden"
            style={{
              left: cx, top: cy, transform: "translate(-50%, -50%)", width: 112, height: 96, zIndex: 1,
              borderColor: selectedRole === null ? "#D2FF85" : "#2a2a2a",
              borderWidth: selectedRole === null ? 2 : 1,
              boxShadow: selectedRole === null ? "0 0 0 3px #C6FF6B66, 0 0 30px #C6FF6BAA, 0 0 60px #B6FF5C44" : undefined,
            }}
          >
            {selectedRole === null && <span className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 40%, rgba(198,255,107,0.28), rgba(198,255,107,0.06) 70%)" }} />}
            {/* The event's icon as a faded backdrop: an uploaded image (dimmed, with a dark wash so text stays crisp) or the type glyph in its color. */}
            {(myIcon || gig.icon_url) ? (
              <>
                <img src={myIcon || gig.icon_url} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: 0.4 }} />
                <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(13,13,13,0.35), rgba(13,13,13,0.6))" }} />
              </>
            ) : eventTypeColor(gig.event_type) ? (
              <EventTypeGlyph
                type={gig.event_type}
                className="absolute pointer-events-none"
                style={{ width: 84, height: 84, right: -10, bottom: -12, color: eventTypeColor(gig.event_type), opacity: 0.2, strokeWidth: 1.5 }}
              />
            ) : null}
            <div className="relative text-[15px] font-semibold text-white text-center leading-tight tracking-wide line-clamp-2" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.85)" }}>{title}</div>
          </button>

          {nodes.map((n) => {
            const active = n.role === selectedRole;
            return (
              <button
                key={n.role}
                type="button"
                onClick={() => selectRole(n.role)}
                className="absolute flex flex-col items-center justify-center gap-1 rounded-[14px] cursor-pointer px-1"
                style={{
                  left: n.x, top: n.y, transform: "translate(-50%, -50%)", width: 68, height: 56, zIndex: 1,
                  // Solid base so the spoke line behind never shows through; only the selected one lights up.
                  backgroundColor: "#161616",
                  backgroundImage: active ? `linear-gradient(${n.style.color}33, ${n.style.color}33)` : undefined,
                  border: `1.5px solid ${active ? n.style.color : "#2a2a2a"}`,
                  boxShadow: active ? `0 0 0 3px ${n.style.color}40, 0 0 16px ${n.style.color}66` : undefined,
                }}
              >
                <span className="font-bold leading-none whitespace-nowrap" style={{ fontFamily: SCENE_MONO, color: n.style.color, opacity: active ? 1 : 0.5, fontSize: ROLE_CODES[n.role].length > 5 ? 9.5 : 12, letterSpacing: ROLE_CODES[n.role].length > 5 ? "0.02em" : "0.06em" }}>{ROLE_CODES[n.role]}</span>
                <span className="w-[40px] h-[4px] rounded-full bg-[#0d0d0d] overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, n.percent)}%`, background: n.style.color, opacity: active ? 1 : 0.45 }} />
                </span>
                <span className={`text-[9px] leading-none ${active ? "text-white/80" : "text-white/35"}`} style={{ fontFamily: SCENE_MONO }}>{n.percent}%</span>
                {n.claimed && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0d0d0d]" style={{ background: n.style.color, opacity: active ? 1 : 0.5 }} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-lg mx-auto px-4 mt-2">
        <div className="flex items-center gap-2 mb-2">
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

        <div className="flex items-center gap-1.5 mb-2">
          {[
            { id: "profile", label: selectedRole ? "PROFILE" : "BOARD", color: "#60A5FA" },
            { id: "tasks", label: "TASKS", color: "#F59E0B" },
            { id: "rooms", label: "ROOMS", color: "#F472B6" },
          ].map((t) => {
            const on = activeTab === t.id;
            const count = tabCounts[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className="flex-1 py-2 rounded-lg text-[11px] font-semibold tracking-[0.1em] transition-colors"
                style={{ fontFamily: SCENE_MONO, color: on ? "#0d0d0d" : t.color, background: on ? t.color : t.color + "1A", border: `1px solid ${on ? t.color : t.color + "44"}` }}
              >
                {t.label}{count != null ? ` · ${count}` : ""}
              </button>
            );
          })}
        </div>

        <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-3 mb-4">
          {activeTab === "profile" ? (
            selectedRole ? (
              <ProfileTabPanel
                role={selectedRole}
                token={token}
                onChanged={loadGig}
                color={selectedNode?.style.color || "#8CFF3D"}
                expanded={profileExpanded}
                setExpanded={setProfileExpanded}
              />
            ) : (
              <OverviewBoard nodes={nodes} onSelectRole={selectRole} permissions={permissions} token={token} gig={gig} onChanged={loadGig} onGigChanged={onGigChanged} canPersonalIcon={!!user && !permissions?.is_owner} myIcon={myIcon} onMyIconChanged={(u) => { setMyIcon(u); onGigChanged?.(); }} />
            )
          ) : activeTab === "tasks" ? (
            <TasksTabPanel
              nodes={nodes}
              selectedRole={selectedRole}
              tasks={gig.tasks}
              permissions={permissions}
              isOwner={!!permissions?.is_owner}
              onAddTask={addTask}
              onCompleteTask={completeTask}
              onSelectRole={selectRole}
            />
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
      </div>

      {user && (isTechProductionAccount ? <BottomTabs /> : <BandBottomTabs />)}

      {overlays}
    </div>
  );
}

// The Profile tab for a selected role - the full editable
// fields/documents/requirements body (RoleFullProfile.jsx's, mounted here
// as its own independent copy via the shared hook), collapsed behind an
// "Open Full Profile" button by default so landing on a role doesn't drop
// straight into a long form. `expanded`/`setExpanded` are lifted to Gig
// Web itself so selecting a different role always resets back to
// collapsed. `onChanged` refetches Gig Web's own gig/progress so the
// web's rings and the overview board never sit stale after a save made
// right here. That role's open tasks live on their own Tasks tab now,
// not here - see TasksTabPanel below.
function ProfileTabPanel({ role, token, onChanged, color, expanded, setExpanded, onOpenWorkspace, compact }) {
  const p = useRoleProfile({ role, token, onChanged });
  // Invite is offered to the same people who can already edit this
  // section - the owner, or whoever holds/was granted it - so a manager
  // or promoter already in the seat can bring in a co-contact without
  // routing every invite through the owner.
  const invite = useGigInvite({ gigId: p.gig?.id, user: p.user });
  const inviteSectionKey = role === "engineer" ? "engineer_lighting" : role;
  const isDesktop = useIsDesktop();
  const opensOwnWindow = isDesktop && role !== "engineer";

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

  const inviteModal = (
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
  );

  // Desktop board header: just two small buttons, so the board's space
  // goes to the tasks instead of one big "open workspace" block.
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {p.editable && (
          <button type="button" onClick={() => invite.openInvite(inviteSectionKey, SECTION_LABELS[role])}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full border border-white/20 text-white/65 hover:text-white hover:border-white/40">
            <UserPlus className="w-3.5 h-3.5" /> Invite
          </button>
        )}
        {opensOwnWindow ? (
          <button type="button" onClick={() => onOpenWorkspace?.(role)}
            className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-full border hover:brightness-125"
            style={{ borderColor: `${color}73`, background: `${color}14`, color }}>
            {p.editable ? "Open workspace" : "See where they're at"} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button type="button" onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:text-white">
            Open full profile <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {inviteModal}
      </div>
    );
  }

  return (
    <div>
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

      {expanded ? (
        <div className="pt-4 border-t border-[#1f1f1f]">
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
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full mt-3 text-white/40 hover:text-white text-xs font-semibold py-2 text-center transition-colors"
          >
            Show summary only
          </button>
        </div>
      ) : opensOwnWindow ? (
        // Desktop company roles: the section opens as its own workspace
        // in a separate window, so this board stays the bulletin overview.
        <button
          type="button"
          onClick={() => (onOpenWorkspace ? onOpenWorkspace(role) : window.open(`/gig/role?token=${token}&role=${role}`, `showpilot-${token}-${role}`))}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold rounded-2xl px-4 py-3 border transition-colors hover:brightness-125"
          style={{ borderColor: `${color}73`, background: `${color}14`, color }}
        >
          {p.editable ? `Open ${SECTION_LABELS[role]} workspace` : `See where ${SECTION_LABELS[role]} is at`} {onOpenWorkspace ? <ChevronRight className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold rounded-2xl px-4 py-3 border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition-colors"
        >
          Open Full Profile <ChevronRight className="w-4 h-4" />
        </button>
      )}

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

// The event's own top-level details - owner-only, since update_shared_gig
// itself enforces that server-side ("Only the owner can edit event
// details") for exactly these fields. Local draft state so typing doesn't
// write into Gig Web's own `gig` on every keystroke; Save calls the same
// RPC the old SharedGig page used for this, then onChanged() (loadGig)
// picks the saved values back up everywhere else on the page (the header,
// the web's center hub, the status line) at once.
function EventDetailsEditor({ token, gig, onChanged, onIconChanged }) {
  const [eventName, setEventName] = useState(gig.event_name || "");
  const [date, setDate] = useState(gig.date || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setEventName(gig.event_name || ""); }, [gig.event_name]);
  useEffect(() => { setDate(gig.date || ""); }, [gig.date]);

  const dirty = eventName !== (gig.event_name || "") || date !== (gig.date || "");

  // The icon saves on its own (upload or remove), straight to the show row -
  // same owner-gated door archive/delete use - rather than waiting on Save.
  const [iconBusy, setIconBusy] = useState(false);
  const [iconError, setIconError] = useState("");
  const setIcon = async (url) => {
    const { error } = await supabase.from("shows").update({ icon_url: url }).eq("id", gig.id);
    if (error) throw error;
    onChanged?.();
    onIconChanged?.();
  };
  const uploadIcon = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setIconError("Image must be under 2 MB"); return; }
    setIconBusy(true);
    setIconError("");
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error("Not logged in");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const filePath = `${u.id}/event-icons/${Date.now()}.${ext || "png"}`;
      const { error: upErr } = await supabase.storage.from("profile-photos").upload(filePath, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
      await setIcon(urlData.publicUrl);
    } catch (err) {
      console.error(err);
      setIconError("Couldn't upload that image");
    }
    setIconBusy(false);
  };
  const removeIcon = async () => {
    setIconBusy(true);
    setIconError("");
    try { await setIcon(null); } catch (err) { console.error(err); setIconError("Couldn't remove it"); }
    setIconBusy(false);
  };

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_shared_gig", { p_token: token, p_updates: { event_name: eventName, date: date || null } });
      if (error) throw error;
      setSaved(true);
      onChanged?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <div className="mb-4 pb-4 border-b border-[#1f1f1f]">
      <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide mb-2">Event Details</p>
      <div className="space-y-2.5">
        <Field label="Event Name" value={eventName} onChange={setEventName} editable placeholder="e.g. Friday Night Showcase" />
        <Field label="Date" value={date} onChange={setDate} editable type="date" />
        <div>
          <p className="text-white/50 text-xs mb-1">Event Icon</p>
          <div className="flex items-center gap-3">
            <EventTypeIcon type={gig.event_type || "Other"} imageUrl={gig.icon_url} size={44} />
            <label className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 cursor-pointer">
              {iconBusy ? "Working..." : gig.icon_url ? "Change image" : "Upload image"}
              <input type="file" accept="image/*" className="hidden" disabled={iconBusy} onChange={uploadIcon} />
            </label>
            {gig.icon_url && !iconBusy && (
              <button type="button" onClick={removeIcon} className="text-xs text-white/40 hover:text-red-400">Remove</button>
            )}
          </div>
          {iconError && <p className="text-red-400 text-[11px] mt-1">{iconError}</p>}
          <p className="text-white/25 text-[10px] mt-1">Shows on your lists and for everyone linked to this gig.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className="w-full mt-3 font-bold text-sm rounded-xl px-4 py-2.5 disabled:opacity-40 transition-colors"
        style={{ background: "#8CFF3D", color: "#0d0d0d" }}
      >
        {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

// Anyone linked to a gig (not just its owner) can give it their own icon.
// It's personal - only they see it on their lists and Gig Web - and takes
// priority over the owner's shared icon and the automatic type icon.
function MyIconControl({ gig, myIcon, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2 MB"); return; }
    setBusy(true); setError("");
    try {
      const url = await uploadIconImage(file);
      await saveMyIcon(gig.id, url);
      onChanged?.(url);
    } catch (err) { console.error(err); setError("Couldn't save that image"); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true); setError("");
    try { await saveMyIcon(gig.id, null); onChanged?.(null); } catch (err) { console.error(err); setError("Couldn't remove it"); }
    setBusy(false);
  };
  return (
    <div className="mb-4 pb-4 border-b border-[#1f1f1f]">
      <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide mb-2">My Icon For This Gig</p>
      <div className="flex items-center gap-3">
        <EventTypeIcon type={gig.event_type || "Other"} imageUrl={myIcon || gig.icon_url} size={44} />
        <label className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 cursor-pointer">
          {busy ? "Working..." : myIcon ? "Change image" : "Upload image"}
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={upload} />
        </label>
        {myIcon && !busy && <button type="button" onClick={remove} className="text-xs text-white/40 hover:text-red-400">Remove</button>}
      </div>
      {error && <p className="text-red-400 text-[11px] mt-1">{error}</p>}
      <p className="text-white/25 text-[10px] mt-1">Only you see this one, on your own lists.</p>
    </div>
  );
}

// The Board tab for the center/overview node - "the profile of the
// center event itself" from the request: a rollup tile per role instead
// of fields to edit for each role, since there's no single role section
// those belong to. The event's own top-level details (name, date - the
// fields update_shared_gig actually recognizes and which its own
// permission check restricts to the owner) get a small owner-only editor
// up top instead, since Gig Web otherwise had no path to them at all
// once the old SharedGig page stopped being where the back button leads.
// Tapping a role tile jumps straight to that role, same as its star. A
// 2-column grid instead of a stacked list halves the vertical space this
// takes for a typical 5-role gig, and the aligned grid reads as more
// structured than a loose list of rows. Tasks used to live inline above
// this grid; they're their own tab now (TasksTabPanel below) so the grid
// - the actual "what's the status of every role" board - sits right
// under the tab pills instead of under a full task list first.
//
// The "N claimed · M invited" line above the grid is the real headcount
// (every accepted/pending invite on the gig, from get_gig_section_permissions'
// claimed_count/invited_count) rather than the 5-role tile grid below it,
// which only shows one tile per section regardless of how many people
// hold it - so this is what actually scales as a gig grows past one
// person per role.
function OverviewBoard({ nodes, onSelectRole, permissions, token, gig, onChanged, onGigChanged, canPersonalIcon, myIcon, onMyIconChanged, hideInvite, foldDetails }) {
  // Desktop board: the event's name / date / icon editor folds into one line
  // so the role tiles and tasks lead. Phones keep it open, as before.
  const [detailsOpen, setDetailsOpen] = useState(!foldDetails);
  if (nodes.length === 0) {
    return <p className="text-white/30 text-sm text-center py-4">No roles on this gig yet.</p>;
  }
  const claimedCount = permissions?.claimed_count ?? 0;
  const invitedCount = permissions?.invited_count ?? 0;
  const showHeadcount = claimedCount > 0 || invitedCount > 0;
  return (
    <div>
      {permissions?.is_owner && gig && (detailsOpen ? (
        <>
          <EventDetailsEditor token={token} gig={gig} onChanged={onChanged} onIconChanged={onGigChanged} />
          {foldDetails && (
            <button type="button" onClick={() => setDetailsOpen(false)} className="-mt-2 mb-3 text-white/40 hover:text-white text-xs font-semibold">Done editing details</button>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-[#262626] bg-[#111]">
          <span className="text-[10px] tracking-[0.12em] text-white/40 shrink-0" style={{ fontFamily: SCENE_MONO }}>EVENT</span>
          <span className="text-sm text-white/80 truncate">{[gig.event_name || gig.band_name, gig.date && new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })].filter(Boolean).join(" · ") || "Add a name and date"}</span>
          <button type="button" onClick={() => setDetailsOpen(true)} className="ml-auto shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border border-white/20 text-white/65 hover:text-white">Edit details</button>
        </div>
      ))}
      {canPersonalIcon && gig && (
        <MyIconControl gig={gig} myIcon={myIcon} onChanged={onMyIconChanged} />
      )}
      {showHeadcount && (
        <div className="flex items-center gap-1.5 mb-3 text-xs">
          <span className="font-semibold" style={{ color: "#8CFF3D" }}>{claimedCount} claimed</span>
          <span className="text-white/20">·</span>
          <span className="font-semibold text-[#EAB308]">{invitedCount} invited</span>
        </div>
      )}
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

      {permissions?.is_owner && gig?.id && !hideInvite && (
        <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
          <InviteSheet
            showId={gig.id}
            elevated
            trigger={
              <button type="button" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold tracking-[0.04em] transition-colors" style={{ color: "#8CFF3D", background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)" }}>
                <UserPlus className="w-4 h-4" /> Invite profiles & users
              </button>
            }
          />
          <p className="text-white/30 text-[11px] text-center mt-1.5">Pick who you're bringing in, then send them their link.</p>
        </div>
      )}
    </div>
  );
}

// The Tasks tab - its own tab now instead of living inline at the top of
// the Board, so the Board's role grid isn't sitting under a full task
// list + add-task form. At the Overview level this is that same add-task
// form plus every open task (TasksSection, unchanged); select a role and
// it narrows to just that section's open tasks with the Mark done
// control (RoleTaskList, unchanged) - same components, same "guided"
// tap-a-task-to-go-fill-it-out behavior as before, just reachable from
// their own tab rather than nested inside Board/Profile.
function TasksTabPanel({ nodes, selectedRole, tasks, permissions, isOwner, onAddTask, onCompleteTask, onSelectRole }) {
  if (selectedRole) {
    const roleTasks = (tasks || []).filter((t) => t.section === selectedRole && t.status !== "done");
    if (roleTasks.length === 0) {
      return <p className="text-white/25 text-xs text-center py-3">Nothing outstanding for this section right now.</p>;
    }
    return <RoleTaskList tasks={roleTasks} editable={roleEditable(selectedRole, permissions)} onComplete={onCompleteTask} />;
  }

  const openTasks = (tasks || []).filter((t) => t.status !== "done");
  return <TasksSection nodes={nodes} tasks={openTasks} isOwner={isOwner} onAddTask={onAddTask} onSelectRole={onSelectRole} />;
}

// The board's Tasks section - free-form owner-created to-dos, each
// pointed at a section. This is the "digital board everyone can see and
// interact with" from the request: tapping a task jumps into that
// role's Profile tab (RoleTaskList below renders it there with a Mark
// done button), so the board itself stays a scannable list of what's
// still outstanding rather than a form.
function TasksSection({ nodes, tasks, isOwner, onAddTask, onSelectRole, notes }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState(nodes[0]?.role || "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !section || submitting) return;
    setSubmitting(true);
    try {
      await onAddTask(section, title.trim());
      setTitle("");
      setAdding(false);
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide">Tasks</p>
        {isOwner && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[#8CFF3D] text-[10px] font-semibold hover:bg-[#8CFF3D]/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Task
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-[#161616] rounded-xl p-2.5 mb-2 space-y-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
            placeholder="e.g. Book venues for East Coast leg"
            className="w-full h-9 bg-[#111] border border-[#222] rounded-lg px-3 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#333]"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {nodes.map((n) => (
              <button
                key={n.role}
                type="button"
                onClick={() => setSection(n.role)}
                className="text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors"
                style={section === n.role
                  ? { color: n.style.color, background: n.style.color + "22", borderColor: n.style.color + "60" }
                  : { color: "rgba(255,255,255,0.4)", borderColor: "#222" }}
              >
                {n.style.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setTitle(""); }} className="text-white/40 hover:text-white text-xs font-semibold px-2 py-1">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || submitting}
              className="bg-[#8CFF3D] text-black text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {tasks.length > 0 && notes ? (
        <div className="flex flex-wrap gap-x-3.5 gap-y-4 pt-1.5">
          {tasks.map((t, i) => {
            const node = nodes.find((n) => n.role === t.section);
            return <TaskNote key={t.id} i={i} title={t.title} color={node?.style.color || "#8CFF3D"} label={node?.style.label || t.section} onClick={() => onSelectRole(t.section)} />;
          })}
        </div>
      ) : tasks.length > 0 ? (
        <div className="space-y-1.5">
          {tasks.map((t) => {
            const node = nodes.find((n) => n.role === t.section);
            const color = node?.style.color || "#8CFF3D";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectRole(t.section)}
                className="w-full flex items-center gap-2 bg-[#161616] hover:bg-[#1c1c1c] rounded-xl px-3 py-2.5 transition-colors text-left"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-white text-sm truncate flex-1 min-w-0">{t.title}</span>
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0" style={{ color, background: color + "1A" }}>
                  {node?.style.label || t.section}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-white/20 shrink-0" />
              </button>
            );
          })}
        </div>
      ) : (
        !adding && <p className="text-white/25 text-xs">Nothing outstanding right now.</p>
      )}
    </div>
  );
}

// Rendered at the top of a role's Profile tab - the tasks that pointed
// here, each with a Mark done button for whoever can edit this section
// (owner, role-holder, or granted access - same `editable` flag the
// fields below already use).
function RoleTaskList({ tasks, editable, onComplete }) {
  const [completingId, setCompletingId] = useState(null);

  const complete = async (id) => {
    if (completingId) return;
    setCompletingId(id);
    try {
      await onComplete(id, true);
    } catch (e) {
      console.error(e);
    }
    setCompletingId(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-white/30 text-[10px] font-bold uppercase tracking-wide">Tasks for this section</p>
      <div className="flex flex-col gap-1">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 bg-[#161616] rounded-lg px-3 py-2">
            <span className="text-white/80 text-xs truncate">{t.title}</span>
            {editable && (
              <button
                type="button"
                onClick={() => complete(t.id)}
                disabled={!!completingId}
                className="flex items-center gap-1 text-[10px] font-semibold text-[#8CFF3D] hover:bg-[#8CFF3D]/10 px-2 py-1 rounded-full shrink-0 disabled:opacity-50 transition-colors"
              >
                <Check className="w-3 h-3" /> {completingId === t.id ? "..." : "Mark done"}
              </button>
            )}
          </div>
        ))}
      </div>
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
        pilotCardBackTo={`/gig/web?token=${token}&role=${selectedRole || "general"}&tab=rooms`}
      />
    </div>
  );
}


// ---------------------------------------------------------------------
// Desktop layout. One screen, no page scroll: a pinned-up "bulletin
// board" - the patch-bay hub sits straight on the board, the Board/Profile
// is a paper card in the middle, and Tasks (pinned, slightly crooked
// sticky notes) plus Rooms live down the right so nothing hides behind a
// tab. Only Tasks get the thumbtack and tilt; everything else is straight.
// ---------------------------------------------------------------------
const NOTE_TILT = [-2.2, 1.6, -1, 2.1, -1.7, 1.2];

function TaskNote({ i, title, color, label, onClick, onDone, doneBusy }) {
  return (
    <div
      className="relative box-border w-[calc(50%-7px)] min-h-[104px] pt-4 pb-2.5 px-3 rounded-[3px] flex flex-col justify-between cursor-pointer"
      onClick={onClick}
      style={{
        background: "#241c0a",
        border: "1px solid rgba(245,158,11,0.4)",
        transform: `rotate(${NOTE_TILT[i % NOTE_TILT.length]}deg)`,
        boxShadow: "0 10px 18px rgba(0,0,0,0.5)",
      }}
    >
      <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-[11px] h-[11px] rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${color} 50%, #222)`, boxShadow: "0 2px 4px rgba(0,0,0,0.6)" }} />
      <div className="text-white text-base font-semibold leading-tight line-clamp-3">{title}</div>
      <div className="flex items-center justify-between gap-1 mt-2">
        <span className="text-[9px] tracking-[0.06em] uppercase truncate" style={{ fontFamily: SCENE_MONO, color: "rgba(255,255,255,0.5)" }}>{label}</span>
        {onDone ? (
          <button type="button" disabled={doneBusy} onClick={(e) => { e.stopPropagation(); onDone(); }} className="flex items-center gap-1 text-[10px] font-semibold text-[#8CFF3D] hover:bg-[#8CFF3D]/10 px-1.5 py-0.5 rounded-full shrink-0 disabled:opacity-50">
            <Check className="w-3 h-3" /> Done
          </button>
        ) : (
          <span className="text-[10px] font-semibold" style={{ fontFamily: SCENE_MONO, color }}>OPEN</span>
        )}
      </div>
    </div>
  );
}

function DesktopHub({ nodes, selectedRole, selectRole, gig, title, myIcon }) {
  const iconUrl = myIcon || gig.icon_url;
  const typeColor = eventTypeColor(gig.event_type);
  const n = nodes.length || 1;
  // The boxes scale with the space the web actually gets (full size at 520px
  // across), and the roles sit a little further out, so they never crowd the
  // center box on a narrower window.
  const boxRef = useRef(null);
  const [size, setSize] = useState(520);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setSize(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = Math.max(0.62, Math.min(1, size / 520));
  const pts = nodes.map((nd, i) => {
    const a = (-90 + i * (360 / n)) * (Math.PI / 180);
    return { ...nd, px: 50 + 39 * Math.cos(a), py: 50 + 39 * Math.sin(a) };
  });
  return (
    <div ref={boxRef} className="relative w-full max-w-[520px] aspect-square max-h-full mx-auto">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
        {pts.map((nd) => (
          <line
            key={nd.role} x1="50" y1="50" x2={nd.px} y2={nd.py}
            stroke={nd.claimed ? "#4a4a4a" : "#383838"} strokeWidth={nd.claimed ? 1.5 : 2.5}
            strokeLinecap="round" strokeDasharray={nd.claimed ? undefined : "0.1 7"} vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <button
        type="button"
        onClick={() => selectRole(null)}
        className="absolute flex flex-col items-center justify-center rounded-[18px] bg-[#161616] border px-3 overflow-hidden"
        style={{
          left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: Math.round(160 * k), height: Math.round(100 * k), zIndex: 1,
          borderColor: selectedRole === null ? "#D2FF85" : "#2a2a2a", borderWidth: selectedRole === null ? 2 : 1,
          boxShadow: selectedRole === null ? "0 0 0 3px #C6FF6B66, 0 0 30px #C6FF6BAA" : undefined,
        }}
      >
        {iconUrl ? (
          <>
            <img src={iconUrl} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: 0.4 }} />
            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(13,13,13,0.35), rgba(13,13,13,0.6))" }} />
          </>
        ) : typeColor ? (
          <EventTypeGlyph type={gig.event_type} className="absolute pointer-events-none" style={{ width: 90, height: 90, right: -10, bottom: -12, color: typeColor, opacity: 0.2, strokeWidth: 1.5 }} />
        ) : null}
        <div className="relative font-semibold text-white text-center leading-tight tracking-wide line-clamp-2" style={{ fontSize: Math.max(14, Math.round(20 * k)), textShadow: "0 1px 4px rgba(0,0,0,0.85)" }}>{title}</div>
      </button>
      {pts.map((nd) => {
        const active = nd.role === selectedRole;
        return (
          <button
            key={nd.role}
            type="button"
            onClick={() => selectRole(nd.role)}
            className="absolute flex flex-col items-center justify-center gap-1.5 rounded-[14px] cursor-pointer px-1"
            style={{
              left: `${nd.px}%`, top: `${nd.py}%`, transform: "translate(-50%, -50%)", width: Math.round(92 * k), height: Math.round(72 * k), zIndex: 1,
              backgroundColor: "#161616",
              backgroundImage: active ? `linear-gradient(${nd.style.color}33, ${nd.style.color}33)` : undefined,
              border: `1.5px solid ${active ? nd.style.color : "#2a2a2a"}`,
              boxShadow: active ? `0 0 0 3px ${nd.style.color}40, 0 0 16px ${nd.style.color}66` : undefined,
            }}
          >
            <span className="font-bold leading-none whitespace-nowrap" style={{ fontFamily: SCENE_MONO, color: nd.style.color, opacity: active ? 1 : 0.6, fontSize: Math.max(10, Math.round((ROLE_CODES[nd.role].length > 5 ? 12 : 14) * k)) }}>{ROLE_CODES[nd.role]}</span>
            <span className="h-[4px] rounded-full bg-[#0d0d0d] overflow-hidden" style={{ width: Math.round(54 * k) }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, nd.percent)}%`, background: nd.style.color, opacity: active ? 1 : 0.5 }} />
            </span>
            <span className={`text-[10px] leading-none ${active ? "text-white/80" : "text-white/40"}`} style={{ fontFamily: SCENE_MONO }}>{nd.percent}%</span>
            {nd.claimed && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0d0d0d]" style={{ background: nd.style.color, opacity: active ? 1 : 0.5 }} />}
          </button>
        );
      })}
    </div>
  );
}

function DesktopGigWeb({
  gig, title, dateLabel, myIcon, nodes, selectedRole, selectedNode, selectRole, stripCells, goBack, actionButtons, overlays,
  token, permissions, loadGig, onGigChanged, setMyIcon, user, checkingAuth, rooms, roomMembers, addTask, completeTask,
  profileExpanded, setProfileExpanded,
}) {
  const isOwner = !!permissions?.is_owner;
  const [completingId, setCompletingId] = useState(null);
  // Clicking a profile on the web opens its bulletin board here. Its
  // workspace pops up over the board (like the Fan page editor) only from
  // the board's "Open workspace" button; closing it lands back on that board.
  const [workspaceRole, setWorkspaceRole] = useState(null);
  const switchWorkspace = (role) => {
    selectRole(role);
    setWorkspaceRole(role === "engineer" ? null : role);
  };
  const openTasks = (gig.tasks || []).filter((t) => t.status !== "done");
  const roleTasks = selectedRole ? openTasks.filter((t) => t.section === selectedRole) : openTasks;
  const canDo = selectedRole && roleEditable(selectedRole, permissions);
  const done = async (id) => {
    if (completingId) return;
    setCompletingId(id);
    try { await completeTask(id, true); } catch (e) { console.error(e); }
    setCompletingId(null);
  };
  // The event's photo (the same one in the hub's center box) is the
  // backdrop for the whole page. With a photo, the board surface turns
  // translucent so the photo reads through it as the cork behind the
  // pins; without one, the board stays the solid dotted surface.
  const bgUrl = myIcon || gig.icon_url;
  const dots = {
    backgroundColor: bgUrl ? "rgba(15,15,15,0.55)" : "#0f0f0f",
    backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.3px)",
    backgroundSize: "22px 22px",
    ...(bgUrl ? { backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" } : {}),
  };

  return (
    <div className="relative isolate h-screen flex flex-col bg-[#0d0d0d] overflow-hidden" style={{ fontFamily: SCENE_FONT }}>
      {/* `isolate` keeps this -z-10 layer above the root's own background but
          under everything else. Darkened and softened so cards stay readable. */}
      {bgUrl && (
        <div aria-hidden="true" className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(6px) saturate(1.1)", transform: "scale(1.05)", opacity: 0.6 }} />
          <span className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(13,13,13,0.35), rgba(13,13,13,0.8) 80%)" }} />
        </div>
      )}
      <div className={`flex items-center gap-4 px-6 py-3 border-b border-[#1a1a1a] shrink-0 ${bgUrl ? "bg-[#0d0d0d]/70 backdrop-blur-lg" : ""}`}>
        <button onClick={goBack} className="p-1 text-white/60 hover:text-white shrink-0"><ArrowLeft className="w-5 h-5" /></button>
        <EventTypeIcon type={gig.event_type} imageUrl={myIcon || gig.icon_url} size={42} />
        <div className="min-w-0">
          <h1 className="text-white font-bold text-3xl leading-tight truncate tracking-wide">{title}</h1>
          <p className="text-white/50 text-[11px] mt-0.5 truncate uppercase tracking-[0.1em]" style={{ fontFamily: SCENE_MONO }}>{[dateLabel, gig.venue].filter(Boolean).join(" · ") || "Select a role to see its status"}</p>
        </div>
        <div className="flex-1 max-w-[560px] ml-6 min-w-[300px]"><StatusStrip cells={stripCells} /></div>
        <div className="ml-auto [&_svg]:!w-5 [&_svg]:!h-5 [&_span]:!text-[10px]">{actionButtons}</div>
      </div>

      <div className="flex-1 min-h-0 m-4 rounded-2xl border border-[#1d1d1d] overflow-hidden" style={{ ...dots, boxShadow: "inset 0 0 60px rgba(0,0,0,0.6)" }}>
        <div className="h-full grid gap-6 p-6" style={{ gridTemplateColumns: "minmax(360px, 1fr) minmax(440px, 1.3fr) minmax(300px, 0.8fr)" }}>
          <div className="min-h-0 flex flex-col items-center justify-center gap-4">
            <div className="w-full flex-1 min-h-0 flex items-center">
              <DesktopHub nodes={nodes} selectedRole={selectedRole} selectRole={selectRole} gig={gig} title={title} myIcon={myIcon} />
            </div>
            {isOwner && gig?.id && (
              <InviteSheet
                showId={gig.id}
                elevated
                trigger={
                  <button type="button" className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-base font-bold tracking-[0.04em]" style={{ color: "#8CFF3D", background: "rgba(140,255,61,0.08)", border: "1.5px dashed rgba(140,255,61,0.55)" }}>
                    <UserPlus className="w-4 h-4" /> Invite profiles & users
                  </button>
                }
              />
            )}
          </div>

          <div className="min-h-0 flex flex-col rounded-md bg-[#151515] border border-[#262626]" style={{ boxShadow: "0 16px 36px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 shrink-0">
              {selectedNode ? (
                <>
                  <button type="button" onClick={() => selectRole(null)} className="flex items-center gap-1 text-white/40 hover:text-white text-xs font-semibold shrink-0 -ml-1 pl-1 pr-2 py-1 rounded-full hover:bg-white/5">
                    <ArrowLeft className="w-3.5 h-3.5" /> Overview
                  </button>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedNode.style.color }} />
                  <span className="min-w-0 flex flex-col">
                    <span className="text-white font-bold text-2xl leading-tight truncate">{SECTION_LABELS[selectedRole]}</span>
                    <span className="text-white/40 text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: SCENE_MONO }}>
                      {selectedNode.claimed ? "Claimed" : selectedNode.invited ? "Invited" : "Not invited"} · {selectedNode.percent}% filled in
                    </span>
                  </span>
                  <span className="ml-auto shrink-0">
                    <ProfileTabPanel compact role={selectedRole} token={token} onChanged={loadGig} color={selectedNode?.style.color || "#8CFF3D"} expanded={profileExpanded} setExpanded={setProfileExpanded} onOpenWorkspace={setWorkspaceRole} />
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#60A5FA]" />
                  <span className="text-white font-bold text-2xl">Board</span>
                  <span className="ml-auto text-white/40 text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: SCENE_MONO }}>{nodes.length} roles</span>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 border-t border-dashed border-[#2a2a2a] pt-3">
              {selectedRole ? (
                profileExpanded ? (
                  <ProfileTabPanel role={selectedRole} token={token} onChanged={loadGig} color={selectedNode?.style.color || "#8CFF3D"} expanded={profileExpanded} setExpanded={setProfileExpanded} onOpenWorkspace={setWorkspaceRole} />
                ) : (
                  <>
                    <div className="flex items-center gap-2 pb-1.5">
                      <span className="text-[#F59E0B] font-bold tracking-[0.08em] text-lg">TASKS</span>
                      <span className="text-white/50 text-[11px]" style={{ fontFamily: SCENE_MONO }}>· {roleTasks.length} OPEN</span>
                    </div>
                    {roleTasks.length === 0 ? (
                      <p className="text-white/30 text-sm px-0.5">Nothing outstanding for {SECTION_LABELS[selectedRole]} right now.</p>
                    ) : (
                      <div className="flex flex-wrap gap-x-3.5 gap-y-4 pt-1.5">
                        {roleTasks.map((t, i) => (
                          <TaskNote key={t.id} i={i} title={t.title} color={selectedNode?.style.color || "#8CFF3D"} label={selectedNode?.style.label || t.section} onClick={() => {}} onDone={canDo ? () => done(t.id) : undefined} doneBusy={completingId === t.id} />
                        ))}
                      </div>
                    )}
                  </>
                )
              ) : (
                <>
                  <OverviewBoard hideInvite foldDetails nodes={nodes} onSelectRole={selectRole} permissions={permissions} token={token} gig={gig} onChanged={loadGig} onGigChanged={onGigChanged} canPersonalIcon={!!user && !isOwner} myIcon={myIcon} onMyIconChanged={(u) => { setMyIcon(u); onGigChanged?.(); }} />
                  <div className="mt-5 pt-4 border-t border-dashed border-[#2a2a2a]">
                    <TasksSection notes nodes={nodes} tasks={openTasks} isOwner={isOwner} onAddTask={addTask} onSelectRole={selectRole} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="min-h-0 flex flex-col gap-5">
            <div className="min-h-0" style={{ flex: "3 1 0" }}>
              <FlightLog nodes={nodes} tasks={gig.tasks || []} codes={ROLE_CODES} onSelectRole={selectRole} selectedRole={selectedRole} />
            </div>

            <div className="min-h-0 flex flex-col rounded-[3px] bg-[#19141a] border border-[#F472B6]/30 border-l-4 border-l-[#F472B6]" style={{ flex: "2 1 0", boxShadow: "0 10px 18px rgba(0,0,0,0.5)" }}>
              <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
                <span className="text-[#F472B6] font-bold tracking-[0.08em] text-lg">ROOMS</span>
                <span className="text-white/50 text-[11px] uppercase" style={{ fontFamily: SCENE_MONO }}>· {selectedNode ? selectedNode.style.label : "General"}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                <RoomsTabPanel selectedRole={selectedRole} roleLabel={selectedNode?.style.label} token={token} user={user} checkingAuth={checkingAuth} rooms={rooms} roomMembers={roomMembers} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {overlays}
      {workspaceRole && (
        <RoleWorkspaceModal
          key={workspaceRole}
          role={workspaceRole}
          token={token}
          onChanged={loadGig}
          onClose={() => setWorkspaceRole(null)}
          onOpenRole={switchWorkspace}
        />
      )}
    </div>
  );
}

// The role workspace as a pop-up over the desktop board - its own copy
// of the section's data (useRoleProfile), refreshing the board on save.
function RoleWorkspaceModal({ role, token, onChanged, onClose, onOpenRole }) {
  const p = useRoleProfile({ role, token, onChanged });
  if (p.loading || p.checkingAuth || p.notFound || !p.gig) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/65" onClick={onClose} />
        <div className="relative w-full max-w-[1320px] h-[min(94vh,880px)] flex items-center justify-center bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px]">
          {p.loading || p.checkingAuth ? (
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          ) : (
            <p className="text-white/40 text-sm">Couldn't load this section.</p>
          )}
        </div>
      </div>
    );
  }
  return <RoleWorkspace modal role={role} p={p} onClose={onClose} onOpenRole={onOpenRole} />;
}
