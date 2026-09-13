import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Calendar, Music, LogIn, UserPlus, Plus, Trash2, Save, ArrowLeft, Wifi, Speaker, Zap, Lock, User, Ticket, FileSignature, ChevronDown, Users, Image as ImageIcon } from "lucide-react";
import BottomTabs from "@/components/showpilot/BottomTabs";

const ROLE_COLORS = {
  Headliner: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-400/40" },
  Opener: { text: "text-[#8CFF3D]", bg: "bg-[#8CFF3D]/10", border: "border-[#8CFF3D]/40" },
  "Performer/Group": { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-400/40" },
  "N/A": { text: "text-white/50", bg: "bg-white/10", border: "border-white/20" },
};
const ROLE_OPTIONS = ["Opener", "Headliner", "Performer/Group", "N/A"];
const EVENT_TYPES = ["Concert", "Comedy Show", "Theatre Play", "Corporate Event", "Private Party", "Festival", "Open Mic", "Other"];

// A card wrapper for each role-owned section. Shows a lock indicator when
// the section is claimed by a role the current viewer doesn't hold.
function SectionCard({ title, icon: Icon, locked, children }) {
  return (
    <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#8CFF3D]" />
          <p className="text-white font-semibold text-sm">{title}</p>
        </div>
        {locked && (
          <span className="flex items-center gap-1 text-[10px] text-white/30">
            <Lock className="w-3 h-3" /> Locked to another profile
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, editable, placeholder, type = "text" }) {
  return (
    <div>
      <Label className="text-white/50 text-xs">{label}</Label>
      {editable ? (
        <Input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 bg-[#111] border-[#222] text-white"
        />
      ) : (
        <p className="mt-1 text-white/70 text-sm min-h-[20px]">{value || <span className="text-white/25">Not filled in yet</span>}</p>
      )}
    </div>
  );
}

// Technical details for one act - band members with per-instrument mic/DI
// and phantom power needs, stage plot files, and per-member FX notes plus
// general notes. Read-only for anyone without access; fully editable for
// anyone who does, matching what the event owner can already do on their
// own version of this show.
function getMemberNote(fxNotes, name) {
  return (fxNotes || []).find((n) => n.artist_name === name)?.notes || "";
}

function BandDetails({ band, editable, onUpdate }) {
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const toggleNote = (key) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const members = band.band_members || [];
  const fxNotes = band.artist_fx_notes || [];
  const stagePlotFiles = band.stage_plot_files || [];

  const updateMembers = (next) => onUpdate("band_members", next);
  const updateMemberBusType = (i, busType) => {
    const next = [...members];
    next[i] = { ...next[i], bus_type: busType };
    updateMembers(next);
  };

  const addMember = () => updateMembers([...members, { name: "", instruments: [] }]);
  const updateMemberName = (i, name) => {
    const next = [...members];
    next[i] = { ...next[i], name };
    updateMembers(next);
  };
  const removeMember = (i) => updateMembers(members.filter((_, idx) => idx !== i));

  const addInstrument = (i) => {
    const next = [...members];
    next[i] = { ...next[i], instruments: [...(next[i].instruments || []), { name: "", mic_di: "Mic", phantom_power: false }] };
    updateMembers(next);
  };
  const updateInstrument = (i, ii, field, val) => {
    const next = [...members];
    const instruments = [...(next[i].instruments || [])];
    instruments[ii] = { ...instruments[ii], [field]: val };
    next[i] = { ...next[i], instruments };
    updateMembers(next);
  };
  const removeInstrument = (i, ii) => {
    const next = [...members];
    next[i] = { ...next[i], instruments: (next[i].instruments || []).filter((_, idx) => idx !== ii) };
    updateMembers(next);
  };

  const updateMemberNote = (name, notes) => {
    const existing = [...fxNotes];
    const idx = existing.findIndex((n) => n.artist_name === name);
    if (idx >= 0) existing[idx] = { ...existing[idx], notes };
    else existing.push({ artist_name: name, notes });
    onUpdate("artist_fx_notes", existing);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("stage-plots").upload(filePath, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("stage-plots").getPublicUrl(filePath);
        const isImage = file.type.startsWith("image/");
        onUpdate("stage_plot_files", [...(band.stage_plot_files || []), { url: urlData.publicUrl, name: file.name, type: file.type }]);
        if (isImage && !band.stage_plot_url) onUpdate("stage_plot_url", urlData.publicUrl);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };

  const removeFile = (i) => onUpdate("stage_plot_files", stagePlotFiles.filter((_, idx) => idx !== i));

  const stagePlotImages = [...(band.stage_plot_url ? [{ url: band.stage_plot_url, type: "image/" }] : []), ...stagePlotFiles];

  if (!editable) {
    return (
      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#222] mt-1">
        {members.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1.5">
              <Users className="w-3 h-3" /> Band Members
            </p>
            <div className="space-y-1.5">
              {members.map((m, mi) => {
                const note = getMemberNote(fxNotes, m.name);
                return (
                  <div key={mi} className="text-sm">
                    <span className="text-white font-medium">{m.name || "Unnamed"}</span>
                    {m.bus_type && (
                      <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{m.bus_type}</span>
                    )}
                    {m.instruments && m.instruments.length > 0 && (
                      <span className="text-white/50">
                        {" — "}
                        {m.instruments.map((inst, ii) => (
                          <span key={ii}>
                            {ii > 0 && ", "}
                            {inst.name}
                            {(inst.mic_di || inst.phantom_power) && (
                              <span className="text-white/30">
                                {" ("}
                                {[inst.mic_di, inst.phantom_power ? "+48V" : null].filter(Boolean).join(", ")}
                                {")"}
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    )}
                    {note && (
                      <p
                        onClick={() => toggleNote(`ro-${mi}`)}
                        className={`text-white/30 text-xs mt-0.5 cursor-pointer ${expandedNotes.has(`ro-${mi}`) ? "whitespace-pre-wrap" : "truncate"}`}
                      >
                        {note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {stagePlotImages.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1.5">
              <ImageIcon className="w-3 h-3" /> Stage Plot
            </p>
            <div className="flex gap-2 flex-wrap">
              {stagePlotImages.map((f, ui) => (
                <a key={ui} href={f.url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden border border-[#333] hover:border-[#8CFF3D]/50">
                  {(!f.type || f.type.startsWith("image/")) ? (
                    <img src={f.url} alt="Stage plot" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center text-white/40 text-[10px] p-1 text-center">{f.name}</div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
        {band.general_notes && (
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1">General Notes</p>
            <p className="text-white/70 text-sm whitespace-pre-wrap">{band.general_notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#222] mt-1">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold">
            <Users className="w-3 h-3" /> Band Members
          </p>
          <button onClick={addMember} className="text-[#8CFF3D] text-xs hover:underline">+ Add Member</button>
        </div>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={i} className="bg-[#111] rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <Input value={m.name || ""} onChange={(e) => updateMemberName(i, e.target.value)} placeholder="Member name" className="h-7 bg-[#1a1a1a] border-[#222] text-white text-xs flex-1" />
                <select
                  value={m.bus_type || ""}
                  onChange={(e) => updateMemberBusType(i, e.target.value)}
                  className="h-7 bg-[#1a1a1a] border border-[#222] text-white text-xs rounded px-1 shrink-0"
                >
                  <option value="">Mix Bus</option>
                  <option value="IEM">IEM</option>
                  <option value="Monitor">Monitor</option>
                </select>
                <button onClick={() => removeMember(i)} className="text-white/30 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {(m.instruments || []).map((inst, ii) => (
                <div key={ii} className="flex items-center gap-1.5 pl-2">
                  <Input value={inst.name || ""} onChange={(e) => updateInstrument(i, ii, "name", e.target.value)} placeholder="Instrument" className="h-6 bg-[#1a1a1a] border-[#222] text-white text-xs flex-1" />
                  <select
                    value={inst.mic_di || "Mic"}
                    onChange={(e) => updateInstrument(i, ii, "mic_di", e.target.value)}
                    className="h-6 bg-[#1a1a1a] border border-[#222] text-white text-xs rounded px-1"
                  >
                    <option value="Mic">Mic</option>
                    <option value="DI">DI</option>
                  </select>
                  <button
                    onClick={() => updateInstrument(i, ii, "phantom_power", !inst.phantom_power)}
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${inst.phantom_power ? "bg-[#8CFF3D]/20 text-[#8CFF3D]" : "text-white/30 border border-[#333]"}`}
                  >
                    +48V
                  </button>
                  <button onClick={() => removeInstrument(i, ii)} className="text-white/20 hover:text-red-400 shrink-0"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              <button onClick={() => addInstrument(i)} className="text-[#8CFF3D] text-[11px] hover:underline pl-2">+ Instrument</button>
              <div className="pl-2 pt-1">
                <Textarea
                  value={getMemberNote(fxNotes, m.name)}
                  onChange={(e) => updateMemberNote(m.name, e.target.value)}
                  onFocus={() => toggleNote(`ed-${i}`)}
                  placeholder="Notes for this member (FX, monitor mix, etc.)"
                  className={`bg-[#1a1a1a] border-[#222] text-white text-xs transition-all ${expandedNotes.has(`ed-${i}`) ? "min-h-[100px]" : "min-h-[32px]"}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold">
            <ImageIcon className="w-3 h-3" /> Stage Plot
          </p>
          <label className="text-[#8CFF3D] text-xs hover:underline cursor-pointer">
            + Upload
            <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleUpload} />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          {stagePlotFiles.map((f, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#333]">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                {f.type?.startsWith("image/") ? (
                  <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center text-white/40 text-[10px] p-1 text-center">{f.name}</div>
                )}
              </a>
              <button onClick={() => removeFile(i)} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white/80 hover:text-white flex items-center justify-center text-[10px]">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-white/40 text-[11px] uppercase tracking-wide font-semibold">General Notes</Label>
        <Textarea
          value={band.general_notes || ""}
          onChange={(e) => onUpdate("general_notes", e.target.value)}
          onFocus={() => toggleNote("general")}
          className={`mt-1 bg-[#111] border-[#222] text-white text-sm transition-all ${expandedNotes.has("general") ? "min-h-[120px]" : "min-h-[40px]"}`}
        />
      </div>
    </div>
  );
}

export default function SharedGig() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  const inviteToken = params.get("invite");
  const [resolvedToken, setResolvedToken] = useState(inviteToken ? null : urlToken);
  const currentPath = window.location.pathname + window.location.search;

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gig, setGig] = useState(null);
  const [permissions, setPermissions] = useState(null);
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
    if (!inviteToken) return;
    const resolveInvite = async () => {
      try {
        const { data, error } = await supabase.rpc("get_gig_invite", { p_token: inviteToken });
        if (error || !data || !data.share_token) { setNotFound(true); setLoading(false); return; }
        setResolvedToken(data.share_token);
      } catch (e) {
        console.error(e);
        setNotFound(true);
        setLoading(false);
      }
    };
    resolveInvite();
  }, [inviteToken]);

  useEffect(() => {
    const load = async () => {
      if (!resolvedToken) {
        if (!inviteToken && !urlToken) { setNotFound(true); setLoading(false); }
        return;
      }
      try {
        const [gigRes, permsRes] = await Promise.all([
          supabase.rpc("get_shared_gig", { p_token: resolvedToken }),
          supabase.rpc("get_gig_section_permissions", { p_token: resolvedToken }),
        ]);
        if (gigRes.error) throw gigRes.error;
        if (!gigRes.data) { setNotFound(true); setLoading(false); return; }
        setGig({ ...gigRes.data, bands: (gigRes.data.bands || []).map((b, i) => ({ ...b, sort_order: i })) });
        if (permsRes.error) console.error(permsRes.error);
        setPermissions(permsRes.data || { is_owner: false, my_roles: [], claimed_roles: [] });
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [resolvedToken]);

  const update = (field, val) => setGig((g) => ({ ...g, [field]: val }));
  const updateSection = (section, field, val) =>
    setGig((g) => ({ ...g, [section]: { ...(g[section] || {}), [field]: val } }));
  const [expandedBands, setExpandedBands] = useState(new Set());
  const toggleExpanded = (i) => {
    setExpandedBands((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const updateBand = (i, field, val) => {
    const bands = [...gig.bands];
    bands[i] = { ...bands[i], [field]: val };
    update("bands", bands);
  };
  const addBand = () => update("bands", [...(gig.bands || []), { role: "N/A", band_name: "", genre_tags: [], set_length_minutes: "", sort_order: gig.bands.length }]);
  const removeBand = (i) => update("bands", gig.bands.filter((_, idx) => idx !== i));

  const canEdit = !!user;
  const canEditSection = (section) => {
    if (!canEdit) return false;
    if (permissions?.is_owner) return true;
    if (permissions?.my_roles?.includes(section)) return true;
    return !permissions?.claimed_roles?.includes(section);
  };
  const isLocked = (section) => canEdit && !permissions?.is_owner && !canEditSection(section);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_shared_gig", { p_token: resolvedToken, p_updates: gig });
      if (error) throw error;

      const sectionSaves = [];
      if (canEditSection("venue")) {
        sectionSaves.push(supabase.rpc("update_gig_section", {
          p_token: resolvedToken, p_section: "venue",
          p_updates: {
            venue: gig.venue, city: gig.city, state: gig.state,
            wifi_network: gig.wifi_network, wifi_password: gig.wifi_password,
            console: gig.console, power_notes: gig.power_notes, venue_checklist: gig.venue_checklist,
          },
        }));
      }
      if (canEditSection("manager")) {
        sectionSaves.push(supabase.rpc("update_gig_section", { p_token: resolvedToken, p_section: "manager", p_updates: gig.manager_info || {} }));
      }
      if (canEditSection("promoter")) {
        sectionSaves.push(supabase.rpc("update_gig_section", { p_token: resolvedToken, p_section: "promoter", p_updates: gig.promoter_info || {} }));
      }
      if (canEditSection("booking_agent")) {
        sectionSaves.push(supabase.rpc("update_gig_section", { p_token: resolvedToken, p_section: "booking_agent", p_updates: gig.booking_agent_info || {} }));
      }
      const results = await Promise.all(sectionSaves);
      results.forEach((r) => { if (r.error) console.error(r.error); });

      if (user && gig.id) {
        await supabase
          .from("linked_gigs")
          .upsert({ user_id: user.id, show_id: gig.id, share_token: resolvedToken }, { onConflict: "user_id,show_id" });

        if (inviteToken) {
          await supabase.rpc("accept_gig_invite", { p_token: inviteToken });
        }
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

  const title = gig.event_name || gig.band_name || "Untitled Gig";
  const location = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const managerInfo = gig.manager_info || {};
  const promoterInfo = gig.promoter_info || {};
  const bookingInfo = gig.booking_agent_info || {};

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
            </>
          ) : (
            <>
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

        <SectionCard title="Venue Info" icon={MapPin} locked={isLocked("venue")}>
          <Field label="Venue" value={gig.venue} onChange={(v) => update("venue", v)} editable={canEditSection("venue")} placeholder="Venue name" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={gig.city} onChange={(v) => update("city", v)} editable={canEditSection("venue")} placeholder="City" />
            <Field label="State" value={gig.state} onChange={(v) => update("state", v)} editable={canEditSection("venue")} placeholder="State" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WiFi Network" value={gig.wifi_network} onChange={(v) => update("wifi_network", v)} editable={canEditSection("venue")} placeholder="Network name" />
            <Field label="WiFi Password" value={gig.wifi_password} onChange={(v) => update("wifi_password", v)} editable={canEditSection("venue")} placeholder="Password" />
          </div>
          <Field label="Console" value={gig.console} onChange={(v) => update("console", v)} editable={canEditSection("venue")} placeholder="e.g. Yamaha CL5" />
          <div>
            <Label className="text-white/50 text-xs">Power Notes</Label>
            {canEditSection("venue") ? (
              <Textarea value={gig.power_notes || ""} onChange={(e) => update("power_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Power availability, circuits, etc." />
            ) : (
              <p className="mt-1 text-white/70 text-sm">{gig.power_notes || <span className="text-white/25">Not filled in yet</span>}</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Manager" icon={User} locked={isLocked("manager")}>
          <Field label="Contact Name" value={managerInfo.contact_name} onChange={(v) => updateSection("manager_info", "contact_name", v)} editable={canEditSection("manager")} placeholder="Name" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={managerInfo.contact_phone} onChange={(v) => updateSection("manager_info", "contact_phone", v)} editable={canEditSection("manager")} placeholder="Phone" />
            <Field label="Email" value={managerInfo.contact_email} onChange={(v) => updateSection("manager_info", "contact_email", v)} editable={canEditSection("manager")} placeholder="Email" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Advancing Notes</Label>
            {canEditSection("manager") ? (
              <Textarea value={managerInfo.advancing_notes || ""} onChange={(e) => updateSection("manager_info", "advancing_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Load-in, soundcheck confirmed, etc." />
            ) : (
              <p className="mt-1 text-white/70 text-sm">{managerInfo.advancing_notes || <span className="text-white/25">Not filled in yet</span>}</p>
            )}
          </div>
          <Field label="Guest List" value={managerInfo.guest_list} onChange={(v) => updateSection("manager_info", "guest_list", v)} editable={canEditSection("manager")} placeholder="Names for the door" />
        </SectionCard>

        <SectionCard title="Promoter" icon={Ticket} locked={isLocked("promoter")}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Door Time" value={promoterInfo.door_time} onChange={(v) => updateSection("promoter_info", "door_time", v)} editable={canEditSection("promoter")} placeholder="e.g. 7:00 PM" />
            <Field label="Capacity" value={promoterInfo.capacity} onChange={(v) => updateSection("promoter_info", "capacity", v)} editable={canEditSection("promoter")} placeholder="e.g. 250" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ticket Price" value={promoterInfo.ticket_price} onChange={(v) => updateSection("promoter_info", "ticket_price", v)} editable={canEditSection("promoter")} placeholder="$20" />
            <Field label="Ticket Link" value={promoterInfo.ticket_link} onChange={(v) => updateSection("promoter_info", "ticket_link", v)} editable={canEditSection("promoter")} placeholder="URL" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Settlement Notes</Label>
            {canEditSection("promoter") ? (
              <Textarea value={promoterInfo.settlement_notes || ""} onChange={(e) => updateSection("promoter_info", "settlement_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Payment terms" />
            ) : (
              <p className="mt-1 text-white/70 text-sm">{promoterInfo.settlement_notes || <span className="text-white/25">Not filled in yet</span>}</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Booking Agent" icon={FileSignature} locked={isLocked("booking_agent")}>
          <Field label="Deal Terms" value={bookingInfo.deal_terms} onChange={(v) => updateSection("booking_agent_info", "deal_terms", v)} editable={canEditSection("booking_agent")} placeholder="Guarantee, percentage, etc." />
          <Field label="Contract Status" value={bookingInfo.contract_status} onChange={(v) => updateSection("booking_agent_info", "contract_status", v)} editable={canEditSection("booking_agent")} placeholder="Signed / Pending" />
          <Field label="Agency Contact" value={bookingInfo.agency_contact} onChange={(v) => updateSection("booking_agent_info", "agency_contact", v)} editable={canEditSection("booking_agent")} placeholder="Name, phone, or email" />
        </SectionCard>

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
                const hasDetails = (b.band_members && b.band_members.length > 0) || b.stage_plot_url || (b.stage_plot_files && b.stage_plot_files.length > 0) || b.artist_fx_notes || b.general_notes;
                const expanded = expandedBands.has(i);
                return (
                  <div key={i} className="bg-[#1a1a1a] rounded-xl overflow-hidden">
                    <div
                      onClick={() => hasDetails && toggleExpanded(i)}
                      className={`flex items-center justify-between px-3 py-2.5 ${hasDetails ? "cursor-pointer" : ""}`}
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        {hasDetails && <ChevronDown className={`w-3.5 h-3.5 text-white/30 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{b.band_name}</p>
                          {b.genre_tags && b.genre_tags.length > 0 && (
                            <p className="text-white/30 text-xs truncate">{b.genre_tags.join(", ")}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {b.set_length_minutes && <span className="text-white/40 text-xs">{b.set_length_minutes} min</span>}
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${colors.text} ${colors.bg}`}>
                          {b.role}
                        </span>
                      </div>
                    </div>
                    {expanded && <BandDetails band={b} editable={false} onUpdate={() => {}} />}
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
                  {((b.band_members && b.band_members.length > 0) || b.stage_plot_url || (b.stage_plot_files && b.stage_plot_files.length > 0) || b.artist_fx_notes || b.general_notes) && (
                    <>
                      <button
                        onClick={() => toggleExpanded(i)}
                        className="flex items-center gap-1 text-[#8CFF3D] text-xs font-medium hover:underline"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedBands.has(i) ? "rotate-180" : ""}`} />
                        {expandedBands.has(i) ? "Hide" : "Show"} tech details
                      </button>
                      {expandedBands.has(i) && <BandDetails band={b} editable={true} onUpdate={(field, val) => updateBand(i, field, val)} />}
                    </>
                  )}
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
