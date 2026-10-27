import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Mail, Pencil, Send, X, RotateCw } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { eventTitle } from "@/lib/eventTitle";
import { DEFAULT_EMAIL, EMAIL_FIELDS, fillEmail, sendEventLinkEmail, fetchEventLinkSends, looksLikeEmail } from "@/lib/eventLink";

// Sending the event link by email (job 176). The venue writes its email
// once (saved on the account, user_preferences.event_link_email); Email it
// opens their mail app with it filled in for this event and its link, and
// Copy email copies the same text for Gmail, a text or a DM.
const mono = { fontFamily: SCENE_MONO };
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40";

const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "");

export default function EventLinkEmail({ gig, url, color = "#60A5FA", onEventEmail = null }) {
  const { preferences, setPreferences } = usePreferences();
  // A venue template loaded onto the event can bring its own email (job 185);
  // that one wins for this event, else the account's.
  const own = gig?.venue_info?.event_link_email;
  const eventOwn = own && (String(own.subject || "").trim() || String(own.body || "").trim()) ? own : null;
  const saved = eventOwn || preferences?.event_link_email || null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const bodyRef = useRef(null);
  const subjectRef = useRef(null);
  const lastField = useRef("body");
  // Sending from Show Pilot (job 183).
  const [sending, setSending] = useState(false);
  const [sends, setSends] = useState([]);
  const reloadSends = useCallback(async () => { if (gig?.id) setSends(await fetchEventLinkSends(gig.id)); }, [gig?.id]);
  useEffect(() => { reloadSends(); }, [reloadSends]);

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
    if (eventOwn && onEventEmail) {
      onEventEmail({ subject: draft.subject || "", body: draft.body || "" });
      setEditing(false); setDraft(null);
      flash("Changed for this event. Press SAVE to keep it.");
      return;
    }
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
        <button type="button" onClick={() => setSending((v) => !v)} aria-expanded={sending} className="flex-1 min-w-[140px] min-h-[48px] rounded-[10px] font-semibold text-[15px] flex items-center justify-center gap-2 border" style={sending ? { background: color, color: "#0d0d0d", borderColor: color } : { color, borderColor: `${color}66` }}><Send className="w-4 h-4" />Send email</button>
        <a href={mailto} title="Open it in your own email app" className="min-h-[48px] px-3.5 rounded-[10px] border border-[#2a2a2a] text-[14px] font-semibold text-white/80 flex items-center gap-2"><Mail className="w-4 h-4" />My email app</a>
        <button type="button" onClick={copyEmail} className="min-h-[48px] px-3.5 rounded-[10px] border border-[#2a2a2a] text-[14px] font-semibold text-white/80 flex items-center gap-2"><Copy className="w-4 h-4" />Copy email</button>
        {!editing && (
          <button type="button" onClick={open} className="min-h-[48px] px-3.5 rounded-[10px] border border-[#2a2a2a] text-[14px] font-semibold text-white/80 flex items-center gap-2"><Pencil className="w-4 h-4" />{saved ? "Edit your email" : "Write your email"}</button>
        )}
      </div>
      {msg && <p className="text-[13px] text-[#8CFF3D]">{msg}</p>}

      {sending && (
        <SendPanel gig={gig} filled={filled} color={color} onSent={reloadSends} />
      )}
      {sends.length > 0 && <SentList sends={sends} gig={gig} filled={filled} color={color} onSent={reloadSends} />}

      {editing && (
        <div className="rounded-[12px] border border-[#2a2a2a] bg-[#101010] p-3.5 flex flex-col gap-3">
          <div>
            <div className="text-[16px] font-semibold">Your email for the event link</div>
            <p className="text-[13px] text-white/50">{eventOwn && onEventEmail ? "This event uses the email from your venue template. Changes here are for this event only." : "Write it once. Every event fills in its own name, date and link when you send it."}</p>
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

// Addresses already on the event that the venue might want to send to.
function eventContacts(gig) {
  const out = [];
  const add = (email, who) => { const e = String(email || "").trim().toLowerCase(); if (looksLikeEmail(e) && !out.some((x) => x.email === e)) out.push({ email: e, who }); };
  add(gig?.manager_info?.contact_email, gig?.manager_info?.contact_name || "Manager");
  add(gig?.engineer_info?.audio?.contact_email, gig?.engineer_info?.audio?.contact_name || "Audio");
  add(gig?.engineer_info?.lighting?.contact_email, gig?.engineer_info?.lighting?.contact_name || "Lighting");
  return out;
}

// Type or paste addresses (comma, space or Enter between them), pick from
// the event's contacts, check the email, Send. Each act gets its own email
// from "<Venue> via Show Pilot"; replies go to the venue.
function SendPanel({ gig, filled, color, onSent, preset = [] }) {
  const [to, setTo] = useState(preset);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const addMany = (text) => {
    const parts = String(text).split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    const good = parts.filter(looksLikeEmail);
    const badOnes = parts.filter((p) => !looksLikeEmail(p));
    if (good.length) setTo((cur) => [...new Set([...cur, ...good])]);
    setTyped(badOnes.join(" "));
    setErr(badOnes.length ? `Check ${badOnes.join(", ")}` : "");
  };
  const onKey = (e) => {
    if (["Enter", ",", " ", "Tab"].includes(e.key) && typed.trim()) { e.preventDefault(); addMany(typed); }
    if (e.key === "Backspace" && !typed && to.length) setTo(to.slice(0, -1));
  };
  const suggestions = eventContacts(gig).filter((c) => !to.includes(c.email));
  const send = async () => {
    const list = [...to];
    if (typed.trim()) { const extra = typed.split(/[\s,;]+/).filter(looksLikeEmail).map((x) => x.toLowerCase()); list.push(...extra); }
    const all = [...new Set(list)];
    if (!all.length) { setErr("Add at least one email address."); return; }
    setBusy(true); setErr(""); setDone(null);
    try {
      const r = await sendEventLinkEmail(gig.id, all, filled.subject, filled.body);
      setDone(r); setTo([]); setTyped("");
      onSent?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const count = to.length + (typed.split(/[\s,;]+/).filter(looksLikeEmail).length);
  return (
    <div className="rounded-[12px] border border-[#2a2a2a] bg-[#101010] p-3.5 flex flex-col gap-3">
      <div>
        <div className="text-[16px] font-semibold">Send the link from Show Pilot</div>
        <p className="text-[13px] text-white/50">Each act gets their own email from your venue's name via Show Pilot. When they reply, it comes to your email.</p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-[0.12em] text-white/50" style={mono}>SEND TO</span>
        <span className="min-h-[48px] w-full px-2 py-1.5 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] flex flex-wrap items-center gap-1.5 focus-within:border-white/40">
          {to.map((e) => (
            <span key={e} className="flex items-center gap-1 pl-2.5 pr-1 h-8 rounded-full text-[13.5px]" style={{ background: `${color}1f`, color }}>
              {e}
              <button type="button" onClick={() => setTo(to.filter((x) => x !== e))} aria-label={`Remove ${e}`} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
          <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={onKey} onBlur={() => typed.trim() && addMany(typed)}
            onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[\s,;]/.test(t.trim())) { e.preventDefault(); addMany(`${typed} ${t}`); } }}
            placeholder={to.length ? "Add another" : "act@email.com, another@email.com"} className="flex-1 min-w-[180px] h-9 bg-transparent outline-none text-white text-base placeholder:text-white/25" />
        </span>
      </label>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-white/50 mr-1">On this event:</span>
          {suggestions.map((c) => (
            <button key={c.email} type="button" onClick={() => setTo([...to, c.email])} className="min-h-[34px] px-2.5 rounded-full border border-[#2a2a2a] text-[12.5px] text-white/80 hover:text-white">+ {c.who} · {c.email}</button>
          ))}
        </div>
      )}
      <div className="rounded-[10px] border border-[#242424] bg-[#0b0b0b] p-3">
        <div className="text-[10.5px] tracking-[0.12em] text-white/45 mb-1.5" style={mono}>WHAT THEY GET</div>
        <div className="text-[14px] font-semibold">{filled.subject}</div>
        <p className="mt-1.5 text-[13.5px] text-white/75 whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">{filled.body}</p>
      </div>
      {err && <p className="text-[13px] text-[#FF8A3D]">{err}</p>}
      {done && (
        <p className="text-[13px] text-[#8CFF3D]">
          {done.sent?.length ? `Sent to ${done.sent.length} ${done.sent.length === 1 ? "address" : "addresses"}.` : "Nothing was sent."}
          {done.skipped?.length ? <span className="text-white/60"> Skipped {done.skipped.map((x) => `${x.email} (${x.why})`).join(", ")}.</span> : null}
          {done.failed?.length ? <span className="text-[#FF8A3D]"> Couldn't send to {done.failed.join(", ")}.</span> : null}
        </p>
      )}
      <button type="button" disabled={busy || !count} onClick={send} className="min-h-[48px] rounded-[10px] font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: color, color: "#0d0d0d" }}>
        <Send className="w-4 h-4" />{busy ? "Sending…" : count ? `Send to ${count} ${count === 1 ? "address" : "addresses"}` : "Add an address to send"}
      </button>
    </div>
  );
}

const STATUS = { sent: ["SENT", "#8CFF3D"], failed: ["DIDN'T SEND", "#FF8A3D"], skipped: ["SKIPPED", "rgba(255,255,255,0.5)"], queued: ["SENDING", "rgba(255,255,255,0.5)"] };
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

// Who the link was emailed to and when; send it again in one tap.
function SentList({ sends, gig, filled, color, onSent }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  // Latest attempt per address.
  const latest = [];
  for (const s of sends) if (!latest.some((x) => x.to_email === s.to_email)) latest.push(s);
  const again = async (email) => {
    setBusy(email); setErr("");
    try { await sendEventLinkEmail(gig.id, [email], filled.subject, filled.body); await onSent?.(); } catch (e) { setErr(e.message); }
    setBusy(null);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] tracking-[0.12em] text-white/50" style={mono}>EMAILED</span>
      <div className="rounded-[10px] border border-[#242424] divide-y divide-[#1f1f1f]">
        {latest.map((s) => {
          const [word, c] = STATUS[s.status] || STATUS.queued;
          return (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] truncate">{s.to_email}</span>
                <span className="block text-[11px] tracking-[0.06em]" style={{ ...mono, color: c }} title={s.error || undefined}>{word} · {when(s.sent_at || s.created_at)}</span>
              </span>
              <button type="button" disabled={busy === s.to_email} onClick={() => again(s.to_email)} className="shrink-0 min-h-[36px] px-2.5 rounded-lg border border-[#2a2a2a] text-[12.5px] font-semibold text-white/75 flex items-center gap-1.5 disabled:opacity-50" style={{ borderColor: `${color}44` }}>
                <RotateCw className="w-3.5 h-3.5" />{busy === s.to_email ? "Sending…" : "Send again"}
              </button>
            </div>
          );
        })}
      </div>
      {err && <p className="text-[13px] text-[#FF8A3D]">{err}</p>}
    </div>
  );
}
