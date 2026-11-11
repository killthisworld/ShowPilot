import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, LayoutTemplate } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { artistFromTemplate } from "@/lib/showTemplates";
import TimeSelect from "@/components/showpilot/TimeSelect";
import LoadTemplateButton from "@/components/showpilot/LoadTemplateButton";

// Edit the lineup on a phone (job 73, Jay 2026-11-11): from the event
// Overview's Lineup, for the event's owner and the Manager / Artist side (the
// same people desktop's Performers lets edit; the server refuses anyone else).
// Add an act (blank or from an artist template), order, billing, set length,
// set time, remove. Saves the way desktop does: the acts through
// update_shared_gig, the set times inside manager_info (update_gig_section
// replaces manager_info whole, so it's re-read just before saving).

const BILLING = [["Opener", "Opener"], ["Headliner", "Headliner"], ["Performer/Group", "Act"], ["N/A", "Not set"]];
const has = (v) => v != null && String(v).trim() !== "";

export default function LineupEditor({ gig, accent = "#8CFF3D", onClose, onSaved }) {
  const token = gig.share_token;
  // Each row keeps every field the act already has, plus `_k`, a key for this
  // screen only, so a set time stays with its act when the name changes.
  const [acts, setActs] = useState(null);
  const [times, setTimes] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_shared_gig", { p_token: token });
      if (off) return;
      if (error || !data) { console.error(error); setErr("Couldn't load the lineup. Check your signal and try again."); setActs([]); return; }
      const st = data.manager_info?.set_times || {};
      const list = (data.bands || []).map((b, i) => ({ ...b, _k: `a${i}` }));
      setActs(list);
      setTimes(Object.fromEntries(list.map((b) => [b._k, st[b.band_name] || ""])));
    })();
    return () => { off = true; };
  }, [token]);

  const close = () => (dirty ? setLeaving(true) : onClose());
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !tplOpen) close(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  });

  const change = (fn) => { setActs((list) => fn([...list])); setDirty(true); setErr(""); };
  const setAct = (i, patch) => change((list) => { list[i] = { ...list[i], ...patch }; return list; });
  const move = (i, d) => change((list) => { [list[i], list[i + d]] = [list[i + d], list[i]]; return list; });
  const remove = (i) => change((list) => list.filter((_, k) => k !== i));
  const add = (act = {}) => change((list) => [...list, { role: "N/A", band_name: "", genre_tags: [], set_length_minutes: "", ...act, _k: `n${Date.now()}${list.length}` }]);
  const timeOf = (a) => times[a._k] || "";
  const setTime = (a, v) => { setTimes((t) => ({ ...t, [a._k]: v })); setDirty(true); };

  const save = async () => {
    if (busy) return;
    const named = acts.filter((a) => has(a.band_name));
    const names = named.map((a) => a.band_name.trim().toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) { setErr("Two acts have the same name. Set times go by name, so give each a different one."); return; }
    setBusy(true); setErr("");
    try {
      // Acts with no name aren't saved (as on desktop, a blank row is nothing yet).
      const bands = named.map(({ _k, ...a }, i) => ({ ...a, band_name: a.band_name.trim(), sort_order: i }));
      // Set times by the act's current name. Times for acts no longer here are dropped.
      const set_times = {};
      acts.forEach((a) => { const n = (a.band_name || "").trim(); const t = timeOf(a); if (n && has(t)) set_times[n] = t; });

      const { data: fresh, error: readErr } = await supabase.rpc("get_shared_gig", { p_token: token });
      if (readErr || !fresh) throw readErr || new Error("Event not found");
      const { error: bandsErr } = await supabase.rpc("update_shared_gig", { p_token: token, p_updates: { bands } });
      if (bandsErr) throw bandsErr;
      const oldTimes = fresh.manager_info?.set_times || {};
      const same = Object.keys(oldTimes).length === Object.keys(set_times).length && Object.entries(set_times).every(([k, v]) => oldTimes[k] === v);
      const manager_info = { ...(fresh.manager_info || {}), set_times };
      if (!same) {
        const { error: timesErr } = await supabase.rpc("update_gig_section", { p_token: token, p_section: "manager", p_updates: manager_info });
        if (timesErr) throw timesErr;
      }
      onSaved?.({ bands, manager_info });
      onClose();
    } catch (e) {
      console.error(e);
      setErr(/owner|permission|not allowed/i.test(e?.message || "") ? "Only the event's owner and the Manager / Artist can change the lineup." : "Couldn't save. Check your signal and try again.");
      setBusy(false);
    }
  };

  const input = "w-full h-11 px-3 rounded-lg bg-[#0d0d0d] border border-[#2a2a2a] text-white text-[16px] outline-none focus:border-white/40";
  const small = "text-[10px] tracking-[0.1em] text-white/45";

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#0d0d0d] flex flex-col" role="dialog" aria-modal="true" aria-label="Edit lineup" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg w-full mx-auto flex flex-col min-h-0 flex-1">
        <div className="flex items-center px-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={close} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
        </div>
        <div className="px-5 pt-1 pb-3">
          <h1 className="m-0 text-[36px] leading-none tracking-[0.04em] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>LINEUP</h1>
          <p className="m-0 mt-1 text-[14px] text-white/55 truncate">{eventTitle(gig)}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 flex flex-col gap-3">
          {acts === null ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
          ) : (
            <>
              {acts.length === 0 && !err && <p className="m-0 py-4 text-[15px] text-white/45">No acts yet.</p>}
              {acts.map((a, i) => (
                <div key={i} className="rounded-xl border border-[#242424] bg-[#121212] p-3 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-right text-[20px] font-bold tabular-nums shrink-0" style={{ color: accent, fontFamily: SCENE_FONT }}>{i + 1}</span>
                    <input value={a.band_name || ""} onChange={(e) => setAct(i, { band_name: e.target.value })} placeholder="Act name" aria-label={`Act ${i + 1} name`} className={`${input} font-semibold flex-1 min-w-0`} />
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" className="w-9 h-11 shrink-0 rounded-lg bg-[#1c1c1c] text-white/75 flex items-center justify-center disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === acts.length - 1} aria-label="Move later" className="w-9 h-11 shrink-0 rounded-lg bg-[#1c1c1c] text-white/75 flex items-center justify-center disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(i)} aria-label={`Remove ${a.band_name || "this act"}`} className="w-9 h-11 shrink-0 rounded-lg text-white/40 active:text-red-400 flex items-center justify-center"><Trash2 className="w-[18px] h-[18px]" /></button>
                  </div>
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#0d0d0d] border border-[#232323]" role="radiogroup" aria-label="Billing">
                    {BILLING.map(([v, l]) => {
                      const on = (a.role || "N/A") === v;
                      return (
                        <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setAct(i, { role: v })}
                          className="h-9 rounded-md text-[13px] font-semibold" style={on ? { background: accent, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.6)" }}>{l}</button>
                      );
                    })}
                  </div>
                  <div className="flex items-end gap-3">
                    <label className="grid gap-1 w-[80px] shrink-0">
                      <span className={small} style={{ fontFamily: SCENE_MONO }}>MINUTES</span>
                      <input value={a.set_length_minutes || ""} onChange={(e) => setAct(i, { set_length_minutes: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="45" aria-label="Set length in minutes" className={input} />
                    </label>
                    <div className="grid gap-1 shrink-0">
                      <span className={small} style={{ fontFamily: SCENE_MONO }}>ON AT</span>
                      <TimeSelect value={timeOf(a)} onChange={(v) => setTime(a, v)} disabled={!has(a.band_name)} color={accent} label={a.band_name ? `${a.band_name} set time` : "Set time"} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => add()} className="h-12 rounded-xl border border-dashed border-[#333] text-white/80 text-[15px] font-semibold flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Add an act</button>
                <button type="button" onClick={() => setTplOpen(true)} className="h-12 rounded-xl border border-dashed border-[#333] text-white/80 text-[15px] font-semibold flex items-center justify-center gap-2"><LayoutTemplate className="w-4 h-4" />From a template</button>
              </div>
            </>
          )}
        </div>

        <div className="px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-[#1e1e1e] flex flex-col gap-2">
          {err && <p role="alert" className="m-0 text-[13.5px] text-red-400">{err}</p>}
          {leaving ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setLeaving(false)} className="flex-1 h-12 rounded-xl bg-[#1f1f1f] text-white/85 text-[15px] font-semibold">Keep editing</button>
              <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl border border-red-500/40 text-red-400 text-[15px] font-semibold">Discard changes</button>
            </div>
          ) : (
            <button type="button" onClick={save} disabled={busy || !dirty || acts === null} className="h-12 rounded-xl text-[16px] font-bold text-[#0d0d0d] disabled:opacity-40" style={{ background: accent }}>
              {busy ? "Saving…" : dirty ? "Save lineup" : "No changes"}
            </button>
          )}
        </div>
      </div>
      <LoadTemplateButton category="artist" hideTrigger open={tplOpen} onOpenChange={setTplOpen}
        onLoad={(name, data) => {
          // Already on the lineup: fill it in from the template; otherwise add it.
          const at = (acts || []).findIndex((a) => (a.band_name || "").trim().toLowerCase() === String(name).trim().toLowerCase());
          const act = artistFromTemplate(name, data);
          if (at === -1) add(act); else setAct(at, act); // keeps its _k, billing and order
          setTplOpen(false);
        }} />
    </div>,
    document.body
  );
}
