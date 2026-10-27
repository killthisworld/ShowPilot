// The venue's advance schedule (job 185): steps that go out on their own,
// counted from the show date. Server side: supabase/event_advance_schedule_migration.sql
// and the run-advance-steps edge function (pg_cron, every 15 minutes).
import { supabase } from "@/api/supabaseClient";

export const ADVANCE_HOW = {
  chat: { label: "Message", long: "Message in the Mgmt / Artist room" },
  task: { label: "Task", long: "Task for Mgmt / Artist" },
  email: { label: "Email", long: "Email the event link to the act" },
};

const sid = () => Math.random().toString(36).slice(2, 9);
export const DEFAULT_ADVANCE_STEPS = () => [
  { id: sid(), days: 21, time: "10:00", how: "email", title: "Send the event link", body: "", only_if_incomplete: false, on: true },
  { id: sid(), days: 14, time: "10:00", how: "chat", title: "Advance check-in", body: "Hey {act}, we still need {missing} from the event link: {link}", only_if_incomplete: true, on: true },
  { id: sid(), days: 7, time: "10:00", how: "task", title: "Confirm set times and guest list", body: "", only_if_incomplete: false, on: true },
  { id: sid(), days: 1, time: "10:00", how: "chat", title: "Day-of reminder", body: "See you tomorrow! Load-in {load_in}, doors {doors}, curfew {curfew}.", only_if_incomplete: false, on: true },
  { id: sid(), days: -1, time: "11:00", how: "chat", title: "Thanks", body: "Thanks for a great night, {act}!", only_if_incomplete: false, on: true },
];
export const newAdvanceStep = () => ({ id: sid(), days: 7, time: "10:00", how: "chat", title: "", body: "", only_if_incomplete: false, on: true });

// When a step goes out for a show on `date` (YYYY-MM-DD), in this browser's time zone.
export function stepSendAt(date, step) {
  if (!date) return null;
  const [h, m] = String(step.time || "10:00").split(":").map((x) => parseInt(x, 10));
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - (Number(step.days) || 0));
  d.setHours(Number.isFinite(h) ? h : 10, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}
export const whenLabel = (step) => {
  const n = Number(step.days) || 0;
  if (n === 0) return "Day of the show";
  if (n === 1) return "Day before";
  if (n === -1) return "Day after";
  return n > 0 ? `${n} days before` : `${-n} days after`;
};
export const fmtWhen = (d) => (d ? new Date(d).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export async function fetchEventAdvance(showId) {
  const { data, error } = await supabase.rpc("get_event_advance", { p_show: showId });
  if (error) { console.error(error); return []; }
  return Array.isArray(data) ? data : [];
}
// steps: template steps; returns { added, skipped, past }.
export async function scheduleAdvance(showId, date, steps) {
  const now = Date.now();
  let past = 0;
  const rows = (steps || []).filter((s) => s.on !== false).map((s) => {
    const at = stepSendAt(date, s);
    if (!at || at.getTime() < now) { past += 1; return null; }
    return { step_id: s.id, how: s.how, title: s.title || "", body: s.body || "", send_at: at.toISOString(), only_if_incomplete: !!s.only_if_incomplete };
  }).filter(Boolean);
  if (!rows.length) return { added: 0, skipped: 0, past };
  const { data, error } = await supabase.rpc("schedule_event_advance", { p_show: showId, p_steps: rows });
  if (error) throw error;
  return { ...(data || {}), past };
}
export async function updateAdvanceStep(id, { title = null, body = null, sendAt = null, status = null } = {}) {
  const { data, error } = await supabase.rpc("update_event_advance", { p_id: id, p_title: title, p_body: body, p_send_at: sendAt, p_status: status });
  if (error) throw error;
  return data;
}
