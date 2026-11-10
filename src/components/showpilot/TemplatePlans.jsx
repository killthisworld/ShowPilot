import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Template plans (job 295). Venues keep one template (their own); managers
// and artists keep their manager template and their acts: one act free, more
// on a plan. Prices aren't set yet, so picking a plan sends a request that's
// turned on by hand until payments are in.
const RED = "#F87171";
const GREEN = "#8CFF3D";

// Saving past the limit is refused by the database with a TEMPLATE_LIMIT
// message; this tells the screens which one it was.
export function templateLimitKind(err) {
  const m = String(err?.message || "");
  if (m.includes("TEMPLATE_LIMIT_ACTS")) return "acts";
  if (m.includes("TEMPLATE_LIMIT")) return "one";
  return "";
}

export function useTemplatePlan(enabled = true) {
  const [plan, setPlan] = useState(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_template_plan");
    if (error) { console.error(error); setPlan(null); return null; }
    setPlan(data || null);
    return data;
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  return { plan, reload: load, setPlan };
}

const actsText = (n) => (n == null ? "Unlimited acts" : `${n} act${n === 1 ? "" : "s"}`);

export default function TemplatePlansSheet({ plan, onClose, onChanged }) {
  const plans = plan?.plans || [];
  const current = plan?.plan || "free";
  const requested = plan?.requested?.plan || "";
  const [pick, setPick] = useState(requested || plans.find((p) => p.id !== "free" && p.id !== current)?.id || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    setBusy(true);
    setError("");
    const { data, error: e } = await supabase.rpc("request_template_plan", { p_plan: pick, p_note: note });
    setBusy(false);
    if (e) { console.error(e); setError("Couldn't send that. Try again."); return; }
    setSent(true);
    onChanged?.(data);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Host more acts" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[460px] max-h-[92dvh] overflow-y-auto bg-[#141414] border border-[#2a2a2a] rounded-t-[20px] sm:rounded-[20px] p-5 flex flex-col gap-4 text-white">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: RED }}>MY TEMPLATES</span>
            <h2 className="text-[26px] font-bold leading-none mt-1">Host more acts</h2>
            <p className="text-[14px] text-white/60 mt-2 leading-snug">
              You're using {plan?.acts_used ?? 0} of {plan?.acts_limit == null ? "unlimited" : plan.acts_limit} act template{plan?.acts_limit === 1 ? "" : "s"}. Each act you manage or book gets its own template, ready to load on any event or booking package.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 -mt-2 rounded-full flex items-center justify-center text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {sent ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-[14px] border px-4 py-4 flex items-start gap-3" style={{ borderColor: `${GREEN}66`, background: `${GREEN}10` }}>
              <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: GREEN }} />
              <p className="text-[14.5px] text-white/85 leading-snug m-0">Request sent for <span className="font-bold text-white">{plans.find((p) => p.id === pick)?.label}</span>. We'll turn it on for your account and let you know.</p>
            </div>
            <button type="button" onClick={onClose} className="min-h-[50px] rounded-[12px] font-bold text-[15px]" style={{ background: GREEN, color: "#0d0d0d" }}>Done</button>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="Plans" className="flex flex-col gap-2">
              {plans.map((p) => {
                const isCurrent = p.id === current;
                const selectable = !isCurrent && p.id !== "free";
                const on = pick === p.id;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on} disabled={!selectable} onClick={() => setPick(p.id)}
                    className="min-h-[72px] rounded-[14px] px-4 py-3 border text-left flex items-center gap-3 disabled:cursor-default"
                    style={on ? { borderColor: RED, background: `${RED}14` } : { borderColor: "#2a2a2a", background: "#101010" }}>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[16px] font-bold">{p.label}</span>
                        {isCurrent && <span className="text-[10px] tracking-[0.12em] px-1.5 py-[2px] rounded" style={{ fontFamily: SCENE_MONO, color: GREEN, background: `${GREEN}1f` }}>YOUR PLAN</span>}
                        {requested === p.id && !isCurrent && <span className="text-[10px] tracking-[0.12em] px-1.5 py-[2px] rounded text-white/70 bg-white/10" style={{ fontFamily: SCENE_MONO }}>REQUESTED</span>}
                      </span>
                      <span className="block text-[13px] text-white/60 mt-0.5">{actsText(p.acts)}{p.blurb ? ` · ${p.blurb}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-bold text-white/80">{p.price_label || <span className="text-white/45 font-semibold">Price soon</span>}</span>
                    {selectable && <span className="w-[20px] h-[20px] rounded-full shrink-0 box-border" style={on ? { border: `6px solid ${RED}`, background: "#0d0d0d" } : { border: "2px solid #444" }} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] tracking-[0.12em] text-white/55" style={{ fontFamily: SCENE_MONO }}>ANYTHING WE SHOULD KNOW (OPTIONAL)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="I manage 3 acts and book for a 4th." className="w-full min-h-[44px] px-3 py-2.5 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40 resize-none" />
            </label>
            {error && <p className="text-center text-[14px] text-red-400 m-0">{error}</p>}
            <button type="button" disabled={!pick || busy} onClick={send} className="min-h-[52px] rounded-[12px] font-bold text-[16px] disabled:opacity-50" style={{ background: RED, color: "#0d0d0d" }}>
              {busy ? "Sending…" : requested && requested === pick ? "Send the request again" : "Request this plan"}
            </button>
            <p className="text-center text-[12.5px] text-white/45 m-0">Pricing is coming soon. Nothing is charged now.</p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
