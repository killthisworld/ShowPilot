import { createPortal } from "react-dom";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/navHistory";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Copy, Disc3, ExternalLink, FileAudio, FolderOpen, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Share2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { DJ_COLOR, driveCall, slotLink } from "@/lib/djTools";
import { describeWav, formatDuration, qualityWarning } from "@/lib/wav";

const G = "#8CFF3D";
const BLUE = "#60A5FA";
const AMBER = "#FF6A00";
const RED = "#F87171";
const STATUS = {
  waiting: { label: "Not opened yet", color: "#9A9A9A" },
  started: { label: "Started", color: BLUE },
  submitted: { label: "Sent", color: G },
};
// "8:45 PM" from "20:45".
const time12 = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")}`;
};
const ampm = (t) => (t && Number(String(t).split(":")[0]) >= 12 ? "PM" : "AM");
const setTimeLabel = (a, b) => {
  if (!a && !b) return "";
  if (a && b) return `${time12(a)}${ampm(a) === ampm(b) ? "" : ` ${ampm(a)}`}–${time12(b)} ${ampm(b)}`;
  return `${time12(a || b)} ${ampm(a || b)}`;
};
const input = "bg-[#0d0d0d] border border-[#262626] rounded-lg px-3 py-2 text-white text-[15px] placeholder:text-white/25 outline-none focus:border-[#8CFF3D]/60 min-w-0";
const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Opens the phone's share sheet (Messages, WhatsApp, Mail...) where there is one,
// and copies the text instead everywhere else. Resolves "shared", "copied" or "".
async function shareText({ title, text, url }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try { await navigator.share({ title, text, url }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return ""; }
  }
  return (await copyText([text, url].filter(Boolean).join("\n"))) ? "copied" : "";
}

// Saves a text field a moment after typing stops, saves it for certain when
// the box closes.
function useAutosave({ id, value, saved, save, report, register, delay = 800 }) {
  const latest = useRef({ value, saved, save });
  latest.current = { value, saved, save };
  const dirty = String(value).trim() !== String(saved).trim();
  const flush = useCallback(async () => {
    const { value: v, saved: sv, save: sf } = latest.current;
    if (String(v).trim() !== String(sv).trim()) await sf(v);
  }, []);
  useEffect(() => { report(id, dirty); }, [dirty, id, report]);
  useEffect(() => { register(id, flush); return () => register(id, null); }, [id, flush, register]);
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(flush, delay);
    return () => clearTimeout(t);
  }, [value, dirty, flush, delay]);
  // Leaving the page or closing the box with something still unsaved.
  useEffect(() => () => { flush(); }, [flush]);
  return dirty;
}

// DJ Tools: connect Google Drive, make a set link per event, build the running
// order, send each artist their own link, and see what's come in.
// `embedded` shows it as a box over the event (opened from the Artist web's DJ
// Tools corner) instead of a page: `showId` picks that event's set link, `onClose`
// is the back button, and `returnTo` is where Google sends you after connecting.
export default function DjTools({ embedded = false, showId = null, onClose, returnTo = null }) {
  const navigate = useNavigate(); const goBack = useGoBack();
  const [drive, setDrive] = useState({ loading: true });
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [slots, setSlots] = useState([]);
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newForShow, setNewForShow] = useState("");
  const [myShows, setMyShows] = useState([]);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState({});

  const loadDrive = useCallback(() => {
    driveCall("status").then((d) => setDrive({ ...d, loading: false })).catch((e) => setDrive({ loading: false, error: e.message }));
  }, []);

  const loadRequests = useCallback(async (initial = false) => {
    const { data, error: e } = await supabase.from("dj_set_requests").select("*").order("event_date", { ascending: true, nullsFirst: false }).order("created_at");
    if (e) { setError("Couldn't load your set links."); return; }
    setRequests(data || []);
    // How many artists have sent their set, per set link (for the list on the left).
    const ids = (data || []).map((r) => r.id);
    if (ids.length) {
      const { data: st } = await supabase.from("dj_set_slots").select("request_id, status").in("request_id", ids);
      const m = {};
      (st || []).forEach((x) => { const c = (m[x.request_id] = m[x.request_id] || { in: 0, all: 0 }); c.all += 1; if (x.status === "submitted") c.in += 1; });
      setCounts(m);
    }
    const qs = new URLSearchParams(window.location.search);
    const wanted = qs.get("event");
    // Coming from an event's DJ Tools corner: open that event's set link, or
    // start one for it. Only the first time, so later reloads never move you.
    const fromShow = initial ? (showId || qs.get("show")) : null;
    const forShow = fromShow ? data?.find((r) => r.show_id === fromShow) : null;
    if (fromShow && !forShow) { setNewForShow(fromShow); setCreating(true); }
    setSelectedId((cur) => forShow ? forShow.id : cur && data?.some((r) => r.id === cur) ? cur : (wanted && data?.some((r) => r.id === wanted) ? wanted : data?.[0]?.id ?? null));
  }, [showId]);

  const loadSlots = useCallback(async (requestId) => {
    if (!requestId) { setSlots([]); setFiles({}); return; }
    const { data } = await supabase.from("dj_set_slots").select("*").eq("request_id", requestId).order("position").order("created_at");
    setSlots(data || []);
    const ids = (data || []).map((s) => s.id);
    if (ids.length) {
      const { data: f } = await supabase.from("dj_set_files").select("*").in("slot_id", ids);
      const map = {};
      (f || []).forEach((x) => { map[x.drive_file_id] = x; });
      setFiles(map);
    } else setFiles({});
  }, []);

  useEffect(() => {
    (async () => {
      loadDrive();
      await loadRequests(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("shows").select("id, event_name, band_name, date, venue").eq("owner_id", user.id)
          .gte("date", new Date(Date.now() - 86400000).toISOString().slice(0, 10)).order("date").limit(50);
        setMyShows(data || []);
      }
      setLoading(false);
    })();
  }, [loadDrive, loadRequests]);

  useEffect(() => { loadSlots(selectedId); }, [selectedId, loadSlots]);

  // Pick up new submissions when the DJ comes back to the tab.
  useEffect(() => {
    const onFocus = () => { if (selectedId) loadSlots(selectedId); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selectedId, loadSlots]);

  const selected = requests.find((r) => r.id === selectedId) || null;

  // New submissions come in by themselves every half minute while the page is showing.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && selectedId) loadSlots(selectedId); }, 30000);
    return () => clearInterval(t);
  }, [selectedId, loadSlots]);

  const connectDrive = async () => {
    try { const { url } = await driveCall("start", { return_to: returnTo || "/dj" }); window.location.assign(url); }
    catch (e) { setError(e.message); }
  };
  const disconnectDrive = async () => {
    try { await driveCall("disconnect"); loadDrive(); } catch (e) { setError(e.message); }
  };

  const createRequest = async (vals) => {
    const { data, error: e } = await supabase.from("dj_set_requests").insert(vals).select().single();
    if (e) { setError("Couldn't create that set link."); return; }
    setCreating(false);
    await loadRequests();
    setSelectedId(data.id);
  };

  const updateRequest = async (patch) => {
    if (!selected) return;
    setRequests((rs) => rs.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)));
    const { error: e } = await supabase.from("dj_set_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", selected.id);
    if (e) setError("Couldn't save that change.");
  };

  const deleteRequest = async () => {
    if (!selected) return;
    await supabase.from("dj_set_requests").delete().eq("id", selected.id);
    setSelectedId(null);
    loadRequests();
  };

  const addSlot = async () => {
    const position = (slots.at(-1)?.position ?? 0) + 1;
    const { data, error: e } = await supabase.from("dj_set_slots").insert({ request_id: selected.id, position, artist_name: "" }).select().single();
    if (e) { setError("Couldn't add an artist."); return; }
    setSlots((s) => [...s, data]);
  };

  const updateSlot = async (id, patch) => {
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error: e } = await supabase.from("dj_set_slots").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (e) setError(e.message?.includes("check") ? "Times need to look like 21:30." : "Couldn't save that change.");
  };

  const removeSlot = async (id) => {
    await supabase.from("dj_set_slots").delete().eq("id", id);
    setSlots((ss) => ss.filter((s) => s.id !== id));
  };

  const moveSlot = async (i, d) => {
    const j = i + d;
    if (j < 0 || j >= slots.length) return;
    const a = slots[i], b = slots[j];
    const next = [...slots];
    next[i] = { ...b, position: i + 1 };
    next[j] = { ...a, position: j + 1 };
    setSlots(next);
    await Promise.all(next.map((s, k) => supabase.from("dj_set_slots").update({ position: k + 1 }).eq("id", s.id)));
  };

  const allLinksText = () => {
    const lines = slots.map((s, i) => `${i + 1}. ${s.artist_name || "Artist"}${s.set_start ? ` (${s.set_start}${s.set_end ? `–${s.set_end}` : ""})` : ""}: ${slotLink(s.token)}`);
    return `${selected.title}: send your set here\n\n${lines.join("\n")}`;
  };
  const copyAll = async () => copyText(allLinksText());
  const shareAll = async () => shareText({ title: `${selected.title}: send your set`, text: allLinksText() });

  const back = () => (embedded ? onClose?.() : goBack());
  useEffect(() => {
    if (!embedded) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, onClose]);
  const box = (children) => (embedded
    ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-black/75" onClick={onClose} role="dialog" aria-modal="true" aria-label="DJ Tools">
          <div className="w-full max-w-[1100px] h-[min(94vh,900px)] overflow-y-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px]" onClick={(e) => e.stopPropagation()}>{children}</div>
        </div>,
        document.body,
      )
    : children);

  if (loading) return box(<div className={`${embedded ? "h-full min-h-[300px]" : "min-h-screen"} bg-[#0d0d0d] flex items-center justify-center`}><Loader2 className="w-6 h-6 text-[#8CFF3D] animate-spin" /></div>);

  return box(
    <div className={`${embedded ? "" : "min-h-screen"} bg-[#0d0d0d] text-white`} style={{ fontFamily: SCENE_FONT }}>
      <header className="flex flex-wrap items-center gap-4 px-6 py-3.5 border-b border-[#1a1a1a]">
        <button type="button" onClick={back} className="p-1 text-white/60 hover:text-white" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <Disc3 className="w-7 h-7" style={{ color: DJ_COLOR }} />
        <h1 className="text-3xl font-bold leading-none tracking-wide">DJ Tools</h1>
        <DriveBadge drive={drive} onConnect={connectDrive} onDisconnect={disconnectDrive} />
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded-lg px-3 py-2 text-sm flex items-center justify-between" style={{ background: RED + "14", border: `1px solid ${RED}55`, color: "#fecaca" }}>
          {error}<button type="button" className="text-white/60 hover:text-white text-xs" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      <div className="grid gap-5 p-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] items-start">
        <aside className="flex flex-col gap-2">
          <button type="button" onClick={() => setCreating(true)} className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold tracking-[0.04em]" style={{ background: G, color: "#0d0d0d" }}>
            <Plus className="w-4 h-4" /> New set link
          </button>
          {requests.length === 0 && !creating && (
            <p className="text-white/45 text-sm px-1 py-3">Make a set link for an event, add the lineup, then send each artist their link. Their WAVs land in your Google Drive, already in order.</p>
          )}
          {requests.map((r) => {
            const on = r.id === selectedId;
            return (
              <button key={r.id} type="button" onClick={() => { setCreating(false); setSelectedId(r.id); }}
                className="text-left rounded-xl px-3 py-2.5 border transition-colors"
                style={{ background: on ? DJ_COLOR + "14" : "#131313", borderColor: on ? DJ_COLOR + "88" : "#222" }}>
                <div className="font-semibold text-lg leading-tight truncate">{r.title}</div>
                <div className="text-[11px] text-white/45 mt-0.5 tracking-[0.06em]" style={{ fontFamily: SCENE_MONO }}>
                  {[r.event_date ? new Date(r.event_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase() : "NO DATE",
                    (() => { const c = r.id === selectedId ? { in: slots.filter((x) => x.status === "submitted").length, all: slots.length } : counts[r.id]; return c?.all ? `${c.in} OF ${c.all} IN` : "NO ACTS YET"; })()].join(" · ")}
                </div>
              </button>
            );
          })}
        </aside>

        <main className="min-w-0">
          {creating ? (
            <NewRequest myShows={myShows} initialShowId={newForShow} onCancel={() => setCreating(false)} onCreate={createRequest} />
          ) : selected ? (
            <RequestDetail
              key={selected.id} request={selected} slots={slots} files={files} driveConnected={!!drive.connected}
              onUpdate={updateRequest} onDelete={deleteRequest} onAddSlot={addSlot} onUpdateSlot={updateSlot}
              onRemoveSlot={removeSlot} onMoveSlot={moveSlot} onCopyAll={copyAll} onShareAll={shareAll}
            />
          ) : null}
        </main>
      </div>
    </div>,
  );
}

// Small menu under a ⋯ button; closes on a click outside.
function Menu({ items, label = "More", align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-9 h-9 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5">
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-10 z-30 min-w-[180px] rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] shadow-xl py-1`} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
          {items.filter(Boolean).map((it) => (
            <button key={it.label} type="button" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-30 hover:bg-white/5" style={{ color: it.danger ? "#fca5a5" : "rgba(255,255,255,0.85)" }}>
              {it.icon && <it.icon className="w-4 h-4" />} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Google Drive status: one small chip in the header.
function DriveBadge({ drive, onConnect, onDisconnect }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (drive.loading) return <div className="ml-auto"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>;
  if (drive.configured === false) {
    return <div className="ml-auto text-xs text-white/45 max-w-xs text-right" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>Google Drive isn't switched on for Show Pilot yet. Track lists still work.</div>;
  }
  if (!drive.connected) {
    return (
      <div className="ml-auto flex items-center gap-2" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {drive.expired && (
          <span className="px-3 py-1.5 rounded-full text-[13px] font-semibold border" style={{ color: AMBER, borderColor: AMBER + "66", background: AMBER + "14" }} title="Artists can't send WAVs until you reconnect">
            ● Drive connection expired
          </span>
        )}
        <button type="button" onClick={onConnect} className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-bold border" style={{ background: BLUE + "1F", borderColor: BLUE + "88", color: BLUE }}>
          <FolderOpen className="w-4 h-4" /> {drive.expired ? "Reconnect" : "Connect Google Drive"}
        </button>
      </div>
    );
  }
  return (
    <div className="ml-auto relative" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <button type="button" aria-expanded={open} onClick={() => { setOpen((o) => !o); setConfirm(false); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold border hover:brightness-125" style={{ color: G, borderColor: G + "55" }}>
        ● Drive connected{drive.email ? ` · ${drive.email}` : ""}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-[260px] rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] shadow-xl p-2 flex flex-col gap-1">
          {drive.folder_url && <a href={drive.folder_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-white/85 hover:bg-white/5"><FolderOpen className="w-4 h-4" /> Open the Show Pilot folder</a>}
          {confirm ? (
            <div className="px-2.5 py-2 text-sm flex flex-col gap-2">
              <span className="text-white/60">Disconnect? Files stay in your Drive.</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => { setOpen(false); setConfirm(false); onDisconnect(); }} className="px-2.5 py-1.5 rounded-lg text-red-300 border border-red-400/40">Disconnect</button>
                <button type="button" onClick={() => setConfirm(false)} className="text-white/50">Keep</button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="text-left px-2.5 py-2 rounded-lg text-sm text-white/50 hover:text-red-300 hover:bg-white/5">Disconnect Drive</button>
          )}
        </div>
      )}
    </div>
  );
}

function NewRequest({ myShows, initialShowId = "", onCancel, onCreate }) {
  const [showId, setShowId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [due, setDue] = useState("");
  useEffect(() => { if (initialShowId && myShows.some((x) => x.id === initialShowId)) pick(initialShowId); }, [initialShowId, myShows]);
  const pick = (id) => {
    setShowId(id);
    const s = myShows.find((x) => x.id === id);
    if (s) { setTitle(s.event_name || s.band_name || ""); setDate(s.date || ""); setVenue(s.venue || ""); }
  };
  return (
    <div className="rounded-2xl border border-[#222] bg-[#121212] p-5 max-w-2xl">
      <h2 className="text-2xl font-bold">New set link</h2>
      <div className="mt-4 grid gap-3">
        {myShows.length > 0 && (
          <label className="grid gap-1.5">
            <span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>FROM ONE OF YOUR EVENTS (OPTIONAL)</span>
            <select id="new-show" className={input} value={showId} onChange={(e) => pick(e.target.value)}>
              <option value="">Type the details instead</option>
              {myShows.map((s) => <option key={s.id} value={s.id}>{[s.date, s.event_name || s.band_name, s.venue].filter(Boolean).join(" · ")}</option>)}
            </select>
          </label>
        )}
        <label className="grid gap-1.5">
          <span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>EVENT NAME</span>
          <input id="new-title" className={input} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Warehouse Night Vol. 3" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5"><span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>DATE</span><input id="new-date" type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>VENUE</span><input id="new-venue" className={input} maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>SETS DUE BY</span><input id="new-due" type="datetime-local" className={input} value={due} onChange={(e) => setDue(e.target.value)} /></label>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <button type="button" disabled={!title.trim()}
          onClick={() => onCreate({ title: title.trim(), event_date: date || null, venue: venue.trim() || null, due_at: due ? new Date(due).toISOString() : null, show_id: showId || null })}
          className="px-5 py-2.5 rounded-xl font-bold disabled:opacity-40" style={{ background: G, color: "#0d0d0d" }}>Create</button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl text-white/60 hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

function RequestDetail({ request, slots, files, driveConnected, onUpdate, onDelete, onAddSlot, onUpdateSlot, onRemoveSlot, onMoveSlot, onCopyAll, onShareAll }) {
  const [title, setTitle] = useState(request.title);
  const [note, setNote] = useState(request.note || "");
  const [venue, setVenue] = useState(request.venue || "");
  const [editing, setEditing] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [sharedAll, setSharedAll] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Everything typed on this page saves by itself (a moment after typing stops).
  const flushers = useRef({});
  const register = useCallback((id, fn) => { if (fn) flushers.current[id] = fn; else delete flushers.current[id]; }, []);
  const auto = { report: () => {}, register };
  useAutosave({ id: "title", value: title, saved: request.title, save: (v) => v.trim() && onUpdate({ title: v.trim() }), ...auto });
  useAutosave({ id: "venue", value: venue, saved: request.venue || "", save: (v) => onUpdate({ venue: v.trim() || null }), ...auto });
  useAutosave({ id: "note", value: note, saved: request.note || "", save: (v) => onUpdate({ note: v.trim() || null }), ...auto });
  const counts = useMemo(() => ({
    submitted: slots.filter((s) => s.status === "submitted").length,
    total: slots.length,
  }), [slots]);
  const due = request.due_at ? new Date(request.due_at) : null;
  const overdue = due && due < new Date() && counts.submitted < counts.total;
  const dateLabel = request.event_date ? new Date(request.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "NO DATE";
  const dueLabel = due ? due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "";
  const label = (t) => <span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{t}</span>;

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* The event in one line; Edit details opens its fields. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[30px] font-bold leading-tight truncate" style={{ fontFamily: SCENE_FONT }}>{title || request.title}</h2>
          <div className="text-[12px] tracking-[0.06em] text-white/55 truncate" style={{ fontFamily: SCENE_MONO }}>
            {[dateLabel, (venue || request.venue || "").toUpperCase()].filter(Boolean).join(" · ")}
            {due && <span style={{ color: overdue ? RED : AMBER }}>{overdue ? ` · OVERDUE (${dueLabel.replace(/^[A-Z]+, /, "")})` : ` · DUE ${dueLabel}`}</span>}
          </div>
        </div>
        <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border text-sm font-semibold" style={editing ? { borderColor: DJ_COLOR + "88", color: DJ_COLOR, background: DJ_COLOR + "14" } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.85)" }}>
          <Pencil className="w-3.5 h-3.5" /> {editing ? "Done" : "Edit details"}
        </button>
        {slots.length > 0 && (
          <button type="button" onClick={async () => { if (await onCopyAll()) { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1800); } }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border text-sm font-semibold" style={{ borderColor: G + "66", color: G }}>
            {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copiedAll ? "Copied" : "Copy all links"}
          </button>
        )}
        <Menu label="More for this set link" items={[
          slots.length > 0 && { label: sharedAll === "copied" ? "Copied" : sharedAll ? "Shared" : "Share all links", icon: Share2, onClick: async () => { const r = await onShareAll(); if (r) { setSharedAll(r); setTimeout(() => setSharedAll(""), 1800); } } },
          request.drive_folder_id && { label: "Event folder in Drive", icon: FolderOpen, onClick: () => window.open(folderUrl(request.drive_folder_id), "_blank", "noopener") },
        ]} />
      </div>

      {editing && (
        <div className="rounded-2xl border border-[#222] bg-[#121212] p-4 grid gap-3">
          <label className="grid gap-1">{label("EVENT NAME")}
            <input id="req-title" className={input} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1">{label("DATE")}
              <input id="req-date" type="date" className={input} value={request.event_date || ""} onChange={(e) => onUpdate({ event_date: e.target.value || null })} /></label>
            <label className="grid gap-1">{label("VENUE")}
              <input id="req-venue" className={input} maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} /></label>
            <label className="grid gap-1">{label("SETS DUE BY")}
              <input id="req-due" type="datetime-local" className={input} value={toLocalInput(request.due_at)} onChange={(e) => onUpdate({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
          </div>
          <label className="grid gap-1">{label("NOTE FOR EVERY ARTIST")}
            <textarea id="req-note" rows={2} maxLength={2000} className={input} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. 48 kHz / 24-bit please, tracks named in play order" /></label>
        </div>
      )}
      {!editing && note && <p className="m-0 text-[14px] text-white/70 border-l-[3px] pl-2.5" style={{ borderColor: DJ_COLOR }}>{note}</p>}

      {!driveConnected && (
        <p className="text-sm m-0" style={{ color: AMBER }}>Connect Google Drive (top right) so artists can send WAVs. Until then they can only fill in track lists.</p>
      )}

      {/* Acts: one row each. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[18px] font-bold" style={{ fontFamily: SCENE_FONT }}>Running order</span>
          <span className="text-[11px] tracking-[0.08em] text-white/50" style={{ fontFamily: SCENE_MONO }}>{counts.submitted} OF {counts.total} IN</span>
        </div>
        {slots.length === 0 && <p className="text-white/45 text-sm py-1 m-0">Add each act in the order they play. Every act gets their own link.</p>}
        <ol className="flex flex-col gap-2 m-0 p-0 list-none">
          {slots.map((s, i) => (
            <SlotRow key={s.id} s={s} i={i} count={slots.length} files={files} eventTitle={request.title} auto={auto}
              onUpdate={(p) => onUpdateSlot(s.id, p)} onRemove={() => onRemoveSlot(s.id)} onMove={(d) => onMoveSlot(i, d)} />
          ))}
        </ol>
        <button type="button" onClick={onAddSlot} className="self-start flex items-center gap-1.5 px-3.5 py-2.5 rounded-[10px] border border-dashed border-[#3a3a3a] text-white/70 hover:text-white hover:border-white/40 text-sm font-semibold">
          <Plus className="w-4 h-4" /> Add an act
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span className="text-[12px] text-white/40">Click an act to see its tracks and WAVs. Everything saves as you type.</span>
        <span className="ml-auto">
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-white/60">Delete this set link and every act's link? Files already in Drive stay there.</span>
              <button type="button" onClick={onDelete} className="px-3 py-1.5 rounded-lg text-red-300 border border-red-400/40">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-white/50">Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-[13px] text-white/35 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /> Delete set link</button>
          )}
        </span>
      </div>
    </div>
  );
}

function SlotRow({ s, i, count, files, eventTitle, auto, onUpdate, onRemove, onMove }) {
  const [open, setOpen] = useState(false);
  const [editTime, setEditTime] = useState(false);
  const [name, setName] = useState(s.artist_name || "");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState("");
  useAutosave({ id: `slot-${s.id}`, value: name, saved: s.artist_name || "", save: (v) => onUpdate({ artist_name: v.trim() }), ...auto });
  const st = STATUS[s.status] || STATUS.waiting;
  const tracks = Array.isArray(s.tracks) ? s.tracks : [];
  const withFiles = tracks.filter((t) => t.file_id && files[t.file_id]);
  const total = withFiles.reduce((sum, t) => sum + (Number(files[t.file_id].duration_sec) || 0), 0);
  const statusText = s.status === "waiting" || !s.status ? st.label : `${st.label} · ${tracks.length} track${tracks.length === 1 ? "" : "s"}`;
  const timeIn = "bg-[#0d0d0d] border border-[#262626] rounded-md px-2 py-1.5 text-white text-sm w-[118px] min-w-[118px] shrink-0 tabular-nums outline-none focus:border-[#8CFF3D]/60";
  const stop = (e) => e.stopPropagation();
  const share = async () => {
    const r = await shareText({ title: `${eventTitle}: send your set`, text: `${eventTitle}: send your set here${name ? ` (${name})` : ""}`, url: slotLink(s.token) });
    if (r) { setShared(r); setTimeout(() => setShared(""), 1500); }
  };

  return (
    <li className="rounded-xl border bg-[#141414] transition-colors" style={{ borderColor: open ? DJ_COLOR + "55" : "#232323" }}>
      {/* Clicking the row (not its controls) opens the act's tracks. */}
      <div className="flex items-center gap-2 xl:gap-3 px-3 xl:px-3.5 py-2.5 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <span className="text-[15px] font-semibold tabular-nums w-6" style={{ color: DJ_COLOR, fontFamily: SCENE_MONO }}>{String(i + 1).padStart(2, "0")}</span>
        <input id={`slot-name-${s.id}`} onClick={stop}
          className="bg-transparent border border-transparent hover:border-[#2a2a2a] focus:border-[#8CFF3D]/60 rounded-md px-2 py-1.5 text-white text-[16px] font-semibold w-[170px] xl:w-[240px] min-w-0 shrink outline-none"
          placeholder="Act name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        {editTime ? (
          <span className="flex items-center gap-1.5" onClick={stop}>
            <input id={`slot-start-${s.id}`} type="time" aria-label="Set starts" autoFocus className={timeIn} value={s.set_start || ""} onChange={(e) => onUpdate({ set_start: e.target.value || null })} />
            <span className="text-white/30">–</span>
            <input id={`slot-end-${s.id}`} type="time" aria-label="Set ends" className={timeIn} value={s.set_end || ""} onChange={(e) => onUpdate({ set_end: e.target.value || null })} />
            <button type="button" onClick={() => setEditTime(false)} className="px-2 py-1 rounded-md text-xs font-semibold text-white/60 hover:text-white">Done</button>
          </span>
        ) : (
          <button type="button" onClick={(e) => { stop(e); setEditTime(true); }} title="Set the time"
            className="shrink-0 text-[13px] tabular-nums px-2 py-1 rounded-md hover:bg-white/5 w-[128px] xl:w-[150px] text-left whitespace-nowrap" style={{ fontFamily: SCENE_MONO, color: s.set_start ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)" }}>
            {setTimeLabel(s.set_start, s.set_end) || "Set time?"}
          </button>
        )}
        <span className="flex-1 min-w-0 flex items-center gap-2 text-[13px] whitespace-nowrap overflow-hidden" style={{ color: st.color }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
          {statusText}{withFiles.length ? <span className="text-white/40">{` · ${withFiles.length} WAV${total ? ` · ${formatDuration(total)}` : ""}`}</span> : null}
        </span>
        <button type="button" onClick={async (e) => { stop(e); if (await copyText(slotLink(s.token))) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[#333] text-white/85 hover:text-white whitespace-nowrap">
          {copied ? <Check className="w-3.5 h-3.5" style={{ color: G }} /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy link"}
        </button>
        <Menu label={`More for ${name || "this act"}`} items={[
          { label: shared === "copied" ? "Copied" : shared ? "Shared" : "Share link", icon: Share2, onClick: share },
          { label: "Open their page", icon: ExternalLink, onClick: () => window.open(`/dj/set/${s.token}`, "_blank", "noopener") },
          { label: "Move up", icon: ArrowUp, disabled: i === 0, onClick: () => onMove(-1) },
          { label: "Move down", icon: ArrowDown, disabled: i === count - 1, onClick: () => onMove(1) },
          { label: "Remove", icon: Trash2, danger: true, onClick: onRemove },
        ]} />
      </div>

      {open && (
        <div className="border-t border-[#222] p-3.5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 flex flex-col gap-1.5">
            {tracks.length === 0 ? <p className="text-white/40 text-sm m-0">No tracks yet.</p> : tracks.map((t, k) => {
              const f = t.file_id ? files[t.file_id] : null;
              const warn = f ? qualityWarning({ sampleRate: f.sample_rate, bitDepth: f.bit_depth }) : null;
              return (
                <div key={k} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-[#181818] border border-[#222]">
                  <span className="text-[12px] tabular-nums text-white/45 w-5 pt-0.5" style={{ fontFamily: SCENE_MONO }}>{k + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[15px] truncate">{t.title || "Untitled"}</div>
                    {(t.artist || t.notes) && <div className="text-white/50 text-[13px]">{[t.artist, t.notes].filter(Boolean).join(" · ")}</div>}
                  </div>
                  {f ? (
                    <a href={f.web_view_link || "#"} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 hover:underline text-right" style={{ color: warn ? AMBER : G }} title={warn || ""}>
                      <FileAudio className="w-3.5 h-3.5" />
                      <span className="text-xs" style={{ fontFamily: SCENE_MONO }}>{describeWav({ sampleRate: f.sample_rate, bitDepth: f.bit_depth, channels: f.channels, durationSec: f.duration_sec })}</span>
                    </a>
                  ) : <span className="shrink-0 text-white/30 text-xs">No WAV</span>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <div><div className="text-[10px] tracking-[0.12em] text-white/40" style={{ fontFamily: SCENE_MONO }}>CONTACT</div>
              <div className="mt-1 text-white/80 select-text">{s.contact || <span className="text-white/35">Nothing yet</span>}</div></div>
            {s.submitted_at && <div className="text-xs text-white/45" style={{ fontFamily: SCENE_MONO }}>SENT {new Date(s.submitted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase()}</div>}
            {s.drive_folder_id && <a href={folderUrl(s.drive_folder_id)} target="_blank" rel="noreferrer" className="self-start flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#2a2a2a] text-white/80 hover:text-white text-xs font-semibold"><FolderOpen className="w-3.5 h-3.5" /> Their folder in Drive</a>}
          </div>
        </div>
      )}
    </li>
  );
}
