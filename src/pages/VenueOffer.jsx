import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, MessageSquare, Mail, Copy, Check, CalendarDays, DollarSign, Speaker, Utensils, Truck, ClipboardCheck, Paperclip } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { saveOffer, sendPackage, counterPackage, loadPackage, packageUrl, OFFER_BLUE } from "@/lib/bookingPackage";
import { ConfirmDates, BookedBurst } from "@/components/showpilot/BookingConfirm";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import OfferDates from "@/components/showpilot/OfferDates";
import {
  OfferDatesBody, offerDatesDone, OfferDealBody, offerDealDone, OfferRoomBody, offerRoomDone, OfferHospBody, offerHospDone,
  OfferLogiBody, offerLogiDone, OfferNeedsBody, offerNeedsDone, OfferNoteBody, OfferFilesBody, offerFilesDone, counterHas, counterLine,
} from "@/components/showpilot/OfferFields";
import { useGoBack } from "@/lib/navHistory";

// A venue sends first (job 348): it builds an offer as a web (dates with
// times, the deal, room, hospitality, logistics, what it needs, a note) and
// sends it to an act. The act answers with the dates that work and its own
// package; the venue confirms one, or sends other dates, until it is booked.
// /offer starts a new one, /offer/:id opens a saved or sent one.
const BLUE = OFFER_BLUE;
const btn = "w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2";
const fmtDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// What the venue's own template already knows (My Templates > Venue).
function fromVenueTemplate(tpl) {
  const g = tpl?.gig || {}, s = tpl?.section || {};
  const out = { room: {}, hosp: {}, logi: {} };
  const put = (sec, k, v) => { if (has(v) && typeof v !== "object") out[sec][k] = String(v); };
  put("room", "capacity", g.capacity || s.capacity); put("room", "pa", s.pa); put("room", "backline", s.backline);
  put("hosp", "meals", s.meals); put("hosp", "drinks", s.drink_tickets); put("hosp", "green_room", s.green_room);
  put("logi", "load_in", [s.load_in_location, s.parking].filter(has).join(", ")); put("logi", "curfew", s.hard_curfew);
  return out;
}

const SendToAct = ({ to, setTo, formatPhone }) => {
  const input = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
  const lab = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
  return (
    <div className="flex flex-col gap-3">
      <label><span className={lab}>ACT OR WHO BOOKS THEM</span><input value={to.name || ""} onChange={(e) => setTo({ ...to, name: e.target.value })} placeholder="Their manager or the band" className={input} /></label>
      <label><span className={lab}>THEIR EMAIL</span><input value={to.email || ""} onChange={(e) => setTo({ ...to, email: e.target.value })} type="email" inputMode="email" autoCapitalize="none" placeholder="booking@theband.com" className={input} /></label>
      <label><span className={lab}>OR THEIR PHONE</span><input value={to.phone || ""} onChange={(e) => setTo({ ...to, phone: formatPhone(e.target.value) })} type="tel" inputMode="tel" placeholder="(555) 010-0100" className={input} /></label>
      <span className="text-center text-[12.5px] text-white/55">After you send it, you can text or email them the link. They answer with the dates that work and their package.</span>
    </div>
  );
};
const sendToActDone = (to) => has(to.name) && (has(to.email) || has(to.phone));
const formatPhone = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

export default function VenueOffer() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/bookings");
  const { user, isLoadingAuth } = useAuth();
  const [pkgId, setPkgId] = useState(routeId || null);
  const [actName, setActName] = useState("");
  const [data, setData] = useState({ deal: {}, room: {}, hosp: {}, logi: {}, needs: ["plot", "rider", "bio"] });
  const [wants, setWants] = useState({ dates: [], note: "" });
  const [to, setTo] = useState({ name: "", email: "", phone: "" });
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentOff, setSentOff] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [row, setRow] = useState(null); // the saved package, once it has been answered
  const [booked, setBooked] = useState(null);
  const [countering, setCountering] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (isLoadingAuth || user) return;
    const path = window.location.pathname + window.location.search;
    try { sessionStorage.setItem("post_auth_redirect", path); } catch {}
    window.location.href = "/login?redirect=" + encodeURIComponent(path);
  }, [isLoadingAuth, user]);

  useEffect(() => {
    if (!user) return undefined;
    let gone = false;
    (async () => {
      const { data: prefs } = await supabase.from("user_preferences").select("display_name, profile_photo_url, account_type").eq("user_id", user.id).maybeSingle();
      if (gone) return;
      setMe(prefs || {});
      if (routeId) {
        try {
          const r = await loadPackage(routeId);
          if (gone) return;
          if (r && r.kind === "venue") {
            setActName(r.act_name || "");
            setData({ deal: {}, room: {}, hosp: {}, logi: {}, needs: [], ...(r.data || {}) });
            setWants({ dates: [], note: "", ...(r.wants || {}) });
            setTo({ name: r.to_name || "", email: r.to_email || "", phone: r.to_phone || "" });
            if (r.status !== "draft") { setRow(r); if (r.code) setCode(r.code); }
          } else if (r) {
            navigate(`/book/${routeId}`, { replace: true });
          }
        } catch (e) { console.error(e); }
      } else {
        // A new offer starts from what the venue's template already has.
        try {
          const { data: tpl } = await supabase.from("saved_templates").select("data").eq("owner_id", user.id).eq("category", "venue").order("updated_at", { ascending: false }).limit(1);
          const t = fromVenueTemplate(tpl?.[0]?.data);
          if (!gone) setData((d) => ({ ...d, room: { ...t.room, ...d.room }, hosp: { ...t.hosp, ...d.hosp }, logi: { ...t.logi, ...d.logi } }));
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    })();
    return () => { gone = true; };
  }, [user, routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNow = async () => {
    const saved = await saveOffer({ id: pkgId, act: actName || to.name, data, wants, to });
    if (saved?.id && !pkgId) { setPkgId(saved.id); navigate(`/offer/${saved.id}`, { replace: true }); }
    dirty.current = false;
    return saved;
  };
  useEffect(() => {
    if (loading || !user || !dirty.current || row) return undefined;
    const t = setTimeout(() => { saveNow().catch((e) => console.error(e)); }, 1000);
    return () => clearTimeout(t);
  }, [data, wants, to, actName, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const setDataD = (v) => { dirty.current = true; setData(v); };
  const setWantsD = (v) => { dirty.current = true; setWants(v); };
  const setToD = (v) => { dirty.current = true; setTo(v); };

  // Files go to the same bucket the act's stage plots do, under this venue.
  const uploadFile = async (file) => {
    const path = `offer-${user.id}/${Date.now()}_${file.name}`;
    const { error: e } = await supabase.storage.from("stage-plots").upload(path, file);
    if (e) throw e;
    return supabase.storage.from("stage-plots").getPublicUrl(path).data.publicUrl;
  };
  const toDone = sendToActDone(to);
  const canSend = offerDatesDone(wants) && toDone;
  const venueName = me?.display_name || "Your venue";
  const actLabel = actName || to.name || "the act";

  const circles = [
    { key: "dates", label: "Dates", short: "Dates", hint: "The nights you're offering, with times", required: true, icon: <CalendarDays />, done: offerDatesDone(wants), body: () => <OfferDatesBody wants={wants} setWants={setWantsD} /> },
    { key: "deal", label: "The deal", short: "The deal", hint: "Guarantee, door, tickets, ages, merch", required: false, icon: <DollarSign />, done: offerDealDone(data), body: () => <OfferDealBody data={data} setData={setDataD} /> },
    { key: "room", label: "Room and production", short: "Room", hint: "Capacity, stage, house sound and lights, backline", required: false, icon: <Speaker />, done: offerRoomDone(data), body: () => <OfferRoomBody data={data} setData={setDataD} /> },
    { key: "hosp", label: "Hospitality and lodging", short: "Hospitality", hint: "Meals, drinks, green room, guest list, lodging", required: false, icon: <Utensils />, done: offerHospDone(data), body: () => <OfferHospBody data={data} setData={setDataD} /> },
    { key: "logi", label: "Load-in and logistics", short: "Logistics", hint: "Load-in, soundcheck, curfew, merch table", required: false, icon: <Truck />, done: offerLogiDone(data), body: () => <OfferLogiBody data={data} setData={setDataD} /> },
    { key: "needs", label: "What we need from you", short: "We need", hint: "What the act attaches when it answers", required: false, icon: <ClipboardCheck />, done: offerNeedsDone(data), body: () => <OfferNeedsBody data={data} setData={setDataD} /> },
    { key: "files", label: "Files", short: "Files", hint: "Your stage plot, tech spec, house rules", required: false, icon: <Paperclip />, done: offerFilesDone(data), body: () => <OfferFilesBody data={data} setData={setDataD} uploadFile={uploadFile} /> },
    { key: "note", label: "Note to the act", short: "Note", hint: "Anything else", required: false, icon: <MessageSquare />, done: !!String(wants.note || "").trim(), body: () => <OfferNoteBody wants={wants} setWants={setWantsD} /> },
  ];

  const onSend = async () => {
    setError("");
    setSending(true);
    try {
      const saved = await saveNow();
      const out = await sendPackage(saved?.id || pkgId);
      setCode(out.code);
      setSent(true);
    } catch (e) {
      console.error(e);
      setError(/needs/.test(e?.message || "") ? `This still ${e.message.replace(/^needs/, "needs")}.` : "Couldn't send it. Try again.");
    }
    setSending(false);
  };

  if (isLoadingAuth || !user || loading) {
    return <div className="min-h-screen bg-[#05060d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#60A5FA]/30 border-t-[#60A5FA] rounded-full animate-spin" /></div>;
  }
  if (me && me.account_type && me.account_type !== "venue") {
    return (
      <IntakeSent seed="offer" title="Offers are for venues" line="A venue builds an offer for an act. Acts and managers book a date from Bookings.">
        <a href="/bookings" className={`mt-6 ${btn}`} style={{ background: BLUE, color: "#0d0d0d" }}>Go to Bookings</a>
      </IntakeSent>
    );
  }

  // ---- After it's sent: the act's answer, and what the venue does next ----
  const answerDates = Array.isArray(row?.offers) ? row.offers : [];
  const confirm = async (date) => {
    setBusy(true);
    setError("");
    try {
      const { data: out, error: e } = await supabase.rpc("confirm_booking_package", { p_id: pkgId, p_date: date });
      if (e) throw e;
      setBooked({ show_id: out?.show_id, date });
    } catch (e) { console.error(e); setError("Couldn't book it. Try again."); }
    setBusy(false);
  };
  const sendCounter = async (dates, message) => {
    setBusy(true);
    setError("");
    try {
      await counterPackage(pkgId, dates, message);
      setRow((r) => ({ ...r, status: "countered", offers: dates, offers_from: "venue" }));
      setCountering(false);
    } catch (e) { console.error(e); setError("Couldn't send those. Try again."); }
    setBusy(false);
  };

  if (booked || row?.status === "booked") {
    const sid = booked?.show_id || row?.show_id;
    return <BookedBurst seed={pkgId || "offer"} actName={actName || row?.act_name} venueName={venueName} date={booked?.date || row?.picked_date} openHref={sid ? `/show/${sid}` : ""} />;
  }
  if (row?.status === "offered" && countering) {
    return (
      <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex justify-center px-4 py-6 lg:px-10 lg:py-10">
        <div className="w-full max-w-[460px] lg:max-w-[1080px]">
          <OfferDates wants={{ dates: wants.dates }} actName={actLabel} submitting={busy} error={error}
            onSubmit={sendCounter} onBack={() => setCountering(false)} backLabel={`Back to ${actLabel}'s dates`} />
        </div>
      </div>
    );
  }
  if (row?.status === "offered") {
    const ans = row.reply_act || actLabel;
    return (
      <ConfirmDates pkg={row} venueName={venueName} busy={busy} error={error} onConfirm={confirm} offers={answerDates}
        tag={`${ans.toUpperCase()} REPLIED`} title={`${answerDates.length} date${answerDates.length === 1 ? "" : "s"} work for them`}
        message={row.venue_message || ""} onCounter={() => setCountering(true)} counterLabel="Send other dates instead"
        extra={counterHas(row.reply_data?.counter) ? (
          <div className="rounded-[12px] border px-3.5 py-3 text-[14px]" style={{ borderColor: `${BLUE}66`, background: `${BLUE}12` }}>
            <span className="block text-[11px] tracking-[0.12em] mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#93C5FD" }}>THEIR ASK ON THE DEAL</span>
            {counterLine(row.reply_data.counter)}
            <span className="block text-[12.5px] text-white/55 mt-1">Confirming a date doesn't accept it. Change the deal on the event if you agree.</span>
          </div>
        ) : null}
        note="Confirming books it: the event is made on your calendar, and they're linked to it with the package they sent." />
    );
  }
  if (row?.status === "countered") {
    return (
      <IntakeSent seed={pkgId || "offer"} title={`Waiting on ${actLabel}`} line={`You sent ${answerDates.map((o) => fmtDate(o.date)).join(", ")}. When they confirm one, the event is made on your calendar.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button" onClick={() => setCountering(true)} className={`${btn} border border-[#333] text-white`}>Change the dates</button>
          <a href="/bookings" className="block mt-1 text-center text-[14px] text-white/60 underline">Back to Bookings</a>
        </div>
      </IntakeSent>
    );
  }
  if (row?.status === "declined") {
    return (
      <IntakeSent seed={pkgId || "offer"} title={`${actLabel} passed this time`} line={row.venue_message ? `"${row.venue_message}"` : "They can't take this one."}>
        <a href="/offer" className={`mt-6 ${btn}`} style={{ background: BLUE, color: "#0d0d0d" }}>Make another offer</a>
      </IntakeSent>
    );
  }

  const link = code ? packageUrl(code) : "";
  const wl = (wants.dates || []).map((d) => fmtDate(d.date)).join(", ");
  const shareText = `${venueName} would love to have ${actLabel}${wl ? ` (${wl})` : ""}. Here's our offer: ${link}`;
  if ((sent && sentOff) || (row && row.status === "sent")) {
    const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} };
    const smsHref = `sms:${to.phone ? to.phone.replace(/[^\d+]/g, "") : ""}?&body=${encodeURIComponent(shareText)}`;
    const mailHref = `mailto:${to.email || ""}?subject=${encodeURIComponent(`${venueName} · booking offer`)}&body=${encodeURIComponent(shareText)}`;
    return (
      <IntakeSent seed={pkgId || "offer"} title={`Sent to ${to.name}`} line={`They'll see your dates, the deal and what you need. Send them the link so it lands right away.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          {to.phone && <a href={smsHref} className={btn} style={{ background: BLUE, color: "#0d0d0d" }}><MessageSquare className="w-4 h-4" />Text it to {to.name}</a>}
          {to.email && <a href={mailHref} className={btn} style={to.phone ? { border: "1px solid #333", color: "#fff" } : { background: BLUE, color: "#0d0d0d" }}><Mail className="w-4 h-4" />Email it to {to.name}</a>}
          <button type="button" onClick={copy} className="min-h-[48px] rounded-[12px] border border-[#333] text-[15px] font-semibold flex items-center justify-center gap-2 text-white/85">
            {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy the link</>}
          </button>
          <a href="/bookings" className="mt-2 text-center text-[14px] text-white/60 underline">Back to Bookings</a>
        </div>
      </IntakeSent>
    );
  }

  return (
    <IntakeKeyWeb
      startOpen
      color={BLUE}
      seed={pkgId || "offer"}
      title="Make an offer"
      dateLine={to.name ? `To ${to.name}${wl ? ` · ${wl}` : ""}` : "Pick who it goes to"}
      actName={actName || to.name}
      center={{
        name: venueName, photo: me?.profile_photo_url || "", label: "Venue",
        pane: {
          label: "Who it's for", hint: "The act you're offering the dates to", required: true, done: !!actName.trim() || !!to.name.trim(),
          body: () => (
            <label>
              <span className="block text-[11px] tracking-[0.12em] text-white/55 mb-1.5">ACT NAME</span>
              <input value={actName} onChange={(e) => { dirty.current = true; setActName(e.target.value); }} placeholder="The band you want to book" className="w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40" />
            </label>
          ),
        },
        openLabel: "who it's for",
      }}
      onBack={goBack}
      circles={circles}
      corner={{ label: "Send to", icon: Send, required: true, done: toDone, body: () => <SendToAct to={to} setTo={setToD} formatPhone={formatPhone} /> }}
      onSend={onSend}
      canSend={canSend}
      sending={sending}
      sendLabel="Send offer"
      error={error}
      sent={sent}
      onSentOff={() => setSentOff(true)}
    />
  );
}
