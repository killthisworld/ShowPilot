import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Star, KeyRound, MapPin, LogOut, ExternalLink, Ticket, Sparkles, User } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { fanPath } from "@/lib/fanUrl";
import { hashString, seededRandom } from "@/lib/constellation";
import AccountSwitcher from "@/components/showpilot/AccountSwitcher";

// Fan accounts (jobs 77 + 79; direction in claude/fan-profile-direction.md).
// The fan's own corner of Show Pilot, with its own main tabs:
//   Shows  every event they RSVP'd to with their account's email
//   Stars  their personal sky: one star per show, a growing collection
//   Me     account, switch account, sign out
// Phone-first, in the event sky's colors.

const STAR = "#E4E0FF";
const SKY = "#0b0e24";
const LINE = "#2b2f5a";
const SOFT = "#b7bbe6";
const DIM = "#7e83b8";
const G = "#8CFF3D";

const TABS = [
  { id: "shows", label: "Shows", icon: Ticket, title: "MY SHOWS" },
  { id: "stars", label: "Stars", icon: Sparkles, title: "MY STARS" },
  { id: "me", label: "Me", icon: User, title: "ME" },
];

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
  const a = new Date(`${iso}T00:00:00`).getTime();
  const b = new Date(`${todayIso()}T00:00:00`).getTime();
  return Math.round((a - b) / 86400000);
};
const countdownLabel = (n) => (n === null ? "DATE TBA" : n === 0 ? "TONIGHT" : n === 1 ? "TOMORROW" : `${n} DAYS TO GO`);
const showTitle = (s) => s.event_name || s.band_name || "Untitled event";
const linksFor = (s) => {
  const page = s.fan_token || s.fan_slug ? fanPath(s.fan_slug, s.fan_token) : null;
  return { page, sky: page && s.sky_key ? `${page}/sky?k=${s.sky_key}` : null };
};

export default function FanHome() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "shows";
  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === "shows") next.delete("tab"); else next.set("tab", id);
    setParams(next, { replace: true });
    window.scrollTo(0, 0);
  };
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

  const today = todayIso();
  const upcoming = (shows || []).filter((s) => !s.date || s.date >= today);
  const past = (shows || []).filter((s) => s.date && s.date < today).reverse();
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: SCENE_FONT, background: `radial-gradient(ellipse at 50% 0%, #141a44 0%, ${SKY} 40%, #05060f 100%)` }}>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-28">
        <header>
          <div className="text-[11px] tracking-[0.16em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>SHOW PILOT · FAN</div>
          <h1 className="text-[34px] font-bold tracking-[0.04em] leading-none mt-1">{current.title}</h1>
          {tab !== "me" && <p className="text-[13px] mt-1.5 truncate" style={{ color: SOFT }}>{user?.email}</p>}
        </header>

        {shows === null ? (
          <div className="py-24 flex justify-center">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${STAR}33`, borderTopColor: STAR }} />
          </div>
        ) : tab === "me" ? (
          <MeTab user={user} total={shows.length} upcoming={upcoming.length} past={past.length} />
        ) : error ? (
          <p className="mt-10 text-[15px] leading-relaxed rounded-xl px-4 py-4" style={{ background: "#12163a", border: `1px solid ${LINE}`, color: SOFT }}>
            Your shows couldn't load right now. Try again in a minute.
          </p>
        ) : shows.length === 0 ? (
          <EmptyShows email={user?.email} stars={tab === "stars"} />
        ) : tab === "stars" ? (
          <StarsTab shows={shows} today={today} />
        ) : (
          <>
            <Section label="COMING UP" count={upcoming.length}>
              {upcoming.length === 0 ? (
                <p className="text-[15px]" style={{ color: SOFT }}>Nothing coming up. Your next RSVP will show here.</p>
              ) : (
                upcoming.map((s) => <ShowCard key={s.rsvp_id} show={s} />)
              )}
            </Section>
            {past.length > 0 && (
              <Section label="BEEN THERE" count={past.length}>
                {past.map((s) => <ShowCard key={s.rsvp_id} show={s} past />)}
              </Section>
            )}
          </>
        )}
      </div>

      <FanTabs tab={tab} onTab={setTab} />
    </div>
  );
}

// The fan's main tabs, pinned to the bottom (phone-first; centered on desktop).
function FanTabs({ tab, onTab }) {
  return (
    <nav aria-label="Fan" className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg" style={{ background: "rgba(5,6,15,0.92)", borderTop: `1px solid ${LINE}`, paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
      <div className="max-w-lg mx-auto h-16 flex items-center justify-around px-4" style={{ fontFamily: SCENE_FONT }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={on ? "page" : undefined}
              className="w-20 h-14 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors"
              style={{ color: on ? STAR : DIM, background: on ? "rgba(228,224,255,0.08)" : "transparent" }}
            >
              <Icon className="w-[22px] h-[22px]" style={on ? { filter: `drop-shadow(0 0 6px ${STAR}99)` } : undefined} />
              <span className="text-[13px] font-bold tracking-[0.06em]">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function EmptyShows({ email, stars }) {
  return (
    <div className="mt-10 rounded-2xl px-5 py-8 text-center" style={{ background: "#12163a", border: `1px dashed ${LINE}` }}>
      <Star className="w-8 h-8 mx-auto" style={{ color: STAR }} />
      <h2 className="text-[24px] font-bold mt-3 leading-tight">{stars ? "Your sky is empty, for now" : "No shows yet"}</h2>
      <p className="text-[15px] mt-2 leading-relaxed" style={{ color: SOFT }}>
        RSVP to an event with <span className="text-white font-semibold break-all">{email}</span> and it lands here{stars ? " as a new star" : ", with your key to the event's sky"}.
      </p>
    </div>
  );
}

function Section({ label, count, children }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[13px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{label}</h2>
        <span className="text-[12px]" style={{ fontFamily: SCENE_MONO, color: DIM }}>{count}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// One RSVP'd event, shaped like a ticket: date stub on the left, the event
// on the right, key + event page below.
function ShowCard({ show, past = false }) {
  const parts = dateParts(show.date);
  const n = daysUntil(show.date);
  const place = [show.venue, [show.city, show.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const { page, sky } = linksFor(show);
  const title = showTitle(show);

  return (
    <article className="rounded-2xl overflow-hidden" style={{ background: "#12163a", border: `1px solid ${past ? "#23264a" : LINE}`, opacity: past ? 0.8 : 1 }}>
      <div className="flex">
        <div className="w-[76px] shrink-0 flex flex-col items-center justify-center py-4" style={{ background: "#0e1230", borderRight: `2px dashed ${LINE}` }}>
          {parts ? (
            <>
              <span className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{parts.mon}</span>
              <span className="text-[34px] font-bold leading-none">{parts.day}</span>
              <span className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{parts.dow}</span>
            </>
          ) : (
            <span className="text-[11px] tracking-[0.1em] text-center px-1" style={{ fontFamily: SCENE_MONO, color: SOFT }}>DATE TBA</span>
          )}
        </div>
        <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col gap-1">
          {!past && (
            <span className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: n !== null && n <= 1 ? G : STAR }}>{countdownLabel(n)}</span>
          )}
          <h3 className="text-[22px] font-bold leading-tight tracking-[0.02em] line-clamp-2">{title}</h3>
          {show.band_name && show.event_name && show.band_name !== show.event_name && (
            <span className="text-[14px] text-white/80 truncate">{show.band_name}</span>
          )}
          {place && (
            <span className="flex items-center gap-1.5 text-[13px] truncate" style={{ color: SOFT }}>
              <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{place}</span>
            </span>
          )}
          <span className="text-[12px]" style={{ fontFamily: SCENE_MONO, color: "#9ea3d6" }}>
            {show.guests > 1 ? `YOU + ${show.guests - 1}` : "JUST YOU"}{show.artist_name ? ` · FOR ${String(show.artist_name).toUpperCase()}` : ""}
          </span>
        </div>
      </div>
      <div className="flex gap-2 px-3 pb-3 pt-1">
        {sky && (
          <Link to={sky} className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold"
            style={{ background: past ? "transparent" : G, color: past ? STAR : "#0d0d0d", border: past ? `1px solid ${LINE}` : "none" }}>
            <KeyRound className="w-4 h-4" /> {past ? "Your star" : "Open your key"}
          </Link>
        )}
        {page && (
          <Link to={page} className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-[15px] font-semibold" style={{ color: "#ffffff", border: `1px solid ${LINE}` }}>
            Event page <ExternalLink className="w-4 h-4" />
          </Link>
        )}
      </div>
    </article>
  );
}

// The fan's personal sky: one star per show, laid out on a spiral from the
// first show outward and joined in date order like a constellation. Shows
// they've been to are lit; coming-up shows are outlined, waiting to light.
function StarsTab({ shows, today }) {
  const ordered = useMemo(() => [...shows].sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999"))), [shows]);
  const W = 340, H = 380, CX = W / 2, CY = H / 2;
  const stars = useMemo(() => ordered.map((s, i) => {
    const seed = hashString(s.rsvp_id || String(i));
    const a = i * 2.39996 + seededRandom(seed) * 0.5; // golden angle, with a little drift
    const r = 18 + 30 * Math.sqrt(i) + seededRandom(seed + 7) * 8;
    return {
      show: s,
      x: Math.max(16, Math.min(W - 16, CX + r * Math.cos(a))),
      y: Math.max(16, Math.min(H - 16, CY + r * Math.sin(a) * 1.05)),
      lit: !!s.date && s.date < today,
    };
  }), [ordered, today]);
  const dust = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    x: seededRandom(i * 13 + 1) * W, y: seededRandom(i * 29 + 5) * H, r: seededRandom(i * 7 + 3) > 0.85 ? 1.3 : 0.8, o: 0.15 + seededRandom(i * 3 + 9) * 0.35,
  })), []);
  const [sel, setSel] = useState(() => (stars.find((s) => !s.lit) || stars[stars.length - 1])?.show.rsvp_id);
  const selected = stars.find((s) => s.show.rsvp_id === sel);
  const litCount = stars.filter((s) => s.lit).length;

  return (
    <div className="mt-6">
      <div className="grid grid-cols-3 gap-2">
        <Tile n={stars.length} label="STARS" />
        <Tile n={litCount} label="LIT" color={STAR} />
        <Tile n={stars.length - litCount} label="WAITING" color={G} />
      </div>

      <div className="relative mt-4 rounded-2xl overflow-hidden" style={{ background: "#070920", border: `1px solid ${LINE}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Your sky: ${stars.length} stars, ${litCount} lit`}>
          {dust.map((d, i) => <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill="#ffffff" opacity={d.o} />)}
          {stars.slice(1).map((s, i) => (
            <line key={`l${i}`} x1={stars[i].x} y1={stars[i].y} x2={s.x} y2={s.y} stroke={STAR} strokeOpacity={s.lit ? 0.35 : 0.15} strokeWidth="1" strokeDasharray={s.lit ? undefined : "3 4"} />
          ))}
          {stars.map((s) => {
            const on = s.show.rsvp_id === sel;
            return (
              <g key={s.show.rsvp_id} onClick={() => setSel(s.show.rsvp_id)} style={{ cursor: "pointer" }}>
                <circle cx={s.x} cy={s.y} r="16" fill="transparent" />
                {s.lit ? (
                  <>
                    <circle cx={s.x} cy={s.y} r={on ? 11 : 8} fill={STAR} opacity="0.18" />
                    <circle cx={s.x} cy={s.y} r={on ? 5 : 4} fill={STAR} />
                  </>
                ) : (
                  <circle cx={s.x} cy={s.y} r={on ? 6 : 4.5} fill="none" stroke={G} strokeWidth="1.5">
                    <animate attributeName="opacity" values="1;0.45;1" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                {on && <circle cx={s.x} cy={s.y} r="14" fill="none" stroke={s.lit ? STAR : G} strokeOpacity="0.6" strokeWidth="1" />}
              </g>
            );
          })}
        </svg>
        <div className="sr-only">
          {stars.map((s) => <button key={s.show.rsvp_id} type="button" onClick={() => setSel(s.show.rsvp_id)}>{showTitle(s.show)}</button>)}
        </div>
      </div>
      <p className="mt-2 text-[12px] text-center" style={{ fontFamily: SCENE_MONO, color: DIM }}>TAP A STAR · LIT = BEEN THERE · OUTLINED = COMING UP</p>

      {selected && <StarCard s={selected} />}
    </div>
  );
}

function Tile({ n, label, color = "#ffffff" }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "#12163a", border: `1px solid ${LINE}` }}>
      <div className="text-[26px] font-bold leading-none" style={{ color }}>{n}</div>
      <div className="text-[11px] tracking-[0.12em] mt-1" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{label}</div>
    </div>
  );
}

function StarCard({ s }) {
  const parts = dateParts(s.show.date);
  const n = daysUntil(s.show.date);
  const { page, sky } = linksFor(s.show);
  return (
    <div className="mt-4 rounded-2xl px-4 py-4 flex flex-col gap-2" style={{ background: "#12163a", border: `1px solid ${s.lit ? LINE : `${G}55`}` }}>
      <span className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: s.lit ? STAR : G }}>
        {s.lit ? `BEEN THERE · ${parts?.long?.toUpperCase() || ""}` : `${countdownLabel(n)}${parts ? ` · ${parts.long.toUpperCase()}` : ""}`}
      </span>
      <h3 className="text-[24px] font-bold leading-tight">{showTitle(s.show)}</h3>
      {(s.show.venue || s.show.city) && (
        <span className="flex items-center gap-1.5 text-[14px]" style={{ color: SOFT }}>
          <MapPin className="w-3.5 h-3.5 shrink-0" /> {[s.show.venue, s.show.city].filter(Boolean).join(" · ")}
        </span>
      )}
      <div className="flex gap-2 mt-1">
        {sky && (
          <Link to={sky} className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold"
            style={{ background: s.lit ? "transparent" : G, color: s.lit ? STAR : "#0d0d0d", border: s.lit ? `1px solid ${LINE}` : "none" }}>
            <KeyRound className="w-4 h-4" /> {s.lit ? "Visit the sky" : "Open your key"}
          </Link>
        )}
        {page && (
          <Link to={page} className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-[15px] font-semibold" style={{ color: "#ffffff", border: `1px solid ${LINE}` }}>
            Event page <ExternalLink className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

function MeTab({ user, total, upcoming, past }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const email = user?.email || "";
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;
  const doSignOut = async () => {
    try { await signOut(); } catch (e) { console.error(e); }
    navigate("/login", { replace: true });
  };
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="rounded-2xl px-4 py-5 flex items-center gap-4" style={{ background: "#12163a", border: `1px solid ${LINE}` }}>
        <span className="w-16 h-16 rounded-full shrink-0 flex items-center justify-center text-[28px] font-bold" style={{ background: "#1b2052", border: `2px solid ${STAR}`, color: STAR, boxShadow: `0 0 18px ${STAR}40` }}>
          {(email[0] || "?").toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="text-[18px] font-bold truncate">{email}</div>
          <div className="text-[12px] tracking-[0.1em] mt-1" style={{ fontFamily: SCENE_MONO, color: SOFT }}>FAN{since ? ` SINCE ${since.toUpperCase()}` : ""}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile n={total} label="SHOWS" />
        <Tile n={upcoming} label="COMING UP" color={G} />
        <Tile n={past} label="BEEN THERE" color={STAR} />
      </div>

      <p className="text-[14px] leading-relaxed rounded-xl px-4 py-3" style={{ background: "#0e1230", border: `1px solid ${LINE}`, color: SOFT }}>
        Shows appear here when you RSVP with <span className="text-white font-semibold break-all">{email}</span>. Using another email for RSVPs? Add it as a second account below.
      </p>

      <section className="rounded-2xl px-4 pt-4 pb-0" style={{ background: "#12163a", border: `1px solid ${LINE}` }}>
        <AccountSwitcher currentUserId={user?.id} />
      </section>

      <button type="button" onClick={doSignOut} className="h-12 rounded-xl flex items-center justify-center gap-2 text-[16px] font-bold"
        style={{ background: "transparent", border: `1px solid ${LINE}`, color: STAR }}>
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  );
}
