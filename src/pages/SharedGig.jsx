import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Calendar, Music, LogIn, UserPlus, Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import BottomTabs from "@/components/showpilot/BottomTabs";

const ROLE_COLORS = {
  Headliner: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-400/40" },
  Opener: { text: "text-[#8CFF3D]", bg: "bg-[#8CFF3D]/10", border: "border-[#8CFF3D]/40" },
  "Performer/Group": { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-400/40" },
  "N/A": { text: "text-white/50", bg: "bg-white/10", border: "border-white/20" },
};
const ROLE_OPTIONS = ["Opener", "Headliner", "Performer/Group", "N/A"];
const EVENT_TYPES = ["Concert", "Comedy Show", "Theatre Play", "Corporate Event", "Private Party", "Festival", "Open Mic", "Other"];

export default function SharedGig() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const currentPath = `/gig/shared?token=${token}`;

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gig, setGig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setCheckingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc("get_shared_gig", { p_token: token });
        if (error) throw error;
        if (!data) setNotFound(true);
        else setGig({ ...data, bands: (data.bands || []).map((b, i) => ({ ...b, sort_order: i })) });
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const update = (field, val) => setGig((g) => ({ ...g, [field]: val }));
  const updateBand = (i, field, val) => {
    const bands = [...gig.bands];
    bands[i] = { ...bands[i], [field]: val };
    update("bands", bands);
  };
  const addBand = () => update("bands", [...(gig.bands || []), { role: "N/A", band_name: "", genre_tags: [], set_length_minutes: "", sort_order: gig.bands.length }]);
  const removeBand = (i) => update("bands", gig.bands.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_shared_gig", { p_token: token, p_updates: gig });
      if (error) throw error;

      if (user && gig.id) {
        await supabase
          .from("linked_gigs")
          .upsert({ user_id: user.id, show_id: gig.id, share_token: token }, { onConflict: "user_id,show_id" });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
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

  const canEdit = !!user;
  const title = gig.event_name || gig.band_name || "Untitled Gig";
  const location = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(-1)} className="p-1 text-white/60 hover:text-white shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-white font-bold text-lg leading-tight truncate">{title}</h1>
              <p className="text-white/40 text-xs mt-0.5">{canEdit ? "Editing shared gig" : "Viewing shared gig"}</p>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 flex items-center gap-1.5 bg-[#8CFF3D] text-black font-semibold text-sm px-3 py-2 rounded-xl hover:bg-[#7ae62e] transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : saved ? "Saved ✓" : "Save to Linked"}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        {!canEdit && (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-white/50 text-xs">Sign in to edit this gig</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
                  window.location.href = "/login?redirect=" + encodeURIComponent(currentPath);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:bg-[#222]"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
              <button
                onClick={() => {
                  try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
                  window.location.href = "/register?redirect=" + encodeURIComponent(currentPath);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-black bg-[#8CFF3D] px-3 py-1.5 rounded-lg hover:bg-[#7ae62e]"
              >
                <UserPlus className="w-3.5 h-3.5" /> Create Account
              </button>
            </div>
          </div>
        )}

        <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
          {canEdit ? (
            <>
              <div>
                <Label className="text-white/50 text-xs">Event Name</Label>
                <Input value={gig.event_name || ""} onChange={(e) => update("event_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="e.g. Friday Night Showcase" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">Event Type</Label>
                <Select value={gig.event_type || ""} onValueChange={(v) => update("event_type", v)}>
                  <SelectTrigger className="mt-1 h-10 bg-[#111] border-[#222] text-white w-48">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/50 text-xs">Date *</Label>
                <Input type="date" value={gig.date || ""} onChange={(e) => update("date", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white [color-scheme:dark] w-44" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">Venue</Label>
                <Input value={gig.venue || ""} onChange={(e) => update("venue", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Venue name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/50 text-xs">City</Label>
                  <Input value={gig.city || ""} onChange={(e) => update("city", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="City" />
                </div>
                <div>
                  <Label className="text-white/50 text-xs">State</Label>
                  <Input value={gig.state || ""} onChange={(e) => update("state", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="State" />
                </div>
              </div>
            </>
          ) : (
            <>
              {location && (
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <MapPin className="w-4 h-4 text-white/30 shrink-0" />
                  <span>{location}</span>
                </div>
              )}
              {gig.date && (
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Calendar className="w-4 h-4 text-white/30 shrink-0" />
                  <span>{new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              )}
              {gig.event_type && <p className="text-white/40 text-xs">{gig.event_type}</p>}
            </>
          )}
        </div>

        <div className="bg-[#111] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-[#8CFF3D]" />
              <p className="text-white font-semibold text-sm">Lineup</p>
            </div>
            {canEdit && (
              <button onClick={addBand} className="flex items-center gap-1 text-[#8CFF3D] text-xs font-semibold hover:bg-[#8CFF3D]/10 px-2 py-1 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Add Act
              </button>
            )}
          </div>

          {(!gig.bands || gig.bands.length === 0) && !canEdit && (
            <p className="text-white/30 text-sm">No lineup info yet.</p>
          )}

          <div className="space-y-2">
            {(gig.bands || []).map((b, i) => {
              const colors = ROLE_COLORS[b.role] || ROLE_COLORS["N/A"];
              if (!canEdit) {
                if (!b.band_name) return null;
                return (
                  <div key={i} className="flex items-center justify-between bg-[#1a1a1a] rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{b.band_name}</p>
                      {b.genre_tags && b.genre_tags.length > 0 && (
                        <p className="text-white/30 text-xs truncate">{b.genre_tags.join(", ")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {b.set_length_minutes && <span className="text-white/40 text-xs">{b.set_length_minutes} min</span>}
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${colors.text} ${colors.bg}`}>
                        {b.role}
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="bg-[#1a1a1a] rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={b.band_name || ""} onChange={(e) => updateBand(i, "band_name", e.target.value)} placeholder="Artist / Group Name" className="flex-1 h-8 bg-[#111] border-[#222] text-white text-sm" />
                    <button onClick={() => removeBand(i)} className="p-1.5 text-white/30 hover:text-red-400 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1 flex-wrap">
                      {ROLE_OPTIONS.map((r) => {
                        const c = ROLE_COLORS[r];
                        const active = (b.role || "N/A") === r;
                        return (
                          <button
                            key={r}
                            onClick={() => updateBand(i, "role", r)}
                            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border transition-all ${active ? `${c.text} ${c.bg} ${c.border}` : "text-white/30 border-transparent hover:text-white/50"}`}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      type="number"
                      value={b.set_length_minutes || ""}
                      onChange={(e) => updateBand(i, "set_length_minutes", e.target.value)}
                      placeholder="Set (min)"
                      className="h-7 w-24 bg-[#111] border-[#222] text-white text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-white/20 text-xs text-center pt-2">Powered by Klean Studios</p>
      </div>

      {canEdit && <BottomTabs />}
    </div>
  );
}
