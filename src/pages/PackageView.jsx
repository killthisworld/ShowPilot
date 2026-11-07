import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { loadPublicPackage, wantsLine, PACKAGE_RED } from "@/lib/bookingPackage";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import { packageReadCircles } from "@/components/showpilot/BookingFields";
import OfferDates from "@/components/showpilot/OfferDates";

// A booking package, as the venue opens it (job 246, step 2): the key opens
// the act's web (read-only), with the dates they want. The venue offers up to
// 3 dates or passes. No account needed to look; answering needs one, and a
// new venue gets one in a single step (the register page, back here after).
const BLUE = "#60A5FA";
const fmtDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const btn = "w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2";

export default function PackageView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [pkg, setPkg] = useState(undefined);
  const [step, setStep] = useState("web"); // web | join | offer | decline | sent | passed
  const [booked, setBooked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try { setPkg(await loadPublicPackage(code)); } catch (e) { console.error(e); setPkg(null); }
  };
  useEffect(() => { if (!isLoadingAuth) load(); }, [code, isLoadingAuth, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // My own package: open it where I can follow it.
  useEffect(() => {
    if (pkg?.is_sender && pkg.id) navigate(`/book/${pkg.id}`, { replace: true });
  }, [pkg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nights the venue already has an event, for the offer calendar.
  useEffect(() => {
    if (!user || step !== "offer") return;
    supabase.from("shows").select("date").eq("owner_id", user.id).then(({ data }) => {
      setBooked(new Set((data || []).map((r) => r.date).filter(Boolean)));
    });
  }, [user, step]);

  const respond = async (offers, message, decline) => {
    setBusy(true);
    setError("");
    try {
      const { error: e } = await supabase.rpc("respond_booking_package", { p_code: code, p_offers: offers || [], p_message: message || "", p_decline: !!decline });
      if (e) throw e;
      await load();
      setStep(decline ? "passed" : "sent");
    } catch (e) {
      console.error(e);
      setError(/another account/.test(e?.message || "") ? "Someone else at the venue already answered this." : "Couldn't send that. Try again.");
    }
    setBusy(false);
  };
  const startOffer = () => setStep(user ? "offer" : "join");

  if (pkg === undefined || isLoadingAuth) {
    return <div className="min-h-screen bg-[#05060d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#F87171]/30 border-t-[#F87171] rounded-full animate-spin" /></div>;
  }
  if (!pkg) {
    return <IntakeSent seed={code} bare><p className="text-white/70 text-[16px]">This package isn't available. It may have been taken back.</p></IntakeSent>;
  }
  if (pkg.is_sender) return null;

  const senderName = pkg.sender?.name || "They";
  const wl = wantsLine(pkg.wants);
  const here = `/p/${String(pkg.code).toUpperCase()}`;

  if (step === "join") {
    return (
      <IntakeSent seed={code} title={`Answer ${pkg.act_name}`} line="Make a free venue account to offer dates. It takes one step, and you come right back here.">
        <div className="mt-6 flex flex-col gap-2.5">
          <a href={`/register?role=venue&redirect=${encodeURIComponent(here)}`} className={btn} style={{ background: BLUE, color: "#0d0d0d" }}>Make my venue account</a>
          <a href={`/login?redirect=${encodeURIComponent(here)}`} className={`${btn} border border-[#333] text-white`}>I'm already on ShowPilot</a>
          <button type="button" onClick={() => setStep("web")} className="mt-1 text-[14px] text-white/60">Back to their package</button>
        </div>
      </IntakeSent>
    );
  }

  if (step === "offer") {
    return (
      <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex justify-center px-4 py-6 lg:px-10 lg:py-10">
        <div className="w-full max-w-[460px] lg:max-w-[1080px]">
          <OfferDates wants={pkg.wants} booked={booked} actName={pkg.act_name} submitting={busy} error={error}
            initial={pkg.is_venue ? { offers: pkg.offers, message: pkg.venue_message } : null}
            onSubmit={(offers, message) => respond(offers, message, false)} onBack={() => setStep("web")} />
        </div>
      </div>
    );
  }

  if (step === "decline") {
    return (
      <IntakeSent seed={code} title={`Pass on ${pkg.act_name}?`} line={`${senderName} will see that you can't fit them in this time.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          {error && <p className="text-red-400 text-[14px]">{error}</p>}
          <button type="button" disabled={busy} onClick={() => respond([], "", true)} className={`${btn} border border-[#444] text-white disabled:opacity-50`}>{busy ? "Sending…" : "Yes, not this time"}</button>
          <button type="button" onClick={() => setStep("web")} className="mt-1 text-[14px] text-white/60">Back to their package</button>
        </div>
      </IntakeSent>
    );
  }

  if (step === "sent" || (step === "web" && pkg.is_venue && pkg.status === "offered")) {
    return (
      <IntakeSent seed={code} title={step === "sent" ? `Dates sent to ${senderName}` : `Waiting on ${senderName}`} line={`You offered ${pkg.offers.map((o) => fmtDate(o.date)).join(", ")}. When they pick one, the event is made on your calendar with ${pkg.act_name} filled in.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button" onClick={() => setStep("offer")} className={`${btn} border border-[#333] text-white`}>Change the dates</button>
          <button type="button" onClick={() => setStep("look")} className="mt-1 text-[14px] text-white/60">Look at their package</button>
        </div>
      </IntakeSent>
    );
  }

  if (step === "passed" || (step === "web" && pkg.is_venue && pkg.status === "declined")) {
    return (
      <IntakeSent seed={code} title="You passed on this one" line={`${senderName} knows you can't fit ${pkg.act_name} in this time.`}>
        <button type="button" onClick={() => setStep("offer")} className={`mt-6 ${btn} border border-[#333] text-white`}>Offer dates after all</button>
      </IntakeSent>
    );
  }

  if (pkg.status === "booked" && step === "web") {
    return (
      <IntakeSent seed={code} title={`${pkg.act_name} is booked`} line={pkg.picked_date ? `${fmtDate(pkg.picked_date)}. It's on the calendar with their info filled in.` : "It's on the calendar."}>
        {pkg.is_venue && pkg.show_id && <a href={`/show/${pkg.show_id}`} className={`mt-6 ${btn}`} style={{ background: BLUE, color: "#0d0d0d" }}>Open the event</a>}
      </IntakeSent>
    );
  }

  const answeredElsewhere = pkg.taken && step === "web";
  // The dates they want sit in the corner box, so not a circle as well.
  const circles = packageReadCircles(pkg, wl).filter((c) => c.key !== "dates");
  return (
    <IntakeKeyWeb
      readOnly
      startOpen={step === "look"}
      unlockLabel="Open the package"
      color={PACKAGE_RED}
      seed={pkg.code}
      image={pkg.data?.photo_url || pkg.sender?.photo || ""}
      keyCode={pkg.code}
      fromLine={`${senderName} sent ${pkg.to_name ? pkg.to_name : "you"} a booking package for`}
      title={pkg.act_name}
      dateLine={wl ? `Wants ${wl}` : ""}
      actName=""
      center={{
        name: senderName, photo: pkg.sender?.photo || "",
        label: pkg.sender?.type === "band" ? "Artist" : "Mgmt",
        href: pkg.sender?.card ? `/pilot/${pkg.sender.card}` : "",
      }}
      circles={circles}
      showLabel="Dates wanted"
      show={() => (
        <div className="flex flex-col gap-2 text-center">
          <CalendarDays className="w-8 h-8 mx-auto" style={{ color: PACKAGE_RED }} />
          <div className="text-[13px] tracking-[0.12em] text-white/55" style={{ fontFamily: "'JetBrains Mono', monospace" }}>THEY'RE LOOKING FOR</div>
          <div className="text-[22px] font-bold">{wl || "Any time"}</div>
          {pkg.wants?.note && <p className="text-[15px] text-white/75">"{pkg.wants.note}"</p>}
        </div>
      )}
      onSend={answeredElsewhere ? () => {} : startOffer}
      canSend={!answeredElsewhere}
      sendLabel={answeredElsewhere ? "Another account answered this" : pkg.is_venue && pkg.status === "offered" ? "Change the dates" : "Offer dates"}
      belowSend={!answeredElsewhere && pkg.status === "sent" ? (
        <button type="button" onClick={() => setStep(user ? "decline" : "join")} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14.5px] font-semibold text-white/75">Not this time</button>
      ) : null}
    />
  );
}
