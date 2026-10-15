import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Star, KeyRound, MapPin, LogOut, ExternalLink, Ticket, Sparkles, User, Check, Pencil, Compass } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { usePreferences } from "@/hooks/usePreferences";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { fanPath } from "@/lib/fanUrl";
import { hashString, seededRandom } from "@/lib/constellation";
import SpaceDrift from "@/components/showpilot/SpaceDrift";

// Fan accounts (jobs 77, 79, 83, 84, 85; direction in claude/fan-profile-direction.md).
// The fan's own corner of Show Pilot, on the black drifting-space sky:
//   Shows  three views: Coming up and Been there (their RSVPs, as big cards
//          with the event's art) and Discover (only if the fan turns on local
//          shows: events near their home city that hosts listed, by type)
//   Stars  their constellation: one star per show; tap one for a summary
//   Me     their name, local shows, star color and sign out
// Every tab fits the screen: no page scrolling, phone-first.

const LINE = "#2b2f5a";
const SOFT = "#b7bbe6";
const DIM = "#7e83b8";
const G = "#8CFF3D";
const CARD = "rgba(16,20,52,0.82)";

const STAR_COLORS = [
  { hex: "#E4E0FF", name: "Starlight" },
  { hex: "#8CFF3D", name: "Green" },
  { hex: "#60A5FA", name: "Blue" },
  { hex: "#F472B6", name: "Pink" },
  { hex: "#FF6A00", name: "Blaze" },
  { hex: "#F2FF00", name: "Highlighter" },
];
// Any color the fan picks, lifted if it's too dark to see on the black sky
// (and to keep dark text readable on star-colored buttons).
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const luminance = ([r, g, b]) => {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const liftColor = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return DEFAULT_STAR;
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  if (luminance(rgb) >= 0.2) return `#${m[1].toUpperCase()}`;
  // Mix toward white until it's bright enough to read on black.
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = rgb.map((c) => c + (1 - c) * t);
    if (luminance(mixed) >= 0.2) return toHex(mixed);
  }
  return DEFAULT_STAR;
};
const DEFAULT_STAR = "#E4E0FF";
// discover: false = personal only; city/state = home area; types = filter.
const DEFAULT_STYLE = { star: DEFAULT_STAR, discover: false, city: "", state: "", types: [] };

const TABS = [
  { id: "shows", label: "Shows", icon: Ticket, title: "MY SHOWS" },
  { id: "stars", label: "Stars", icon: Sparkles, title: "MY STARS" },
  { id: "me", label: "Me", icon: User, title: "ME" },
];

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"],
  ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];
const stateName = (ab) => US_STATES.find(([a]) => a === ab)?.[1] || ab;
const typeKey = (t) => String(t || "").trim().toLowerCase();
const typeLabel = (t) => String(t || "").trim().replace(/\b\w/g, (c) => c.toUpperCase());

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateParts = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return {
    dow: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    mon: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: d.getDate(),
    long: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
  };
};
const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000);
};
const countdownLabel = (n) => (n === null ? "DATE TBA" : n === 0 ? "TONIGHT" : n === 1 ? "TOMORROW" : `${n} DAYS TO GO`);
const showTitle = (s) => s.event_name || s.band_name || "Untitled event";
const placeOf = (s) => [s.venue, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
const partyOf = (s) => (s.guests > 1 ? `YOU + ${s.guests - 1}` : "JUST YOU");
const linksFor = (s) => {
  const page = s.fan_token || s.fan_slug ? fanPath(s.fan_slug, s.fan_token) : null;
  return { page, sky: page && s.sky_key ? `${page}/sky?k=${s.sky_key}` : null };
};

export default function FanHome() {
  const { user } = useAuth();
  const { preferences, setPreferences } = usePreferences();
  const style = { ...DEFAULT_STYLE, ...(preferences?.fan_style || {}) };
  const STAR = liftColor(style.star);

  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "shows";
  const setParam = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  const setTab = (id) => setParam({ tab: id });

  const [shows, setShows] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.rpc("get_my_fan_shows").then(({ data, error: err }) => {
      if (!alive) return;
      if (err) { console.error(err); setError(true); setShows([]); return; }
      setShows(Array.isArray(data) ? data : []);
    });
    return () => { alive = false; };
  }, []);

  // Save the fan's look on their account (falls back to this screen only if
  // the save fails, e.g. before the fan_style column exists).
  const saveStyle = async (patch) => {
    const next = { ...style, ...patch };
    setPreferences((p) => ({ ...(p || {}), fan_style: next }));
    if (!user?.id) return;
    const { error: err } = await supabase.from("user_preferences").update({ fan_style: next }).eq("user_id", user.id);
    if (err) console.error(err);
  };
  const saveName = async (name) => {
    const clean = String(name || "").trim().slice(0, 40) || null;
    setPreferences((p) => ({ ...(p || {}), display_name: clean }));
    if (!user?.id) return;
    const { error: err } = await supabase.from("user_preferences").update({ display_name: clean }).eq("user_id", user.id);
    if (err) console.error(err);
  };

  const today = todayIso();
  const upcoming = (shows || []).filter((s) => !s.date || s.date >= today);
  const past = (shows || []).filter((s) => s.date && s.date < today).reverse();
  const current = TABS.find((t) => t.id === tab);
  const name = preferences?.display_name || "";
  // Which Shows view: Coming up / Been there / Discover (held in ?view=).
  const VIEWS = ["upcoming", "past", ...(style.discover ? ["discover"] : [])];
  const asked = params.get("view") || (params.get("tab") === "discover" ? "discover" : "");
  const view = VIEWS.includes(asked) ? asked : upcoming.length || !style.discover ? (upcoming.length || !past.length ? "upcoming" : "past") : "discover";

  return (
    <div className="h-[100dvh] relative isolate overflow-hidden flex flex-col text-white" style={{ fontFamily: SCENE_FONT, backgroundColor: "#000" }}>
      <Backdrop />

      <div className="flex-1 min-h-0 w-full max-w-lg mx-auto px-4 pt-5 flex flex-col">
        <header className="shrink-0 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.16em] truncate" style={{ fontFamily: SCENE_MONO, color: SOFT }}>
              {name ? name.toUpperCase() : "SHOW PILOT"} · FAN
            </div>
            <h1 className="text-[32px] font-bold tracking-[0.04em] leading-none mt-1 whitespace-nowrap">{current.title}</h1>
          </div>
          {tab === "shows" && view === "discover" && style.state && (
            <span className="text-[12px] tracking-[0.1em] pb-1 truncate min-w-0" style={{ fontFamily: SCENE_MONO, color: SOFT }}>
              <MapPin className="inline w-3 h-3 -mt-0.5 mr-1" />{(style.city ? `${style.city}, ${style.state}` : stateName(style.state)).toUpperCase()}
            </span>
          )}
          {tab === "stars" && shows && shows.length > 0 && (
            <span className="text-[12px] tracking-[0.1em] pb-1" style={{ fontFamily: SCENE_MONO, color: SOFT }}>
              {past.length} LIT · {upcoming.length} WAITING
            </span>
          )}
        </header>

        <main className="flex-1 min-h-0 mt-4 mb-3 flex flex-col">
          {shows === null ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${STAR}33`, borderTopColor: STAR }} />
            </div>
          ) : tab === "me" ? (
            <MeTab user={user} name={name} style={style} star={STAR} counts={{ total: shows.length, upcoming: upcoming.length, past: past.length }} onStyle={saveStyle} onName={saveName} />
          ) : error ? (
            <Notice text="Your shows couldn't load right now. Try again in a minute." />
          ) : tab === "stars" ? (
            shows.length === 0 ? <EmptyShows email={user?.email} stars star={STAR} /> : <StarsTab shows={shows} today={today} star={STAR} />
          ) : (
            <ShowsTab upcoming={upcoming} past={past} star={STAR} view={view} views={VIEWS} onView={(v) => setParam({ view: v, tab: "shows" })}
              email={user?.email} style={style} onStyle={saveStyle} onSetUp={() => setTab("me")} />
          )}
        </main>
      </div>

      <FanTabs tabs={TABS} tab={tab} onTab={setTab} star={STAR} />
    </div>
  );
}

// Deep black, drifting space behind every tab (same for every fan, job 88).
function Backdrop() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <SpaceDrift />
      <span className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)" }} />
    </div>
  );
}

function FanTabs({ tabs, tab, onTab, star }) {
  return (
    <nav aria-label="Fan" className="shrink-0 backdrop-blur-lg" style={{ background: "rgba(0,0,0,0.85)", borderTop: `1px solid ${LINE}`, paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
      <div className="max-w-lg mx-auto h-16 flex items-center justify-around px-2">
        {tabs.map((t) => {
          const on = t.id === tab;
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" onClick={() => onTab(t.id)} aria-current={on ? "page" : undefined}
              className={`${tabs.length > 3 ? "w-[76px]" : "w-20"} h-14 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors`}
              style={{ color: on ? star : DIM, background: on ? `${star}14` : "transparent" }}>
              <Icon className="w-[22px] h-[22px]" style={on ? { filter: `drop-shadow(0 0 6px ${star}99)` } : undefined} />
              <span className="text-[13px] font-bold tracking-[0.06em]">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Notice({ text }) {
  return <p className="text-[15px] leading-relaxed rounded-xl px-4 py-4" style={{ background: CARD, border: `1px solid ${LINE}`, color: SOFT }}>{text}</p>;
}

function EmptyShows({ email, stars, star }) {
  return (
    <div className="flex-1 flex items-center">
      <div className="w-full rounded-2xl px-5 py-8 text-center" style={{ background: CARD, border: `1px dashed ${LINE}` }}>
        <Star className="w-8 h-8 mx-auto" style={{ color: star }} />
        <h2 className="text-[24px] font-bold mt-3 leading-tight">{stars ? "Your sky is empty, for now" : "No shows yet"}</h2>
        <p className="text-[15px] mt-2 leading-relaxed" style={{ color: SOFT }}>
          RSVP to an event with <span className="text-white font-semibold break-all">{email}</span> and it lands here{stars ? " as a new star" : ", with your key to the event's sky"}.
        </p>
      </div>
    </div>
  );
}

// ---------- Shows ----------
// Three views on one tab: Coming up / Been there (the fan's RSVPs) and, when
// local shows is on, Discover. Each is a swipeable deck of big flyer cards
// that fills the space between the header and the bottom bar.
function ShowsTab({ upcoming, past, star, view, views, onView, email, style, onStyle, onSetUp }) {
  const LABELS = { upcoming: ["Coming up", upcoming.length], past: ["Been there", past.length], discover: ["Discover", null] };
  const list = view === "past" ? past : upcoming;
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div role="tablist" aria-label="Shows" className="shrink-0 flex gap-1 p-1 rounded-full" style={{ background: "rgba(16,20,52,0.7)", border: `1px solid ${LINE}` }}>
        {views.map((id) => {
          const on = view === id;
          const [label, n] = LABELS[id];
          return (
            <button key={id} type="button" role="tab" aria-selected={on} onClick={() => onView(id)}
              className="flex-1 min-w-0 h-10 rounded-full flex items-center justify-center gap-1.5 text-[14px] font-bold tracking-[0.02em] whitespace-nowrap transition-colors"
              style={{ background: on ? star : "transparent", color: on ? "#0d0d0d" : SOFT }}>
              {id === "discover" && <Compass className="w-3.5 h-3.5 shrink-0" />}
              {label}
              {n !== null && <span className="text-[11px] font-bold rounded-full px-1.5 leading-[16px]" style={{ fontFamily: SCENE_MONO, background: on ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.08)" }}>{n}</span>}
            </button>
          );
        })}
      </div>
      {view === "discover" ? (
        <DiscoverTab style={style} star={star} onStyle={onStyle} onSetUp={onSetUp} />
      ) : list.length === 0 ? (
        upcoming.length + past.length === 0
          ? <EmptyShows email={email} star={star} />
          : <div className="flex-1 flex items-center"><Notice text={view === "upcoming" ? "Nothing coming up. Your next RSVP will show here." : "No past shows yet."} /></div>
      ) : (
        <Deck items={list} keyOf={(s) => s.rsvp_id} resetKey={view} star={star}
          render={(s, single) => <ShowPanel show={s} past={view === "past"} star={star} single={single} />} />
      )}
    </div>
  );
}

// A swipeable row of full-height cards with a crossfader under it (job 89):
// one tick per card; drag the knob (or tap a tick) to slide through the
// flyers, and swiping the cards moves the knob with them.
function Deck({ items, keyOf, render, resetKey, star }) {
  const deckRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(0); // 0..1, follows the scroll exactly
  useEffect(() => { setIndex(0); setPos(0); deckRef.current?.scrollTo({ left: 0 }); }, [resetKey]);
  const onScroll = () => {
    const el = deckRef.current;
    if (!el || !el.firstElementChild) return;
    const max = el.scrollWidth - el.clientWidth;
    setPos(max > 0 ? el.scrollLeft / max : 0);
    const w = el.firstElementChild.getBoundingClientRect().width + 12;
    setIndex(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w))));
  };
  const single = items.length === 1;
  return (
    <>
      <div ref={deckRef} onScroll={onScroll} className="flex-1 min-h-0 flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1" style={{ scrollbarWidth: "none" }}>
        {items.map((it) => <React.Fragment key={keyOf(it)}>{render(it, single)}</React.Fragment>)}
      </div>
      {!single && <Crossfader count={items.length} index={index} pos={pos} deckRef={deckRef} star={star} />}
    </>
  );
}

function Crossfader({ count, index, pos, deckRef, star }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const lastTick = useRef(index);
  const EDGE = 26; // px from each end of the track to the first / last tick (fits the knob)

  // Center card i in the deck (smooth unless told otherwise).
  const goTo = (i, smooth = true) => {
    const el = deckRef.current;
    const card = el?.children[Math.max(0, Math.min(count - 1, i))];
    if (!el || !card) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = i <= 0 ? 0 : i >= count - 1 ? max : card.offsetLeft - el.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, Math.min(max, left)), behavior: smooth ? "smooth" : "auto" });
  };
  const fracAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left - EDGE) / (r.width - EDGE * 2)));
  };
  // While dragging, the deck follows the knob 1:1 (snapping off), with a
  // tiny buzz on phones that support it each time the knob passes a tick.
  const follow = (clientX) => {
    const el = deckRef.current;
    if (!el) return;
    const f = fracAt(clientX);
    el.scrollLeft = f * (el.scrollWidth - el.clientWidth);
    const tick = Math.round(f * (count - 1));
    if (tick !== lastTick.current) { lastTick.current = tick; try { navigator.vibrate?.(4); } catch { /* not supported */ } }
  };
  const onDown = (e) => {
    if (e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const el = deckRef.current;
    if (el) el.style.scrollSnapType = "none";
    lastTick.current = index;
    setDragging(true);
    follow(e.clientX);
  };
  const onMove = (e) => { if (dragging) follow(e.clientX); };
  const onUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    const i = Math.round(fracAt(e.clientX) * (count - 1));
    const el = deckRef.current;
    if (el) el.style.scrollSnapType = "";
    goTo(i);
  };
  const onKey = (e) => {
    const next = { ArrowRight: index + 1, ArrowUp: index + 1, ArrowLeft: index - 1, ArrowDown: index - 1, Home: 0, End: count - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    goTo(Math.max(0, Math.min(count - 1, next)));
  };
  const ticks = count <= 40;

  return (
    <div ref={trackRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      className="shrink-0 relative h-9 rounded-full select-none touch-none cursor-pointer"
      style={{ background: "rgba(10,12,32,0.85)", border: `1px solid ${LINE}` }}>
      {/* the slot the knob rides in */}
      <span aria-hidden="true" className="absolute top-1/2 -translate-y-1/2 h-[4px] rounded-full"
        style={{ left: EDGE, right: EDGE, background: "#04050d", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.05)" }} />
      {/* one tick per show, above and below the slot; the current one lit */}
      {ticks && Array.from({ length: count }, (_, i) => {
        const on = i === index;
        const left = `calc(${EDGE}px + ${(count === 1 ? 0 : i / (count - 1)) * 100}% - ${(count === 1 ? 0 : i / (count - 1)) * EDGE * 2}px)`;
        return (
          <React.Fragment key={i}>
            <span aria-hidden="true" className="absolute top-[5px] w-px h-[6px] -translate-x-1/2" style={{ left, background: on ? star : "#4a5090", boxShadow: on ? `0 0 4px ${star}` : "none" }} />
            <span aria-hidden="true" className="absolute bottom-[5px] w-px h-[6px] -translate-x-1/2" style={{ left, background: on ? star : "#4a5090", boxShadow: on ? `0 0 4px ${star}` : "none" }} />
          </React.Fragment>
        );
      })}
      {/* the fader cap */}
      <span role="slider" tabIndex={0} aria-label="Move between shows" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1}
        aria-valuetext={`Show ${index + 1} of ${count}`} onKeyDown={onKey}
        className="absolute top-1/2 w-10 h-[26px] rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{
          left: `calc(${EDGE}px + ${pos * 100}% - ${pos * EDGE * 2}px)`,
          transform: `translate(-50%, -50%) scale(${dragging ? 1.06 : 1})`,
          transition: dragging ? "transform 120ms" : "transform 160ms",
          background: "linear-gradient(180deg, #343a70 0%, #1b1f45 48%, #121532 52%, #1d2250 100%)",
          border: `1px solid ${star}88`,
          boxShadow: `0 2px 6px rgba(0,0,0,0.7), 0 0 ${dragging ? 16 : 10}px ${star}${dragging ? "66" : "33"}`,
        }}>
        <span aria-hidden="true" className="absolute left-1/2 top-[4px] bottom-[4px] w-[2px] -translate-x-1/2 rounded-full" style={{ background: star, boxShadow: `0 0 6px ${star}` }} />
        <span aria-hidden="true" className="absolute left-[7px] top-[7px] bottom-[7px] w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
        <span aria-hidden="true" className="absolute right-[7px] top-[7px] bottom-[7px] w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
      </span>
    </div>
  );
}

// The flyer card shell: the event's art (or a starry gradient), a dark fade
// for the text, and the date block top-left.
function FlyerFrame({ art, dim, date, star, single, children }) {
  const parts = dateParts(date);
  return (
    <article className="relative shrink-0 snap-center rounded-3xl overflow-hidden flex flex-col justify-end"
      style={{ width: single ? "100%" : "86%", border: `1px solid ${LINE}`, background: "#0b0e24" }}>
      {art ? (
        <img src={art} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: dim ? "grayscale(0.5) brightness(0.8)" : "none" }} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={{ background: `radial-gradient(circle at 70% 25%, ${star}40, transparent 55%), radial-gradient(circle at 20% 80%, #3b2f8a66, transparent 60%), #0b0e24` }}>
          <Star className="absolute right-6 top-6 w-16 h-16" style={{ color: star, opacity: 0.35 }} />
        </div>
      )}
      <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(3,4,14,0.78) 62%, rgba(3,4,14,0.96))" }} />
      {parts && (
        <div className="absolute left-4 top-4 rounded-xl px-3 py-2 text-center" style={{ background: "rgba(0,0,0,0.6)", border: `1px solid ${LINE}`, backdropFilter: "blur(6px)" }}>
          <div className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{parts.mon}</div>
          <div className="text-[30px] font-bold leading-none">{parts.day}</div>
          <div className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{parts.dow}</div>
        </div>
      )}
      <div className="relative px-4 pb-4 flex flex-col gap-1.5">{children}</div>
    </article>
  );
}

function ShowPanel({ show, past, star, single }) {
  const parts = dateParts(show.date);
  const n = daysUntil(show.date);
  const { page, sky } = linksFor(show);
  const place = placeOf(show);
  return (
    <FlyerFrame art={show.flyer_url} dim={past} date={show.date} star={star} single={single}>
        <span className="text-[12px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: past ? SOFT : n !== null && n <= 1 ? G : star }}>
          {past ? `BEEN THERE · ${parts?.long?.toUpperCase() || ""}` : countdownLabel(n)}
        </span>
        <h3 className="text-[28px] font-bold leading-[1.05] tracking-[0.02em] line-clamp-2">{showTitle(show)}</h3>
        {show.band_name && show.event_name && show.band_name !== show.event_name && <span className="text-[15px] text-white/85 truncate">{show.band_name}</span>}
        {place && <span className="flex items-center gap-1.5 text-[14px] truncate" style={{ color: SOFT }}><MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{place}</span></span>}
        <span className="text-[12px]" style={{ fontFamily: SCENE_MONO, color: "#c3c7ee" }}>{partyOf(show)}{show.artist_name ? ` · FOR ${String(show.artist_name).toUpperCase()}` : ""}</span>
        <div className="flex gap-2 mt-2">
          {sky && (
            <Link to={sky} className="flex-1 min-w-0 h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-bold whitespace-nowrap"
              style={{ background: past ? "rgba(0,0,0,0.5)" : G, color: past ? star : "#0d0d0d", border: past ? `1px solid ${LINE}` : "none" }}>
              <KeyRound className="w-4 h-4" /> {past ? "Your star" : "Open your key"}
            </Link>
          )}
          {page && (
            <Link to={page} className="flex-1 min-w-0 h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-semibold whitespace-nowrap" style={{ color: "#fff", border: `1px solid ${LINE}`, background: "rgba(0,0,0,0.5)" }}>
              Event page <ExternalLink className="w-4 h-4" />
            </Link>
          )}
        </div>
    </FlyerFrame>
  );
}

// ---------- Discover ----------
// Upcoming events near the fan's home city that their hosts chose to list,
// as the same flyer cards, filtered by event type (saved on the account).
function DiscoverTab({ style, star, onStyle, onSetUp }) {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!style.state) return undefined;
    let alive = true;
    setList(null);
    setFailed(false);
    supabase.rpc("get_local_shows", { p_city: style.city || "", p_states: [style.state, stateName(style.state)] }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.error(error); setFailed(true); setList([]); return; }
      setList(Array.isArray(data) ? data : []);
    });
    return () => { alive = false; };
  }, [style.city, style.state]);

  if (!style.state) {
    return (
      <div className="flex-1 flex items-center">
        <div className="w-full rounded-2xl px-5 py-8 text-center" style={{ background: CARD, border: `1px dashed ${LINE}` }}>
          <Compass className="w-8 h-8 mx-auto" style={{ color: star }} />
          <h2 className="text-[24px] font-bold mt-3 leading-tight">Where's home?</h2>
          <p className="text-[15px] mt-2 leading-relaxed" style={{ color: SOFT }}>Set your city in Me and shows near you land here.</p>
          <button type="button" onClick={onSetUp} className="mt-4 h-11 px-5 rounded-xl text-[15px] font-bold" style={{ background: star, color: "#0d0d0d" }}>Set my city</button>
        </div>
      </div>
    );
  }
  if (list === null) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${star}33`, borderTopColor: star }} /></div>;
  }
  if (failed) return <Notice text="Local shows couldn't load right now. Try again in a minute." />;

  // Types come from what's actually listed nearby, most common first.
  const counts = new Map();
  list.forEach((s) => {
    const k = typeKey(s.event_type);
    if (k) counts.set(k, { label: counts.get(k)?.label || typeLabel(s.event_type), n: (counts.get(k)?.n || 0) + 1 });
  });
  const types = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const picked = (style.types || []).filter((k) => counts.has(k));
  const shown = picked.length ? list.filter((s) => picked.includes(typeKey(s.event_type))) : list;
  const toggle = (k) => onStyle({ types: picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k] });
  const chip = (on, label, onClick, key) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={on}
      className="shrink-0 h-9 px-3.5 rounded-full text-[14px] font-bold whitespace-nowrap"
      style={{ background: on ? star : "rgba(16,20,52,0.7)", color: on ? "#0d0d0d" : SOFT, border: `1px solid ${on ? star : LINE}` }}>
      {label}
    </button>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {types.length > 0 && (
        <div className="shrink-0 flex gap-2 overflow-x-auto -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
          {chip(!picked.length, `All · ${list.length}`, () => onStyle({ types: [] }), "all")}
          {types.map(([k, v]) => chip(picked.includes(k), `${v.label} · ${v.n}`, () => toggle(k), k))}
        </div>
      )}
      {shown.length === 0 ? (
        <div className="flex-1 flex items-center">
          <Notice text={list.length
            ? "Nothing nearby in those types right now. Try another filter."
            : `No shows listed near ${style.city || stateName(style.state)} yet. When hosts list their events, they'll show up here.`} />
        </div>
      ) : (
        <Deck items={shown} keyOf={(s) => s.show_key} resetKey={`${picked.join(",")}|${style.city}|${style.state}`} star={star}
          render={(s, single) => <DiscoverPanel show={s} star={star} single={single} />} />
      )}
    </div>
  );
}

function DiscoverPanel({ show, star, single }) {
  const n = daysUntil(show.date);
  const page = show.fan_token || show.fan_slug ? fanPath(show.fan_slug, show.fan_token) : null;
  const place = placeOf(show);
  const kicker = [show.event_type && typeLabel(show.event_type).toUpperCase(), countdownLabel(n)].filter(Boolean).join(" · ");
  const meta = [
    show.show_time && String(show.show_time).toUpperCase(),
    show.entry === "rsvp" ? (show.price ? `${show.price} AT THE DOOR` : "RSVP · PAY AT THE DOOR") : show.price ? `TICKETS ${show.price}` : null,
    !show.local && "NEARBY",
  ].filter(Boolean).join(" · ");
  return (
    <FlyerFrame art={show.flyer_url} date={show.date} star={star} single={single}>
      {show.going && (
        <span className="self-start mb-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, background: G, color: "#0d0d0d" }}>YOU'RE GOING</span>
      )}
      <span className="text-[12px] tracking-[0.12em] truncate" style={{ fontFamily: SCENE_MONO, color: n !== null && n <= 1 ? G : star }}>{kicker}</span>
      <h3 className="text-[28px] font-bold leading-[1.05] tracking-[0.02em] line-clamp-2">{showTitle(show)}</h3>
      {show.band_name && show.event_name && show.band_name !== show.event_name && <span className="text-[15px] text-white/85 truncate">{show.band_name}</span>}
      {place && <span className="flex items-center gap-1.5 text-[14px] truncate" style={{ color: SOFT }}><MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{place}</span></span>}
      {meta && <span className="text-[12px]" style={{ fontFamily: SCENE_MONO, color: "#c3c7ee" }}>{meta}</span>}
      {page && (
        <Link to={page} className="mt-2 h-11 rounded-xl flex items-center justify-center gap-1.5 text-[15px] font-bold whitespace-nowrap"
          style={show.going ? { background: "rgba(0,0,0,0.5)", color: star, border: `1px solid ${LINE}` } : { background: G, color: "#0d0d0d" }}>
          {show.going ? "See event" : show.entry === "rsvp" ? "RSVP" : "Get tickets"} <ExternalLink className="w-4 h-4" />
        </Link>
      )}
    </FlyerFrame>
  );
}

// ---------- Stars ----------
// Just the fan's constellation: one star per show on a spiral, joined in date
// order. Been there = a bright star with glow and spikes; coming up = a faint
// forming star in a dashed green ring. Tap a star for a
// short summary. The sky fills the space between the header and the tabs.
function StarsTab({ shows, today, star }) {
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 340, h: 420 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w: W, h: H } = box;
  const ordered = useMemo(() => [...shows].sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999"))), [shows]);
  const stars = useMemo(() => {
    const step = Math.min(W, H) / (2.6 * Math.sqrt(Math.max(ordered.length, 4)));
    return ordered.map((s, i) => {
      const seed = hashString(s.rsvp_id || String(i));
      const a = i * 2.39996 + seededRandom(seed) * 0.6;
      const r = step * (0.7 + Math.sqrt(i) * 1.15) + seededRandom(seed + 7) * step * 0.4;
      return {
        show: s,
        x: Math.max(22, Math.min(W - 22, W / 2 + r * Math.cos(a))),
        y: Math.max(22, Math.min(H - 22, H * 0.44 + r * Math.sin(a))),
        lit: !!s.date && s.date < today,
      };
    });
  }, [ordered, today, W, H]);
  // Background stars: mostly faint pinpricks in slightly different star
  // colors (blue-white, white, warm), a few brighter ones that twinkle.
  const dust = useMemo(() => Array.from({ length: 110 }, (_, i) => {
    const t = seededRandom(i * 7 + 3);
    return {
      x: seededRandom(i * 13 + 1) * W,
      y: seededRandom(i * 29 + 5) * H,
      r: t > 0.93 ? 1.1 : t > 0.7 ? 0.7 : 0.45,
      o: t > 0.93 ? 0.75 : 0.18 + seededRandom(i * 3 + 9) * 0.35,
      c: ["#ffffff", "#cdd8ff", "#fff0d8", "#dfe6ff", "#ffe1d6"][Math.floor(seededRandom(i * 17 + 2) * 5)],
      tw: t > 0.93,
      dur: 2.5 + seededRandom(i * 11 + 4) * 3,
    };
  }), [W, H]);
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [sel, setSel] = useState(null);
  const selected = stars.find((s) => s.show.rsvp_id === sel);

  return (
    <div ref={boxRef} className="relative flex-1 min-h-0 rounded-3xl overflow-hidden" style={{ background: "rgba(3,4,16,0.45)", border: `1px solid ${LINE}` }}
      onClick={(e) => { if (e.target === e.currentTarget || e.target.tagName === "svg") setSel(null); }}>
      <svg width={W} height={H} className="absolute inset-0 block" role="img" aria-label={`Your constellation: ${stars.length} stars`}>
        <defs>
          <radialGradient id="fan-star-glow">
            <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="0.18" stopColor={star} stopOpacity="0.9" />
            <stop offset="0.45" stopColor={star} stopOpacity="0.28" />
            <stop offset="1" stopColor={star} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="fan-star-spike">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.35" stopColor={star} stopOpacity="0.55" />
            <stop offset="1" stopColor={star} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="fan-star-soon">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="0.25" stopColor={G} stopOpacity="0.55" />
            <stop offset="1" stopColor={G} stopOpacity="0" />
          </radialGradient>
        </defs>
        {dust.map((d, i) => (
          <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o}>
            {d.tw && !still && <animate attributeName="opacity" values={`${d.o};${d.o * 0.35};${d.o}`} dur={`${d.dur}s`} repeatCount="indefinite" />}
          </circle>
        ))}
        {stars.slice(1).map((s, i) => (
          <line key={`l${i}`} x1={stars[i].x} y1={stars[i].y} x2={s.x} y2={s.y} stroke={star} strokeOpacity={s.lit ? 0.32 : 0.16} strokeWidth="0.8" strokeDasharray={s.lit ? undefined : "2 5"} />
        ))}
        {stars.map((s) => {
          const on = s.show.rsvp_id === sel;
          return (
            <g key={s.show.rsvp_id} onClick={(e) => { e.stopPropagation(); setSel(on ? null : s.show.rsvp_id); }} style={{ cursor: "pointer" }}>
              <circle cx={s.x} cy={s.y} r="20" fill="transparent" />
              {s.lit ? (
                // A real star: soft glow, thin diffraction spikes, white-hot core.
                <g transform={`translate(${s.x} ${s.y}) scale(${on ? 1.25 : 1})`}>
                  <circle r="10" fill="url(#fan-star-glow)">
                    {!still && <animate attributeName="opacity" values="1;0.72;1" dur={`${3 + seededRandom(hashString(s.show.rsvp_id || "")) * 2.5}s`} repeatCount="indefinite" />}
                  </circle>
                  <ellipse rx="12" ry="0.75" fill="url(#fan-star-spike)" />
                  <ellipse rx="0.75" ry="12" fill="url(#fan-star-spike)" />
                  <ellipse rx="6" ry="0.5" fill="url(#fan-star-spike)" opacity="0.6" transform="rotate(45)" />
                  <ellipse rx="6" ry="0.5" fill="url(#fan-star-spike)" opacity="0.6" transform="rotate(-45)" />
                  <circle r="1.9" fill="#ffffff" />
                </g>
              ) : (
                // Coming up: a faint new star, still forming.
                <g transform={`translate(${s.x} ${s.y}) scale(${on ? 1.25 : 1})`}>
                  <circle r="7" fill="url(#fan-star-soon)" opacity="0.55" />
                  <circle r="1.3" fill="#ffffff" opacity="0.9" />
                  <circle r="6.5" fill="none" stroke={G} strokeWidth="1" strokeDasharray="2 3" opacity="0.8">
                    {!still && <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2.4s" repeatCount="indefinite" />}
                  </circle>
                </g>
              )}
              {on && <circle cx={s.x} cy={s.y} r="18" fill="none" stroke={s.lit ? star : G} strokeOpacity="0.55" strokeWidth="0.8" />}
            </g>
          );
        })}
      </svg>
      <div className="sr-only">
        {stars.map((s) => <button key={s.show.rsvp_id} type="button" onClick={() => setSel(s.show.rsvp_id)}>{showTitle(s.show)}</button>)}
      </div>

      {selected ? (
        <StarSummary s={selected} star={star} onClose={() => setSel(null)} />
      ) : (
        <p className="absolute left-0 right-0 bottom-3 text-center text-[12px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: DIM }}>TAP A STAR</p>
      )}
    </div>
  );
}

function StarSummary({ s, star, onClose }) {
  const parts = dateParts(s.show.date);
  const n = daysUntil(s.show.date);
  const { sky } = linksFor(s.show);
  const place = placeOf(s.show);
  return (
    <div className="absolute left-3 right-3 bottom-3 rounded-2xl px-4 py-3" style={{ background: "rgba(8,10,30,0.92)", border: `1px solid ${s.lit ? LINE : `${G}66`}`, backdropFilter: "blur(8px)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: s.lit ? star : G }}>
            {s.lit ? "BEEN THERE" : countdownLabel(n)}{parts ? ` · ${parts.long.toUpperCase()}` : ""}
          </div>
          <div className="text-[20px] font-bold leading-tight mt-0.5 truncate">{showTitle(s.show)}</div>
          <div className="text-[13px] truncate mt-0.5" style={{ color: SOFT }}>{[place, partyOf(s.show).toLowerCase()].filter(Boolean).join(" · ")}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full text-[16px] leading-none" style={{ color: SOFT, border: `1px solid ${LINE}` }}>×</button>
      </div>
      {sky && (
        <Link to={sky} className="inline-flex items-center gap-1 mt-1.5 text-[13px] font-semibold" style={{ color: s.lit ? star : G }}>
          {s.lit ? "Visit the sky" : "Open your key"} ›
        </Link>
      )}
    </div>
  );
}

// ---------- Me ----------
function MeTab({ user, name, style, star, counts, onStyle, onName }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const email = user?.email || "";
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => { setDraft(name); }, [name]);
  const doSignOut = async () => {
    try { await signOut(); } catch (e) { console.error(e); }
    navigate("/login", { replace: true });
  };
  const label = "text-[11px] tracking-[0.12em] mb-1";

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="shrink-0 relative rounded-2xl px-4 py-3.5 flex items-center gap-3.5" style={{ background: CARD, border: `1px solid ${LINE}` }}>
        <button type="button" onClick={doSignOut} aria-label="Sign out" className="absolute right-2.5 top-2.5 h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[12px] font-bold"
          style={{ color: SOFT, border: `1px solid ${LINE}`, background: "rgba(0,0,0,0.35)" }}>
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
        <span className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center text-[24px] font-bold" style={{ background: "#141a44", border: `2px solid ${star}`, color: star, boxShadow: `0 0 18px ${star}40` }}>
          {((name || email)[0] || "?").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); onName(draft); setEditing(false); }} className="flex gap-2 pr-24">
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} placeholder="Your name" aria-label="Your name"
                className="min-w-0 flex-1 h-10 rounded-lg px-3 text-[16px] bg-black/50 text-white outline-none" style={{ border: `1px solid ${LINE}` }} />
              <button type="submit" aria-label="Save name" className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: star, color: "#0d0d0d" }}><Check className="w-4 h-4" /></button>
            </form>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 text-left max-w-full pr-24">
              <span className="text-[20px] font-bold truncate">{name || "Add your name"}</span>
              <Pencil className="w-3.5 h-3.5 shrink-0" style={{ color: SOFT }} />
            </button>
          )}
          <div className="text-[13px] truncate" style={{ color: SOFT }}>{email}</div>
          <div className="text-[11px] tracking-[0.1em] mt-0.5" style={{ fontFamily: SCENE_MONO, color: DIM }}>
            FAN{since ? ` SINCE ${since.toUpperCase()}` : ""} · {counts.total} SHOWS · {counts.past} LIT
          </div>
        </div>
      </div>

      <section className="shrink-0 rounded-2xl px-3.5 py-3 flex flex-col gap-2.5" style={{ background: CARD, border: `1px solid ${LINE}` }}>
        <Choice title="SHOWS" options={[{ id: "mine", label: "Just mine" }, { id: "local", label: "+ Local shows" }]}
          value={style.discover ? "local" : "mine"} onPick={(v) => onStyle({ discover: v === "local" })} star={star} />
        {style.discover && <HomeCity style={style} star={star} onStyle={onStyle} />}
        <div>
          <div className={label} style={{ fontFamily: SCENE_MONO, color: DIM }}>STAR COLOR</div>
          <StarColors value={style.star} shown={star} onPick={(hex) => onStyle({ star: hex })} />
        </div>
      </section>
    </div>
  );
}

// Six presets plus a rainbow swatch that opens the color picker for any
// color. Dragging in the picker previews live and saves once it settles.
function StarColors({ value, shown, onPick }) {
  const preset = STAR_COLORS.some((c) => c.hex.toLowerCase() === String(value || "").toLowerCase());
  const [live, setLive] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const pickCustom = (hex) => {
    setLive(liftColor(hex));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { onPick(hex.toUpperCase()); setLive(null); }, 350);
  };
  const ring = (c) => `0 0 0 2px #000, 0 0 0 4px ${c}, 0 0 14px ${c}`;
  const custom = live || (!preset ? shown : null);
  return (
    <div className="flex gap-2 justify-between">
      {STAR_COLORS.map((c) => {
        const on = !live && value?.toLowerCase() === c.hex.toLowerCase();
        return (
          <button key={c.hex} type="button" onClick={() => onPick(c.hex)} aria-label={c.name} aria-pressed={on}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: c.hex, boxShadow: on ? ring(c.hex) : "none" }}>
            {on && <Check className="w-4 h-4" style={{ color: "#0d0d0d" }} strokeWidth={3} />}
          </button>
        );
      })}
      <label className="relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer" aria-label="Pick any color" title="Pick any color"
        style={{ background: custom || "conic-gradient(#ff4d4d, #ffd84d, #6dff4d, #4dffe6, #4d7bff, #c44dff, #ff4d9e, #ff4d4d)", boxShadow: custom ? ring(custom) : "none" }}>
        <input type="color" value={custom || shown} onChange={(e) => pickCustom(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        {custom ? <Check className="w-4 h-4 pointer-events-none" style={{ color: "#0d0d0d" }} strokeWidth={3} /> : <span className="text-[18px] font-bold leading-none pointer-events-none" style={{ color: "#0d0d0d" }}>+</span>}
      </label>
    </div>
  );
}

// Home city for local shows. Saved with the check button (or Enter).
function HomeCity({ style, star, onStyle }) {
  const [city, setCity] = useState(style.city || "");
  const [st, setSt] = useState(style.state || "");
  useEffect(() => { setCity(style.city || ""); setSt(style.state || ""); }, [style.city, style.state]);
  const dirty = city.trim() !== (style.city || "") || st !== (style.state || "");
  const save = (e) => { e.preventDefault(); if (st) onStyle({ city: city.trim().slice(0, 60), state: st }); };
  const field = "h-9 rounded-lg px-3 text-[16px] bg-black/50 text-white outline-none";
  return (
    <form onSubmit={save}>
      <div className="text-[11px] tracking-[0.12em] mb-1" style={{ fontFamily: SCENE_MONO, color: DIM }}>HOME CITY</div>
      <div className="flex gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" aria-label="City" maxLength={60} autoComplete="address-level2"
          className={`${field} min-w-0 flex-1`} style={{ border: `1px solid ${LINE}` }} />
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="State" className={`${field} w-[76px] px-2`} style={{ border: `1px solid ${LINE}` }}>
          <option value="">State</option>
          {US_STATES.map(([a, n]) => <option key={a} value={a} className="bg-[#111]" title={n}>{a}</option>)}
        </select>
        <button type="submit" disabled={!st || !dirty} aria-label="Save home city" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center disabled:opacity-40"
          style={{ background: dirty && st ? star : "rgba(0,0,0,0.45)", color: dirty && st ? "#0d0d0d" : star, border: `1px solid ${dirty && st ? star : LINE}` }}>
          <Check className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

function Choice({ title, options, value, onPick, star }) {
  return (
    <div>
      <div className="text-[11px] tracking-[0.12em] mb-1" style={{ fontFamily: SCENE_MONO, color: DIM }}>{title}</div>
      <div className="flex gap-1 p-[3px] rounded-full" style={{ background: "rgba(0,0,0,0.45)", border: `1px solid ${LINE}` }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button key={o.id} type="button" onClick={() => onPick(o.id)} aria-pressed={on}
              className="flex-1 h-8 rounded-full text-[13px] font-bold" style={{ background: on ? star : "transparent", color: on ? "#0d0d0d" : SOFT }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
