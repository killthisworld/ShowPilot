import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT } from "@/lib/sceneStyle";
import useTouringParty, { SEES, seesLabel, PARTY_CHANGED } from "@/lib/touringParty";

// Me > Party (job 73, "On the road" stage 6): the people you tour with,
// added once. Each one gets the day sheet by text or email from the Day
// sheet's "Send to the party", even without a Show Pilot account.
// "Sees" is how much they should get: everything, no money, or just the
// day sheet.

const blank = { name: "", role: "", phone: "", email: "", sees: "no_money" };
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function PartyPanel({ accent = "#F87171" }) {
  const { party, loading, failed, reload } = useTouringParty();
  const [form, setForm] = useState(null); // { ...person } being added / edited
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const row = { name: form.name.trim(), role: form.role.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, sees: form.sees };
    if (!row.name) { setErr("Add a name."); return; }
    setBusy(true); setErr("");
    const { error } = form.id
      ? await supabase.from("touring_party").update(row).eq("id", form.id)
      : await supabase.from("touring_party").insert(row);
    setBusy(false);
    if (error) { console.error(error); setErr("Couldn't save. Try again."); return; }
    setForm(null);
    window.dispatchEvent(new Event(PARTY_CHANGED));
  };

  const remove = async () => {
    if (!form?.id) return;
    setBusy(true);
    const { error } = await supabase.from("touring_party").delete().eq("id", form.id);
    setBusy(false);
    if (error) { console.error(error); setErr("Couldn't remove them. Try again."); return; }
    setForm(null);
    reload();
  };

  const input = "h-12 px-4 rounded-xl bg-[#151515] border border-[#2a2a2a] text-white text-[16px] outline-none focus:border-white/30 placeholder:text-white/35";

  if (form) {
    return (
      <div className="px-5 pt-6 pb-10 flex flex-col gap-3" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <h2 className="m-0 text-[28px] font-bold tracking-[0.02em] text-white" style={{ fontFamily: SCENE_FONT }}>{form.id ? "Edit" : "Add someone"}</h2>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Name" aria-label="Name" maxLength={80} className={input} autoFocus={!form.id} />
        <input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Role, e.g. Drums, Tour manager, Merch" aria-label="Role" maxLength={60} className={input} />
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone (for texts)" aria-label="Phone" inputMode="tel" className={input} />
        <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email" aria-label="Email" inputMode="email" autoCapitalize="none" className={input} />
        <div className="pt-1 flex flex-col gap-1.5">
          <span className="text-[13px] text-white/55">What they get</span>
          <div role="radiogroup" aria-label="What they get" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#1a1a1a]">
            {SEES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={form.sees === s.id} onClick={() => set("sees", s.id)}
                className="h-10 rounded-[9px] text-[13px] font-bold" style={form.sees === s.id ? { background: accent, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.7)" }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="m-0 text-[13px] text-red-400">{err}</p>}
        <div className="pt-2 flex gap-2">
          <button type="button" onClick={() => { setForm(null); setErr(""); }} disabled={busy} className="flex-1 h-12 rounded-xl bg-[#1f1f1f] text-white/80 text-[15px] font-semibold">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="flex-1 h-12 rounded-xl text-[15px] font-bold disabled:opacity-50" style={{ background: accent, color: "#0d0d0d" }}>{busy ? "Saving…" : "Save"}</button>
        </div>
        {form.id && (
          <button type="button" onClick={remove} disabled={busy} className="h-12 rounded-xl text-red-400 text-[14px] font-semibold flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Remove from the party</button>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-10" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h2 className="m-0 text-[32px] leading-none font-bold tracking-[0.03em] text-white" style={{ fontFamily: SCENE_FONT }}>THE PARTY</h2>
          <p className="m-0 text-[14px] text-white/55">{party.length ? `${party.length} ${party.length === 1 ? "person" : "people"} on the road` : "Who you tour with"}</p>
        </div>
        <button type="button" onClick={() => setForm({ ...blank })} className="h-11 px-4 rounded-[10px] text-[14px] font-bold shrink-0" style={{ background: accent, color: "#0d0d0d" }}>Add</button>
      </div>

      <div className="pt-5">
        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
        ) : failed && !party.length ? (
          <p className="m-0 text-[15px] text-white/55">Couldn't load your party. Try again in a moment.</p>
        ) : !party.length ? (
          <p className="m-0 text-[15px] text-white/55 leading-snug">Add your band and crew once. Then, from any day sheet, tap Send to the party to text or email it to each of them, even if they're not on Show Pilot.</p>
        ) : party.map((p) => (
          <button key={p.id} type="button" onClick={() => setForm({ ...blank, ...p, role: p.role || "", phone: p.phone || "", email: p.email || "" })}
            className="w-full flex items-center gap-3.5 min-h-[64px] border-b border-[#1f1f1f] text-left active:bg-[#121212]">
            <span className="w-10 h-10 rounded-full bg-[#222] flex items-center justify-center text-[13px] font-bold text-white shrink-0">{initials(p.name)}</span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[16px] font-semibold text-white truncate">{p.name}</span>
              <span className="text-[13px] text-white/50 truncate">{[p.role, p.phone ? null : p.email ? "email only" : "no phone or email"].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="text-[13px] shrink-0" style={{ color: p.sees === "all" ? "#8CFF3D" : "rgba(255,255,255,0.55)" }}>{seesLabel(p.sees)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
