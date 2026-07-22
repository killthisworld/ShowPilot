import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Trash2, Plus, Share2, ImageIcon, Zap, Info, Music, Star, Paperclip, FileText, X, ChevronDown, ClipboardList, Settings } from "lucide-react";
import ColorPicker from "@/components/showpilot/ColorPicker";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";
import StatusBadge from "@/components/showpilot/StatusBadge";
import { usePreferences } from "@/hooks/usePreferences";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia",
];

const VENUE_CHECKLIST_ITEMS = [
  { key: "wifi", label: "WiFi" },
  { key: "console", label: "Console" },
  { key: "mics", label: "Mics" },
  { key: "di_boxes", label: "DI Boxes" },
  { key: "xlrs", label: "XLR's" },
  { key: "pa_house_monitors", label: "PA/House Monitors" },
  { key: "sub", label: "Sub" },
  { key: "onstage_monitors", label: "On-Stage Monitors" },
];

const emptyBand = (isHeadliner, sortOrder) => ({
  is_headliner: isHeadliner,
  sort_order: sortOrder,
  band_name: "",
  genre_tag: "",
  genre_tags: [],
  genre_color: "",
  set_length_minutes: null,
  stage_plot_url: "",
  stage_plot_files: [],
  band_members: [],
  artist_fx_notes: [],
  general_notes: "",
});

export default function ShowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { preferences, reload: reloadPreferences } = usePreferences();
  const isNew = id === "new";

  const backTo = location.state?.from === "calendar" ? "/calendar" : "/";

  const emptyShow = {
    venue: "", date: location.state?.prefillDate || "", city: "", state: "", event_time: "",
    wifi_network: "", wifi_password: "", console: "",
    status: "not_started", starred: false, contacts: [],
    power_notes: "", share_token: "", venue_checklist: {},
  };

  const [show, setShow] = useState(emptyShow);
  const [bands, setBands] = useState([emptyBand(true, 0)]);
  const [activeBandIndex, setActiveBandIndex] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [tmCopied, setTmCopied] = useState(false);
  const [savedToast, setSavedToast] = useState("");
  const [selectedArtistFx, setSelectedArtistFx] = useState("__general__");
  const [showGenreSettings, setShowGenreSettings] = useState(false);
  const [showBusSettings, setShowBusSettings] = useState(false);
  const [genreDraft, setGenreDraft] = useState([]);
  const [busDraft, setBusDraft] = useState({ IEM: "#EAB308", Monitor: "#F97316" });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [openNotesKey, setOpenNotesKey] = useState(null);
  const [collapsedMembers, setCollapsedMembers] = useState({});

  const activeBand = bands[activeBandIndex] || bands[0];

  useEffect(() => {
    if (!isNew) {
      Promise.all([
        supabase.from("shows").select("*").eq("id", id).single(),
        supabase.from("show_bands").select("*").eq("show_id", id).order("is_headliner", { ascending: false }).order("sort_order", { ascending: true }),
      ])
        .then(([showRes, bandsRes]) => {
          if (showRes.error || !showRes.data) {
            navigate("/");
            return;
          }
          const [parsedCity, parsedState] = (showRes.data.location || "").split(",").map((s) => s.trim());
          setShow({ ...showRes.data, city: parsedCity || "", state: parsedState || "" });
          if (bandsRes.data && bandsRes.data.length > 0) {
            setBands(bandsRes.data);
          } else {
            setBands([{
              is_headliner: true,
              sort_order: 0,
              band_name: showRes.data.band_name || "",
              genre_tag: showRes.data.genre_tag || "",
              genre_tags: showRes.data.genre_tags || [],
              genre_color: showRes.data.genre_color || "",
              stage_plot_url: showRes.data.stage_plot_url || "",
              stage_plot_files: showRes.data.stage_plot_files || [],
              band_members: showRes.data.band_members || [],
              artist_fx_notes: showRes.data.artist_fx_notes || [],
              general_notes: showRes.data.general_notes || "",
            }]);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  const update = (field, val) => setShow((s) => ({ ...s, [field]: val }));

  const updateBandField = (field, val, idx = activeBandIndex) => {
    setBands((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const showPill = (msg) => {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(""), 1000);
  };

  const addOpener = () => {
    setBands((prev) => {
      const next = [...prev, emptyBand(false, prev.length)];
      setActiveBandIndex(next.length - 1);
      return next;
    });
  };

  const removeOpener = async (idx) => {
    const band = bands[idx];
    if (band.is_headliner) return;
    if (!confirm(`Remove ${band.band_name || "this opener"}?`)) return;

    if (band.id) {
      const { error } = await supabase.from("show_bands").delete().eq("id", band.id);
      if (error) {
        console.error(error);
        showPill("Error removing opener");
        return;
      }
    }
    setBands((prev) => prev.filter((_, i) => i !== idx));
    setActiveBandIndex(0);
  };

  const headlinerIndex = bands.findIndex((b) => b.is_headliner);

  const handleSave = async () => {
    const headliner = bands[headlinerIndex] || bands[0];
    if (!headliner?.band_name || !show.date) {
      showPill("Headliner name and date required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const sharedPayload = {
        venue: show.venue, location: [show.city, show.state].filter(Boolean).join(", "), event_time: show.event_time,
        wifi_network: show.wifi_network, wifi_password: show.wifi_password,
        console: show.console, status: show.status, starred: show.starred,
        contacts: show.contacts, power_notes: show.power_notes, date: show.date,
        venue_checklist: show.venue_checklist,
        band_name: headliner.band_name, genre_tag: headliner.genre_tag,
        genre_tags: headliner.genre_tags, genre_color: headliner.genre_color,
        stage_plot_url: headliner.stage_plot_url, stage_plot_files: headliner.stage_plot_files,
        band_members: headliner.band_members, artist_fx_notes: headliner.artist_fx_notes,
        general_notes: headliner.general_notes,
      };
      if (show.share_token) sharedPayload.share_token = show.share_token;

      let showId = id;
      if (isNew) {
        const { data: created, error } = await supabase
          .from("shows")
          .insert({ ...sharedPayload, owner_id: user.id })
          .select()
          .single();
        if (error) throw error;
        showId = created.id;
      } else {
        const { error } = await supabase.from("shows").update(sharedPayload).eq("id", id);
        if (error) throw error;
      }

      const updatedBands = [...bands];
      for (let i = 0; i < updatedBands.length; i++) {
        const b = updatedBands[i];
        const { id: bandId, ...bandData } = b;
        if (bandId) {
          const { error } = await supabase.from("show_bands").update(bandData).eq("id", bandId);
          if (error) throw error;
        } else {
          const { data: createdBand, error } = await supabase
            .from("show_bands")
            .insert({ ...bandData, show_id: showId })
            .select()
            .single();
          if (error) throw error;
          updatedBands[i] = createdBand;
        }
      }
      setBands(updatedBands);

      if (isNew) {
        showPill("Show created ✓");
        navigate(`/show/${showId}`, { replace: true, state: location.state });
      } else {
        showPill("Saved ✓");
      }
    } catch (e) {
      console.error(e);
      showPill("Error saving");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this show?")) return;
    const { error } = await supabase.from("shows").delete().eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    navigate(backTo, { replace: true });
  };

  const toggleStar = () => {
    const newVal = !show.starred;
    update("starred", newVal);
    if (!isNew) supabase.from("shows").update({ starred: newVal }).eq("id", id).then(({ error }) => { if (error) console.error(error); });
  };

  const uploadFileToBucket = async (file, bucket) => {
    const { data: { user } } = await supabase.auth.getUser();
    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(filePath, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const handleStagePlotUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const file_url = await uploadFileToBucket(file, "stage-plots");
        const isImage = file.type.startsWith("image/");
        setBands((prev) => {
          const next = [...prev];
          const b = { ...next[activeBandIndex] };
          if (isImage && !b.stage_plot_url) b.stage_plot_url = file_url;
          b.stage_plot_files = [...(b.stage_plot_files || []), { url: file_url, name: file.name, type: file.type }];
          next[activeBandIndex] = b;
          return next;
        });
      } catch (err) {
        console.error(err);
        showPill("Upload failed");
      }
    }
    e.target.value = "";
  };
  const removeStagePlotFile = (i) => {
    setBands((prev) => {
      const next = [...prev];
      const b = { ...next[activeBandIndex] };
      b.stage_plot_files = (b.stage_plot_files || []).filter((_, idx) => idx !== i);
      next[activeBandIndex] = b;
      return next;
    });
  };

  const addContact = () => update("contacts", [...(show.contacts || []), { name: "", role: "", phone: "", email: "" }]);
  const updateContact = (i, f, v) => { const c = [...(show.contacts || [])]; c[i] = { ...c[i], [f]: v }; update("contacts", c); };
  const removeContact = (i) => update("contacts", (show.contacts || []).filter((_, idx) => idx !== i));

  const updateCity = (val) => update("city", val);
  const updateState = (val) => update("state", val);

  const toggleChecklistItem = (key) => {
    const current = show.venue_checklist || {};
    const wasChecked = !!current[key]?.checked;
    update("venue_checklist", { ...current, [key]: { ...current[key], checked: !wasChecked } });
  };
  const updateChecklistNote = (key, notes) => {
    const current = show.venue_checklist || {};
    update("venue_checklist", { ...current, [key]: { ...current[key], notes } });
  };
  const toggleNotesOpen = (key) => setOpenNotesKey((prev) => (prev === key ? null : key));
  const toggleMemberCollapsed = (i) => setCollapsedMembers((prev) => ({ ...prev, [i]: !prev[i] }));

  const addMember = () => updateBandField("band_members", [...(activeBand.band_members || []), { name: "", instrument: "", bus_color: "", bus_type: "", channels_needed: "", phantom_power: false }]);
  const updateMember = (i, f, v) => {
    const m = [...(activeBand.band_members || [])];
    m[i] = { ...m[i], [f]: v };
    updateBandField("band_members", m);
  };
  const removeMember = (i) => {
    const removedName = activeBand.band_members[i]?.name;
    updateBandField("band_members", (activeBand.band_members || []).filter((_, idx) => idx !== i));
    if (removedName) {
      updateBandField("artist_fx_notes", (activeBand.artist_fx_notes || []).filter(n => n.artist_name !== removedName));
    }
  };

  const applyBusType = (memberIdx, type) => {
    const m = [...(activeBand.band_members || [])];
    m[memberIdx] = { ...m[memberIdx], bus_type: type };
    updateBandField("band_members", m);
  };

  const toggleGenreTag = (tag) => {
    const current = activeBand.genre_tags || (activeBand.genre_tag ? [activeBand.genre_tag] : []);
    const isSelected = current.includes(tag.name);
    const updated = isSelected ? current.filter(t => t !== tag.name) : [...current, tag.name];
    setBands((prev) => {
      const next = [...prev];
      next[activeBandIndex] = { ...next[activeBandIndex], genre_tags: updated, genre_tag: updated[0] || "", genre_color: updated.length > 0 ? tag.color : "" };
      return next;
    });
  };

  const getArtistFxNote = (artistName) => {
    if (artistName === "__general__") return activeBand.general_notes || "";
    return (activeBand.artist_fx_notes || []).find(n => n.artist_name === artistName)?.notes || "";
  };
  const setArtistFxNote = (artistName, notes) => {
    if (artistName === "__general__") {
      updateBandField("general_notes", notes);
      return;
    }
    const existing = [...(activeBand.artist_fx_notes || [])];
    const idx = existing.findIndex(n => n.artist_name === artistName);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], notes };
    } else {
      existing.push({ artist_name: artistName, notes });
    }
    updateBandField("artist_fx_notes", existing);
  };

  const openGenreSettings = () => {
    setGenreDraft(preferences?.genre_tags ? [...preferences.genre_tags] : []);
    setShowGenreSettings(true);
  };
  const addGenreDraftTag = () => setGenreDraft((d) => [...d, { name: "", color: "#8CFF3D" }]);
  const updateGenreDraftTag = (i, field, val) => setGenreDraft((d) => { const next = [...d]; next[i] = { ...next[i], [field]: val }; return next; });
  const removeGenreDraftTag = (i) => setGenreDraft((d) => d.filter((_, idx) => idx !== i));
  const saveGenreSettings = async () => {
    setSavingPrefs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, genre_tags: genreDraft }, { onConflict: "user_id" });
      if (error) throw error;
      await reloadPreferences();
      setShowGenreSettings(false);
    } catch (e) {
      console.error(e);
      showPill("Error saving genres");
    }
    setSavingPrefs(false);
  };

  const openBusSettings = () => {
    setBusDraft({ ...iemMonitorColors });
    setShowBusSettings(true);
  };
  const saveBusSettings = async () => {
    setSavingPrefs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          mix_bus_presets: [
            { bus_type: "IEM", color: busDraft.IEM },
            { bus_type: "Monitor", color: busDraft.Monitor },
          ],
        }, { onConflict: "user_id" });
      if (error) throw error;
      await reloadPreferences();
      setShowBusSettings(false);
    } catch (e) {
      console.error(e);
      showPill("Error saving colors");
    }
    setSavingPrefs(false);
  };

  const handleTourManagerLink = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
      const url = `${window.location.origin}/tm-intake?token=${request.invite_token}&engineer=${user.id}&name=${name}`;
      navigator.clipboard.writeText(url);
      setTmCopied(true);
      setTimeout(() => setTmCopied(false), 1000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareLink = async () => {
    let token = show.share_token;
    if (!token) {
      const { data, error } = await supabase
        .from("shows")
        .update({ share_token: crypto.randomUUID() })
        .eq("id", id)
        .select("share_token")
        .single();
      if (error) {
        console.error(error);
        return;
      }
      token = data.share_token;
      update("share_token", token);
    }
    const url = `${window.location.origin}/shared/${id}?token=${token}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  const genreTags = preferences?.genre_tags || [];
  const busPresets = preferences?.mix_bus_presets || [];

  const iemMonitorColors = {
    IEM: busPresets.find(p => p.bus_type === "IEM")?.color || "#EAB308",
    Monitor: busPresets.find(p => p.bus_type === "Monitor")?.color || "#F97316",
  };

  let openerCount = 0;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-8">
      {savedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {savedToast}
        </div>
      )}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-sm font-semibold px-4 py-2 rounded-full shadow-lg transition-all duration-1000 ${tmCopied ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
        Tour Manager link copied!
      </div>

      {showGenreSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowGenreSettings(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base">Genre Colors</h3>
              <button onClick={() => setShowGenreSettings(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 mb-3">
              {genreDraft.map((tag, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#1a1a1a] rounded-xl p-2">
                  <ColorPicker value={tag.color} onChange={(c) => updateGenreDraftTag(i, "color", c)} label="" />
                  <Input
                    value={tag.name}
                    onChange={(e) => updateGenreDraftTag(i, "name", e.target.value)}
                    placeholder="Genre name"
                    className="flex-1 h-8 bg-transparent border-0 text-white text-sm"
                  />
                  <button onClick={() => removeGenreDraftTag(i)} className="p-1 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {genreDraft.length === 0 && (
                <p className="text-xs text-white/30 text-center py-3">No genre tags yet</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={addGenreDraftTag} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full mb-3">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Genre
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowGenreSettings(false)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Back
              </Button>
              <Button onClick={saveGenreSettings} disabled={savingPrefs} className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold">
                {savingPrefs ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBusSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowBusSettings(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base">Mix Bus Colors</h3>
              <button onClick={() => setShowBusSettings(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-white/40 mb-3">Channel numbers are tracked on your console — just pick a color for each type here.</p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-xl p-2">
                <ColorPicker value={busDraft.IEM} onChange={(c) => setBusDraft((d) => ({ ...d, IEM: c }))} label="IEM" />
              </div>
              <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-xl p-2">
                <ColorPicker value={busDraft.Monitor} onChange={(c) => setBusDraft((d) => ({ ...d, Monitor: c }))} label="Monitor" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowBusSettings(false)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Back
              </Button>
              <Button onClick={saveBusSettings} disabled={savingPrefs} className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold">
                {savingPrefs ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <button onClick={() => navigate(backTo)} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </button>
          <div className="flex items-center gap-1">
            <button onClick={toggleStar} className={`p-2 rounded-lg transition-colors ${show.starred ? "text-amber-400" : "text-white/25 hover:text-white/50"}`}>
              <Star className="w-4 h-4" fill={show.starred ? "currentColor" : "none"} />
            </button>
            {!isNew && (
              <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-400/60 hover:text-red-400 h-8 w-8 p-0">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving} size="sm" className="bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-8 rounded-lg">
              <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <Select value={show.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger className="w-auto h-8 bg-transparent border-0 p-0">
              <StatusBadge status={show.status} />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
              <SelectItem value="not_started">New</SelectItem>
              <SelectItem value="in_progress">Frequent</SelectItem>
              <SelectItem value="complete">Worked</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={addOpener} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 h-8">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Opener
          </Button>
        </div>

        {bands.length > 1 && (
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {bands.map((b, i) => {
              const label = b.is_headliner
                ? (b.band_name || "Headliner")
                : (b.band_name || `Opener ${++openerCount}`);
              return (
                <button
                  key={b.id || `new-${i}`}
                  onClick={() => setActiveBandIndex(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${activeBandIndex === i ? "border-[#8CFF3D]/40 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#222] text-white/40 hover:text-white/60"}`}
                >
                  {b.is_headliner && <Star className="w-3 h-3" fill="currentColor" />}
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
          <div className="flex items-center gap-2">
            {activeBand.is_headliner ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8CFF3D] bg-[#8CFF3D]/10 px-2 py-1 rounded-full">Headliner</span>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/5 px-2 py-1 rounded-full">Opener</span>
                <button onClick={() => removeOpener(activeBandIndex)} className="p-1 text-white/30 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <div>
            <Label className="text-white/50 text-xs">Band Name *</Label>
            <Input value={activeBand.band_name} onChange={(e) => updateBandField("band_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Band / Artist" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Date *</Label>
            <Input type="date" value={show.date} onChange={(e) => update("date", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white [color-scheme:dark] w-44" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Set Length (minutes)</Label>
            <Input
              type="number"
              min={0}
              value={activeBand.set_length_minutes ?? ""}
              onChange={(e) => updateBandField("set_length_minutes", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 90"
              className="mt-1 bg-[#111] border-[#222] text-white w-28"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-white/50 text-xs">Genre / Tag</Label>
              <button onClick={openGenreSettings} className="text-white/30 hover:text-[#8CFF3D] p-1 -m-1">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {genreTags.map((tag) => {
                const selectedTags = activeBand.genre_tags || (activeBand.genre_tag ? [activeBand.genre_tag] : []);
                const isSelected = selectedTags.includes(tag.name);
                return (
                  <button
                    key={tag.name}
                    onClick={() => toggleGenreTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${isSelected ? "border-white/40 scale-105" : "border-transparent opacity-70 hover:opacity-100"}`}
                    style={{ backgroundColor: tag.color + "22", color: tag.color }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <CollapsibleSection title="Venue Info" icon={Info}>
          <div className="space-y-4 pt-3">
            <div>
              <Label className="text-white/50 text-xs mb-2 block">Person of Contact</Label>
              <div className="space-y-2">
                {(show.contacts || []).map((c, i) => (
                  <div key={i} className="bg-[#111] rounded-xl p-3">
                    <div className="flex justify-between items-start">
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <Input value={c.name} onChange={(e) => updateContact(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                        <Input value={c.role} onChange={(e) => updateContact(i, "role", e.target.value)} placeholder="Role" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                        <Input value={c.phone} onChange={(e) => updateContact(i, "phone", e.target.value)} placeholder="Phone" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                        <Input value={c.email} onChange={(e) => updateContact(i, "email", e.target.value)} placeholder="Email" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                      </div>
                      <button onClick={() => removeContact(i)} className="p-1.5 ml-2 text-white/30 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addContact} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-white/50 text-xs">Venue</Label>
              <Input value={show.venue} onChange={(e) => update("venue", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Venue name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/50 text-xs">City</Label>
                <Input value={show.city || ""} onChange={(e) => updateCity(e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="City" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">State</Label>
                <Select value={show.state || ""} onValueChange={updateState}>
                  <SelectTrigger className="mt-1 h-10 bg-[#111] border-[#222] text-white">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-64">
                    {US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-1">
              <Label className="text-white/50 text-xs mb-2 block">Venue Provides</Label>
              <div className="flex gap-1">
                {VENUE_CHECKLIST_ITEMS.map((item) => {
                  const checked = !!show.venue_checklist?.[item.key]?.checked;
                  const notesOpen = openNotesKey === item.key;
                  return (
                    <div key={item.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <span className={`text-[9px] font-semibold text-center leading-tight h-7 flex items-center justify-center transition-colors ${checked ? "text-[#8CFF3D]" : "text-white/40"}`}>
                        {item.label}
                      </span>
                      <button
                        onClick={() => toggleChecklistItem(item.key)}
                        className="relative w-3 h-16 rounded-full bg-[#111] border border-[#2a2a2a] overflow-visible"
                      >
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-full bg-[#8CFF3D]/25 transition-all duration-500 ease-out"
                          style={{ height: checked ? "100%" : "4%" }}
                        />
                        <div
                          className="absolute left-1/2 -translate-x-1/2 w-5 h-2.5 rounded-sm border transition-all duration-500 ease-out"
                          style={{
                            bottom: checked ? "calc(100% - 10px)" : "2px",
                            backgroundColor: checked ? "#8CFF3D" : "#3a3a3a",
                            borderColor: checked ? "#8CFF3D" : "#4a4a4a",
                          }}
                        />
                      </button>
                      <button
                        onClick={() => toggleNotesOpen(item.key)}
                        className={`w-5 h-4 rounded flex items-center justify-center transition-colors ${notesOpen ? "bg-[#8CFF3D]/20 text-[#8CFF3D]" : "bg-white/5 text-white/30 hover:text-white/50"}`}
                      >
                        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${notesOpen ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {VENUE_CHECKLIST_ITEMS.filter((item) => openNotesKey === item.key).map((item) => (
                <div key={item.key} className="mt-2 p-2.5 bg-[#0d0d0d] border border-[#222] rounded-lg space-y-2">
                  <Label className="text-white/40 text-[10px] uppercase tracking-wide">{item.label}</Label>
                  {item.key === "wifi" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={show.wifi_network} onChange={(e) => update("wifi_network", e.target.value)} placeholder="Network" className="h-7 bg-[#111] border-[#222] text-white text-xs" />
                      <Input value={show.wifi_password} onChange={(e) => update("wifi_password", e.target.value)} placeholder="Password" className="h-7 bg-[#111] border-[#222] text-white text-xs" />
                    </div>
                  ) : item.key === "console" ? (
                    <Input value={show.console} onChange={(e) => update("console", e.target.value)} placeholder="e.g. Yamaha CL5" className="h-7 bg-[#111] border-[#222] text-white text-xs" />
                  ) : (
                    <Textarea
                      value={show.venue_checklist?.[item.key]?.notes || ""}
                      onChange={(e) => updateChecklistNote(item.key, e.target.value)}
                      placeholder={`${item.label} details...`}
                      className="bg-[#111] border-[#222] text-white text-xs min-h-[50px]"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Stage Plot" icon={ImageIcon}>
          <div className="pt-3 space-y-3">
            {(activeBand.stage_plot_files || []).length > 0 && (
              <div className="space-y-2">
                {(activeBand.stage_plot_files || []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-[#111] rounded-xl p-2">
                    {f.type?.startsWith("image/") ? (
                      <img src={f.url} alt={f.name} className="w-12 h-12 object-cover rounded-lg border border-[#222]" />
                    ) : (
                      <div className="w-12 h-12 flex items-center justify-center bg-[#1a1a1a] rounded-lg border border-[#222]">
                        <FileText className="w-5 h-5 text-white/40" />
                      </div>
                    )}
                    <span className="flex-1 text-sm text-white/60 truncate">{f.name}</span>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#8CFF3D] hover:underline">View</a>
                    <button onClick={() => removeStagePlotFile(i)} className="p-1 text-white/30 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-3 py-4 border-2 border-dashed border-[#222] rounded-xl cursor-pointer hover:border-[#8CFF3D]/30 transition-colors px-4">
              <Paperclip className="w-5 h-5 text-white/30" />
              <span className="text-sm text-white/40">Upload images or files</span>
              <input type="file" accept="image/*,.pdf,.png,.jpg,.jpeg" multiple className="hidden" onChange={handleStagePlotUpload} />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Band & Mix Bus" icon={Music} badge={activeBand.band_members?.length || 0}>
          <div className="space-y-3 pt-3">
            {(activeBand.band_members || []).map((m, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <span className="text-white font-semibold text-sm">{m.name || <span className="text-white/25 italic">Name</span>}</span>
                    <span className="text-white/30 text-sm">→</span>
                    <span className="text-white/60 text-sm">{m.instrument || <span className="text-white/25 italic">Role</span>}</span>
                    {m.bus_type && (
                      <>
                        <span className="text-white/30 text-sm">→</span>
                        <span className="text-sm font-bold" style={{ color: iemMonitorColors[m.bus_type] }}>{m.bus_type}</span>
                      </>
                    )}
                    {!!m.channels_needed && (
                      <span className="text-white/40 text-xs">· {m.channels_needed} ch(s)</span>
                    )}
                    {m.phantom_power && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400">+48V</span>
                    )}
                  </div>
                  <button onClick={() => toggleMemberCollapsed(i)} className="p-1.5 shrink-0 text-white/30 hover:text-[#8CFF3D]">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsedMembers[i] ? "" : "rotate-180"}`} />
                  </button>
                  <button onClick={() => removeMember(i)} className="p-1.5 ml-1 shrink-0 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!collapsedMembers[i] && (
                <>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-[#1a1a1a] border-[#222] text-white text-sm" />
                  <Input value={m.instrument} onChange={(e) => updateMember(i, "instrument", e.target.value)} placeholder="Instrument/Role" className="h-8 bg-[#1a1a1a] border-[#222] text-white text-sm" />
                </div>

                <div className="flex items-center gap-2">
                  {["IEM", "Monitor"].map((type, ti) => {
                    const color = iemMonitorColors[type];
                    const active = m.bus_type === type;
                    return (
                      <React.Fragment key={type}>
                        <button
                          onClick={() => applyBusType(i, type)}
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active ? "border-white/40" : "border-transparent opacity-60 hover:opacity-100"}`}
                          style={{ backgroundColor: color + "22", color }}
                        >
                          {type}
                        </button>
                        {ti === 0 && (
                          <button onClick={openBusSettings} className="text-white/30 hover:text-[#8CFF3D] p-1.5 shrink-0">
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                <div className="border-t border-[#222] pt-2 flex items-end gap-3">
                  <div>
                    <Label className="text-white/30 text-[10px] uppercase tracking-widest font-medium block mb-1">Number of Channels Needed</Label>
                    <Input
                      type="number"
                      min={0}
                      value={m.channels_needed || ""}
                      onChange={(e) => updateMember(i, "channels_needed", e.target.value ? parseInt(e.target.value) : "")}
                      placeholder="e.g. 7"
                      className="w-24 h-8 bg-[#1a1a1a] border-[#222] text-white text-sm text-center"
                    />
                  </div>
                  <button
                    onClick={() => updateMember(i, "phantom_power", !m.phantom_power)}
                    className={`h-8 px-3 rounded-lg text-xs font-bold border transition-all ${m.phantom_power ? "border-amber-400/50 text-amber-400 bg-amber-500/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                  >
                    +48V
                  </button>
                </div>
                </>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addMember} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Member
            </Button>

            <div className="pt-1 border-t border-[#222]">
              <Label className="text-white/50 text-xs">Power Requirements</Label>
              <Textarea value={show.power_notes || ""} onChange={(e) => update("power_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white min-h-[60px]" placeholder="Power notes..." />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="FX / Artist Notes" icon={Zap}>
          <div className="space-y-3 pt-3">
            <Textarea
              key={`${activeBandIndex}-${selectedArtistFx}`}
              value={getArtistFxNote(selectedArtistFx)}
              onChange={(e) => setArtistFxNote(selectedArtistFx, e.target.value)}
              className="bg-[#111] border-[#222] text-white min-h-[120px]"
              placeholder={selectedArtistFx === "__general__" ? "General notes for the show..." : `FX / notes for ${selectedArtistFx}...`}
            />

            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedArtistFx("__general__")} className={`px-2.5 py-1 rounded-full text-xs border transition-all ${selectedArtistFx === "__general__" ? "border-[#8CFF3D]/40 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#222] text-white/40 hover:text-white/60"}`}>
                General {activeBand.general_notes ? "●" : ""}
              </button>
              {(activeBand.band_members || []).filter(m => m.name).map((m) => {
                const hasNote = (activeBand.artist_fx_notes || []).find(n => n.artist_name === m.name)?.notes;
                return (
                  <button key={m.name} onClick={() => setSelectedArtistFx(m.name)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all flex items-center gap-1 ${selectedArtistFx === m.name ? "border-[#8CFF3D]/40 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#222] text-white/40 hover:text-white/60"}`}>
                    {m.name} {hasNote ? "●" : ""}
                    {m.phantom_power && <span className="text-amber-400 font-bold">+48V</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

      </div>
    </div>
  );
}
