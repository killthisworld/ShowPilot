import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { dayTimes, nextCall, venueAddress, directionsUrl, dayContacts, daySheetText } from "@/lib/daySheet";
import useTouringParty, { textLink, emailLink } from "@/lib/touringParty";
import { keep, kept } from "@/lib/offline";

const has = (v) => v != null && String(v).trim() !== "";

// The show-day sheet on the company phone (job 73, "On the road" stage 1):
// the day's times, where to go and who to call, built from the event. Opened
// from the Today card on Needs me. Share sends it as text (a group text to
// the band, an email, notes).
export default function DaySheet({ gig: base, accent = "#8CFF3D", onClose }) {
  // Last saved copy first, so it opens with no signal (stage 9).
  const [gig, setGig] = useState(() => ({ ...(kept(`gig:${base.share_token}`) || {}), ...base }));
  const [copied, setCopied] = useState(false);
  // Send to the party (job 73, On the road stage 6).
  const { party } = useTouringParty();
  const [sendOpen, setSendOpen] = useState(false);
  const reachable = party.filter((p) => p.phone || p.email);

  useEffect(() => {
    let off = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_shared_gig", { p_token: base.share_token });
      if (error) console.error(error);
      if (data) keep(`gig:${base.share_token}`, data);
      if (!off && data) setGig({ ...base, ...data, icon_url: base.icon_url || data.icon_url });
    })();
    return () => { off = true; };
  }, [base]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const title = eventTitle(gig);
  const times = dayTimes(gig);
  const next = nextCall(times);
  const vi = gig.venue_info || {};
  const date = gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  const place = [gig.venue, gig.city].filter(has).join(", ");
  const maps = directionsUrl(gig);
  const people = dayContacts(gig).filter((c) => c.phone || c.email);
  const notes = [
    ["Load-in", vi.load_in_location],
    ["Parking", vi.parking],
    ["Wi-Fi", [gig.wifi_network, gig.wifi_password].filter(has).join(" · ")],
    ["Green room", vi.green_room],
  ].filter(([, v]) => has(v));

  const share = async () => {
    const text = daySheetText(gig, title);
    try {
      if (navigator.share) { await navigator.share({ title: `${title} day sheet`, text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* closed the share sheet */ }
  };

  const row = "flex items-center gap-3 min-h-[60px] px-4 rounded-[14px] bg-[#151515] active:bg-[#1c1c1c] text-white no-underline";

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[#0d0d0d] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label={`${title} day sheet`} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg mx-auto pb-12">
        <div className="flex items-center px-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
          <span className="flex-1" />
          <button type="button" onClick={share} className="h-11 px-4 rounded-[10px] border border-[#444] text-white text-[14px] font-semibold flex items-center gap-1.5">
            {copied ? <><Check className="w-4 h-4" /> Copied</> : "Share"}
          </button>
        </div>

        <div className="px-6 pt-3 flex flex-col gap-1">
          <h1 className="m-0 text-[40px] leading-none tracking-[0.04em] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>DAY SHEET</h1>
          <p className="m-0 text-[15px] text-white/60">{[date, title].filter(Boolean).join(" · ")}</p>
        </div>

        <div className="px-6 pt-7">
          {times.length ? times.map((t, i) => {
            const isNext = next && t.time === next.time && t.label === next.label;
            const big = t.kind === "set" || t.kind === "doors";
            return (
              <div key={i} className="flex items-center gap-4 min-h-[52px] border-b border-[#1f1f1f]">
                <span className="w-[92px] shrink-0 whitespace-nowrap text-[15px]" style={{ fontFamily: SCENE_MONO, color: isNext ? accent : t.kind === "curfew" ? "#FF8A3D" : "rgba(255,255,255,0.65)" }}>{t.time || "--"}</span>
                <span className={`text-[17px] text-white ${big || isNext ? "font-semibold" : ""}`}>{t.label}</span>
              </div>
            );
          }) : (
            <p className="m-0 text-[15px] text-white/50">No times yet. They show up here once the venue adds its schedule and the acts get set times.</p>
          )}
        </div>

        <div className="px-6 pt-7 flex flex-col gap-2.5">
          {reachable.length > 0 && (
            <button type="button" onClick={() => setSendOpen(true)} className="h-[52px] rounded-[14px] text-[16px] font-bold" style={{ background: accent, color: "#0d0d0d" }}>
              Send to the party · {reachable.length}
            </button>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" className={row}>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[16px] font-semibold">Directions</span>
                <span className="text-[13px] text-white/55 truncate">{venueAddress(gig) || place}</span>
              </span>
              <ChevronRight className="w-[18px] h-[18px] text-white/50 shrink-0" />
            </a>
          )}
          {people.map((c, i) => (
            <a key={i} href={c.phone ? `tel:${c.phone.replace(/[^\d+]/g, "")}` : `mailto:${c.email}`} className={row}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[16px] font-semibold truncate">{c.phone ? `Call ${c.name}` : `Email ${c.name}`}</span>
                <span className="text-[13px] text-white/55 truncate">{c.role}</span>
              </span>
              <ChevronRight className="w-[18px] h-[18px] text-white/50 shrink-0" />
            </a>
          ))}
        </div>

        {notes.length > 0 && (
          <div className="px-6 pt-7">
            {notes.map(([k, v]) => (
              <div key={k} className="py-3 border-b border-[#1f1f1f] flex flex-col gap-0.5">
                <span className="text-[13px] text-white/50">{k}</span>
                <span className="text-[16px] text-white whitespace-pre-line break-words">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sendOpen && (
        <div className="fixed inset-0 z-[61] bg-black/70 flex items-end justify-center" onClick={() => setSendOpen(false)}>
          <div className="w-full max-w-lg max-h-[80dvh] overflow-y-auto bg-[#111] border-t border-[#262626] rounded-t-[22px] px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Send to the party">
            <h2 className="m-0 text-[26px] font-bold text-white tracking-[0.02em]" style={{ fontFamily: SCENE_FONT }}>Send to the party</h2>
            <p className="m-0 mt-1 mb-3 text-[14px] text-white/55">Each button opens your messages with the day sheet filled in.</p>
            {reachable.map((p) => {
              const body = daySheetText(gig, title);
              return (
                <div key={p.id} className="flex items-center gap-3 min-h-[60px] border-b border-[#1f1f1f]">
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[16px] font-semibold text-white truncate">{p.name}</span>
                    {p.role && <span className="text-[13px] text-white/50 truncate">{p.role}</span>}
                  </span>
                  {p.phone && <a href={textLink(p.phone, body)} className="h-11 px-4 rounded-[10px] bg-[#222] text-white text-[14px] font-semibold flex items-center no-underline">Text</a>}
                  {p.email && <a href={emailLink(p.email, `${title} day sheet`, body)} className="h-11 px-4 rounded-[10px] bg-[#222] text-white text-[14px] font-semibold flex items-center no-underline">Email</a>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
