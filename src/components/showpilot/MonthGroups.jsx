import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// A long event list split into one dropdown per month (job 115). Each month's
// header takes the color of its most frequent event type, so a month of mostly
// concerts reads in the Concert color. The current month (or the first month
// shown) starts open; `openAll` (e.g. while searching) opens every month.
//
// children: (showsInMonth) => the list for that month (rows, pads...).

const NO_DATE = "no-date";
const NEUTRAL = "#9A9A9A";

const monthKey = (s) => (s.date ? String(s.date).slice(0, 7) : NO_DATE);
const monthLabel = (key) => {
  if (key === NO_DATE) return "NO DATE";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
};

// Most frequent event type in the month (ties go to the one seen first).
function topTypeColor(list) {
  const counts = new Map();
  list.forEach((s) => { if (s.event_type) counts.set(s.event_type, (counts.get(s.event_type) || 0) + 1); });
  let best = null, bestN = 0;
  counts.forEach((n, t) => { if (n > bestN) { best = t; bestN = n; } });
  return (best && eventTypeColor(best)) || NEUTRAL;
}

export default function MonthGroups({ shows, openAll = false, children }) {
  const groups = useMemo(() => {
    const byKey = new Map();
    shows.forEach((s) => {
      const k = monthKey(s);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(s);
    });
    // Months in date order, undated last.
    return [...byKey.entries()]
      .sort(([a], [b]) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : a.localeCompare(b)))
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
        return { key, list: sorted, color: topTypeColor(sorted) };
      });
  }, [shows]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const startOpen = groups.some((g) => g.key === thisMonth) ? thisMonth : groups[0]?.key;
  const [open, setOpen] = useState({}); // month key -> true/false, once toggled
  const isOpen = (key) => openAll || (key in open ? open[key] : key === startOpen);

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => {
        const on = isOpen(g.key);
        return (
          <section key={g.key}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [g.key]: !on }))}
              aria-expanded={on}
              className="w-full flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-[10px] border transition-colors text-left"
              style={{ background: `${g.color}14`, borderColor: on ? `${g.color}80` : `${g.color}40`, boxShadow: `inset 4px 0 0 ${g.color}` }}
            >
              <span className="flex-1 min-w-0 truncate text-[17px] font-bold tracking-[0.05em]" style={{ fontFamily: SCENE_FONT, color: g.color }}>{monthLabel(g.key)}</span>
              <span className="shrink-0 text-[11px] text-white/70 tabular-nums px-1.5 py-0.5 rounded-[4px] bg-white/10" style={{ fontFamily: SCENE_MONO }}>{g.list.length}</span>
              <ChevronDown className="w-4 h-4 shrink-0 transition-transform" style={{ color: g.color, transform: on ? "rotate(180deg)" : "none" }} />
            </button>
            {on && <div className="mt-1.5">{children(g.list)}</div>}
          </section>
        );
      })}
    </div>
  );
}
