import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { hashColor, hashString, seededRandom } from "@/lib/constellation";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import SkyKey from "@/components/showpilot/SkyKey";
import NightSky from "@/components/showpilot/NightSky";
import AfterShowFilm from "@/components/showpilot/AfterShowFilm";
import { filmDateLine } from "@/lib/afterShowFilm";
import useFanToken from "@/lib/useFanToken";

// /e/:token/sky?k=<sky key>  (public, no login)
//
// The link in a fan's RSVP email. Plays the key-unlock animation while the
// key is checked (get_event_sky), then opens the event's sky: every RSVP is a
// star, the fan's own star is marked "You". Other fans are never named; a
// star only knows its party size and when it joined. New RSVPs appear as the
// page refreshes every minute.

const MIN_VERIFY_MS = 1100; // let the rings spin for a beat even on a fast connection
const REFRESH_MS = 60_000;

// Sunflower spiral: the earliest RSVPs sit near the middle and each new one
// lands a little further out, so the sky visibly grows as people join. Seeded
// jitter keeps it from looking mechanical. Works in pixels (w x h) so the
// spiral fills the screen's shape; returns positions plus "constellation"
// lines: the short edges of a minimum spanning tree, so nearby stars link up
// into small groups instead of one tangled web.
function skyLayout(stars, w, h) {
  if (!w || !h || stars.length === 0) return { positions: [], lines: [] };
  const sorted = [...stars].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const n = sorted.length;
  const rx = w * 0.47, ry = h * 0.44;
  const positions = sorted.map((s, i) => {
    const seed = hashString(s.id);
    const frac = Math.min(1, Math.sqrt((i + 0.6) / Math.max(n, 6)) + (seededRandom(seed) - 0.5) * 0.12);
    const theta = i * 2.39996 + (seededRandom(seed + 1) - 0.5) * 0.9;
    const x = w / 2 + frac * rx * Math.cos(theta);
    const y = h / 2 + frac * ry * Math.sin(theta);
    return { star: s, x, y, xPct: (x / w) * 100, yPct: (y / h) * 100 };
  });

  const lines = [];
  if (n > 1 && n <= 400) {
    const inTree = new Array(n).fill(false);
    const best = new Array(n).fill(Infinity);
    const from = new Array(n).fill(-1);
    best[0] = 0;
    const edges = [];
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      inTree[u] = true;
      if (from[u] >= 0) edges.push({ a: from[u], b: u, d: best[u] });
      for (let v = 0; v < n; v++) {
        if (inTree[v]) continue;
        const d = Math.hypot(positions[u].x - positions[v].x, positions[u].y - positions[v].y);
        if (d < best[v]) { best[v] = d; from[v] = u; }
      }
    }
    const sortedD = edges.map((e) => e.d).sort((a, b) => a - b);
    const median = sortedD[Math.floor(sortedD.length / 2)] || 0;
    edges.filter((e) => e.d <= median * 1.25).forEach((e) => lines.push([positions[e.a], positions[e.b]]));
  }
  return { positions, lines };
}

function SkyStar({ star, color, isMe, revealDelay, onSelect, selected, scale = 1 }) {
  // Bigger parties shine a little brighter; a crowded sky shrinks every star.
  const core = (6 + Math.min(star.guests, 10) * 1.1) * (isMe ? Math.max(scale, 0.85) : scale);
  const glow = core * 4.2;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={isMe ? `Your star, party of ${star.guests}` : `A star, party of ${star.guests}`}
      className="sky-star absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
      style={{ width: Math.max(44, glow), height: Math.max(44, glow), animationDelay: `${revealDelay}ms`, zIndex: isMe ? 3 : 2 }}
    >
      <span
        className="absolute rounded-full"
        style={{
          width: glow, height: glow,
          background: `radial-gradient(circle, ${color}${isMe ? "aa" : "66"} 0%, transparent 70%)`,
          filter: "blur(4px)",
          animation: isMe ? "skyMePulse 3.2s ease-in-out infinite" : undefined,
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          width: core, height: core,
          background: `radial-gradient(circle at 35% 30%, #ffffff, ${color})`,
          boxShadow: `0 0 ${isMe ? 16 : 9}px ${isMe ? 5 : 2}px ${color}${isMe ? "ee" : "aa"}`,
        }}
      />
      {(isMe || selected) && (
        <span className="absolute rounded-full border" style={{ width: core + 18, height: core + 18, borderColor: selected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)" }} />
      )}
      {isMe && (
        <span
          className="absolute top-full mt-0.5 whitespace-nowrap px-2 py-0.5 rounded-full text-[13px] font-semibold text-white"
          style={{ background: "rgba(8,10,28,0.78)", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          You
        </span>
      )}
    </button>
  );
}

// ---------- Countdown (job 78) ----------
const KIND_LABEL = {
  note: "Note from the artist", setlist: "Setlist tease", playlist: "Pre-show playlist",
  bts: "Behind the scenes", doors: "Doors & parking", merch: "Merch first look",
};
const notchWhen = (d) => (d === 0 ? "SHOW DAY" : d === 1 ? "DAY BEFORE" : d === 7 ? "1 WEEK" : d === 14 ? "2 WEEKS" : `${d} DAYS`);
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();

// What a turned Unlock notch reveals: text, an image and/or a link.
function UnlockPanel({ notch, color, onClose }) {
  const link = typeof notch.link_url === "string" && /^https?:\/\//i.test(notch.link_url.trim()) ? notch.link_url.trim() : notch.link_url ? `https://${String(notch.link_url).trim()}` : "";
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={notch.title || KIND_LABEL[notch.kind] || "Unlocked"}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[86%] overflow-y-auto rounded-t-[22px] sm:rounded-[22px] p-5" style={{ background: "#0b0e24", border: "1px solid #2b2f5a", boxShadow: `0 0 40px ${color}22` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color }}>{notchWhen(notch.days_before)} · {(KIND_LABEL[notch.kind] || "UNLOCKED").toUpperCase()}</div>
            <h2 className="mt-1 text-[24px] font-bold leading-tight">{notch.title || KIND_LABEL[notch.kind] || "Something new"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full text-white/70 border border-white/20">×</button>
        </div>
        {notch.image_url && <img src={notch.image_url} alt="" className="mt-4 w-full rounded-xl object-cover max-h-[320px] border border-white/10" />}
        {notch.body && <p className="mt-4 text-[16px] leading-relaxed text-white/90 whitespace-pre-line">{notch.body}</p>}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-center h-12 rounded-xl text-[16px] font-bold text-[#0d0d0d]" style={{ background: color }}>
            {notch.kind === "playlist" ? "Play it" : notch.kind === "merch" ? "See the merch" : "Open the link"} ›
          </a>
        )}
      </div>
    </div>
  );
}

// ---------- Hype meter + a message a day (job 234) ----------
const HYPE = [["👀", "Curious"], ["🙂", "Ready"], ["🔥", "Hyped"], ["🚀", "So hyped"], ["🤯", "Losing it"]];
const MAX_POST = 140;
const MAX_BUBBLES = 12; // the newest messages get a bubble; older ones show when the star is tapped
const dayWord = (day, today) => {
  if (!day) return "";
  if (day === today) return "TODAY";
  const t = today ? new Date(today + "T12:00:00") : new Date();
  t.setDate(t.getDate() - 1);
  if (day === t.toISOString().slice(0, 10)) return "YESTERDAY";
  return shortDate(day + "T12:00:00");
};
const preview = (m) => (m.length > 26 ? `${m.slice(0, 25).trimEnd()}…` : m);

// A short preview over a star that has a message.
function PostBubble({ message, isMe }) {
  return (
    <span
      className="absolute left-0 top-0 pointer-events-none whitespace-nowrap px-2.5 py-1 rounded-xl text-[12.5px] leading-tight text-white"
      style={{
        transform: "translate(-50%, calc(-100% - 20px))",
        background: isMe ? "rgba(140,255,61,0.16)" : "rgba(10,13,34,0.86)",
        border: `1px solid ${isMe ? "rgba(140,255,61,0.55)" : "rgba(255,255,255,0.2)"}`,
        boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
        zIndex: 4,
      }}
    >
      {preview(message)}
      <span aria-hidden="true" className="absolute left-1/2 -bottom-[5px] w-2.5 h-2.5 -translate-x-1/2 rotate-45"
        style={{ background: isMe ? "#1d2b17" : "rgb(10,13,34)", borderRight: `1px solid ${isMe ? "rgba(140,255,61,0.55)" : "rgba(255,255,255,0.2)"}`, borderBottom: `1px solid ${isMe ? "rgba(140,255,61,0.55)" : "rgba(255,255,255,0.2)"}` }} />
    </span>
  );
}

// Tapping a star: its party and its latest message.
function StarCard({ star, isMe, today, color, onClose, onPost }) {
  const post = star.post;
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-1" onClick={(e) => e.stopPropagation()}>
      <div className="w-full max-w-sm rounded-2xl p-4" style={{ background: "rgba(11,14,36,0.94)", border: `1px solid ${isMe ? `${color}88` : "#2b2f5a"}`, boxShadow: "0 10px 30px rgba(0,0,0,0.55)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: isMe ? color : "rgba(255,255,255,0.6)" }}>
            {isMe ? "YOU · " : ""}PARTY OF {star.guests}{post ? ` · ${dayWord(post.day, today)}` : ""}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto -mr-1 w-8 h-8 rounded-full text-white/60 hover:text-white">×</button>
        </div>
        {post
          ? <p className="mt-1 text-[17px] leading-snug text-white break-words">{post.message}</p>
          : <p className="mt-1 text-[15px] leading-snug text-white/55">{isMe ? "You haven't posted a message yet." : "No message yet."}</p>}
        {isMe && (
          <button type="button" onClick={onPost} className="mt-3 h-10 px-4 rounded-full text-[14px] font-bold text-[#0d0d0d]" style={{ background: color }}>
            {post && post.day === today ? "Edit today's message" : "Post today's message"}
          </button>
        )}
      </div>
    </div>
  );
}

// Write today's message: one a day, 140 characters, no name shown.
function PostComposer({ color, today, mine, onClose, onSave, onRemove }) {
  const [text, setText] = useState(mine?.message || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hidden = !!mine?.hidden;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr("");
    const e = await onSave(text.trim());
    setBusy(false);
    if (e) setErr(e);
  };
  const remove = async () => {
    setBusy(true); setErr("");
    const e = await onRemove();
    setBusy(false);
    if (e) setErr(e);
  };
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Post a message in the sky">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-[22px] sm:rounded-[22px] p-5" style={{ background: "#0b0e24", border: "1px solid #2b2f5a", boxShadow: `0 0 40px ${color}22` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color }}>{dayWord(today, today) || "TODAY"} · ONE MESSAGE A DAY</div>
            <h2 className="mt-1 text-[24px] font-bold leading-tight">{mine && !hidden ? "Edit today's message" : "Post to the sky"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full text-white/70 border border-white/20">×</button>
        </div>
        {hidden ? (
          <p className="mt-3 text-[15px] leading-relaxed text-white/75">The host hid today's message, so only you can see it. You can post a new one tomorrow.</p>
        ) : (
          <>
            <p className="mt-2 text-[15px] leading-snug text-white/65">It shows over your star for everyone coming. Your name never shows, just your party size.</p>
            <textarea
              autoFocus value={text} maxLength={MAX_POST} rows={3}
              onChange={(e) => setText(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
              placeholder="Can't wait for this one!"
              aria-label="Your message"
              className="mt-3 w-full rounded-xl px-3.5 py-3 text-[17px] leading-snug text-white bg-[#05060f] border border-[#2b2f5a] placeholder:text-white/35 focus:outline-none focus:border-[#8CFF3D]/60 resize-none"
            />
            <div className="mt-1 text-right text-[12px] text-white/45" style={{ fontFamily: SCENE_MONO }}>{text.length} / {MAX_POST}</div>
            {err && <p className="mt-1 text-[14px] text-red-400">{err}</p>}
            <div className="mt-3 flex items-center gap-2">
              {mine && (
                <button type="button" onClick={remove} disabled={busy} className="h-12 px-4 rounded-xl text-[15px] font-semibold text-white/80 border border-white/20 disabled:opacity-50">Take it down</button>
              )}
              <button type="button" onClick={save} disabled={busy || !text.trim()} className="flex-1 h-12 rounded-xl text-[16px] font-bold text-[#0d0d0d] disabled:opacity-50" style={{ background: color }}>
                {busy ? "Posting…" : mine ? "Save" : "Post it"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// A private note to the host (job 235): only the event's owner sees it.
function HostMessage({ color, onClose, onSend }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr("");
    const e = await onSend(text.trim());
    setBusy(false);
    if (e) setErr(e); else setSent(true);
  };
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Message the host">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-[22px] sm:rounded-[22px] p-5" style={{ background: "#0b0e24", border: "1px solid #2b2f5a", boxShadow: `0 0 40px ${color}22` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color }}>PRIVATE · ONLY THE HOST SEES THIS</div>
            <h2 className="mt-1 text-[24px] font-bold leading-tight">{sent ? "Sent to the host" : "Message the host"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full text-white/70 border border-white/20">×</button>
        </div>
        {sent ? (
          <>
            <p className="mt-3 text-[16px] leading-relaxed text-white/80">Thanks! The host will see it with your RSVP and can reply to the email you RSVP'd with.</p>
            <button type="button" onClick={onClose} className="mt-4 w-full h-12 rounded-xl text-[16px] font-bold text-[#0d0d0d]" style={{ background: color }}>Back to the sky</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-[15px] leading-snug text-white/65">Info for the host or a question about the show. They see your name and can reply by email.</p>
            <textarea autoFocus value={text} maxLength={1000} rows={5} onChange={(e) => setText(e.target.value)}
              placeholder="Is there parking nearby? Can I bring a camera?" aria-label="Your message to the host"
              className="mt-3 w-full rounded-xl px-3.5 py-3 text-[17px] leading-snug text-white bg-[#05060f] border border-[#2b2f5a] placeholder:text-white/35 focus:outline-none focus:border-[#8CFF3D]/60 resize-none" />
            <div className="mt-1 text-right text-[12px] text-white/45" style={{ fontFamily: SCENE_MONO }}>{text.length} / 1000</div>
            {err && <p className="mt-1 text-[14px] text-red-400">{err}</p>}
            <button type="button" onClick={send} disabled={busy || !text.trim()} className="mt-3 w-full h-12 rounded-xl text-[16px] font-bold text-[#0d0d0d] disabled:opacity-50" style={{ background: color }}>
              {busy ? "Sending…" : "Send to the host"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function EventSky() {
  const { token: tokenKey } = useParams();
  const resolved = useFanToken(tokenKey);
  const token = resolved.token;
  // Back to this same event page, whichever kind of link got here.
  const pageHref = window.location.pathname.replace(/\/sky\/?$/, "");
  const [params] = useSearchParams();
  const key = params.get("k") || "";
  // From the email's hype buttons (?hype=<notch>.<1-5>) and its "Post a
  // message" link (?post=1). Read once, then taken off the address.
  const [arrival] = useState(() => {
    const m = /^(.+)\.([1-5])$/.exec(params.get("hype") || "");
    return { hype: m ? { notch: m[1], level: Number(m[2]) } : null, post: params.get("post") === "1", ask: params.get("ask") === "1", film: params.get("film") === "1" };
  });
  const [toast, setToast] = useState("");
  const [composing, setComposing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [filmOpen, setFilmOpen] = useState(false);
  const [phase, setPhase] = useState("verifying"); // verifying | unlocking | open | failed
  const [sky, setSky] = useState(null);
  const [selected, setSelected] = useState(null);
  const firstOpen = useRef(true);
  const fieldRef = useRef(null);
  const [field, setField] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      setField((f) => (f.w === w && f.h === h ? f : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]); // the star field only mounts once the sky is open

  const load = useCallback(() => supabase.rpc("get_event_sky", { p_token: token, p_key: key }), [token, key]);

  useEffect(() => {
    let alive = true;
    if (resolved.state === "loading") return undefined;
    const started = Date.now();
    const valid = /^[0-9a-f-]{36}$/i.test(key) && /^[0-9a-f-]{36}$/i.test(token || "");
    (valid ? load() : Promise.resolve({ data: null })).then(({ data }) => {
      const wait = Math.max(0, MIN_VERIFY_MS - (Date.now() - started));
      setTimeout(() => {
        if (!alive) return;
        if (data) { setSky(data); setPhase("unlocking"); } else setPhase("failed");
      }, wait);
    });
    return () => { alive = false; };
  }, [load, key, token, resolved.state]);

  // Keep the sky current while it's open.
  useEffect(() => {
    if (phase !== "open") return undefined;
    const id = setInterval(() => load().then(({ data }) => { if (data) setSky(data); }), REFRESH_MS);
    return () => clearInterval(id);
  }, [phase, load]);

  // Fan-facing pages always use Show Pilot green, whatever the event type.
  const color = "#8CFF3D";
  const stars = sky?.stars || [];
  const layout = useMemo(() => skyLayout(stars, field.w, field.h), [stars, field.w, field.h]);

  const ev = sky?.event;
  const dateLabel = ev?.date
    ? new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";
  const meStar = stars.find((s) => s.id === sky?.me?.id);
  const joined = meStar ? new Date(meStar.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const open = phase === "open";
  const revealing = phase === "unlocking" || open;

  const onKeyDone = useCallback(() => setPhase("open"), []);
  // Countdown (job 78): notches in order, then the show-day pass.
  const countdown = sky?.countdown || null;
  const notches = countdown?.notches || [];
  const passOpen = countdown ? Date.now() >= new Date(countdown.show_opens_at).getTime() : false;
  const [unlockOpen, setUnlockOpen] = useState(null);
  const [seenNow, setSeenNow] = useState({});
  const openUnlock = (n) => {
    setUnlockOpen(n);
    if (!n.seen && !seenNow[n.id]) {
      setSeenNow((m) => ({ ...m, [n.id]: true }));
      supabase.rpc("open_countdown_notch", { p_token: token, p_key: key, p_notch: n.id }).then(({ error }) => { if (error) console.error(error); });
    }
  };
  // The key is drawn at 280px; on narrow or short screens (and in-app
  // browsers) shrink it so it and its message always fit.
  const [keyScale, setKeyScale] = useState(1);
  useEffect(() => {
    const fit = () => setKeyScale(Math.min(1, (window.innerWidth * 0.78) / 280, (window.innerHeight * 0.46) / 280));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => { if (open) firstOpen.current = false; }, [open]);

  // Once the sky is open: record the hype tap and/or open the composer.
  const arrived = useRef(false);
  useEffect(() => {
    if (!open || arrived.current) return;
    arrived.current = true;
    try {
      const u = new URL(window.location.href);
      if (["hype", "post", "ask", "film"].some((k) => u.searchParams.has(k))) {
        ["hype", "post", "ask", "film"].forEach((k) => u.searchParams.delete(k));
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      }
    } catch { /* keep the address as it is */ }
    if (arrival.hype) {
      const [emoji, label] = HYPE[arrival.hype.level - 1];
      supabase.rpc("set_countdown_hype", { p_token: token, p_key: key, p_notch: arrival.hype.notch, p_level: arrival.hype.level })
        .then(({ data, error }) => {
          if (error) console.error(error);
          setToast(data ? `${emoji} ${label}. Got it, see you there!` : "");
        });
    }
    if (arrival.ask) setAsking(true);
    else if (arrival.post) setComposing(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const refresh = () => load().then(({ data }) => { if (data) setSky(data); });
  const savePost = async (message) => {
    const { error } = await supabase.rpc("post_sky_message", { p_token: token, p_key: key, p_message: message });
    if (error) return error.message || "Couldn't post it. Try again.";
    setComposing(false);
    setSelected(sky?.me?.id || null);
    refresh();
    return "";
  };
  const sendToHost = async (message) => {
    const { error } = await supabase.rpc("send_host_message", { p_token: token, p_key: key, p_message: message });
    return error ? (error.message || "Couldn't send it. Try again.") : "";
  };
  const removePost = async () => {
    const { error } = await supabase.rpc("delete_sky_message", { p_token: token, p_key: key });
    if (error) return "Couldn't take it down. Try again.";
    setComposing(false);
    refresh();
    return "";
  };
  // The newest messages get bubbles; your own always does.
  // Bubbles go to the newest messages first, skipping any that would cover a
  // bubble already placed; those stars get a small dot and open on tap.
  const bubbleIds = useMemo(() => {
    const ids = new Set();
    const boxes = [];
    const meId = sky?.me?.id;
    const byNew = layout.positions.filter((p) => p.star.post)
      .sort((a, b) => (a.star.id === meId ? -1 : b.star.id === meId ? 1 : String(b.star.post.at).localeCompare(String(a.star.post.at))));
    for (const p of byNew) {
      if (ids.size >= MAX_BUBBLES + (meId && p.star.id === meId ? 1 : 0)) break;
      const w = Math.min(26, p.star.post.message.length) * 7.2 + 24, h = 28;
      const box = { l: p.x - w / 2, r: p.x + w / 2, t: p.y - 20 - h, b: p.y - 20 };
      if (boxes.some((o) => box.l < o.r + 4 && box.r > o.l - 4 && box.t < o.b + 3 && box.b > o.t - 3)) continue;
      boxes.push(box);
      ids.add(p.star.id);
    }
    return ids;
  }, [layout, sky?.me?.id]);
  // After the show (job 239): Stellar Birth, built from this sky and the
  // host's settings. Only once the show's day has passed. The morning-after
  // email links here with &film=1, which opens it; the sky also has a button.
  const film = sky?.film?.show_over ? sky.film : null;
  const filmProps = useMemo(() => {
    if (!film) return null;
    const cfg = film.config || {};
    const title = String(cfg.title || "").trim() || sky?.event?.event_name || sky?.event?.band_name || "Tonight";
    return {
      stars: stars.map((s0) => ({ id: s0.id, me: s0.id === sky?.me?.id, color: hashColor(s0.id) })),
      sun: /^#[0-9a-f]{6}$/i.test(cfg.sun || "") ? cfg.sun : null,
      title,
      dateLine: filmDateLine(film.date, film.venue),
      imageUrl: film.image || null,
      show: { you: true, header: true, name: true, date: true, ...(cfg.show || {}) },
      fileName: `stellar-birth-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.replace(/-$/, ""),
    };
  }, [film, stars, sky?.me?.id, sky?.event]);
  const filmAuto = useRef(false);
  useEffect(() => {
    if (!open || !filmProps || filmAuto.current || !arrival.film) return;
    filmAuto.current = true;
    setFilmOpen(true);
  }, [open, filmProps]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedStar = stars.find((s) => s.id === selected) || null;
  const minePost = sky?.me?.post_today || null;

  return (
    <div className="sky-root fixed inset-x-0 top-0 overflow-hidden bg-black text-white" style={{ fontFamily: SCENE_FONT }}>
      <style>{`
        .sky-root { height: 100vh; height: 100dvh; }
        @keyframes skyMePulse { 0%,100% { transform: scale(1); opacity: .85 } 50% { transform: scale(1.45); opacity: 1 } }
        @keyframes skyStarIn { from { opacity: 0; transform: translate(-50%,-50%) scale(.2) } to { opacity: 1; transform: translate(-50%,-50%) scale(1) } }
        .sky-star { animation: skyStarIn 900ms cubic-bezier(.2,.8,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .sky-star { animation: none } }
      `}</style>

      {/* The sky fades and settles into view as the key opens. */}
      {/* The moving night sky with shooting stars, like the other star pages
          (job 237). */}
      <div
        className="absolute inset-0 isolate"
        style={{
          opacity: revealing ? 1 : 0.35,
          transform: open ? "scale(1)" : "scale(1.08)",
          filter: open ? "none" : "blur(4px)",
          transition: "opacity 1200ms ease, transform 1600ms cubic-bezier(.2,.8,.2,1), filter 1400ms ease",
        }}
      >
        <NightSky seed={token} dim={0.1} />
      </div>

      {/* Key overlay */}
      {phase !== "open" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div style={{ width: 280 * keyScale, height: 280 * keyScale }}>
            <div style={{ transform: `scale(${keyScale})`, transformOrigin: "top left" }}>
              <SkyKey seed={key} color={color} phase={phase === "failed" ? "failed" : phase} onDone={onKeyDone} />
            </div>
          </div>
          {phase === "verifying" && <p className="mt-6 text-lg text-white/60">Checking your key…</p>}
          {phase === "failed" && (
            <div className="mt-6 max-w-xs">
              <p className="text-2xl font-bold">This key doesn't open this sky</p>
              <p className="mt-1.5 text-[15px] leading-snug text-white/60">Use the Unlock your key link in your RSVP email, or RSVP on the event page to get a key.</p>
              <a href={pageHref} className="inline-block mt-4 px-5 py-2.5 rounded-full text-base font-bold text-[#0d0d0d]" style={{ background: "#8CFF3D" }}>Go to the event page</a>
            </div>
          )}
        </div>
      )}

      {/* The sky itself */}
      {open && sky && (
        // Title, stars and footer stack top to bottom, so on any screen
        // height (short phones, in-app browsers, long event names) the text
        // takes what it needs and the stars fill only the space left.
        <div className="absolute inset-0 flex flex-col">
          <div className="shrink-0 px-5 pt-5 pb-3" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0))" }}>
            <h1 className="font-bold leading-[0.95] line-clamp-2" style={{ fontSize: "clamp(26px, 8.5vw, 34px)" }}>{ev?.event_name || ev?.band_name || "Tonight"}</h1>
            {(dateLabel || ev?.venue) && <p className="mt-1.5 text-[15px] text-white/65 truncate">{[dateLabel, ev?.venue].filter(Boolean).join(" at ")}</p>}
            {/* Job 237: the three actions under the title, each its own color. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ...(filmProps ? [["Watch Stellar Birth", () => setFilmOpen(true), "#FFB347"]] : []),
                [minePost && !minePost.hidden ? "Edit today's message" : "Post to the sky", () => setComposing(true), color],
                ["Message the host", () => setAsking(true), "#60A5FA"],
                ["Event details", () => { window.location.href = pageHref; }, "#C084FC"],
              ].map(([label, go, c]) => (
                <button key={c} type="button" onClick={go}
                  className="h-10 px-4 rounded-full text-[14px] font-bold whitespace-nowrap backdrop-blur-sm hover:brightness-125"
                  style={{ color: c, background: `${c}1f`, border: `1.5px solid ${c}99`, boxShadow: `0 0 14px ${c}26` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stars fill the space between the title and the footer. */}
          <div ref={fieldRef} className="relative flex-1 min-h-[160px] mx-7 my-3" onClick={() => setSelected(null)}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden="true">
              {layout.lines.map(([a, b]) => (
                <line key={`${a.star.id}-${b.star.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(200,210,255,0.13)" strokeWidth="1" />
              ))}
            </svg>
            {layout.positions.map((p, i) => {
              const isMe = p.star.id === sky.me?.id;
              return (
                <div key={p.star.id} className="absolute" style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}>
                  <SkyStar
                    star={p.star}
                    color={isMe ? color : hashColor(p.star.id)}
                    isMe={isMe}
                    scale={stars.length > 90 ? 0.6 : stars.length > 45 ? 0.78 : 1}
                    selected={selected === p.star.id}
                    revealDelay={firstOpen.current ? (isMe ? 700 : 100 + Math.min(i, 40) * 25) : 0}
                    onSelect={(e) => { e.stopPropagation(); setSelected(selected === p.star.id ? null : p.star.id); }}
                  />
                  {p.star.post && selected !== p.star.id && (bubbleIds.has(p.star.id)
                    ? <PostBubble message={p.star.post.message} isMe={isMe} />
                    : <span aria-hidden="true" className="absolute left-0 top-0 w-[7px] h-[7px] rounded-full pointer-events-none" style={{ transform: "translate(7px, -15px)", background: "rgba(255,255,255,0.8)", boxShadow: "0 0 6px rgba(255,255,255,0.7)", zIndex: 4 }} />)}
                </div>
              );
            })}
            {toast && (
              <div role="status" className="absolute left-1/2 -translate-x-1/2 top-0 z-20 px-4 py-2.5 rounded-full text-[15px] font-semibold text-white whitespace-nowrap"
                style={{ background: "rgba(11,14,36,0.95)", border: `1px solid ${color}88`, boxShadow: `0 0 22px ${color}33` }}>
                {toast}
              </div>
            )}
            {selectedStar && (
              <StarCard star={selectedStar} isMe={selectedStar.id === sky.me?.id} today={sky.today} color={color}
                onClose={() => setSelected(null)} onPost={() => setComposing(true)} />
            )}
          </div>

          <div className="shrink-0 px-5 pt-3 pb-5" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.85), rgba(0,0,0,0))" }}>
            <p className="font-bold leading-tight" style={{ fontSize: "clamp(17px, 5.2vw, 20px)" }}>
              {stars.length} {stars.length === 1 ? "star" : "stars"} in the sky, {sky.people} {sky.people === 1 ? "person" : "people"} coming
            </p>
            <p className="mt-0.5 text-[15px] leading-snug text-white/60">
              {sky.me?.name ? `${sky.me.name}, your` : "Your"} star joined{joined ? ` on ${joined}` : ""}.
            </p>
          </div>
        </div>
      )}

      {unlockOpen && <UnlockPanel notch={unlockOpen} color={color} onClose={() => setUnlockOpen(null)} />}
      {filmOpen && filmProps && <AfterShowFilm {...filmProps} onClose={() => setFilmOpen(false)} />}
      {asking && open && sky && <HostMessage color={color} onClose={() => setAsking(false)} onSend={sendToHost} />}
      {composing && open && sky && (
        <PostComposer color={color} today={sky.today} mine={minePost} onClose={() => setComposing(false)} onSave={savePost} onRemove={removePost} />
      )}

    </div>
  );
}
