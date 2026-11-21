import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X, ChevronLeft, ChevronRight, Wallet, Music, Briefcase, Building2, MapPin, Star, Users, CalendarDays } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { toast } from "@/components/ui/use-toast";

const AMBER = "#FFB400";
const G = "#8CFF3D";
const mono = { fontFamily: SCENE_MONO };

// The acts as the LD needs them: who stands where and what they play.
const actsToSend = (acts) => (acts || []).filter((a) => (a.band_members || []).length)
  .map((a) => ({ band_name: a.band_name || "", band_members: a.band_members || [] }));
// The wallet icons, as on the Fellow Pilots page.
const WALLET_ICONS = { wallet: Wallet, music: Music, briefcase: Briefcase, building: Building2, "map-pin": MapPin, star: Star, users: Users, calendar: CalendarDays };
const isLd = (p) => /light|\bld\b|\blx\b|lighting/i.test(p.job_title || "");

// Share with LD (job 400, job 440): the audio engineer's stage plot to the
// LD's 3D stage. An LD in your wallets (Fellow Pilots) gets it straight on
// their account - pick the wallet, then them (job 444);
// anyone else gets a link (text, AirDrop, email) - signed in, they load it.
//   show  - the engineer's own event (its id goes along)
//   event - just what the event is (name, date, venue) when it isn't his
export function SendPlotToLdButton({ acts, show = null, event = null, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Share with LD" title="Share with LD"
        className={`${className} lg:w-auto lg:px-3 lg:gap-1.5 text-[12.5px] font-bold`} style={{ color: G }}>
        <Lightbulb className="w-[18px] h-[18px]" /><span className="hidden lg:inline">Share with LD</span>
      </button>
      {open && <SharePlotWithLd acts={acts} show={show} event={event} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SharePlotWithLd({ acts, show = null, event = null, onClose }) {
  const placed = actsToSend(acts);
  const info = show || event || {};
  const where = {
    p_show_id: show?.id || null,
    p_event_name: info.event_name || info.band_name || null,
    p_date: info.date || null,
    p_venue: info.venue || null,
  };
  const [signedIn, setSignedIn] = useState(null);
  const [pilots, setPilots] = useState(null); // Fellow Pilots on Show Pilot
  const [wallets, setWallets] = useState([]);
  const [openWallet, setOpenWallet] = useState(null); // a wallet's id, "none" (not in one), or null (the wallets)
  const [sent, setSent] = useState({}); // pilot_user_id -> "busy" | "sent"
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!live) return;
      setSignedIn(!!user);
      if (!user) return;
      // The engineer's wallets, and who's in each (job 444).
      const [w, f] = await Promise.all([
        supabase.from("wallets").select("id, name, color, icon, icon_image_url, starred, created_at").eq("owner_id", user.id).order("created_at", { ascending: false }),
        supabase.from("fellow_pilots").select("id, wallet_id, pilot_user_id, display_name, job_title, profile_photo_url").eq("owner_id", user.id).order("display_name", { ascending: true }),
      ]);
      if (!live) return;
      const list = (f.data || []).filter((p) => p.pilot_user_id);
      setWallets([...(w.data || []).filter((x) => x.starred), ...(w.data || []).filter((x) => !x.starred)]);
      setPilots([...list.filter(isLd), ...list.filter((p) => !isLd(p))]);
    })();
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sendTo = async (p) => {
    setSent((s) => ({ ...s, [p.pilot_user_id]: "busy" }));
    const { error } = await supabase.rpc("send_stage_plot_to_pilot", { p_user: p.pilot_user_id, p_acts: placed, ...where });
    if (error) {
      setSent((s) => ({ ...s, [p.pilot_user_id]: undefined }));
      toast({ title: "Couldn't send it", description: error.message, variant: "destructive" });
      return;
    }
    setSent((s) => ({ ...s, [p.pilot_user_id]: "sent" }));
    toast({ title: `Sent to ${p.display_name || "your LD"}`, description: "It's waiting on their event." });
  };
  const makeLink = async () => {
    if (link) return link;
    setLinkBusy(true);
    const { data, error } = await supabase.rpc("create_stage_plot_link", { p_acts: placed, ...where });
    setLinkBusy(false);
    if (error || !data) { toast({ title: "Couldn't make the link", description: error?.message, variant: "destructive" }); return ""; }
    const url = `${window.location.origin}/plot/${data}`;
    setLink(url);
    return url;
  };
  const copy = async () => {
    const url = await makeLink();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast({ title: "Copy the link below" }); }
  };
  const shareLink = async () => {
    const url = await makeLink();
    if (!url) return;
    try { await navigator.share({ title: "Stage plot", text: `The stage plot for ${placed.map((a) => a.band_name || "the act").join(", ")} - load it onto your 3D stage`, url }); }
    catch { /* closed the share sheet */ }
  };
  const mail = async () => {
    setMailBusy(true);
    const { data, error } = await supabase.rpc("send_stage_plot", { p_email: email.trim(), p_acts: placed, ...where });
    setMailBusy(false);
    if (error) { toast({ title: "Couldn't send it", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Stage plot sent to your LD", description: data?.has_account ? "It's waiting on their event." : "They'll see it once they sign in to ShowPilot with that email." });
    setEmail("");
  };

  const head = "text-[10px] tracking-[0.18em] text-white/45";
  const ids = new Set(wallets.map((w) => w.id));
  const inWallet = (id) => (pilots || []).filter((p) => p.wallet_id === id);
  const loose = (pilots || []).filter((p) => !p.wallet_id || !ids.has(p.wallet_id));
  const shownWallet = openWallet && openWallet !== "none" ? wallets.find((w) => w.id === openWallet) : null;
  const shown = openWallet === "none" ? loose : openWallet ? inWallet(openWallet) : [];
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/75 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-label="Share with LD" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] max-h-[88dvh] overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 flex flex-col gap-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="text-[10px] tracking-[0.18em]" style={{ ...mono, color: G }}>SHARE WITH LD</div>
            <div className="text-white text-[17px] font-semibold">The stage plot, for their 3D stage</div>
            <p className="text-white/55 text-[13px] leading-snug mt-1">
              {placed.length ? `${placed.map((a) => a.band_name || "An act").join(", ")}: who stands where and what they play. No notes or audio details.` : "No one is on the stage plot yet."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1 flex items-center justify-center text-white/50"><X className="w-5 h-5" /></button>
        </div>

        {signedIn === false ? (
          <p className="text-white/60 text-[13.5px]">Sign in to ShowPilot to share the stage plot.</p>
        ) : !placed.length ? null : (
          <>
            {/* 1. Straight to an LD's account: pick a wallet, then who in it (job 444). */}
            <div className="flex flex-col gap-1.5">
              {pilots === null ? (
                <>
                  <div className={head} style={mono}>ON SHOW PILOT · YOUR WALLETS</div>
                  <div className="text-white/40 text-[13px]">Loading…</div>
                </>
              ) : !openWallet ? (
                <>
                  <div className={head} style={mono}>ON SHOW PILOT · YOUR WALLETS</div>
                  {!wallets.length && !loose.length ? (
                    <div className="text-white/45 text-[13px] leading-snug">No wallets yet. Save your LD's digital card to a wallet to send it straight to their account, or use a link below.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {wallets.map((w) => <WalletTile key={w.id} w={w} count={inWallet(w.id).length} onOpen={() => setOpenWallet(w.id)} />)}
                      {loose.length > 0 && <WalletTile w={{ name: "Not in a wallet", color: "#A3A3A3", icon: "users" }} count={loose.length} onOpen={() => setOpenWallet("none")} />}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setOpenWallet(null)} className="self-start -ml-1 min-h-[32px] pr-2 flex items-center gap-0.5 text-[12.5px] font-semibold text-white/60 hover:text-white">
                    <ChevronLeft className="w-4 h-4" />Wallets
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: shownWallet?.color || "#3a3a3a" }} />
                    <div className="text-white text-[15px] font-semibold truncate">{shownWallet?.name || "Not in a wallet"}</div>
                  </div>
                  {!shown.length ? (
                    <div className="text-white/45 text-[13px] leading-snug">No one in this wallet is on Show Pilot yet. Use a link below.</div>
                  ) : shown.map((p) => {
                    const st = sent[p.pilot_user_id];
                    return (
                      <div key={p.id || p.pilot_user_id} className="flex items-center gap-2.5 rounded-[10px] border border-[#262626] bg-[#101010] px-2.5 py-2">
                        {p.profile_photo_url
                          ? <img src={p.profile_photo_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                          : <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[14px] font-bold bg-[#1f1f1f] text-white/70">{(p.display_name || "?").trim().charAt(0).toUpperCase()}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-[14px] font-semibold truncate">{p.display_name || "Fellow Pilot"}</div>
                          <div className="text-[12px] truncate" style={{ color: isLd(p) ? G : "rgba(255,255,255,0.45)" }}>{p.job_title || "Fellow Pilot"}</div>
                        </div>
                        <button type="button" onClick={() => sendTo(p)} disabled={!!st}
                          className="h-9 px-3.5 rounded-[8px] text-[13px] font-bold shrink-0 disabled:opacity-70"
                          style={st === "sent" ? { background: "transparent", color: G, border: `1px solid ${G}66` } : { background: G, color: "#111" }}>
                          {st === "sent" ? "Sent ✓" : st === "busy" ? "Sending…" : "Send"}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* 2. A link that anyone can open */}
            <div className="flex flex-col gap-1.5">
              <div className={head} style={mono}>A LINK · TEXT, AIRDROP, ANYWHERE</div>
              <div className="flex gap-2">
                <button type="button" onClick={copy} disabled={linkBusy || signedIn === null}
                  className="flex-1 h-11 rounded-xl border text-[14px] font-bold disabled:opacity-50" style={{ borderColor: `${G}66`, color: G, background: "#0f150b" }}>
                  {linkBusy ? "Making the link…" : copied ? "Link copied ✓" : "Copy link"}
                </button>
                {canShare && (
                  <button type="button" onClick={shareLink} disabled={linkBusy || signedIn === null}
                    className="h-11 px-4 rounded-xl border border-[#333] text-white/80 text-[14px] font-bold disabled:opacity-50">Share…</button>
                )}
              </div>
              {link && <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="The link"
                className="h-9 rounded-lg bg-[#0e0e0e] border border-[#2c2c2c] px-2.5 text-[12.5px] text-white/70" />}
              <div className="text-white/40 text-[12px] leading-snug">The LD opens it, signs in, and it loads onto their event for that date.</div>
            </div>

            {/* 3. By email */}
            <div className="flex flex-col gap-1.5">
              <div className={head} style={mono}>BY EMAIL</div>
              <div className="flex gap-2">
                <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your LD's email" aria-label="Your LD's email"
                  className="flex-1 min-w-0 h-11 rounded-xl bg-[#0e0e0e] border border-[#2c2c2c] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#8CFF3D]/60" />
                <button type="button" onClick={mail} disabled={mailBusy || !/^\S+@\S+\.\S+$/.test(email.trim())}
                  className="h-11 px-4 rounded-xl font-bold text-[14px] disabled:opacity-40" style={{ background: G, color: "#111" }}>{mailBusy ? "Sending…" : "Send"}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// A wallet as a small card (job 444): its color or photo, icon and name, and
// how many in it are on Show Pilot.
function WalletTile({ w, count, onOpen }) {
  const Icon = WALLET_ICONS[w.icon] || Wallet;
  const photo = !!w.icon_image_url;
  return (
    <button type="button" onClick={onOpen} aria-label={`${w.name || "Wallet"}, ${count} on Show Pilot`}
      className="relative h-[78px] rounded-xl overflow-hidden text-left px-3 py-2.5 flex flex-col justify-between"
      style={{
        backgroundColor: photo ? "#111" : w.color || "#3a3a3a",
        backgroundImage: photo ? `url(${w.icon_image_url})` : `linear-gradient(135deg, ${w.color || "#3a3a3a"}, ${w.color || "#3a3a3a"}99)`,
        backgroundSize: "cover", backgroundPosition: "center",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 14px rgba(0,0,0,0.4)",
      }}>
      <span className="absolute inset-0 pointer-events-none" style={{ background: photo ? "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.75))" : "radial-gradient(circle at 15% -10%, rgba(255,255,255,0.3), transparent 55%)" }} />
      <span className="relative flex items-start justify-between">
        {photo ? <span /> : <Icon className="w-5 h-5 text-black/80" />}
        <ChevronRight className={`w-4 h-4 ${photo ? "text-white/70" : "text-black/50"}`} />
      </span>
      <span className="relative min-w-0">
        <span className={`block text-[13.5px] font-bold truncate ${photo ? "text-white" : "text-black"}`}>{w.name || "Wallet"}</span>
        <span className={`block text-[11px] ${photo ? "text-white/70" : "text-black/60"}`}>{count} on Show Pilot</span>
      </span>
    </button>
  );
}

// The LD's side (job 400): stage plots audio engineers sent, on the event.
// The one for this event's date first; Load puts the members on the acts.
//   onLoad(acts) -> merges them into the event's acts
export function StagePlotInbox({ date = null, onLoad }) {
  const [shares, setShares] = useState(null);
  const load = async () => {
    const { data, error } = await supabase.rpc("my_stage_plot_shares");
    setShares(error ? [] : data || []);
  };
  useEffect(() => { load(); }, []);
  if (!shares || !shares.length) return null;
  const sorted = [...shares].sort((a, b) => (b.event_date === date) - (a.event_date === date));
  const done = async (s, use) => {
    if (use) onLoad(s.acts || []);
    await supabase.rpc("use_stage_plot_share", { p_id: s.id });
    setShares((list) => list.filter((x) => x.id !== s.id));
    if (use) toast({ title: "Stage plot loaded onto your acts", description: "Save the event to keep it." });
  };
  return (
    <div className="rounded-[12px] border p-2.5 flex flex-col gap-2" style={{ borderColor: AMBER + "66", background: "#1a1408" }}>
      <div className="text-[10px] tracking-[0.18em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>STAGE PLOTS SENT TO YOU</div>
      {sorted.slice(0, 4).map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-white text-[13.5px] font-semibold truncate">{(s.acts || []).map((a) => a.band_name).filter(Boolean).join(", ") || "Stage plot"}</div>
            <div className="text-white/50 text-[12px] truncate">{s.from_name || "Your audio engineer"}{s.event_date ? ` · ${s.event_date}` : ""}{s.venue ? ` · ${s.venue}` : ""}{s.event_date === date ? " · this event" : ""}</div>
          </div>
          <button type="button" onClick={() => done(s, false)} className="h-9 px-2 text-[12.5px] text-white/45 hover:text-white">Dismiss</button>
          <button type="button" onClick={() => done(s, true)} className="h-9 px-3 rounded-[8px] text-[13px] font-bold" style={{ background: AMBER, color: "#111" }}>Load</button>
        </div>
      ))}
    </div>
  );
}
