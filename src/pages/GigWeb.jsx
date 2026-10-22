import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/navHistory";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, ChevronRight, MessageCircle, User, UserPlus, Plus, Check, Archive, Trash2, X, Ticket, ExternalLink, ClipboardList } from "lucide-react";
import InviteSheet from "@/components/showpilot/InviteSheet";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import RoomsButton from "@/components/showpilot/RoomsButton";
import TaskSheet, { claimText } from "@/components/showpilot/TaskSheet";
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
import BoardOverview from "@/components/showpilot/BoardOverview";
import ImageCropModal from "@/components/showpilot/ImageCropModal";
import EventTypeIcon, { EventTypeGlyph } from "@/components/showpilot/EventTypeIcon";
import { eventTypeColor } from "@/lib/eventTypes";
import { fetchMyIcons, uploadIconImage, saveMyIcon } from "@/lib/eventIcons";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import useIsDesktop from "@/hooks/useIsDesktop";
// The show editor, embedded as the SHOW tab for a tech owner (job 72).
// Lazy so the web doesn't load the editor's PDF/canvas code until needed.
const ShowDetail = lazy(() => import("@/pages/ShowDetail"));
import { SPIN_MS, prefersReducedMotion, useEntrance, spinMotion, tintOnDark, useBoxSize } from "@/components/showpilot/ProfileWeb";
import { FAN_RSVP_OPEN } from "@/lib/hiddenProfiles";
import DjTools from "@/pages/DjTools";
import { TasksButton } from "@/components/showpilot/TasksPopup";
import { WEB_ROLES, WEB_LABELS, HOLDERS, SECTION_HOLDERS, sectionOf } from "@/lib/eventRoles";

// Short console-style codes for the role channel buttons.
const ROLE_CODES = { venue: "VENUE", manager: "MGMT", band: "ARTIST", engineer: "AUDIO", lighting: "LIGHTS" };

// Same account-type split every other main page uses to choose between the
// two bottom tab bars (SharedGig.jsx's isTechProductionAccount, HomeRouter's
// TECHNICAL_PRODUCTION_TYPES) - kept as its own constant here so Gig Web
// doesn't have to import a whole page just for this one check.
const TECHNICAL_PRODUCTION_TYPES = ["engineer", "lighting"];

// The 3 roles a gig always has, in radial order. Position/color here
// intentionally match SharedGig's SECTION_COLORS and Home's progress bar,
// so this hub reads as another view of the same show rather than a new
// visual language to learn.
const ROLE_ORDER = WEB_ROLES;

// get_gigs_progress keys the combined Manager/Artist section "manager_band";
// everywhere else in this file (permissions, invited_role, routing) it's
// just "manager" - this is the one place that mismatch has to be bridged.
const PROGRESS_KEY = { venue: "venue", manager: "manager_band", engineer: "engineer" };

// Manager and Artist (and Audio and Lighting) share one section, so each
// circle shows its own fill from the fields that belong to it.
function roleFill(role, gig, percentOf) {
  const has = (v) => !!String(v ?? "").trim();
  const frac = (vals) => (vals.length ? vals.filter(has).length / vals.length : 0);
  const mi = gig.manager_info || {};
  const ei = gig.engineer_info || {};
  if (role === "manager") {
    const list = (mi.checklist || []).filter((c) => c.label);
    const parts = [frac([mi.contact_name, mi.contact_phone, mi.contact_email])];
    if (list.length) parts.push(list.filter((c) => c.done).length / list.length);
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }
  if (role === "band") {
    const acts = (gig.bands || []).filter((b) => b.band_name);
    if (!acts.length) return 0;
    const times = mi.set_times || {};
    return (1 + acts.filter((b) => has(times[b.band_name])).length / acts.length) / 2;
  }
  if (role === "engineer") return frac([(ei.audio || {}).contact_name, (ei.audio || {}).contact_phone, (ei.audio || {}).contact_email]);
  if (role === "lighting") return frac([(ei.lighting || {}).contact_name, (ei.lighting || {}).contact_phone, (ei.lighting || {}).contact_email]);
  return percentOf;
}

const SECTION_LABELS = WEB_LABELS;

// What the invite sheet calls each section.
const inviteKeyOf = (role) => (sectionOf(role) === "engineer" ? "engineer_lighting" : sectionOf(role));

// The three sections an event's tasks can be filed under.
const TASK_SECTIONS = [
  { role: "venue", label: "Venue" },
  { role: "manager", label: "Manager / Artist" },
  { role: "engineer", label: "Audio / Lighting" },
];

function roleClaimed(role, permissions) {
  return !!permissions?.claimed_roles?.some((r) => HOLDERS[role].includes(r));
}
function roleInvited(role, permissions) {
  return !!permissions?.invited_roles?.some((r) => HOLDERS[role].includes(r));
}

// Mirrors set_gig_task_status's own permission check exactly - owner, holds
// the role, was granted the section, or is the first visitor to an
// invited-but-unclaimed section - computed from the permissions Gig Web
// already has at the top level, so the Tasks tab can show the right Mark
// done control for whichever role is selected without a second fetch.
function roleEditable(role, permissions) {
  if (!permissions) return false;
  if (permissions.is_owner) return true;
  if ((permissions.my_roles || []).some((r) => SECTION_HOLDERS[role].includes(r))) return true;
  if ((permissions.granted_sections || []).includes(sectionOf(role))) return true;
  return roleInvited(role, permissions) && !roleClaimed(role, permissions);
}

// The event web's profile circles: a tint of the role color, a ring that's
// solid once the role is claimed and dashed while it's only invited (dimmer
// if nobody's been invited), and a glow on the selected one.
function roleCircle(n, active) {
  const c = n.style.color;
  return {
    background: tintOnDark(c, active ? 0.26 : 0.12),
    border: `2px ${n.claimed ? "solid" : "dashed"} ${n.claimed || n.invited ? c : `${c}66`}`,
    boxShadow: active ? `0 0 0 3px ${c}40, 0 0 22px ${c}88` : n.claimed ? `0 0 14px ${c}38` : "none",
  };
}

// The color of a profile nobody is on yet and nothing is filled in for.
const UNLIT = "#6B7280";

// Every profile opens as its own web: the profile in the center, its pages
// and features around it.
const isRoleWeb = (role) => !!role;

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
  const goBackInApp = useGoBack("/");
  const goBack = () => (onClose ? onClose() : goBackInApp());
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
  // Audio / lighting owners open their own show here (job 72, option A).
  // They land on TASKS with the full web; the first tab is SHOW, the show
  // editor, and the web folds to a one-line strip while it's open.
  const landedRef = useRef(false);
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
  // Webs within webs: a company profile opens as its own web (ProfileWeb via
  // RoleWorkspace layout="web"), portalled into the hub's spot (`webSlot`).
  // `leaving` spins whichever web is showing closed before the switch;
  // `hubAnim` replays the event web's spin open when coming back to it.
  const [leaving, setLeaving] = useState(false);
  const [hubAnim, setHubAnim] = useState(0);
  const [webSlot, setWebSlot] = useState(null);
  // Bulletin board task summaries: the task open in TaskSheet, and where a
  // claim sends you (that profile's web, opened on its Current tasks node).
  const [openTaskId, setOpenTaskId] = useState(null);
  const [webFocus, setWebFocus] = useState({ role: null, n: 0 });
  const pendingTab = useRef(null);
  const leaveTimer = useRef(null);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const hubEntered = useEntrance(hubAnim);

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
  // Tech phones (audio / lighting) have no web. An event you were invited to
  // is the shared event page's dropdowns; your own event is the show page.
  const techPhone = !tokenProp && isTechProductionAccount && !isDesktop;
  useEffect(() => {
    if (techPhone && permissions && !permissions.is_owner && token) navigate(`/gig/shared?token=${token}`, { replace: true });
  }, [techPhone, permissions, token]);
  useEffect(() => {
    if (landedRef.current || !permissions) return;
    landedRef.current = true;
    if (!tokenProp && !params.get("tab") && isTechProductionAccount && permissions.is_owner) setActiveTab("tasks");
  }, [permissions]);
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
    const room = rooms.find((r) => r.section === sectionOf(selectedRole));
    if (!room || roomMembers[room.id]) return;
    supabase.rpc("get_conversation_member_profiles", { p_conversation_id: room.id }).then(({ data, error }) => {
      if (!error) setRoomMembers((prev) => ({ ...prev, [room.id]: data || [] }));
    });
  }, [activeTab, selectedRole, rooms, user, roomMembers, isDesktop]);

  // Which profile / page the main space should jump to, and open.
  const [focus, setFocus] = useState({ role: null, key: null, n: 0 });
  // DJ Tools opens as a box over the event, so closing it lands back on the Artist web.
  const [djOpen, setDjOpen] = useState(() => !tokenProp && params.get("dj") === "1");
  const selectRole = (role, key = null) => {
    const apply = () => {
      setSelectedRole(role);
      if (role) setFocus((f) => ({ role, key, n: f.n + 1 }));
      // Back at the event, a tech owner's first tab is SHOW (the editor, web
      // folded); land on TASKS instead so the event web is what you see.
      const backToOwnWeb = !role && !isDesktop && isTechProductionAccount && permissions?.is_owner;
      setActiveTab(pendingTab.current || (backToOwnWeb ? "event" : "profile"));
      pendingTab.current = null;
      setProfileExpanded(false);
    };
    const changesWeb = isRoleWeb(selectedRole) !== isRoleWeb(role) || (isRoleWeb(role) && role !== selectedRole);
    if (!changesWeb || prefersReducedMotion()) { apply(); return; }
    if (leaving) return;
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      setLeaving(false);
      if (!isRoleWeb(role)) setHubAnim((n) => n + 1);
      apply();
    }, SPIN_MS);
  };

  // Tasks live on the gig itself (not per-role, like useRoleProfile's
  // requirements), since the Board tab needs to show all of them and a
  // task's section is just where it happens to point - so state and the
  // two mutations live here and get handed down to both the Board and
  // whichever role's Profile tab is open.
  // Task RPCs return the bare row; merge it over what we have so the names
  // get_shared_gig adds (who added / claimed it) stay put.
  const mergeTask = (taskId, data) => setGig((g) => ({
    ...g,
    tasks: (g.tasks || []).map((t) => (t.id === taskId
      ? { ...t, ...data, claimed_by_name: data.claimed_by && data.claimed_by === t.claimed_by ? t.claimed_by_name : null }
      : t)),
  }));
  const addTask = async (section, title, details = "") => {
    const { data, error } = await supabase.rpc("add_gig_task", { p_token: token, p_section: section, p_title: title });
    if (error) { console.error(error); throw error; }
    let task = data;
    if (details.trim()) {
      const res = await supabase.rpc("set_gig_task_details", { p_token: token, p_task_id: data.id, p_details: details });
      if (!res.error && res.data) task = res.data;
    }
    setGig((g) => ({ ...g, tasks: [...(g.tasks || []), { ...task, created_by_name: g.owner_display_name || null }] }));
  };
  const completeTask = async (taskId, done = true) => {
    const { data, error } = await supabase.rpc("set_gig_task_status", { p_token: token, p_task_id: taskId, p_done: done });
    if (error) { console.error(error); throw error; }
    mergeTask(taskId, data);
  };
  const claimTask = async (taskId, claim = true) => {
    const { data, error } = await supabase.rpc("claim_gig_task", { p_token: token, p_task_id: taskId, p_claim: claim });
    if (error) throw error;
    mergeTask(taskId, data);
  };
  const saveTaskDetails = async (taskId, details) => {
    const { data, error } = await supabase.rpc("set_gig_task_details", { p_token: token, p_task_id: taskId, p_details: details });
    if (error) throw error;
    mergeTask(taskId, data);
  };
  // Owner sets, changes or clears a task's due date (null clears it).
  const saveTaskDue = async (taskId, dueDate) => {
    const { data, error } = await supabase.rpc("set_gig_task_due_date", { p_token: token, p_task_id: taskId, p_due_date: dueDate || null });
    if (error) throw error;
    mergeTask(taskId, data);
  };
  // After a claim: the event's task page (tasks live there now, Oct 21).
  const goToCurrentTasks = () => {
    setOpenTaskId(null);
    navigate(`/gig/tasks?token=${token}`);
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

  // Every event always shows all three profiles, so the web stays even. A
  // profile nobody is invited to (and nothing is filled in for) stays unlit.
  const roles = ROLE_ORDER;
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
    const baseStyle = ACCOUNT_TYPE_STYLES[role] || ACCOUNT_TYPE_STYLES.engineer;
    const percent = Math.round(roleFill(role, gig, progress[PROGRESS_KEY[sectionOf(role)]]?.percent || 0) * 100);
    const claimed = roleClaimed(role, permissions);
    const invited = roleInvited(role, permissions);
    const hasTasks = (gig.tasks || []).some((t) => t.section === sectionOf(role));
    // Lit = someone is on it, or something is filled in. Opening a profile
    // always shows its color so you know where you are.
    const lit = claimed || invited || percent > 0 || hasTasks;
    const style = lit || role === selectedRole ? baseStyle : { ...baseStyle, color: UNLIT };
    return {
      role,
      x: Math.round((cx + r * Math.cos(angle)) * 10) / 10,
      y: Math.round((cy + r * Math.sin(angle)) * 10) / 10,
      style,
      percent,
      lit,
      claimed,
      invited,
    };
  });

  const selectedNode = selectedRole ? nodes.find((n) => n.role === selectedRole) : null;
  const roleWeb = isRoleWeb(selectedRole);
  const hubM = spinMotion({ entering: !hubEntered, leaving });

  const openTasks = (gig.tasks || []).filter((t) => t.status !== "done");
  const openTasksFor = (role) => openTasks.filter((t) => t.section === sectionOf(role)).length;
  const avgPercent = nodes.length ? Math.round(nodes.reduce((a, n) => a + n.percent, 0) / nodes.length) : 0;
  const stripCells = selectedNode
    ? [
        { label: "FIELDS FILLED", value: `${selectedNode.percent}%`, color: selectedNode.style.color },
        { label: "OPEN TASKS", value: String(openTasksFor(selectedNode.role)), color: openTasksFor(selectedNode.role) ? "#FF6A00" : "#8CFF3D" },
        { label: "STATUS", value: selectedNode.claimed ? "CLAIMED" : selectedNode.invited ? "INVITED" : "OPEN", color: selectedNode.claimed ? "#8CFF3D" : selectedNode.invited ? "#EAB308" : "#9A9A9A" },
      ]
    : [
        { label: "ROLES CONFIRMED", value: `${nodes.filter((n) => n.claimed).length}/${nodes.length}`, color: "#8CFF3D" },
        { label: "OPEN TASKS", value: String(openTasks.length), color: openTasks.length ? "#FF6A00" : "#8CFF3D" },
        { label: "GIG READY", value: `${avgPercent}%`, color: avgPercent >= 100 ? "#8CFF3D" : "#fff" },
      ];
  const showTabMode = isTechProductionAccount && !!permissions?.is_owner && !selectedRole && !!gig?.id;
  // Rooms on the web: desktop and tech only. Company phones use the Chats tab.
  const roomsOnWeb = isDesktop || isTechProductionAccount;
  const webTabs = [
    // Board / Event / Rooms aren't profiles, so they stay uncolored.
    { id: "profile", label: showTabMode ? "SHOW" : "BOARD" },
    ...(showTabMode ? [{ id: "event", label: "EVENT" }] : []),
    ...(roomsOnWeb ? [{ id: "rooms", label: "ROOMS" }] : []),
  ];
  const editingShow = showTabMode && activeTab === "profile" && !isDesktop;

  const actionButtons = (() => {
    // Each action is an icon with a word under it, so none of them
    // has to be guessed at. Fan page is the public page for fans;
    // Archive hides the event (reversible); Delete removes it.
    const act = "flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md transition-colors";
    const cap = "text-[8px] tracking-[0.08em] leading-none";
    // Your open tasks on this event: in a section you work on, or claimed by you.
    const myTaskCount = (gig.tasks || []).filter((t) => t.status !== "done" && ((user && t.claimed_by === user.id) || roleEditable(t.section, permissions))).length;
    return (
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {token && (
          <button type="button" onClick={() => navigate(`/gig/tasks?token=${token}`)} aria-label={myTaskCount ? `Tasks, ${myTaskCount} yours` : "Tasks"} className={`${act} relative text-[#FF6A00]/80 hover:text-[#FF6A00]`}>
            <ClipboardList className="w-4 h-4" />
            <span className={cap} style={{ fontFamily: SCENE_MONO }}>TASKS</span>
            {myTaskCount > 0 && <span className="absolute -top-1 right-0 min-w-[16px] h-4 px-1 rounded-full bg-[#FF6A00] text-[#0d0d0d] text-[10px] font-bold flex items-center justify-center">{myTaskCount}</span>}
          </button>
        )}
        {FAN_RSVP_OPEN && (permissions?.is_owner || token) && (
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

  const openTask = openTaskId ? (gig.tasks || []).find((t) => t.id === openTaskId) : null;
  const overlays = (
    <>
      {djOpen && gig?.id && (
        <DjTools embedded showId={gig.id} returnTo={`/gig/web?token=${token}&role=band&dj=1`} onClose={() => setDjOpen(false)} />
      )}
      {openTask && (
        <TaskSheet
          task={openTask}
          color={nodes.find((n) => n.role === openTask.section)?.style.color || ACCOUNT_TYPE_STYLES[openTask.section]?.color || "#8CFF3D"}
          label={SECTION_LABELS[openTask.section] || openTask.section}
          userId={user?.id}
          signedIn={!!user}
          isOwner={!!permissions?.is_owner}
          canWork={!!user && roleEditable(openTask.section, permissions)}
          onClose={() => setOpenTaskId(null)}
          onClaim={async () => { await claimTask(openTask.id, true); goToCurrentTasks(openTask.section); }}
          onRelease={() => claimTask(openTask.id, false)}
          onDone={async () => { await completeTask(openTask.id, true); setOpenTaskId(null); }}
          onSaveDetails={(d) => saveTaskDetails(openTask.id, d)}
          onSaveDue={(d) => saveTaskDue(openTask.id, d)}
          onGoToCurrent={() => goToCurrentTasks(openTask.section)}
        />
      )}
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
        addTask={addTask} completeTask={completeTask} claimTask={claimTask} profileExpanded={profileExpanded} setProfileExpanded={setProfileExpanded}
        onOpenTask={setOpenTaskId} focus={focus} ownerType={preferences?.account_type} openDj={() => setDjOpen(true)}
        roleWeb={roleWeb} hubM={hubM} leaving={leaving} webSlot={webSlot} setWebSlot={setWebSlot} openFanPage={FAN_RSVP_OPEN ? () => setShowFanSheet(true) : undefined}
      />
    );
  }

  if (techPhone) {
    // Waiting to hear whether this is your own event or one you were invited to.
    if (!permissions || !permissions.is_owner) {
      return <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>;
    }
    return (
      <div className="min-h-screen bg-[#0d0d0d] pb-24" style={{ fontFamily: SCENE_FONT }}>
        <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
          <div className="px-4 py-3 max-w-lg mx-auto flex items-center gap-3">
            <button onClick={goBack} className="p-1 text-white/60 hover:text-white shrink-0"><ArrowLeft className="w-5 h-5" /></button>
            <EventTypeIcon type={gig.event_type} imageUrl={myIcon || gig.icon_url} size={36} />
            <div className="min-w-0 flex-1">
              <h1 className="text-white font-semibold text-xl leading-tight truncate tracking-wide">{title}</h1>
              <p className="text-white/40 text-[10px] mt-0.5 truncate uppercase tracking-[0.1em]" style={{ fontFamily: SCENE_MONO }}>{[dateLabel, gig.venue].filter(Boolean).join(" · ")}</p>
            </div>
            {/* Chat is an icon beside Tasks instead of a SHOW / ROOMS tab row (job 119). */}
            <RoomsButton token={token} />
            <TasksButton token={token} />
          </div>
        </div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <Suspense fallback={<div className="py-10 text-center text-white/40 text-sm">Loading show…</div>}>
            <ShowDetail embeddedId={gig.id} onSaved={() => { loadGig(); onGigChanged?.(); }} />
          </Suspense>
        </div>
        {user && <BottomTabs />}
        {overlays}
      </div>
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

      {editingShow ? (
        <div className="px-4 pt-3 max-w-lg mx-auto">
          {/* The web folded to one line while the show is being edited; tap to unfold it (TASKS). */}
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            aria-label="Show the web"
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#141414] border border-[#2a2a2a]"
          >
            <span className="w-6 h-6 rounded-full border-2 border-white bg-[#2a2a2a] shrink-0" style={{ boxShadow: "0 0 10px #FFFFFFAA" }} />
            {nodes.map((n) => (
              <span key={n.role} className="w-3.5 h-3.5 rounded-full shrink-0" style={{ border: `2px ${n.claimed ? "solid" : "dashed"} ${n.claimed || n.invited ? n.style.color : `${n.style.color}66`}` }} />
            ))}
            <span className="ml-auto text-[11px] text-white/60 tracking-[0.06em]" style={{ fontFamily: SCENE_MONO }}>
              {stripCells[0].value} · {stripCells[2].value} ▾
            </span>
          </button>
        </div>
      ) : (
      <>
      <div className="px-4 pt-3 max-w-lg mx-auto">
        <StatusStrip cells={stripCells} />
      </div>

      <div className="px-4 pt-3 max-w-lg mx-auto flex flex-col items-center">
        {roleWeb ? (
          <div ref={setWebSlot} className="relative shrink-0" style={{ width: 300, height: 300 }} />
        ) : (
        <div className="relative shrink-0" style={{ width: 300, height: 300 }}>
          <div className="absolute inset-0" style={{ ...hubM.wrap, zIndex: 1 }}>
          <svg width="300" height="300" className="absolute left-0 top-0 pointer-events-none" style={{ zIndex: 0, ...hubM.fade(1) }}>
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


          {nodes.map((n) => {
            const active = n.role === selectedRole;
            return (
              <button
                key={n.role}
                type="button"
                onClick={() => selectRole(n.role)}
                aria-label={`${SECTION_LABELS[n.role]}, ${n.percent}% filled in, ${n.claimed ? "claimed" : n.invited ? "invited" : "not invited"}`}
                className="absolute flex flex-col items-center justify-center gap-[3px] rounded-full cursor-pointer p-0"
                style={{
                  left: n.x, top: n.y, ...hubM.node(n.x - cx, n.y - cy), width: 72, height: 72, zIndex: 1,
                  ...roleCircle(n, active),
                }}
              >
                <span className="font-bold leading-none whitespace-nowrap tracking-[0.04em]" style={{ fontFamily: SCENE_FONT, color: n.style.color, fontSize: ROLE_CODES[n.role].length > 5 ? 13 : 15 }}>{ROLE_CODES[n.role]}</span>
                <span className="w-[38px] h-[4px] rounded-full bg-[#0d0d0d]/80 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, n.percent)}%`, background: n.style.color }} />
                </span>
                <span className={`text-[10px] leading-none ${active ? "text-white" : "text-white/70"}`} style={{ fontFamily: SCENE_MONO }}>{n.percent}%</span>
              </button>
            );
          })}
          </div>
          <button
            type="button"
            onClick={() => selectRole(null)}
            className="absolute flex flex-col items-center justify-center gap-1 rounded-full bg-[#161616] border px-3 transition-colors overflow-hidden"
            style={{
              left: cx, top: cy, ...hubM.center, width: 116, height: 116, zIndex: 2,
              borderColor: selectedRole === null ? "#FFFFFF" : "#2a2a2a",
              borderWidth: selectedRole === null ? 2 : 1,
              // Lit white so the event never blends into a profile's color (Audio green, Venue blue...).
              boxShadow: selectedRole === null ? "0 0 0 3px #FFFFFF55, 0 0 30px #FFFFFFAA, 0 0 60px #FFFFFF44" : undefined,
            }}
          >
            {selectedRole === null && <span className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.22), rgba(255,255,255,0.05) 70%)" }} />}
            {/* The event's icon as a faded backdrop: an uploaded image (dimmed, with a dark wash so text stays crisp) or the type glyph in its color. */}
            {/* Just the event's picture (job 125): its photo, or its type's glyph. The name is in the header. */}
            {(myIcon || gig.icon_url) ? (
              <img src={myIcon || gig.icon_url} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
            ) : (
              <EventTypeGlyph type={gig.event_type} className="relative pointer-events-none" style={{ width: "48%", height: "48%", color: eventTypeColor(gig.event_type) || "#FFFFFF", opacity: 0.6, strokeWidth: 1.5 }} />
            )}
            <span className="sr-only">{title}</span>
          </button>
        </div>
        )}
      </div>

      </>
      )}

      <div className="w-full max-w-lg mx-auto px-4 mt-2">
        <div className="flex items-center gap-2 mb-2">
          {selectedNode ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedNode.style.color }} />
              <span className="text-white font-semibold text-base truncate">{SECTION_LABELS[selectedRole]}</span>
              <span className="text-white/30 text-xs shrink-0 ml-auto">
                {selectedNode.claimed ? "Claimed" : selectedNode.invited ? "Invited" : "Not invited"} · {selectedNode.percent}%
              </span>
            </>
          ) : showTabMode ? null : (
            <span className="text-white font-semibold text-base">Overview</span>
          )}
        </div>

        {/* Company profiles on a phone chat from the Chats tab, so the web
            has no Rooms tab there (job 73); with only Board left, no tab row. */}
        {webTabs.length > 1 && (
        <div className="flex items-center gap-1.5 mb-2">
          {webTabs.map((t) => {
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className="flex-1 py-2 rounded-lg text-[11px] font-semibold tracking-[0.1em] transition-colors"
                style={{ fontFamily: SCENE_MONO, color: on ? "#0d0d0d" : "rgba(255,255,255,0.65)", background: on ? "#fff" : "#141414", border: `1px solid ${on ? "#fff" : "#2a2a2a"}` }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        )}

        {activeTab === "rooms" && roomsOnWeb ? (
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-3 mb-4">
            <RoomsTabPanel
              selectedRole={selectedRole}
              roleLabel={selectedNode?.style.label}
              token={token}
              user={user}
              checkingAuth={checkingAuth}
              rooms={rooms}
              roomMembers={roomMembers}
            />
          </div>
        ) : editingShow ? (
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-3 mb-4">
            <Suspense fallback={<div className="py-10 text-center text-white/40 text-sm">Loading show…</div>}>
                <ShowDetail embeddedId={gig.id} onSaved={() => { loadGig(); onGigChanged?.(); }} />
              </Suspense>
          </div>
        ) : (
          <div className="mb-4 flex flex-col gap-3">
            {!selectedRole && (
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-3">
                <OverviewBoard hideStrips nodes={nodes} onSelectRole={selectRole} permissions={permissions} token={token} gig={gig} onChanged={loadGig} onGigChanged={onGigChanged} canPersonalIcon={!!user && !permissions?.is_owner} myIcon={myIcon} onMyIconChanged={(u) => { setMyIcon(u); onGigChanged?.(); }} />
              </div>
            )}
            <EventSections
              token={token}
              onChanged={loadGig}
              selectedRole={selectedRole}
              selectRole={selectRole}
              webSlot={webSlot}
              leaving={leaving}
              onBack={() => selectRole(null)}
              homeIcon={myIcon}
              onOpenFanPage={FAN_RSVP_OPEN ? () => setShowFanSheet(true) : undefined}
              onOpenDj={() => setDjOpen(true)}
              focus={focus}
              ownerType={preferences?.account_type}
              isOwner={!!permissions?.is_owner}
              onAddTask={addTask}
              showInvite
            />
          </div>
        )}
      </div>

      {user && (isTechProductionAccount ? <BottomTabs /> : <BandBottomTabs />)}

      {overlays}
    </div>
  );
}

// The event's main space: every profile as a dropdown (your own on top and
// open), each opening to its pages, with the fields editable right there. The
// web above it only shows where you are and jumps you to a spot; tasks live
// on each profile as their own page. Each section (venue, manager, audio) has
// its own copy of the data and its own SAVE, so Manager and Artist share one,
// and Audio and Lighting share one.
// `solo` (desktop): the web is the navigation, so the main box shows only
// what's picked on it: nothing but the board items on the event web, one
// profile when its circle is picked, one page when a page is picked.
function EventSections({ token, onChanged, selectedRole, selectRole, webSlot, leaving, onBack, homeIcon, onOpenFanPage, onOpenDj, focus, ownerType, isOwner, onAddTask, showInvite = true, solo = false }) {
  const pv = useRoleProfile({ role: "venue", token, onChanged });
  const pm = useRoleProfile({ role: "manager", token, onChanged });
  const pe = useRoleProfile({ role: "engineer", token, onChanged });
  const byRole = { venue: pv, manager: pm, band: pm, engineer: pe, lighting: pe };
  const invite = useGigInvite({ gigId: pv.gig?.id, user: pv.user });
  const user = pv.user;
  const ready = [pv, pm, pe].every((x) => !x.loading && !x.checkingAuth && !x.notFound && x.gig);

  if (!ready) {
    return [pv, pm, pe].some((x) => x.notFound)
      ? <p className="text-white/40 text-sm text-center py-6">Couldn't load this event.</p>
      : <div className="py-8" />;
  }

  const goSignIn = (toRegister) => {
    const currentPath = window.location.pathname + window.location.search;
    try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
    window.location.href = `${toRegister ? "/register" : "/login"}?redirect=${encodeURIComponent(currentPath)}`;
  };

  // Yours first: the profiles you hold on this event, or the type of account you have.
  const mine = WEB_ROLES.filter((r) => (pv.permissions?.my_roles || []).includes(r));
  if (!mine.length && WEB_ROLES.includes(ownerType)) mine.push(ownerType);
  const order = [...mine, ...WEB_ROLES.filter((r) => !mine.includes(r))];

  // Open tasks sitting in a section you can work.
  const forMe = (pv.gig.tasks || []).filter((t) => t.status !== "done" && WEB_ROLES.some((r) => sectionOf(r) === t.section && byRole[r].editable));
  const firstTaskRole = forMe.length ? order.find((r) => sectionOf(r) === forMe[0].section && byRole[r].editable) : null;

  return (
    <div className="flex flex-col gap-2.5">
      {!user && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-white/60 bg-[#111] border border-[#1f1f1f] rounded-xl px-3 py-2.5">
          <span className="mr-auto">Sign in to edit your part of this event.</span>
          <button type="button" onClick={() => goSignIn(false)} className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-white/25 text-white/75 hover:text-white">Sign in</button>
          <button type="button" onClick={() => goSignIn(true)} className="text-[11px] font-bold px-3 py-1.5 rounded-full text-[#0d0d0d] bg-[#8CFF3D]">Create account</button>
        </div>
      )}
      {/* Tasks moved out of the main space: the TASKS button in the header and the
          Tasks feature on each profile's web open the event's task page. */}
      {(solo ? order.filter((r) => r === selectedRole) : order).map((role) => (
        <RoleWorkspace
          key={role}
          layout="pages"
          solo={solo}
          role={role}
          p={byRole[role]}
          webSlot={selectedRole === role ? webSlot : null}
          selected={selectedRole === role}
          defaultOpen={solo || mine.includes(role)}
          focus={focus && focus.role === role ? focus : null}
          leaving={leaving}
          onBack={onBack}
          homeIcon={homeIcon}
          onOpenRole={selectRole}
          onOpenFanPage={onOpenFanPage}
          onOpenDj={onOpenDj}
          onInvite={showInvite && byRole[role].editable ? () => invite.openInvite(inviteKeyOf(role), SECTION_LABELS[role]) : null}
        />
      ))}
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
// `compact`: the desktop board's one-row version (icon, name, date, Save
// only while something changed), always open so there's no dropdown.
function EventDetailsEditor({ token, gig, onChanged, onIconChanged, compact = false }) {
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
  // Picking an image opens the crop tool first (job 128); Crop on an image
  // that's already there re-crops it. The cropped square is what's saved.
  const [cropFile, setCropFile] = useState(null);
  const uploadIcon = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setIconError("Image must be under 20 MB"); return; }
    setIconError("");
    setCropFile(file);
  };
  const recropIcon = async () => {
    setIconError("");
    const f = await fileFromUrl(gig.icon_url);
    if (f) setCropFile(f); else setIconError("Couldn't open that image to crop");
  };
  const saveCropped = async (blob) => {
    setCropFile(null);
    setIconBusy(true);
    setIconError("");
    try {
      const url = await uploadIconImage(new File([blob], "event.jpg", { type: "image/jpeg" }));
      await setIcon(url);
    } catch (err) {
      console.error(err);
      setIconError("Couldn't upload that image");
    }
    setIconBusy(false);
  };
  const cropper = cropFile && createPortal(<ImageCropModal file={cropFile} aspectW={1} aspectH={1} onCancel={() => setCropFile(null)} onCropped={saveCropped} />, document.body);
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

  if (compact) {
    const inCls = "min-w-0 bg-transparent border border-transparent hover:border-[#2a2a2a] focus:border-white/30 rounded-md px-2 py-1 text-white outline-none";
    return (
      <div className="mb-3">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-[#262626] bg-[#111]">
          <label className="relative shrink-0 cursor-pointer group" title={gig.icon_url ? "Change event image" : "Add an event image"}>
            <EventTypeIcon type={gig.event_type || "Other"} imageUrl={gig.icon_url} size={36} />
            <span className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/60 text-[9px] font-bold tracking-[0.06em] text-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontFamily: SCENE_MONO }}>{iconBusy ? "..." : "EDIT"}</span>
            <input type="file" accept="image/*" className="hidden" disabled={iconBusy} onChange={uploadIcon} />
          </label>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Event name"
            aria-label="Event name"
            className={`${inCls} flex-1 text-[16px] font-semibold placeholder:text-white/30`}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
            className={`${inCls} shrink-0 w-[150px] text-[14px] text-white/80 [color-scheme:dark]`}
            style={{ fontFamily: SCENE_MONO }}
          />
          {(dirty || saved) && (
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-bold tracking-[0.06em]"
              style={{ background: "#8CFF3D", color: "#0d0d0d" }}
            >
              {saved ? "SAVED ✓" : saving ? "..." : "SAVE"}
            </button>
          )}
        </div>
        {(iconError || (gig.icon_url && !iconBusy)) && (
          <div className="mt-1 px-1 flex items-center gap-3 text-[11px]">
            {iconError && <span className="text-red-400">{iconError}</span>}
            {gig.icon_url && !iconBusy && <button type="button" onClick={recropIcon} className="text-white/50 hover:text-white">Crop image</button>}
            {gig.icon_url && !iconBusy && <button type="button" onClick={removeIcon} className="text-white/35 hover:text-red-400">Remove image</button>}
          </div>
        )}
        {cropper}
      </div>
    );
  }

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
              <button type="button" onClick={recropIcon} className="text-xs text-white/55 hover:text-white">Crop</button>
            )}
            {gig.icon_url && !iconBusy && (
              <button type="button" onClick={removeIcon} className="text-xs text-white/40 hover:text-red-400">Remove</button>
            )}
          </div>
          {cropper}
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

// An image already on the event, as a File the crop tool can open.
async function fileFromUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], "image", { type: blob.type || "image/jpeg" });
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Anyone linked to a gig (not just its owner) can give it their own icon.
// It's personal - only they see it on their lists and Gig Web - and takes
// priority over the owner's shared icon and the automatic type icon.
function MyIconControl({ gig, myIcon, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Crop first, like the event image (job 128).
  const [cropFile, setCropFile] = useState(null);
  const upload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("Image must be under 20 MB"); return; }
    setError("");
    setCropFile(file);
  };
  const saveCropped = async (blob) => {
    setCropFile(null);
    setBusy(true); setError("");
    try {
      const url = await uploadIconImage(new File([blob], "icon.jpg", { type: "image/jpeg" }));
      await saveMyIcon(gig.id, url);
      onChanged?.(url);
    } catch (err) { console.error(err); setError("Couldn't save that image"); }
    setBusy(false);
  };
  const recrop = async () => {
    const f = await fileFromUrl(myIcon);
    if (f) setCropFile(f); else setError("Couldn't open that image to crop");
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
        {myIcon && !busy && <button type="button" onClick={recrop} className="text-xs text-white/55 hover:text-white">Crop</button>}
        {myIcon && !busy && <button type="button" onClick={remove} className="text-xs text-white/40 hover:text-red-400">Remove</button>}
      </div>
      {cropFile && createPortal(<ImageCropModal file={cropFile} aspectW={1} aspectH={1} onCancel={() => setCropFile(null)} onCropped={saveCropped} />, document.body)}
      {error && <p className="text-red-400 text-[11px] mt-1">{error}</p>}
      <p className="text-white/25 text-[10px] mt-1">Only you see this one, on your own lists.</p>
    </div>
  );
}

// The profiles on the event as a row of mixing-console channel strips, in
// the same order as the web: a solid scribble strip in the profile's color,
// a status LED (lit = claimed, ring = invited, dark = nobody yet), a meter
// filled to how much of that section is done, and its open tasks. Click a
// strip to open that profile, same as its node on the web.
function ProfileStrips({ nodes, tasks, onSelectRole }) {
  return (
    <div className="grid gap-1.5 p-1.5 rounded-[10px] bg-[#0a0a0a] border border-[#1f1f1f]" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))`, fontFamily: SCENE_MONO }}>
      {nodes.map((n) => {
        const Icon = n.style.icon;
        const c = n.style.color;
        const open = tasks.filter((t) => t.section === n.role && t.status !== "done").length;
        const status = n.claimed ? "CLAIMED" : n.invited ? "INVITED" : "OPEN";
        return (
          <button
            key={n.role}
            type="button"
            onClick={() => onSelectRole(n.role)}
            aria-label={`${n.style.label}: ${status.toLowerCase()}, ${n.percent}% filled in, ${open} open task${open === 1 ? "" : "s"}`}
            className="group min-w-0 flex flex-col rounded-[6px] overflow-hidden bg-[#141414] border border-[#232323] hover:border-white/25 transition-colors text-left"
          >
            {/* Scribble strip */}
            <div className="flex items-center justify-center gap-1 px-1 py-1" style={{ background: c }}>
              <Icon className="hidden sm:block w-3.5 h-3.5 shrink-0" style={{ color: "#0d0d0d" }} />
              <span className="text-[9px] sm:text-[10.5px] font-bold tracking-[0.02em] sm:tracking-[0.04em] truncate" style={{ color: "#0d0d0d" }}>{ROLE_CODES[n.role] || n.style.label}</span>
            </div>
            {/* Status LED + fill + open tasks, one short row */}
            <div className="flex items-center justify-center gap-1.5 px-1 py-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                title={status}
                style={n.claimed ? { background: c, boxShadow: `0 0 6px ${c}` } : n.invited ? { border: `1.5px solid ${c}` } : { background: "#2a2a2a" }}
              />
              <span className="text-[12px] sm:text-[13px] font-semibold text-white tabular-nums leading-none">{n.percent}<span className="text-[9px] text-white/45">%</span></span>
              {open > 0 && <span className="text-[9px] leading-none px-1 py-[2px] rounded-[3px] bg-white/10 text-white tabular-nums" title={`${open} open task${open === 1 ? "" : "s"}`}>{open}</span>}
            </div>
            {/* Meter: a thin bar filled to how much of the section is done */}
            <div className="h-[3px] bg-[#262626]"><div className="h-full" style={{ width: `${Math.max(0, Math.min(100, n.percent))}%`, background: c }} /></div>
          </button>
        );
      })}
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
function OverviewBoard({ nodes, onSelectRole, permissions, token, gig, onChanged, onGigChanged, canPersonalIcon, myIcon, onMyIconChanged, hideInvite, foldDetails, hideStrips }) {
  // Desktop board: the event's name / date / icon editor is one compact row
  // (always open, no dropdown) so the role tiles and tasks lead. Phones keep
  // the full editor, as before.
  if (nodes.length === 0) {
    return <p className="text-white/30 text-sm text-center py-4">No roles on this gig yet.</p>;
  }
  // No "_ claimed · _ invited" line (job 123): a profile on the web lights
  // up when someone's on it.
  return (
    <div>
      {permissions?.is_owner && gig && (
        <EventDetailsEditor token={token} gig={gig} onChanged={onChanged} onIconChanged={onGigChanged} compact={!!foldDetails} />
      )}
      {canPersonalIcon && gig && (
        <MyIconControl gig={gig} myIcon={myIcon} onChanged={onMyIconChanged} />
      )}
      {!hideStrips && <ProfileStrips nodes={nodes} tasks={gig?.tasks || []} onSelectRole={onSelectRole} />}

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
function TasksTabPanel({ nodes, selectedRole, tasks, permissions, isOwner, onAddTask, onCompleteTask, onSelectRole, onOpenTask, userId }) {
  if (selectedRole) {
    const roleTasks = (tasks || []).filter((t) => t.section === sectionOf(selectedRole) && t.status !== "done");
    if (roleTasks.length === 0) {
      return <p className="text-white/25 text-xs text-center py-3">Nothing outstanding for this section right now.</p>;
    }
    return <RoleTaskList tasks={roleTasks} editable={roleEditable(selectedRole, permissions)} onComplete={onCompleteTask} onOpen={onOpenTask} userId={userId} />;
  }

  const openTasks = (tasks || []).filter((t) => t.status !== "done");
  return <TasksSection nodes={nodes} tasks={openTasks} isOwner={isOwner} onAddTask={onAddTask} onSelectRole={onSelectRole} onOpenTask={onOpenTask} userId={userId} />;
}

// The board's Tasks section - free-form owner-created to-dos, each
// pointed at a section. This is the "digital board everyone can see and
// interact with" from the request: tapping a task jumps into that
// role's Profile tab (RoleTaskList below renders it there with a Mark
// done button), so the board itself stays a scannable list of what's
// still outstanding rather than a form.
function TasksSection({ nodes, tasks, isOwner, onAddTask, onSelectRole, notes, onOpenTask, userId }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [section, setSection] = useState(TASK_SECTIONS[0].role);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !section || submitting) return;
    setSubmitting(true);
    try {
      await onAddTask(sectionOf(section), title.trim(), details);
      setTitle("");
      setDetails("");
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
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="What needs doing (optional): the steps or anything they should know"
            className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-white text-sm leading-snug placeholder:text-white/25 outline-none focus:border-[#333]"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {TASK_SECTIONS.map((t) => {
              const c = ACCOUNT_TYPE_STYLES[t.role]?.color || "#8CFF3D";
              return (
                <button
                  key={t.role}
                  type="button"
                  onClick={() => setSection(t.role)}
                  className="text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors"
                  style={section === t.role
                    ? { color: c, background: c + "22", borderColor: c + "60" }
                    : { color: "rgba(255,255,255,0.4)", borderColor: "#222" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setTitle(""); setDetails(""); }} className="text-white/40 hover:text-white text-xs font-semibold px-2 py-1">
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
            return <TaskNote key={t.id} i={i} title={t.title} color={node?.style.color || "#8CFF3D"} label={node?.style.label || t.section} claimedBy={claimText(t, userId)} onClick={() => (onOpenTask ? onOpenTask(t.id) : onSelectRole(t.section))} />;
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
                onClick={() => (onOpenTask ? onOpenTask(t.id) : onSelectRole(t.section))}
                className="w-full flex items-center gap-2 bg-[#161616] hover:bg-[#1c1c1c] rounded-xl px-3 py-2.5 transition-colors text-left"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-white text-sm truncate">{t.title}</span>
                  {t.claimed_by && <span className="block text-[11px] truncate" style={{ color }}>Claimed by {claimText(t, userId)}</span>}
                </span>
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
function RoleTaskList({ tasks, editable, onComplete, onOpen, userId }) {
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
          <div key={t.id} className="flex items-center justify-between gap-2 bg-[#161616] rounded-lg px-3 py-2 cursor-pointer hover:bg-[#1c1c1c]" onClick={() => onOpen?.(t.id)}>
            <span className="min-w-0">
              <span className="block text-white/80 text-xs truncate">{t.title}</span>
              {t.claimed_by && <span className="block text-[10.5px] text-white/45 truncate">Claimed by {claimText(t, userId)}</span>}
            </span>
            {editable && (!t.claimed_by || t.claimed_by === userId) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); complete(t.id); }}
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

  const section = selectedRole ? sectionOf(selectedRole) : "general";
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

function TaskNote({ i, title, color, label, onClick, onDone, doneBusy, claimedBy }) {
  return (
    <div
      className="relative box-border w-[calc(50%-7px)] min-h-[104px] pt-4 pb-2.5 px-3 rounded-[3px] flex flex-col justify-between cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      aria-label={`Task: ${title}. Open summary`}
      style={{
        background: "#241c0a",
        border: "1px solid rgba(255,106,0,0.4)",
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
          <span className="text-[10px] font-semibold truncate" style={{ fontFamily: SCENE_MONO, color }}>{claimedBy ? (claimedBy === "You" ? "YOURS" : `CLAIMED · ${claimedBy.toUpperCase()}`) : "OPEN"}</span>
        )}
      </div>
    </div>
  );
}

function DesktopHub({ nodes, selectedRole, selectRole, gig, title, myIcon, hubM }) {
  const iconUrl = myIcon || gig.icon_url;
  const typeColor = eventTypeColor(gig.event_type);
  const n = nodes.length || 1;
  // The boxes scale with the space the web actually gets (full size at 520px
  // across), and the roles sit a little further out, so they never crowd the
  // center box on a narrower window.
  // Measured before the first paint, so the web never draws big and then shrinks.
  const [boxRef, size] = useBoxSize(520);
  const m = hubM || spinMotion({ entering: false, leaving: false });
  const k = Math.max(0.62, Math.min(1, size / 520));
  const pts = nodes.map((nd, i) => {
    const a = (-90 + i * (360 / n)) * (Math.PI / 180);
    return { ...nd, px: 50 + 39 * Math.cos(a), py: 50 + 39 * Math.sin(a) };
  });
  return (
    <div ref={boxRef} className="relative w-full max-w-[520px] aspect-square max-h-full mx-auto">
      <div className="absolute inset-0" style={{ ...m.wrap, zIndex: 1 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" style={m.fade(1)}>
        {pts.map((nd) => (
          <line
            key={nd.role} x1="50" y1="50" x2={nd.px} y2={nd.py}
            stroke={nd.claimed ? "#4a4a4a" : "#383838"} strokeWidth={nd.claimed ? 1.5 : 2.5}
            strokeLinecap="round" strokeDasharray={nd.claimed ? undefined : "0.1 7"} vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {pts.map((nd) => {
        const active = nd.role === selectedRole;
        return (
          <button
            key={nd.role}
            type="button"
            onClick={() => selectRole(nd.role)}
            aria-label={`${SECTION_LABELS[nd.role]}, ${nd.percent}% filled in, ${nd.claimed ? "claimed" : nd.invited ? "invited" : "not invited"}`}
            className="absolute flex flex-col items-center justify-center gap-1.5 rounded-full cursor-pointer p-0"
            style={{
              left: `${nd.px}%`, top: `${nd.py}%`, ...m.node(((nd.px - 50) / 100) * size, ((nd.py - 50) / 100) * size), width: Math.round(104 * k), height: Math.round(104 * k), zIndex: 1,
              ...roleCircle(nd, active),
            }}
          >
            <span className="font-bold leading-none whitespace-nowrap tracking-[0.04em]" style={{ fontFamily: SCENE_FONT, color: nd.style.color, fontSize: Math.max(12, Math.round((ROLE_CODES[nd.role].length > 5 ? 14.5 : 20) * k)) }}>{ROLE_CODES[nd.role]}</span>
            <span className="h-[4px] rounded-full bg-[#0d0d0d]/80 overflow-hidden" style={{ width: Math.round(54 * k) }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, nd.percent)}%`, background: nd.style.color }} />
            </span>
            <span className={`text-[11px] leading-none ${active ? "text-white" : "text-white/70"}`} style={{ fontFamily: SCENE_MONO }}>{nd.percent}%</span>
          </button>
        );
      })}
      </div>
      <button
        type="button"
        onClick={() => selectRole(null)}
        className="absolute flex flex-col items-center justify-center rounded-full bg-[#161616] border px-4 overflow-hidden"
        style={{
          left: "50%", top: "50%", ...m.center, width: Math.round(164 * k), height: Math.round(164 * k), zIndex: 2,
          borderColor: selectedRole === null ? "#FFFFFF" : "#2a2a2a", borderWidth: selectedRole === null ? 2 : 1,
          boxShadow: selectedRole === null ? "0 0 0 3px #FFFFFF55, 0 0 30px #FFFFFFAA" : undefined,
        }}
      >
        {/* Just the event's picture (job 125): its photo, or its type's glyph. The name is in the header. */}
        {iconUrl ? (
          <img src={iconUrl} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
        ) : (
          <EventTypeGlyph type={gig.event_type} className="relative pointer-events-none" style={{ width: "46%", height: "46%", color: typeColor || "#FFFFFF", opacity: 0.6, strokeWidth: 1.5 }} />
        )}
        <span className="sr-only">{title}</span>
      </button>
    </div>
  );
}

function DesktopGigWeb({
  gig, title, dateLabel, myIcon, nodes, selectedRole, selectedNode, selectRole, stripCells, goBack, actionButtons, overlays,
  token, permissions, loadGig, onGigChanged, setMyIcon, user, checkingAuth, rooms, roomMembers, addTask, completeTask, claimTask,
  profileExpanded, setProfileExpanded, roleWeb, hubM, leaving, webSlot, setWebSlot, openFanPage,
  onOpenTask, focus = { role: null, key: null, n: 0 }, ownerType, openDj,
}) {
  const isOwner = !!permissions?.is_owner;
  const [completingId, setCompletingId] = useState(null);
  // Rooms open from the header icon as a panel on the right (job 117), so the
  // flight log gets the whole right column.
  const [roomsOpen, setRoomsOpen] = useState(false);
  useEffect(() => {
    if (!roomsOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setRoomsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roomsOpen]);
  const openTasks = (gig.tasks || []).filter((t) => t.status !== "done");
  const roleTasks = selectedRole ? openTasks.filter((t) => t.section === sectionOf(selectedRole)) : openTasks;
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
        <div className="ml-auto flex items-center gap-1 [&_svg]:!w-5 [&_svg]:!h-5 [&_span]:!text-[10px]">
          <button type="button" onClick={() => setRoomsOpen((v) => !v)} aria-expanded={roomsOpen} aria-label="Room" className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md transition-colors ${roomsOpen ? "text-white bg-white/10" : "text-white/60 hover:text-white"}`}>
            <MessageCircle className="w-4 h-4" />
            <span className="text-[8px] tracking-[0.08em] leading-none" style={{ fontFamily: SCENE_MONO }}>ROOM</span>
          </button>
          {actionButtons}
        </div>
      </div>

      <div className="flex-1 min-h-0 m-4 rounded-2xl border border-[#1d1d1d] overflow-hidden" style={{ ...dots, boxShadow: "inset 0 0 60px rgba(0,0,0,0.6)" }}>
        <div className="h-full grid gap-6 p-6" style={{ gridTemplateColumns: "minmax(360px, 1fr) minmax(440px, 1.3fr) minmax(300px, 0.8fr)" }}>
          <div className="relative min-h-0 flex flex-col items-center justify-center gap-4">
            <div className="w-full flex-1 min-h-0 flex items-center">
              {roleWeb ? (
                <div ref={setWebSlot} className="relative w-full max-w-[520px] aspect-square max-h-full mx-auto" />
              ) : (
                <DesktopHub nodes={nodes} selectedRole={selectedRole} selectRole={selectRole} gig={gig} title={title} myIcon={myIcon} hubM={hubM} />
              )}
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
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedNode.style.color }} />
                  <span className="min-w-0 flex flex-col">
                    <span className="text-white font-bold text-2xl leading-tight truncate">{SECTION_LABELS[selectedRole]}</span>
                    <span className="text-white/40 text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: SCENE_MONO }}>
                      {selectedNode.claimed ? "Claimed" : selectedNode.invited ? "Invited" : "Not invited"} · {selectedNode.percent}% filled in
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-white font-bold text-2xl">Board</span>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 border-t border-dashed border-[#2a2a2a] pt-3">
              <div className="flex flex-col gap-4">
                {!selectedRole && (
                  <OverviewBoard hideInvite hideStrips foldDetails nodes={nodes} onSelectRole={selectRole} permissions={permissions} token={token} gig={gig} onChanged={loadGig} onGigChanged={onGigChanged} canPersonalIcon={!!user && !isOwner} myIcon={myIcon} onMyIconChanged={(u) => { setMyIcon(u); onGigChanged?.(); }} />
                )}
                {/* Run of show + one To do list; every row opens the page where it gets done (job 120). */}
                {!selectedRole && (
                  <BoardOverview
                    gig={gig} nodes={nodes} isOwner={isOwner} userId={user?.id}
                    canWork={(section) => !!user && roleEditable(section, permissions)}
                    onGo={(role, key) => selectRole(role, key || null)}
                    onOpenTask={(id) => onOpenTask?.(id)}
                    onClaim={(id) => claimTask(id, true)}
                    onDone={(id) => completeTask(id, true)}
                  />
                )}
                <EventSections
                  token={token}
                  onChanged={loadGig}
                  selectedRole={selectedRole}
                  selectRole={selectRole}
                  webSlot={webSlot}
                  leaving={leaving}
                  onBack={() => selectRole(null)}
                  homeIcon={myIcon}
                  onOpenFanPage={openFanPage}
                  onOpenDj={openDj}
                  focus={focus}
                  ownerType={ownerType}
                  isOwner={isOwner}
                  onAddTask={addTask}
                  showInvite={false}
                  solo
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex flex-col">
            <FlightLog nodes={nodes} tasks={gig.tasks || []} codes={ROLE_CODES} onSelectRole={selectRole} selectedRole={selectedRole} />
          </div>
        </div>
      </div>

      {/* Rooms: slides in from the right over the board, under the header. */}
      {roomsOpen && (
        <div className="absolute right-4 top-[76px] bottom-4 z-30 w-[420px] max-w-[calc(100%-32px)] flex flex-col rounded-2xl bg-[#111] border border-[#2a2a2a]" role="dialog" aria-label="Room" style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.7)" }}>
          {/* The event's one room: its General chat (job 129). */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2.5 border-b border-[#1f1f1f] shrink-0">
            <span className="text-white font-bold tracking-[0.08em] text-lg">ROOM</span>
            <span className="text-white/50 text-[11px] uppercase truncate" style={{ fontFamily: SCENE_MONO }}>· {title}</span>
            <button type="button" onClick={() => setRoomsOpen(false)} aria-label="Close room" className="ml-auto p-1 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <RoomsTabPanel selectedRole={null} token={token} user={user} checkingAuth={checkingAuth} rooms={rooms} roomMembers={roomMembers} />
          </div>
        </div>
      )}
      {overlays}
    </div>
  );
}

