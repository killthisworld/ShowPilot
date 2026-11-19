import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { respondToOffer, venueConfirmPackage, OFFER_BLUE } from "@/lib/bookingPackage";
import { ConfirmDates, BookedBurst } from "@/components/showpilot/BookingConfirm";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import TimeSelect from "@/components/showpilot/TimeSelect";
import { offerReadCircles, NEEDS } from "@/components/showpilot/OfferFields";
import { techRiderHas, promoHas } from "@/components/showpilot/BookingFields";
import { loadActTemplates, packageFromTemplate } from "@/lib/bookingTemplate";

// A venue's offer, as the act opens it (job 348). The key opens the venue's
// web (read-only). The act ticks the dates that work (or suggests others),
// attaches its own package, and sends it back as one answer. The venue
// confirms one, or sends other dates, until it is booked. No account needed
// to look; answering needs one (the register page, back here after).
const BLUE = OFFER_BLUE;
const GREEN = "#8CFF3D";
const MONO = { fontFamily: "'JetBrains Mono', monospace" };
const btn = "w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2";
const label = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const inputCls = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
const fmtDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// A blank act package, the shape My Templates fills in.
const EMPTY = {
  band_name: "", set_length_minutes: "", genre_tags: [], band_members: [], stage_plot_url: "", stage_plot_files: [], general_notes: "",
  submitter_name: "", submitter_phone: "", submitter_email: "", photo_url: "", promo_links: [], hospitality: {}, merch: {}, deal: {}, riders: {},
  submitter_title: "", promo_picked: [], promo_images: {}, tech: {}, deal_files: [],
};
const toData = (form) => { const { band_name, ...rest } = form; return rest; };

// Which of the venue's asks the act's package covers.
const covered = (k, f) => ({
  plot: (f.band_members || []).length > 0 || has(f.stage_plot_url) || (f.stage_plot_files || []).length > 0,
  rider: techRiderHas(f),
  bio: has(f.general_notes) || has(f.photo_url),
  promo: promoHas(f),
  w9: (f.deal_files || []).length > 0,
  guests: has(f.hospitality?.guests),
}[k]);

function ReplyForm({ pkg, user, source, initial, busy, error, onSubmit, onBack }) {
  const venueName = pkg.sender?.name || "the venue";
  const [picked, setPicked] = useState(() => (initial?.offers || []).filter((o) => source.some((s) => s.date === o.date)).map((o) => o.date));
  const [extra, setExtra] = useState(() => (initial?.offers || []).filter((o) => !source.some((s) => s.date === o.date)));
  const [pick, setPick] = useState("");
  const [message, setMessage] = useState(initial?.message || "");
  const [acts, setActs] = useState(null);
  const [actId, setActId] = useState("");
  const [form, setForm] = useState({ ...EMPTY, band_name: pkg.act_name || "", ...(initial?.reply || {}) });
  const today = new Date().toISOString().slice(0, 10);
  const needs = (Array.isArray(pkg.data?.needs) ? pkg.data.needs : []).map((k) => NEEDS.find(([x]) => x === k)).filter(Boolean);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const list = await loadActTemplates(user.id);
        if (gone) return;
        setActs(list);
        const match = list.find((a) => a.name.trim().toLowerCase() === String(pkg.act_name || "").trim().toLowerCase()) || (list.length === 1 ? list[0] : null);
        if (match && !initial?.reply) pickAct(match, list);
      } catch (e) { console.error(e); if (!gone) setActs([]); }
    })();
    return () => { gone = true; };
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickAct = async (act, list = acts) => {
    setActId(act.id);
    const { data: prefs } = await supabase.from("user_preferences").select("display_name").eq("user_id", user.id).maybeSingle();
    setForm((f) => packageFromTemplate(act, { ...f, submitter_name: f.submitter_name || prefs?.display_name || "", submitter_email: f.submitter_email || user.email || "" }, EMPTY));
  };

  const toggle = (d) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const addExtra = () => {
    if (!pick || pick < today || extra.some((e) => e.date === pick) || source.some((s) => s.date === pick) || picked.length + extra.length >= 10) return;
    const last = extra[extra.length - 1] || {};
    setExtra([...extra, { date: pick, set_time: last.set_time || "", load_in: last.load_in || "", billing: "" }].sort((a, b) => a.date.localeCompare(b.date)));
    setPick("");
  };
  const patchExtra = (date, p) => setExtra(extra.map((e) => (e.date === date ? { ...e, ...p } : e)));
  const dates = [...source.filter((s) => picked.includes(s.date)), ...extra];
  const total = dates.length;
  const hasPackage = !!actId || (form.band_members || []).length > 0 || has(form.general_notes);

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex justify-center px-4 py-6 lg:px-10 lg:py-10">
      <div className="w-full max-w-[560px] flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] tracking-[0.14em]" style={{ ...MONO, color: BLUE }}>{venueName.toUpperCase()} OFFERED</span>
          <h1 className="m-0 text-[36px] font-bold leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Which nights work?</h1>
        </div>

        <section className="rounded-[14px] border border-[#262626] bg-[#151515] p-4 flex flex-col gap-3">
          <span className={label} style={MONO}>THEIR DATES: TAP EVERY ONE THAT WORKS</span>
          {source.map((s) => {
            const on = picked.includes(s.date);
            return (
              <button key={s.date} type="button" aria-pressed={on} onClick={() => toggle(s.date)} className="min-h-[64px] rounded-[12px] border px-3.5 py-2.5 text-left flex items-center gap-3"
                style={on ? { borderColor: BLUE, background: `${BLUE}14` } : { borderColor: "#2a2a2a", background: "#101010" }}>
                <span className="w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center text-[13px] font-bold shrink-0" style={{ borderColor: BLUE, background: on ? BLUE : "transparent", color: "#0d0d0d" }}>{on ? "✓" : ""}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[15.5px] font-bold">{fmtDate(s.date)}</span>
                  <span className="text-[13px] text-white/65">{[s.billing, s.set_time && `you're on at ${s.set_time}`, s.load_in && `load-in ${s.load_in}`].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
          <div className="flex flex-col gap-2 pt-1">
            <span className={label} style={MONO}>OR SUGGEST ANOTHER NIGHT</span>
            <div className="flex gap-2">
              <input type="date" aria-label="Another date" min={today} value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputCls} flex-1`} />
              <button type="button" onClick={addExtra} disabled={!pick || pick < today} className="shrink-0 min-h-[44px] px-4 rounded-lg text-[14px] font-bold disabled:opacity-40" style={{ background: BLUE, color: "#0d0d0d" }}>Add</button>
            </div>
            {extra.map((e) => (
              <div key={e.date} className="rounded-[12px] border bg-[#101010] px-3 py-2.5 flex flex-col gap-2" style={{ borderColor: `${BLUE}55` }}>
                <div className="flex items-center gap-2"><span className="flex-1 text-[14.5px] font-bold">{fmtDate(e.date)}</span>
                  <button type="button" aria-label={`Remove ${fmtDate(e.date)}`} onClick={() => setExtra(extra.filter((x) => x.date !== e.date))} className="w-9 h-9 flex items-center justify-center text-white/55"><X className="w-4 h-4" /></button></div>
                <div className="flex flex-wrap gap-4">
                  <div><span className={label} style={MONO}>WE'D GO ON AT</span><TimeSelect value={e.set_time || ""} onChange={(v) => patchExtra(e.date, { set_time: v })} color={BLUE} label={`Set time ${fmtDate(e.date)}`} /></div>
                  <div><span className={label} style={MONO}>LOAD-IN</span><TimeSelect value={e.load_in || ""} onChange={(v) => patchExtra(e.date, { load_in: v })} color={BLUE} label={`Load-in ${fmtDate(e.date)}`} /></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[14px] border border-[#262626] bg-[#151515] p-4 flex flex-col gap-3">
          <span className={label} style={MONO}>YOUR PACKAGE</span>
          {acts === null ? <p className="m-0 text-[14px] text-white/55">Loading your acts…</p>
            : acts.length ? (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-white/65">Pick the act. Its template fills your package in.</span>
                <div className="flex flex-wrap gap-2">
                  {acts.map((a) => <button key={a.id} type="button" aria-pressed={actId === a.id} onClick={() => pickAct(a)} className="min-h-[44px] px-4 rounded-full text-[14px] font-bold border" style={actId === a.id ? { borderColor: BLUE, background: `${BLUE}22`, color: "#BFDBFE" } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" }}>{a.name || "Unnamed act"}</button>)}
                </div>
              </div>
            ) : (
              <label><span className={label} style={MONO}>ACT NAME</span><input value={form.band_name} onChange={(e) => setForm({ ...form, band_name: e.target.value })} className={inputCls} placeholder="Who's playing" /></label>
            )}
          {needs.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[13px] text-white/65">{pkg.sender?.name || "They"} asked for:</span>
              {needs.map(([k, t]) => {
                const ok = covered(k, form);
                return <div key={k} className="min-h-[40px] px-3 rounded-[10px] border border-[#262626] bg-[#101010] flex items-center gap-2.5 text-[14px]"><span style={{ color: ok ? GREEN : "#FFB020" }}>{ok ? "✓" : "!"}</span>{t}<span className="ml-auto text-[12px]" style={{ color: ok ? GREEN : "#FFB020" }}>{ok ? "in your package" : "not in it yet"}</span></div>;
              })}
              <span className="text-[12.5px] text-white/50">Anything missing, add to the act in My Templates, or tell them in your note.</span>
            </div>
          )}
        </section>

        <label>
          <span className={label} style={MONO}>NOTE FOR {venueName.toUpperCase()} (OPTIONAL)</span>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything about the deal, dietary needs, who's coming." className={`${inputCls} py-2.5 resize-none`} />
        </label>

        {error && <p className="m-0 text-center text-[14px] text-red-400">{error}</p>}
        <button type="button" disabled={!total || busy} onClick={() => onSubmit(dates, message, hasPackage ? toData(form) : {}, form.band_name)} className={`${btn} disabled:opacity-50`} style={{ background: BLUE, color: "#0d0d0d" }}>
          {busy ? "Sending…" : total ? `Send ${total} date${total === 1 ? "" : "s"}${hasPackage ? " and my package" : ""}` : "Pick a date"}
        </button>
        <button type="button" onClick={onBack} className="min-h-[44px] text-[14px] text-white/60">Back to the offer</button>
        <p className="m-0 text-center text-[12.5px] text-white/50">{venueName} gets it as one answer and confirms the final date.</p>
      </div>
    </div>
  );
}

export default function ActOfferView({ pkg, code, reload }) {
  const { user } = useAuth();
  const [step, setStep] = useState("web"); // web | reply | decline | sent | passed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [share, setShare] = useState("");
  const venueName = pkg.sender?.name || "The venue";
  const here = `/p/${String(pkg.code).toUpperCase()}`;
  const venueDates = Array.isArray(pkg.wants?.dates) ? pkg.wants.dates : [];
  // The venue's dates on a first look; its new dates after it counters.
  const source = pkg.status === "countered" ? (pkg.offers || []) : venueDates;
  const answeredElsewhere = pkg.taken && step === "web";
  const circles = useMemo(() => offerReadCircles(pkg), [pkg]);

  useEffect(() => {
    if (pkg.status !== "booked" || !pkg.is_venue || !pkg.show_id || !user) return;
    supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("show_id", pkg.show_id).maybeSingle().then(({ data }) => setShare(data?.share_token || ""));
  }, [pkg.status, pkg.show_id, pkg.is_venue, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (dates, message, reply, act) => {
    setBusy(true);
    setError("");
    try {
      await respondToOffer({ code, dates, message, decline: false, reply, act });
      await reload();
      setStep("sent");
    } catch (e) {
      console.error(e);
      setError(/another account/.test(e?.message || "") ? "Someone else already answered this." : "Couldn't send that. Try again.");
    }
    setBusy(false);
  };
  const pass = async () => {
    setBusy(true);
    setError("");
    try { await respondToOffer({ code, dates: [], message: "", decline: true }); await reload(); setStep("passed"); }
    catch (e) { console.error(e); setError("Couldn't send that. Try again."); }
    setBusy(false);
  };
  const confirmDate = async (date) => {
    setBusy(true);
    setError("");
    try { await venueConfirmPackage(code, date); await reload(); setStep("web"); }
    catch (e) { console.error(e); setError("Couldn't book that. Try again."); }
    setBusy(false);
  };
  const start = () => setStep(user ? (pkg.status === "countered" ? "pick" : "reply") : "join");

  if (step === "join") {
    return (
      <IntakeSent seed={code} title={`Answer ${venueName}`} line="Make a free account to answer. It takes one step, and you come right back here.">
        <div className="mt-6 flex flex-col gap-2.5">
          <a href={`/register?role=band&redirect=${encodeURIComponent(here)}`} className={btn} style={{ background: BLUE, color: "#0d0d0d" }}>Make my account</a>
          <a href={`/login?redirect=${encodeURIComponent(here)}`} className={`${btn} border border-[#333] text-white`}>I'm already on ShowPilot</a>
          <button type="button" onClick={() => setStep("web")} className="mt-1 text-[14px] text-white/60">Back to the offer</button>
        </div>
      </IntakeSent>
    );
  }
  if (step === "reply") {
    return (
      <ReplyForm pkg={pkg} user={user} source={source} busy={busy} error={error}
        initial={pkg.is_venue ? { offers: pkg.offers, message: pkg.venue_message, reply: pkg.reply_data } : null}
        onSubmit={submit} onBack={() => setStep("web")} />
    );
  }
  if (step === "pick" && source.length) {
    return (
      <ConfirmDates pkg={pkg} venueName={venueName} busy={busy} error={error} onConfirm={confirmDate} offers={source}
        tag={`${venueName.toUpperCase()} SENT NEW DATES`} title={`${source.length} date${source.length === 1 ? "" : "s"} to pick from`}
        message={pkg.sender_message || ""} onCounter={() => setStep("reply")} counterLabel="Suggest other dates instead"
        note="Confirming books it: the event is made on their calendar, and you're linked to it with your package." />
    );
  }
  if (step === "decline") {
    return (
      <IntakeSent seed={code} title="Pass on this offer?" line={`${venueName} will see that you can't take it this time.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          {error && <p className="m-0 text-red-400 text-[14px]">{error}</p>}
          <button type="button" disabled={busy} onClick={pass} className={`${btn} border border-[#444] text-white disabled:opacity-50`}>{busy ? "Sending…" : "Yes, not this time"}</button>
          <button type="button" onClick={() => setStep("web")} className="mt-1 text-[14px] text-white/60">Back to the offer</button>
        </div>
      </IntakeSent>
    );
  }
  if (step === "sent" || (step === "web" && pkg.is_venue && pkg.status === "offered")) {
    return (
      <IntakeSent seed={code} title={step === "sent" ? `Answer sent to ${venueName}` : `Waiting on ${venueName}`} line={`You said ${(pkg.offers || []).map((o) => fmtDate(o.date)).join(", ")}. When they confirm one, the event is made on their calendar and yours.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button" onClick={() => setStep("reply")} className={`${btn} border border-[#333] text-white`}>Change my answer</button>
          <button type="button" onClick={() => setStep("look")} className="mt-1 text-[14px] text-white/60">Look at the offer</button>
        </div>
      </IntakeSent>
    );
  }
  if (step === "passed" || (step === "web" && pkg.is_venue && pkg.status === "declined")) {
    return (
      <IntakeSent seed={code} title="You passed on this one" line={`${venueName} knows you can't take it this time.`}>
        <button type="button" onClick={() => setStep("reply")} className={`mt-6 ${btn} border border-[#333] text-white`}>Answer it after all</button>
      </IntakeSent>
    );
  }
  if (pkg.status === "booked" && step === "web") {
    return (
      <BookedBurst seed={code} actName={pkg.act_name} venueName={venueName} date={pkg.picked_date} openHref={share ? `/gig/web?token=${share}` : ""} />
    );
  }

  const place = pkg.sender?.name || "";
  return (
    <IntakeKeyWeb
      readOnly
      startOpen={step === "look"}
      unlockLabel="Open the offer"
      color={BLUE}
      seed={pkg.code}
      image={pkg.sender?.photo || ""}
      keyCode={pkg.code}
      fromLine={`${place || "A venue"} sent ${pkg.to_name || "you"} an offer for`}
      title={pkg.act_name || "Your act"}
      dateLine={source.length ? `${source.length} date${source.length === 1 ? "" : "s"} offered` : ""}
      actName=""
      center={{ name: venueName, photo: pkg.sender?.photo || "", label: "Venue", href: pkg.sender?.card ? `/pilot/${pkg.sender.card}` : "" }}
      circles={circles}
      onSend={answeredElsewhere ? () => {} : start}
      canSend={!answeredElsewhere}
      sendLabel={answeredElsewhere ? "Another account answered this" : pkg.is_venue && pkg.status === "offered" ? "Change my answer" : pkg.status === "countered" ? "See their new dates" : "Answer the offer"}
      belowSend={!answeredElsewhere && ["sent", "countered"].includes(pkg.status) ? (
        <button type="button" onClick={() => setStep(user ? "decline" : "join")} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14.5px] font-semibold text-white/75">Not this time</button>
      ) : null}
    />
  );
}
