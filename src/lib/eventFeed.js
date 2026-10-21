import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { HOLDERS, SECTION_HOLDERS, WEB_ROLES, sectionOf } from "@/lib/eventRoles";
import { localISO, addDaysISO, TASK_ADDED_EVENT } from "@/lib/needsMe";

// The company phone's Needs me feed (job 73): one To do list across every
// event you're part of - the same rows as the desktop event Board's To do
// (BoardOverview: conflicts, requests, open tasks, profiles with nobody on
// them), each tagged with its event.
//
// Upcoming events (and anything from the last two days) only, nearest first,
// capped so a big calendar stays quick on a phone. Owned events come from the
// shows table without tasks/requirements, so they're fetched through
// get_shared_gig; linked events already carry them. Permissions come from
// get_gig_section_permissions, same as the event page.

const MAX_EVENTS = 20;

const claimedRole = (role, p) => !!p?.claimed_roles?.some((r) => HOLDERS[role].includes(r));
const invitedRole = (role, p) => !!p?.invited_roles?.some((r) => HOLDERS[role].includes(r));

// Mirrors GigWeb's roleEditable (and set_gig_task_status's own check).
export function canWorkSection(section, p) {
  if (!p) return false;
  if (p.is_owner) return true;
  if ((p.my_roles || []).some((r) => SECTION_HOLDERS[section]?.includes(r))) return true;
  if ((p.granted_sections || []).includes(sectionOf(section))) return true;
  return invitedRole(section, p) && !claimedRole(section, p);
}

// The rows for one event, most urgent first.
export function feedRows(gig, perms, userId, today = localISO()) {
  const rows = [];
  (gig.requirements || [])
    .filter((r) => r.status === "conflict" || r.status === "requested")
    .sort((a, b) => (a.status === "conflict" ? 0 : 1) - (b.status === "conflict" ? 0 : 1))
    .forEach((r) => rows.push({ kind: r.status === "conflict" ? "conflict" : "request", id: `r-${r.id}`, req: r, section: sectionOf(r.section), canWork: !!userId && canWorkSection(sectionOf(r.section), perms) }));

  const dueRank = (t) => (t.due_date ? (t.due_date <= today ? 0 : 1) : 2);
  (gig.tasks || [])
    .filter((t) => t.status !== "done")
    .sort((a, b) =>
      Number(b.claimed_by === userId) - Number(a.claimed_by === userId) ||
      dueRank(a) - dueRank(b) ||
      String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .forEach((t) => rows.push({ kind: "task", id: `t-${t.id}`, task: t, section: sectionOf(t.section), canWork: !!userId && canWorkSection(t.section, perms) }));

  if (perms?.is_owner) {
    WEB_ROLES.filter((role) => !claimedRole(role, perms) && !invitedRole(role, perms))
      .forEach((role) => rows.push({ kind: "invite", id: `i-${role}`, role }));
  }
  return rows;
}

export default function useEventFeed(gigs, userId) {
  const [details, setDetails] = useState({}); // share_token -> { gig, perms }
  const [loading, setLoading] = useState(true);
  const runRef = useRef(0);

  const events = useMemo(() => {
    const from = addDaysISO(-2);
    return (gigs || [])
      .filter((g) => g.share_token && (!g.date || g.date >= from))
      .sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || "").localeCompare(String(b.date || "")))
      .slice(0, MAX_EVENTS);
  }, [gigs]);
  const key = events.map((g) => g.share_token).join(",");

  const load = useCallback(async () => {
    const run = ++runRef.current;
    if (!events.length) { setDetails({}); setLoading(false); return; }
    const pairs = await Promise.all(events.map(async (g) => {
      const needsGig = !Array.isArray(g.tasks) || !Array.isArray(g.requirements);
      const [gigRes, permRes] = await Promise.all([
        needsGig ? supabase.rpc("get_shared_gig", { p_token: g.share_token }) : Promise.resolve({ data: g }),
        supabase.rpc("get_gig_section_permissions", { p_token: g.share_token }),
      ]);
      if (gigRes.error) console.error(gigRes.error);
      if (permRes.error) console.error(permRes.error);
      return [g.share_token, { gig: gigRes.data ? { ...g, ...gigRes.data, icon_url: g.icon_url || gigRes.data.icon_url } : g, perms: permRes.data || null }];
    }));
    if (run !== runRef.current) return;
    setDetails(Object.fromEntries(pairs));
    setLoading(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener(TASK_ADDED_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(TASK_ADDED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Patch one task in place after Claim / Done, without a refetch.
  const patchTask = useCallback((shareToken, taskId, next) => {
    setDetails((d) => {
      const e = d[shareToken];
      if (!e) return d;
      const tasks = (e.gig.tasks || []).map((t) => (t.id === taskId ? { ...t, ...next } : t));
      return { ...d, [shareToken]: { ...e, gig: { ...e.gig, tasks } } };
    });
  }, []);

  // Patch one request (requirement) in place after Confirm / Conflict.
  const patchReq = useCallback((shareToken, reqId, next) => {
    setDetails((d) => {
      const e = d[shareToken];
      if (!e) return d;
      const requirements = (e.gig.requirements || []).map((r) => (r.id === reqId ? { ...r, ...next } : r));
      return { ...d, [shareToken]: { ...e, gig: { ...e.gig, requirements } } };
    });
  }, []);

  const groups = useMemo(() => {
    const today = localISO();
    return events
      .map((g) => {
        const e = details[g.share_token];
        if (!e) return null;
        const rows = feedRows(e.gig, e.perms, userId, today);
        return rows.length ? { gig: e.gig, perms: e.perms, rows } : null;
      })
      .filter(Boolean);
  }, [events, details, userId]);

  return { groups, loading, reload: load, patchTask, patchReq };
}
