import React, { useEffect, useState } from "react";
import { isDateTbd, dateText } from "@/lib/dateRequest";
import { useNavigate } from "react-router-dom";
import { Clock, Megaphone, SlidersHorizontal, Folder, FileText, Download, ExternalLink, MessageSquare, Mail, Lock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import IntakeKeyWeb from "@/components/showpilot/IntakeKeyWeb";
import { StagePlotView, StageIcon, hasStagePlot, instrumentsOf } from "@/components/showpilot/StagePlotView";
import { promoFormat, promoLinkLabel } from "@/lib/newEventWeb";
import { LINK_KINDS } from "@/lib/eventLink";

const LINK_KIND_LABEL = Object.fromEntries(LINK_KINDS.map((k) => [k.key, k.label]));

// A venue's invite to an event, as a web (job 322; piece 2 of job 321). The
// invite link opens a key, then the event: whoever sent it in the middle
// (their photo; tapping opens their card with how to reach them), and a
// circle per thing the venue needs: Date & times (and the bill), the Promo
// kit (each graphic in the size it was made, to download), Sound / Lights
// (what's theirs to cover), the Stage plot, what's On file, and Paperwork
// (it opens once they accept: only the venue and the act see it). Accept
// the show joins them to the event and opens its web. Anything the venue
// still has to cover shows as a dark circle; what the act sent is green.
const BLUE = "#60A5FA";
const lab = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const MONO = { fontFamily: "'JetBrains Mono', monospace" };
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const dayText = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
const ACCEPT_KEY = "sp_accept_invite";

function Row({ k, children }) {
  return (
    <div className="min-h-[50px] px-3.5 py-2 flex items-center gap-3 border-b border-[#1f1f1f] last:border-0">
      <span className="w-[108px] shrink-0 text-[10.5px] tracking-[0.1em] text-white/55" style={MONO}>{k}</span>
      <span className="flex-1 min-w-0 text-[14.5px] text-white">{children}</span>
    </div>
  );
}
const Box = ({ children }) => <div className="flex flex-col rounded-[12px] border border-[#262626] bg-[#101010] overflow-hidden">{children}</div>;

// Save a public file; falls back to opening it when the browser won't fetch it.
async function saveFile(url, name) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name || url.split("/").pop() || "download";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export default function EventInviteView({ invite, gig, shareToken, inviteToken, user }) {
  const navigate = useNavigate();
  const [sender, setSender] = useState(null); // their card
  const [senderToken, setSenderToken] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [plotAt, setPlotAt] = useState(null);
  const [saving, setSaving] = useState("");

  // Who sent it: the event's owner, from their digital card.
  useEffect(() => {
    let gone = false;
    (async () => {
      const { data: col } = await supabase.rpc("get_gig_collaborators", { p_token: shareToken });
      const tok = col?.owner?.card_share_token;
      if (gone) return;
      setSender({ display_name: col?.owner?.display_name || "" });
      if (!tok) return;
      setSenderToken(tok);
      const { data } = await supabase.rpc("get_pilot_card_by_token", { p_token: tok });
      if (!gone && data?.[0]) setSender(data[0]);
    })().catch((e) => console.error(e));
    return () => { gone = true; };
  }, [shareToken]);

  const accept = async () => {
    if (accepting) return;
    if (!user) {
      // Sign in (or make an account), then come back here and finish joining.
      const path = window.location.pathname + window.location.search;
      try { sessionStorage.setItem(ACCEPT_KEY, inviteToken); sessionStorage.setItem("post_auth_redirect", path); } catch {}
      navigate(`/register?role=venue&redirect=${encodeURIComponent(path)}`);
      return;
    }
    setAccepting(true); setError("");
    try {
      const { data, error: e } = await supabase.rpc("accept_gig_invite", { p_token: inviteToken });
      if (e) throw e;
      if (data?.status !== "owner") {
        await supabase.from("linked_gigs").upsert({ user_id: user.id, show_id: gig.id, share_token: shareToken }, { onConflict: "user_id,show_id", ignoreDuplicates: true });
      }
      try { sessionStorage.removeItem(ACCEPT_KEY); } catch {}
      navigate(`/gig/web?token=${shareToken}`, { replace: true });
    } catch (e) {
      console.error(e);
      setError(/already joined/i.test(e?.message || "") ? "Someone else already joined with this invite. Ask them for a new link." : "Couldn't join just now. Check your signal and try again.");
      setAccepting(false);
    }
  };
  // Back from signing in with Accept pressed: finish joining.
  useEffect(() => {
    let again = false;
    try { again = !!user && sessionStorage.getItem(ACCEPT_KEY) === inviteToken; } catch {}
    if (again) accept();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mi = gig.manager_info || {};
  const vi = gig.venue_info || {};
  const bands = (gig.bands || []).filter((b) => has(b.band_name));
  const first = bands[0] || null;
  const senderName = sender?.display_name || "They";
  const firstName = senderName.split(/\s+/)[0] || senderName;
  const promo = (Array.isArray(mi.promo) ? mi.promo : []).filter((p) => p?.url);
  const photos = bands.filter((b) => has(b.photo_url)).map((b) => ({ url: b.photo_url, name: `${b.band_name} photo` }));
  const promoLinks = (Array.isArray(mi.promo_links) && mi.promo_links.some((l) => has(l?.url)))
    ? mi.promo_links.filter((l) => has(l?.url))
    : has(mi.facebook_event) ? [{ kind: "facebook", url: mi.facebook_event }] : [];
  const crew = mi.crew || {};
  // Who's on it, when the act's side already put them on (job 326).
  const techName = (k) => ((gig.engineer_info || {})[k === "sound" ? "audio" : "lighting"] || {}).contact_name || "";
  const yours = ["sound", "lights"].filter((k) => crew[k] === "venue");
  const setTimes = mi.set_times || {};
  const schedule = (vi.schedule || []).filter((r) => has(r.time) || has(r.label));
  // Acts with a stage: placed members (the stage plot), their inputs, or an uploaded plot.
  const plotFiles = (b) => [b.stage_plot_url, ...(Array.isArray(b.stage_plot_files) ? b.stage_plot_files.map((x) => x?.url) : [])].filter(has);
  const plots = bands.map((b, i) => ({ b, i })).filter(({ b }) => hasStagePlot(b) || (b.band_members || []).length > 0 || plotFiles(b).length > 0);
  const travel = [mi.vehicle, mi.travel_notes].filter(has).join(" · ");
  const guests = Array.isArray(mi.guests) ? mi.guests.length : 0;
  const merch = [mi.merch_table ? "Needs a merch table" : "", mi.merch_seller, mi.merch_notes].filter(has).join(" · ");
  const docs = (Array.isArray(mi.documents) ? mi.documents : []).filter((d) => d?.url);
  const onFileCount = [travel, guests, merch, mi.advancing_notes, docs.length].filter(Boolean).length;
  const allFiles = [...promo.map((p) => ({ url: p.url, name: `${gig.event_name || "promo"} ${promoFormat(p.format)?.label || p.format}`.trim() })), ...photos];
  const saveAll = async () => {
    setSaving("all");
    for (const f of allFiles) { await saveFile(f.url, f.name); await new Promise((r) => setTimeout(r, 350)); }
    setSaving("");
  };

  const PH = 112;
  const circles = [
    {
      key: "show", label: "Date & times", icon: <Clock />, done: true,
      body: () => (
        <div className="flex flex-col gap-3">
          <Box>
            <Row k="DATE">{isDateTbd(gig.date) ? dateText(gig) : dayText(gig.date) || "Not set"}</Row>
            {schedule.map((r, i) => <Row key={r.id || i} k={(r.label || "Time").toUpperCase()}>{r.time || "-"}</Row>)}
          </Box>
          {bands.length > 0 && (
            <>
              <span className={lab + " mb-0"}>THE BILL</span>
              <Box>
                {bands.map((b, i) => <Row key={b.id || i} k={i === 0 ? "HEADLINER" : "OPENER"}>{b.band_name}{setTimes[b.band_name] ? <span className="text-white/60"> · on stage {setTimes[b.band_name]}</span> : null}</Row>)}
              </Box>
            </>
          )}
          <p className="text-[12.5px] text-white/55 m-0">Their times to start from. You can change them once you've accepted.</p>
        </div>
      ),
    },
    {
      key: "promo", label: "Promo kit", icon: <Megaphone />, done: promo.length > 0 || photos.length > 0 || promoLinks.length > 0,
      body: () => (
        <div className="flex flex-col gap-4">
          {promo.length > 0 ? (
            <div className="flex flex-wrap gap-3 items-end">
              {promo.map((p, i) => {
                const fmt = promoFormat(p.format) || { label: "Graphic", ratio: "", r: 1 };
                const w = Math.round(Math.min(PH * fmt.r, 300));
                return (
                  <button key={`${p.url}${i}`} type="button" onClick={async () => { setSaving(p.url); await saveFile(p.url, `${gig.event_name || "promo"} ${fmt.label}`); setSaving(""); }} aria-label={`Download ${fmt.label} ${fmt.ratio}`}
                    className="relative rounded-[10px] overflow-hidden border border-[#333] bg-black" style={{ width: w, aspectRatio: String(fmt.r) }}>
                    <img src={p.url} alt={`${fmt.label} graphic`} className="absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 px-2 py-1.5 flex items-center justify-between gap-1 text-[10px] tracking-[0.06em] text-white" style={{ ...MONO, background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.85))" }}>
                      <span className="truncate">{w >= 96 ? `${fmt.label.toUpperCase()} ${fmt.ratio}` : fmt.ratio}</span><Download className="w-3.5 h-3.5 shrink-0" />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : <p className="text-[13.5px] text-white/55 m-0">No graphics yet. They'll show up here when {firstName} adds them.</p>}
          {photos.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className={lab + " mb-0"}>ARTIST PHOTOS</span>
              <div className="grid grid-cols-4 gap-2">
                {photos.map((ph) => (
                  <button key={ph.url} type="button" onClick={() => saveFile(ph.url, ph.name)} aria-label={`Download ${ph.name}`} className="aspect-square rounded-[8px] overflow-hidden border border-[#333]"><img src={ph.url} alt="" className="w-full h-full object-cover" /></button>
                ))}
              </div>
            </div>
          )}
          {/* Every promo link the venue added, by platform (job 429); older
              events only have the Facebook one. */}
          {promoLinks.map((l, i) => (
            <a key={`${l.url}${i}`} href={/^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`} target="_blank" rel="noreferrer" className="min-h-[48px] px-3.5 rounded-[12px] border border-[#333] flex items-center gap-2 text-[14.5px] font-semibold text-white no-underline">
              <span className="flex-1 min-w-0 truncate">{promoLinkLabel(l.kind) || LINK_KIND_LABEL[l.kind] || "Link"}</span><ExternalLink className="w-4 h-4 text-white/60 shrink-0" />
            </a>
          ))}
          {allFiles.length > 1 && (
            <button type="button" onClick={saveAll} disabled={saving === "all"} className="min-h-[50px] rounded-[12px] border-[1.5px] text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ borderColor: BLUE, color: BLUE }}>
              <Download className="w-4 h-4" />{saving === "all" ? "Saving…" : `Download all · ${allFiles.length} files`}
            </button>
          )}
        </div>
      ),
    },
    {
      key: "crew", label: "Sound / Lights", icon: <SlidersHorizontal />, done: yours.length === 0,
      body: () => (
        <div className="flex flex-col gap-3">
          <Box>
            {["sound", "lights"].map((k) => (
              <Row key={k} k={k.toUpperCase()}>
                {crew[k] === "venue" ? <span style={{ color: BLUE }}>You provide · assign one of your techs once you accept</span>
                  : crew[k] === "ours" ? `${firstName}'s side brings their own${techName(k) ? ` · ${techName(k)}` : ""}`
                  : <span className="text-white/55">Not decided yet</span>}
              </Row>
            ))}
          </Box>
          {yours.length > 0 && <p className="text-[12.5px] text-white/55 m-0">After you accept, pick who's on it from your techs on the event.</p>}
        </div>
      ),
    },
    {
      key: "stage", label: "Stage plot", icon: <StageIcon />, done: plots.length > 0,
      body: () => (
        plots.length ? (
          <div className="flex flex-col gap-2">
            {plots.map(({ b, i }) => {
              const members = b.band_members || [];
              const inputs = members.reduce((n, m) => n + instrumentsOf(m).length, 0);
              const files = plotFiles(b);
              return (
                <div key={b.id || i} className="flex flex-col gap-2 rounded-[12px] border border-[#2a2a2a] bg-[#101010] p-3">
                  <div className="flex items-center gap-3">
                    <StageIcon className="w-5 h-5 shrink-0 text-white/70" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-semibold truncate">{b.band_name}</span>
                      <span className="block text-[12.5px] text-white/55">{[members.length ? `${members.length} on stage` : "", inputs ? `${inputs} input${inputs === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "Stage plot file"}</span>
                    </span>
                  </div>
                  {hasStagePlot(b) && <button type="button" onClick={() => setPlotAt(i)} className="min-h-[44px] rounded-[10px] border border-[#3a3a3a] text-[14px] font-semibold">Open the stage plot</button>}
                  {members.length > 0 && (
                    <div className="flex flex-col">
                      {members.map((m, k) => (
                        <div key={k} className="py-1.5 border-t border-[#1f1f1f] text-[13.5px] flex gap-2">
                          <span className="w-[84px] shrink-0 font-semibold truncate">{m.name || `Member ${k + 1}`}</span>
                          <span className="flex-1 min-w-0 text-white/70">{instrumentsOf(m).map((x) => [x.name, x.mic_di].filter(has).join(" · ")).filter(has).join(", ") || "-"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {files.map((u, k) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="min-h-[42px] px-3 rounded-[10px] border border-[#333] flex items-center gap-2 text-[13.5px] font-semibold text-white no-underline">
                      <span className="flex-1">Their stage plot file{files.length > 1 ? ` ${k + 1}` : ""}</span><ExternalLink className="w-4 h-4 text-white/60" />
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        ) : <p className="text-[13.5px] text-white/55 m-0">No stage plot yet. It shows up here when {firstName} adds one.</p>
      ),
    },
    {
      key: "files", label: "On file", icon: <Folder />, done: onFileCount > 0,
      body: () => (
        onFileCount ? (
          <div className="flex flex-col gap-3">
            <Box>
              {travel && <Row k="TRAVEL">{travel}</Row>}
              {guests > 0 && <Row k="GUEST LIST">{guests} name{guests === 1 ? "" : "s"}</Row>}
              {merch && <Row k="MERCH">{merch}</Row>}
              {has(mi.advancing_notes) && <Row k="ADVANCE">{mi.advancing_notes}</Row>}
            </Box>
            {docs.map((d, i) => (
              <a key={`${d.url}${i}`} href={d.url} target="_blank" rel="noreferrer" className="min-h-[48px] px-3.5 rounded-[12px] border border-[#333] flex items-center gap-2 text-[14.5px] font-semibold text-white no-underline">
                <span className="flex-1 truncate">{d.name || "Document"}</span><ExternalLink className="w-4 h-4 text-white/60 shrink-0" />
              </a>
            ))}
          </div>
        ) : <p className="text-[13.5px] text-white/55 m-0">Nothing else on file from {firstName} yet.</p>
      ),
    },
    {
      key: "paper", label: "Paperwork", icon: <FileText />, done: true,
      body: () => (
        <div className="flex flex-col items-center gap-3 text-center py-2">
          <Lock className="w-7 h-7 text-white/50" />
          <p className="text-[14px] text-white/75 m-0">Anything {firstName} filed (W9, agreement, insurance) opens once you accept the show.</p>
          <p className="text-[12.5px] text-white/50 m-0">Only you and the act see paperwork. Never techs or fans.</p>
        </div>
      ),
    },
  ];

  const place = [gig.venue, [gig.city, gig.state].filter(has).join(", ")].filter(has).join(" · ");
  const phone = sender?.contact_phone || "";
  const email = sender?.contact_email || "";
  const message = `Hi ${firstName}, about ${gig.event_name || "the show"}${gig.date && !isDateTbd(gig.date) ? ` on ${dayText(gig.date)}` : ""}: `;

  return (
    <>
      <IntakeKeyWeb
        readOnly
        color={BLUE}
        seed={shareToken}
        image={gig.icon_url || first?.photo_url || ""}
        fromLine={`${senderName} added you to a show`}
        title={gig.event_name || first?.band_name || "Your show"}
        dateLine={[isDateTbd(gig.date) ? dateText(gig) : dayText(gig.date), place].filter(Boolean).join(" · ")}
        actName=""
        unlockLabel="Open the show"
        center={{ name: senderName, photo: sender?.profile_photo_url || "", label: "Sent by", href: senderToken ? `/pilot/${senderToken}` : "" }}
        circles={circles}
        onSend={accept}
        canSend
        sending={accepting}
        sendLabel={user ? "Accept the show" : "Accept the show (sign in)"}
        error={error}
        belowSend={(phone || email) ? (
          <div className="grid grid-cols-2 gap-2">
            {phone && <a href={`sms:${phone}?&body=${encodeURIComponent(message)}`} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14px] font-semibold flex items-center justify-center gap-1.5 text-white no-underline" style={!email ? { gridColumn: "span 2" } : undefined}><MessageSquare className="w-4 h-4" />Text {firstName}</a>}
            {email && <a href={`mailto:${email}?subject=${encodeURIComponent(gig.event_name || "The show")}&body=${encodeURIComponent(message)}`} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14px] font-semibold flex items-center justify-center gap-1.5 text-white no-underline" style={!phone ? { gridColumn: "span 2" } : undefined}><Mail className="w-4 h-4" />Email {firstName}</a>}
          </div>
        ) : null}
      />
      {plotAt !== null && <StagePlotView acts={bands} start={plotAt} onClose={() => setPlotAt(null)} />}
    </>
  );
}
