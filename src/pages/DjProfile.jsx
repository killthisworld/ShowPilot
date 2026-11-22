import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Settings, Share2, Pencil, Plus, X, Camera, ImagePlus, Check, Eye } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import NightSky from "@/components/showpilot/NightSky";
import { useToast } from "@/components/ui/use-toast";
import { usePreferences } from "@/hooks/usePreferences";
import { DJ_COLOR, DESK_HEADER, DESK_MAIN } from "@/lib/djTools";
import { ensureKitLink, fetchMyExtras, kitUrl, loadKit, platformOf, saveKit, setKitFlags, uploadKitImage } from "@/lib/djKit";
import { Avatar, Bio, Contact, Dates, GenreChips, History, Label, Links, Mixes, Photos, cond, mono } from "@/components/showpilot/DjKitView";

// DJ mode's Profile tab (job 457, Jay 2026-11-22): the DJ's press kit.
// Photo, name, city, genres, bio, mixes, press photos + logo, links,
// booking contact, and upcoming dates straight from Bookings. Share press
// kit makes one public link (/kit/:token). Settings are under the gear.
// No BPM range and no booking package (Jay: DJs are booked by the venue or
// artist once the event exists).

const toKit = (t, dates) => ({
  name: t.name,
  photo_url: t.data.photo_url || "",
  genre_tags: t.data.genre_tags || [],
  city: t.data.kit_city || "",
  bio: t.data.kit_bio || "",
  mixes: t.data.kit_mixes || [],
  press_photos: t.data.kit_photos || [],
  logo_url: t.data.kit_logo_url || "",
  links: t.data.kit_links || [],
  contact_name: t.data.contact_name || "",
  contact_email: t.data.contact_email || "",
  contact_phone: t.data.contact_phone || "",
  dates: dates || [],
});

async function shareLink(url, name) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try { await navigator.share({ title: `${name} · Press kit`, url }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return ""; }
  }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { return ""; }
}

export default function DjProfile() {
  const { preferences } = usePreferences();
  const { toast } = useToast();
  const [kitState, setKitState] = useState(null); // { userId, template, link }
  const [failed, setFailed] = useState("");
  // Upcoming dates and "Played at" (job 459), worked out by the database.
  const [extras, setExtras] = useState(null);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let gone = false;
    loadKit(preferences?.display_name || "")
      .then((k) => {
        if (gone) return;
        setKitState(k);
        fetchMyExtras(k.template.name).then((x) => { if (!gone) setExtras(x); });
      })
      .catch((e) => { console.error(e); if (!gone) setFailed("Couldn't load your profile. Check your signal and try again."); });
    return () => { gone = true; };
    // Once: the name is only a starting point for a brand-new kit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    if (!kitState || sharing) return;
    setSharing(true);
    try {
      const link = await ensureKitLink(kitState.userId, kitState.template.id, kitState.link);
      setKitState((s) => ({ ...s, link }));
      const how = await shareLink(kitUrl(link.token), kitState.template.name);
      if (how === "copied") toast({ title: "Press kit link copied", description: "Paste it in a message or email." });
      else if (!how && !navigator.share) toast({ title: "Here's your link", description: kitUrl(link.token) });
    } catch (e) {
      console.error(e);
      toast({ title: e?.message || "Couldn't make the link", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const dates = extras?.dates || [];
  const kit = kitState ? toKit(kitState.template, dates) : null;
  const flags = {
    show_dates: kitState?.link?.show_dates !== false,
    show_history: kitState?.link?.show_history !== false,
    take_requests: kitState?.link?.take_requests !== false,
  };

  // See the press kit the way promoters do.
  const preview = async () => {
    if (!kitState) return;
    const win = window.open("", "_blank");
    try {
      const link = await ensureKitLink(kitState.userId, kitState.template.id, kitState.link);
      setKitState((s) => ({ ...s, link }));
      if (win) win.location.href = kitUrl(link.token); else window.location.href = kitUrl(link.token);
    } catch (e) {
      win?.close();
      toast({ title: e?.message || "Couldn't open it", variant: "destructive" });
    }
  };

  const actions = kitState && !editing && (
    <>
      <button type="button" onClick={share} disabled={sharing} className="flex-1 lg:flex-none min-h-[44px] lg:min-h-[42px] px-5 rounded-full flex items-center justify-center gap-2 text-[15px] lg:text-[14.5px] font-bold disabled:opacity-60" style={{ background: DJ_COLOR, color: "#000" }}>
        {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}Share press kit
      </button>
      <button type="button" onClick={() => setEditing(true)} className="min-h-[44px] lg:min-h-[42px] px-[18px] rounded-full border border-white/20 flex items-center gap-1.5 text-[15px] lg:text-[14.5px] font-semibold text-white hover:bg-white/5">
        <Pencil className="w-4 h-4" />Edit
      </button>
    </>
  );

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#000" }}>
      <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}><NightSky seed="dj-profile" dim={0.3} /></div>
      <main className={`relative z-[1] ${DESK_MAIN} pt-5 pb-[120px] flex flex-col gap-3.5`}>
        <header className={`flex items-center justify-between gap-3 ${DESK_HEADER}`}>
          <h1 className="m-0 text-[34px] lg:text-3xl leading-none" style={cond}>{editing ? "Edit profile" : "Profile"}</h1>
          <div className="flex items-center gap-2.5 lg:ml-auto">
            <div className="hidden lg:flex items-center gap-2.5">{actions}</div>
            <Link to="/me" aria-label="Settings" className="w-11 h-11 lg:w-[42px] lg:h-[42px] rounded-xl border border-white/15 bg-[#0d0e14] text-white/85 flex items-center justify-center hover:bg-white/10">
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </header>

        {failed ? (
          <p className="m-0 py-10 text-center text-[15px] text-white/60">{failed}</p>
        ) : !kitState ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : editing ? (
          <KitEditor
            state={kitState}
            flags={flags}
            onCancel={() => setEditing(false)}
            onSaved={(template, link) => { setKitState((s) => ({ ...s, template, link: link || s.link })); setEditing(false); toast({ title: "Profile saved" }); }}
          />
        ) : (
          <>
            {/* Phone: one column. */}
            <div className="lg:hidden flex flex-col gap-4">
              <Identity kit={kit} actions={<div className="flex flex-col gap-2"><div className="flex gap-2">{actions}</div><PreviewBtn onClick={preview} /></div>} />
              <Dates dates={dates} own />
              <History history={extras?.history || []} own />
              <Bio bio={kit.bio} own />
              <Mixes mixes={kit.mixes} own />
              <Photos photos={kit.press_photos} logo={kit.logo_url} own />
              <Links links={kit.links} own />
              <Contact kit={kit} own />
            </div>
            {/* Computer: who you are on the left, what you've got on the right. */}
            <div className="hidden lg:grid grid-cols-2 gap-6 items-start pt-2">
              <div className="flex flex-col gap-5">
                <Identity kit={kit} big actions={<PreviewBtn onClick={preview} />} />
                <Links links={kit.links} own />
                <Contact kit={kit} own />
              </div>
              <div className="flex flex-col gap-5">
                <Dates dates={dates} own />
                <Mixes mixes={kit.mixes} own />
                <Photos photos={kit.press_photos} logo={kit.logo_url} own grid="grid-cols-4" />
                <History history={extras?.history || []} own />
              </div>
            </div>
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}

function PreviewBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="self-start min-h-[40px] -ml-1 px-1 flex items-center gap-1.5 text-[13.5px] font-semibold text-white/70 hover:text-white">
      <Eye className="w-4 h-4" />See it the way promoters do
    </button>
  );
}

function Identity({ kit, actions, big }) {
  return (
    <section className="rounded-[18px] border border-[#262626] bg-[#101116] overflow-hidden">
      {big && (kit.press_photos?.[0]?.url || kit.photo_url) && (
        <img src={kit.press_photos?.[0]?.url || kit.photo_url} alt="" className="w-full h-[240px] object-cover" />
      )}
      <div className="p-[18px] flex flex-col gap-3.5">
        <div className="flex items-center gap-3.5">
          {!big && <Avatar name={kit.name} url={kit.photo_url} />}
          <div className="min-w-0 flex flex-col gap-1.5">
            <div className={`${big ? "text-[44px]" : "text-[30px]"} leading-[0.95] break-words`} style={cond}>{kit.name}</div>
            {kit.city && <div className="text-[11px] tracking-[0.14em] text-white/65" style={mono}>{kit.city.toUpperCase()}</div>}
            <GenreChips genres={kit.genre_tags} />
          </div>
        </div>
        {big && <Bio bio={kit.bio} own />}
        {actions}
      </div>
    </section>
  );
}

// ---- Edit ----

const field = "w-full min-h-[44px] px-3 rounded-xl bg-[#0d0e14] border border-white/15 text-[15px] text-white placeholder:text-white/35 outline-none focus:border-[#FDE047]";

function Box({ title, hint, children }) {
  return (
    <section className="flex flex-col gap-2.5 p-4 rounded-2xl bg-[#101116] border border-[#262626]">
      <div>
        <Label>{title}</Label>
        {hint && <p className="m-0 mt-1 text-[13px] text-white/50">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Rows({ items, render, onAdd, addLabel }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(render)}
      <button type="button" onClick={onAdd} className="self-start min-h-[40px] px-3.5 rounded-full border border-dashed border-white/25 flex items-center gap-1.5 text-[14px] font-semibold text-white/80 hover:text-white hover:border-white/50">
        <Plus className="w-4 h-4" />{addLabel}
      </button>
    </div>
  );
}

function RemoveBtn({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10">
      <X className="w-[18px] h-[18px]" />
    </button>
  );
}

function KitEditor({ state, flags: flags0, onCancel, onSaved }) {
  const { toast } = useToast();
  const t = state.template;
  const [name, setName] = useState(t.name || "");
  const [d, setD] = useState(() => ({
    photo_url: t.data.photo_url || "",
    genre_tags: t.data.genre_tags || [],
    kit_city: t.data.kit_city || "",
    kit_bio: t.data.kit_bio || "",
    kit_mixes: (t.data.kit_mixes || []).length ? t.data.kit_mixes : [{ title: "", url: "" }],
    kit_photos: t.data.kit_photos || [],
    kit_logo_url: t.data.kit_logo_url || "",
    kit_links: (t.data.kit_links || []).length ? t.data.kit_links : [{ kind: "", url: "" }],
    contact_name: t.data.contact_name || "",
    contact_email: t.data.contact_email || "",
    contact_phone: t.data.contact_phone || "",
  }));
  const [flags, setFlags] = useState(flags0);
  const flag = (k) => (e) => setFlags((x) => ({ ...x, [k]: e.target.checked }));
  const [genre, setGenre] = useState("");
  const [uploading, setUploading] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const photoIn = useRef(null);
  const pressIn = useRef(null);
  const logoIn = useRef(null);

  const upload = async (files, what) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setUploading(what);
    try {
      const urls = [];
      for (const f of list) urls.push(await uploadKitImage(state.userId, f));
      if (what === "photo") set("photo_url", urls[0]);
      else if (what === "logo") set("kit_logo_url", urls[0]);
      else setD((x) => ({ ...x, kit_photos: [...x.kit_photos, ...urls.map((url) => ({ url }))] }));
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't upload that picture", variant: "destructive" });
    } finally {
      setUploading("");
    }
  };

  const addGenre = () => {
    const g = genre.trim();
    if (!g) return;
    if (!d.genre_tags.some((x) => x.toLowerCase() === g.toLowerCase())) set("genre_tags", [...d.genre_tags, g]);
    setGenre("");
  };

  const save = async () => {
    if (!name.trim()) { toast({ title: "Add your DJ name first", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const clean = {
        ...d,
        genre_tags: d.genre_tags,
        genre_tag: d.genre_tags[0] || "",
        kit_bio: d.kit_bio.trim(),
        kit_city: d.kit_city.trim(),
        kit_mixes: d.kit_mixes.filter((m) => m.url.trim()).map((m) => ({ title: m.title.trim(), url: m.url.trim() })),
        kit_links: d.kit_links.filter((l) => l.url.trim()).map((l) => ({ kind: platformOf(l.url), url: l.url.trim() })),
        contact_name: d.contact_name.trim(),
        contact_email: d.contact_email.trim(),
        contact_phone: d.contact_phone.trim(),
      };
      const data = { ...t.data, ...clean };
      await saveKit(t.id, name, data);
      let link = null;
      if (Object.keys(flags).some((k) => flags[k] !== flags0[k])) {
        try { link = await setKitFlags(state.userId, t.id, flags); }
        catch (e) { console.error(e); toast({ title: "Couldn't change those settings", description: "Try again in a moment.", variant: "destructive" }); }
      }
      onSaved({ ...t, name: name.trim(), data: { ...data, dj_kit: true } }, link);
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't save", description: "Check your signal and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start lg:pt-2">
      <div className="flex flex-col gap-3 lg:gap-5">
        <Box title="YOU">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => photoIn.current?.click()} className="relative rounded-full" aria-label="Change your photo">
              <Avatar name={name} url={d.photo_url} size={76} />
              <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: DJ_COLOR, color: "#000" }}>
                {uploading === "photo" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </span>
            </button>
            <input ref={photoIn} type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files, "photo"); e.target.value = ""; }} />
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <label className="sr-only" htmlFor="kit-name">DJ name</label>
              <input id="kit-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="DJ name" />
              <label className="sr-only" htmlFor="kit-city">Based in</label>
              <input id="kit-city" className={field} value={d.kit_city} onChange={(e) => set("kit_city", e.target.value)} placeholder="Based in (city)" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {d.genre_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {d.genre_tags.map((g) => (
                  <span key={g} className="pl-2.5 pr-1 py-[3px] rounded-full text-[13px] font-semibold flex items-center gap-1" style={{ background: `${DJ_COLOR}1f`, color: DJ_COLOR }}>
                    {g}
                    <button type="button" onClick={() => set("genre_tags", d.genre_tags.filter((x) => x !== g))} aria-label={`Remove ${g}`} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="kit-genre">Add a genre</label>
              <input id="kit-genre" className={field} value={genre} onChange={(e) => setGenre(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGenre(); } }} placeholder="Add a genre (House, Techno, Open format...)" />
              <button type="button" onClick={addGenre} className="min-h-[44px] px-4 rounded-xl border border-white/20 text-[14px] font-semibold hover:bg-white/5">Add</button>
            </div>
          </div>
        </Box>

        <Box title="BIO" hint="A few lines a promoter can paste into a flyer or listing.">
          <label className="sr-only" htmlFor="kit-bio">Bio</label>
          <textarea id="kit-bio" rows={5} className={`${field} py-2.5 leading-relaxed resize-y`} value={d.kit_bio} onChange={(e) => set("kit_bio", e.target.value)} placeholder="Who you are, where you play, the sound you're known for." />
        </Box>

        <Box title="BOOKING CONTACT" hint="You, or your agent.">
          <input className={field} aria-label="Contact name" value={d.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Name" />
          <input className={field} aria-label="Contact email" type="email" inputMode="email" value={d.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="Email" />
          <input className={field} aria-label="Contact phone" type="tel" inputMode="tel" value={d.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="Phone" />
        </Box>
      </div>

      <div className="flex flex-col gap-3 lg:gap-5">
        <Box title="MIXES" hint="Paste a SoundCloud, Mixcloud or YouTube link.">
          <Rows
            items={d.kit_mixes}
            addLabel="Add a mix"
            onAdd={() => set("kit_mixes", [...d.kit_mixes, { title: "", url: "" }])}
            render={(m, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 flex flex-col sm:flex-row gap-2 min-w-0">
                  <input className={`${field} sm:w-[40%]`} aria-label={`Mix ${i + 1} title`} value={m.title} onChange={(e) => set("kit_mixes", d.kit_mixes.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" />
                  <input className={field} aria-label={`Mix ${i + 1} link`} inputMode="url" value={m.url} onChange={(e) => set("kit_mixes", d.kit_mixes.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="Link" />
                </div>
                <RemoveBtn label={`Remove mix ${i + 1}`} onClick={() => set("kit_mixes", d.kit_mixes.filter((_, j) => j !== i))} />
              </div>
            )}
          />
        </Box>

        <Box title={"PRESS PHOTOS & LOGO"} hint="Promoters download these for flyers. The first photo leads your press kit.">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {d.kit_photos.map((p, i) => (
              <div key={`${p.url}-${i}`} className="relative aspect-[4/5] rounded-[10px] overflow-hidden bg-[#1c1d24]">
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => set("kit_photos", d.kit_photos.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`} className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => pressIn.current?.click()} className="aspect-[4/5] rounded-[10px] border border-dashed border-white/25 flex flex-col items-center justify-center gap-1 text-[12px] text-white/70 hover:border-white/50">
              {uploading === "press" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}Photos
            </button>
          </div>
          <input ref={pressIn} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files, "press"); e.target.value = ""; }} />
          <div className="flex items-center gap-3 pt-1">
            {d.kit_logo_url ? (
              <div className="relative w-20 h-20 rounded-[10px] bg-[#1c1d24] overflow-hidden">
                <img src={d.kit_logo_url} alt="Your logo" className="w-full h-full object-contain p-2" />
                <button type="button" onClick={() => set("kit_logo_url", "")} aria-label="Remove logo" className="absolute top-0.5 right-0.5 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : null}
            <button type="button" onClick={() => logoIn.current?.click()} className="min-h-[40px] px-3.5 rounded-full border border-white/20 flex items-center gap-1.5 text-[14px] font-semibold hover:bg-white/5">
              {uploading === "logo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}{d.kit_logo_url ? "Change logo" : "Add your logo"}
            </button>
            <input ref={logoIn} type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files, "logo"); e.target.value = ""; }} />
          </div>
        </Box>

        <Box title="LINKS" hint="Paste the link: Show Pilot names it (Instagram, Resident Advisor...).">
          <Rows
            items={d.kit_links}
            addLabel="Add a link"
            onAdd={() => set("kit_links", [...d.kit_links, { kind: "", url: "" }])}
            render={(l, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className={field} aria-label={`Link ${i + 1}`} inputMode="url" value={l.url} onChange={(e) => set("kit_links", d.kit_links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="instagram.com/yourname" />
                {l.url.trim() && <span className="hidden sm:block shrink-0 text-[12px] text-white/55 w-[110px] truncate" style={mono}>{platformOf(l.url)}</span>}
                <RemoveBtn label={`Remove link ${i + 1}`} onClick={() => set("kit_links", d.kit_links.filter((_, j) => j !== i))} />
              </div>
            )}
          />
        </Box>

        <Box title="ON YOUR PRESS KIT">
          {[
            ["show_dates", "Upcoming dates", "Event, date and venue, taken from your Bookings."],
            ["show_history", "Played at", "Your past nights on Show Pilot. A check marks ones the event itself confirms."],
            ["take_requests", "Date requests", "Promoters can tap an open night and ask for it. Requests land in your Bookings."],
          ].map(([k, title, sub]) => (
            <label key={k} className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer">
              <span className="text-[15px]">{title}<span className="block text-[13px] text-white/50">{sub}</span></span>
              <input type="checkbox" checked={flags[k]} onChange={flag(k)} className="w-5 h-5 shrink-0" style={{ accentColor: DJ_COLOR }} />
            </label>
          ))}
        </Box>
      </div>

      <div className="lg:col-span-2 flex gap-2 sticky bottom-[84px] z-10 -mx-4 px-4 py-2.5 bg-black/85 backdrop-blur lg:static lg:mx-0 lg:px-0 lg:py-0 lg:bg-transparent lg:backdrop-blur-none">
        <button type="button" onClick={save} disabled={saving || !!uploading} className="flex-1 lg:flex-none min-h-[48px] px-7 rounded-full flex items-center justify-center gap-2 text-[15px] font-bold disabled:opacity-60" style={{ background: DJ_COLOR, color: "#000" }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-[48px] px-6 rounded-full border border-white/20 bg-black/80 text-[15px] font-semibold hover:bg-white/5">Cancel</button>
      </div>
    </div>
  );
}
