import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Plus, Trash2, Paperclip, X, Music, MapPin, ChevronDown, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

// Section colors mirror SharedGig's SECTION_COLORS so a Venue template
// here visually connects to the Venue section it gets loaded into, and
// same for Artist templates and the Manager/Band lineup.
const GROUP_STYLE = {
  venue: { color: "#FB923C", icon: MapPin, label: "Venues" },
  artist: { color: "#EF4444", icon: Music, label: "Artists / Bands" },
};

const emptyData = (category) =>
  category === "venue"
    ? { city: "", state: "", wifi_network: "", wifi_password: "", console: "", power_notes: "" }
    : { genre_tags: [], band_members: [], stage_plot_url: "", stage_plot_files: [], general_notes: "" };

export default function MyTemplates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]); // { key, id, category, name, data, open, saving, saved }
  const [genreInputs, setGenreInputs] = useState({}); // key -> current genre input text
  const [notesTargets, setNotesTargets] = useState({}); // key -> "__general__" | member index
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [collapsedMembers, setCollapsedMembers] = useState({}); // "templateKey:memberIndex" -> bool

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data, error } = await supabase
          .from("saved_templates")
          .select("id, category, name, data")
          .eq("owner_id", user.id)
          .order("category")
          .order("name");
        if (error) {
          console.error(error);
        } else {
          setTemplates(
            (data || []).map((t) => ({ key: `id:${t.id}`, id: t.id, category: t.category, name: t.name, data: t.data || {}, open: false, saving: false, saved: false }))
          );
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const findIdx = (key) => templates.findIndex((t) => t.key === key);
  const setTemplate = (key, updater) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.key === key);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = typeof updater === "function" ? updater(next[idx]) : { ...next[idx], ...updater };
      return next;
    });
  };
  const setData = (key, field, val) => setTemplate(key, (t) => ({ ...t, data: { ...t.data, [field]: val } }));

  const addTemplate = (category) => {
    const key = `new:${Date.now()}`;
    setTemplates((prev) => [...prev, { key, id: null, category, name: "", data: emptyData(category), open: true, saving: false, saved: false }]);
    setNotesTargets((prev) => ({ ...prev, [key]: "__general__" }));
  };

  const toggleOpen = (key) => setTemplate(key, (t) => ({ ...t, open: !t.open }));

  // --- Artist template member helpers (mirrors BandProfile's pattern) ---
  const getInstruments = (m) => m.instruments || [];
  const memberSummary = (m) => {
    const instrumentNames = getInstruments(m).map((inst) => inst.name).filter(Boolean).join(", ");
    return [m.name, instrumentNames, m.bus_type].filter(Boolean).join(" → ");
  };
  const addMember = (key) => setData(key, "band_members", [...(templates.find((t) => t.key === key).data.band_members || []), { name: "", instruments: [], bus_type: "", notes: "" }]);
  const updateMember = (key, i, field, val) => {
    const t = templates.find((tt) => tt.key === key);
    const members = [...(t.data.band_members || [])];
    members[i] = { ...members[i], [field]: val };
    setData(key, "band_members", members);
  };
  const removeMember = (key, i) => {
    const t = templates.find((tt) => tt.key === key);
    setData(key, "band_members", (t.data.band_members || []).filter((_, idx) => idx !== i));
    setNotesTargets((prev) => ({ ...prev, [key]: "__general__" }));
  };
  const addInstrument = (key, i) => {
    const t = templates.find((tt) => tt.key === key);
    const members = [...(t.data.band_members || [])];
    members[i] = { ...members[i], instruments: [...getInstruments(members[i]), { name: "", phantom_power: false, mic_di: "Mic" }] };
    setData(key, "band_members", members);
  };
  const updateInstrument = (key, i, ii, field, val) => {
    const t = templates.find((tt) => tt.key === key);
    const members = [...(t.data.band_members || [])];
    const instruments = [...getInstruments(members[i])];
    instruments[ii] = { ...instruments[ii], [field]: val };
    members[i] = { ...members[i], instruments };
    setData(key, "band_members", members);
  };
  const removeInstrument = (key, i, ii) => {
    const t = templates.find((tt) => tt.key === key);
    const members = [...(t.data.band_members || [])];
    members[i] = { ...members[i], instruments: getInstruments(members[i]).filter((_, idx) => idx !== ii) };
    setData(key, "band_members", members);
  };
  const removeGenreTag = (key, tag) => {
    const t = templates.find((tt) => tt.key === key);
    setData(key, "genre_tags", (t.data.genre_tags || []).filter((g) => g !== tag));
  };
  const getActiveNotes = (key) => {
    const t = templates.find((tt) => tt.key === key);
    const target = notesTargets[key] ?? "__general__";
    return target === "__general__" ? t.data.general_notes || "" : (t.data.band_members?.[target]?.notes || "");
  };
  const setActiveNotes = (key, val) => {
    const target = notesTargets[key] ?? "__general__";
    if (target === "__general__") setData(key, "general_notes", val);
    else updateMember(key, target, "notes", val);
  };

  const uploadFileToBucket = async (file) => {
    const filePath = `saved_templates/${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("stage-plots").upload(filePath, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("stage-plots").getPublicUrl(filePath);
    return urlData.publicUrl;
  };
  const handleStagePlotUpload = async (key, e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const file_url = await uploadFileToBucket(file);
        const isImage = file.type.startsWith("image/");
        setTemplate(key, (t) => ({
          ...t,
          data: {
            ...t.data,
            stage_plot_url: isImage && !t.data.stage_plot_url ? file_url : t.data.stage_plot_url,
            stage_plot_files: [...(t.data.stage_plot_files || []), { url: file_url, name: file.name, type: file.type }],
          },
        }));
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };
  const removeStagePlotFile = (key, i) => {
    const t = templates.find((tt) => tt.key === key);
    setData(key, "stage_plot_files", (t.data.stage_plot_files || []).filter((_, idx) => idx !== i));
  };

  const saveTemplate = async (key) => {
    const t = templates.find((tt) => tt.key === key);
    if (!t || !user) return;
    if (!t.name.trim()) {
      toast({ title: `Give this ${t.category} template a name first`, variant: "destructive" });
      return;
    }
    setTemplate(key, { saving: true });
    let finalKey = key;
    try {
      if (t.id) {
        const { error } = await supabase
          .from("saved_templates")
          .update({ name: t.name.trim(), data: t.data, updated_at: new Date().toISOString() })
          .eq("id", t.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("saved_templates")
          .insert({ owner_id: user.id, category: t.category, name: t.name.trim(), data: t.data })
          .select()
          .single();
        if (error) throw error;
        finalKey = `id:${inserted.id}`;
        setTemplate(key, { id: inserted.id, key: finalKey });
        // Move the notesTarget bookkeeping over to the new key
        setNotesTargets((prev) => {
          const { [key]: val, ...rest } = prev;
          return { ...rest, [finalKey]: val ?? "__general__" };
        });
      }
      setTemplate(finalKey, { saved: true, saving: false });
      setTimeout(() => setTemplate(finalKey, { saved: false }), 2000);
      toast({ title: "Template saved" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error saving template", variant: "destructive" });
      setTemplate(key, { saving: false });
    }
  };

  const deleteTemplate = async (key) => {
    const t = templates.find((tt) => tt.key === key);
    if (!t) return;
    try {
      if (t.id) {
        const { error } = await supabase.from("saved_templates").delete().eq("id", t.id);
        if (error) throw error;
      }
      setTemplates((prev) => prev.filter((tt) => tt.key !== key));
      setConfirmDeleteKey(null);
      toast({ title: "Template deleted" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error deleting template", variant: "destructive" });
    }
  };

  const summaryLine = (t) => {
    if (t.category === "venue") {
      const parts = [[t.data.city, t.data.state].filter(Boolean).join(", "), t.data.console].filter(Boolean);
      return parts.join(" · ");
    }
    const parts = [(t.data.genre_tags || []).join(", "), t.data.band_members?.length ? `${t.data.band_members.length} member${t.data.band_members.length !== 1 ? "s" : ""}` : ""].filter(Boolean);
    return parts.join(" · ");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">My Templates</h1>
            <p className="text-white/40 text-xs">Save venue and artist info once, reuse it every time you're back</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-6">
        {["venue", "artist"].map((category) => {
          const style = GROUP_STYLE[category];
          const list = templates.filter((t) => t.category === category);
          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <style.icon className="w-4 h-4" style={{ color: style.color }} />
                  <p className="font-semibold text-sm" style={{ color: style.color }}>{style.label}</p>
                </div>
                <button
                  onClick={() => addTemplate(category)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors"
                  style={{ borderColor: style.color + "50", color: style.color, backgroundColor: style.color + "12" }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              {list.length === 0 && (
                <p className="text-white/25 text-xs px-1">
                  {category === "venue"
                    ? "No venue templates yet. Save one for a room you work often, even if it doesn't use ShowPilot."
                    : "No artist templates yet. Save one for a band you work with repeatedly."}
                </p>
              )}

              <div className="space-y-2.5">
                {list.map((t) => (
                  <div key={t.key} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: style.color + "50" }}>
                    <button
                      type="button"
                      onClick={() => toggleOpen(t.key)}
                      className="w-full flex items-center justify-between gap-2 p-3.5"
                      style={{ backgroundColor: style.color + "10" }}
                    >
                      <div className="min-w-0 text-left">
                        <p className="font-semibold text-sm text-white truncate">{t.name || `Untitled ${category === "venue" ? "venue" : "artist"}`}</p>
                        {!t.open && summaryLine(t) && <p className="text-white/35 text-xs truncate mt-0.5">{summaryLine(t)}</p>}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-white/40 transition-transform shrink-0 ${t.open ? "rotate-180" : ""}`} />
                    </button>

                    {t.open && (
                      <div className="p-4 space-y-3 bg-[#161616]">
                        <div>
                          <Label className="text-white/50 text-xs">{category === "venue" ? "Venue Name" : "Artist / Group Name"}</Label>
                          <Input
                            value={t.name}
                            onChange={(e) => setTemplate(t.key, { name: e.target.value })}
                            className="mt-1 bg-[#111] border-[#222] text-white"
                            placeholder={category === "venue" ? "e.g. The Fillmore" : "e.g. Rolling Stones"}
                          />
                        </div>

                        {category === "venue" ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-white/50 text-xs">City</Label>
                                <Input value={t.data.city || ""} onChange={(e) => setData(t.key, "city", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="City" />
                              </div>
                              <div>
                                <Label className="text-white/50 text-xs">State</Label>
                                <Input value={t.data.state || ""} onChange={(e) => setData(t.key, "state", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="State" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-white/50 text-xs flex items-center gap-1"><Wifi className="w-3 h-3" /> WiFi Network</Label>
                                <Input value={t.data.wifi_network || ""} onChange={(e) => setData(t.key, "wifi_network", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Network name" />
                              </div>
                              <div>
                                <Label className="text-white/50 text-xs">WiFi Password</Label>
                                <Input value={t.data.wifi_password || ""} onChange={(e) => setData(t.key, "wifi_password", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Password" />
                              </div>
                            </div>
                            <div>
                              <Label className="text-white/50 text-xs">Console</Label>
                              <Input value={t.data.console || ""} onChange={(e) => setData(t.key, "console", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="e.g. Yamaha CL5" />
                            </div>
                            <div>
                              <Label className="text-white/50 text-xs">Power Notes</Label>
                              <Textarea value={t.data.power_notes || ""} onChange={(e) => setData(t.key, "power_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Power availability, circuits, etc." />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <Label className="text-white/50 text-xs">Genre / Style</Label>
                              <div className="mt-1 flex flex-wrap gap-1.5 items-center bg-[#111] border border-[#222] rounded-lg px-2.5 py-2">
                                {(t.data.genre_tags || []).map((tag) => (
                                  <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#8CFF3D]/15 text-[#8CFF3D]">
                                    {tag}
                                    <button type="button" onClick={() => removeGenreTag(t.key, tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                  </span>
                                ))}
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const trimmed = (genreInputs[t.key] || "").trim();
                                    if (trimmed && !(t.data.genre_tags || []).includes(trimmed)) {
                                      setData(t.key, "genre_tags", [...(t.data.genre_tags || []), trimmed]);
                                    }
                                    setGenreInputs((prev) => ({ ...prev, [t.key]: "" }));
                                  }}
                                  className="flex-1 min-w-[100px]"
                                >
                                  <input
                                    value={genreInputs[t.key] || ""}
                                    onChange={(e) => setGenreInputs((prev) => ({ ...prev, [t.key]: e.target.value }))}
                                    placeholder={(t.data.genre_tags || []).length === 0 ? "Type a genre, hit Enter..." : "Add another..."}
                                    className="w-full bg-transparent text-white text-sm outline-none placeholder:text-white/25"
                                  />
                                </form>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <Label className="text-white/50 text-xs">Band Members</Label>
                                <button type="button" onClick={() => addMember(t.key)} className="flex items-center gap-1 text-[#8CFF3D] text-xs font-semibold hover:bg-[#8CFF3D]/10 px-2 py-1 rounded-lg">
                                  <Plus className="w-3.5 h-3.5" /> Add Member
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(t.data.band_members || []).map((m, i) => {
                                  const memberKey = `${t.key}:${i}`;
                                  const collapsed = collapsedMembers[memberKey];
                                  const summary = memberSummary(m);
                                  return (
                                  <div key={i} className="bg-[#111] rounded-xl p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={() => setCollapsedMembers((prev) => ({ ...prev, [memberKey]: !prev[memberKey] }))} className="p-1 -ml-1 text-white/30 hover:text-white/60 shrink-0">
                                        <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                                      </button>
                                      <Input value={m.name} onChange={(e) => updateMember(t.key, i, "name", e.target.value)} placeholder="Name" className="flex-1 h-8 bg-transparent border-[#222] text-white text-sm" />
                                      <button onClick={() => removeMember(t.key, i)} className="p-1.5 text-white/30 hover:text-red-400">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    {collapsed ? (
                                      summary && <p className="text-white/30 text-xs pl-7 truncate">{summary}</p>
                                    ) : (
                                      <>
                                    <div className="space-y-1.5">
                                      <Label className="text-white/30 text-[10px] uppercase tracking-widest font-medium">Instruments / Roles</Label>
                                      {getInstruments(m).map((inst, ii) => (
                                        <div key={ii} className="flex items-center gap-1.5">
                                          <Input
                                            value={inst.name}
                                            onChange={(e) => updateInstrument(t.key, i, ii, "name", e.target.value)}
                                            placeholder="e.g. Guitar"
                                            className="flex-1 h-8 bg-[#1a1a1a] border-[#222] text-white text-sm"
                                          />
                                          <div className="flex items-center gap-1 shrink-0">
                                            {["Mic", "DI"].map((type) => {
                                              const active = (inst.mic_di || "Mic") === type;
                                              return (
                                                <button
                                                  key={type}
                                                  onClick={() => updateInstrument(t.key, i, ii, "mic_di", type)}
                                                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition-all ${active ? "border-blue-400/50 text-blue-400 bg-blue-500/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                                                >
                                                  {type}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <button
                                            onClick={() => updateInstrument(t.key, i, ii, "phantom_power", !inst.phantom_power)}
                                            className={`h-8 px-2.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${inst.phantom_power ? "border-amber-400/50 text-amber-400 bg-amber-500/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                                          >
                                            +48V
                                          </button>
                                          <button onClick={() => removeInstrument(t.key, i, ii)} className="p-1.5 text-white/30 hover:text-red-400 shrink-0">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ))}
                                      <Button variant="ghost" size="sm" onClick={() => addInstrument(t.key, i)} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full h-8 text-xs">
                                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Instrument
                                      </Button>
                                    </div>
                                    <div className="flex gap-3 pl-0.5">
                                      {["IEM", "Monitor"].map((type) => (
                                        <button
                                          key={type}
                                          onClick={() => updateMember(t.key, i, "bus_type", m.bus_type === type ? "" : type)}
                                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${m.bus_type === type ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                                        >
                                          {type}
                                        </button>
                                      ))}
                                    </div>
                                      </>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <Label className="text-white/50 text-xs mb-2 block">Stage Plot</Label>
                              <label className="flex items-center justify-center gap-2 border border-dashed border-[#333] rounded-xl py-3 text-white/50 text-sm cursor-pointer hover:border-[#8CFF3D]/40 hover:text-white/70 transition-colors">
                                <Paperclip className="w-4 h-4" />
                                Upload stage plot (image or PDF)
                                <input type="file" accept="image/*,.pdf" multiple onChange={(e) => handleStagePlotUpload(t.key, e)} className="hidden" />
                              </label>
                              {(t.data.stage_plot_files || []).length > 0 && (
                                <div className="space-y-1.5 mt-2">
                                  {t.data.stage_plot_files.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2">
                                      <span className="text-white/70 text-xs truncate">{f.name}</span>
                                      <button type="button" onClick={() => removeStagePlotFile(t.key, i)} className="text-white/30 hover:text-red-400 shrink-0 ml-2">
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <Label className="text-white/50 text-xs mb-2 block">Notes</Label>
                              <Textarea value={getActiveNotes(t.key)} onChange={(e) => setActiveNotes(t.key, e.target.value)} className="bg-[#111] border-[#222] text-white min-h-[70px]" placeholder="Anything you always want to remember about this act..." />
                              {(t.data.band_members || []).length > 0 && (
                                <div className="flex gap-1.5 flex-wrap mt-2">
                                  <button
                                    type="button"
                                    onClick={() => setNotesTargets((prev) => ({ ...prev, [t.key]: "__general__" }))}
                                    className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${(notesTargets[t.key] ?? "__general__") === "__general__" ? "text-[#8CFF3D] bg-[#8CFF3D]/10 border-[#8CFF3D]/40" : "text-white/30 border-transparent hover:text-white/50"}`}
                                  >
                                    General
                                  </button>
                                  {t.data.band_members.map((m, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setNotesTargets((prev) => ({ ...prev, [t.key]: i }))}
                                      className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${notesTargets[t.key] === i ? "text-[#8CFF3D] bg-[#8CFF3D]/10 border-[#8CFF3D]/40" : "text-white/30 border-transparent hover:text-white/50"}`}
                                    >
                                      {m.name || `Member ${i + 1}`}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <Button onClick={() => saveTemplate(t.key)} disabled={t.saving} className="flex-1 bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e] rounded-xl">
                            {t.saving ? "Saving..." : t.saved ? "Saved ✓" : "Save Template"}
                          </Button>
                          {confirmDeleteKey === t.key ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => deleteTemplate(t.key)} className="text-xs font-semibold px-3 py-2 rounded-xl bg-red-500/20 text-red-400">Confirm</button>
                              <button onClick={() => setConfirmDeleteKey(null)} className="text-xs font-semibold px-3 py-2 rounded-xl bg-white/5 text-white/50">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteKey(t.key)} className="p-2.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
