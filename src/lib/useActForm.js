import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { setMemberVocals } from "@/components/showpilot/VocalsQuestion";
import { formatPhoneNumber } from "@/components/showpilot/VenueInfoFields";

// The act-form helpers the intake circles (IntakeFields) expect, as one hook
// (job 246). Same behaviour as the intake pages: members with instruments,
// vocals yes / no, stage plot files, notes per member, genre tags.
// `form` / `setForm` are the caller's state; `uploadPrefix` is the folder in
// the stage-plots bucket.
export function useActForm(form, setForm, uploadPrefix) {
  const [genreInput, setGenreInput] = useState("");
  const [notesTarget, setNotesTarget] = useState("__general__");
  const update = (field, val) => setForm((s) => ({ ...s, [field]: val }));
  const members = form.band_members || [];

  const getInstruments = (m) => {
    if (m.instruments) return m.instruments;
    if (m.instrument) return [{ name: m.instrument, phantom_power: !!m.phantom_power, mic_di: "Mic" }];
    return [];
  };
  const setMembers = (next) => update("band_members", next);
  const addMember = () => setMembers([...members, { name: "", instrument: "", bus_type: "", notes: "" }]);
  const updateMember = (i, f, v) => { const m = [...members]; m[i] = { ...m[i], [f]: v }; setMembers(m); };
  const removeMember = (i) => { setMembers(members.filter((_, idx) => idx !== i)); setNotesTarget("__general__"); };
  const addInstrument = (i) => {
    const m = [...members];
    m[i] = { ...m[i], instruments: [...getInstruments(m[i]), { name: "", phantom_power: false, mic_di: "" }] };
    setMembers(m);
  };
  const updateInstrument = (i, ii, f, v) => {
    const m = [...members];
    const ins = [...getInstruments(m[i])];
    ins[ii] = { ...ins[ii], [f]: v };
    m[i] = { ...m[i], instruments: ins };
    setMembers(m);
  };
  const removeInstrument = (i, ii) => {
    const m = [...members];
    m[i] = { ...m[i], instruments: getInstruments(m[i]).filter((_, idx) => idx !== ii) };
    setMembers(m);
  };
  const setVocals = (i, yes) => {
    const m = [...members];
    m[i] = setMemberVocals(m[i], getInstruments(m[i]), yes);
    setMembers(m);
  };

  const uploadFile = async (file, bucket = "stage-plots") => {
    const path = `${uploadPrefix}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) throw error;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };
  const handleStagePlotUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const url = await uploadFile(file);
        const isImage = file.type.startsWith("image/");
        setForm((prev) => ({
          ...prev,
          stage_plot_url: isImage && !prev.stage_plot_url ? url : prev.stage_plot_url,
          stage_plot_files: [...(prev.stage_plot_files || []), { url, name: file.name, type: file.type }],
        }));
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };
  const removeStagePlotFile = (i) => setForm((prev) => ({ ...prev, stage_plot_files: (prev.stage_plot_files || []).filter((_, idx) => idx !== i) }));

  const getActiveNotes = () => (notesTarget === "__general__" ? form.general_notes : members[notesTarget]?.notes || "");
  const setActiveNotes = (val) => (notesTarget === "__general__" ? update("general_notes", val) : updateMember(notesTarget, "notes", val));
  const removeGenreTag = (tag) => update("genre_tags", (form.genre_tags || []).filter((t) => t !== tag));

  return {
    form, update, genreInput, setGenreInput, removeGenreTag,
    getInstruments, addMember, updateMember, removeMember, addInstrument, updateInstrument, removeInstrument, setVocals,
    handleStagePlotUpload, removeStagePlotFile, uploadFile,
    notesTarget, setNotesTarget, getActiveNotes, setActiveNotes,
    formatPhone: formatPhoneNumber,
  };
}
