import React, { useRef, useState } from "react";
import { Copy, Mail, Pencil } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { eventTitle } from "@/lib/eventTitle";
import { DEFAULT_EMAIL, EMAIL_FIELDS, fillEmail } from "@/lib/eventLink";

// Sending the event link by email (job 176). The venue writes its email
// once (saved on the account, user_preferences.event_link_email); Email it
// opens their mail app with it filled in for this event and its link, and
// Copy email copies the same text for Gmail, a text or a DM.
const mono = { fontFamily: SCENE_MONO };
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40";

const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "");

export default function EventLinkEmail({ gig, url, color = "#60A5FA" }) {
  const { preferences, setPreferences } = usePreferences();
  const saved = preferences?.event_link_email || null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const bodyRef = useRef(null);
  const subjectRef = useRef(null);
  const lastField = useRef("body");

  const vals = {
    event: eventTitle(gig),
    date: fmtDate(gig.date),
    venue: gig.venue || "",
    link: url,
    name: preferences?.display_name || "",
  };
  const tpl = draft || saved || DEFAULT_EMAIL;
  const filled = fillEmail(tpl, vals);
  const mailto = `mailto:?subject=${encodeURIComponent(filled.subject)}&body=${encodeURIComponent(filled.body)}`;

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2200); };
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(`${filled.subject}\n\n${filled.body}`); flash("Email copied"); } catch { flash("Couldn't copy"); }
  };
  const open = () => { setDraft({ ...DEFAULT_EMAIL, ...(saved || {}) }); setEditing(true); };
  const insert = (key) => {
    const field = lastField.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const cur = draft[field] || "";
    const at = el && typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : at;
    const next = `${cur.slice(0, at)}{${key}}${cur.slice(end)}`;
    setDraft({ ...draft, [field]: next });
    setTimeout(() => { if (el) { el.focus(); const p = at + key.length + 2; el.setSelectionRange(p, p); } }, 0);
  };
  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const value = { subject: draft.subject || "", body: draft.body || "" };
    const { error } = user ? await supabase.from("user_preferences").update({ event_link_email: value }).eq("user_id", user.id) : { error: new Error("Not signed in") };
    setSaving(false);
    if (error) { console.error(error); flash("Couldn't save the email"); return; }
    setPreferences?.((p) => ({ ...(p || {}), event_link_email: value }));
    setEditing(false); setDraft(null);
    flash("Saved. Every event's link uses it.");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        <a href={mailto} className="flex-1 min-w-[140px] min-h-[48px] rounded-[10px] font-semibold text-[15px] flex items-center justify-center gap-2 border" style={{ color, borderColor: `${color}66` }}><Mail className="w-4 h-4" />Email it</a>
        <button type="button" onClick={copyEmail} className="min-h-[48px] px-3.5 rounded-[10px] border border-[#2a2a2a] text-[14px] font-semibold text-white/80 flex items-center gap-2"><Copy className="w-4 h-4" />Copy email</button>
        {!editing && (
          <button type="button" onClick={open} className="min-h-[48px] px-3.5 rounded-[10px] border border-[#2a2a2a] text-[14px] font-semibold text-white/80 flex items-center gap-2"><Pencil className="w-4 h-4" />{saved ? "Edit your email" : "Write your email"}</button>
        )}
      </div>
      {msg && <p className="text-[13px] text-[#8CFF3D]">{msg}</p>}

      {editing && (
        <div className="rounded-[12px] border border-[#2a2a2a] bg-[#101010] p-3.5 flex flex-col gap-3">
          <div>
            <div className="text-[16px] font-semibold">Your email for the event link</div>
            <p className="text-[13px] text-white/50">Write it once. Every event fills in its own name, date and link when you tap Email it.</p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] tracking-[0.12em] text-white/50" style={mono}>SUBJECT</span>
            <input ref={subjectRef} value={draft.subject} onFocus={() => { lastField.current = "subject"; }} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] tracking-[0.12em] text-white/50" style={mono}>EMAIL</span>
            <textarea ref={bodyRef} value={draft.body} onFocus={() => { lastField.current = "body"; }} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={9} className={`${inputCls} py-2 leading-relaxed`} />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-white/50 mr-1">Insert:</span>
            {EMAIL_FIELDS.map((f) => (
              <button key={f.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(f.key)}
                className="min-h-[36px] px-2.5 rounded-full border text-[12.5px] font-semibold" style={{ color, borderColor: `${color}66` }}>{f.label}</button>
            ))}
          </div>
          <div className="rounded-[10px] border border-[#242424] bg-[#0b0b0b] p-3">
            <div className="text-[10.5px] tracking-[0.12em] text-white/45 mb-1.5" style={mono}>HOW IT READS FOR THIS EVENT</div>
            <div className="text-[14px] font-semibold">{filled.subject}</div>
            <p className="mt-1.5 text-[13.5px] text-white/75 whitespace-pre-wrap break-words">{filled.body}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="flex-1 min-h-[48px] rounded-[10px] font-bold text-[15px] disabled:opacity-60" style={{ background: color, color: "#0d0d0d" }}>{saving ? "Saving…" : "Save email"}</button>
            <button type="button" onClick={() => setDraft({ ...DEFAULT_EMAIL })} className="min-h-[48px] px-3.5 rounded-[10px] border border-[#2a2a2a] text-[14px] text-white/70">Start over</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(null); }} className="min-h-[48px] px-3.5 rounded-[10px] border border-[#2a2a2a] text-[14px] text-white/70">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
