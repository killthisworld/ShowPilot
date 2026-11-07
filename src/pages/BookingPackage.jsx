import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, MessageSquare, Mail, Copy, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { fetchMyArtistProfile } from "@/lib/roleTemplates";
import { useActForm } from "@/lib/useActForm";
import { savePackage, sendPackage, loadPackage, wantsLine, packageUrl, PACKAGE_RED } from "@/lib/bookingPackage";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import { intakeCircles } from "@/components/showpilot/IntakeFields";
import { HospitalityBody, hospitalityHas, PromoBody, promoHas, DatesBody, SendToBody, sendToDone } from "@/components/showpilot/BookingFields";

// Booking package (job 246, step 1): an artist / manager fills in their act
// as a web, the dates they want, and who it goes to, then sends it with the
// intake web's fly-off. /book starts a new one, /book/:id opens a saved one.
// The venue's side (offer dates or decline) is step 2.

const EMPTY = {
  band_name: "", set_length_minutes: "", genre_tags: [], band_members: [],
  stage_plot_url: "", stage_plot_files: [], general_notes: "",
  submitter_name: "", submitter_phone: "", submitter_email: "",
  photo_url: "", promo_links: [], hospitality: {}, merch: {},
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
            setSeen(Object.fromEntries(["artist", "members", "plot", "notes", "hosp", "promo", "dates", "contact"].map((k) => [k, true])));
            if (row.status === "sent" && row.code) setCode(row.code);
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

  const helpers = { ...h, fillFromProfile: { onClick: fillFromTemplate, loading: loadingTemplate } };
  const actCircles = intakeCircles(helpers, { seen, card: { showCard: false } }).filter((c) => c.key !== "role");
  const byKey = Object.fromEntries(actCircles.map((c) => [c.key, c]));
  const hasMonths = (wants.months || []).length > 0;
  const circles = [
    byKey.artist, byKey.members, byKey.plot, byKey.notes,
    { key: "hosp", label: "Hospitality and merch", short: "Hospitality", hint: "Meals, guests, merch table", required: false,
      done: !!seen.hosp && hospitalityHas(form), body: () => <HospitalityBody form={form} update={h.update} /> },
    { key: "promo", label: "Promo", short: "Promo", hint: "Your picture and links the venue can share", required: false,
      done: !!seen.promo && promoHas(form), body: () => <PromoBody form={form} update={h.update} uploadFile={h.uploadFile} /> },
    { key: "dates", label: "Dates wanted", short: "Dates wanted", hint: "When you'd like to play", required: true,
      done: hasMonths, body: () => <DatesBody wants={wants} setWants={setWantsD} /> },
    byKey.contact,
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
