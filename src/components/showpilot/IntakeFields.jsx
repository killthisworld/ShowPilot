import React from "react";
import { Plus, Trash2, X, Paperclip, User, Music } from "lucide-react";
import VocalsQuestion, { isVocalInput, memberSings } from "@/components/showpilot/VocalsQuestion";

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
  const fill = h.fillFromProfile;
  return (
    <div className="flex flex-col gap-3">
      {fill && (
        <button type="button" onClick={fill.onClick} disabled={fill.loading} className="self-center min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#8CFF3D]/40 text-[13.5px] font-semibold text-[#8CFF3D] flex items-center gap-1.5">
          <Music className="w-4 h-4" />{fill.loading ? "Loading…" : "Fill it from my artist profile"}
        </button>
      )}
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

function MembersBody({ h }) {
  const { form, getInstruments, addMember, updateMember, removeMember, addInstrument, updateInstrument, removeInstrument, setVocals } = h;
  const inputs = form.band_members.reduce((n, m) => n + getInstruments(m).length, 0);
  return (
    <div className="flex flex-col gap-3">
      {form.band_members.map((m, i) => (
        <div key={i} className="rounded-[14px] border border-[#262626] bg-[#101010] p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <input value={m.name || ""} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" aria-label="Member name" className={`${inputCls} font-semibold`} />
            <button type="button" onClick={() => removeMember(i)} aria-label="Remove member" className="min-h-[44px] w-[40px] shrink-0 flex items-center justify-center text-white/35 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
          </div>
          <VocalsQuestion value={memberSings(m, getInstruments(m))} onChange={(yes) => setVocals(i, yes)} />
          {getInstruments(m).map((inst, ii) => (isVocalInput(inst) ? null : (
            <div key={ii} className="flex items-center gap-1.5">
              <input value={inst.name || ""} onChange={(e) => updateInstrument(i, ii, "name", e.target.value)} placeholder="e.g. Guitar" aria-label="Instrument" className={`${inputCls} !min-h-[40px]`} />
              {["Mic", "DI"].map((type) => {
                const on = (inst.mic_di || "Mic") === type;
                return <button key={type} type="button" onClick={() => updateInstrument(i, ii, "mic_di", type)} aria-pressed={on} className="min-h-[40px] px-2.5 rounded-lg text-[12.5px] font-semibold border shrink-0" style={on ? { color: "#93C5FD", borderColor: "rgba(96,165,250,0.5)", background: "rgba(96,165,250,0.12)" } : { color: "rgba(255,255,255,0.45)", borderColor: "#333" }}>{type}</button>;
              })}
              <button type="button" onClick={() => updateInstrument(i, ii, "phantom_power", !inst.phantom_power)} aria-pressed={!!inst.phantom_power} className="min-h-[40px] px-2.5 rounded-lg text-[12px] font-bold border shrink-0" style={inst.phantom_power ? { color: "#FBBF24", borderColor: "rgba(251,191,36,0.5)", background: "rgba(251,191,36,0.12)" } : { color: "rgba(255,255,255,0.45)", borderColor: "#333" }}>+48V</button>
              <button type="button" onClick={() => removeInstrument(i, ii)} aria-label="Remove instrument" className="min-h-[40px] w-[32px] shrink-0 flex items-center justify-center text-white/35 hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>
          )))}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => addInstrument(i)} className="min-h-[38px] px-3 rounded-full border border-dashed border-[#444] text-[13px] font-semibold flex items-center gap-1" style={{ color: GREEN }}><Plus className="w-3.5 h-3.5" />Instrument</button>
            <span className="flex-1" />
            <span className="text-[12px] text-white/55">Hears:</span>
            {["IEM", "Monitor"].map((type) => {
              const on = m.bus_type === type;
              return <button key={type} type="button" onClick={() => updateMember(i, "bus_type", on ? "" : type)} aria-pressed={on} className={chip(on)} style={on ? { background: GREEN, borderColor: GREEN } : undefined}>{type === "Monitor" ? "Wedge" : type}</button>;
            })}
          </div>
        </div>
      ))}
      <button type="button" onClick={addMember} className="self-center min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#444] text-[14px] font-semibold flex items-center gap-1.5" style={{ color: GREEN }}><Plus className="w-4 h-4" />Add a member</button>
      {inputs > 0 && <span className="text-center text-[12.5px] text-white/55">{inputs} input{inputs === 1 ? "" : "s"} so far</span>}
    </div>
  );
}

function StagePlotBody({ h }) {
  const { form, handleStagePlotUpload, removeStagePlotFile } = h;
  return (
    <div className="flex flex-col gap-2">
      <label className="min-h-[110px] flex flex-col items-center justify-center gap-2 border-[1.5px] border-dashed border-[#3a3a3a] rounded-[14px] text-white/65 text-[14.5px] cursor-pointer hover:border-white/40">
        <Paperclip className="w-6 h-6" />Upload your stage plot (image or PDF)
        <input type="file" accept="image/*,.pdf" multiple onChange={handleStagePlotUpload} className="hidden" />
      </label>
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

// The circles for the act's web. `seen` is which circles the act has saved
// (for Role, which always has an answer).
export function intakeCircles(h, { seen = {}, card = null } = {}) {
  const { form, getInstruments } = h;
  return [
    { key: "role", label: "Your role", short: "Role", hint: "Where you are on the bill", required: false, done: !!seen.role && has(form.role), body: () => <RoleBody h={h} /> },
    { key: "artist", label: "Artist and set", short: "Artist & set", hint: "Name, set length, genre", required: true, done: has(form.band_name), body: () => <ArtistBody h={h} /> },
    { key: "members", label: "Members and inputs", short: "Members & inputs", hint: "Who plays what, and what the engineer plugs in", required: false, done: form.band_members.some((m) => has(m.name) && getInstruments(m).some((x) => has(x.name))), body: () => <MembersBody h={h} /> },
    { key: "plot", label: "Stage plot", short: "Stage plot", hint: "A photo or PDF is fine", required: false, done: (form.stage_plot_files || []).length > 0, body: () => <StagePlotBody h={h} /> },
    { key: "notes", label: "Notes for the engineer", short: "Notes", hint: "For the whole band or one member", required: false, done: has(form.general_notes) || form.band_members.some((m) => has(m.notes)), body: () => <NotesBody h={h} /> },
    { key: "contact", label: "Your contact", short: "Contact", hint: "Who the engineer calls on the day", required: false, done: has(form.submitter_name) && (has(form.submitter_phone) || has(form.submitter_email)), body: () => <ContactBody h={h} {...(card || {})} /> },
  ];
}
