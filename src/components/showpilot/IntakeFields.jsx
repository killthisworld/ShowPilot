import React from "react";
import { X, Paperclip, User } from "lucide-react";
import StagePlotPdfActions from "@/components/showpilot/StagePlotBuilder";
import StageEditor from "@/components/showpilot/StageEditor";
import UploadTemplateButton from "@/components/showpilot/UploadTemplate";

// The parts of the engineers' intake forms (Performer Intake and Opener Set
// Info) as circles on the act's web (job 195). `h` is the form's state and
// helpers from the page (form, update, members / instruments, stage plot,
// notes, genres), so the pages keep their own saving and sending.
const GREEN = "#8CFF3D";
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
const label = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const ROLE_OPTIONS = [["Opener", "Opener"], ["Headliner", "Headliner"], ["Performer/Group", "Performer / group"], ["N/A", "Not sure"]];
const chip = (on) => `min-h-[40px] px-3 rounded-[10px] text-[13px] font-semibold border ${on ? "text-[#0d0d0d]" : "text-white/70 border-[#333]"}`;

function RoleBody({ h }) {
  const { form, update } = h;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {ROLE_OPTIONS.map(([v, text]) => {
          const on = (form.role || "") === v;
          return <button key={v} type="button" onClick={() => update("role", v)} aria-pressed={on} className="min-h-[52px] rounded-[12px] text-[15px] font-bold border" style={on ? { background: `${GREEN}22`, borderColor: GREEN, color: GREEN } : { background: "#101010", borderColor: "#2a2a2a", color: "#fff" }}>{text}</button>;
        })}
      </div>
      <label className="flex flex-col items-center">
        <span className={label}>LINEUP POSITION (IF YOU KNOW IT)</span>
        <input type="number" inputMode="numeric" value={form.requested_order || ""} onChange={(e) => update("requested_order", e.target.value)} placeholder="e.g. 2" className={`${inputCls} !w-[120px] text-center`} />
      </label>
    </div>
  );
}

function ArtistBody({ h }) {
  const { form, update, genreInput, setGenreInput, removeGenreTag } = h;
  const addGenre = () => {
    const t = genreInput.trim();
    if (t && !form.genre_tags.includes(t)) update("genre_tags", [...form.genre_tags, t]);
    setGenreInput("");
  };
  return (
    <div className="flex flex-col gap-3">
      {/* Upload template (job 282): fill the form from one of their templates. */}
      {h.applyTemplate && <UploadTemplateButton onApply={h.applyTemplate} />}
      <label><span className={label}>ARTIST / GROUP NAME *</span>
        <input value={form.band_name} onChange={(e) => update("band_name", e.target.value)} placeholder="Artist" className={inputCls} /></label>
      <label><span className={label}>SET LENGTH (MINUTES)</span>
        <input type="number" inputMode="numeric" value={form.set_length_minutes || ""} onChange={(e) => update("set_length_minutes", e.target.value)} placeholder="e.g. 30" className={`${inputCls} !w-[140px]`} /></label>
      <div>
        <span className={label}>GENRE / STYLE</span>
        <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] min-h-[44px] items-center">
          {form.genre_tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-medium" style={{ background: `${GREEN}22`, color: GREEN }}>
              {tag}<button type="button" onClick={() => removeGenreTag(tag)} aria-label={`Remove ${tag}`} className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <input value={genreInput} onChange={(e) => setGenreInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGenre(); }
              else if (e.key === "Backspace" && !genreInput && form.genre_tags.length) update("genre_tags", form.genre_tags.slice(0, -1));
            }}
            onBlur={addGenre}
            placeholder={form.genre_tags.length ? "Add another…" : "Type a genre, hit Enter"} aria-label="Genre" className="flex-1 min-w-[110px] bg-transparent text-white text-[15px] outline-none placeholder:text-white/30 px-1" />
        </div>
      </div>
    </div>
  );
}

// Members and inputs = "Build your stage" (job 252): add each member on the
// stage with their position, inputs, vocals and monitor; move / swap them.
// The stage plot lives here too (job 254): upload their own, or make one from
// this stage; signed-in artists / managers can save it to My Templates.
function MembersBody({ h }) {
  const { form, update, getInstruments, removeMember, stageColors } = h;
  return (
    <div className="flex flex-col gap-3">
      <StageEditor
        members={form.band_members || []}
        setMembers={(list) => update("band_members", list)}
        getInstruments={getInstruments}
        colors={stageColors}
        onRemoveMember={removeMember}
      />
      <div className="pt-3 border-t border-[#222] flex flex-col gap-2">
        <StagePlotBody h={h} />
      </div>
    </div>
  );
}

function StagePlotBody({ h }) {
  const { form, handleStagePlotUpload, removeStagePlotFile, getInstruments, stageColors } = h;
  return (
    <div className="flex flex-col gap-2">
      {/* Upload their own / download the one they built: one row (job 259). */}
      <div className="flex gap-2">
        <label className="flex-1 min-w-0 min-h-[52px] px-3 flex items-center justify-center gap-2 text-center border-[1.5px] border-dashed border-[#3a3a3a] rounded-[12px] text-white/65 text-[14px] leading-tight cursor-pointer hover:border-white/40">
          <Paperclip className="w-4 h-4 shrink-0" />Have your own stage plot? Upload it
          <input type="file" accept="image/*,.pdf" multiple onChange={handleStagePlotUpload} className="hidden" />
        </label>
        {(form.band_members || []).some((m) => typeof m?.stage_x === "number") && (
          <div className="flex-1 min-w-0 flex">
            <StagePlotPdfActions
              downloadOnly
              members={form.band_members || []}
              getInstruments={getInstruments}
              actName={form.band_name}
              files={form.stage_plot_files || []}
              onRemoveFile={removeStagePlotFile}
              onAddFile={(file) => handleStagePlotUpload({ target: { files: [file], value: "" } })}
              colors={stageColors}
            />
          </div>
        )}
      </div>
      {(form.stage_plot_files || []).map((f, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-[#262626] bg-[#0b0b0b] px-3 py-2">
          <a href={f.url} target="_blank" rel="noreferrer" className="text-[13.5px] underline truncate" style={{ color: GREEN }}>{f.name}</a>
          <button type="button" onClick={() => removeStagePlotFile(i)} aria-label="Remove file" className="min-h-[36px] w-[36px] flex items-center justify-center text-white/40 hover:text-red-400"><X className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
}

function NotesBody({ h }) {
  const { form, notesTarget, setNotesTarget, getActiveNotes, setActiveNotes } = h;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 flex-wrap justify-center">
        {[["__general__", "Whole band"], ...form.band_members.map((m, i) => [i, m.name || `Member ${i + 1}`])].map(([k, text]) => {
          const on = notesTarget === k;
          return <button key={String(k)} type="button" onClick={() => setNotesTarget(k)} aria-pressed={on} className={chip(on)} style={on ? { background: GREEN, borderColor: GREEN } : undefined}>{text}</button>;
        })}
      </div>
      <textarea value={getActiveNotes() || ""} onChange={(e) => setActiveNotes(e.target.value)} rows={6} placeholder="Anything else the engineer should know…" aria-label="Notes" className={`${inputCls} py-2 leading-relaxed`} />
    </div>
  );
}

function ContactBody({ h, onCard, cardOn, showCard }) {
  const { form, update, formatPhone = (v) => v } = h;
  return (
    <div className="flex flex-col gap-2">
      <input value={form.submitter_name || ""} onChange={(e) => update("submitter_name", e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <input value={form.submitter_phone || ""} onChange={(e) => update("submitter_phone", formatPhone(e.target.value))} placeholder="Phone" aria-label="Phone" type="tel" inputMode="tel" autoComplete="tel" className={inputCls} />
        <input value={form.submitter_email || ""} onChange={(e) => update("submitter_email", e.target.value)} placeholder="Email" aria-label="Email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" className={inputCls} />
      </div>
      {showCard && (
        <button type="button" onClick={onCard} aria-pressed={cardOn} className="min-h-[44px] rounded-[10px] border text-[13.5px] font-semibold flex items-center justify-center gap-2" style={cardOn ? { borderColor: GREEN, color: GREEN, background: `${GREEN}18` } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.65)" }}>
          <User className="w-4 h-4" />{cardOn ? "Digital card connected ✓" : "Connect my digital card"}
        </button>
      )}
    </div>
  );
}

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// The circles for the act's web. `seen` is which circles the act has saved.
// A circle turns green when it's saved with something in it (job 198), or
// once it's fully filled in.
export function intakeCircles(h, { seen = {}, card = null } = {}) {
  const { form, getInstruments } = h;
  const members = form.band_members || [];
  const c = (key, label, short, hint, required, some, full, body) => ({
    key, label, short, hint, required, done: !!full || (!!seen[key] && !!some), body,
  });
  return [
    c("role", "Your role", "Role", "Where you are on the bill", true,
      has(form.role), false, () => <RoleBody h={h} />),
    c("artist", "Artist and set", "Artist & set", "Name, set length, genre", true,
      has(form.band_name), has(form.band_name), () => <ArtistBody h={h} />),
    c("members", "Members and inputs", "Members & inputs", "Build your stage: who stands where and what they play", true,
      members.some((m) => has(m.name) || getInstruments(m).some((x) => has(x.name))),
      members.some((m) => has(m.name) && getInstruments(m).some((x) => has(x.name))), () => <MembersBody h={h} />),
    c("notes", "Notes for the engineer", "Notes", "For the whole band or one member", false,
      has(form.general_notes) || members.some((m) => has(m.notes)), has(form.general_notes) || members.some((m) => has(m.notes)), () => <NotesBody h={h} />),
    c("contact", "Your contact", "Contact", "Who the engineer calls on the day", false,
      has(form.submitter_name) || has(form.submitter_phone) || has(form.submitter_email),
      has(form.submitter_name) && (has(form.submitter_phone) || has(form.submitter_email)), () => <ContactBody h={h} {...(card || {})} />),
  ];
}
