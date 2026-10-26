import { HOLDERS } from "@/lib/eventRoles";

// Profiles that share a section are one invite row on To do lists (job 173/174):
// Venue, Manager / Artist, Audio / Lighting. Each row opens to Invite each
// profile, or mark it "Not needed" (shows.not_needed_roles).
export const INVITE_GROUPS = [
  { key: "venue", label: "Venue", roles: ["venue"] },
  { key: "manager", label: "Manager / Artist", roles: ["manager", "band"] },
  { key: "engineer", label: "Audio / Lighting", roles: ["engineer", "lighting"] },
];

// The owner's account type -> their own circle on their event.
export const OWNER_ROLE = { venue: "venue", manager: "manager", band: "band", engineer: "engineer", lighting: "lighting" };

const has = (list, role) => !!(list || []).some((r) => HOLDERS[role].includes(r));

// Who's on each profile of an event, from get_gig_section_permissions.
export function roleStatus(role, perms) {
  const claimed = has(perms?.claimed_roles, role) || OWNER_ROLE[perms?.owner_account_type] === role;
  const notNeeded = !claimed && (perms?.not_needed_roles || []).includes(role);
  const invited = !claimed && has(perms?.invited_roles, role);
  return { role, claimed, invited, notNeeded };
}

// The invite rows still open on an event: one per group that has a profile
// nobody's on and that isn't marked Not needed.
export function openInviteGroups(perms) {
  return INVITE_GROUPS.map((g) => {
    const members = g.roles.map((r) => roleStatus(r, perms));
    const open = members.filter((m) => !m.claimed && !m.notNeeded);
    return { ...g, members, open, pending: open.length > 0 && open.every((m) => m.invited) };
  }).filter((g) => g.open.length > 0);
}

// The owner's new Not needed list after turning one profile on or off.
export function nextNotNeeded(perms, role, on) {
  const cur = perms?.not_needed_roles || [];
  return on ? [...new Set([...cur, role])] : cur.filter((r) => r !== role);
}
