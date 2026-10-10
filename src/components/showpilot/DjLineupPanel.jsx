import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, FolderOpen, Link2, Loader2, Share2, Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { driveCall, slotLink } from "@/lib/djTools";
import { formatDuration } from "@/lib/wav";

const G = "#8CFF3D";
const BLUE = "#60A5FA";
const AMBER = "#F59E0B";
const STATUS = {
  none: { label: "NO LINK YET", color: "#6b6b6b" },
  waiting: { label: "NOT STARTED", color: "#9A9A9A" },
  started: { label: "IN PROGRESS", color: BLUE },
  submitted: { label: "SUBMITTED", color: G },
};
const norm = (s) => String(s || "").trim().toLowerCase();

// "9:00 PM" / "21:00" / "9pm" -> "21:00" (the format set links store), or null.
function toHHMM(s) {
  const m = String(s || "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p)?\.?m?\.?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] || "0", 10);
  if (m[3] === "p" && h < 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  if (!m[3] && h >= 1 && h <= 6) h += 12; // show-day times without am/pm are evening
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function addMinutes(hhmm, minutes) {
  if (!hhmm || !(Number(minutes) > 0)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h * 60 + m + Number(minutes)) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Set uploads for this event's lineup, inside the Manager / Artist workspace.
// Each act gets its own link (like the band intake link): the artist opens it,
// lists their set in play order and sends WAVs straight to the DJ's Google
// Drive. The lineup order and set times here are what each artist sees.
// Links belong to whoever makes them (the DJ on this event).
export default function DjLineupPanel({ gig, setTimes = {}, color = "#EF4444", canEdit = true }) {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [slots, setSlots] = useState([]);
  const [files, setFiles] = useState({});
  const [drive, setDrive] = useState(null);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState("");

  const acts = useMemo(
    () => (gig.bands || []).map((b, i) => ({ name: (b.band_name || "").trim(), minutes: b.set_length_minutes, index: i })).filter((a) => a.name),
    [gig.bands],
  );

  const load = useCallback(async () => {
    if (!gig?.id) return;
    const { data: reqs } = await supabase.from("dj_set_requests").select("*").eq("show_id", gig.id).order("created_at").limit(1);
    const r = reqs?.[0] || null;
    setRequest(r);
    if (r) {
      const { data: s } = await supabase.from("dj_set_slots").select("*").eq("request_id", r.id).order("position");
      setSlots(s || []);
      const ids = (s || []).map((x) => x.id);
      if (ids.length) {
        const { data: f } = await supabase.from("dj_set_files").select("slot_id, drive_file_id, duration_sec").in("slot_id", ids);
        const map = {};
        (f || []).forEach((x) => { map[x.drive_file_id] = x; });
        setFiles(map);
      }
    } else setSlots([]);
    setLoading(false);
  }, [gig?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { driveCall("status").then(setDrive).catch(() => setDrive(null)); }, []);
  useEffect(() => {
    const onFocus = () => load(); // pick up new submissions when coming back to the tab
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const slotFor = (name) => slots.find((s) => norm(s.artist_name) === norm(name)) || null;

  // Keep each link's place and set time in step with the lineup above.
  const syncTimer = useRef(null);
  useEffect(() => {
    if (!request || !slots.length) return undefined;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      const changes = [];
      acts.forEach((a, i) => {
        const s = slotFor(a.name);
        if (!s) return;
        const start = toHHMM(setTimes[a.name]);
        const want = { position: i + 1, set_start: start, set_end: addMinutes(start, a.minutes) };
        if (s.position !== want.position || s.set_start !== want.set_start || s.set_end !== want.set_end) changes.push([s.id, want]);
      });
      if (!changes.length) return;
      setSlots((ss) => ss.map((s) => { const c = changes.find(([id]) => id === s.id); return c ? { ...s, ...c[1] } : s; }));
      await Promise.all(changes.map(([id, want]) => supabase.from("dj_set_slots").update(want).eq("id", id)));
    }, 700);
    return () => clearTimeout(syncTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acts, setTimes, request, slots.length]);

  const ensureRequest = async () => {
    if (request) return request;
    const { data, error: e } = await supabase.from("dj_set_requests").insert({
      show_id: gig.id,
      title: (gig.event_name || gig.band_name || "Show").slice(0, 120),
      event_date: gig.date || null,
      venue: gig.venue ? String(gig.venue).slice(0, 120) : null,
    }).select().single();
    if (e) throw e;
    setRequest(data);
    return data;
  };

  const generate = async (act, i) => {
    setBusy(act.name);
    setError("");
    try {
      const r = await ensureRequest();
      const start = toHHMM(setTimes[act.name]);
      const { data, error: e } = await supabase.from("dj_set_slots").insert({
        request_id: r.id, position: i + 1, artist_name: act.name.slice(0, 120), set_start: start, set_end: addMinutes(start, act.minutes),
      }).select().single();
      if (e) throw e;
      setSlots((ss) => [...ss, data]);
      if (await copyText(slotLink(data.token))) flash(act.name);
    } catch (e) {
      console.error(e);
      setError("Couldn't make that link. Try again.");
    }
    setBusy(null);
  };

  const flash = (key) => { setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); };

  const share = async (act, s) => {
    const url = slotLink(s.token);
    const text = `${act.name}: send your set for ${request?.title || "the show"} here`;
    if (navigator.share) {
      try { await navigator.share({ title: "Set upload", text, url }); return; } catch { /* cancelled: fall back to copy */ }
    }
    if (await copyText(url)) flash(act.name);
  };

  const copyAll = async () => {
    const lines = acts.map((a, i) => {
      const s = slotFor(a.name);
      return s ? `${i + 1}. ${a.name}${setTimes[a.name] ? ` (${setTimes[a.name]})` : ""}: ${slotLink(s.token)}` : null;
    }).filter(Boolean);
    if (lines.length && (await copyText(`${request?.title || "Show"}: send your set here\n\n${lines.join("\n")}`))) flash("__all");
  };

  const removeSlot = async (id) => {
    await supabase.from("dj_set_slots").delete().eq("id", id);
    setSlots((ss) => ss.filter((s) => s.id !== id));
  };

  const setDue = async (v) => {
    try {
      const r = await ensureRequest();
      const due_at = v ? new Date(v).toISOString() : null;
      setRequest({ ...r, due_at });
      await supabase.from("dj_set_requests").update({ due_at }).eq("id", r.id);
    } catch { setError("Couldn't save the due date."); }
  };

  const connectDrive = async () => {
    try {
      const { url } = await driveCall("start", { return_to: window.location.pathname + window.location.search });
      window.location.assign(url);
    } catch (e) { setError(e.message); }
  };

  const orphans = slots.filter((s) => !acts.some((a) => norm(a.name) === norm(s.artist_name)));
  const linked = acts.filter((a) => slotFor(a.name)).length;
  const submitted = acts.filter((a) => slotFor(a.name)?.status === "submitted").length;
  const label = "text-[11px] tracking-[0.12em] text-white/45";

  return (
    <section className="mt-2 rounded-xl border border-[#262626] bg-[#111] p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h3 className="text-[19px] font-bold leading-tight flex items-center gap-2"><Link2 className="w-4 h-4" style={{ color }} /> Set uploads</h3>
          <p className="text-[14px] text-white/50">Send each act their own link. They list their set in play order and send WAVs straight to your Google Drive.</p>
        </div>
        <span className="ml-auto text-[11px] text-white/50 tabular-nums" style={{ fontFamily: SCENE_MONO }}>{linked}/{acts.length} LINKED · {submitted} SUBMITTED</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className={label} style={{ fontFamily: SCENE_MONO }}>SETS DUE BY</span>
          <input id="dj-due" type="datetime-local" disabled={!canEdit} value={toLocalInput(request?.due_at)} onChange={(e) => setDue(e.target.value)}
            className="bg-[#0d0d0d] border border-[#262626] rounded-md px-2 py-1.5 text-white text-sm outline-none focus:border-[#8CFF3D]/60" />
        </label>
        {drive && drive.configured && !drive.connected && (
          <button type="button" onClick={connectDrive} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold" style={{ color: BLUE, border: `1px solid ${BLUE}66`, background: BLUE + "14" }}>
            <FolderOpen className="w-4 h-4" /> Connect Google Drive
          </button>
        )}
        {drive && drive.connected && <span className="text-[11px] tracking-[0.08em] text-[#8CFF3D]" style={{ fontFamily: SCENE_MONO }}>WAVS GO TO {String(drive.email || "YOUR DRIVE").toUpperCase()}</span>}
        {drive && drive.configured === false && <span className="text-[13px] text-white/40">WAV uploads switch on once Google Drive is set up. Track lists work now.</span>}
        <div className="ml-auto flex gap-2">
          {linked > 0 && (
            <button type="button" onClick={copyAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold" style={{ color: G, border: `1px solid ${G}55` }}>
              {copied === "__all" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied === "__all" ? "Copied" : "Copy all links"}
            </button>
          )}
          {request && (
            <a href={`/dj?event=${request.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold border border-[#2a2a2a] text-white/75 hover:text-white">
              <ExternalLink className="w-4 h-4" /> Track lists
            </a>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-white/40" /></div>
      ) : acts.length === 0 ? (
        <p className="text-white/40 text-[15px]">Add acts to the lineup above, then make each one a set link.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-[#1f1f1f] rounded-lg border border-[#1f1f1f]">
          {acts.map((a, i) => {
            const s = slotFor(a.name);
            const st = STATUS[s?.status || "none"];
            const tracks = Array.isArray(s?.tracks) ? s.tracks : [];
            const wavs = tracks.filter((t) => t.file_id && files[t.file_id]);
            const total = wavs.reduce((sum, t) => sum + (Number(files[t.file_id].duration_sec) || 0), 0);
            return (
              <li key={a.name + i} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 md:grid md:grid-cols-[24px_minmax(0,1fr)_72px_118px_150px_190px]">
                <span className="w-6 text-right font-bold tabular-nums" style={{ color }}>{i + 1}</span>
                <span className="font-semibold text-[16px] min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-[12px] text-white/50 tabular-nums w-[72px]" style={{ fontFamily: SCENE_MONO }}>{setTimes[a.name] || "—"}</span>
                <span className="text-[10px] font-bold tracking-[0.08em] px-2 py-1 rounded-full justify-self-start" style={{ fontFamily: SCENE_MONO, color: st.color, background: st.color + "1A" }}>{st.label}</span>
                <span className="text-[11px] text-white/50 tabular-nums" style={{ fontFamily: SCENE_MONO }}>{s ? `${tracks.length} TRK · ${wavs.length} WAV${total ? ` · ${formatDuration(total)}` : ""}` : ""}</span>
                <span className="ml-auto flex items-center gap-1.5 justify-self-end">
                  {s ? (
                    <>
                      <button type="button" onClick={async () => { if (await copyText(slotLink(s.token))) flash(a.name); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border" style={{ borderColor: G + "55", color: G }}>
                        {copied === a.name ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === a.name ? "Copied" : "Copy link"}
                      </button>
                      <button type="button" onClick={() => share(a, s)} aria-label={`Send ${a.name} their link`} className="p-1.5 rounded-md border border-[#2a2a2a] text-white/60 hover:text-white"><Share2 className="w-3.5 h-3.5" /></button>
                      <a href={`/dj/set/${s.token}`} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}'s upload page`} className="p-1.5 rounded-md border border-[#2a2a2a] text-white/60 hover:text-white"><ExternalLink className="w-3.5 h-3.5" /></a>
                    </>
                  ) : (
                    <button type="button" disabled={!canEdit || busy === a.name} onClick={() => generate(a, i)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold tracking-[0.04em] disabled:opacity-50" style={{ background: G, color: "#0d0d0d" }}>
                      {busy === a.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Generate set link
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {orphans.length > 0 && (
        <div className="rounded-lg px-3 py-2 text-[13px]" style={{ background: AMBER + "10", border: `1px solid ${AMBER}44` }}>
          <div className="text-white/70 mb-1">Links for acts no longer in the lineup (renamed or removed):</div>
          {orphans.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-0.5">
              <span className="flex-1 truncate">{s.artist_name || "Unnamed"} · {STATUS[s.status]?.label.toLowerCase()}</span>
              <button type="button" onClick={async () => { if (await copyText(slotLink(s.token))) flash(s.id); }} className="text-xs text-white/60 hover:text-white">{copied === s.id ? "Copied" : "Copy link"}</button>
              <button type="button" onClick={() => removeSlot(s.id)} aria-label="Remove link" className="p-1 text-white/40 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
    </section>
  );
}
