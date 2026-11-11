import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Minus, Plus, ChevronDown, Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT } from "@/lib/sceneStyle";

// Merch counts (job 73, "On the road" stage 8). Your merch is kept once
// (Edit items: name, price, sizes); each night you count what goes out to
// the table before doors (In) and what comes back after the show (Out).
// Sold = in - out. Items with sizes open to count by size. Private to your
// account. "Add the venue's cut to the settlement" puts the cut on the
// event's Settlement when you can see it.

const usd = (n) => `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const keyOf = (itemId, size) => `${itemId}|${size || ""}`;

export default function MerchSheet({ gig, accent = "#F87171", onClose }) {
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState({}); // key -> { count_in, count_out }
  const [mode, setMode] = useState("in"); // in | out
  const [open, setOpen] = useState(() => new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", price: "", sizes: "" });
  const [cutPct, setCutPct] = useState("");
  const [cutMsg, setCutMsg] = useState("");
  const [err, setErr] = useState("");
  const timers = useRef({});

  const load = useCallback(async () => {
    const [it, ct] = await Promise.all([
      supabase.from("merch_items").select("*").order("created_at", { ascending: true }),
      supabase.from("merch_counts").select("*").eq("show_id", gig.id),
    ]);
    if (it.error) { console.error(it.error); setErr("Couldn't load your merch."); }
    setItems(it.data || []);
    setCounts(Object.fromEntries((ct.data || []).map((c) => [keyOf(c.item_id, c.size), { count_in: c.count_in, count_out: c.count_out }])));
  }, [gig.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = timers.current;
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; Object.values(t).forEach(clearTimeout); };
  }, [onClose]);

  const get = (id, size) => counts[keyOf(id, size)] || { count_in: 0, count_out: 0 };
  const field = mode === "in" ? "count_in" : "count_out";

  const bump = (item, size, d) => {
    const k = keyOf(item.id, size);
    const cur = get(item.id, size);
    const next = { ...cur, [field]: Math.max(0, (cur[field] || 0) + d) };
    setCounts((c) => ({ ...c, [k]: next }));
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(async () => {
      const { error } = await supabase.from("merch_counts").upsert(
        { show_id: gig.id, item_id: item.id, size: size || "", count_in: next.count_in, count_out: next.count_out, updated_at: new Date().toISOString() },
        { onConflict: "owner_id,show_id,item_id,size" }
      );
      if (error) { console.error(error); setErr("Couldn't save a count. Check your signal."); }
    }, 500);
  };

  const sizesOf = (item) => (item.sizes && item.sizes.length ? item.sizes : [""]);
  const soldOf = (item) => sizesOf(item).reduce((n, s) => { const c = get(item.id, s); return n + Math.max(0, c.count_in - c.count_out); }, 0);
  const totalOf = (item, f) => sizesOf(item).reduce((n, s) => n + (get(item.id, s)[f] || 0), 0);

  const totals = useMemo(() => {
    const list = items || [];
    const sold = list.reduce((n, it) => n + soldOf(it), 0);
    const sales = list.reduce((n, it) => n + soldOf(it) * Number(it.price || 0), 0);
    return { sold, sales };
  }, [items, counts]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem = async () => {
    const name = draft.name.trim();
    if (!name) return;
    const sizes = draft.sizes.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);
    const price = draft.price.trim() ? Number(draft.price.replace(/[$,]/g, "")) : null;
    const { error } = await supabase.from("merch_items").insert({ name, price: Number.isFinite(price) ? price : null, sizes });
    if (error) { console.error(error); setErr("Couldn't add that item."); return; }
    setDraft({ name: "", price: "", sizes: "" });
    load();
  };
  const removeItem = async (item) => {
    setItems((l) => l.filter((x) => x.id !== item.id));
    const { error } = await supabase.from("merch_items").delete().eq("id", item.id);
    if (error) { console.error(error); load(); }
  };

  const cutToSettlement = async () => {
    const pct = Number(String(cutPct).replace(/[%\s]/g, ""));
    if (!Number.isFinite(pct) || pct <= 0) return;
    const cut = Math.round(totals.sales * pct) / 100;
    const { data } = await supabase.rpc("get_event_settlement", { p_show: gig.id });
    if (!data?.can_view) { setCutMsg("Only the venue and the manager / artist can change the settlement."); return; }
    const figures = { ...(data.settlement?.figures || {}), merch_cut: String(cut) };
    const owed = data.settlement?.owed != null ? Number(data.settlement.owed) + Number(data.settlement?.figures?.merch_cut || 0) - cut : null;
    const { error } = await supabase.rpc("save_event_settlement", { p_show: gig.id, p_figures: figures, p_owed: owed });
    setCutMsg(error ? "Couldn't update the settlement." : `${usd(cut)} added to the settlement as the venue's merch cut.`);
  };

  const input = "h-11 px-3 rounded-[10px] bg-[#151515] border border-[#2a2a2a] text-white text-[16px] outline-none focus:border-white/30 placeholder:text-white/30";

  return createPortal(
    <div className="fixed inset-0 z-[65] bg-[#0d0d0d] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Merch" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg mx-auto pb-16">
        <div className="flex items-center px-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
          <span className="flex-1" />
          <button type="button" onClick={() => setEditing((e) => !e)} className="h-11 px-4 rounded-[10px] border border-[#444] text-white text-[14px] font-semibold">{editing ? "Done" : "Edit items"}</button>
        </div>
        <div className="px-6 pt-2 flex items-end gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h1 className="m-0 text-[40px] leading-none tracking-[0.04em] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>MERCH</h1>
            <p className="m-0 text-[15px] text-white/60 truncate">{eventTitle(gig)}</p>
          </div>
          {totals.sold > 0 && (
            <div className="flex flex-col items-end shrink-0">
              <span className="text-[30px] leading-none font-bold" style={{ fontFamily: SCENE_FONT, color: accent }}>{totals.sold} sold</span>
              {totals.sales > 0 && <span className="text-[13px] text-white/55">{usd(totals.sales)}</span>}
            </div>
          )}
        </div>

        {!editing && (items || []).length > 0 && (
          <div className="px-6 pt-5">
            <div role="radiogroup" aria-label="Counting" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1a1a1a]">
              {[["in", "In · before doors"], ["out", "Out · after the show"]].map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className="h-11 rounded-[9px] text-[14px] font-bold" style={mode === k ? { background: accent, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.7)" }}>{l}</button>
              ))}
            </div>
          </div>
        )}

        <div className="px-6 pt-3">
          {items === null ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
          ) : items.length === 0 && !editing ? (
            <div className="py-6 flex flex-col gap-3">
              <p className="m-0 text-[15px] text-white/55">Add your merch once (tees, vinyl, posters) and count it every night.</p>
              <button type="button" onClick={() => setEditing(true)} className="h-12 rounded-xl text-[15px] font-bold" style={{ background: accent, color: "#0d0d0d" }}>Add your merch</button>
            </div>
          ) : items.map((item) => {
            const sized = item.sizes && item.sizes.length > 0;
            const expanded = open.has(item.id);
            const value = totalOf(item, field);
            return (
              <div key={item.id} className="border-b border-[#1f1f1f]">
                <div className="flex items-center gap-3 min-h-[68px]">
                  <button type="button" disabled={!sized || editing} onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(item.id)) x.delete(item.id); else x.add(item.id); return x; })} className="flex-1 min-w-0 flex flex-col text-left">
                    <span className="flex items-center gap-1.5 text-[16px] font-semibold text-white">
                      <span className="truncate">{item.name}</span>
                      {sized && !editing && <ChevronDown className={`w-4 h-4 text-white/45 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}
                    </span>
                    <span className="text-[13px] text-white/50 truncate">
                      {editing ? [item.price != null ? usd(Number(item.price)) : null, sized ? item.sizes.join(" ") : null].filter(Boolean).join(" · ") || "No price"
                        : `${soldOf(item)} sold${sized ? ` · tap for sizes` : ""}`}
                    </span>
                  </button>
                  {editing ? (
                    <button type="button" onClick={() => removeItem(item)} aria-label={`Remove ${item.name}`} className="w-11 h-11 flex items-center justify-center text-red-400/80"><Trash2 className="w-[18px] h-[18px]" /></button>
                  ) : sized ? (
                    <span className="w-14 text-right text-[24px] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>{value}</span>
                  ) : (
                    <Counter value={value} onMinus={() => bump(item, "", -1)} onPlus={() => bump(item, "", 1)} label={item.name} />
                  )}
                </div>
                {sized && expanded && !editing && (
                  <div className="pb-3 grid grid-cols-2 gap-2">
                    {item.sizes.map((s) => (
                      <div key={s} className="flex items-center gap-2 rounded-xl bg-[#151515] px-3 py-2">
                        <span className="w-8 text-[13px] font-semibold text-white/70">{s}</span>
                        <Counter small value={get(item.id, s)[field] || 0} onMinus={() => bump(item, s, -1)} onPlus={() => bump(item, s, 1)} label={`${item.name} ${s}`} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {editing && (
            <div className="pt-5 flex flex-col gap-2">
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Item, e.g. Tour tee" aria-label="Item name" maxLength={60} className={input} />
              <div className="flex gap-2">
                <input value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} placeholder="Price" aria-label="Price" inputMode="decimal" className={`${input} w-28`} />
                <input value={draft.sizes} onChange={(e) => setDraft((d) => ({ ...d, sizes: e.target.value }))} placeholder="Sizes, e.g. S M L XL" aria-label="Sizes" className={`${input} flex-1 min-w-0`} />
              </div>
              <button type="button" onClick={addItem} disabled={!draft.name.trim()} className="h-12 rounded-xl text-[15px] font-bold disabled:opacity-40" style={{ background: accent, color: "#0d0d0d" }}>Add item</button>
            </div>
          )}
        </div>

        {!editing && totals.sales > 0 && (
          <div className="px-6 pt-8 flex flex-col gap-2">
            <span className="text-[13px] text-white/55">Venue's merch cut</span>
            <div className="flex gap-2">
              <span className="flex items-center h-12 px-3 rounded-xl bg-[#151515] border border-[#2a2a2a] w-28">
                <input value={cutPct} onChange={(e) => { setCutPct(e.target.value); setCutMsg(""); }} inputMode="decimal" placeholder="20" aria-label="Venue cut percent" className="w-full bg-transparent text-white text-[16px] outline-none text-right placeholder:text-white/30" />
                <span className="text-white/45 pl-1">%</span>
              </span>
              <button type="button" onClick={cutToSettlement} disabled={!cutPct} className="flex-1 h-12 rounded-xl border border-[#444] text-white text-[14px] font-semibold disabled:opacity-40">Add to the settlement</button>
            </div>
            {cutMsg && <p className="m-0 text-[13px] text-white/60">{cutMsg}</p>}
          </div>
        )}
        {err && <p className="m-0 px-6 pt-3 text-[13px] text-red-400">{err}</p>}
      </div>
    </div>,
    document.body
  );
}

function Counter({ value, onMinus, onPlus, label, small = false }) {
  const b = small ? "w-9 h-9" : "w-11 h-11";
  return (
    <span className="flex items-center gap-1.5 ml-auto">
      <button type="button" onClick={onMinus} aria-label={`One less ${label}`} className={`${b} rounded-[10px] bg-[#222] text-white flex items-center justify-center`}><Minus className="w-4 h-4" /></button>
      <span className={`${small ? "w-7 text-[18px]" : "w-9 text-[24px]"} text-center font-bold text-white`} style={{ fontFamily: SCENE_FONT }}>{value}</span>
      <button type="button" onClick={onPlus} aria-label={`One more ${label}`} className={`${b} rounded-[10px] bg-[#222] text-white flex items-center justify-center`}><Plus className="w-4 h-4" /></button>
    </span>
  );
}
