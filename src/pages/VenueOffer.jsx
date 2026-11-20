import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, MessageSquare, Mail, Copy, Check, CalendarDays, DollarSign, Speaker, Utensils, Truck, Paperclip } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { saveOffer, sendPackage, counterPackage, loadPackage, packageUrl, OFFER_BLUE } from "@/lib/bookingPackage";
import { ConfirmDates, BookedBurst } from "@/components/showpilot/BookingConfirm";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import { loadOfferTemplate, saveOfferTemplate } from "@/lib/offerTemplate";
import OfferDates from "@/components/showpilot/OfferDates";
import {
  OfferDatesBody, offerDatesDone, OfferDealBody, offerDealDone, OfferRoomBody, offerRoomDone, OfferHospBody, offerHospDone,
  OfferLogiBody, offerLogiDone, OfferFilesBody, offerFilesDone, counterHas, counterLine, OfferProfileBody, offerProfileDone, offerProfile,
} from "@/components/showpilot/OfferFields";
import { useGoBack } from "@/lib/navHistory";

// A venue sends first (job 348): it builds an offer as a web (dates with
// times, the deal, room, hospitality, logistics, files) and sends it to an
// act. The venue itself is the centre (job 385): its picture, name, where it
// is, about the room and its digital card; the act's name goes in Send to. The act answers with the dates that work and its own
// package; the venue confirms one, or sends other dates, until it is booked.
// /offer starts a new one, /offer/:id opens a saved or sent one.
const BLUE = OFFER_BLUE;
const btn = "w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2";
const fmtDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const pick = (o = {}) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => has(v)));

// What the venue's own template already knows (My Templates > Venue).
function fromVenueTemplate(tpl) {
  const g = tpl?.gig || {}, s = tpl?.section || {};
  const vi = g.venue_info && typeof g.venue_info === "object" ? g.venue_info : {};
  const out = { room: {}, hosp: {}, logi: {}, profile: {} };
  const put = (sec, k, v) => { if (has(v) && typeof v !== "object") out[sec][k] = String(v); };
  put("room", "capacity", g.capacity || s.capacity); put("room", "pa", s.pa); put("room", "backline", s.backline);
  put("hosp", "meals", s.meals); put("hosp", "drinks", s.drink_tickets); put("hosp", "green_room", s.green_room);
  put("profile", "name", g.venue); put("profile", "where", g.city); put("profile", "website", vi.website); put("profile", "photo_url", vi.photo_url);
  put("logi", "load_in", [s.load_in_location, s.parking].filter(has).join(", ")); put("logi", "curfew", s.hard_curfew);
  return out;
}

const SendToAct = ({ to, setTo, formatPhone, actName, setActName }) => {
  const input = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";
  const lab = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
  return (
    <div className="flex flex-col gap-3">
      <label><span className={lab}>THE ACT</span><input value={actName} onChange={(e) => setActName(e.target.value)} placeholder="The band you want to book" className={input} /></label>
      <label><span className={lab}>WHO BOOKS THEM</span><input value={to.name || ""} onChange={(e) => setTo({ ...to, name: e.target.value })} placeholder="Their manager or the band" className={input} /></label>
      <label><span className={lab}>THEIR EMAIL</span><input value={to.email || ""} onChange={(e) => setTo({ ...to, email: e.target.value })} type="email" inputMode="email" autoCapitalize="none" placeholder="booking@theband.com" className={input} /></label>
      <label><span className={lab}>OR THEIR PHONE</span><input value={to.phone || ""} onChange={(e) => setTo({ ...to, phone: formatPhone(e.target.value) })} type="tel" inputMode="tel" placeholder="(555) 010-0100" className={input} /></label>
      <span className="text-center text-[12.5px] text-white/55">After you send it, you can text or email them the link. They answer with the dates that work and their package.</span>
    </div>
  );
};
const sendToActDone = (to, act = "") => (has(act) || has(to.name)) && (has(to.email) || has(to.phone));
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
  const [data, setData] = useState({ profile: {}, deal: {}, room: {}, hosp: {}, logi: {} });
  const [wants, setWants] = useState({ dates: [] });
  const [to, setTo] = useState({ name: "", email: "", phone: "" });
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  // The offer template (job 429): new dates start from its times.
  const [tplTimes, setTplTimes] = useState(null);
  const [fromTpl, setFromTpl] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplMsg, setTplMsg] = useState("");
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
      const { data: prefs } = await supabase.from("user_preferences").select("display_name, profile_photo_url, account_type, card_share_token").eq("user_id", user.id).maybeSingle();
      if (gone) return;
      setMe(prefs || {});
      if (routeId) {
        try {
          const r = await loadPackage(routeId);
          if (gone) return;
          if (r && r.kind === "venue") {
            setActName(r.act_name || "");
            setData({ profile: {}, deal: {}, room: {}, hosp: {}, logi: {}, ...(r.data || {}) });
            setWants({ dates: [], ...(r.wants || {}) });
            setTo({ name: r.to_name || "", email: r.to_email || "", phone: r.to_phone || "" });
            if (r.status !== "draft") { setRow(r); if (r.code) setCode(r.code); }
          } else if (r) {
            navigate(`/book/${routeId}`, { replace: true });
          }
        } catch (e) { console.error(e); }
      } else {
        // A new offer starts from the venue's offer template when it has one
        // (job 429), else from what its venue template already has.
        try {
          const { latest, row: offerRow, offer } = await loadOfferTemplate(user.id);
          const t = fromVenueTemplate((offerRow || latest)?.data);
          const base = { name: prefs?.display_name || "", photo_url: prefs?.profile_photo_url || "" };
          if (!gone && offer) {
            const o = offer.data || {};
            setData((d) => ({ ...d, ...o, profile: { ...base, ...pick(t.profile), ...pick(o.profile) }, room: { ...t.room, ...(o.room || {}) }, hosp: { ...t.hosp, ...(o.hosp || {}) }, logi: { ...t.logi, ...(o.logi || {}) } }));
            setTplTimes(offer.times || null);
            setFromTpl(true);
          } else if (!gone) setData((d) => ({ ...d, profile: { ...base, ...pick(t.profile), ...pick(d.profile) }, room: { ...t.room, ...d.room }, hosp: { ...t.hosp, ...d.hosp }, logi: { ...t.logi, ...d.logi } }));
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    })();
    return () => { gone = true; };
  }, [user, routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNow = async () => {
    // No Note / We need since job 385: an older draft drops them when saved.
    const { needs: _n, ...rest } = data;
    const { note: _note, ...wantsOut } = wants;
    const dataOut = { ...rest, photo_url: offerProfile(rest).photo_url || "" };
    const saved = await saveOffer({ id: pkgId, act: actName || to.name, data: dataOut, wants: wantsOut, to: { ...to, name: to.name || actName } });
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
  const toDone = sendToActDone(to, actName);
  const canSend = offerDatesDone(wants) && toDone;
  const profile = offerProfile(data);
  const venueName = profile.name || me?.display_name || "Your venue";
  const actLabel = actName || to.name || "the act";

  const circles = [
    { key: "dates", label: "Dates", short: "Dates", hint: "The nights you're offering, with times", required: true, icon: <CalendarDays />, done: offerDatesDone(wants), body: () => <OfferDatesBody wants={wants} setWants={setWantsD} defaults={tplTimes} /> },
    { key: "deal", label: "The deal", short: "The deal", hint: "Guarantee, door, tickets, ages, merch", required: false, icon: <DollarSign />, done: offerDealDone(data), body: () => <OfferDealBody data={data} setData={setDataD} /> },
    { key: "room", label: "Room and production", short: "Room", hint: "Capacity, stage, house sound and lights, backline", required: false, icon: <Speaker />, done: offerRoomDone(data), body: () => <OfferRoomBody data={data} setData={setDataD} /> },
    { key: "hosp", label: "Hospitality and lodging", short: "Hospitality", hint: "Meals, drinks, green room, guest list, lodging", required: false, icon: <Utensils />, done: offerHospDone(data), body: () => <OfferHospBody data={data} setData={setDataD} /> },
    { key: "logi", label: "Load-in and logistics", short: "Logistics", hint: "Load-in, soundcheck, curfew, merch table", required: false, icon: <Truck />, done: offerLogiDone(data), body: () => <OfferLogiBody data={data} setData={setDataD} /> },
    { key: "files", label: "Documents", short: "Documents", hint: "Agreements and anything they should know first", required: false, icon: <Paperclip />, done: offerFilesDone(data), body: () => <OfferFilesBody data={data} setData={setDataD} uploadFile={uploadFile} /> },
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
      <IntakeSent seed={pkgId || "offer"} title={`Sent to ${to.name || actLabel}`} line={`They'll see your venue, your dates and the deal. Send them the link so it lands right away.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          {to.phone && <a href={smsHref} className={btn} style={{ background: BLUE, color: "#0d0d0d" }}><MessageSquare className="w-4 h-4" />Text it to {to.name || actLabel}</a>}
          {to.email && <a href={mailHref} className={btn} style={to.phone ? { border: "1px solid #333", color: "#fff" } : { background: BLUE, color: "#0d0d0d" }}><Mail className="w-4 h-4" />Email it to {to.name || actLabel}</a>}
          <button type="button" onClick={copy} className="min-h-[48px] rounded-[12px] border border-[#333] text-[15px] font-semibold flex items-center justify-center gap-2 text-white/85">
            {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy the link</>}
          </button>
          <a href="/bookings" className="mt-2 text-center text-[14px] text-white/60 underline">Back to Bookings</a>
        </div>
      </IntakeSent>
    );
  }

  // Save as the offer template (job 429): everything but the dates and who
  // it goes to, so the next offer is just dates and Send to.
  const saveAsTemplate = async () => {
    setSavingTpl(true);
    setTplMsg("");
    try {
      const how = await saveOfferTemplate(user.id, data, wants, venueName);
      const d0 = (wants.dates || [])[0];
      if (d0) setTplTimes({ set_time: d0.set_time || "", load_in: d0.load_in || "", billing: d0.billing || "" });
      setTplMsg(how === "created" ? "Saved, with a new venue template in My Templates. Your next offer starts from this." : "Saved. Your next offer starts from this: just add dates and who it goes to.");
    } catch (e) {
      console.error(e);
      setTplMsg(e?.message && !/^[A-Z_]+$/.test(e.message) ? e.message : "Couldn't save it. Try again.");
    }
    setSavingTpl(false);
  };
  const belowSend = (
    <>
      {fromTpl && !tplMsg && <p className="m-0 text-center text-[12.5px] text-white/50">Filled in from your offer template.</p>}
      <button type="button" onClick={saveAsTemplate} disabled={savingTpl} className="min-h-[44px] text-[14px] font-semibold disabled:opacity-60" style={{ color: BLUE }}>
        {savingTpl ? "Saving…" : fromTpl ? "Update my offer template" : "Save as my offer template"}
      </button>
      {tplMsg && <p className="m-0 text-center text-[13px] text-white/70">{tplMsg}</p>}
    </>
  );

  return (
    <IntakeKeyWeb
      fill // the whole desktop width (job 361)
      startOpen
      color={BLUE}
      seed={pkgId || "offer"}
      title="Make an offer"
      dateLine={actName || to.name ? `To ${actName || to.name}${wl ? ` · ${wl}` : ""}` : "Pick who it goes to"}
      actName={actName || to.name}
      center={{
        // The venue in the middle (job 385): its profile and digital card.
        name: venueName, photo: profile.photo_url || me?.profile_photo_url || "", label: "Venue",
        pane: {
          label: "Your venue", hint: "Your picture, where you are, about the room, your digital card", required: false, done: offerProfileDone(data),
          body: () => <OfferProfileBody data={data} setData={setDataD} uploadFile={uploadFile}
            card={{ token: me?.card_share_token || "", name: me?.display_name || "", photo: me?.profile_photo_url || "", line: "Open your digital card" }} />,
        },
        openLabel: "your venue",
      }}
      onBack={goBack}
      circles={circles}
      corner={{ label: "Send to", icon: Send, required: true, done: toDone, body: () => <SendToAct to={to} setTo={setToD} formatPhone={formatPhone} actName={actName} setActName={(v) => { dirty.current = true; setActName(v); }} /> }}
      onSend={onSend}
      canSend={canSend}
      sending={sending}
      sendLabel="Send offer"
      belowSend={belowSend}
      error={error}
      sent={sent}
      onSentOff={() => setSentOff(true)}
    />
  );
}
