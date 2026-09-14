import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { supabase } from "@/api/supabaseClient";
import { ChevronLeft, ChevronRight, X, MapPin, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import { clearNewShowDraft } from "@/hooks/usePersistedState";

const GREEN = "#8CFF3D";
const PINK = "#F472B6";
const GOLD = "#FBBF24";

function getGigColor(g) {
  if (g.starred) return GOLD;
  return g.is_owned ? GREEN : PINK;
}

export default function BandCalendar() {
  const navigate = useNavigate();
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
    navigate(`/gig/shared?token=${g.share_token}`);
  };

  const newShowOnDate = (dateKey) => {
    clearNewShowDraft();
    navigate("/event/new", { state: { from: "calendar", prefillDate: dateKey } });
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <button onClick={() => setCurrentMonth((m) => m.clone().subtract(1, "month"))} className="text-white/50 hover:text-white h-8 w-8 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-white">{currentMonth.format("MMMM YYYY")}</h2>
          <button onClick={() => setCurrentMonth((m) => m.clone().add(1, "month"))} className="text-white/50 hover:text-white h-8 w-8 flex items-center justify-center">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-3 px-4 pb-2.5 max-w-lg mx-auto">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD }} />
            <span className="text-[11px] text-white/40">Starred</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PINK }} />
            <span className="text-[11px] text-white/40">Linked</span>
          </div>
        </div>
      </div>

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
                  className={`relative rounded-xl overflow-hidden transition-colors ${isCurrentMonth ? "bg-[#161616] cursor-pointer hover:bg-[#1c1c1c]" : "bg-transparent"} ${selectedDate === key ? "ring-2 ring-[#8CFF3D]" : ""}`}
                  style={{ minHeight: hasGigs ? "70px" : "52px" }}
                >
                  <div className="px-1.5 pt-1.5">
                    <span className={`text-sm font-medium ${isToday ? "text-[#8CFF3D] font-bold" : isCurrentMonth ? "text-white/60" : "text-white/15"}`}>
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
                    <div className="bg-[#111] rounded-xl border border-[#222] p-3 flex items-center gap-3 hover:bg-[#1a1a1a] transition-colors">
                      <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {!g.is_owned && <Link2 className="w-3 h-3 shrink-0" style={{ color }} />}
                          <p className="text-white font-medium text-sm truncate">{title}</p>
                        </div>
                        {location && (
                          <div className="flex items-center gap-1 text-white/40 text-xs truncate">
                            <MapPin className="w-3 h-3 shrink-0" /> {location}
                          </div>
                        )}
                      </div>
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
