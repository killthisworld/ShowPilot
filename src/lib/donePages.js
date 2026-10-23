// "Mark as done" on a profile's pages (job 148). A page someone marked done
// counts as done whatever its fields say. Stored with the section:
// venue_info.done_pages, manager_info.done_pages (Artist pages as "band:<key>"),
// engineer_info.audio/lighting.done_pages.
const ENGINEER_KEY = { engineer: "audio", lighting: "lighting" };
const tag = (role, key) => (role === "band" ? `band:${key}` : key);

function list(role, gig) {
  if (!gig) return [];
  if (role === "venue") return gig.venue_info?.done_pages || [];
  if (role === "manager" || role === "band") return gig.manager_info?.done_pages || [];
  if (ENGINEER_KEY[role]) return gig.engineer_info?.[ENGINEER_KEY[role]]?.done_pages || [];
  return [];
}

export const isPageMarkedDone = (role, gig, key) => list(role, gig).includes(tag(role, key));

// [section, updates, field, patch]: the update_gig_section call that marks
// (or unmarks) one page, and the bit to merge into the page's own copy.
export function donePagesSave(role, gig, key, done, engineerSection = "engineer") {
  const cur = list(role, gig).filter((k) => k !== tag(role, key));
  const next = done ? [...cur, tag(role, key)] : cur;
  if (role === "venue") {
    const venue_info = { ...(gig.venue_info || {}), done_pages: next };
    return ["venue", { venue_info }, "venue_info", { done_pages: next }];
  }
  if (role === "manager" || role === "band") {
    return ["manager", { ...(gig.manager_info || {}), done_pages: next }, "manager_info", { done_pages: next }];
  }
  const k = ENGINEER_KEY[role];
  const ei = gig.engineer_info || {};
  const sub = { ...(ei[k] || {}), done_pages: next };
  return [engineerSection, { ...ei, [k]: sub }, "engineer_info", { [k]: { ...((gig.engineer_info || {})[k] || {}), done_pages: next } }];
}
