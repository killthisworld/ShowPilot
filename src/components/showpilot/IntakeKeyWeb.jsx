import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, CheckCircle, CalendarDays, X } from "lucide-react";
import SkyKey from "@/components/showpilot/SkyKey";
import NightSky from "@/components/showpilot/NightSky";
import { SCENE_MONO } from "@/lib/sceneStyle";
import PilotCardView from "@/pages/PilotCardView";

// The access key + web for the engineers' intake forms (Performer Intake and
// Opener Set Info, job 195), the same way acts get the venue's Event Form:
// the link opens a key, Unlock my web opens it (only the stars and the key
// while it opens), then the act's web: the sender (the engineer) in the
// middle, linking to their digital card (job 196), and a circle per part of
// the form. A circle is green once it's filled in.
// Phones open a circle in a sheet from the bottom; laptops beside the web.
const GREEN = "#8CFF3D";
const mono = { fontFamily: SCENE_MONO };

export function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const f = () => setOn(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return on;
}

function SkyBack({ seed, dim = 0.3 }) {
  return (
    <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}>
      <style>{`@keyframes ikw-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } } .ikw-in { animation: ikw-in 700ms cubic-bezier(.2,.8,.2,1) both; } @media (prefers-reduced-motion: reduce) { .ikw-in { animation: none; } }`}</style>
      <NightSky seed={seed} dim={dim} />
    </div>
  );
}

const shortLabel = (label) => {
  const t = String(label || "").trim();
  return t.length <= 16 ? t : t.split(/\s+/).slice(0, 2).join(" ");
};

// The sender in the middle of the web (job 196): their picture and name,
// tapping opens their digital card.
export function SenderCircle({ center, color, desktop }) {
  const c = center || {};
  const inner = c.photo ? (
    <>
      <img src={c.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(6,8,6,0.85))" }} />
      <span className={`relative mt-auto mb-[12%] ${desktop ? "text-[18px]" : "text-[13px]"} font-bold leading-none px-2 truncate max-w-full`} style={{ fontFamily: "'Barlow Condensed', sans-serif", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{(c.name || "").toUpperCase()}</span>
    </>
  ) : (
    <>
      <span className={`${desktop ? "text-[24px]" : "text-[16px]"} font-bold leading-none break-words max-w-full px-2`} style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>{(c.name || "SHOWPILOT").toUpperCase()}</span>
      {c.label && <span className="text-[9px] sm:text-[10.5px] tracking-[0.1em] text-white/65 mt-0.5" style={mono}>{c.label.toUpperCase()}</span>}
    </>
  );
  const cls = "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[29%] aspect-square rounded-full border-2 overflow-hidden flex flex-col items-center justify-center text-center";
  const style = { borderColor: color, background: "#0f140c", boxShadow: `0 0 30px ${color}66` };
  // Their digital card opens over the form (job 197); back or tapping
  // outside closes it and leaves you on the form.
  const cardToken = (String(c.href || "").match(/\/pilot\/([^/?#]+)/) || [])[1] || "";
  const [cardOpen, setCardOpen] = useState(false);
  useEffect(() => {
    if (!cardOpen) return;
    const onPop = () => setCardOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [cardOpen]);
  const openCard = () => { try { window.history.pushState({ ...(window.history.state || {}), spCard: 1 }, ""); } catch {} setCardOpen(true); };
  const closeCard = () => { if (window.history.state?.spCard) window.history.back(); else setCardOpen(false); };
  if (!cardToken) return <div className={cls} style={style}>{inner}</div>;
  return (
    <>
      <button type="button" onClick={openCard} aria-label={`${c.name || "Sender"}'s digital card`} title="Open their digital card" className={cls} style={style}>{inner}</button>
      {cardOpen && createPortal(<PilotCardView token={cardToken} onClose={closeCard} />, document.body)}
    </>
  );
}

// circles: [{ key, label, short?, hint?, required?, done, body: () => node }]
// corner: { label, icon: Component, done?, body: () => node } for the top right (Additional services).
export default function IntakeKeyWeb({
  color = GREEN, seed, image = "", fromLine, title, dateLine, keyCode,
  actName, center = null, circles = [], corner = null, show = null,
  onSave = null, onSend, canSend, sending = false, sendLabel = "Send", error = "", needLine = "",
}) {
  const desktop = useIsDesktop();
  const [phase, setPhase] = useState("idle"); // idle | unlocking | open
  const [pane, setPane] = useState("start"); // start | show | corner | <circle key>
  const opening = phase === "unlocking";
  const N = circles.length;
  const done = circles.filter((c) => c.done).length;
  const cur = circles.find((c) => c.key === pane) || null;
  const curIdx = cur ? circles.indexOf(cur) : -1;
  const close = () => setPane("start");
  const save = () => { if (cur) onSave?.(cur.key); close(); };

  // ---------- The key ----------
  if (phase !== "open") {
    const keyArt = (size) => (
      <div className="flex flex-col items-center gap-3">
        <div style={{ width: size, height: size }}>
          <div style={{ transform: `scale(${size / 280})`, transformOrigin: "top left" }}>
            <SkyKey seed={seed} color={color} phase={opening ? "unlocking" : "idle"} onDone={() => setPhase("open")} image={image || null} />
          </div>
        </div>
        {!opening && keyCode && <span className="text-[20px] tracking-[0.3em]" style={{ ...mono, color }}>{keyCode}</span>}
      </div>
    );
    const heading = (
      <div className="flex flex-col gap-1">
        <span className="text-[14px] text-white/70">{fromLine}</span>
        <h1 className={`${desktop ? "text-[56px]" : "text-[40px]"} leading-none font-bold`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{title || "Your show"}</h1>
        {dateLine && <span className="text-[14.5px] text-white/70">{dateLine}</span>}
      </div>
    );
    const action = (
      <div className="flex flex-col gap-3">
        <button type="button" disabled={opening} onClick={() => setPhase("unlocking")} className="min-h-[56px] rounded-[14px] font-bold text-[17px] flex items-center justify-center gap-2.5" style={{ background: color, color: "#0d0d0d", boxShadow: `0 0 24px ${color}55` }}>
          <Lock className="w-5 h-5" />Unlock my web
        </button>
        <p className="text-center text-[12.5px] text-white/55 leading-relaxed">{N} thing{N === 1 ? "" : "s"} to fill in. No account needed. Your answers save as you go.</p>
      </div>
    );
    if (desktop) {
      return (
        <div className="min-h-screen text-white relative bg-[#05060d]">
          <SkyBack seed={seed} dim={opening ? 0.1 : 0.35} />
          <div className="relative min-h-screen max-w-5xl mx-auto px-8 py-10 flex flex-col" style={{ zIndex: 1 }}>
            {!opening && <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>}
            {opening ? (
              <div className="flex-1 flex items-center justify-center">{keyArt(420)}</div>
            ) : (
              <div className="flex-1 grid grid-cols-2 gap-12 items-center">
                <div className="flex justify-center">{keyArt(380)}</div>
                <div className="flex flex-col gap-8">{heading}{action}</div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-[100dvh] text-white relative bg-[#05060d]">
        <SkyBack seed={seed} dim={opening ? 0.1 : 0.35} />
        <div className="relative min-h-[100dvh] px-5 pt-5 pb-6 flex flex-col gap-5" style={{ zIndex: 1 }}>
          {!opening && <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>}
          {!opening && heading}
          <div className="flex-1 flex items-center justify-center py-2">{keyArt(Math.min(opening ? 330 : 300, typeof window !== "undefined" ? window.innerWidth - 50 : 300))}</div>
          {!opening && action}
        </div>
      </div>
    );
  }

  // ---------- The web ----------
  const nodeSize = N > 9 ? 17 : 20;
  const cornerCls = "absolute w-[15%] aspect-square min-w-[54px] rounded-[12px] border-[1.5px] flex flex-col items-center justify-center gap-1 text-[10.5px] sm:text-[12px] font-bold text-center px-1 leading-tight backdrop-blur-sm";
  const CornerIcon = corner?.icon;
  const web = (
    <div className="relative w-full aspect-square">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <circle cx="50" cy="50" r="37" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
        {circles.map((c, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
          return <line key={c.key} x1="50" y1="50" x2={50 + 37 * Math.cos(ang)} y2={50 + 37 * Math.sin(ang)} stroke={pane === c.key ? "rgba(255,255,255,0.7)" : c.done ? `${GREEN}80` : "rgba(255,255,255,0.16)"} strokeWidth="0.3" />;
        })}
      </svg>
      {show && (
        <button type="button" onClick={() => setPane(pane === "show" ? "start" : "show")} aria-pressed={pane === "show"} className={`${cornerCls} left-0 top-0`} style={{ borderColor: color, background: pane === "show" ? `${color}33` : "rgba(17,17,17,0.85)" }}>
          <CalendarDays className="w-[30%] h-[30%]" style={{ color }} />The show
        </button>
      )}
      {corner && (
        <button type="button" onClick={() => setPane(pane === "corner" ? "start" : "corner")} aria-pressed={pane === "corner"} className={`${cornerCls} right-0 top-0`}
          style={corner.done ? { borderColor: GREEN, background: GREEN, color: "#0d0d0d" } : { borderColor: color, background: pane === "corner" ? `${color}33` : "rgba(17,17,17,0.85)" }}>
          {CornerIcon && <CornerIcon className="w-[28%] h-[28%]" style={{ color: corner.done ? "#0d0d0d" : color }} />}{corner.label}
        </button>
      )}
      {circles.map((c, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
        const on = pane === c.key;
        return (
          <button key={c.key} type="button" onClick={() => setPane(on ? "start" : c.key)} aria-pressed={on} aria-label={`${c.label}, ${c.done ? "done" : "not filled in yet"}`}
            className="absolute rounded-full flex items-center justify-center p-0 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${50 + 37 * Math.cos(ang)}%`, top: `${50 + 37 * Math.sin(ang)}%`, width: `${nodeSize}%`, height: `${nodeSize}%`,
              background: c.done ? GREEN : "rgba(21,21,21,0.92)", color: c.done ? "#0d0d0d" : "#f2f2f2",
              border: `${on ? 2.5 : 1.5}px solid ${on ? "#FFFFFF" : c.done ? GREEN : "rgba(255,255,255,0.28)"}`,
              boxShadow: on ? "0 0 18px rgba(255,255,255,0.45)" : c.done ? `0 0 14px ${GREEN}66` : "none",
            }}>
            <span className={`${desktop ? "text-[13px]" : "text-[10px]"} font-bold leading-[1.05] text-center px-1 line-clamp-2`}>{c.short || shortLabel(c.label)}</span>
          </button>
        );
      })}
      <SenderCircle center={center} color={color} desktop={desktop} />
    </div>
  );

  const panelHead = (label, sub, hint) => (
    <div className="flex flex-col items-center gap-1 text-center">
      {sub && <div className="text-[10.5px] tracking-[0.12em]" style={{ ...mono, color: sub.startsWith("DONE") ? GREEN : "rgba(255,255,255,0.55)" }}>{sub}</div>}
      <div className={`${desktop ? "text-[30px]" : "text-[22px]"} font-bold leading-tight`} style={desktop ? { fontFamily: "'Barlow Condensed', sans-serif" } : undefined}>{label}</div>
      {hint && <p className="text-[13.5px] text-white/60">{hint}</p>}
    </div>
  );
  const saveBtn = <button type="button" onClick={save} className="w-full min-h-[52px] rounded-[12px] font-bold text-[16px]" style={{ background: GREEN, color: "#0d0d0d" }}>Save</button>;
  const circleBody = cur && (
    <div className="flex flex-col gap-3">
      {panelHead(cur.label, `${cur.done ? "DONE" : cur.required ? "NEEDED" : "OPTIONAL"} · ${curIdx + 1} / ${N}`, cur.hint)}
      <div className="text-left">{cur.body()}</div>
      {saveBtn}
    </div>
  );
  const cornerBody = corner && (
    <div className="flex flex-col gap-3">
      {panelHead(corner.label, corner.done ? "DONE" : "OPTIONAL", null)}
      <div className="text-left">{corner.body()}</div>
      <button type="button" onClick={close} className="w-full min-h-[52px] rounded-[12px] font-bold text-[16px]" style={{ background: GREEN, color: "#0d0d0d" }}>Save</button>
    </div>
  );
  // Green only once every needed circle is filled (job 198).
  const needLeft = circles.filter((c) => c.required && !c.done);
  const ready = canSend && !needLeft.length;
  const sendRow = (
    <>
      {error && <p className="text-[14px] text-red-400 text-center">{error}</p>}
      {/* Always a green Submit (job 197); with something still needed it
          opens that circle instead of sending. */}
      {(
        <button type="button" onClick={() => { if (ready) onSend(); else { const need = circles.find((c) => c.required && !c.done); if (need) setPane(need.key); } }} disabled={sending} aria-label={ready ? sendLabel : `${sendLabel}: fill in ${needLeft.map((c) => c.short || c.label).join(", ")} first`} className="w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-50 transition-colors" style={ready ? { background: GREEN, color: "#0d0d0d" } : { background: "#1f1f1f", color: "rgba(255,255,255,0.45)", border: "1px solid #333" }}>
          {sending ? "Sending…" : <><CheckCircle className="w-4 h-4" />{sendLabel}</>}
        </button>
      )}
    </>
  );
  const header = (big) => (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] tracking-[0.14em] truncate" style={{ ...mono, color }}>{[actName ? `${actName}'s web` : "", dateLine].filter(Boolean).join(" · ").toUpperCase()}</div>
        <h1 className={`${big ? "text-[44px]" : "text-[28px]"} leading-[1.02] font-bold truncate`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{title || "Your show"}</h1>
      </div>
      <div className="pt-1 flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] tracking-[0.08em] text-white/75" style={mono}>{done} OF {N} DONE</span>
        <div className={`${big ? "w-[180px] h-2" : "w-[110px] h-1.5"} rounded bg-[#1f1f1f] overflow-hidden`}><div className="h-full" style={{ width: `${N ? (done / N) * 100 : 0}%`, background: GREEN }} /></div>
      </div>
    </div>
  );
  const showModal = pane === "show" && show ? createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 text-white" style={{ zIndex: 60 }}>
      <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label="The show" className="ikw-in relative w-full max-w-[520px] max-h-[88dvh] overflow-y-auto rounded-[18px] border border-[#2a2a2a] bg-[#141414] p-5">
        <button type="button" onClick={close} aria-label="Close" className="absolute right-2 top-2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white/80"><X className="w-5 h-5" /></button>
        {show()}
      </div>
    </div>, document.body) : null;

  if (desktop) {
    return (
      <div className="min-h-screen text-white relative bg-[#05060d]">
        <SkyBack seed={seed} dim={0.25} />
        <div className="ikw-in relative max-w-6xl mx-auto px-8 py-8 flex flex-col gap-6" style={{ zIndex: 1 }}>
          <div className="text-[18px] font-bold tracking-[0.04em]" style={{ color: GREEN, fontFamily: "'Barlow Condensed', sans-serif" }}>SHOWPILOT</div>
          {header(true)}
          {/* The web on its own in the middle; a circle opens beside it. */}
          {cur || pane === "corner" ? (
            <div className="grid grid-cols-[minmax(0,600px)_minmax(0,1fr)] gap-10 items-start">
              <div>{web}</div>
              <div className="sticky top-6 flex flex-col gap-3">
                <div className="ikw-in rounded-[18px] border border-[#262626] bg-[#151515]/95 backdrop-blur p-6 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
                  {cur ? circleBody : cornerBody}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[640px] mx-auto flex flex-col gap-4">
              {web}
              {sendRow}
            </div>
          )}
        </div>
        {showModal}
      </div>
    );
  }
  const sheetOpen = !!cur || pane === "corner";
  return (
    <div className="min-h-[100dvh] text-white relative bg-[#05060d]">
      <SkyBack seed={seed} dim={0.25} />
      <div className="ikw-in relative px-4 pt-4 pb-8 flex flex-col gap-3" style={{ zIndex: 1 }}>
        {header(false)}
        <div className="flex-1 flex flex-col justify-center gap-4 min-h-[calc(100dvh-140px)]">
          {web}
          {sendRow}
        </div>
      </div>
      {sheetOpen && (
        <div className="fixed inset-0" style={{ zIndex: 20 }}>
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-black/45" />
          <div role="dialog" aria-modal="true" aria-label={cur ? cur.label : corner?.label} className="absolute left-0 right-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[22px] border-t border-[#2a2a2a] bg-[#151515] px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-18px_40px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-center relative h-8 mb-1">
              <span className="w-10 h-1 rounded-full bg-[#3a3a3a]" aria-hidden="true" />
              <button type="button" onClick={close} aria-label="Close" className="absolute right-0 top-0 w-10 h-10 flex items-center justify-center text-white/60"><X className="w-5 h-5" /></button>
            </div>
            {cur ? circleBody : cornerBody}
          </div>
        </div>
      )}
      {showModal}
    </div>
  );
}

// After sending (job 195): the night sky, a big tick, and whatever comes
// after it (the rating box).
export function IntakeSent({ seed, title = "Sent!", line, children }) {
  return (
    <div className="min-h-[100dvh] text-white relative bg-[#05060d] flex items-center justify-center px-4">
      <SkyBack seed={seed} dim={0.3} />
      <div className="ikw-in relative text-center max-w-sm w-full py-10" style={{ zIndex: 1 }}>
        <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: GREEN }} />
        <h2 className="text-[30px] font-bold mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{title}</h2>
        {line && <p className="text-white/60 text-[15px]">{line}</p>}
        {children}
      </div>
    </div>
  );
}
