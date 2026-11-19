import React, { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import MonthGroups from "@/components/showpilot/MonthGroups";
import { DJ_COLOR } from "@/lib/djTools";

// The DJ pages' layout (job 372, Jay 2026-11-19), like the audio profile's
// home: THIS WEEK on top as small tickets to scroll sideways, then every
// month below to open and close. items need { key, date }; week(item) draws
// a week ticket, row(item) a month one.
const mono = { fontFamily: "'JetBrains Mono', monospace" };

// The bar every set has (job 372): one section per act, in play order,
// each filled in green when that act sends their set.
export function ActBar({ slots = [], height = 6 }) {
  if (!slots.length) return null;
  return (
    <div aria-hidden="true" className="flex gap-[3px]">
      {slots.map((st, i) => (
        <span key={i} className="flex-1 rounded-full" style={{ height, background: st === "submitted" ? "#8CFF3D" : "#2e2e2e" }} />
      ))}
    </div>
  );
}

function weekRange() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const dow = t.getDay();
  const mon = new Date(t);
  mon.setDate(t.getDate() - (dow === 0 ? 6 : dow - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { from: iso(t), to: iso(sun), label: `${fmt(mon)} – ${fmt(sun)}` };
}

export default function DjWeekMonths({ items, week, row, empty = "Nothing this week.", showWeek = true, openAll = false }) {
  const range = useMemo(weekRange, []);
  const thisWeek = items.filter((x) => x.date && x.date >= range.from && x.date <= range.to);
  return (
    <div className="flex flex-col gap-3">
      {showWeek && (
      <section className="rounded-2xl border border-white/20 bg-[#0d0e14]/85 backdrop-blur p-3.5">
        <div className="flex items-center gap-2 mb-2.5">
          <CalendarDays className="w-3.5 h-3.5 text-white/45" />
          <h2 className="m-0 text-[10.5px] tracking-[0.14em] text-white/65 font-medium" style={mono}>THIS WEEK</h2>
          <span className="ml-auto text-[10.5px] text-white/50" style={mono}>{range.label.toUpperCase()}</span>
        </div>
        {thisWeek.length === 0 ? (
          <p className="m-0 text-[13.5px] text-white/45">{empty}</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">{thisWeek.map((x) => <React.Fragment key={x.key}>{week(x)}</React.Fragment>)}</div>
        )}
      </section>
      )}
      {items.length > 0 && (
        <MonthGroups key={openAll ? "all" : "some"} shows={items} color={DJ_COLOR} openAll={openAll}>
          {(list) => <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{list.map((x) => <React.Fragment key={x.key}>{row(x)}</React.Fragment>)}</div>}
        </MonthGroups>
      )}
    </div>
  );
}
