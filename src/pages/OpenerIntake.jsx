import React, { useState, useEffect } from "react";
import { usePersistedState, clearPersistedState } from "@/hooks/usePersistedState";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Send, CheckCircle, Music, X, Paperclip } from "lucide-react";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";

const ROLE_COLORS = {
  Headliner: { border: "border-blue-400/40", activeBorder: "border-blue-400", text: "text-blue-400", bg: "bg-blue-500/10" },
  Opener: { border: "border-[#8CFF3D]/40", activeBorder: "border-[#8CFF3D]", text: "text-[#8CFF3D]", bg: "bg-[#8CFF3D]/10" },
  "Performer/Group": { border: "border-purple-400/40", activeBorder: "border-purple-400", text: "text-purple-400", bg: "bg-purple-500/10" },
  "N/A": { border: "border-white/20", activeBorder: "border-white", text: "text-white", bg: "bg-white/15" },
};
const ROLE_OPTIONS = ["Opener", "Headliner", "Performer/Group", "N/A"];

export default function OpenerIntake() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [context, setContext] = useState(null);
  const [loadingView, setLoadingView] = useState(true);
  const [form, setForm] = usePersistedState(`opener_intake_draft_${token}`, {
    role: "Opener",
    band_name: "",
    genre_tags: [],
    band_members: [],
    set_length_minutes: "",
    general_notes: "",
    stage_plot_url: "",
    stage_plot_files: [],
  });
  const [genreInput, setGenreInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (!token) { setLoadingView(false); return; }
      try {
        const { data } = await supabase
          .from("opener_requests")
          .select("*, tour_manager_requests(band_name, venue, date, location)")
          .eq("invite_token", token)
          .maybeSingle();
        if (data) setContext(data);
      } catch (e) {
        console.error(e);
      }
      setLoadingView(false);
    };
    init();
  }, [token]);

  const update = (field, val) => setForm((s) => ({ ...s, [field]: val }));
  const uploadFileToBucket = async (file, bucket) => {
    const filePath = `intake_${token}/${Date.now()}_${file.name}`;
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
        setForm((prev) => ({
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
    setForm((prev) => ({
      ...prev,
      stage_plot_files: (prev.stage_plot_files || []).filter((_, idx) => idx !== i),
    }));
  };

  const addMember = () => update("band_members", [...form.band_members, { name: "", instrument: "", bus_type: "", notes: "" }]);
  const updateMember = (i, f, v) => { const m = [...form.band_members]; m[i] = { ...m[i], [f]: v }; update("band_members", m); };
  const removeMember = (i) => {
    update("band_members", form.band_members.filter((_, idx) => idx !== i));
    setNotesTarget("__general__");
  };
  const [notesTarget, setNotesTarget] = useState("__general__");
  const getActiveNotes = () => notesTarget === "__general__" ? form.general_notes : (form.band_members[notesTarget]?.notes || "");
  const setActiveNotes = (val) => notesTarget === "__general__" ? update("general_notes", val) : updateMember(notesTarget, "notes", val);

  const getInstruments = (m) => {
    if (m.instruments) return m.instruments;
    if (m.instrument) return [{ name: m.instrument, phantom_power: !!m.phantom_power, mic_di: "Mic" }];
    return [];
  };
  const addInstrument = (i) => {
    const members = [...form.band_members];
    const current = getInstruments(members[i]);
    members[i] = { ...members[i], instruments: [...current, { name: "", phantom_power: false, mic_di: "Mic" }] };
    update("band_members", members);
  };
  const updateInstrument = (i, ii, f, v) => {
    const members = [...form.band_members];
    const instruments = [...getInstruments(members[i])];
    instruments[ii] = { ...instruments[ii], [f]: v };
    members[i] = { ...members[i], instruments };
    update("band_members", members);
  };
  const removeInstrument = (i, ii) => {
    const members = [...form.band_members];
    const instruments = getInstruments(members[i]).filter((_, idx) => idx !== ii);
    members[i] = { ...members[i], instruments };
    update("band_members", members);
  };

  const handleGenreInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = genreInput.trim();
      if (trimmed && !form.genre_tags.includes(trimmed)) update("genre_tags", [...form.genre_tags, trimmed]);
      setGenreInput("");
    } else if (e.key === "Backspace" && !genreInput && form.genre_tags.length > 0) {
      update("genre_tags", form.genre_tags.slice(0, -1));
    }
  };
  const removeGenreTag = (tag) => update("genre_tags", form.genre_tags.filter((t) => t !== tag));

  const handleSubmit = async () => {
    if (!form.band_name) {
      setError("Artist / group name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc("submit_opener_request", {
        p_token: token,
        p_form: form,
      });
      if (rpcError) throw rpcError;
      clearPersistedState(`opener_intake_draft_${token}`);
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  if (loadingView) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (!token || !context) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Invalid link</p>
          <p className="text-white/30 text-sm">This intake link is not valid.</p>
        </div>
      </div>
    );
  }

  if (submitted || context.status === "submitted") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-16 h-16 text-[#8CFF3D] mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">Submitted!</h2>
          <p className="text-white/50 text-sm">Your set info has been added to the gig.</p>
        </div>
      </div>
    );
  }

  const parent = context.tour_manager_requests;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#8CFF3D]/10 flex items-center justify-center">
              <Music className="w-4 h-4 text-[#8CFF3D]" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Set Info</h1>
              <p className="text-white/40 text-xs">
                {parent?.band_name ? `Joining ${parent.band_name}` : "Submitting your set info"}
                {parent?.venue ? ` · ${parent.venue}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <p className="text-white/40 text-xs pb-1">
          Fill in your act's info below — this will be added to the gig{parent?.date ? ` on ${parent.date}` : ""}{parent?.location ? ` at ${parent.location}` : ""}. No need to re-enter venue or date details.
        </p>

        <div className="bg-[#111] rounded-2xl p-4 space-y-3">
          <div>
            <Label className="text-white/50 text-xs mb-2 block">Your Role</Label>
            <div className="flex gap-1 flex-wrap">
              {ROLE_OPTIONS.map((r) => {
                const colors = ROLE_COLORS[r];
                const active = form.role === r;
                return (
                  <button
                    key={r}
                    onClick={() => update("role", r)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border transition-all ${active ? `${colors.text} ${colors.bg} ${colors.border}` : "text-white/30 border-transparent hover:text-white/50"}`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="text-white/50 text-xs">Artist / Group Name *</Label>
            <Input value={form.band_name} onChange={(e) => update("band_name", e.target.value)} className="mt-1 bg-[#0d0d0d] border-[#222] text-white" placeholder="Band / Artist" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Set Length (minutes)</Label>
            <Input
              type="number"
              value={form.set_length_minutes}
              onChange={(e) => update("set_length_minutes", e.target.value)}
              className="mt-1 bg-[#0d0d0d] border-[#222] text-white w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="e.g. 30"
            />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Genre / Style</Label>
            <div className="mt-1 flex flex-wrap gap-1.5 p-2 bg-[#0d0d0d] border border-[#222] rounded-lg min-h-[42px]">
              {form.genre_tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#8CFF3D]/15 text-[#8CFF3D]">
                  {tag}
                  <button type="button" onClick={() => removeGenreTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <input
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={handleGenreInputKeyDown}
                placeholder={form.genre_tags.length === 0 ? "Type a genre, hit Enter..." : "Add another..."}
                className="flex-1 min-w-[100px] bg-transparent text-white text-sm outline-none placeholder:text-white/25"
              />
            </div>
          </div>
        </div>

        <CollapsibleSection title="Band Members" icon={Music} badge={form.band_members.length} defaultOpen={true}>
          <div className="space-y-3 pt-3">
            {form.band_members.map((m, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" className="flex-1 h-8 bg-transparent border-[#222] text-white text-sm" />
                  <button onClick={() => removeMember(i)} className="p-1.5 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
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
              </div>
            ))}
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
            {(form.stage_plot_files || []).length > 0 && (
              <div className="space-y-1.5 mt-2">
                {form.stage_plot_files.map((f, i) => (
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
          <Textarea value={getActiveNotes()} onChange={(e) => setActiveNotes(e.target.value)} className="bg-[#0d0d0d] border-[#222] text-white min-h-[80px]" placeholder="Anything else the engineer should know..." />
          <div className="flex gap-1.5 flex-wrap mt-2">
            <button
              type="button"
              onClick={() => setNotesTarget("__general__")}
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${notesTarget === "__general__" ? "text-[#8CFF3D] bg-[#8CFF3D]/10 border-[#8CFF3D]/40" : "text-white/30 border-transparent hover:text-white/50"}`}
            >
              General
            </button>
            {form.band_members.map((m, i) => (
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

        {error && <p className="text-red-400 text-sm px-1">{error}</p>}

        <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-12 rounded-xl font-semibold text-base">
          <Send className="w-4 h-4 mr-2" />
          {submitting ? "Submitting..." : "Submit Set Info"}
        </Button>
      </div>
    </div>
  );
}
