import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// A month heading that opens a list of months: calendars use it to pick the
// month shown, home pages to jump to a month's group. Options are
// [{ key, label, count?, group? }]; `group` (usually the year) starts a new
// section in the list. The list floats in a portal so scrolling month
// columns don't clip it.
export default function MonthDropdown({
  label, value, options = [], onSelect, align = "left", className = "", style, accent = "#8CFF3D",
  ariaLabel = "Choose a month", chevronClass = "w-[0.8em] h-[0.8em]",
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(280, window.innerWidth - 16);
    let left = align === "center" ? r.left + r.width / 2 - w / 2 : align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 12;
    const maxH = Math.max(180, Math.min(380, below > 220 ? below : r.top - 12));
    const top = below > 220 || below >= r.top ? r.bottom + 6 : Math.max(8, r.top - 6 - maxH);
    setPos({ left, top, width: w, maxH });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (listRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    const onMove = (e) => { if (!listRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring the current month into view and give it focus when the list opens.
  useEffect(() => {
    if (!open || !pos) return;
    const list = listRef.current;
    const cur = list?.querySelector('[aria-current="true"]') || list?.querySelector("button");
    if (list && cur) list.scrollTop = Math.max(0, cur.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2);
    cur?.focus({ preventScroll: true });
  }, [open, pos]);

  const pick = (key) => { setOpen(false); onSelect?.(key); btnRef.current?.focus(); };
  const onListKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(listRef.current?.querySelectorAll("button[data-month]") || [])];
    const i = items.indexOf(document.activeElement);
    const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    next?.focus();
  };

  let lastGroup = null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}. ${ariaLabel}`}
        className={`inline-flex items-center gap-1.5 rounded-lg hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 ${className}`}
        style={style}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`${chevronClass} shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={onListKey}
          className="fixed z-[200] overflow-y-auto rounded-xl bg-[#161616] border border-[#2e2e2e] shadow-[0_18px_40px_rgba(0,0,0,0.65)] pb-1.5"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH, fontFamily: SCENE_FONT }}
        >
          {options.map((o) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group || lastGroup;
            const on = o.key === value;
            const empty = o.count === 0;
            return (
              <React.Fragment key={o.key}>
                {head && (
                  <div className="sticky top-0 z-[1] px-3.5 pt-2 pb-1 text-[10.5px] tracking-[0.14em] text-white/45 bg-[#161616]" style={{ fontFamily: SCENE_MONO }}>{head}</div>
                )}
                <button
                  type="button"
                  role="option"
                  data-month={o.key}
                  aria-selected={on}
                  aria-current={on ? "true" : undefined}
                  onClick={() => pick(o.key)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[15px] hover:bg-white/[0.06] focus:bg-white/[0.08] focus:outline-none"
                  style={{ color: on ? accent : empty ? "rgba(255,255,255,0.45)" : "#f2f2f2" }}
                >
                  <span className="w-4 shrink-0">{on && <Check className="w-4 h-4" strokeWidth={3} />}</span>
                  <span className="flex-1 truncate font-semibold">{o.label}</span>
                  {o.count > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ fontFamily: SCENE_MONO, color: on ? "#0d0d0d" : accent, background: on ? accent : `${accent}1f` }}>{o.count}</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

// Every month from a little before the earliest to a little after the latest
// date given (and around today), for a calendar's month picker. `counts` maps
// "YYYY-MM" to how many events that month has.
export function calendarMonthOptions({ dates = [], counts = {}, before = 12, after = 18 }) {
  const now = new Date();
  const toIdx = (y, m) => y * 12 + m;
  let lo = toIdx(now.getFullYear(), now.getMonth()) - before;
  let hi = toIdx(now.getFullYear(), now.getMonth()) + after;
  dates.forEach((d) => {
    if (!d || !/^\d{4}-\d{2}/.test(d)) return;
    const i = toIdx(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1);
    lo = Math.min(lo, i - 1);
    hi = Math.max(hi, i + 1);
  });
  const out = [];
  for (let i = lo; i <= hi; i += 1) {
    const y = Math.floor(i / 12);
    const m = i % 12;
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    out.push({
      key,
      label: new Date(y, m, 1).toLocaleDateString("en-US", { month: "long" }),
      group: String(y),
      count: counts[key] || 0,
    });
  }
  return out;
}

const isMonthKey = (k) => /^\d{4}-\d{2}$/.test(k || "");

// Home pages group shows by month, but the jump list should still offer
// every month (this one through a year out, plus any month that has shows),
// not just the months that happen to have shows. `groups` is
// [{ key, label, count }]; non-month groups ("past", "undated") keep their
// place first / last. Months without shows are listed dimmed.
export function jumpMonthOptions(groups = []) {
  const dated = groups.filter((g) => isMonthKey(g.key));
  const counts = Object.fromEntries(dated.map((g) => [g.key, g.count || 0]));
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const first = [thisMonth, ...dated.map((g) => g.key)].sort()[0];
  const range = calendarMonthOptions({ dates: dated.map((g) => `${g.key}-01`), counts, before: 0, after: 12 })
    .filter((o) => o.key >= first);
  const other = groups.filter((g) => !isMonthKey(g.key)).map((g) => ({ key: g.key, label: g.label, count: g.count, group: "Other" }));
  return [...other.filter((o) => o.key === "past"), ...range, ...other.filter((o) => o.key !== "past")];
}

// Where a jump lands: that month if it has a group, else the next month
// that does, else the last one.
export function nearestMonthKey(key, keys = []) {
  if (keys.includes(key)) return key;
  const dated = keys.filter(isMonthKey).sort();
  return dated.find((k) => k > key) || dated[dated.length - 1] || keys[0];
}
