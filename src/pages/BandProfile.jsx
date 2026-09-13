import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Plus, Trash2, Paperclip, X, Music, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";
import { useToast } from "@/components/ui/use-toast";

export default function BandProfile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genreInput, setGenreInput] = useState("");
  const [notesTarget, setNotesTarget] = useState("__general__");
  const [collapsedMembers, setCollapsedMembers] = useState({});
  const [template, setTemplate] = useState({
    band_name: "",
    genre_tags: [],
    band_members: [],
    stage_plot_url: "",
    stage_plot_files: [],
    general_notes: "",
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data } = await supabase
          .from("user_preferences")
          .select("band_template")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data && data.band_template) {
          setTemplate((prev) => ({ ...prev, ...data.band_template }));
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const update = (field, val) => setTemplate((t) => ({ ...t, [field]: val }));

  const uploadFileToBucket = async (file, bucket) => {
    const filePath = `band_profile_${user.id}/${Date.now()}_${file.name}`;
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
        setTemplate((prev) => ({
          ...prev,
          stage_plot_url: isImage && !prev.stage_plot_url ? file_url : prev.stage_plot_url,
          stage_plot_files: [...(prev.stage_plot_files || []), { url: file_url, name: file.name, type: file.type }],
        }));
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };

  const removeStagePlotFile = (i) => {
    setTemplate((prev) => ({
      ...prev,
      stage_plot_files: (prev.stage_plot_files || []).filter((_, idx) => idx !== i),
    }));
  };

  const addMember = () => update("band_members", [...template.band_members, { name: "", instrument: "", bus_type: "", notes: "" }]);

  const getInstruments = (m) => {
    if (m.instruments) return m.instruments;
    if (m.instrument) return [{ name: m.instrument, phantom_power: !!m.phantom_power, mic_di: "Mic" }];
    return [];
  };
  const addInstrument = (i) => {
    const members = [...template.band_members];
    const current = getInstruments(members[i]);
    members[i] = { ...members[i], instruments: [...current, { name: "", phantom_power: false, mic_di: "Mic" }] };
    update("band_members", members);
  };
  const updateInstrument = (i, ii, f, v) => {
    const members = [...template.band_members];
    const instruments = [...getInstruments(members[i])];
    instruments[ii] = { ...instruments[ii], [f]: v };
    members[i] = { ...members[i], instruments };
    update("band_members", members);
  };
  const removeInstrument = (i, ii) => {
    const members = [...template.band_members];
    const instruments = getInstruments(members[i]).filter((_, idx) => idx !== ii);
    members[i] = { ...members[i], instruments };
    update("band_members", members);
  };
  const updateMember = (i, f, v) => { const m = [...template.band_members]; m[i] = { ...m[i], [f]: v }; update("band_members", m); };
  const removeMember = (i) => {
    update("band_members", template.band_members.filter((_, idx) => idx !== i));
    setNotesTarget("__general__");
  };
  const getActiveNotes = () => notesTarget === "__general__" ? template.general_notes : (template.band_members[notesTarget]?.notes || "");
  const setActiveNotes = (val) => notesTarget === "__general__" ? update("general_notes", val) : updateMember(notesTarget, "notes", val);

  const removeGenreTag = (tag) => update("genre_tags", template.genre_tags.filter((t) => t !== tag));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, band_template: template }, { onConflict: "user_id" });
      if (error) throw error;
      toast({ title: "Band profile saved" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error saving", variant: "destructive" });
    }
    setSaving(false);
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
            <h1 className="text-lg font-bold text-white">Band Profile</h1>
            <p className="text-white/40 text-xs">Save your info once, load it into any intake form</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <div className="bg-[#111] rounded-2xl p-4 space-y-3">
          <div>
            <Label className="text-white/50 text-xs">Artist / Group Name</Label>
            <Input value={template.band_name} onChange={(e) => update("band_name", e.target.value)} className="mt-1 bg-[#0d0d0d] border-[#222] text-white" placeholder="Band / Artist" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Genre / Style</Label>
            <div className="mt-1 flex flex-wrap gap-1.5 p-2 bg-[#0d0d0d] border border-[#222] rounded-lg min-h-[42px]">
              {template.genre_tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#8CFF3D]/15 text-[#8CFF3D]">
                  {tag}
                  <button type="button" onClick={() => removeGenreTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = genreInput.trim();
                  if (trimmed && !template.genre_tags.includes(trimmed)) {
                    update("genre_tags", [...template.genre_tags, trimmed]);
                  }
                  setGenreInput("");
                }}
                className="flex-1 min-w-[100px]"
              >
                <input
                  value={genreInput}
                  onChange={(e) => setGenreInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !genreInput && template.genre_tags.length > 0) {
                      update("genre_tags", template.genre_tags.slice(0, -1));
                    }
                  }}
                  placeholder={template.genre_tags.length === 0 ? "Type a genre, hit Enter..." : "Add another..."}
                  className="w-full bg-transparent text-white text-sm outline-none placeholder:text-white/25"
                />
              </form>
            </div>
          </div>
        </div>

        <CollapsibleSection title="Band Members" icon={Music} badge={template.band_members.length} defaultOpen={true}>
          <div className="space-y-3 pt-3">
            {template.band_members.map((m, i) => {
              const collapsed = collapsedMembers[i];
              const instrumentSummary = getInstruments(m).map((inst) => inst.name).filter(Boolean).join(", ");
              return (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCollapsedMembers((prev) => ({ ...prev, [i]: !prev[i] }))} className="p-1 -ml-1 text-white/30 hover:text-white/60 shrink-0">
                    <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                  </button>
                  <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" className="flex-1 h-8 bg-transparent border-[#222] text-white text-sm" />
                  <button onClick={() => removeMember(i)} className="p-1.5 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {collapsed ? (
                  instrumentSummary && <p className="text-white/30 text-xs pl-7 truncate">{instrumentSummary}</p>
                ) : (
                  <>
                <div className="space-y-2">
                  <Label className="text-white/30 text-[10px] uppercase tracking-widest font-medium">Instruments / Roles</Label>
                  {getInstruments(m).map((inst, ii) => (
                    <div key={ii} className="flex items-center gap-1.5">
                      <Input
                        value={inst.name}
                        onChange={(e) => updateInstrument(i, ii, "name", e.target.value)}
                        placeholder="e.g. Guitar"
                        className="flex-1 h-8 bg-[#1a1a1a] border-[#222] text-white text-sm"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        {["Mic", "DI"].map((type) => {
                          const active = (inst.mic_di || "Mic") === type;
                          return (
                            <button
                              key={type}
                              onClick={() => updateInstrument(i, ii, "mic_di", type)}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition-all ${active ? "border-blue-400/50 text-blue-400 bg-blue-500/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                            >
                              {type}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => updateInstrument(i, ii, "phantom_power", !inst.phantom_power)}
                        className={`h-8 px-2.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${inst.phantom_power ? "border-amber-400/50 text-amber-400 bg-amber-500/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                      >
                        +48V
                      </button>
                      <button onClick={() => removeInstrument(i, ii)} className="p-1.5 text-white/30 hover:text-red-400 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => addInstrument(i)} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full h-8 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Instrument
                  </Button>
                </div>
                <div className="flex gap-3 pl-0.5">
                  {["IEM", "Monitor"].map((type) => (
                    <button
                      key={type}
                      onClick={() => updateMember(i, "bus_type", m.bus_type === type ? "" : type)}
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
            <Button variant="ghost" size="sm" onClick={addMember} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Member
            </Button>
          </div>
        </CollapsibleSection>

        <div className="bg-[#111] rounded-2xl p-4">
          <Label className="text-white/50 text-xs mb-2 block">Stage Plot</Label>
          <div className="mb-4">
            <label className="flex items-center justify-center gap-2 border border-dashed border-[#333] rounded-xl py-3 text-white/50 text-sm cursor-pointer hover:border-[#8CFF3D]/40 hover:text-white/70 transition-colors">
              <Paperclip className="w-4 h-4" />
              Upload stage plot (image or PDF)
              <input type="file" accept="image/*,.pdf" multiple onChange={handleStagePlotUpload} className="hidden" />
            </label>
            {(template.stage_plot_files || []).length > 0 && (
              <div className="space-y-1.5 mt-2">
                {template.stage_plot_files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2">
                    <span className="text-white/70 text-xs truncate">{f.name}</span>
                    <button type="button" onClick={() => removeStagePlotFile(i)} className="text-white/30 hover:text-red-400 shrink-0 ml-2">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Label className="text-white/50 text-xs mb-2 block">Additional Notes</Label>
          <Textarea value={getActiveNotes()} onChange={(e) => setActiveNotes(e.target.value)} className="bg-[#0d0d0d] border-[#222] text-white min-h-[80px]" placeholder="Anything you always want engineers to know..." />
          <div className="flex gap-1.5 flex-wrap mt-2">
            <button
              type="button"
              onClick={() => setNotesTarget("__general__")}
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${notesTarget === "__general__" ? "text-[#8CFF3D] bg-[#8CFF3D]/10 border-[#8CFF3D]/40" : "text-white/30 border-transparent hover:text-white/50"}`}
            >
              General
            </button>
            {template.band_members.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setNotesTarget(i)}
                className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${notesTarget === i ? "text-[#8CFF3D] bg-[#8CFF3D]/10 border-[#8CFF3D]/40" : "text-white/30 border-transparent hover:text-white/50"}`}
              >
                {m.name || `Member ${i + 1}`}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e] rounded-xl">
          {saving ? "Saving..." : "Save Band Profile"}
        </Button>
      </div>
    </div>
  );
}
