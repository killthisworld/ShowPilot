import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { assignTech, pilotTech, loadFellowPilots, techsFirst } from "@/lib/assignTech";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Put a tech on the event's Audio / Lighting spot (job 326).
// - editable (the owner, or the techs themselves, who save the whole
//   section): a "From your Fellow Pilots" picker that fills the fields above;
//   the section's own Save keeps it.
// - not editable, but on the event's venue or manager / artist side: the
//   picker plus name, phone and email of their own, saved right away.
const inputCls = "w-full h-11 px-3 rounded-[10px] bg-[#0f0f0f] border border-[#2a2a2a] text-white text-[15px] placeholder:text-white/30 focus:outline-none focus:border-white/40";

export default function TechAssign({ role, info = {}, token, editable, color, onLocal, onSaved }) {
  const [pilots, setPilots] = useState([]);
  const [form, setForm] = useState({ contact_name: info.contact_name || "", contact_phone: info.contact_phone || "", contact_email: info.contact_email || "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { let on = true; loadFellowPilots().then((l) => { if (on) setPilots(techsFirst(l)); }); return () => { on = false; }; }, []);
  useEffect(() => { setForm({ contact_name: info.contact_name || "", contact_phone: info.contact_phone || "", contact_email: info.contact_email || "" }); }, [info.contact_name, info.contact_phone, info.contact_email]);
  const who = role === "lighting" ? "lighting tech" : "engineer";
  const picked = pilots.find((p) => info.card_user_id && p.pilot_user_id === info.card_user_id)?.id || "";

  const save = async (tech, note) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const ei = await assignTech(token, role, tech);
      onSaved?.(ei);
      setMsg(note);
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      console.error(e);
      setErr(/sign in/i.test(e?.message || "") ? "Sign in to add a tech." : /can't add/i.test(e?.message || "") ? "Only the venue or the act's side can add a tech here." : "That didn't save. Check your signal and try again.");
    }
    setBusy(false);
  };
  const pick = (id) => {
    const p = pilots.find((x) => x.id === id);
    if (!p) return;
    const tech = pilotTech(p);
    if (editable) onLocal?.(tech);
    else save(tech, `${p.display_name || "Their card"} is on as the ${who}.`);
  };

  const picker = pilots.length > 0 ? (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] tracking-[0.12em] text-white/55" style={{ fontFamily: SCENE_MONO }}>FROM YOUR FELLOW PILOTS</span>
      <select value={picked} onChange={(e) => pick(e.target.value)} disabled={busy} aria-label={`Pick the ${who} from your Fellow Pilots`} className={`${inputCls} appearance-none`}>
        <option value="">{picked ? "Pick someone else" : "Pick their digital card"}</option>
        {pilots.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
      </select>
    </label>
  ) : null;

  if (editable) return picker;

  const changed = form.contact_name !== (info.contact_name || "") || form.contact_phone !== (info.contact_phone || "") || form.contact_email !== (info.contact_email || "");
  return (
    <div className="flex flex-col gap-3">
      {picker}
      <div className="flex flex-col gap-2">
        <span className="text-[12px] tracking-[0.12em] text-white/55" style={{ fontFamily: SCENE_MONO }}>{pilots.length ? "OR TYPE THEM IN" : `THE ${who.toUpperCase()}`}</span>
        <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Name" aria-label={`The ${who}'s name`} className={inputCls} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="Phone" type="tel" inputMode="tel" aria-label={`The ${who}'s phone`} className={inputCls} />
          <input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="Email" type="email" inputMode="email" autoCapitalize="none" aria-label={`The ${who}'s email`} className={inputCls} />
        </div>
        {changed && (
          <button type="button" disabled={busy || !form.contact_name.trim()} onClick={() => save({ ...form, ...(form.contact_name !== (info.contact_name || "") ? { card_user_id: null, card_share_token: null } : {}) }, "Saved.")}
            className="self-start h-10 px-4 rounded-[9px] text-[14px] font-bold disabled:opacity-40" style={{ background: color, color: "#0d0d0d" }}>
            {busy ? "Saving…" : `Save the ${who}`}
          </button>
        )}
      </div>
      {msg && <p className="m-0 text-[13.5px] flex items-center gap-1.5" style={{ color }}><Check className="w-4 h-4" />{msg}</p>}
      {err && <p className="m-0 text-[13.5px] text-red-400">{err}</p>}
    </div>
  );
}
