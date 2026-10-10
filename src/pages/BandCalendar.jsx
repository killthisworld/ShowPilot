import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { supabase } from "@/api/supabaseClient";
import { ChevronLeft, ChevronRight, X, MapPin, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import { clearNewShowDraft } from "@/hooks/usePersistedState";
import CalendarHeader from "@/components/showpilot/CalendarHeader";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import StatusStrip from "@/components/showpilot/StatusStrip";
import useIsDesktop from "@/hooks/useIsDesktop";

const GREEN = "#8CFF3D";
const PINK = "#F472B6";
const GOLD = "#FBBF24";

function getGigColor(g) {
  const typeColor = eventTypeColor(g.event_type);
  if (typeColor) return typeColor; // event type first, same colors as the home bars
  if (g.starred) return GOLD;
  return g.is_owned ? GREEN : PINK;
}

export default function BandCalendar() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(moment());
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayModalKey, setDayModalKey] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: owned } = await supabase
        .from("shows")
        .select("*")
        .eq("owner_id", user.id);

      const { data: links } = await supabase
        .from("linked_gigs")
        .select("share_token, starred")
        .eq("user_id", user.id)
        .eq("archived", false);

      let linkedGigs = [];
      if (links) {
        const details = await Promise.all(
          links.map(async (link) => {
            const { data } = await supabase.rpc("get_shared_gig", { p_token: link.share_token });
            return data ? { ...data, share_token: link.share_token, is_owned: false, starred: link.starred } : null;
          })
        );
        linkedGigs = details.filter(Boolean);
      }

      const ownedGigs = (owned || []).map((s) => ({ ...s, is_owned: true }));
      setGigs([...ownedGigs, ...linkedGigs]);
      setLoading(false);
    };
    load();
  }, []);

  const gigsByDate = useMemo(() => {
    const map = {};
    gigs.forEach((g) => {
      if (!g.date) return;
      if (!map[g.date]) map[g.date] = [];
      map[g.date].push(g);
    });
    return map;
  }, [gigs]);

  const daysInGrid = useMemo(() => {
    const startOfMonth = currentMonth.clone().startOf("month");
    const startOfGrid = startOfMonth.clone().startOf("week");
    const days = [];
    for (let i = 0; i < 42; i++) {
      days.push(startOfGrid.clone().add(i, "days"));
    }
    return days;
  }, [currentMonth]);

  const openGig = (g) => {
    navigate(`/gig/web?token=${g.share_token}`);
  };

  const newShowOnDate = (dateKey) => {
    clearNewShowDraft();
    navigate("/event/new", { state: { from: "calendar", ...(dateKey ? { prefillDate: dateKey } : {}) } });
  };


  const monthItems = gigs.filter((x) => x.date && moment(x.date).isSame(currentMonth, "month"));
  const monthTypes = [...new Set(monthItems.map((x) => (x.event_type || "").trim()).filter(Boolean))];
  const todayStart = moment().startOf("day");
  const nextUp = gigs.filter((x) => x.date && !moment(x.date).isBefore(todayStart)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const headerCells = [
    { label: "EVENTS", value: String(monthItems.length), color: "#8CFF3D" },
    { label: "NEXT UP", value: nextUp ? moment(nextUp.date).format("MMM D").toUpperCase() : "—", color: "#60A5FA" },
    { label: "LINKED", value: String(monthItems.filter((x) => x.is_owned === false).length), color: "#F472B6" },
  ];

  if (isDesktop) {
    const todayKey = moment().format("YYYY-MM-DD");
    // The day card follows the selected day; if that day isn't in the month
    // on screen, fall back to today (when it's in this month) or nothing.
    const activeKey = selectedDate && moment(selectedDate).isSame(currentMonth, "month")
      ? selectedDate
      : moment().isSame(currentMonth, "month") ? todayKey : null;
    const activeGigs = activeKey ? (gigsByDate[activeKey] || []) : [];
    // Months that fit in five weeks get five taller rows instead of a blank sixth.
    const gridDays = daysInGrid[35].month() === currentMonth.month() ? daysInGrid : daysInGrid.slice(0, 35);
    const gridRows = gridDays.length / 7;
    const goToday = () => { setCurrentMonth(moment()); setSelectedDate(todayKey); };
    const arrow = "h-[38px] w-[38px] flex items-center justify-center rounded-[10px] bg-[#111] border border-[#222] text-white/70 hover:text-white";
    return (
      <div className="h-screen flex flex-col bg-[#0d0d0d] overflow-hidden" style={{ fontFamily: SCENE_FONT }}>
        <div className="flex items-center gap-3.5 px-6 py-3 border-b border-[#1a1a1a] shrink-0">
          <button type="button" onClick={() => setCurrentMonth((m) => m.clone().subtract(1, "month"))} className={arrow} aria-label="Previous month"><ChevronLeft className="w-[18px] h-[18px]" /></button>
          <h2 className="text-white text-[32px] font-bold tracking-[0.02em] min-w-[250px] text-center">{currentMonth.format("MMMM YYYY")}</h2>
          <button type="button" onClick={() => setCurrentMonth((m) => m.clone().add(1, "month"))} className={arrow} aria-label="Next month"><ChevronRight className="w-[18px] h-[18px]" /></button>
          <button type="button" onClick={goToday} className="h-[38px] px-4 rounded-[10px] bg-[#111] border border-[#222] text-white/70 hover:text-white text-base font-semibold">Today</button>
          <div className="flex-1 max-w-[440px] ml-auto"><StatusStrip cells={headerCells} /></div>
          <button type="button" onClick={() => newShowOnDate(activeKey)} className="flex items-center gap-2 h-11 px-[18px] rounded-[10px] bg-[#8CFF3D] hover:bg-[#7ae62e] text-[#0d0d0d] text-lg font-bold shrink-0 transition-colors">
            <Plus className="w-[18px] h-[18px]" strokeWidth={2.6} /> New event
          </button>
        </div>

        <div className="flex-1 min-h-0 mx-5 mt-3.5 mb-[18px] p-4 flex gap-5 rounded-2xl border border-[#1d1d1d] overflow-hidden" style={{ backgroundColor: "#0f0f0f", backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.3px)", backgroundSize: "22px 22px", boxShadow: "inset 0 0 60px rgba(0,0,0,0.6)" }}>
          {loading ? (
            <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>
          ) : (
            <>
              <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <div className="grid grid-cols-7 gap-1.5 pb-1.5 shrink-0">
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
                    <div key={d} className="text-center text-[11px] tracking-[0.12em] text-white/40" style={{ fontFamily: SCENE_MONO }}>{d}</div>
                  ))}
                </div>
                <div className="flex-1 min-h-0 grid grid-cols-7 gap-1.5" style={{ gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))` }}>
                  {gridDays.map((day) => {
                    const key = day.format("YYYY-MM-DD");
                    const inMonth = day.month() === currentMonth.month();
                    const dayGigs = inMonth ? (gigsByDate[key] || []) : [];
                    const isToday = key === todayKey;
                    const isSel = inMonth && activeKey === key;
                    return (
                      <div
                        key={key}
                        onClick={() => inMonth && setSelectedDate(key)}
                        className={`relative min-w-0 min-h-0 overflow-hidden rounded-[10px] px-[7px] py-1.5 flex flex-col gap-[3px] transition-all ${inMonth ? "cursor-pointer" : ""}`}
                        style={{
                          background: isSel ? "#1b2a0e" : inMonth ? "#111" : "transparent",
                          border: isSel ? "2px solid #D2FF85" : isToday && inMonth ? "1px solid rgba(140,255,61,0.7)" : inMonth ? "1px solid #1f1f1f" : "1px solid transparent",
                          boxShadow: isSel ? "0 0 22px 4px rgba(198,255,107,0.55)" : undefined,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold" style={{ fontFamily: SCENE_MONO, color: isSel ? "#D2FF85" : isToday && inMonth ? "#8CFF3D" : inMonth ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.15)" }}>{day.date()}</span>
                          {isToday && inMonth && <span className="text-[9px] tracking-[0.08em] text-[#8CFF3D]" style={{ fontFamily: SCENE_MONO }}>TODAY</span>}
                        </div>
                        {dayGigs.slice(0, 3).map((g) => {
                          const color = getGigColor(g);
                          return (
                            <button
                              key={g.is_owned ? g.id : g.share_token}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openGig(g); }}
                              className="text-left min-w-0 px-1.5 py-0.5 rounded"
                              style={{ background: color + "26", borderLeft: `3px solid ${color}` }}
                            >
                              <span className="block text-[13px] font-semibold leading-[1.15] text-white truncate">{g.event_name || g.band_name || "Untitled Gig"}</span>
                            </button>
                          );
                        })}
                        {dayGigs.length > 3 && <span className="text-[10px] text-white/45" style={{ fontFamily: SCENE_MONO }}>+{dayGigs.length - 3} more</span>}
                      </div>
                    );
                  })}
                </div>
                {monthTypes.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-2.5 flex-wrap shrink-0">
                    {monthTypes.map((t) => {
                      const c = eventTypeColor(t);
                      return c ? <span key={t} className="text-[10px] tracking-[0.08em] px-[7px] py-[2px] rounded-[3px]" style={{ fontFamily: SCENE_MONO, color: c, background: c + "1f" }}>{t.toUpperCase()}</span> : null;
                    })}
                  </div>
                )}
              </div>

              <div className="w-[340px] shrink-0 min-h-0 flex flex-col bg-[#151515] border border-[#262626] rounded-md" style={{ boxShadow: "0 16px 36px rgba(0,0,0,0.6)" }}>
                <div className="px-[18px] pt-4 pb-2.5 shrink-0">
                  <div className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>SELECTED DAY</div>
                  <div className="text-[28px] font-bold leading-[1.1] mt-0.5 text-white">{activeKey ? moment(activeKey).format("ddd, MMM D") : "Pick a day"}</div>
                  <div className="text-[11px] text-white/50 mt-[3px]" style={{ fontFamily: SCENE_MONO }}>
                    {activeKey ? (activeGigs.length ? `${activeGigs.length} ${activeGigs.length === 1 ? "EVENT" : "EVENTS"}` : "NO EVENTS") : "SELECT A DAY ON THE CALENDAR"}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto border-t border-dashed border-[#2a2a2a] p-3.5 flex flex-col gap-2.5">
                  {activeGigs.map((g) => {
                    const title = g.event_name || g.band_name || "Untitled Gig";
                    const location = [g.venue, [g.city, g.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
                    const color = getGigColor(g);
                    return (
                      <button key={g.is_owned ? g.id : g.share_token} type="button" onClick={() => openGig(g)} className="flex items-stretch gap-2.5 px-3 py-2.5 rounded-md bg-[#1a1a1a] hover:bg-[#202020] border border-[#262626] text-left transition-colors">
                        <span className="w-1 rounded-sm shrink-0" style={{ background: color }} />
                        <EventTypeIcon type={g.event_type} imageUrl={g.icon_url} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {!g.is_owned && <Link2 className="w-3 h-3 shrink-0" style={{ color }} />}
                            <p className="text-white text-[19px] font-semibold leading-[1.1] truncate">{title}</p>
                          </div>
                          {location && <p className="text-[10px] tracking-[0.04em] text-white/50 mt-[3px] truncate uppercase" style={{ fontFamily: SCENE_MONO }}>{location}</p>}
                          <p className="text-[10px] mt-1" style={{ fontFamily: SCENE_MONO, color }}>{g.is_owned ? "YOU" : (g.owner_display_name || "UNKNOWN").toUpperCase()}</p>
                        </div>
                      </button>
                    );
                  })}
                  {activeKey && activeGigs.length === 0 && <p className="text-base text-white/35 text-center py-5">Nothing on this day yet.</p>}
                </div>
                {activeKey && (
                  <div className="px-[18px] pt-3 pb-4 shrink-0 border-t border-dashed border-[#2a2a2a]">
                    <button type="button" onClick={() => newShowOnDate(activeKey)} className="w-full py-2.5 rounded-lg text-[17px] font-bold text-[#8CFF3D] hover:bg-[#8CFF3D]/15 transition-colors" style={{ border: "1px dashed rgba(140,255,61,0.55)", background: "rgba(140,255,61,0.08)" }}>
                      + Add event on this day
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <BandBottomTabs />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24" style={{ fontFamily: SCENE_FONT }}>
      <CalendarHeader
        monthLabel={currentMonth.format("MMMM YYYY")}
        onPrev={() => setCurrentMonth((m) => m.clone().subtract(1, "month"))}
        onNext={() => setCurrentMonth((m) => m.clone().add(1, "month"))}
        cells={headerCells}
        types={monthTypes}
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] text-white/30 font-medium">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {daysInGrid.map((day, i) => {
              const key = day.format("YYYY-MM-DD");
              const dayGigs = gigsByDate[key] || [];
              const isCurrentMonth = day.month() === currentMonth.month();
              const isToday = day.isSame(moment(), "day");
              const hasGigs = dayGigs.length > 0;
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (!isCurrentMonth) return;
                    if (selectedDate === key) {
                      if (hasGigs) setDayModalKey(key);
                      else newShowOnDate(key);
                    } else {
                      setSelectedDate(key);
                    }
                  }}
                  className={`relative rounded-xl overflow-hidden transition-all duration-150 ${isCurrentMonth ? "bg-[#111111] border border-[#1f1f1f] cursor-pointer hover:bg-[#161616]" : "bg-transparent"} ${isToday && isCurrentMonth ? "!border-[#8CFF3D]/70" : ""} ${selectedDate === key ? "!bg-[#1b2a0e] !border-[#D2FF85] ring-[3px] ring-[#D2FF85] shadow-[0_0_26px_6px_#C6FF6BAA] scale-[1.05] z-10" : ""}`}
                  style={{ minHeight: hasGigs ? "70px" : "52px" }}
                >
                  <div className="px-1.5 pt-1.5">
                    <span className={`text-[13px] font-medium ${selectedDate === key ? "text-[#D2FF85] font-bold" : isToday ? "text-[#8CFF3D] font-bold" : isCurrentMonth ? "text-white/60" : "text-white/15"}`} style={{ fontFamily: SCENE_MONO }}>
                      {day.date()}
                    </span>
                  </div>
                  {dayGigs.slice(0, 1).map((g) => {
                    const color = getGigColor(g);
                    return (
                      <div key={g.is_owned ? g.id : g.share_token} className="w-full mt-1 px-1.5 pb-1">
                        <div className="rounded-md px-1.5 py-1 text-left" style={{ backgroundColor: color + "22", borderLeft: `2px solid ${color}` }}>
                          <p className="text-[10px] font-medium leading-tight truncate" style={{ color }}>
                            {g.event_name || g.band_name || "Untitled Gig"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {dayGigs.length > 1 && (
                    <p className="text-[9px] text-white/30 px-1.5 pb-1">+{dayGigs.length - 1} more</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dayModalKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setDayModalKey(null)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-base">{moment(dayModalKey).format("MMMM D, YYYY")}</h3>
              <button onClick={() => setDayModalKey(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {(gigsByDate[dayModalKey] || []).map((g) => {
                const title = g.event_name || g.band_name || "Untitled Gig";
                const location = [g.venue, [g.city, g.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
                const color = getGigColor(g);
                return (
                  <button key={g.is_owned ? g.id : g.share_token} onClick={() => openGig(g)} className="w-full text-left">
                    <div className="rounded-xl border p-3 flex items-center gap-3 hover:brightness-110 transition-all" style={{ background: `linear-gradient(90deg, ${color}2e, ${color}10 55%, #111 100%)`, borderColor: color + "55" }}>
                      <EventTypeIcon type={g.event_type} imageUrl={g.icon_url} size={36} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {!g.is_owned && <Link2 className="w-3 h-3 shrink-0" style={{ color }} />}
                          <p className="text-white font-semibold text-base truncate flex-1 leading-tight">{title}</p>
                        </div>
                        {location && (
                          <div className="flex items-center gap-1 text-white/40 text-xs truncate">
                            <MapPin className="w-3 h-3 shrink-0" /> {location}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-medium px-1.5 py-1 rounded-md shrink-0" style={{ color, backgroundColor: color + "1a" }}>
                        {g.is_owned ? "You" : (g.owner_display_name || "Unknown")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button onClick={() => newShowOnDate(dayModalKey)} className="w-full bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold rounded-xl">
              + Add Event
            </Button>
          </div>
        </div>
      )}

      <BandBottomTabs />
    </div>
  );
}
