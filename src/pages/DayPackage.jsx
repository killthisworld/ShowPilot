import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, ListOrdered, ListMusic, UserRound, Ticket, KeyRound, Lock, ChevronRight, Clock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { PIN_LABEL } from "@/lib/eventPdfs";
import { Preview } from "@/components/showpilot/PinnedBoard";

// Day-of package (job 320, Jay 2026-11-13): /dp/CODE. For people who aren't
// on Show Pilot (door staff, security, a fill-in tech, the driver). The key
// screen (a passcode if the sender set one), then a web of the sheets the
// sender picked: tap one for the page itself with Save PDF. Live: it reads
// the event as it is now, and refreshes every minute while open. The server
// (get_day_package) sends only what the chosen sheets need.

const G = "#8CFF3D";
const ICON = { schedule: CalendarClock, lineup: ListOrdered, setlist: ListMusic, contacts: UserRound, guests: Ticket };
const ORDER = ["schedule", "lineup", "setlist", "contacts", "guests"];
const passKey = (code) => `sp-dp-pass:${code}`;
const day = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "");
const until = (t) => new Date(t).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Shell({ photo, children }) {
  return (
    <div className="min-h-[100dvh] bg-[#0d0d0d] text-white relative overflow-x-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {photo && <img src={photo} alt="" className="absolute inset-x-0 top-0 h-[300px] w-full object-cover opacity-45" />}
      <span className="absolute inset-x-0 top-0 h-[300px]" style={{ background: "linear-gradient(180deg, rgba(13,13,13,0.2), #0d0d0d)" }} />
      <div className="relative max-w-xl mx-auto px-5 pb-16" style={{ paddingTop: "max(28px, env(safe-area-inset-top))" }}>{children}</div>
    </div>
  );
}

function Head({ ev, label }) {
  return (
    <div className="pt-16">
      <div className="text-[11px] tracking-[0.16em] flex items-center gap-2" style={{ fontFamily: SCENE_MONO, color: G }}>
        <KeyRound className="w-3.5 h-3.5" /> DAY-OF PACKAGE{label && label !== "Day of show" ? ` · ${String(label).toUpperCase()}` : ""}
      </div>
      <h1 className="m-0 mt-2 text-[40px] leading-[0.95] tracking-[0.02em] font-bold break-words" style={{ fontFamily: SCENE_FONT }}>
        {String(ev?.event_name || ev?.band_name || "Event").toUpperCase()}
      </h1>
      <p className="m-0 mt-2 text-[15px] text-white/70">{[day(ev?.date), ev?.venue].filter(Boolean).join(" · ")}</p>
    </div>
  );
}

// The web: the event in the middle, a circle for each sheet around it.
function SheetWeb({ ev, sheets, onOpen }) {
  const n = sheets.length;
  const size = 340, c = size / 2, r = n <= 1 ? 0 : n === 2 ? 110 : 122;
  const at = (i) => {
    const a = (-90 + (360 / Math.max(n, 1)) * i) * (Math.PI / 180);
    return [c + r * Math.cos(a), c + r * Math.sin(a) + (n === 2 ? 0 : 6)];
  };
  return (
    <div className="relative mx-auto mt-8" style={{ width: "min(100%, 340px)", aspectRatio: "1 / 1" }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 w-full h-full" aria-hidden>
        {n > 1 && sheets.map((s, i) => { const [x, y] = at(i); return <line key={s} x1={c} y1={c} x2={x} y2={y} stroke={G} strokeOpacity="0.35" strokeWidth="1.5" />; })}
      </svg>
      {n > 1 && (
        <div className="absolute rounded-full flex items-center justify-center text-center overflow-hidden"
          style={{ left: `${(c / size) * 100}%`, top: `${(c / size) * 100}%`, width: "30%", height: "30%", transform: "translate(-50%, -50%)", background: "#161616", border: `2px solid ${G}` }}>
          {ev?.icon_url ? <img src={ev.icon_url} alt="" className="w-full h-full object-cover" /> : <span className="px-2 text-[12px] font-bold leading-tight text-white/85" style={{ fontFamily: SCENE_FONT }}>{String(ev?.event_name || "EVENT").toUpperCase()}</span>}
        </div>
      )}
      {sheets.map((s, i) => {
        const [x, y] = n > 1 ? at(i) : [c, c];
        const Icon = ICON[s];
        return (
          <button key={s} type="button" onClick={() => onOpen(s)} aria-label={`Open ${PIN_LABEL[s]}`}
            className="absolute flex flex-col items-center gap-1.5 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(x / size) * 100}%`, top: `${(y / size) * 100}%`, width: "28%" }}>
            <span className="w-[62px] h-[62px] rounded-full flex items-center justify-center bg-[#141414] active:scale-95 transition-transform" style={{ border: `2px solid ${G}`, boxShadow: `0 0 0 4px ${G}14` }}>
              <Icon className="w-6 h-6" style={{ color: G }} />
            </span>
            <span className="text-[12.5px] font-semibold leading-tight text-center text-white/90">{PIN_LABEL[s]}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function DayPackage() {
  const { code: raw } = useParams();
  const code = String(raw || "").toUpperCase();
  const [res, setRes] = useState(null);
  const [pass, setPass] = useState(() => { try { return sessionStorage.getItem(passKey(code)) || ""; } catch { return ""; } });
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async (p = pass) => {
    const { data, error } = await supabase.rpc("get_day_package", { p_code: code, p_passcode: p || null });
    if (error) { console.error(error); setRes((r) => r || { status: "error" }); return; }
    setRes(data);
    if (data?.status === "ok" && p) { try { sessionStorage.setItem(passKey(code), p); } catch { /* ignore */ } }
  }, [code, pass]);
  useEffect(() => { load(); }, [load]);
  // Live: refresh every minute while the page is open and in front.
  useEffect(() => {
    if (res?.status !== "ok") return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => clearInterval(t);
  }, [res?.status, load]);

  const sheets = useMemo(() => (res?.sheets || []).filter((s) => ICON[s]).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)), [res]);
  const gig = res?.gig;

  if (!res) {
    return <Shell><div className="pt-40 flex justify-center"><div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: G + "40", borderTopColor: G }} /></div></Shell>;
  }

  if (res.status === "passcode") {
    const submit = async (e) => {
      e.preventDefault();
      if (!typed.trim()) return;
      setBusy(true); setPass(typed.trim()); await load(typed.trim()); setBusy(false);
    };
    return (
      <Shell photo={res.event?.icon_url}>
        <Head ev={res.event} label={res.label} />
        <form onSubmit={submit} className="mt-10 rounded-2xl bg-[#151515] border border-[#262626] p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[15px] font-semibold"><Lock className="w-4 h-4" style={{ color: G }} /> Enter the code you were given</div>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoCapitalize="none" autoComplete="off" aria-label="Code"
            className="h-12 px-4 rounded-xl bg-[#0d0d0d] border border-[#2e2e2e] text-white text-[18px] tracking-[0.12em] outline-none focus:border-white/40" />
          {res.wrong && <p role="alert" className="m-0 text-[13.5px] text-red-400">That code isn't right. Check it with whoever sent you the link.</p>}
          <button type="submit" disabled={busy || !typed.trim()} className="h-12 rounded-xl text-[16px] font-bold text-[#0d0d0d] disabled:opacity-40" style={{ background: G }}>{busy ? "Opening…" : "Open"}</button>
        </form>
      </Shell>
    );
  }

  if (res.status !== "ok") {
    const msg = {
      expired: "This day-of package has ended. Ask whoever sent it for a new link.",
      off: "This day-of package was turned off. Ask whoever sent it for a new link.",
      missing: "This link isn't right. Check it with whoever sent it.",
      error: "Couldn't open this right now. Check your signal and try again.",
    }[res.status] || "Couldn't open this link.";
    return (
      <Shell>
        <div className="pt-24">
          <div className="text-[11px] tracking-[0.16em] flex items-center gap-2" style={{ fontFamily: SCENE_MONO, color: G }}><KeyRound className="w-3.5 h-3.5" /> DAY-OF PACKAGE</div>
          {typeof res.event === "string" && <h1 className="m-0 mt-2 text-[34px] leading-none font-bold" style={{ fontFamily: SCENE_FONT }}>{res.event.toUpperCase()}</h1>}
          <p className="m-0 mt-4 text-[16px] text-white/70">{msg}</p>
          {res.status === "error" && <button type="button" onClick={() => load()} className="mt-5 h-11 px-5 rounded-xl text-[15px] font-bold text-[#0d0d0d]" style={{ background: G }}>Try again</button>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell photo={gig?.icon_url}>
      <Head ev={gig} label={res.label} />
      <p className="m-0 mt-3 text-[12.5px] text-white/50 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Always up to date · works until {until(res.expires_at)}</p>
      <SheetWeb ev={gig} sheets={sheets} onOpen={setOpen} />
      {/* The same sheets as a list, for anyone who'd rather scroll. */}
      <div className="mt-6 rounded-2xl border border-[#242424] bg-[#121212] divide-y divide-[#1f1f1f] overflow-hidden">
        {sheets.map((s) => {
          const Icon = ICON[s];
          return (
            <button key={s} type="button" onClick={() => setOpen(s)} className="w-full min-h-[56px] px-4 flex items-center gap-3 text-left active:bg-[#1a1a1a]">
              <Icon className="w-[18px] h-[18px] shrink-0" style={{ color: G }} />
              <span className="flex-1 text-[15.5px] font-semibold">{PIN_LABEL[s]}</span>
              <span className="text-[12.5px] text-white/45">View · PDF</span>
              <ChevronRight className="w-4 h-4 text-white/35" />
            </button>
          );
        })}
      </div>
      <p className="m-0 mt-8 text-center text-[12px] text-white/35">Sent with Show Pilot</p>
      {open && gig && <Preview pin={{ type: open, by: "package" }} gig={gig} editable={false} onEdit={() => {}} onClose={() => setOpen(null)} />}
    </Shell>
  );
}
