import React from "react";
import { ChevronLeft, Check, CheckCircle, Eye, Layers, Save, Loader2 } from "lucide-react";
import { DatesBody, SendToBody, sendToDone, dealHas, promoHas, techRiderHas, hospitalityHas, contactDone } from "@/components/showpilot/BookingFields";

// Book a date in three steps (job 349): when you want to play, which
// template goes with it, who it goes to. Then Send. The web with every
// circle is one tap away ("See what's inside") to check or change anything.
const RED = "#F87171";
const GREEN = "#8CFF3D";
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };

function Step({ n, title, done, children }) {
  return (
    <section aria-label={title} className="rounded-[16px] border border-[#222] bg-[#0d0e14] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[15px] font-bold"
          style={done ? { background: GREEN, color: "#0d0d0d" } : { border: `1.5px solid ${RED}`, color: RED }}>
          {done ? <Check className="w-4 h-4" strokeWidth={3} /> : n}
        </span>
        <h2 className="m-0 text-[22px] leading-none" style={cond}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

const savedOn = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };
const initials = (s) => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function BookSteps({
  form, wants, setWants, to, setTo, formatPhone, acts = [], pickedId = null, onPick,
  canSend, onSend, sending, error, onOpenWeb, onPreview, onBack, onSaveTemplate, saving = false, saveMsg = "",
}) {
  const hasMonths = (wants.months || []).length > 0;
  const picked = acts.find((a) => a.id === pickedId) || null;
  const inside = [
    ["The act & your card", !!String(form.band_name || "").trim()],
    ["Deal & docs", dealHas(form)],
    ["Promo", promoHas(form)],
    ["Tech rider", techRiderHas(form)],
    ["Hospitality", hospitalityHas(form)],
    ["Contact", contactDone(form)],
  ];
  const missing = inside.filter(([, ok]) => !ok).map(([l]) => l);
  const need = [!hasMonths && "the dates", !String(form.band_name || "").trim() && "a template", !sendToDone(to) && "who it goes to"].filter(Boolean);
  return (
    <div className="min-h-[100dvh] bg-[#05060d] text-white">
      <div className="max-w-[640px] mx-auto px-4 pt-4 pb-12 flex flex-col gap-4">
        <button type="button" onClick={onBack} aria-label="Back" className="self-start flex items-center gap-1 min-h-[44px] -ml-2 pl-1.5 pr-3 rounded-[10px] text-[15px] font-semibold text-white/75 hover:text-white">
          <ChevronLeft className="w-5 h-5" />Back
        </button>
        <div>
          <div className="text-[11px] tracking-[0.14em]" style={{ ...mono, color: RED }}>BOOK A DATE</div>
          <h1 className="m-0 text-[36px] leading-[1.02]" style={cond}>{form.band_name || "Pick, then send"}</h1>
          <p className="m-0 mt-1 text-[14px] text-white/60">Pick your dates and your template, say who it goes to, and send.</p>
        </div>

        <Step n={1} title="When you want to play" done={hasMonths}>
          <DatesBody wants={wants} setWants={setWants} />
        </Step>

        <Step n={2} title="Your template" done={!!picked || !!String(form.band_name || "").trim()}>
          {acts.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[14px] text-white/65">No act in My Templates yet. Fill in this package once and save it as your booking template, and next time it's all here.</p>
              <button type="button" onClick={onOpenWeb} className="min-h-[48px] rounded-[12px] border border-[#333] text-[15px] font-semibold flex items-center justify-center gap-2"><Layers className="w-4 h-4" />Fill it in</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Which act">
              {acts.map((a) => {
                const on = a.id === pickedId;
                const photo = a.data?.photo_url || "";
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(a.id)}
                    className="min-h-[64px] rounded-[12px] border px-3 py-2 flex items-center gap-3 text-left"
                    style={on ? { borderColor: RED, background: `${RED}14` } : { borderColor: "#2a2a2a", background: "#101010" }}>
                    <span className="w-11 h-11 rounded-full overflow-hidden shrink-0 border-2 flex items-center justify-center text-[14px] font-bold" style={{ borderColor: RED, color: RED, background: "#1a1012" }}>
                      {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : initials(a.name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] font-bold truncate">{a.name || "Your act"}</span>
                      <span className="block text-[12.5px] text-white/60 truncate">{a.booking ? `Booking template · saved ${savedOn(a.booking.saved_at)}` : "Act only: members, stage plot, notes"}</span>
                    </span>
                    <span aria-hidden="true" className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={on ? { background: RED } : { border: "1.5px solid rgba(255,255,255,0.3)" }}>
                      {on && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {(picked || String(form.band_name || "").trim()) && (
            <div className="flex flex-col gap-2 pt-1">
              <span className="text-[11px] tracking-[0.12em] text-white/55" style={mono}>WHAT GOES WITH IT</span>
              <div className="flex flex-wrap gap-1.5">
                {inside.map(([l, ok]) => (
                  <span key={l} className="min-h-[32px] px-2.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5"
                    style={ok ? { background: `${GREEN}1f`, color: "#B6FF85" } : { border: "1px solid #333", color: "rgba(255,255,255,0.5)" }}>
                    {ok && <Check className="w-3.5 h-3.5" strokeWidth={3} />}{l}
                  </span>
                ))}
              </div>
              {missing.length > 0 && picked && !picked.booking && (
                <p className="m-0 text-[12.5px] text-white/55">Add {missing.join(", ").toLowerCase()} in "See what's inside", then save it as your booking template. Next time it all comes with the act.</p>
              )}
            </div>
          )}
        </Step>

        <Step n={3} title="Who it goes to" done={sendToDone(to)}>
          <SendToBody to={to} setTo={setTo} formatPhone={formatPhone} />
        </Step>

        {error && <p className="m-0 text-[14px] text-red-400 text-center">{error}</p>}
        <button type="button" onClick={() => { if (canSend) onSend(); }} disabled={sending || !canSend}
          aria-label={canSend ? "Send package" : `Send package: add ${need.join(", ")} first`}
          className="w-full min-h-[54px] rounded-[12px] font-bold text-[17px] flex items-center justify-center gap-2"
          style={canSend ? { background: GREEN, color: "#0d0d0d" } : { background: "#1f1f1f", color: "rgba(255,255,255,0.45)", border: "1px solid #333" }}>
          {sending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><CheckCircle className="w-4 h-4" />Send package</>}
        </button>
        {!canSend && need.length > 0 && <p className="m-0 -mt-2 text-center text-[12.5px] text-white/50">Still needs {need.join(", ")}.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpenWeb} className="min-h-[48px] rounded-[12px] border border-[#333] text-[14.5px] font-semibold flex items-center justify-center gap-2 text-white/85"><Layers className="w-4 h-4" />See what's inside</button>
          <button type="button" onClick={onPreview} className="min-h-[48px] rounded-[12px] border border-[#333] text-[14.5px] font-semibold flex items-center justify-center gap-2 text-white/85"><Eye className="w-4 h-4" />View as {to.name || "the venue"}</button>
        </div>
        {onSaveTemplate && String(form.band_name || "").trim() && (
          <button type="button" onClick={onSaveTemplate} disabled={saving} className="self-center min-h-[44px] px-3 text-[14px] font-semibold flex items-center gap-2 disabled:opacity-60" style={{ color: RED }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save as {form.band_name}'s booking template
          </button>
        )}
        {saveMsg && <p className="m-0 -mt-2 text-center text-[13px] text-white/70">{saveMsg}</p>}
      </div>
    </div>
  );
}
