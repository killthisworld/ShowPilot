import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, MessageSquare, Mail, Copy, Check, Eye, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { fetchMyArtistProfile } from "@/lib/roleTemplates";
import { useActForm } from "@/lib/useActForm";
import { savePackage, sendPackage, counterPackage, loadPackage, loadPublicPackage, wantsLine, packageUrl, PACKAGE_RED } from "@/lib/bookingPackage";
import { ConfirmDates, BookedBurst } from "@/components/showpilot/BookingConfirm";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import OfferDates from "@/components/showpilot/OfferDates";
import PackageView from "@/pages/PackageView";
import { intakeCircles } from "@/components/showpilot/IntakeFields";
import { HospitalityBody, hospitalityHas, PromoBody, promoHas, DatesWantedBody, datesHave, SendToBody, sendToDone, DealBody, dealHas, techRiderHas, TechRiderBody, ContactBody, contactDone, ActCenterBody } from "@/components/showpilot/BookingFields";
import { useGoBack } from "@/lib/navHistory";
import { ActPicker } from "@/components/showpilot/BookSteps";
import { loadActTemplates, packageFromTemplate, saveBookingTemplate, sameAct } from "@/lib/bookingTemplate";

// Booking package (job 246, step 1): an artist / manager fills in their act
// as a web, the dates they want, and who it goes to, then sends it with the
// intake web's fly-off. /book starts a new one, /book/:id opens a saved one.
// The venue's side (offer dates or decline) is step 2.

const EMPTY = {
  band_name: "", set_length_minutes: "", genre_tags: [], band_members: [],
  stage_plot_url: "", stage_plot_files: [], general_notes: "",
  submitter_name: "", submitter_phone: "", submitter_email: "",
  photo_url: "", promo_links: [], hospitality: {}, merch: {}, deal: {}, riders: {},
  // Job 332: contact title, promo by size, the tech rider, deal documents.
  submitter_title: "", promo_picked: [], promo_images: {}, tech: {}, deal_files: [],
};
// The act's info as the package keeps it (everything but the name).
const toData = (form) => {
  const { band_name, ...rest } = form;
  return rest;
};

export default function BookingPackage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/bookings");
  const { user, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [pkgId, setPkgId] = useState(routeId || null);
  const [form, setForm] = useState(EMPTY);
  const [wants, setWants] = useState({ months: [], days: [], note: "" });
  const [to, setTo] = useState({ name: "", email: "", phone: "" });
  const [seen, setSeen] = useState({});
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentOff, setSentOff] = useState(false);
  const [preview, setPreview] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // The venue's answer (step 3): offered dates to confirm, a pass, or booked.
  const [answer, setAnswer] = useState(null); // { status, offers, venue_message, venueName, show_id, picked_date }
  const [booked, setBooked] = useState(null); // { share_token, date } once confirmed here
  const [confirming, setConfirming] = useState(false);
  const [countering, setCountering] = useState(false); // sending other dates back (job 347)
  const dirty = useRef(false);
  // The acts in My Templates and the one picked (job 349). Book a date opens
  // straight into the web (job 352); the picker is in the centre circle.
  const [tplActs, setTplActs] = useState([]);
  const [pickedAct, setPickedAct] = useState(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplMsg, setTplMsg] = useState("");
  const [tplOpen, setTplOpen] = useState(false); // the Use a template list under Send (job 447)
  const h = useActForm(form, (fn) => { dirty.current = true; setForm(fn); }, `booking_${user?.id || "anon"}`);

  // Signed in only: a package belongs to its sender.
  useEffect(() => {
    if (isLoadingAuth || user) return;
    const path = window.location.pathname + window.location.search;
    try { sessionStorage.setItem("post_auth_redirect", path); } catch {}
    window.location.href = "/login?redirect=" + encodeURIComponent(path);
  }, [isLoadingAuth, user]);

  // My card for the centre, and the package (or a fresh one).
  useEffect(() => {
    if (!user) return;
    let gone = false;
    (async () => {
      const { data: prefs } = await supabase.from("user_preferences")
        .select("display_name, profile_photo_url, card_share_token, account_type").eq("user_id", user.id).maybeSingle();
      if (gone) return;
      setMe(prefs || {});
      let actList = [];
      try { actList = await loadActTemplates(user.id); } catch (e) { console.error(e); }
      if (gone) return;
      setTplActs(actList);
      if (routeId) {
        try {
          const row = await loadPackage(routeId);
          if (gone) return;
          if (row) {
            setForm({ ...EMPTY, ...(row.data || {}), band_name: row.act_name || "" });
            setPickedAct(actList.find((a) => sameAct(a.name, row.act_name))?.id || null);
            setWants({ months: [], days: [], note: "", ...(row.wants || {}) });
            setTo({ name: row.to_name || "", email: row.to_email || "", phone: row.to_phone || "" });
            setSeen(Object.fromEntries(["center", "members", "tech", "deal", "hosp", "promo", "dates", "contact"].map((k) => [k, true])));
            if (["sent", "offered", "countered", "declined", "booked"].includes(row.status) && row.code) setCode(row.code);
            if (["offered", "countered", "declined", "booked"].includes(row.status)) {
              let venueName = row.to_name || "";
              try { const pub = await loadPublicPackage(row.code); venueName = pub?.venue?.name || venueName; } catch {}
              let share = "";
              if (row.status === "booked" && row.show_id) {
                const { data: lg } = await supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("show_id", row.show_id).maybeSingle();
                share = lg?.share_token || "";
              }
              if (!gone) setAnswer({ status: row.status, offers: row.offers || [], venue_message: row.venue_message || "", offers_from: row.offers_from || "venue", venueName, show_id: row.show_id, picked_date: row.picked_date, share });
            }
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        // A new package fills itself from My Template (job 298): your
        // contact from your manager template, and the act when you have one.
        const { data: tpls } = await supabase.from("saved_templates").select("category, name, data").eq("owner_id", user.id).in("category", ["manager", "artist"]).order("updated_at", { ascending: false });
        if (gone) return;
        const mgr = (tpls || []).find((t) => t.category === "manager")?.data?.section || {};
        const acts = (tpls || []).filter((t) => t.category === "artist");
        const act = acts.length === 1 ? { ...(acts[0].data || {}), band_name: acts[0].data?.band_name || acts[0].name } : null;
        setForm((f) => ({
          ...f,
          submitter_name: mgr.contact_name || prefs?.display_name || "",
          submitter_title: mgr.contact_title || (prefs?.account_type === "band" ? "Artist" : prefs?.account_type === "manager" ? "Manager" : ""),
          submitter_phone: mgr.contact_phone || f.submitter_phone || "",
          submitter_email: mgr.contact_email || user.email || "",
          ...(act ? {
            band_name: act.band_name || "",
            genre_tags: act.genre_tags || f.genre_tags,
            band_members: act.band_members || f.band_members,
            stage_plot_url: act.stage_plot_url || f.stage_plot_url,
            stage_plot_files: act.stage_plot_files || f.stage_plot_files,
            general_notes: act.general_notes || f.general_notes,
            artist_fx_notes: act.artist_fx_notes || f.artist_fx_notes,
            lighting_cues: act.lighting_cues || f.lighting_cues, // the act's cue list (job 445)
            photo_url: act.photo_url || f.photo_url,
          } : {}),
        }));
        if (act) setSeen((s) => ({ ...s, center: true, members: true, tech: true, contact: true }));
        // One act: it's picked, with its booking template when it has one.
        if (actList.length === 1) {
          setPickedAct(actList[0].id);
          if (actList[0].booking) {
            setForm((f) => packageFromTemplate(actList[0], f, EMPTY));
            setSeen((s) => ({ ...s, deal: true, promo: true, tech: true, hosp: true }));
          }
        }
      }
      setLoading(false);
    })();
    return () => { gone = true; };
  }, [user, routeId]);

  // Saved as you go, a second after the last change.
  const saveNow = async () => {
    const row = await savePackage({ id: pkgId, act: form.band_name, data: toData(form), wants, to });
    if (row?.id && !pkgId) {
      setPkgId(row.id);
      navigate(`/book/${row.id}`, { replace: true });
    }
    dirty.current = false;
    return row;
  };
  useEffect(() => {
    if (loading || !user || !dirty.current) return undefined;
    const t = setTimeout(() => { saveNow().catch((e) => console.error(e)); }, 1000);
    return () => clearTimeout(t);
  }, [form, wants, to, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const setWantsD = (v) => { dirty.current = true; setWants(v); };
  const setToD = (v) => { dirty.current = true; setTo(v); };

  const fillFromTemplate = async () => {
    setLoadingTemplate(true);
    try {
      const t = await fetchMyArtistProfile(supabase, user.id);
      if (!t || (!t.band_name && !(t.band_members || []).length)) {
        toast({ title: "No saved artist template yet", description: "Set one up in My Templates." });
      } else {
        dirty.current = true;
        setForm((prev) => ({
          ...prev,
          band_name: t.band_name || prev.band_name,
          set_length_minutes: t.set_length_minutes ?? prev.set_length_minutes,
          genre_tags: t.genre_tags || prev.genre_tags,
          band_members: t.band_members || prev.band_members,
          stage_plot_url: t.stage_plot_url || prev.stage_plot_url,
          stage_plot_files: t.stage_plot_files || prev.stage_plot_files,
          general_notes: t.general_notes || prev.general_notes,
          artist_fx_notes: t.artist_fx_notes || prev.artist_fx_notes,
          lighting_cues: t.lighting_cues || prev.lighting_cues, // the act's cue list (job 445)
          photo_url: t.photo_url || prev.photo_url,
        }));
        toast({ title: "Filled in from your artist template" });
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingTemplate(false);
  };

  const helpers = { ...h, noSetLength: true, fillFromProfile: { onClick: fillFromTemplate, loading: loadingTemplate } };
  const actCircles = intakeCircles(helpers, { seen, card: { showCard: false } }).filter((c) => c.key !== "role");
  const byKey = Object.fromEntries(actCircles.map((c) => [c.key, c]));
  const hasMonths = datesHave(wants);
  // Tech rider > Audio (job 339): the ShowPilot stage plot from My Template,
  // for the act in the centre (or your only act). "" when it worked, or why not.
  const pullTemplatePlot = async () => {
    const { data: rows, error: e } = await supabase.from("saved_templates").select("name, data").eq("owner_id", user.id).eq("category", "artist");
    if (e) throw e;
    const acts = (rows || []).map((r) => ({ ...(r.data || {}), band_name: r.data?.band_name || r.name || "" }));
    const want = form.band_name.trim().toLowerCase();
    const act = acts.find((a) => a.band_name.trim().toLowerCase() === want) || (acts.length === 1 ? acts[0] : null);
    if (!act) return acts.length ? `None of your acts in My Template is called "${form.band_name}". Check the act's name in the centre.` : "No act in My Template yet. Build your stage plot there first.";
    if (!(act.band_members || []).length) return `${act.band_name} has no stage plot in My Template yet. Build it there first.`;
    dirty.current = true;
    setForm((f) => ({ ...f, band_members: act.band_members, artist_fx_notes: f.artist_fx_notes?.length ? f.artist_fx_notes : act.artist_fx_notes || [], general_notes: f.general_notes || act.general_notes || "" }));
    return "";
  };
  // Pick an act (job 349); its booking template fills the rest.
  const pickAct = (id) => {
    const act = tplActs.find((a) => a.id === id);
    if (!act) return;
    dirty.current = true;
    setPickedAct(id);
    setTplMsg("");
    setForm((f) => packageFromTemplate(act, f, EMPTY));
    setSeen((s) => ({ ...s, center: true, members: true, contact: true, tech: true, ...(act.booking ? { deal: true, promo: true, hosp: true } : {}) }));
  };
  const saveAsTemplate = async () => {
    setSavingTpl(true);
    setTplMsg("");
    try {
      const how = await saveBookingTemplate(user.id, form, toData(form));
      const list = await loadActTemplates(user.id);
      setTplActs(list);
      setPickedAct(list.find((a) => sameAct(a.name, form.band_name))?.id || null);
      setTplMsg(how === "created" ? `Saved. ${form.band_name} is in My Templates now, with this package.` : `Saved. Next time, pick ${form.band_name} and it's all here.`);
    } catch (e) {
      console.error(e);
      setTplMsg(e?.message && !/^[A-Z_]+$/.test(e.message) ? e.message : "Couldn't save it. Try again.");
    }
    setSavingTpl(false);
  };
  // Writes that start from the latest form (uploads land late; job 332).
  const updateWith = (field, fn) => { dirty.current = true; setForm((f) => ({ ...f, [field]: fn(f[field]) })); };
  const P = { form, update: h.update, updateWith, uploadFile: h.uploadFile };
  // Clockwise in the order the venue books (job 332): when, the deal and its
  // paperwork, how it'll sell, the tech side (who does sound and lights, the
  // riders, stage plot, cues), the members, hospitality, who to call. The act
  // and your digital card are the centre.
  const circles = [
    { key: "dates", label: "Dates wanted", short: "Dates wanted", hint: "When you'd like to play", required: true,
      done: hasMonths, body: () => <DatesWantedBody wants={wants} setWants={setWantsD} /> },
    { key: "deal", label: "Deal & docs", short: "Deal & docs", hint: "Your draw, the deal you're after, and documents (W9, contract, insurance)", required: false,
      done: !!seen.deal && dealHas(form), body: () => <DealBody {...P} /> },
    { key: "promo", label: "Promo", short: "Promo", required: false,
      done: !!seen.promo && promoHas(form), body: () => <PromoBody {...P} /> },
    { key: "tech", label: "Tech rider", short: "Tech rider", hint: "Audio and lighting: your techs or the venue's, riders, stage plot and inputs, cues", required: false, icon: <SlidersHorizontal />,
      done: !!seen.tech && techRiderHas(form), body: () => <TechRiderBody {...P} h={h} pullTemplatePlot={pullTemplatePlot} /> },
    { key: "hosp", label: "Hospitality and merch", short: "Hospitality", hint: "Meals, guests, merch table, your hospitality rider", required: false,
      done: !!seen.hosp && hospitalityHas(form), body: () => <HospitalityBody {...P} /> },
    { key: "contact", label: "Your contact", short: "Contact", hint: "Name, title, phone and email", required: false,
      done: contactDone(form), body: () => <ContactBody form={form} update={h.update} formatPhone={h.formatPhone} /> },
  ].filter(Boolean);
  // The centre: the act (name, genre, picture) and your digital card.
  const centerPane = {
    label: "The act & your card", hint: "Who's playing, and the card that goes with the package", required: true,
    done: !!form.band_name.trim(),
    body: () => (
      <>
      {tplActs.length > 1 && <div className="mb-3"><ActPicker acts={tplActs} pickedId={pickedAct} onPick={pickAct} /></div>}
      <ActCenterBody form={form} update={h.update} uploadFile={h.uploadFile}
        artistBody={byKey.artist ? byKey.artist.body() : null}
        card={{ token: me?.card_share_token || "", name: me?.display_name || "", photo: me?.profile_photo_url || "", line: "Open your digital card" }} />
      </>
    ),
  };
  const toDone = sendToDone(to);
  const canSend = !!form.band_name.trim() && hasMonths && toDone;

  const onSend = async () => {
    setError("");
    setSending(true);
    try {
      const row = await saveNow();
      const out = await sendPackage(row?.id || pkgId);
      setCode(out.code);
      setSent(true);
    } catch (e) {
      console.error(e);
      setError(/needs/.test(e?.message || "") ? `This still ${e.message.replace(/^needs/, "needs")}.` : "Couldn't send it. Try again.");
    }
    setSending(false);
  };

  const link = code ? packageUrl(code) : "";
  const shareText = useMemo(() => `${form.band_name || "We"} would love to play ${to.name || "your venue"}${wantsLine(wants) ? ` (${wantsLine(wants)})` : ""}. Here's our package: ${link}`, [form.band_name, to.name, wants, link]);

  if (isLoadingAuth || !user || loading) {
    return (
      <div className="min-h-screen bg-[#05060d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#F87171]/30 border-t-[#F87171] rounded-full animate-spin" />
      </div>
    );
  }

  // "View as the venue" (job 301): the package as the venue opens it, from
  // what's in the editor right now. Nothing on it can be sent.
  if (preview) {
    return (
      <PackageView
        onClosePreview={() => setPreview(false)}
        previewPkg={{
          code: code || "PREVIEW", act_name: form.band_name, status: "sent", wants, data: toData(form),
          sender: { name: me?.display_name || "", photo: me?.profile_photo_url || "", type: me?.account_type || "", card: me?.card_share_token || "" },
          to_name: to.name, offers: [], is_sender: false, is_venue: false, taken: false,
        }}
      />
    );
  }
  const viewAsVenue = (
    <button type="button" onClick={() => setPreview(true)} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14.5px] font-semibold text-white/80 flex items-center justify-center gap-2">
      <Eye className="w-4 h-4" />View as {to.name || "the venue"}
    </button>
  );
  // Under Send on the web (job 349): keep this package as the act's template,
  // and (job 447) Use a template: pick an act's saved booking template here.
  const picked = tplActs.find((a) => a.id === pickedAct) || null;
  const withTpl = tplActs.filter((a) => a.booking);
  const webBelowSend = (
    <>
      {viewAsVenue}
      {picked?.booking && !tplOpen && <p className="m-0 text-center text-[12.5px] text-white/50">Filled in from {picked.name}'s booking template.</p>}
      {tplActs.length > 0 && (
        <button type="button" onClick={() => setTplOpen(true)} className="min-h-[44px] text-[14px] font-semibold" style={{ color: PACKAGE_RED }}>Use a template</button>
      )}
      {tplOpen && (
        // Over the page, so the web keeps its size (job 447).
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setTplOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Use a template" onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-[460px] max-h-[88dvh] overflow-y-auto rounded-t-[20px] sm:rounded-[20px] border border-[#2a2a2a] bg-[#141414] p-5 flex flex-col gap-3 text-left">
            <div className="text-[24px] font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Use a template</div>
            <ActPicker acts={tplActs} pickedId={pickedAct} onPick={(id) => { pickAct(id); setTplOpen(false); }} />
            <p className="m-0 text-[12.5px] text-white/50">{withTpl.length ? "An act with a booking template fills in the whole package: the deal, documents, promo, tech rider and hospitality. Dates and who it goes to stay yours to add." : "No booking templates yet. Picking an act fills in its members, stage plot and notes; Save as a booking template under Send keeps the rest for next time."}</p>
            <button type="button" onClick={() => setTplOpen(false)} className="min-h-[44px] rounded-[12px] border border-[#333] text-[14.5px] font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {form.band_name.trim() && (
        <button type="button" onClick={saveAsTemplate} disabled={savingTpl} className="min-h-[44px] text-[14px] font-semibold disabled:opacity-60" style={{ color: PACKAGE_RED }}>
          {savingTpl ? "Saving…" : `Save as ${form.band_name}'s booking template`}
        </button>
      )}
      {tplMsg && <p className="m-0 text-center text-[13px] text-white/70">{tplMsg}</p>}
    </>
  );

  const confirm = async (date) => {
    setConfirming(true);
    setError("");
    try {
      const { data, error: e } = await supabase.rpc("confirm_booking_package", { p_id: pkgId, p_date: date });
      if (e) throw e;
      setBooked({ share_token: data?.share_token || "", date });
    } catch (e) {
      console.error(e);
      setError("Couldn't book it. Try again.");
    }
    setConfirming(false);
  };
  // Passed: the same package to another venue, as a new one.
  // The act sends other dates after the venue's offer (job 347).
  const sendCounter = async (dates, message) => {
    setConfirming(true);
    setError("");
    try {
      await counterPackage(pkgId, dates, message);
      setCountering(false);
      setAnswer((a) => ({ ...a, status: "countered", offers: dates, venueOffers: a?.offers_from === "venue" ? a.offers : a?.venueOffers }));
    } catch (e) {
      console.error(e);
      setError("Couldn't send those. Try again.");
    }
    setConfirming(false);
  };
  const sendElsewhere = async () => {
    try {
      const row = await savePackage({ act: form.band_name, data: toData(form), wants, to: { name: "", email: "", phone: "" } });
      if (row?.id) { setAnswer(null); setCode(""); setPkgId(row.id); navigate(`/book/${row.id}`); }
    } catch (e) { console.error(e); }
  };

  if (booked || answer?.status === "booked") {
    const share = booked?.share_token || answer?.share || "";
    return <BookedBurst seed={pkgId || "package"} actName={form.band_name} venueName={answer?.venueName || to.name} date={booked?.date || answer?.picked_date} openHref={share ? `/gig/web?token=${share}` : ""} />;
  }
  if (answer?.status === "offered" && countering) {
    return (
      <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex justify-center px-4 py-6 lg:px-10 lg:py-10">
        <div className="w-full max-w-[460px] lg:max-w-[1080px]">
          <OfferDates mode="act" wants={wants} actName={form.band_name} submitting={confirming} error={error}
            onSubmit={sendCounter} onBack={() => setCountering(false)} backLabel={`Back to ${answer.venueName || "their"} dates`} />
        </div>
      </div>
    );
  }
  if (answer?.status === "offered") {
    return <ConfirmDates pkg={answer} venueName={answer.venueName} busy={confirming} error={error} onConfirm={confirm} onCounter={() => setCountering(true)} />;
  }
  if (answer?.status === "countered") {
    return (
      <IntakeSent seed={pkgId || "package"} title={`Waiting on ${answer.venueName || to.name || "the venue"}`} line={`You sent ${answer.offers.map((o) => new Date(`${o.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })).join(", ")}. When they confirm one, the event is made on their calendar and yours.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button" onClick={() => { setAnswer({ ...answer, status: "offered", offers: answer.venueOffers || [] }); setCountering(true); }} className="min-h-[52px] rounded-[12px] border border-[#333] text-white font-bold text-[16px]">Change the dates</button>
          <a href="/" className="block mt-1 text-center text-[14px] text-white/60 underline">Back to ShowPilot</a>
        </div>
      </IntakeSent>
    );
  }
  if (answer?.status === "declined") {
    return (
      <IntakeSent seed={pkgId || "package"} title={`${answer.venueName || "The venue"} passed this time`} line={answer.venue_message ? `"${answer.venue_message}"` : "They can't fit you in right now."}>
        <button type="button" onClick={sendElsewhere} className="mt-6 w-full min-h-[52px] rounded-[12px] font-bold text-[16px]" style={{ background: "#8CFF3D", color: "#0d0d0d" }}>Send it to another venue</button>
        <a href="/" className="block mt-3 text-[14px] text-white/60 underline">Back to ShowPilot</a>
      </IntakeSent>
    );
  }

  if (sent && sentOff) {
    const copy = async () => {
      try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
    };
    const smsHref = `sms:${to.phone ? to.phone.replace(/[^\d+]/g, "") : ""}?&body=${encodeURIComponent(shareText)}`;
    const mailHref = `mailto:${to.email || ""}?subject=${encodeURIComponent(`${form.band_name} · booking request`)}&body=${encodeURIComponent(shareText)}`;
    return (
      <IntakeSent seed={pkgId || "package"} title={`Sent to ${to.name}`} line={`They'll see ${form.band_name}'s package and when you want to play${wantsLine(wants) ? ` (${wantsLine(wants)})` : ""}. Send them the link so it lands right away.`}>
        <div className="mt-6 flex flex-col gap-2.5">
          {to.phone && <a href={smsHref} className="min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2" style={{ background: "#8CFF3D", color: "#0d0d0d" }}><MessageSquare className="w-4 h-4" />Text it to {to.name}</a>}
          {to.email && <a href={mailHref} className="min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2" style={to.phone ? { border: "1px solid #333", color: "#fff" } : { background: "#8CFF3D", color: "#0d0d0d" }}><Mail className="w-4 h-4" />Email it to {to.name}</a>}
          <button type="button" onClick={copy} className="min-h-[48px] rounded-[12px] border border-[#333] text-[15px] font-semibold flex items-center justify-center gap-2 text-white/85">
            {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy the link</>}
          </button>
          {viewAsVenue}
          <a href="/" className="mt-2 text-[14px] text-white/60 underline">Back to ShowPilot</a>
        </div>
      </IntakeSent>
    );
  }

  return (
    <IntakeKeyWeb
      fill // the whole desktop width (job 361)
      startOpen
      color={PACKAGE_RED}
      seed={pkgId || "package"}
      title="Book a date"
      dateLine={to.name ? `To ${to.name}${wantsLine(wants) ? ` · ${wantsLine(wants)}` : ""}` : "Pick who it goes to"}
      actName={form.band_name}
      center={{
        name: form.band_name || me?.display_name || "The act", photo: form.photo_url || me?.profile_photo_url || "",
        label: form.band_name ? "The act" : me?.account_type === "band" ? "Artist" : "Mgmt",
        openLabel: "the act and your digital card",
        pane: centerPane,
      }}
      onBack={goBack}
      circles={circles}
      onSave={(key) => setSeen((v) => ({ ...(v || {}), [key]: true }))}
      corner={{ label: "Send to", icon: Send, required: true, done: toDone, body: () => <SendToBody to={to} setTo={setToD} formatPhone={h.formatPhone} /> }}
      onSend={onSend}
      canSend={canSend}
      sending={sending}
      sendLabel={code ? "Send the update" : "Send package"}
      error={error}
      sent={sent}
      onSentOff={() => setSentOff(true)}
      belowSend={webBelowSend}
    />
  );
}
