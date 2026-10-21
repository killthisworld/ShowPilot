import { supabase } from "@/api/supabaseClient";

// Shared bits for the company phone layout (Needs me home, the "+" quick-add
// sheet, the Chats tab). Company profiles = every account type except audio /
// lighting; see claude/design-principle-device-and-business-model.md.

export const TECH_TYPES = ["engineer", "lighting"];
export const isCompanyType = (accountType) => !!accountType && !TECH_TYPES.includes(accountType);

// The section of a gig's board a profile works in. Artist shares the
// Manager section, same as everywhere else in the app.
export const SECTION_FOR_TYPE = {
  venue: "venue",
  manager: "manager",
  band: "manager",
  engineer: "engineer",
  lighting: "engineer",
};

// Same three sections and colors as Gig Rooms / the gig board.
export const SECTIONS = [
  { id: "venue", label: "Venue", color: "#60A5FA" },
  { id: "manager", label: "Manager/Artist", color: "#EF4444" },
  { id: "engineer", label: "Audio/Lighting", color: "#8CFF3D" },
];
export const sectionMeta = (id) => SECTIONS.find((s) => s.id === id) || { id, label: id, color: "#9A9A9A" };

// Per-profile words, so each profile sees its own vocabulary on one shared
// layout ("one company phone layout, role-tuned content").
export function vocab(accountType) {
  if (accountType === "venue") return { events: "Nights", event: "night", today: "Tonight" };
  return { events: "Events", event: "event", today: "Today" };
}

export const BLAZE = "#FF6A00";
export const BLAZE_TINT = "#341c0b";

// Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the clock
// on the person's phone).
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDaysISO(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return localISO(d);
}
// Sunday of this week (weeks run Mon-Sun, same as BandHome's This Week).
export function endOfWeekISO(from = new Date()) {
  const d = new Date(from);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow));
  return localISO(d);
}

export function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "OVERDUE" / "DUE TODAY" / "DUE TOMORROW" / "DUE NOV 2", plus whether it
// needs the Blaze (urgent) color.
export function dueInfo(dueISO) {
  if (!dueISO) return null;
  const today = localISO();
  if (dueISO < today) return { label: "OVERDUE", urgent: true };
  if (dueISO === today) return { label: "DUE TODAY", urgent: true };
  if (dueISO === addDaysISO(1)) return { label: "DUE TOMORROW", urgent: false };
  return { label: `DUE ${shortDate(dueISO).toUpperCase()}`, urgent: false };
}

export function timeAgo(ts) {
  if (!ts) return "";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function chatHref(chat) {
  if (chat.kind === "direct") return `/gig/messages?token=${chat.share_token}&thread=${chat.id}`;
  return `/gig/rooms?token=${chat.share_token}&room=${chat.id}`;
}

export function chatTitle(chat) {
  if (chat.kind === "direct") return chat.other_name || "Direct message";
  if (chat.kind === "general_room") return "General";
  return sectionMeta(chat.section).label;
}

// One call for the whole Needs me screen (supabase/company_phone_migration.sql).
// Returns null if the call fails, e.g. before that migration is applied, so
// the screen can still show what it has.
export async function fetchNeedsMe() {
  const { data, error } = await supabase.rpc("get_needs_me");
  if (error) {
    console.error(error);
    return null;
  }
  return { tasks: data?.tasks || [], changes: data?.changes || [], chats: data?.chats || [] };
}

// Best-effort: unread counts are a convenience, never something that should
// break a chat if the call fails.
export function markConversationRead(conversationId) {
  if (!conversationId) return;
  supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId }).then(({ error }) => {
    if (error && error.code !== "PGRST202") console.error(error);
  });
}

// "Got it" on a change is remembered on this device only.
const SEEN_KEY = "showpilot_seen_changes";
export function readSeenChanges() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
export function rememberSeenChange(key) {
  try {
    const seen = [...readSeenChanges(), key].slice(-200);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* private mode: it just shows again next visit */ }
}

// Fired after the quick-add sheet saves a task, so Needs me (and anything
// else listening) can refresh without a reload.
export const TASK_ADDED_EVENT = "showpilot:task-added";
// Fired by the "+" button; the sheet listens for it.
export const OPEN_QUICK_ADD_EVENT = "showpilot:open-quick-add";
export const openQuickAdd = () => window.dispatchEvent(new Event(OPEN_QUICK_ADD_EVENT));

// Swipe to delete a chat (job 73): takes it off this person's Chats list
// until a new message arrives. Saved on the server (hide_conversation, see
// supabase/chat_hide_migration.sql) and on this device, so the list updates
// at once and still works if the server step isn't there yet.
const HIDDEN_CHATS_KEY = "showpilot_hidden_chats";
function readHiddenChats() {
  try { return JSON.parse(localStorage.getItem(HIDDEN_CHATS_KEY) || "{}"); } catch { return {}; }
}
export function isChatHidden(chat, hidden = readHiddenChats()) {
  const at = hidden[chat.id];
  return !!at && !(chat.last_at && new Date(chat.last_at).getTime() > new Date(at).getTime());
}
export function visibleChats(chats) {
  const hidden = readHiddenChats();
  return (chats || []).filter((c) => !isChatHidden(c, hidden));
}
export async function hideChat(chat) {
  try {
    const hidden = readHiddenChats();
    hidden[chat.id] = new Date().toISOString();
    // Keep the newest 200.
    const trimmed = Object.fromEntries(Object.entries(hidden).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 200));
    localStorage.setItem(HIDDEN_CHATS_KEY, JSON.stringify(trimmed));
  } catch { /* private mode: the server copy still hides it */ }
  const { error } = await supabase.rpc("hide_conversation", { p_conversation_id: chat.id });
  if (error && error.code !== "PGRST202") console.error(error);
}
