import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Trash2, Plus, Share2, ImageIcon, Users, Zap, Info, Music, Star, Paperclip, FileText, X, ChevronDown, ClipboardList } from "lucide-react";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";
import StatusBadge from "@/components/showpilot/StatusBadge";
import { usePreferences } from "@/hooks/usePreferences";

export default function ShowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { preferences } = usePreferences();
  const isNew = id === "new";

  // Determine back destination — calendar if we came from there
  const backTo = location.state?.from === "calendar" ? "/calendar" : "/";

  const emptyShow = {
    band_name: "", venue: "", date: "", location: "", event_time: "",
    wifi_network: "", wifi_password: "", console: "", genre_tag: "", genre_color: "",
    status: "not_started", starred: false, contacts: [],
    stage_plot_url: "", stage_plot_files: [],
    power_notes: "", band_members: [], artist_fx_notes: [], general_notes: "", share_token: "",
  };

  const [show, setShow] = useState(emptyShow);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [tmCopied, setTmCopied] = useState(false);
  const [savedToast, setSavedToast] = useState("");
  const [selectedArtistFx, setSelectedArtistFx] = useState("__general__");

  useEffect(() => {
    if (!isNew) {
      supabase
        .from("shows")
        .select("*")
        .eq("id", id)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            navigate("/");
          } else {
            setShow(data);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  const update = (field, val) => setShow((s) => ({ ...s, [field]: val }));

  const showPill = (msg) => {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(""), 1000);
  };

  const handleSave = async () => {
    if (!show.band_name || !show.date) {
      showPill("Band name and date required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      if (isNew) {
        const { id: _discard, share_token: _discardToken, ...showData } = show; // don't send an empty id or empty-string share_token (it's a uuid column, "" is invalid)
        const { data: created, error } = await supabase
          .from("shows")
          .insert({ ...showData, owner_id: user.id })
          .select()
          .single();
        if (error) throw error;
        showPill("Show created ✓");
        navigate(`/show/${created.id}`, { replace: true, state: location.state });
      } else {
        const { id: _discard, ...showData } = show;
        if (!showData.share_token) delete showData.share_token; // same fix for updates
        const { error } = await supabase.from("shows").update(showData).eq("id", id);
        if (error) throw error;
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

  // Generic uploader used by the Stage Plot section
  const uploadFileToBucket = async (file, bucket) => {
    const { data: { user } } = await supabase.auth.getUser();
    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(filePath, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  // Stage plot file uploads
  const handleStagePlotUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const file_url = await uploadFileToBucket(file, "stage-plots");
        const isImage = file.type.startsWith("image/");
        if (isImage && !show.stage_plot_url) update("stage_plot_url", file_url);
        setShow(s => ({
          ...s,
          stage_plot_files: [...(s.stage_plot_files || []), { url: file_url, name: file.name, type: file.type }],
        }));
      } catch (err) {
        console.error(err);
        showPill("Upload failed");
      }
    }
    e.target.value = "";
  };
  const removeStagePlotFile = (i) => setShow(s => ({ ...s, stage_plot_files: (s.stage_plot_files || []).filter((_, idx) => idx !== i) }));

  // Contacts
  const addContact = () => update("contacts", [...(show.contacts || []), { name: "", role: "", phone: "", email: "" }]);
  const updateContact = (i, f, v) => { const c = [...(show.contacts || [])]; c[i] = { ...c[i], [f]: v }; update("contacts", c); };
  const removeContact = (i) => update("contacts", (show.contacts || []).filter((_, idx) => idx !== i));

  // Band members
  const addMember = () => update("band_members", [...(show.band_members || []), { name: "", instrument: "", bus_color: "", bus_number: 1, bus_type: "IEM", bus_label: "" }]);
  const updateMember = (i, f, v) => {
    const m = [...(show.band_members || [])];
    m[i] = { ...m[i], [f]: v };
    if (f === "bus_color" || f === "bus_number" || f === "bus_type") {
      m[i].bus_label = `${m[i].bus_type} ${m[i].bus_number}`;
    }
    update("band_members", m);
  };
  const removeMember = (i) => {
    const removedName = show.band_members[i]?.name;
    update("band_members", (show.band_members || []).filter((_, idx) => idx !== i));
    if (removedName) {
      update("artist_fx_notes", (show.artist_fx_notes || []).filter(n => n.artist_name !== removedName));
    }
  };

  const applyBusPreset = (memberIdx, preset) => {
    const m = [...(show.band_members || [])];
    m[memberIdx] = { ...m[memberIdx], bus_color: preset.color, bus_number: preset.bus_number, bus_type: preset.bus_type, bus_label: preset.label };
    update("band_members", m);
  };

  const toggleGenreTag = (tag) => {
    const current = show.genre_tags || (show.genre_tag ? [show.genre_tag] : []);
    const isSelected = current.includes(tag.name);
    const updated = isSelected ? current.filter(t => t !== tag.name) : [...current, tag.name];
    setShow(s => ({ ...s, genre_tags: updated, genre_tag: updated[0] || "", genre_color: updated.length > 0 ? tag.color : "" }));
  };

  // Artist FX notes
  const getArtistFxNote = (artistName) => {
    if (artistName === "__general__") return show.general_notes || "";
    return (show.artist_fx_notes || []).find(n => n.artist_name === artistName)?.notes || "";
  };
  const setArtistFxNote = (artistName, notes) => {
    if (artistName === "__general__") {
      update("general_notes", notes);
      return;
    }
    const existing = [...(show.artist_fx_notes || [])];
    const idx = existing.findIndex(n => n.artist_name === artistName);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], notes };
    } else {
      existing.push({ artist_name: artistName, notes });
    }
    update("artist_fx_notes", existing);
  };

  // NOTE: the original Base44 version of this function generated a link but never
  // actually saved a TourManagerRequest record for it — meaning the link wouldn't
  // have worked. This version fixes that by actually persisting the request,
  // matching the working version on the Calendar page.
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
      // share_token defaults to a generated UUID in the database, but since this
      // show already exists as a row, we ask Postgres to generate one via update.
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
  const memberNames = (show.band_members || []).map(m => m.name).filter(Boolean);

  // Separate IEM and Monitor presets
  const iemPresets = busPresets.filter(p => p.bus_type === "IEM");
  const monitorPresets = busPresets.filter(p => p.bus_type === "Monitor");

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-8">
      {/* Saved pill toast */}
      {savedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {savedToast}
        </div>
      )}
      {/* TM link copied toast */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-sm font-semibold px-4 py-2 rounded-full shadow-lg transition-all duration-1000 ${tmCopied ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
        Tour Manager link copied!
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <button onClick={() => navigate(backTo)} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </button>
          <div className="flex items-center gap-1">
            {/* Star */}
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
        {/* Status */}
        <div className="flex items-center gap-3 mb-2">
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
        </div>

        {/* Header Info */}
        <CollapsibleSection title="Header Info" icon={Info} defaultOpen={true}>
          <div className="space-y-3 pt-3">
            <div>
              <Label className="text-white/50 text-xs">Band Name *</Label>
              <Input value={show.band_name} onChange={(e) => update("band_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Band / Artist" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Date *</Label>
              <Input type="date" value={show.date} onChange={(e) => update("date", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white [color-scheme:dark] w-44" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Venue</Label>
              <Input value={show.venue} onChange={(e) => update("venue", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Venue name" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Location</Label>
              <Input value={show.location} onChange={(e) => update("location", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="City, State" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/50 text-xs">WiFi Network</Label>
                <Input value={show.wifi_network} onChange={(e) => update("wifi_network", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">WiFi Password</Label>
                <Input value={show.wifi_password} onChange={(e) => update("wifi_password", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
            </div>
            <div>
              <Label className="text-white/50 text-xs">Console</Label>
              <Input value={show.console} onChange={(e) => update("console", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="e.g. Yamaha CL5" />
            </div>
            <div>
              <Label className="text-white/50 text-xs mb-2 block">Genre / Tag</Label>
              <div className="flex flex-wrap gap-2">
                {genreTags.map((tag) => {
                  const selectedTags = show.genre_tags || (show.genre_tag ? [show.genre_tag] : []);
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
        </CollapsibleSection>

        {/* Contacts */}
        <CollapsibleSection title="Contacts" icon={Users} badge={show.contacts?.length || 0}>
          <div className="space-y-3 pt-3">
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
        </CollapsibleSection>

        {/* Stage Plot */}
        <CollapsibleSection title="Stage Plot" icon={ImageIcon}>
          <div className="pt-3 space-y-3">
            {/* Uploaded files list */}
            {(show.stage_plot_files || []).length > 0 && (
              <div className="space-y-2">
                {(show.stage_plot_files || []).map((f, i) => (
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

        {/* Band Members & Mix Bus */}
        <CollapsibleSection title="Band & Mix Bus" icon={Music} badge={show.band_members?.length || 0}>
          <div className="space-y-3 pt-3">
            {(show.band_members || []).map((m, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-3">
                {/* PRIMARY: Linear summary display */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    {m.bus_color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: m.bus_color }} />}
                    <span className="text-white font-semibold text-sm">{m.name || <span className="text-white/25 italic">Name</span>}</span>
                    <span className="text-white/30 text-sm">→</span>
                    <span className="text-white/60 text-sm">{m.instrument || <span className="text-white/25 italic">Role</span>}</span>
                    {m.monitor_type && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.monitor_type === "IEM" ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"}`}>
                        {m.monitor_type}
                      </span>
                    )}
                    {m.bus_label && (
                      <>
                        <span className="text-white/30 text-sm">→</span>
                        <span className="text-sm font-bold" style={{ color: m.bus_color }}>{m.bus_label}</span>
                      </>
                    )}
                  </div>
                  <button onClick={() => removeMember(i)} className="p-1.5 ml-2 shrink-0 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Edit fields below */}
                <div className="grid grid-cols-2 gap-2">
                  <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-[#1a1a1a] border-[#222] text-white text-sm" />
                  <Input value={m.instrument} onChange={(e) => updateMember(i, "instrument", e.target.value)} placeholder="Instrument/Role" className="h-8 bg-[#1a1a1a] border-[#222] text-white text-sm" />
                </div>

                {/* Bus preset picker */}
                <div className="space-y-2">
                  {iemPresets.length > 0 && (
                    <div>
                      <span className="text-white/30 text-[10px] uppercase tracking-widest font-medium block mb-1">IEM</span>
                      <div className="flex flex-wrap gap-1.5">
                        {iemPresets.map((preset, pi) => {
                          const active = m.bus_color === preset.color && m.bus_number === preset.bus_number && m.bus_type === "IEM";
                          return (
                            <button key={pi} onClick={() => applyBusPreset(i, preset)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${active ? "border-white/40" : "border-transparent opacity-60 hover:opacity-100"}`}
                              style={{ backgroundColor: preset.color + "22", color: preset.color }}>
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {monitorPresets.length > 0 && (
                    <div>
                      <span className="text-white/30 text-[10px] uppercase tracking-widest font-medium block mb-1">Monitor</span>
                      <div className="flex flex-wrap gap-1.5">
                        {monitorPresets.map((preset, pi) => {
                          const active = m.bus_color === preset.color && m.bus_number === preset.bus_number && m.bus_type === "Monitor";
                          return (
                            <button key={pi} onClick={() => applyBusPreset(i, preset)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${active ? "border-white/40" : "border-transparent opacity-60 hover:opacity-100"}`}
                              style={{ backgroundColor: preset.color + "22", color: preset.color }}>
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Number of channels needed */}
                <div className="border-t border-[#222] pt-2">
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

        {/* FX Notes — per-artist pill selector */}
        <CollapsibleSection title="FX / Artist Notes" icon={Zap}>
          <div className="space-y-3 pt-3">
            <Textarea
              key={selectedArtistFx}
              value={getArtistFxNote(selectedArtistFx)}
              onChange={(e) => setArtistFxNote(selectedArtistFx, e.target.value)}
              className="bg-[#111] border-[#222] text-white min-h-[120px]"
              placeholder={selectedArtistFx === "__general__" ? "General notes for the show..." : `FX / notes for ${selectedArtistFx}...`}
            />

            {/* Pill selector — always visible below the text box */}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedArtistFx("__general__")} className={`px-2.5 py-1 rounded-full text-xs border transition-all ${selectedArtistFx === "__general__" ? "border-[#8CFF3D]/40 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#222] text-white/40 hover:text-white/60"}`}>
                General {show.general_notes ? "●" : ""}
              </button>
              {memberNames.map((name) => {
                const hasNote = (show.artist_fx_notes || []).find(n => n.artist_name === name)?.notes;
                return (
                  <button key={name} onClick={() => setSelectedArtistFx(name)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all ${selectedArtistFx === name ? "border-[#8CFF3D]/40 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#222] text-white/40 hover:text-white/60"}`}>
                    {name} {hasNote ? "●" : ""}
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
