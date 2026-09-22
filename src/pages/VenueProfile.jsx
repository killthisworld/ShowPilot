import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, X, ChevronDown, Check, Plus, Trash2, LogIn, UserPlus, Pencil } from "lucide-react";
import { STAMP_COLORS, getConstellationLayout, ShowStamp } from "@/lib/constellation";

const DEFAULT_CATEGORIES = [
  { key: "new", label: "New", color: "#EF4444" },
  { key: "in_progress", label: "In Progress", color: "#FACC15" },
  { key: "ready", label: "Ready to Go", color: "#8CFF3D" },
];

export default function VenueProfile() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const currentPath = window.location.pathname + window.location.search;

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gig, setGig] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [events, setEvents] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sheetMode, setSheetMode] = useState(null); // 'month' | 'category' | null
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#8CFF3D");

  const [selectedEventId, setSelectedEventId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setCheckingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      const gigRes = await supabase.rpc("get_shared_gig", { p_token: token });
      if (gigRes.error || !gigRes.data) { setNotFound(true); setLoading(false); return; }
      setGig(gigRes.data);
      setLoading(false);
    };
    load();
  }, [token]);

  useEffect(() => {
    if (checkingAuth || !user || !gig?.id) return;
    const loadVenueData = async () => {
      const { data: cats } = await supabase
        .from("venue_event_categories")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      let finalCats = cats || [];
      if (finalCats.length === 0) {
        const { data: inserted } = await supabase
          .from("venue_event_categories")
          .insert(DEFAULT_CATEGORIES.map((c, i) => ({ user_id: user.id, key: c.key, label: c.label, color: c.color, sort_order: i })))
          .select();
        finalCats = inserted || [];
      }
      setCategories(finalCats);

      const evRes = await supabase.rpc("get_my_venue_events", { p_exclude_show_id: gig.id });
      if (!evRes.error) setEvents(evRes.data || []);
    };
    loadVenueData();
  }, [checkingAuth, user, gig?.id]);

  const catById = (id) => categories.find((c) => c.id === id);

  const monthOptions = useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      if (!e.date) return;
      const key = e.date.slice(0, 7);
      if (!map.has(key)) map.set(key, new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }));
    });
    const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    return [{ value: "all", label: "All Months" }, ...sorted.map(([value, label]) => ({ value, label }))];
  }, [events]);

  const filteredEvents = useMemo(() => events.filter((e) => {
    const monthOk = selectedMonth === "all" || (e.date && e.date.slice(0, 7) === selectedMonth);
    const catOk = selectedCategory === "all" || e.category_id === selectedCategory;
    return monthOk && catOk;
  }), [events, selectedMonth, selectedCategory]);

  const { positions, rows } = useMemo(
    () => getConstellationLayout(filteredEvents, { getSeedKey: (e) => e.show_id }),
    [filteredEvents]
  );

  const recolorCategory = async (catId, color) => {
    setCategories((cs) => cs.map((c) => (c.id === catId ? { ...c, color } : c)));
    await supabase.from("venue_event_categories").update({ color }).eq("id", catId);
  };

  const removeCategory = async (catId) => {
    setCategories((cs) => cs.filter((c) => c.id !== catId));
    setEvents((es) => es.map((e) => (e.category_id === catId ? { ...e, category_id: null } : e)));
    if (selectedCategory === catId) setSelectedCategory("all");
    if (editingCategoryId === catId) setEditingCategoryId(null);
    await supabase.from("venue_event_categories").delete().eq("id", catId);
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !user) return;
    const { data, error } = await supabase
      .from("venue_event_categories")
      .insert({ user_id: user.id, key: `cat_${Date.now()}`, label: name, color: newCategoryColor, sort_order: categories.length })
      .select()
      .single();
    if (!error && data) setCategories((cs) => [...cs, data]);
    setNewCategoryName("");
    setNewCategoryColor("#8CFF3D");
  };

  const assignEventCategory = async (event, catId) => {
    setEvents((es) => es.map((e) => (e.show_id === event.show_id ? { ...e, category_id: catId } : e)));
    await supabase.rpc("set_gig_invite_category", { p_invite_id: event.invite_id, p_category_id: catId });
  };

  const goSignIn = (toRegister) => {
    try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
    window.location.href = `${toRegister ? "/register" : "/login"}?redirect=${encodeURIComponent(currentPath)}`;
  };

  if (loading || checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !gig) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Gig not found</p>
          <p className="text-white/30 text-sm">This share link may be invalid.</p>
        </div>
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.show_id === selectedEventId) || null;
  const containerHeight = filteredEvents.length === 0 ? 220 : Math.max(320, rows * 110);
  const monthActive = selectedMonth !== "all";
  const categoryActive = selectedCategory !== "all";
  const monthLabel = (monthOptions.find((m) => m.value === selectedMonth) || monthOptions[0]).label;
  const categoryLabel = selectedCategory === "all" ? "All Types" : (catById(selectedCategory)?.label || "All Types");

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate(`/gig/web?token=${token}`)} className="p-1 text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-lg leading-tight truncate">Venue Profile</h1>
            <p className="text-white/40 text-xs mt-0.5 truncate">Other events at this venue</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">
        {!user ? (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-white/50 text-xs">Sign in to see this venue's other events</p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => goSignIn(false)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:bg-[#222]">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
              <button onClick={() => goSignIn(true)} className="flex items-center gap-1.5 text-xs font-semibold text-black bg-[#8CFF3D] px-3 py-1.5 rounded-lg hover:bg-[#7ae62e]">
                <UserPlus className="w-3.5 h-3.5" /> Create Account
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSheetMode("month")}
                className="flex-1 flex items-center justify-between gap-1.5 bg-white/[0.03] border-2 rounded-xl px-3 py-2.5 text-sm font-bold"
                style={{ borderColor: monthActive ? "#8CFF3D" : "rgba(255,255,255,0.12)", color: monthActive ? "#8CFF3D" : "#ffffff" }}
              >
                <span className="truncate">{monthLabel}</span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setSheetMode("category")}
                className="flex-1 flex items-center justify-between gap-1.5 bg-white/[0.03] border-2 rounded-xl px-3 py-2.5 text-sm font-bold"
                style={{ borderColor: categoryActive ? "#8CFF3D" : "rgba(255,255,255,0.12)", color: categoryActive ? "#8CFF3D" : "#ffffff" }}
              >
                <span className="truncate">{categoryLabel}</span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>
            </div>

            {categories.length > 0 && (
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    <div className="w-[7px] h-[7px] rounded-full" style={{ background: c.color, boxShadow: `0 0 6px 1px ${c.color}aa` }} />
                    <span className="text-[10.5px] text-white/40 font-semibold">{c.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="relative mx-auto" style={{ width: "100%", maxWidth: 350, height: containerHeight }}>
              {filteredEvents.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-center px-10">
                  <span className="text-white/30 text-sm">
                    {events.length === 0 ? "No other events found for this venue yet." : "No shows match these filters."}
                  </span>
                </div>
              ) : (
                positions.map((pos, i) => {
                  const cat = catById(pos.show.category_id);
                  const color = cat?.color || "#5a5a5a";
                  return (
                    <div key={pos.show.show_id} className="absolute z-10" style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, transform: "translate(-50%, -50%)" }}>
                      <ShowStamp
                        color={color}
                        onClick={() => setSelectedEventId(pos.show.show_id)}
                        isNewest={i === positions.length - 1}
                        ariaLabel={pos.show.event_name || pos.show.venue}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Centered event modal - date/title reveal on tap, plus a quick
          category picker and a link into that other event's own hub. */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={() => setSelectedEventId(null)}>
          <div className="relative bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-sm flex flex-col items-center text-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedEventId(null)} aria-label="Close" className="absolute top-3 right-3 text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <div className="w-3 h-3 rounded-full" style={{ background: catById(selectedEvent.category_id)?.color || "#5a5a5a" }} />
            <div className="text-white font-bold text-lg leading-tight">{selectedEvent.event_name || "Untitled"}</div>
            <div className="text-white/50 text-sm">
              {selectedEvent.date ? new Date(selectedEvent.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}
              {selectedEvent.venue ? ` · ${selectedEvent.venue}` : ""}
            </div>

            {categories.length > 0 && (
              <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => assignEventCategory(selectedEvent, selectedEvent.category_id === c.id ? null : c.id)}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border"
                    style={{
                      color: selectedEvent.category_id === c.id ? "#0d0d0d" : c.color,
                      background: selectedEvent.category_id === c.id ? c.color : c.color + "1a",
                      borderColor: c.color + "60",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <a
              href={`/gig/web?token=${selectedEvent.share_token}`}
              className="w-full mt-1 flex items-center justify-center gap-1.5 font-bold text-sm rounded-2xl px-4 py-3.5"
              style={{ background: catById(selectedEvent.category_id)?.color || "#8CFF3D", color: "#0d0d0d" }}
            >
              Open Web →
            </a>
          </div>
        </div>
      )}

      {/* Month / category bottom sheet */}
      {sheetMode && (
        <>
          <div onClick={() => { setSheetMode(null); setEditingCategoryId(null); }} className="fixed inset-0 z-50 bg-black/60" />
          <div className="fixed left-0 right-0 bottom-0 z-50 bg-[#111111] border-t border-[#2a2a2a] rounded-t-[24px] px-5 pt-5 pb-7 flex flex-col gap-3.5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-white font-semibold text-base">{sheetMode === "month" ? "Filter by Month" : "Filter by Type"}</div>
              <button onClick={() => { setSheetMode(null); setEditingCategoryId(null); }} aria-label="Close" className="w-8 h-8 rounded-[10px] bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white/60" />
              </button>
            </div>

            {sheetMode === "month" && (
              <div className="flex flex-col gap-0.5">
                {monthOptions.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => { setSelectedMonth(m.value); setSheetMode(null); }}
                    className="flex items-center justify-between rounded-[10px] px-3.5 py-3 text-left text-sm"
                    style={{
                      background: selectedMonth === m.value ? "rgba(140,255,61,0.08)" : "transparent",
                      color: selectedMonth === m.value ? "#ffffff" : "rgba(255,255,255,0.6)",
                      fontWeight: selectedMonth === m.value ? 700 : 500,
                    }}
                  >
                    <span>{m.label}</span>
                    {selectedMonth === m.value && <Check className="w-4 h-4 text-[#8CFF3D]" />}
                  </button>
                ))}
              </div>
            )}

            {sheetMode === "category" && (
              <>
                <p className="text-[11.5px] text-white/35 -mt-1.5">Tap a category to filter. Tap the pencil to recolor or remove it.</p>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => { setSelectedCategory("all"); setSheetMode(null); }}
                    className="flex items-center justify-between rounded-[10px] px-3.5 py-3 text-left text-sm"
                    style={{
                      background: selectedCategory === "all" ? "rgba(140,255,61,0.08)" : "transparent",
                      color: selectedCategory === "all" ? "#ffffff" : "rgba(255,255,255,0.6)",
                      fontWeight: selectedCategory === "all" ? 700 : 500,
                    }}
                  >
                    <span>All Types</span>
                    {selectedCategory === "all" && <Check className="w-4 h-4 text-[#8CFF3D]" />}
                  </button>

                  {categories.map((c) => (
                    <div key={c.id} className="flex flex-col">
                      <div className="flex items-center gap-1 rounded-[10px]" style={{ background: selectedCategory === c.id ? "rgba(140,255,61,0.08)" : "transparent" }}>
                        <button
                          type="button"
                          onClick={() => { setSelectedCategory(c.id); setSheetMode(null); }}
                          className="flex-1 flex items-center gap-2.5 px-3.5 py-3 text-left text-sm"
                          style={{ color: selectedCategory === c.id ? "#ffffff" : "rgba(255,255,255,0.6)", fontWeight: selectedCategory === c.id ? 700 : 500 }}
                        >
                          <div className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: c.color }} />
                          <span className="flex-1">{c.label}</span>
                          {selectedCategory === c.id && <Check className="w-4 h-4 text-[#8CFF3D]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(editingCategoryId === c.id ? null : c.id)}
                          aria-label={`Edit ${c.label}`}
                          className="w-8 h-8 mr-1 rounded-lg flex items-center justify-center text-white/35 shrink-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {editingCategoryId === c.id && (
                        <div className="flex items-center gap-2 flex-wrap px-3.5 pb-3.5 pt-1">
                          {STAMP_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => recolorCategory(c.id, color)}
                              aria-label={color}
                              className="w-6 h-6 rounded-full box-border"
                              style={{ background: color, border: color === c.color ? "2px solid #ffffff" : "2px solid transparent" }}
                            />
                          ))}
                          <input
                            type="color"
                            aria-label={`Custom color for ${c.label}`}
                            value={c.color}
                            onChange={(e) => recolorCategory(c.id, e.target.value)}
                            className="w-6 h-6 rounded-full box-border border-2"
                            style={{ borderColor: STAMP_COLORS.includes(c.color) ? "transparent" : "#ffffff" }}
                          />
                          <button
                            type="button"
                            onClick={() => removeCategory(c.id)}
                            aria-label={`Remove ${c.label}`}
                            className="w-6 h-6 rounded-md border border-[#2a2a2a] flex items-center justify-center text-white/40 ml-auto shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2.5 pt-3.5 border-t border-[#1f1f1f]">
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Add a category</div>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
                    placeholder="e.g. Rescheduled"
                    className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-[10px] px-3 py-2.5 text-sm text-white w-full"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {STAMP_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCategoryColor(color)}
                        aria-label={color}
                        className="w-6 h-6 rounded-full box-border"
                        style={{ background: color, border: color === newCategoryColor ? "2px solid #ffffff" : "2px solid transparent" }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Custom color for new category"
                      value={newCategoryColor}
                      onChange={(e) => setNewCategoryColor(e.target.value)}
                      className="w-6 h-6 rounded-full box-border border-2"
                      style={{ borderColor: STAMP_COLORS.includes(newCategoryColor) ? "transparent" : "#ffffff" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addCategory}
                    disabled={!newCategoryName.trim()}
                    className="flex items-center justify-center gap-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-[10px] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Category
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
