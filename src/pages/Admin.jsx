import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Search, ArrowLeft, ShieldCheck, ChevronRight } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

// Admin view (job 406): read-only. Reads go through the admin_* functions,
// which check the caller is in site_admins, can't change anything, and log
// every look. A person who isn't an admin is sent home without being told
// the page exists.

const GREEN = "#8CFF3D";
const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};
const when = (t) => (t ? new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const label = (k) => String(k ?? "").replace(/_/g, " ");

// Shows any JSON as readable labelled rows, so nothing a user typed is hidden.
function Pretty({ v, depth = 0 }) {
  if (v === null || v === undefined || v === "") return <span className="text-white/30">-</span>;
  if (typeof v === "boolean") return <span>{v ? "yes" : "no"}</span>;
  if (typeof v === "number") return <span>{v}</span>;
  if (typeof v === "string") {
    if (/^https?:\/\//.test(v)) return <a href={v} target="_blank" rel="noreferrer" className="underline break-all" style={{ color: GREEN }}>{v}</a>;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return <span>{when(v)}</span>;
    return <span className="whitespace-pre-wrap break-words">{v}</span>;
  }
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-white/30">none</span>;
    return (
      <div className="space-y-2">
        {v.map((x, i) => (
          <div key={i} className={typeof x === "object" && x ? "rounded-lg border border-white/10 p-2" : ""}><Pretty v={x} depth={depth + 1} /></div>
        ))}
      </div>
    );
  }
  const entries = Object.entries(v).filter(([, x]) => x !== null && x !== "" && !(Array.isArray(x) && !x.length));
  if (!entries.length) return <span className="text-white/30">-</span>;
  return (
    <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: "minmax(90px,150px) 1fr" }}>
      {entries.map(([k, x]) => (
        <React.Fragment key={k}>
          <div className="text-[11px] uppercase tracking-wide text-white/40 pt-0.5">{label(k)}</div>
          <div className="text-sm text-white/90 min-w-0"><Pretty v={x} depth={depth + 1} /></div>
        </React.Fragment>
      ))}
    </div>
  );
};

function Section({ title, count, open, children }) {
  return (
    <details open={open} className="rounded-xl border border-white/10 bg-white/[0.03] mb-3">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-white flex items-center gap-2">
        {title}{count !== undefined && <span className="text-xs font-normal text-white/40">{count}</span>}
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Row({ onClick, children }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-2.5 mb-2">
      <div className="flex-1 min-w-0">{children}</div>
      <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
    </button>
  );
}

function Home({ go }) {
  const [tab, setTab] = useState("users");
  const [q, setQ] = useState("");
  // The rows remember which tab they belong to, so switching tabs never
  // draws one tab's rows with another tab's layout (that crashed the page).
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const rows = res && res.tab === tab && Array.isArray(res.data) ? res.data : null;

  const run = async (t = tab, text = q) => {
    setErr(""); setRes(null);
    try {
      const data = t === "users" ? await rpc("admin_find_users", { p_q: text })
        : t === "events" ? await rpc("admin_find_events", { p_q: text })
        : await rpc("admin_access_log_list", { p_limit: 200 });
      setRes({ tab: t, data });
    } catch (e) { setErr(e.message || "Something went wrong"); }
  };
  useEffect(() => { run(tab, q); /* eslint-disable-next-line */ }, [tab]);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[["users", "Accounts"], ["events", "Events"], ["log", "Access log"]].map(([k, n]) => (
          <button key={k} onClick={() => { setTab(k); setQ(""); }}
            className="px-3 py-1.5 rounded-full text-sm border"
            style={tab === k ? { background: GREEN, color: "#000", borderColor: GREEN } : { color: "#fff9", borderColor: "#fff2" }}>{n}</button>
        ))}
      </div>
      {tab !== "log" && (
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2 mb-4">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3">
            <Search className="w-4 h-4 text-white/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "users" ? "Email, name or username" : "Act, venue or city"}
              className="flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/30" />
          </div>
          <button className="px-4 rounded-lg text-sm font-semibold text-black" style={{ background: GREEN }}>Search</button>
        </form>
      )}
      {err && <p className="text-sm text-red-400 mb-3">{err}</p>}
      {rows === null && !err && <p className="text-sm text-white/40">Loading…</p>}
      {rows && !rows.length && <p className="text-sm text-white/40">Nothing found.</p>}
      {rows && tab === "users" && rows.map((u) => (
        <Row key={u.id} onClick={() => go({ type: "user", id: u.id })}>
          <div className="text-sm text-white truncate">{u.display_name || u.email}</div>
          <div className="text-xs text-white/40 truncate">{u.email} · joined {when(u.created_at).split(",")[0]} · {u.events} event{u.events === 1 ? "" : "s"}{u.plan ? ` · ${u.plan}` : ""}</div>
        </Row>
      ))}
      {rows && tab === "events" && rows.map((s) => (
        <Row key={s.id} onClick={() => go({ type: "event", id: s.id })}>
          <div className="text-sm text-white truncate">{s.band_name}{s.venue ? ` at ${s.venue}` : ""}</div>
          <div className="text-xs text-white/40 truncate">{s.date} · {s.location || ""} · {s.owner_email}</div>
        </Row>
      ))}
      {rows && tab === "log" && rows.map((l, i) => (
        <div key={i} className="text-xs text-white/60 border-b border-white/5 py-2">
          <span className="text-white/90">{when(l.at)}</span> · {l.admin} · {label(l.action)}{l.detail ? ` · ${l.detail}` : ""}
        </div>
      ))}
    </div>
  );
}

function UserView({ id, go }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { rpc("admin_user_overview", { p_user: id }).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <p className="text-sm text-red-400">{err}</p>;
  if (!d) return <p className="text-sm text-white/40">Loading…</p>;
  const evRow = (s) => (
    <Row key={s.id} onClick={() => go({ type: "event", id: s.id })}>
      <div className="text-sm text-white truncate">{s.band_name}{s.venue ? ` at ${s.venue}` : ""}</div>
      <div className="text-xs text-white/40">{s.date} · {label(s.status || "")}</div>
    </Row>
  );
  return (
    <div>
      <Section title="Account" open><Pretty v={{ ...d.user, plan: d.plan?.plan, plan_note: d.plan?.note }} /></Section>
      <Section title="Events they own" count={d.events_owned.length} open>{d.events_owned.map(evRow)}</Section>
      <Section title="Events shared with them" count={d.events_linked.length}>{d.events_linked.map(evRow)}</Section>
      <Section title="Booking packages" count={d.packages.length} open>
        {d.packages.map((p) => (
          <Row key={p.id} onClick={() => go({ type: "package", id: p.id })}>
            <div className="text-sm text-white truncate">{p.act_name || "(no act)"}{p.to_name ? ` → ${p.to_name}` : ""}</div>
            <div className="text-xs text-white/40">{p.kind === "venue" ? "venue offer" : "act package"} · {p.role} · {label(p.status || "")} · {when(p.updated_at)}</div>
          </Row>
        ))}
      </Section>
      <Section title="Templates" count={d.templates.length}><Pretty v={d.templates} /></Section>
    </div>
  );
}

function EventView({ id, go }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { rpc("admin_event", { p_show: id }).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <p className="text-sm text-red-400">{err}</p>;
  if (!d || !d.event) return <p className="text-sm text-white/40">{d ? "Event not found." : "Loading…"}</p>;
  return (
    <div>
      <Section title="Event" open><Pretty v={d.event} /></Section>
      <Section title="People" count={d.people.length} open>
        {d.people.map((p) => <Row key={p.id} onClick={() => go({ type: "user", id: p.id })}><div className="text-sm text-white">{p.display_name || p.email}</div><div className="text-xs text-white/40">{p.email}{p.id === d.owner?.id ? " · owner" : ""}</div></Row>)}
      </Section>
      <Section title="Deal terms" open={!!d.deal}><Pretty v={d.deal} /></Section>
      <Section title="Settlement" open={!!d.settlement}><Pretty v={d.settlement} /></Section>
      <Section title="Agreements and records" count={d.records.length} open={d.records.length > 0}><Pretty v={d.records} /></Section>
      <Section title="Booking packages" count={d.packages.length} open={d.packages.length > 0}>
        {d.packages.map((p) => (
          <Row key={p.id} onClick={() => go({ type: "package", id: p.id })}>
            <div className="text-sm text-white">{p.act_name}</div><div className="text-xs text-white/40">{label(p.status || "")} · {when(p.updated_at)}</div>
          </Row>
        ))}
      </Section>
      <Section title="Chats" count={d.chats.reduce((n, c) => n + c.messages.length, 0)} open>
        {d.chats.map((c) => (
          <div key={c.id} className="mb-3">
            <div className="text-xs uppercase tracking-wide text-white/40 mb-1">{c.kind}{c.section ? ` · ${c.section}` : ""}</div>
            {c.messages.length === 0 && <div className="text-sm text-white/30">No messages.</div>}
            {c.messages.map((m, i) => (
              <div key={i} className="text-sm mb-1.5"><span className="text-white/40 text-xs">{when(m.at)} · {m.from}</span><div className="text-white/90 whitespace-pre-wrap break-words">{m.body}</div></div>
            ))}
          </div>
        ))}
      </Section>
      <Section title="Acts and tech info" count={d.acts.length}><Pretty v={d.acts} /></Section>
      <Section title="Announcements" count={d.announcements.length}><Pretty v={d.announcements} /></Section>
      <Section title="Tasks" count={d.tasks.length}><Pretty v={d.tasks} /></Section>
      <Section title="Guest list" count={d.guests.length}><Pretty v={d.guests} /></Section>
      <Section title="Invites" count={d.invites.length}><Pretty v={d.invites} /></Section>
      <Section title="Who changed what" count={d.activity.length}><Pretty v={d.activity} /></Section>
    </div>
  );
}

function PackageView({ id, go }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { rpc("admin_package", { p_id: id }).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <p className="text-sm text-red-400">{err}</p>;
  if (!d) return <p className="text-sm text-white/40">Loading…</p>;
  const { data, wants, offers, rounds, reply_data, ...rest } = d;
  return (
    <div>
      <Section title="Package" open><Pretty v={rest} /></Section>
      <Section title="What the sender put in" open><Pretty v={data} /></Section>
      <Section title="Dates asked for" open><Pretty v={wants} /></Section>
      <Section title="Dates offered back" open><Pretty v={offers} /></Section>
      <Section title="Back and forth (rounds)" open><Pretty v={rounds} /></Section>
      <Section title="The act's reply package"><Pretty v={reply_data} /></Section>
      {d.show_id && <button onClick={() => go({ type: "event", id: d.show_id })} className="text-sm underline" style={{ color: GREEN }}>Open the event it became</button>}
    </div>
  );
}

export default function Admin() {
  const [ok, setOk] = useState(null);
  const [stack, setStack] = useState([{ type: "home" }]);
  const cur = stack[stack.length - 1];

  useEffect(() => {
    supabase.rpc("is_site_admin").then(({ data }) => setOk(data === true), () => setOk(false));
  }, []);
  if (ok === null) return <div className="min-h-screen bg-[#0d0d0d]" />;
  if (!ok) return <Navigate to="/" replace />;

  const go = (v) => { setStack((s) => [...s, v]); window.scrollTo(0, 0); };
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const title = { home: "Admin", user: "Account", event: "Event", package: "Booking package" }[cur.type];

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-16">
        <div className="flex items-center gap-2 mb-1">
          {stack.length > 1 && <button onClick={back} className="p-1.5 -ml-1.5 rounded-full hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>}
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/50 mb-5">
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: GREEN }} /> Read only. Every look is logged.
        </div>
        {cur.type === "home" && <Home go={go} />}
        {cur.type === "user" && <UserView key={cur.id} id={cur.id} go={go} />}
        {cur.type === "event" && <EventView key={cur.id} id={cur.id} go={go} />}
        {cur.type === "package" && <PackageView key={cur.id} id={cur.id} go={go} />}
      </div>
    </div>
  );
}
