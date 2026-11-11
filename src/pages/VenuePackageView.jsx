import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import CustomFieldsView from "@/components/showpilot/CustomFieldsView";
import { VENUE_PART_FIELDS } from "@/lib/roleTemplates";
import { pageOf, sectionList, fieldFilled } from "@/lib/templatePage";

// A venue's template, sent as a package (job 298): the web an act or tech
// opens at /vp/CODE. Each section is a circle (the venue's order, names and
// look); "Read it all" lays every section out as one page; a tech keeps it
// in their own My Templates. The server leaves out anything private.
const BLUE = "#60A5FA";
const GREEN = "#8CFF3D";
const MONO = { fontFamily: "'JetBrains Mono', monospace" };
const COND = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
const btn = "w-full min-h-[52px] rounded-[12px] font-bold text-[16px] flex items-center justify-center gap-2";
const LABELS = {
  venue: "Venue", city: "City", state: "State", address: "Address", capacity: "Capacity", age_policy: "Ages", photo_url: "",
  load_in_location: "Load-in", parking: "Parking", load_in_notes: "Load-in notes",
  schedule: "Schedule", hard_curfew: "Curfew", load_out_by: "Load out by",
  wifi_network: "Wi-Fi", wifi_password: "Wi-Fi password", power_notes: "Power",
  console: "Console", pa: "PA", backline: "Backline", mics_monitors: "Mics & monitors",
  green_room: "Green room", meals: "Meals", drink_tickets: "Drink tickets", hospitality_notes: "Hospitality notes",
  venue_documents: "Documents", documents: "Documents",
};
const has = (v) => v != null && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

function Row({ k, v }) {
  let body;
  if (Array.isArray(v)) {
    if (v.every((x) => x && typeof x === "object" && x.url)) {
      body = <div className="flex flex-col gap-1">{v.map((d, i) => <a key={i} href={d.url} target="_blank" rel="noreferrer" className="underline truncate">{d.name || "Open file"}</a>)}</div>;
    } else if (v.every((x) => x && typeof x === "object" && (x.label || x.time))) {
      body = <div className="flex flex-col gap-0.5">{v.map((r, i) => <span key={i}><span className="text-white/60">{r.time || ""}</span>{r.time && r.label ? "  " : ""}{r.label || ""}</span>)}</div>;
    } else {
      body = <span>{v.map((x) => (typeof x === "object" ? x.name || x.text || "" : x)).filter(Boolean).join(", ")}</span>;
    }
  } else if (typeof v === "boolean") body = <span>{v ? "Yes" : "No"}</span>;
  else if (typeof v === "object") body = <span>{Object.values(v).filter((x) => typeof x === "string").join(" · ")}</span>;
  else body = <span className="whitespace-pre-wrap">{String(v)}</span>;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-[#222] last:border-0 text-left">
      <span className="text-[10.5px] tracking-[0.1em] text-white/50" style={MONO}>{k.toUpperCase()}</span>
      <div className="text-[15px] text-white">{body}</div>
    </div>
  );
}

// The rows of one section, built-in fields then their own.
function sectionRows(data, s) {
  if (!s.builtIn) return { rows: [], fields: (s.fields || []).filter(fieldFilled) };
  const map = VENUE_PART_FIELDS[s.key] || {};
  const g = data.gig || {};
  const sec = data.section || {};
  const rows = [];
  // The venue, city and state are under the name already.
  for (const k of map.gig || []) { const v = g[k] ?? data[k]; if (has(v) && LABELS[k] !== "" && !(s.key === "address" && ["venue", "city", "state"].includes(k))) rows.push([LABELS[k] || k, v]); }
  for (const k of map.section || []) { const v = sec[k]; if (has(v) && LABELS[k] !== "") rows.push([LABELS[k] || k, v]); }
  return { rows, fields: (s.extra || []).filter(fieldFilled) };
}

export default function VenuePackageView() {
  const { code } = useParams();
  const { user, isLoadingAuth } = useAuth();
  const [pkg, setPkg] = useState(undefined);
  const [readAll, setReadAll] = useState(false);
  const [kept, setKept] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoadingAuth) return;
    supabase.rpc("get_template_package", { p_code: code }).then(({ data, error: e }) => {
      if (e) console.error(e);
      setPkg(data || null);
    });
  }, [code, isLoadingAuth, user?.id]);

  const data = pkg?.data || {};
  const sections = useMemo(() => {
    if (!pkg) return [];
    return sectionList("venue", data, {})
      .filter((s) => !["deal", "event_link", "link_email", "replies", "task_presets", "advance"].includes(s.key))
      .map((s) => ({ ...s, ...sectionRows(data, s) }))
      .filter((s) => s.rows.length || s.fields.length);
  }, [pkg]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pkg === undefined || isLoadingAuth) {
    return <div className="min-h-screen bg-[#05060d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#60A5FA]/30 border-t-[#60A5FA] rounded-full animate-spin" /></div>;
  }
  if (!pkg) return <IntakeSent seed={code} bare><p className="text-white/70 text-[16px]">This package isn't available any more.</p></IntakeSent>;

  const look = pageOf(data).look;
  const venueName = pkg.name || data.gig?.venue || "The venue";
  const place = [data.section?.address, [data.gig?.city || data.city, data.gig?.state || data.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const here = `/vp/${String(pkg.code).toUpperCase()}`;
  const isTech = ["engineer", "lighting"].includes(pkg.my_type);
  const cover = look.cover_url || data.section?.photo_url || data.venue_photo_url || "";
  const logo = look.logo_url || pkg.owner?.photo || "";

  const keep = async () => {
    setBusy(true);
    setError("");
    const { data: r, error: e } = await supabase.rpc("keep_template_package", { p_code: code });
    setBusy(false);
    if (e) { console.error(e); setError("Couldn't keep it. Try again."); return; }
    setKept(r?.updated ? "updated" : "saved");
  };
  const keepBlock = pkg.is_owner ? (
    <p className="text-center text-[13px] text-white/55 m-0">This is your package. It's what people see when you send it.</p>
  ) : kept ? (
    <div className="min-h-[46px] rounded-[12px] border flex items-center justify-center gap-2 text-[14.5px] font-semibold" style={{ borderColor: `${GREEN}66`, color: GREEN }}>
      <Check className="w-4 h-4" />{kept === "updated" ? "Updated in My Templates" : "Saved to My Templates"}
    </div>
  ) : isTech ? (
    <button type="button" disabled={busy} onClick={keep} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14.5px] font-semibold text-white/85 disabled:opacity-50">{busy ? "Saving…" : "Save to my templates"}</button>
  ) : !user ? (
    <a href={`/register?role=engineer&redirect=${encodeURIComponent(here)}`} className="min-h-[46px] rounded-[12px] border border-[#333] text-[14px] font-semibold text-white/80 flex items-center justify-center text-center px-3">Tech? Make a free account and keep this venue</a>
  ) : null;

  if (readAll) {
    const tf = look.title === "classic" ? { fontFamily: "Georgia, serif", fontWeight: 600 } : look.title === "clean" ? { fontFamily: "Inter, sans-serif", fontWeight: 700 } : COND;
    return (
      <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex justify-center px-4 py-5">
        <div className="w-full max-w-[640px] flex flex-col gap-4">
          <button type="button" onClick={() => setReadAll(false)} className="self-start min-h-[44px] -ml-2 px-2 flex items-center gap-1.5 text-[14px] text-white/70"><ArrowLeft className="w-4 h-4" />Back to the web</button>
          <div className="rounded-[18px] overflow-hidden border border-[#22324a55]" style={{ height: look.header === "logo" ? 72 : 170, background: look.header === "color" ? look.color || BLUE : "#16202e" }}>
            {look.header === "photo" && cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="flex items-start gap-3 px-3 -mt-[50px] relative">
            <div className="w-[72px] h-[72px] rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[24px]" style={{ border: `3px solid ${BLUE}`, background: "#141a22", color: BLUE, ...COND }}>
              {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : venueName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
            </div>
            <div className="min-w-0 mt-[40px]">
              <h1 className="m-0 text-[32px] leading-none" style={tf}>{venueName}</h1>
              {place && <p className="m-0 mt-1 text-[14px] text-white/65">{place}</p>}
            </div>
          </div>
          {sections.map((s) => (
            <section key={s.key} aria-label={s.label} className="rounded-[14px] bg-[#151515] border border-[#262626] px-4 py-3">
              <h2 className="m-0 text-[20px] mb-1" style={{ ...COND, color: look.color || "#fff" }}>{s.label}</h2>
              {s.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
              {s.fields.length > 0 && <div className={s.rows.length ? "pt-3" : ""}><CustomFieldsView fields={s.fields} /></div>}
            </section>
          ))}
          {error && <p className="text-center text-[14px] text-red-400 m-0">{error}</p>}
          {keepBlock}
          <p className="text-center text-[12.5px] text-white/40 m-0 pb-4">Sent with ShowPilot</p>
        </div>
      </div>
    );
  }

  const circles = sections.map((s) => ({
    key: s.key, label: s.label, short: s.label, done: true, required: false,
    body: () => (
      <div className="flex flex-col">
        {s.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        {s.fields.length > 0 && <div className={s.rows.length ? "pt-3" : ""}><CustomFieldsView fields={s.fields} /></div>}
      </div>
    ),
  }));
  return (
    <IntakeKeyWeb
      readOnly
      unlockLabel="Open the package"
      color={BLUE}
      seed={pkg.code}
      image={cover}
      keyCode={pkg.code}
      fromLine={`${pkg.owner?.name || venueName} sent you their venue`}
      title={venueName}
      dateLine={place}
      actName=""
      center={{ name: venueName, photo: logo, label: "Venue", href: pkg.owner?.card ? `/pilot/${pkg.owner.card}` : "" }}
      circles={circles}
      onSend={() => setReadAll(true)}
      canSend
      sendLabel="Read it all"
      belowSend={<div className="flex flex-col gap-2">{error && <p className="text-center text-[14px] text-red-400 m-0">{error}</p>}{keepBlock}</div>}
    />
  );
}
