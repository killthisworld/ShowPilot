import { SECTION_FOR_TYPE } from "@/lib/needsMe";

// Which of an event's open tasks are yours to do (job 210), so the number on
// every tasks icon means the same thing in every layout: tasks in a section
// you work on, or ones you claimed. A section you work on is your own
// profile's section on an event you own, a role you hold on it, or a section
// you were granted. Same rule as get_needs_me (My tasks), plus claimed tasks.
const ROLE_TO_SECTION = { venue: "venue", manager: "manager", band: "manager", engineer: "engineer", lighting: "engineer" };

export function mySections(permissions, accountType) {
  const mine = new Set();
  if (permissions?.is_owner && SECTION_FOR_TYPE[accountType]) mine.add(SECTION_FOR_TYPE[accountType]);
  [...(permissions?.my_roles || []), ...(permissions?.granted_sections || [])].forEach((r) => ROLE_TO_SECTION[r] && mine.add(ROLE_TO_SECTION[r]));
  return mine;
}

export function myOpenTasks(tasks, permissions, accountType, userId) {
  const mine = mySections(permissions, accountType);
  return (tasks || []).filter((t) => t.status !== "done" && (mine.has(t.section) || (userId && t.claimed_by === userId)));
}
