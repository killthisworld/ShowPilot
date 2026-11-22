import React from "react";
import { Play, Download, Mail, Phone, Disc3 } from "lucide-react";
import { DJ_COLOR } from "@/lib/djTools";
import { href, platformOf } from "@/lib/djKit";

// The DJ press kit as people read it (job 457). Used by DJ mode's Profile
// tab (the DJ's own view) and by the public link (/kit/:token).
//   kit: { name, photo_url, genre_tags, city, bio, mixes, press_photos,
//          logo_url, links, contact_name, contact_email, contact_phone, dates }
//   own: the DJ's view (empty sections say what to add instead of hiding)

export const mono = { fontFamily: "'JetBrains Mono', monospace" };
export const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function Label({ children, right }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[11px] tracking-[0.18em] text-white/65 font-medium" style={mono}>{children}</h2>
      {right}
    </div>
  );
}

export function GenreChips({ genres }) {
  if (!genres?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {genres.map((g) => (
        <span key={g} className="px-2.5 py-[3px] rounded-full text-[12px] font-semibold" style={{ background: `${DJ_COLOR}1f`, color: DJ_COLOR }}>{g}</span>
      ))}
    </div>
  );
}

export function Avatar({ name, url, size = 84 }) {
  const initials = (name || "DJ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="rounded-full overflow-hidden shrink-0 bg-[#1c1d24] flex items-center justify-center" style={{ width: size, height: size, border: `2px solid ${DJ_COLOR}` }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <span style={{ ...cond, color: DJ_COLOR, fontSize: size * 0.36 }}>{initials}</span>}
    </div>
  );
}

function Empty({ children }) {
  return <p className="m-0 text-[14px] text-white/50">{children}</p>;
}

export function Dates({ dates, own }) {
  return (
    <section className="flex flex-col gap-2">
      <Label right={own ? <span className="text-[12px] text-white/50">From your Bookings</span> : null}>UPCOMING DATES</Label>
      {dates?.length ? dates.map((d, i) => {
        const dt = new Date(`${d.date}T00:00:00`);
        return (
          <div key={`${d.date}-${i}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#101116] border border-[#262626]">
            <div className="w-11 text-center text-[10px] tracking-[0.1em] leading-tight" style={{ ...mono, color: DJ_COLOR }}>
              {MON[dt.getMonth()]}<div className="text-[22px] text-white tracking-normal" style={cond}>{dt.getDate()}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold truncate">{d.name}</div>
              {d.venue && <div className="text-[13px] text-white/60 truncate">{d.venue}</div>}
            </div>
          </div>
        );
      }) : <Empty>{own ? "Gigs you're booked for show up here by themselves." : "No dates announced yet."}</Empty>}
    </section>
  );
}

export function Mixes({ mixes, own }) {
  const list = (mixes || []).filter((m) => m?.url);
  if (!list.length && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>{own ? "MIXES" : "LISTEN"}</Label>
      {list.length ? list.map((m, i) => (
        <a key={`${m.url}-${i}`} href={href(m.url)} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-xl bg-[#101116] border border-[#262626] text-white no-underline hover:border-white/25">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: DJ_COLOR, color: "#000" }}><Play className="w-4 h-4 fill-current ml-0.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold truncate">{m.title || "Mix"}</span>
            <span className="block text-[12.5px] text-white/60">{platformOf(m.url)}</span>
          </span>
        </a>
      )) : <Empty>Add links to your mixes so promoters can hear your sound.</Empty>}
    </section>
  );
}

export function Photos({ photos, logo, own, grid = "grid-cols-3" }) {
  const list = [...(photos || []).filter((p) => p?.url).map((p) => ({ ...p, kind: "Photo" })), ...(logo ? [{ url: logo, kind: "Logo" }] : [])];
  if (!list.length && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>{"PRESS PHOTOS & LOGO"}</Label>
      {list.length ? (
        <div className={`grid gap-2 ${grid}`}>
          {list.map((p, i) => (
            <a key={`${p.url}-${i}`} href={p.url} target="_blank" rel="noreferrer" download className="relative block aspect-[4/5] rounded-[10px] overflow-hidden bg-[#1c1d24] border border-[#262626] group" aria-label={`Open ${p.kind.toLowerCase()} full size`}>
              <img src={p.url} alt="" className={`w-full h-full ${p.kind === "Logo" ? "object-contain p-3" : "object-cover"}`} />
              <span className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white/90"><Download className="w-3.5 h-3.5" /></span>
            </a>
          ))}
        </div>
      ) : <Empty>Add press photos and your logo, so promoters can grab them for flyers.</Empty>}
      {!own && list.length > 0 && <span className="text-[12px] text-white/50">Tap one to open it at full size.</span>}
    </section>
  );
}

export function Links({ links, own }) {
  const list = (links || []).filter((l) => l?.url);
  if (!list.length && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>LINKS</Label>
      {list.length ? (
        <div className="flex flex-wrap gap-2">
          {list.map((l, i) => (
            <a key={`${l.url}-${i}`} href={href(l.url)} target="_blank" rel="noreferrer" className="min-h-[38px] px-3.5 rounded-full border border-white/20 flex items-center text-[13.5px] font-semibold text-white no-underline hover:border-white/45">
              {l.kind || platformOf(l.url)}
            </a>
          ))}
        </div>
      ) : <Empty>Add your Instagram, SoundCloud, Resident Advisor and more.</Empty>}
    </section>
  );
}

export function Contact({ kit, own, title = "BOOKING CONTACT" }) {
  const has = kit.contact_name || kit.contact_email || kit.contact_phone;
  if (!has && !own) return null;
  return (
    <section className="px-3.5 py-3 rounded-xl bg-[#101116] border border-[#262626] flex flex-col gap-1.5">
      <Label>{title}</Label>
      {has ? (
        <>
          {kit.contact_name && <div className="text-[15px] font-semibold">{kit.contact_name}</div>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            {kit.contact_email && <a href={`mailto:${kit.contact_email}`} className="flex items-center gap-1.5 text-white/80 no-underline hover:text-white"><Mail className="w-3.5 h-3.5" />{kit.contact_email}</a>}
            {kit.contact_phone && <a href={`tel:${kit.contact_phone}`} className="flex items-center gap-1.5 text-white/80 no-underline hover:text-white"><Phone className="w-3.5 h-3.5" />{kit.contact_phone}</a>}
          </div>
        </>
      ) : <Empty>Who should promoters reach to book you? You, or your agent.</Empty>}
    </section>
  );
}

export function Bio({ bio, own }) {
  if (!bio && !own) return null;
  return (
    <section className="flex flex-col gap-2">
      <Label>BIO</Label>
      {bio ? <p className="m-0 text-[15px] leading-relaxed text-white/85 whitespace-pre-line">{bio}</p> : <Empty>A few lines a promoter can paste straight into a flyer or listing.</Empty>}
    </section>
  );
}

// The public press kit page body.
export default function DjKitView({ kit }) {
  const mainPhoto = kit.press_photos?.find((p) => p?.url)?.url || kit.photo_url;
  const bookHref = kit.contact_email ? `mailto:${kit.contact_email}?subject=${encodeURIComponent(`Booking ${kit.name || ""}`.trim())}` : kit.contact_phone ? `tel:${kit.contact_phone}` : "";
  return (
    <div className="max-w-[760px] mx-auto">
      <div className="relative h-[340px] sm:h-[420px] bg-[#1c1d24] overflow-hidden sm:rounded-b-2xl">
        {mainPhoto ? <img src={mainPhoto} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Disc3 className="w-16 h-16 text-white/15" /></div>}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, #000 100%)" }} />
        <div className="absolute top-4 left-4 text-[11px] tracking-[0.18em]" style={{ ...mono, color: DJ_COLOR }}>SHOWPILOT · PRESS KIT</div>
      </div>
      <div className="relative -mt-16 px-4 pb-12 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[52px] sm:text-[64px] leading-[0.95]" style={cond}>{kit.name}</h1>
          {kit.city && <div className="text-[11px] tracking-[0.14em] text-white/70" style={mono}>{kit.city.toUpperCase()}</div>}
          <GenreChips genres={kit.genre_tags} />
        </div>
        {(bookHref || kit.press_photos?.length || kit.logo_url) && (
          <div className="flex gap-2">
            {bookHref && (
              <a href={bookHref} className="flex-1 min-h-[46px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold no-underline" style={{ background: DJ_COLOR, color: "#000" }}>
                {kit.contact_email ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}{kit.contact_email ? "Email to book" : "Call to book"}
              </a>
            )}
            {(kit.press_photos?.length > 0 || kit.logo_url) && (
              <a href="#photos" className="flex-1 min-h-[46px] rounded-full border border-white/25 flex items-center justify-center gap-2 text-[15px] font-semibold text-white no-underline">
                <Download className="w-4 h-4" />{"Photos & logo"}
              </a>
            )}
          </div>
        )}
        <Bio bio={kit.bio} />
        <Mixes mixes={kit.mixes} />
        {kit.dates?.length > 0 && <Dates dates={kit.dates} />}
        <div id="photos" className="scroll-mt-4"><Photos photos={kit.press_photos} logo={kit.logo_url} grid="grid-cols-2 sm:grid-cols-3" /></div>
        <Links links={kit.links} />
        <Contact kit={kit} title="BOOKINGS" />
        <a href="https://get.showpilot.space" className="text-center text-[12px] text-white/45 no-underline hover:text-white/70">Made with Show Pilot</a>
      </div>
    </div>
  );
}
