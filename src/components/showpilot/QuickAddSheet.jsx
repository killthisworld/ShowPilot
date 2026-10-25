import React, { useEffect, useMemo, useRef, useState } from "react";
import { eventTitle } from "@/lib/eventTitle";
import TicketCard from "@/components/showpilot/TicketCard";
import MonthDropdown, { calendarMonthOptions } from "@/components/showpilot/MonthDropdown";
import { X, Search, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import {
  SECTIONS, SECTION_FOR_TYPE, sectionMeta, vocab, localISO, addDaysISO, endOfWeekISO, shortDate,
  TASK_ADDED_EVENT, OPEN_QUICK_ADD_EVENT,
} from "@/lib/needsMe";

// The company phone layout's global "+": add a task to any event in three
// taps - pick the event, type the task, Add. Due date and who it's for are
// optional (who defaults to your own section). Mockup: "+ Quick-add" on the
// Company Phone Layout design canvas.
//
// Only events you own are listed, because only the event owner can add
// tasks (add_gig_task enforces that server-side).
// The bottom bar (and so this sheet) can be mounted twice at once - e.g.
// BandHome's bar plus Gig Web's own bar inside its overlay - so only the most
// recently mounted sheet answers the "+" and they never open together.
const mounted = [];
let nextId = 0;

export default function QuickAddSheet({ preferences, accent }) {
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++nextId;
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState("event"); // event | task | done
  const [events, setEvents] = useState(null);
  const [query, setQuery] = useState("");
  // Month picker beside the search (job 73): "" = all months, else "YYYY-MM".
  const [month, setMonth] = useState("");
  const [ev, setEv] = useState(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState(null); // null | today | tomorrow | week | date
  const [dueDate, setDueDate] = useState("");
  const homeSection = SECTION_FOR_TYPE[preferences?.account_type] || "manager";
  const [section, setSection] = useState(homeSection);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(null); // { task, dueNote }
  const textRef = useRef(null);
  const words = vocab(preferences?.account_type);

  const reset = () => {
    setStep("event"); setQuery(""); setMonth(""); setEv(null); setText(""); setDue(null); setDueDate("");
    setSection(homeSection); setError(""); setAdded(null);
  };

  useEffect(() => {
    const myId = idRef.current;
    mounted.push(myId);
    const onOpen = () => {
      if (mounted[mounted.length - 1] !== myId) return;
      reset();
      setOpen(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    };
    window.addEventListener(OPEN_QUICK_ADD_EVENT, onOpen);
    return () => {
      window.removeEventListener(OPEN_QUICK_ADD_EVENT, onOpen);
      const i = mounted.indexOf(myId);
      if (i !== -1) mounted.splice(i, 1);
    };
  }, [homeSection]);

  const close = () => {
    setVisible(false);
    setTimeout(() => setOpen(false), 220);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Load (or refresh) your events each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setEvents([]); return; }
      const { data, error: err } = await supabase
        .from("shows")
        .select("id, share_token, event_name, band_name, venue, city, date, event_type, icon_url")
        .eq("owner_id", user.id)
        .eq("archived", false);
      if (err) console.error(err);
      if (!cancelled) setEvents(data || []);
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (step === "task") setTimeout(() => textRef.current?.focus(), 60);
  }, [step]);

  // Up next (soonest first), then undated, then recent (newest first).
  const ordered = useMemo(() => {
    const today = localISO();
    const list = events || [];
    const upcoming = list.filter((e) => e.date && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const undated = list.filter((e) => !e.date);
    const past = list.filter((e) => e.date && e.date < today).sort((a, b) => b.date.localeCompare(a.date));
    return [...upcoming, ...undated, ...past];
  }, [events]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (e) => !q || [e.event_name, e.band_name, e.venue, e.city].some((v) => v?.toLowerCase().includes(q));
    // A month picked: every event that month, in date order.
    if (month) return (events || []).filter((e) => e.date?.startsWith(month) && matches(e)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
    if (!q) return ordered.slice(0, 6);
    return ordered.filter(matches).slice(0, 30);
  }, [ordered, events, query, month]);

  // Every month around your events, with how many each has; "All months" first.
  const monthOptions = useMemo(() => {
    const counts = {};
    (events || []).forEach((e) => { if (e.date) { const k = e.date.slice(0, 7); counts[k] = (counts[k] || 0) + 1; } });
    return [{ key: "all", label: "All months", group: "ANY" }, ...calendarMonthOptions({ dates: (events || []).map((e) => e.date).filter(Boolean), counts })];
  }, [events]);
  const monthName = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  const dueISO = due === "today" ? localISO() : due === "tomorrow" ? addDaysISO(1) : due === "week" ? endOfWeekISO() : due === "date" ? (dueDate || null) : null;

  const add = async () => {
    const title = text.trim();
    if (!title || !ev || saving) return;
    setSaving(true);
    setError("");
    let res = await supabase.rpc("add_gig_task", { p_token: ev.share_token, p_section: section, p_title: title, p_due_date: dueISO });
    let dueNote = "";
    // Before the due-date migration is applied the 4-argument call doesn't
    // exist yet - still add the task, just without its due date.
    if (res.error && res.error.code === "PGRST202") {
      res = await supabase.rpc("add_gig_task", { p_token: ev.share_token, p_section: section, p_title: title });
      if (!res.error && dueISO) dueNote = "Due dates aren't switched on yet, so this one was saved without its date.";
    }
    setSaving(false);
    if (res.error) {
      console.error(res.error);
      setError(res.error.message?.includes("owner") ? `Only the ${words.event}'s owner can add tasks to it.` : "Couldn't add that task. Try again.");
      return;
    }
    setAdded({ task: res.data, dueNote });
    setStep("done");
    window.dispatchEvent(new Event(TASK_ADDED_EVENT));
  };

  const undo = async () => {
    if (!added?.task?.id || !ev) return;
    const { error: err } = await supabase.rpc("delete_gig_task", { p_token: ev.share_token, p_task_id: added.task.id });
    if (err) { console.error(err); setError("Couldn't undo. Remove it from the board instead."); return; }
    window.dispatchEvent(new Event(TASK_ADDED_EVENT));
    setAdded(null);
    setStep("task");
  };

  const again = () => { reset(); };

  if (!open) return null;

  const stepIdx = step === "event" ? 1 : step === "task" ? 2 : 3;
  const evColor = (e) => eventTypeColor(e?.event_type) || accent;
  const chip = (picked, color = accent) => ({
    background: picked ? color : "#1f1f1f",
    color: picked ? "#0d0d0d" : "#f2f2f2",
    border: `1.5px solid ${picked ? color : "#333"}`,
  });
  const dueLabel = { today: "Today", tomorrow: "Tomorrow", week: "This week" };

  return (
    <div className="fixed inset-0 z-[90]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={close}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick-add a task"
        className={`absolute left-0 right-0 bottom-0 mx-auto max-w-lg bg-[#121212] border-t border-[#2a2a2a] rounded-t-[22px] px-5 pt-2.5 pb-7 flex flex-col gap-3.5 transition-transform duration-200 ease-out ${visible ? "translate-y-0" : "translate-y-full"}`}
        style={{ height: "min(690px, 88vh)" }}
      >
        <div className="self-center w-10 h-[5px] rounded-full bg-[#3a3a3a]" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <span key={n} className="w-[34px] h-[5px] rounded-full" style={{ background: stepIdx >= n ? accent : "#333" }} />
            ))}
            <span className="ml-1.5 text-[11px] text-white/55" style={{ fontFamily: SCENE_MONO }}>
              {step === "event" ? `PICK ${words.event.toUpperCase()}` : step === "task" ? "WRITE IT" : "DONE"}
            </span>
          </div>
          <button onClick={close} aria-label="Close" className="w-11 h-11 rounded-full bg-[#1f1f1f] text-white flex items-center justify-center">
            <X className="w-[18px] h-[18px]" strokeWidth={2.5} />
          </button>
        </div>

        {step === "event" && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <h2 className="m-0 text-[28px] font-bold tracking-[0.02em] text-white" style={{ fontFamily: SCENE_FONT }}>Add a task to…</h2>
            <div className="flex items-center gap-2">
            <label className="flex-1 min-w-0 flex items-center gap-2.5 h-[46px] px-3.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white/55">
              <Search className="w-[18px] h-[18px]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={`Search ${words.events.toLowerCase()}`}
                placeholder={`Search all ${words.events.toLowerCase()}`}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-white text-base placeholder:text-white/40"
              />
            </label>
            {/* Look up a specific month. */}
            <MonthDropdown
              label={month ? monthName(month) : "Month"}
              value={month || "all"}
              options={monthOptions}
              onSelect={(k) => setMonth(k === "all" ? "" : k)}
              align="right"
              accent={accent}
              ariaLabel="Show one month"
              className="shrink-0 h-[46px] px-3 bg-[#1a1a1a] border border-[#2a2a2a] text-[15px] font-semibold"
              style={{ color: month ? accent : "rgba(255,255,255,0.75)", fontFamily: "Inter, system-ui, sans-serif" }}
            />
            </div>
            <div className="text-[13px] font-bold tracking-[0.08em] text-white/55" style={{ fontFamily: SCENE_FONT }}>
              {month ? `${monthName(month).toUpperCase()}${query.trim() ? " · MATCHES" : ""}` : query.trim() ? "MATCHES" : "UP NEXT & RECENT"}
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto min-h-0 pb-2">
              {events === null ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" /></div>
              ) : shown.length === 0 ? (
                <p className="text-white/45 text-sm py-6 text-center">
                  {month && !query.trim() ? `No ${words.events.toLowerCase()} in ${monthName(month)}.` : query.trim() ? `No ${words.events.toLowerCase()} match "${query.trim()}".` : `You don't own any ${words.events.toLowerCase()} yet. Tasks can be added by an ${words.event}'s owner.`}
                </p>
              ) : shown.map((e) => {
                const isPast = e.date && e.date < localISO();
                const c = evColor(e);
                return (
                  // Each event is a ticket, like the desktop board (job 73):
                  // date on the stub, the event photo across the body.
                  <TicketCard
                    key={e.id}
                    className="shrink-0"
                    color={c}
                    date={e.date}
                    photo={e.icon_url}
                    dim={isPast}
                    centered
                    corner={isPast ? <span className="text-[10px] font-bold tracking-[0.08em] text-white/60" style={{ fontFamily: SCENE_MONO }}>PAST</span> : null}
                    shadow={false}
                    onClick={() => { setEv(e); setStep("task"); setError(""); }}
                    ariaLabel={`Add a task to ${e.event_name || e.band_name || "this event"}`}
                  >
                    {/* Centered like the desktop Home tickets (job 127). */}
                    <span className="flex flex-col items-center justify-center gap-1 min-w-0 min-h-[56px] text-center">
                      <span className="text-[17px] font-semibold leading-tight text-white line-clamp-2 break-words">{eventTitle(e)}</span>
                      <span className="text-[10.5px] tracking-[0.04em] text-white/60 truncate max-w-full uppercase" style={{ fontFamily: SCENE_MONO }}>{[e.venue, e.city].filter(Boolean).join(" · ") || "No venue yet"}</span>
                    </span>
                  </TicketCard>
                );
              })}
            </div>
          </div>
        )}

        {step === "task" && ev && (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
            <button
              onClick={() => setStep("event")}
              className="self-start flex items-center gap-2 h-11 px-3.5 rounded-full bg-[#1a1a1a] text-white text-sm font-semibold max-w-full"
              style={{ border: `1.5px solid ${evColor(ev)}` }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: evColor(ev) }} />
              <span className="truncate">{eventTitle(ev)}{ev.date ? ` · ${shortDate(ev.date)}` : ""}</span>
              <span className="text-white/55 font-medium shrink-0">Change</span>
            </button>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="quick-task-text" className="text-[13px] font-bold tracking-[0.08em] text-white/55" style={{ fontFamily: SCENE_FONT }}>TASK</label>
              <textarea
                id="quick-task-text"
                ref={textRef}
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } }}
                placeholder="What needs doing?"
                className="w-full resize-none p-3.5 rounded-xl bg-[#1a1a1a] border-[1.5px] border-[#333] text-white text-[17px] leading-[1.4] outline-none focus:border-white/40 placeholder:text-white/40"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-bold tracking-[0.08em] text-white/55" style={{ fontFamily: SCENE_FONT }}>
                DUE <span className="font-semibold tracking-[0.02em]">(optional)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {["today", "tomorrow", "week"].map((id) => (
                  <button key={id} onClick={() => setDue(due === id ? null : id)} className="h-10 px-3.5 rounded-full text-sm font-semibold" style={chip(due === id)}>
                    {dueLabel[id]}
                  </button>
                ))}
                <label className="h-10 px-3.5 rounded-full text-sm font-semibold flex items-center gap-1.5 cursor-pointer relative" style={chip(due === "date")}>
                  <span>{due === "date" && dueDate ? shortDate(dueDate) : "Pick date"}</span>
                  <input
                    type="date"
                    aria-label="Pick a due date"
                    value={dueDate}
                    min={localISO()}
                    onChange={(e) => { setDueDate(e.target.value); setDue(e.target.value ? "date" : null); }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-bold tracking-[0.08em] text-white/55" style={{ fontFamily: SCENE_FONT }}>FOR</div>
              <div className="flex flex-wrap gap-2">
                {[...SECTIONS].sort((a, b) => (b.id === homeSection) - (a.id === homeSection)).map((s) => {
                  const picked = section === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSection(s.id)}
                      className="flex items-center gap-1.5 h-10 px-3 rounded-full text-sm font-semibold"
                      style={{ background: picked ? s.color : "#1a1a1a", color: picked ? "#0d0d0d" : "#f2f2f2", border: `1.5px solid ${s.color}` }}
                    >
                      {!picked && <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />}
                      {s.id === homeSection ? "Me" : s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1" />
            {error && <p className="text-sm text-[#f87171] m-0">{error}</p>}
            <button
              onClick={add}
              disabled={!text.trim() || saving}
              className="h-[54px] shrink-0 rounded-[14px] text-[17px] font-bold transition-colors"
              style={text.trim() ? { background: accent, color: "#0d0d0d" } : { background: "#262626", color: "#8a8a8a" }}
            >
              {saving ? "Adding…" : text.trim() ? "Add task" : "Type a task to add it"}
            </button>
          </div>
        )}

        {step === "done" && ev && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3.5 text-center px-2.5">
            <div className="w-[84px] h-[84px] rounded-full flex items-center justify-center" style={{ border: `2px solid ${accent}`, color: accent, background: accent + "1f" }}>
              <Check className="w-10 h-10" strokeWidth={2.5} />
            </div>
            <h2 className="m-0 text-[30px] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>Task added</h2>
            <p className="m-0 text-base leading-[1.45] text-white">
              “{text.trim()}”<br />
              <span className="text-white/55">on {eventTitle(ev)}{ev.date ? ` · ${shortDate(ev.date)}` : ""}</span>
            </p>
            <p className="m-0 text-[13px] text-white/55 leading-[1.45]">
              {[dueISO && !added?.dueNote ? `Due ${shortDate(dueISO)}` : null, section === homeSection ? "For you" : `For ${sectionMeta(section).label}`].filter(Boolean).join(" · ")}.
              {" "}It's on the {words.event} board for everyone, desktop included.
            </p>
            {added?.dueNote && <p className="m-0 text-[13px] leading-[1.45]" style={{ color: "#FF6A00" }}>{added.dueNote}</p>}
            {error && <p className="text-sm text-[#f87171] m-0">{error}</p>}
            <div className="flex gap-2 w-full mt-3">
              <button onClick={undo} className="flex-1 h-[50px] rounded-xl bg-transparent border-[1.5px] border-[#3a3a3a] text-white text-[15px] font-semibold">Undo</button>
              <button onClick={again} className="flex-1 h-[50px] rounded-xl text-[15px] font-bold" style={{ background: accent, color: "#0d0d0d" }}>Add another</button>
            </div>
            <button onClick={close} className="h-11 px-3 text-sm font-semibold text-white/70 hover:text-white">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
