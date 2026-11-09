import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, MessageSquare, Mail, Copy, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { fetchMyArtistProfile } from "@/lib/roleTemplates";
import { useActForm } from "@/lib/useActForm";
import { savePackage, sendPackage, loadPackage, loadPublicPackage, wantsLine, packageUrl, PACKAGE_RED } from "@/lib/bookingPackage";
import { ConfirmDates, BookedBurst } from "@/components/showpilot/BookingConfirm";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import { intakeCircles } from "@/components/showpilot/IntakeFields";
import { HospitalityBody, hospitalityHas, PromoBody, promoHas, DatesBody, SendToBody, sendToDone, DealBody, dealHas } from "@/components/showpilot/BookingFields";

// Booking package (job 246, step 1): an artist / manager fills in their act
// as a web, the dates they want, and who it goes to, then sends it with the
// intake web's fly-off. /book starts a new one, /book/:id opens a saved one.
// The venue's side (offer dates or decline) is step 2.

const EMPTY = {
  band_name: "", set_length_minutes: "", genre_tags: [], band_members: [],
  stage_plot_url: "", stage_plot_files: [], general_notes: "",
  submitter_name: "", submitter_phone: "", submitter_email: "",
  photo_url: "", promo_links: [], hospitality: {}, merch: {}, deal: {},
};
// The act's info as the package keeps it (everything but the name).
const toData = (form) => {
  const { band_name, ...rest } = form;
  return rest;
};

export default function BookingPackage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
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
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // The venue's answer (step 3): offered dates to confirm, a pass, or booked.
  const [answer, setAnswer] = useState(null); // { status, offers, venue_message, venueName, show_id, picked_date }
  const [booked, setBooked] = useState(null); // { share_token, date } once confirmed here
  const [confirming, setConfirming] = useState(false);
  const dirty = useRef(false);
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
      if (routeId) {
        try {
          const row = await loadPackage(routeId);
          if (gone) return;
          if (row) {
            setForm({ ...EMPTY, ...(row.data || {}), band_name: row.act_name || "" });
            setWants({ months: [], days: [], note: "", ...(row.wants || {}) });
            setTo({ name: row.to_name || "", email: row.to_email || "", phone: row.to_phone || "" });
            setSeen(Object.fromEntries(["artist", "members", "plot", "notes", "deal", "hosp", "promo", "dates", "contact"].map((k) => [k, true])));
            if (["sent", "offered", "declined", "booked"].includes(row.status) && row.code) setCode(row.code);
            if (["offered", "declined", "booked"].includes(row.status)) {
              let venueName = row.to_name || "";
              try { const pub = await loadPublicPackage(row.code); venueName = pub?.venue?.name || venueName; } catch {}
              let share = "";
              if (row.status === "booked" && row.show_id) {
                const { data: lg } = await supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("show_id", row.show_id).maybeSingle();
                share = lg?.share_token || "";
              }
              if (!gone) setAnswer({ status: row.status, offers: row.offers || [], venue_message: row.venue_message || "", venueName, show_id: row.show_id, picked_date: row.picked_date, share });
            }
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        setForm((f) => ({ ...f, submitter_name: prefs?.display_name || "", submitter_email: user.email || "" }));
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
  const hasMonths = (wants.months || []).length > 0;
  // The order a venue reads it in (job 289): who they are, how they look and
  // sound, the deal, when, hospitality, who to call; the audio side last.
  const circles = [
    byKey.artist && { ...byKey.artist, label: "Artist", short: "Artist", hint: "Name and genre" },
    { key: "promo", label: "Promo", short: "Promo", hint: "Your picture and links the venue can share", required: false,
      done: !!seen.promo && promoHas(form), body: () => <PromoBody form={form} update={h.update} uploadFile={h.uploadFile} /> },
    { key: "deal", label: "Deal and draw", short: "Deal & draw", hint: "What you draw, the deal you're after, tickets, ages, backline", required: false,
      done: !!seen.deal && dealHas(form), body: () => <DealBody form={form} update={h.update} /> },
    { key: "dates", label: "Dates wanted", short: "Dates wanted", hint: "When you'd like to play", required: true,
      done: hasMonths, body: () => <DatesBody wants={wants} setWants={setWantsD} /> },
    { key: "hosp", label: "Hospitality and merch", short: "Hospitality", hint: "Meals, guests, merch table", required: false,
      done: !!seen.hosp && hospitalityHas(form), body: () => <HospitalityBody form={form} update={h.update} /> },
    byKey.contact,
    byKey.members, byKey.plot, byKey.notes,
  ].filter(Boolean);
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
  if (answer?.status === "offered") {
    return <ConfirmDates pkg={answer} venueName={answer.venueName} busy={confirming} error={error} onConfirm={confirm} />;
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
          <a href="/" className="mt-2 text-[14px] text-white/60 underline">Back to ShowPilot</a>
        </div>
      </IntakeSent>
    );
  }

  return (
    <IntakeKeyWeb
      startOpen
      color={PACKAGE_RED}
      seed={pkgId || "package"}
      title="Book a date"
      dateLine={to.name ? `To ${to.name}${wantsLine(wants) ? ` · ${wantsLine(wants)}` : ""}` : "Pick who it goes to"}
      actName={form.band_name}
      center={{
        name: me?.display_name || "You", photo: me?.profile_photo_url || "",
        label: me?.account_type === "band" ? "Artist" : "Mgmt",
        href: me?.card_share_token ? `/pilot/${me.card_share_token}` : "",
      }}
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
    />
  );
}
