import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/api/supabaseClient";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, MapPin, Star, ClipboardList, Copy, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomTabs from "@/components/showpilot/BottomTabs";
import StatusBadge from "@/components/showpilot/StatusBadge";
import moment from "moment";

function getShowAccentColor(show) {
  if (show.starred) return "#FBBF24";
  if (show.status === "complete") return "#8CFF3D";
  if (show.status === "in_progress") return "#60A5FA";
  return "#555";
}

export default function CalendarPage() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(moment());
  const [view, setView] = useState("month");
  const [tmCopied, setTmCopied] = useState(false);
  const [tmLink, setTmLink] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [dayModalKey, setDayModalKey] = useState(null);
  const navigate = useNavigate();

  const handleTourManagerLink = async () => {
    setGeneratingLink(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const engineerName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || "";

      const { data: request, error } = await supabase
        .from("tour_manager_requests")
        .insert({
          engineer_user_id: user.id,
          engineer_name: engineerName,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      const name = encodeURIComponent(engineerName || "your engineer");
      const url = `${window.location.origin}/tm-intake?token=${request.invite_token}&engineer=${user.id}&name=${name}&email=${encodeURIComponent(user.email || "")}`;
      setTmLink(url);
    } catch (e) {
      console.error(e);
    }
    setGeneratingLink(false);
  };

  const handleCopyLink = () => {
    if (tmLink) {
      navigator.clipboard.writeText(tmLink).catch(() => {});
      setTmCopied(true);
      setTimeout(() => setTmCopied(false), 1500);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadShows() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("owner_id", user.id)
        .order("date", { ascending: false });

      if (error) {
        console.error("Error loading shows:", error);
      } else if (isMounted) {
        setShows(data || []);
      }
      if (isMounted) setLoading(false);
    }

    loadShows();
    return () => { isMounted = false; };
  }, []);

  const showsByDate = useMemo(() => {
    const map = {};
    shows.forEach((s) => {
      if (s.date) {
        if (!map[s.date]) map[s.date] = [];
        map[s.date].push(s);
      }
    });
    return map;
  }, [shows]);

  const daysInMonth = useMemo(() => {
    const start = currentMonth.clone().startOf("month").startOf("week");
    const end = currentMonth.clone().endOf("month").endOf("week");
    const days = [];
    const d = start.clone();
    while (d.isSameOrBefore(end)) {
      days.push(d.clone());
      d.add(1, "day");
    }
    return days;
  }, [currentMonth]);

  const monthShows = useMemo(() => {
    return shows.filter((s) => s.date && moment(s.date).isSame(currentMonth, "month")).sort((a, b) => a.date.localeCompare(b.date));
  }, [shows, currentMonth]);

  const openShow = (showId) => {
    navigate(`/show/${showId}`, { state: { from: "calendar" } });
  };

  const newShowOnDate = (dateKey) => {
    navigate("/show/new", { state: { from: "calendar", prefillDate: dateKey } });
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      {tmLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-base">Tour Manager Import Link</h3>
              <button onClick={() => setTmLink(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-white/40 text-xs mb-3">Share this link with a tour manager / band member. They'll fill out the gig info and it'll appear on your profile.</p>
            <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl p-3 mb-3 break-all text-xs text-purple-300 select-all">
              {tmLink}
            </div>
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-colors"
              style={{ backgroundColor: tmCopied ? "#22c55e" : "#a855f7" }}
            >
              {tmCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {tmCopied ? "Copied!" : "Copy Link"}
            </button>
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
            <div className="space-y-2 mb-3">
              {(showsByDate[dayModalKey] || []).map((s) => {
                const color = getShowAccentColor(s);
                return (
                  <button key={s.id} onClick={() => openShow(s.id)} className="w-full text-left">
                    <div className="bg-[#111] rounded-xl border border-[#222] p-3 flex items-center gap-3 hover:bg-[#1a1a1a] transition-colors">
                      <div className="w-1 h-8 rounded-full" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium text-sm truncate">{s.band_name}</p>
                          {s.starred && <Star className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" />}
                        </div>
                        {s.venue && <p className="text-white/40 text-xs truncate">{s.venue}</p>}
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  </button>
                );
              })}
            </div>
            <Button onClick={() => newShowOnDate(dayModalKey)} className="w-full bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold rounded-xl">
              + Add another show
            </Button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth((m) => m.clone().subtract(1, "month"))} className="text-white/50 hover:text-white h-8 w-8 p-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-bold text-white">{currentMonth.format("MMMM YYYY")}</h2>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth((m) => m.clone().add(1, "month"))} className="text-white/50 hover:text-white h-8 w-8 p-0">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex items-center gap-3 px-4 pb-2 max-w-lg mx-auto text-[10px] text-white/40 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8CFF3D]" />Worked</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Starred</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />Frequent</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#555]" />Never Worked</span>
        </div>

        <div className="flex gap-1 px-4 pb-3 max-w-lg mx-auto">
          <Button variant={view === "month" ? "default" : "ghost"} size="sm" onClick={() => setView("month")} className={view === "month" ? "bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-7" : "text-white/40 h-7"}>
            Month
          </Button>
          <Button variant={view === "agenda" ? "default" : "ghost"} size="sm" onClick={() => setView("agenda")} className={view === "agenda" ? "bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-7" : "text-white/40 h-7"}>
            Agenda
          </Button>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : view === "month" ? (
          <div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} className="text-center text-xs text-white/30 font-medium py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {daysInMonth.map((day) => {
                const key = day.format("YYYY-MM-DD");
                const dayShows = showsByDate[key] || [];
                const isCurrentMonth = day.isSame(currentMonth, "month");
                const isToday = day.isSame(moment(), "day");
                const hasShows = dayShows.length > 0;

                return (
                  <div
                    key={key}
                    className={`relative rounded-xl overflow-hidden transition-colors ${isCurrentMonth ? "bg-[#161616]" : "bg-transparent"} ${isToday ? "ring-1 ring-[#8CFF3D]/50" : ""}`}
                    style={{ minHeight: hasShows ? "72px" : "48px" }}
                  >
                    <div className="px-1 pt-1 flex items-center justify-between">
                      <span className={`text-xs font-medium ${isCurrentMonth ? "text-white/60" : "text-white/15"} ${isToday ? "text-[#8CFF3D] font-bold" : ""}`}>
                        {day.date()}
                      </span>
                      {isCurrentMonth && (
                        <button
                          onClick={() => newShowOnDate(key)}
                          className="w-4 h-4 rounded-full bg-[#8CFF3D]/15 text-[#8CFF3D] flex items-center justify-center text-[10px] font-bold leading-none hover:bg-[#8CFF3D]/30 shrink-0"
                          title="Add a show on this day"
                        >
                          +
                        </button>
                      )}
                    </div>
                    {dayShows.slice(0, 2).map((s) => {
                      const color = getShowAccentColor(s);
                      return (
                        <button key={s.id} onClick={() => openShow(s.id)} className="w-full mt-0.5 px-1 pb-0.5">
                          <div className="rounded-md px-1 py-0.5 text-left" style={{ backgroundColor: color + "22", borderLeft: `2px solid ${color}` }}>
                            <p className="text-[9px] font-medium leading-tight truncate" style={{ color }}>
                              {s.band_name}
                            </p>
                            {s.venue && <p className="text-[8px] text-white/30 truncate leading-tight">{s.venue}</p>}
                          </div>
                        </button>
                      );
                    })}
                    {dayShows.length > 2 && (
                      <button onClick={() => setDayModalKey(key)} className="block w-full px-1 pb-1 text-[8px] text-white/30 text-center hover:text-white/60">
                        +{dayShows.length - 2} more
                      </button>
                    )}
                    {dayShows.length > 0 && (
                      <button onClick={() => setDayModalKey(key)} className="block w-full text-[7px] text-white/20 hover:text-white/50 text-center pb-0.5">
                        view all
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {monthShows.length === 0 ? (
              <p className="text-center text-white/30 py-10 text-sm">No shows this month</p>
            ) : (
              monthShows.map((s) => {
                const accentColor = getShowAccentColor(s);
                return (
                  <button key={s.id} onClick={() => openShow(s.id)} className="w-full text-left">
                    <div className="bg-[#161616] rounded-xl border border-[#222] p-3 flex items-center gap-3 hover:bg-[#1a1a1a] transition-colors">
                      <div className="w-1 h-10 rounded-full" style={{ backgroundColor: accentColor }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium text-sm truncate">{s.band_name}</p>
                          {s.starred && <Star className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" />}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <span>{moment(s.date).format("MMM D")}</span>
                          {s.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.venue}</span>}
                        </div>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 pb-2 max-w-lg mx-auto">
        <Button onClick={handleTourManagerLink} disabled={generatingLink} className="w-full font-semibold rounded-xl" style={{ backgroundColor: "#a855f7", color: "#fff" }}>
          <ClipboardList className="w-4 h-4 mr-2" />
          {generatingLink ? "Generating..." : "Create import link"}
        </Button>
      </div>

      <BottomTabs />
    </div>
  );
}
