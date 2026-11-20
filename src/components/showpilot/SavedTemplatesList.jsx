import React, { useEffect, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { loadNamed, renameNamed, removeNamed, savedOn } from "@/lib/namedTemplates";

const MONO = { fontFamily: "'JetBrains Mono', monospace" };

// My Templates > Saved templates (job 434): the named offer / event templates
// on top of the house template, to rename or delete. They're made from the
// webs (Save as a template under Send offer / Create event).
//   category: "venue" | "manager"; kinds: ["offer", "event"] or ["event"].
export default function SavedTemplatesList({ category, kinds, color, desktop = false }) {
  const { user } = useAuth();
  const [items, setItems] = useState(null); // [{ kind, ...item }]
  const [editing, setEditing] = useState(""); // `${kind}:${id}`
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    if (!user) return;
    try {
      const lists = await Promise.all(kinds.map((k) => loadNamed(user.id, category, k).then(({ items: xs }) => xs.map((x) => ({ ...x, kind: k })))));
      setItems(lists.flat());
    } catch (e) { console.error(e); setItems([]); }
  };
  useEffect(() => { load(); }, [user, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const rename = async (it) => {
    setErr("");
    try { await renameNamed(user.id, category, it.kind, it.id, name); setEditing(""); await load(); }
    catch (e) { console.error(e); setErr(e?.message || "Couldn't rename it."); }
  };
  const remove = async (it) => {
    setErr("");
    try { await removeNamed(user.id, category, it.kind, it.id); setConfirm(""); await load(); }
    catch (e) { console.error(e); setErr("Couldn't delete it. Try again."); }
  };

  if (!items) return null;
  const where = kinds.includes("offer") ? "Save as a template under Send offer or Create event" : "Save as a template under Create event";
  return (
    <section aria-label="Saved templates" className="flex flex-col gap-1.5">
      <div className="flex items-center px-0.5 pb-1">
        <span className="text-[15px] font-bold tracking-[0.08em] text-white/60" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>SAVED TEMPLATES</span>
        <span className="flex-1" />
        <span className="text-[11px] text-white/40" style={MONO}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="m-0 rounded-[12px] border border-dashed border-[#2a2a2a] px-3 py-3 text-[13px] text-white/55">
          Your house template above is the base. For a band or a deal that's different, use {where}. It shows up here, and in the list when you start one.
        </p>
      ) : (
        <div className={desktop ? "grid gap-2 grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-2"}>
          {items.map((it) => {
            const k = `${it.kind}:${it.id}`;
            return (
              <div key={k} className="flex items-center gap-2 min-h-[56px] rounded-[12px] bg-[#151515] border border-[#262626] pl-3 pr-1.5 min-w-0">
                <span className="shrink-0 text-[9.5px] tracking-[0.1em] px-1.5 py-1 rounded-[5px]" style={{ ...MONO, color, background: `${color}1f` }}>{it.kind === "offer" ? "OFFER" : "EVENT"}</span>
                {editing === k ? (
                  <>
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") rename(it); if (e.key === "Escape") setEditing(""); }} aria-label="New name for this template"
                      className="flex-1 min-w-0 min-h-[40px] px-2.5 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-[15px] outline-none focus:border-white/40" />
                    <button type="button" onClick={() => rename(it)} aria-label="Save the name" className="w-10 h-10 shrink-0 flex items-center justify-center" style={{ color }}><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setEditing("")} aria-label="Cancel" className="w-10 h-10 shrink-0 flex items-center justify-center text-white/50"><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-semibold truncate" title={it.name}>{it.name}</span>
                      <span className="block text-[12px] text-white/50 truncate">{savedOn(it.saved_at) ? `Saved ${savedOn(it.saved_at)}` : "Saved"}</span>
                    </span>
                    {confirm === k ? (
                      <button type="button" onClick={() => remove(it)} className="shrink-0 min-h-[40px] px-2.5 rounded-lg text-[12.5px] font-bold text-red-300 border border-red-500/40">Delete it</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setEditing(k); setName(it.name); setConfirm(""); }} aria-label={`Rename ${it.name}`} className="w-10 h-10 shrink-0 flex items-center justify-center text-white/55"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setConfirm(k)} aria-label={`Delete ${it.name}`} className="w-10 h-10 shrink-0 flex items-center justify-center text-white/55"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {err && <p className="m-0 text-[12.5px] text-red-300">{err}</p>}
    </section>
  );
}
