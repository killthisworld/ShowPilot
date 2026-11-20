import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Pencil, Trash2, Check, X, Play, Plus, FileText } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { loadNamed, renameNamed, removeNamed, saveNamed, savedOn } from "@/lib/namedTemplates";
import { dealAskLine } from "@/components/showpilot/BookingFields";

const MONO = { fontFamily: "'JetBrains Mono', monospace" };
const COND = "'Barlow Condensed', sans-serif";
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// The named offer / event templates of an account (job 437), for the tabs
// in My Templates. { lists: { offer: [...], event: [...] } | null, reload }
export function useNamedTemplates(category, kinds) {
  const { user } = useAuth();
  const [lists, setLists] = useState(null);
  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const out = {};
      await Promise.all(kinds.map(async (k) => { out[k] = (await loadNamed(user.id, category, k)).items; }));
      setLists(out);
    } catch (e) { console.error(e); setLists(Object.fromEntries(kinds.map((k) => [k, []]))); }
  }, [user, category, kinds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  return { lists, reload };
}

// What a template holds, a line per thing.
function detailsOf(kind, it) {
  const d = it.data || {};
  if (kind === "offer") {
    const t = it.times || {};
    const docs = Array.isArray(d.files) ? d.files.filter((f) => f?.name) : [];
    return [
      d.deal && has(d.deal.ask) && ["Deal", dealAskLine(d.deal)],
      (has(t.set_time) || has(t.load_in)) && ["Times", [has(t.load_in) && `Load-in ${t.load_in}`, has(t.set_time) && `On at ${t.set_time}`, has(t.billing) && t.billing].filter(Boolean).join(" · ")],
      docs.length > 0 && ["Docs", docs.map((f) => f.name).join(", ")],
      d.hosp && Object.values(d.hosp).some(has) && ["Hosp", "Hospitality filled in"],
    ].filter(Boolean);
  }
  const acts = Array.isArray(d.acts) ? d.acts.map((a) => a.name).filter(Boolean) : [];
  const people = Array.isArray(d.people) ? d.people.length : 0;
  const crew = d.crew || {};
  const crewLine = [crew.sound && `Sound: ${crew.sound === "venue" ? "house" : "the act's"}`, crew.lights && `Lights: ${crew.lights === "venue" ? "house" : "the act's"}`].filter(Boolean).join(" · ");
  return [
    acts.length > 0 && ["Acts", acts.join(", ")],
    (has(d.loadIn) || has(d.doors) || has(d.onStage) || has(d.curfew)) && ["Times", [has(d.loadIn) && `Load-in ${d.loadIn}`, has(d.doors) && `Doors ${d.doors}`, has(d.onStage) && `Show ${d.onStage}`, has(d.curfew) && `Curfew ${d.curfew}`].filter(Boolean).join(" · ")],
    crewLine && ["Crew", crewLine],
    people > 0 && ["Co-hosts", String(people)],
  ].filter(Boolean);
}

// One tab of named templates: a card each (what's in it, Start, Duplicate,
// Rename, Delete), and how to make one.
export default function TemplatesHub({ category, kind, color, desktop = false, items = [], reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const start = (id) => navigate(kind === "offer" ? `/offer?tpl=${id}` : `/event/new?tpl=${id}`);
  const startFresh = () => navigate(kind === "offer" ? "/offer?tpl=fresh" : "/event/new?tpl=fresh");
  const act = async (fn) => { setErr(""); try { await fn(); await reload(); } catch (e) { console.error(e); setErr(e?.message || "Couldn't do that. Try again."); } };
  const duplicate = (it) => act(async () => {
    const names = new Set(items.map((x) => x.name.toLowerCase()));
    let n = `${it.name} copy`; let i = 2;
    while (names.has(n.toLowerCase())) n = `${it.name} copy ${i++}`;
    await saveNamed(user.id, category, kind, { name: n, data: it.data, times: it.times || null });
  });
  const noun = kind === "offer" ? "offer" : "event";
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13.5px] text-white/60">
        {kind === "offer"
          ? "Offers you send a lot: a house deal, a band's own agreement. Start one and only add the dates and who it goes to."
          : "Nights you make a lot: your usual times, a resident act, who does sound. Start one and only add the date."}
      </p>
      <div className={desktop ? "grid gap-3 grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-2.5"}>
        {items.map((it) => {
          const lines = detailsOf(kind, it);
          return (
            <div key={it.id} className="rounded-[14px] bg-[#151515] border border-[#262626] p-3.5 flex flex-col gap-2.5 min-w-0">
              <div className="flex items-start gap-2">
                {editing === it.id ? (
                  <div className="flex-1 flex gap-1.5 min-w-0">
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="New name for this template"
                      onKeyDown={(e) => { if (e.key === "Enter") act(async () => { await renameNamed(user.id, category, kind, it.id, name); setEditing(""); }); if (e.key === "Escape") setEditing(""); }}
                      className="flex-1 min-w-0 min-h-[40px] px-2.5 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-[15px] outline-none focus:border-white/40" />
                    <button type="button" aria-label="Save the name" onClick={() => act(async () => { await renameNamed(user.id, category, kind, it.id, name); setEditing(""); })} className="w-10 h-10 shrink-0 flex items-center justify-center" style={{ color }}><Check className="w-4 h-4" /></button>
                    <button type="button" aria-label="Cancel" onClick={() => setEditing("")} className="w-10 h-10 shrink-0 flex items-center justify-center text-white/50"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="text-[21px] leading-tight break-words" style={{ fontFamily: COND, fontWeight: 700 }}>{it.name}</div>
                    <div className="text-[11px] tracking-[0.08em] text-white/45" style={MONO}>{savedOn(it.saved_at) ? `SAVED ${savedOn(it.saved_at).toUpperCase()}` : "SAVED"}</div>
                  </div>
                )}
              </div>
              {lines.length > 0 ? (
                <dl className="m-0 flex flex-col gap-1">
                  {lines.map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[13px] min-w-0">
                      <dt className="shrink-0 w-[64px] text-white/45 text-[10.5px] tracking-[0.1em] pt-[2px]" style={MONO}>{k.toUpperCase()}</dt>
                      <dd className="m-0 min-w-0 text-white/85 line-clamp-2 break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="m-0 text-[13px] text-white/45">Mostly your house details.</p>}
              <div className="flex items-center gap-1.5 mt-auto pt-1">
                <button type="button" onClick={() => start(it.id)} className="flex-1 min-h-[42px] rounded-[10px] font-bold text-[14px] flex items-center justify-center gap-1.5" style={{ background: color, color: "#0d0d0d" }}>
                  <Play className="w-4 h-4" />Start {kind === "offer" ? "an offer" : "an event"}
                </button>
                {confirm === it.id ? (
                  <button type="button" onClick={() => act(async () => { await removeNamed(user.id, category, kind, it.id); setConfirm(""); })} className="min-h-[42px] px-3 rounded-[10px] text-[13px] font-bold text-red-300 border border-red-500/40">Delete it</button>
                ) : (
                  <>
                    <button type="button" aria-label={`Duplicate ${it.name}`} title="Duplicate" onClick={() => duplicate(it)} className="w-[42px] h-[42px] rounded-[10px] border border-[#2a2a2a] flex items-center justify-center text-white/65"><Copy className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Rename ${it.name}`} title="Rename" onClick={() => { setEditing(it.id); setName(it.name); setConfirm(""); }} className="w-[42px] h-[42px] rounded-[10px] border border-[#2a2a2a] flex items-center justify-center text-white/65"><Pencil className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Delete ${it.name}`} title="Delete" onClick={() => setConfirm(it.id)} className="w-[42px] h-[42px] rounded-[10px] border border-[#2a2a2a] flex items-center justify-center text-white/65"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={startFresh} className="rounded-[14px] border-[1.5px] border-dashed p-3.5 min-h-[120px] flex flex-col items-center justify-center gap-1.5 text-center" style={{ borderColor: `${color}66`, color }}>
          <Plus className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[15px] font-bold">New {noun} template</span>
          <span className="text-[12.5px] text-white/55 max-w-[260px]">Fill in an {noun === "offer" ? "offer" : "event"}, then tap Save as a template under {kind === "offer" ? "Send offer" : "Create event"}.</span>
        </button>
      </div>
      {items.length === 0 && (
        <p className="m-0 text-[12.5px] text-white/45 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />No {noun} templates yet.</p>
      )}
      {err && <p className="m-0 text-[12.5px] text-red-300">{err}</p>}
    </div>
  );
}
