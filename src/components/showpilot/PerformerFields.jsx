import React, { useState } from "react";
import VocalsQuestion, { isVocalInput, memberSings, setMemberVocals } from "@/components/showpilot/VocalsQuestion";
import { Trash2, Plus, ChevronDown, Settings, Paperclip, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import VenuePhoto from "@/components/showpilot/VenuePhoto";
import StageEditor from "@/components/showpilot/StageEditor";
import { useMyStageColors } from "@/components/showpilot/StagePlotView";

// The Performer (artist) fields, shared by a show's act (ShowDetail) and a
// saved artist template (My Templates) so both ask for exactly the same
// things. The lineup controls (Opener / Headliner, order) stay on the show,
// since they're about that night, not the act.
//
// `band` is the act: band_name, set_length_minutes, genre_tags (+ legacy
// genre_tag / genre_color), band_members [{ name, instruments: [{ name,
// mic_di, phantom_power }], bus_type }], stage_plot_url, stage_plot_files,
// general_notes, artist_fx_notes [{ artist_name, notes }].
// `onPatch(patch)` merges changes into it.

export const getInstruments = (m) => {
  if (m?.instruments) return m.instruments;
  if (m?.instrument) return [{ name: m.instrument, phantom_power: !!m.phantom_power, mic_di: "Mic" }];
  return [];
};

export default function PerformerFields({
  band,
  onPatch,
  nameAction = null,     // e.g. Load Artist
  withPhoto = true,      // false hides the artist photo (tech phone event page, job 148)
  setLengthAction = null, // beside Set Length, e.g. the act's FX / Artist Notes button (job 205)
  afterName = null,      // show-only bits (submitted by, requested order)
  genreTags = [],        // the person's genre list [{ name, color }]
  onAddGenre,            // "+" beside Genre / Tag
  onAddGenreFromTag,     // tap a genre that isn't on their list yet
  iemMonitorColors = { IEM: "#EAB308", Monitor: "#F97316" },
  onBusSettings,         // gear beside IEM / Monitor
  onStagePlotUpload,     // (event) => parent uploads and adds the files
  showNotes = false,     // the notes block (on a show these live in FX / Artist Notes)
  membersSlot = null,    // shown instead of the stage editor (My Templates passes its own, job 254)
  stagePlotExtra = null, // under the Stage Plot uploads (My Templates: make / save the PDF, job 254)
}) {
  const b = band || {};
  const members = b.band_members || [];
  const stageColors = useMyStageColors();
  const [collapsed, setCollapsed] = useState({}); // index -> false when open
  const [notesTarget, setNotesTarget] = useState("__general__");

  const setMembers = (list) => onPatch({ band_members: list });
  const updateMember = (i, f, v) => { const m = [...members]; m[i] = { ...m[i], [f]: v }; setMembers(m); };
  const addMember = () => setMembers([...members, { name: "", instrument: "", bus_color: "", bus_type: "", channels_needed: "", phantom_power: false }]);
  const removeMember = (i) => {
    const removedName = members[i]?.name;
    const patch = { band_members: members.filter((_, idx) => idx !== i) };
    if (removedName) patch.artist_fx_notes = (b.artist_fx_notes || []).filter((n) => n.artist_name !== removedName);
    onPatch(patch);
    if (notesTarget !== "__general__") setNotesTarget("__general__");
  };
  const addInstrument = (i) => { const m = [...members]; m[i] = { ...m[i], instruments: [...getInstruments(m[i]), { name: "", phantom_power: false, mic_di: "" }] }; setMembers(m); };
  const updateInstrument = (i, ii, f, v) => {
    const m = [...members];
    const inst = [...getInstruments(m[i])];
    inst[ii] = { ...inst[ii], [f]: v };
    m[i] = { ...m[i], instruments: inst };
    setMembers(m);
  };
  // Vocals? Yes / No per member, as on the intake forms (job 153).
  const setVocals = (i, yes) => { const m = [...members]; m[i] = setMemberVocals(m[i], getInstruments(m[i]), yes); setMembers(m); };
  const removeInstrument = (i, ii) => { const m = [...members]; m[i] = { ...m[i], instruments: getInstruments(m[i]).filter((_, idx) => idx !== ii) }; setMembers(m); };

  const selectedGenres = b.genre_tags || (b.genre_tag ? [b.genre_tag] : []);
  const [genreOpen, setGenreOpen] = useState(false);
  const toggleGenre = (tag) => {
    const on = selectedGenres.includes(tag.name);
    const next = on ? selectedGenres.filter((t) => t !== tag.name) : [...selectedGenres, tag.name];
    onPatch({ genre_tags: next, genre_tag: next[0] || "", genre_color: next.length > 0 ? tag.color : "" });
  };

  const noteFor = (target) => (target === "__general__"
    ? b.general_notes || ""
    : (b.artist_fx_notes || []).find((n) => n.artist_name === target)?.notes || "");
  const setNote = (target, notes) => {
    if (target === "__general__") { onPatch({ general_notes: notes }); return; }
    const list = [...(b.artist_fx_notes || [])];
    const idx = list.findIndex((n) => n.artist_name === target);
    if (idx >= 0) list[idx] = { ...list[idx], notes }; else list.push({ artist_name: target, notes });
    onPatch({ artist_fx_notes: list });
  };

  return (
    <div className="space-y-3">
      {withPhoto && <VenuePhoto kind="artist" accent="#EF4444" value={b.photo_url || ""} onChange={(url) => onPatch({ photo_url: url })} />}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-white/50 text-xs">Artist / Group Name *</Label>
          {nameAction}
        </div>
        <Input value={b.band_name || ""} onChange={(e) => onPatch({ band_name: e.target.value })} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Artist" />
      </div>
      {afterName}
      <div>
        <Label className="text-white/50 text-xs">Set Length (minutes)</Label>
        <div className="mt-1 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={b.set_length_minutes ?? ""}
            onChange={(e) => onPatch({ set_length_minutes: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="e.g. 90"
            className="bg-[#111] border-[#222] text-white w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {setLengthAction}
        </div>
      </div>
      {/* Genre / Tag is a dropdown (job 270): closed, it shows what's picked. */}
      <div className="rounded-xl border border-[#222] bg-[#111]">
        <button type="button" onClick={() => setGenreOpen((o) => !o)} aria-expanded={genreOpen} className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2 text-left">
          <span className="text-white/50 text-xs shrink-0">Genre / Tag</span>
          <span className="flex-1 min-w-0 flex flex-wrap gap-1.5">
            {selectedGenres.map((name) => {
              const c = genreTags.find((t) => t.name === name)?.color || "#9CA3AF";
              return <span key={name} className="px-2.5 py-1 rounded-full text-xs font-medium border border-white/25" style={{ backgroundColor: c + "22", color: c }}>{name}</span>;
            })}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-white/40 transition-transform ${genreOpen ? "rotate-180" : ""}`} />
        </button>
        {genreOpen && (
        <div className="px-3 pb-3">
        {onAddGenre && (
          <div className="flex justify-end mb-1">
            <button type="button" onClick={onAddGenre} className="text-white/40 hover:text-[#8CFF3D] text-xs flex items-center gap-1 p-1" aria-label="Add a genre">
              <Plus className="w-3.5 h-3.5" />Add a genre
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {genreTags.map((tag) => {
            const isSelected = selectedGenres.includes(tag.name);
            return (
              <button
                key={tag.name}
                type="button"
                onClick={() => toggleGenre(tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${isSelected ? "border-white/40 scale-105" : "border-transparent opacity-70 hover:opacity-100"}`}
                style={{ backgroundColor: tag.color + "22", color: tag.color }}
              >
                {tag.name}
              </button>
            );
          })}
          {selectedGenres.filter((name) => !genreTags.some((t) => t.name === name)).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onAddGenreFromTag?.(name)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-white/25 text-white/50 hover:text-white/80 hover:border-white/40 transition-all"
              title="Not on your genre list yet - tap to add it and pick a color"
            >
              {name}
            </button>
          ))}
        </div>
        </div>
        )}
      </div>

      {/* Members are built on the stage (job 267): who stands where and what
          they play, instead of the old list of member rows. */}
      <div className="border-t border-[#222] pt-3">
        {membersSlot || (
          <StageEditor
            members={members}
            setMembers={setMembers}
            getInstruments={getInstruments}
            colors={stageColors}
            onRemoveMember={(i) => setMembers(members.filter((_, k) => k !== i))}
            busColors={iemMonitorColors}
            onBusSettings={onBusSettings}
          />
        )}
      </div>

      <div className="border-t border-[#222] pt-3">
        <Label className="text-white/30 text-[10px] uppercase tracking-widest font-medium block mb-2">Stage Plot</Label>
        {(b.stage_plot_files || []).length > 0 && (
          <div className="space-y-2 mb-3">
            {(b.stage_plot_files || []).map((f, i) => (
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
                <button type="button" onClick={() => onPatch({ stage_plot_files: (b.stage_plot_files || []).filter((_, idx) => idx !== i) })} className="p-1 text-white/30 hover:text-red-400" aria-label="Remove file"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-3 py-4 border-2 border-dashed border-[#222] rounded-xl cursor-pointer hover:border-[#8CFF3D]/30 transition-colors px-4">
          <Paperclip className="w-5 h-5 text-white/30" />
          <span className="text-sm text-white/40">Upload images or files</span>
          <input type="file" accept="image/*,.pdf,.png,.jpg,.jpeg" multiple className="hidden" onChange={onStagePlotUpload} />
        </label>
        {stagePlotExtra && <div className="mt-3">{stagePlotExtra}</div>}
      </div>

      {showNotes && (
        <div className="border-t border-[#222] pt-3">
          <Label className="text-white/30 text-[10px] uppercase tracking-widest font-medium block mb-2">FX / Artist Notes</Label>
          {members.some((m) => m.name) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {["__general__", ...members.map((m) => m.name).filter(Boolean)].map((target) => {
                const on = notesTarget === target;
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setNotesTarget(target)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${on ? "text-[#8CFF3D] bg-[#8CFF3D]/10 border-[#8CFF3D]/40" : "text-white/30 border-transparent hover:text-white/50"}`}
                  >
                    {target === "__general__" ? "General" : target}{noteFor(target) ? " ●" : ""}
                  </button>
                );
              })}
            </div>
          )}
          <Textarea value={noteFor(notesTarget)} onChange={(e) => setNote(notesTarget, e.target.value)} className="bg-[#111] border-[#222] text-white min-h-[70px]" placeholder={notesTarget === "__general__" ? "General notes for this act..." : `Notes for ${notesTarget}...`} />
        </div>
      )}
    </div>
  );
}
