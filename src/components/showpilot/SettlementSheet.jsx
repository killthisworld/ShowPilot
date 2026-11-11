import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Camera, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { dealSummary, fileRecord } from "@/lib/eventBusiness";

// Settlement on the night (job 73, "On the road" stage 7). The deal comes
// from the event's Deal (desktop); here you put in the night's numbers and
// see what's owed, mark it paid, and snap the signed sheet into the event's
// Paperwork. Only the owner, the venue side and the manager / artist side
// can open it (get_event_settlement).

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const has = (v) => v != null && String(v).trim() !== "";
export const usd = (n) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

// What the act is owed from the deal and the night's numbers.
export function owedFrom(terms = {}, f = {}) {
  const net = Math.max(0, num(f.gross_door) - num(f.door_costs));
  const pct = num(terms.door_percent) / 100;
  const g = num(terms.guarantee);
  let base = 0;
  if (terms.deal_type === "flat") base = g;
  else if (terms.deal_type === "door") base = net * pct;
  else if (terms.deal_type === "vs") base = Math.max(g, net * pct);
  else base = g;
  const total = base + num(f.buyout) - num(f.deposit_paid) - num(f.merch_cut) + num(f.other);
  return { base, net, total: Math.round(total * 100) / 100 };
}

const FIELDS = [
  { k: "gross_door", label: "Gross door", hint: "Ticket and door money in", door: true },
  { k: "door_costs", label: "Show costs", hint: "Taken off before the split", door: true },
  { k: "buyout", label: "Buyout", hint: "Food or drink money, added" },
  { k: "deposit_paid", label: "Deposit already paid", hint: "Taken off" },
  { k: "merch_cut", label: "Venue merch cut", hint: "Taken off" },
  { k: "other", label: "Other", hint: "Add or take off (use − to take off)" },
];

export default function SettlementSheet({ gig, accent = "#F87171", onClose }) {
  const [state, setState] = useState(null); // { can_view, settlement }
  const [terms, setTerms] = useState(null);
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [snapping, setSnapping] = useState(false);
  const [snapped, setSnapped] = useState(false);
  const fileRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const [s, b] = await Promise.all([
        supabase.rpc("get_event_settlement", { p_show: gig.id }),
        supabase.rpc("get_event_business", { p_show: gig.id }),
      ]);
      if (off) return;
      if (s.error) console.error(s.error);
      setState(s.data || { can_view: false });
      setF(s.data?.settlement?.figures || {});
      setTerms(b.data?.deal?.terms || {});
    })();
    return () => { off = true; };
  }, [gig.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; clearTimeout(timer.current); };
  }, [onClose]);

  const t = terms || {};
  const usesDoor = t.deal_type === "door" || t.deal_type === "vs";
  const calc = useMemo(() => owedFrom(t, f), [t, f]);
  const row = state?.settlement || null;
  const paid = row?.status === "paid";

  // Saves a moment after you stop typing.
  const change = (k, v) => {
    const next = { ...f, [k]: v };
    setF(next); setSaved(false); setErr("");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      const { data, error } = await supabase.rpc("save_event_settlement", { p_show: gig.id, p_figures: next, p_owed: owedFrom(t, next).total });
      setSaving(false);
      if (error) { console.error(error); setErr("Couldn't save. Check your signal."); return; }
      setState((s) => ({ ...s, settlement: data }));
      setSaved(true);
    }, 700);
  };

  const markPaid = async () => {
    setErr("");
    const { data, error } = await supabase.rpc("set_settlement_paid", { p_show: gig.id, p_paid: !paid });
    if (error) { console.error(error); setErr("Couldn't update. Try again."); return; }
    setState((s) => ({ ...s, settlement: data }));
  };

  const snap = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSnapping(true); setErr("");
    try {
      await fileRecord(gig.id, { kind: "other", title: "Signed settlement", file, signed: true, snapshot: { settlement: f, owed: calc.total, deal: t } });
      setSnapped(true);
    } catch (x) {
      console.error(x); setErr("Couldn't file the photo. Try again.");
    }
    setSnapping(false);
  };

  const date = gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  const deal = dealSummary(t);

  return createPortal(
    <div className="fixed inset-0 z-[65] bg-[#0d0d0d] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Settlement" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg mx-auto pb-16">
        <div className="flex items-center px-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
          <span className="flex-1" />
          <span className="pr-3 text-[12px] text-white/45">{saving ? "Saving…" : saved ? "Saved" : ""}</span>
        </div>
        <div className="px-6 pt-2 flex flex-col gap-1">
          <h1 className="m-0 text-[40px] leading-none tracking-[0.04em] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>SETTLEMENT</h1>
          <p className="m-0 text-[15px] text-white/60">{[date, eventTitle(gig)].filter(Boolean).join(" · ")}</p>
        </div>

        {state === null ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
        ) : !state.can_view ? (
          <p className="m-0 px-6 pt-8 text-[15px] text-white/55">Only the venue and the manager / artist can see the money for this event.</p>
        ) : (
          <>
            <div className="px-6 pt-8 flex flex-col gap-1">
              <span className="text-[14px] text-white/55">{paid ? "Paid" : "Owed tonight"}</span>
              <span className="text-[56px] leading-none font-bold" style={{ fontFamily: SCENE_FONT, color: paid ? "#8CFF3D" : accent }}>{usd(calc.total)}</span>
              <span className="text-[13px] text-white/50">
                {deal ? `Deal: ${deal}` : "No deal on this event yet. Add one on desktop under Paperwork, or put the agreed amount in Other."}
                {usesDoor && (num(f.gross_door) > 0) ? ` · net door ${usd(calc.net)}` : ""}
              </span>
              {paid && row?.paid_by_name && <span className="text-[13px] text-[#8CFF3D]">Marked paid by {row.paid_by_name}</span>}
            </div>

            <div className="px-6 pt-6">
              {FIELDS.filter((x) => !x.door || usesDoor).map((x) => (
                <label key={x.k} className="flex items-center gap-3 min-h-[60px] border-b border-[#1f1f1f]">
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[16px] text-white">{x.label}</span>
                    <span className="text-[12px] text-white/40">{x.hint}</span>
                  </span>
                  <span className="flex items-center h-11 w-[132px] px-3 rounded-[10px] bg-[#151515] border border-[#2a2a2a] focus-within:border-white/30">
                    <span className="text-white/40 text-[15px]">$</span>
                    <input
                      value={f[x.k] ?? ""}
                      onChange={(e) => change(x.k, e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={x.label}
                      className="w-full min-w-0 bg-transparent text-right text-white text-[16px] outline-none placeholder:text-white/25"
                      style={{ fontFamily: SCENE_MONO }}
                    />
                  </span>
                </label>
              ))}
              {has(t.guarantee) && (
                <div className="flex items-center justify-between min-h-[52px] text-[14px] text-white/55">
                  <span>Guarantee from the deal</span><span style={{ fontFamily: SCENE_MONO }}>{usd(num(t.guarantee))}</span>
                </div>
              )}
            </div>

            {err && <p className="m-0 px-6 pt-3 text-[13px] text-red-400">{err}</p>}

            <div className="px-6 pt-6 flex flex-col gap-2.5">
              <button type="button" onClick={markPaid} className="h-[54px] rounded-xl text-[16px] font-bold flex items-center justify-center gap-2"
                style={paid ? { border: "1px solid rgba(140,255,61,0.4)", color: "#8CFF3D" } : { background: accent, color: "#0d0d0d" }}>
                {paid ? <><Check className="w-5 h-5" /> Paid · tap to undo</> : "Mark paid"}
              </button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={snap} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={snapping} className="h-[52px] rounded-xl border border-[#444] text-white text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {snapped ? <><Check className="w-5 h-5 text-[#8CFF3D]" /> Filed in Paperwork</> : <><Camera className="w-5 h-5" /> {snapping ? "Filing…" : "Snap the signed sheet"}</>}
              </button>
              {row?.updated_by_name && <span className="pt-1 text-[12px] text-white/40 text-center">Last changed by {row.updated_by_name}</span>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
