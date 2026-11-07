import { supabase } from "@/api/supabaseClient";

// Booking packages (job 246): an artist / manager sends their act's info and
// the dates they want to a venue. See supabase/booking_package_migration.sql.

export const PACKAGE_RED = "#F87171";

// The next 12 months, plus "any time".
export function upcomingMonths(from = new Date(), count = 12) {
  const out = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let i = 0; i < count; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export const DAYS = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" }, { key: "sat", label: "Sat" }, { key: "sun", label: "Sun" },
];

const monthLabel = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
};

// "Mar or Apr 2027 · Thu to Sat", "Any time · Fridays", "Mar 2027".
export function wantsLine(wants = {}) {
  const months = Array.isArray(wants.months) ? wants.months.filter(Boolean) : [];
  let when = "";
  if (months.includes("any")) when = "Any time";
  else if (months.length) {
    const sorted = [...months].sort();
    const years = [...new Set(sorted.map((k) => k.slice(0, 4)))];
    const names = sorted.map(monthLabel);
    const list = names.length <= 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
    when = years.length === 1 ? `${list} ${years[0]}` : sorted.map((k) => `${monthLabel(k)} ${k.slice(0, 4)}`).join(", ");
  }
  const days = Array.isArray(wants.days) ? DAYS.filter((d) => wants.days.includes(d.key)) : [];
  let nights = "";
  if (days.length === 1) nights = `${days[0].label}s`;
  else if (days.length > 1 && days.length < 7) {
    const idx = days.map((d) => DAYS.indexOf(d));
    const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    nights = run && days.length > 2 ? `${days[0].label} to ${days[days.length - 1].label}` : days.map((d) => d.label).join(", ");
  } else if (days.length === 7) nights = "Any night";
  return [when, nights].filter(Boolean).join(" · ");
}

export const packageUrl = (code) => `${window.location.origin}/p/${String(code || "").toUpperCase()}`;

export async function savePackage({ id, act, data, wants, to }) {
  const { data: row, error } = await supabase.rpc("save_booking_package", {
    p_id: id || null, p_act: act || "", p_data: data || {}, p_wants: wants || {},
    p_to_name: to?.name || "", p_to_email: to?.email || "", p_to_phone: to?.phone || "",
  });
  if (error) throw error;
  return row;
}

export async function sendPackage(id) {
  const { data, error } = await supabase.rpc("send_booking_package", { p_id: id });
  if (error) throw error;
  return data;
}

export async function loadPackage(id) {
  const { data, error } = await supabase.rpc("get_booking_package", { p_id: id });
  if (error) throw error;
  return data;
}

export async function listMyPackages() {
  const { data, error } = await supabase.rpc("list_my_booking_packages");
  if (error) throw error;
  return data || [];
}

export async function loadPublicPackage(code) {
  const { data, error } = await supabase.rpc("get_booking_package_public", { p_code: code });
  if (error) throw error;
  return data;
}
