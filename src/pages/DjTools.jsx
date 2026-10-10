import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Copy, Disc3, ExternalLink, FileAudio,
  FolderOpen, Loader2, Plus, RefreshCw, Trash2,
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { driveCall, slotLink } from "@/lib/djTools";
import { describeWav, formatDuration, qualityWarning } from "@/lib/wav";

const G = "#8CFF3D";
const BLUE = "#60A5FA";
const AMBER = "#F59E0B";
const PINK = "#F472B6";
const RED = "#F87171";
const STATUS = {
  waiting: { label: "NOT STARTED", color: "#9A9A9A" },
  started: { label: "IN PROGRESS", color: BLUE },
  submitted: { label: "SUBMITTED", color: G },
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

// DJ Tools: connect Google Drive, make a set link per event, build the running
// order, send each artist their own link, and see what's come in.
export default function DjTools() {
  const navigate = useNavigate();
  const [drive, setDrive] = useState({ loading: true });
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [slots, setSlots] = useState([]);
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [myShows, setMyShows] = useState([]);
  const [error, setError] = useState("");

  const loadDrive = useCallback(() => {
    driveCall("status").then((d) => setDrive({ ...d, loading: false })).catch((e) => setDrive({ loading: false, error: e.message }));
  }, []);

  const loadRequests = useCallback(async () => {
    const { data, error: e } = await supabase.from("dj_set_requests").select("*").order("event_date", { ascending: true, nullsFirst: false }).order("created_at");
    if (e) { setError("Couldn't load your set links."); return; }
    setRequests(data || []);
    const wanted = new URLSearchParams(window.location.search).get("event");
    setSelectedId((cur) => cur && data?.some((r) => r.id === cur) ? cur : (wanted && data?.some((r) => r.id === wanted) ? wanted : data?.[0]?.id ?? null));
  }, []);

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
      await loadRequests();
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

  const connectDrive = async () => {
    try { const { url } = await driveCall("start", { return_to: "/dj" }); window.location.assign(url); }
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

  const copyAll = async () => {
    const lines = slots.map((s, i) => `${i + 1}. ${s.artist_name || "Artist"}${s.set_start ? ` (${s.set_start}${s.set_end ? `–${s.set_end}` : ""})` : ""}: ${slotLink(s.token)}`);
    return copyText(`${selected.title}: send your set here\n\n${lines.join("\n")}`);
  };

  if (loading) return <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#8CFF3D] animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white" style={{ fontFamily: SCENE_FONT }}>
      <header className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-[#1a1a1a]">
        <button type="button" onClick={() => navigate(-1)} className="p-1 text-white/60 hover:text-white" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <Disc3 className="w-7 h-7" style={{ color: PINK }} />
        <div>
          <h1 className="text-3xl font-bold leading-none tracking-wide">DJ Tools</h1>
          <p className="text-white/45 text-[11px] tracking-[0.1em] mt-1" style={{ fontFamily: SCENE_MONO }}>SET LINKS · RUNNING ORDER · WAVS TO YOUR DRIVE</p>
        </div>
        <DriveBadge drive={drive} onConnect={connectDrive} onDisconnect={disconnectDrive} />
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded-lg px-3 py-2 text-sm flex items-center justify-between" style={{ background: RED + "14", border: `1px solid ${RED}55`, color: "#fecaca" }}>
          {error}<button type="button" className="text-white/60 hover:text-white text-xs" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      <div className="grid gap-5 p-6 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
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
                style={{ background: on ? PINK + "14" : "#131313", borderColor: on ? PINK + "88" : "#222" }}>
                <div className="font-semibold text-lg leading-tight truncate">{r.title}</div>
                <div className="text-[11px] text-white/45 mt-0.5 tracking-[0.06em]" style={{ fontFamily: SCENE_MONO }}>
                  {[r.event_date && new Date(r.event_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(), r.venue?.toUpperCase()].filter(Boolean).join(" · ") || "NO DATE"}
                </div>
              </button>
            );
          })}
        </aside>

        <main className="min-w-0">
          {creating ? (
            <NewRequest myShows={myShows} onCancel={() => setCreating(false)} onCreate={createRequest} />
          ) : selected ? (
            <RequestDetail
              key={selected.id} request={selected} slots={slots} files={files} driveConnected={!!drive.connected}
              onUpdate={updateRequest} onDelete={deleteRequest} onAddSlot={addSlot} onUpdateSlot={updateSlot}
              onRemoveSlot={removeSlot} onMoveSlot={moveSlot} onCopyAll={copyAll} onRefresh={() => loadSlots(selected.id)}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function DriveBadge({ drive, onConnect, onDisconnect }) {
  const [confirm, setConfirm] = useState(false);
  if (drive.loading) return <div className="ml-auto"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>;
  if (drive.configured === false) {
    return <div className="ml-auto text-xs text-white/45 max-w-xs text-right">Google Drive isn't switched on for Show Pilot yet. Track lists still work.</div>;
  }
  if (!drive.connected) {
    return (
      <button type="button" onClick={onConnect} className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl font-bold" style={{ background: BLUE + "1F", border: `1px solid ${BLUE}88`, color: BLUE }}>
        <FolderOpen className="w-4 h-4" /> Connect Google Drive
      </button>
    );
  }
  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="text-right">
        <div className="text-[11px] tracking-[0.1em] text-[#8CFF3D]" style={{ fontFamily: SCENE_MONO }}>GOOGLE DRIVE CONNECTED</div>
        <div className="text-sm text-white/60">{drive.email}</div>
      </div>
      {drive.folder_url && <a href={drive.folder_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2a2a] text-white/80 hover:text-white text-sm font-semibold"><FolderOpen className="w-4 h-4" /> Open folder</a>}
      {confirm ? (
        <span className="flex items-center gap-2 text-sm">
          <span className="text-white/60">Files stay in your Drive.</span>
          <button type="button" onClick={() => { setConfirm(false); onDisconnect(); }} className="px-2.5 py-1.5 rounded-lg text-red-300 border border-red-400/40">Disconnect</button>
          <button type="button" onClick={() => setConfirm(false)} className="text-white/50">Keep</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="text-xs text-white/40 hover:text-white/70">Disconnect</button>
      )}
    </div>
  );
}

function NewRequest({ myShows, onCancel, onCreate }) {
  const [showId, setShowId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [due, setDue] = useState("");
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

function RequestDetail({ request, slots, files, driveConnected, onUpdate, onDelete, onAddSlot, onUpdateSlot, onRemoveSlot, onMoveSlot, onCopyAll, onRefresh }) {
  const [title, setTitle] = useState(request.title);
  const [note, setNote] = useState(request.note || "");
  const [venue, setVenue] = useState(request.venue || "");
  const [copiedAll, setCopiedAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const counts = useMemo(() => ({
    submitted: slots.filter((s) => s.status === "submitted").length,
    total: slots.length,
  }), [slots]);
  const due = request.due_at ? new Date(request.due_at) : null;
  const overdue = due && due < new Date() && counts.submitted < counts.total;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-[#222] bg-[#121212] p-5 grid gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <input id="req-title" className={`${input} text-2xl font-bold flex-1 min-w-[240px]`} maxLength={120} value={title}
            onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== request.title && onUpdate({ title: title.trim() })} />
          {request.drive_folder_id && (
            <a href={folderUrl(request.drive_folder_id)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2a2a] text-white/80 hover:text-white text-sm font-semibold">
              <FolderOpen className="w-4 h-4" /> Event folder in Drive
            </a>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1"><span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>DATE</span>
            <input id="req-date" type="date" className={input} value={request.event_date || ""} onChange={(e) => onUpdate({ event_date: e.target.value || null })} /></label>
          <label className="grid gap-1"><span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>VENUE</span>
            <input id="req-venue" className={input} maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} onBlur={() => venue !== (request.venue || "") && onUpdate({ venue: venue.trim() || null })} /></label>
          <label className="grid gap-1"><span className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: overdue ? RED : "rgba(255,255,255,0.45)" }}>SETS DUE BY{overdue ? " · OVERDUE" : ""}</span>
            <input id="req-due" type="datetime-local" className={input} value={toLocalInput(request.due_at)} onChange={(e) => onUpdate({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
        </div>
        <label className="grid gap-1"><span className="text-[11px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>NOTE FOR EVERY ARTIST</span>
          <textarea id="req-note" rows={2} maxLength={2000} className={input} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (request.note || "") && onUpdate({ note: note.trim() || null })}
            placeholder="e.g. 48 kHz / 24-bit please, tracks named in play order" /></label>
        {!driveConnected && (
          <p className="text-sm" style={{ color: AMBER }}>Connect Google Drive (top right) so artists can send WAVs. Until then they can only fill in track lists.</p>
        )}
      </div>

      <div className="rounded-2xl border border-[#222] bg-[#121212] p-5">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-2xl font-bold leading-none">Running order</h2>
          <span className="text-xs text-white/50" style={{ fontFamily: SCENE_MONO }}>{counts.submitted}/{counts.total} SUBMITTED</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-white/70 hover:text-white text-sm"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
            {slots.length > 0 && (
              <button type="button" onClick={async () => { if (await onCopyAll()) { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1800); } }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold" style={{ borderColor: PINK + "66", color: PINK }}>
                {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copiedAll ? "Copied" : "Copy all links"}
              </button>
            )}
          </div>
        </div>

        {slots.length === 0 && <p className="text-white/45 text-sm py-2">Add each artist in the order they play. Every artist gets their own link.</p>}
        <ol className="flex flex-col gap-2">
          {slots.map((s, i) => (
            <SlotRow key={s.id} s={s} i={i} count={slots.length} files={files}
              onUpdate={(p) => onUpdateSlot(s.id, p)} onRemove={() => onRemoveSlot(s.id)} onMove={(d) => onMoveSlot(i, d)} />
          ))}
        </ol>
        <button type="button" onClick={onAddSlot} className="mt-3 flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#2a2a2a] text-white/80 hover:text-white hover:border-white/30 text-sm font-semibold">
          <Plus className="w-4 h-4" /> Add an artist
        </button>
      </div>

      <div className="flex justify-end">
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-white/60">Delete this set link and every artist's link? Files already in Drive stay there.</span>
            <button type="button" onClick={onDelete} className="px-3 py-1.5 rounded-lg text-red-300 border border-red-400/40">Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-white/50">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-red-300"><Trash2 className="w-4 h-4" /> Delete set link</button>
        )}
      </div>
    </div>
  );
}

function SlotRow({ s, i, count, files, onUpdate, onRemove, onMove }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(s.artist_name || "");
  const [copied, setCopied] = useState(false);
  const st = STATUS[s.status] || STATUS.waiting;
  const tracks = Array.isArray(s.tracks) ? s.tracks : [];
  const withFiles = tracks.filter((t) => t.file_id && files[t.file_id]);
  const total = withFiles.reduce((sum, t) => sum + (Number(files[t.file_id].duration_sec) || 0), 0);
  const timeIn = "bg-[#0d0d0d] border border-[#262626] rounded-md px-2 py-1.5 text-white text-sm w-[76px] tabular-nums outline-none focus:border-[#8CFF3D]/60";

  return (
    <li className="rounded-xl border border-[#222] bg-[#161616]">
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex items-center">
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)} className="p-1 text-white/40 hover:text-white disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Move down" disabled={i === count - 1} onClick={() => onMove(1)} className="p-1 text-white/40 hover:text-white disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
        </div>
        <span className="text-lg font-bold tabular-nums w-7" style={{ color: PINK }}>{String(i + 1).padStart(2, "0")}</span>
        <input id={`slot-name-${s.id}`} className="bg-[#0d0d0d] border border-[#262626] rounded-md px-2.5 py-1.5 text-white font-semibold flex-1 min-w-[160px] outline-none focus:border-[#8CFF3D]/60"
          placeholder="Artist name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.artist_name && onUpdate({ artist_name: name.trim() })} />
        <input id={`slot-start-${s.id}`} type="time" aria-label="Set starts" className={timeIn} value={s.set_start || ""} onChange={(e) => onUpdate({ set_start: e.target.value || null })} />
        <span className="text-white/30">–</span>
        <input id={`slot-end-${s.id}`} type="time" aria-label="Set ends" className={timeIn} value={s.set_end || ""} onChange={(e) => onUpdate({ set_end: e.target.value || null })} />
        <span className="text-[10px] font-bold tracking-[0.08em] px-2 py-1 rounded-full" style={{ fontFamily: SCENE_MONO, color: st.color, background: st.color + "1A" }}>{st.label}</span>
        <span className="text-xs text-white/50 tabular-nums" style={{ fontFamily: SCENE_MONO }}>{tracks.length} TRK · {withFiles.length} WAV{total ? ` · ${formatDuration(total)}` : ""}</span>
        <button type="button" onClick={async () => { if (await copyText(slotLink(s.token))) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border" style={{ borderColor: G + "55", color: G }}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy link"}
        </button>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="p-1.5 text-white/50 hover:text-white">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
      </div>

      {open && (
        <div className="border-t border-[#222] p-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 overflow-x-auto">
            {tracks.length === 0 ? <p className="text-white/40 text-sm">No tracks yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[10px] tracking-[0.1em] text-white/40" style={{ fontFamily: SCENE_MONO }}>
                  <th className="py-1 pr-2">#</th><th className="pr-2">TRACK</th><th className="pr-2">BPM</th><th className="pr-2">KEY</th><th className="pr-2">WAV</th></tr></thead>
                <tbody>
                  {tracks.map((t, k) => {
                    const f = t.file_id ? files[t.file_id] : null;
                    const warn = f ? qualityWarning({ sampleRate: f.sample_rate, bitDepth: f.bit_depth }) : null;
                    return (
                      <tr key={k} className="border-t border-[#1f1f1f] align-top">
                        <td className="py-1.5 pr-2 tabular-nums text-white/50">{k + 1}</td>
                        <td className="py-1.5 pr-2"><div className="font-semibold">{t.title || "Untitled"}</div>{t.artist && <div className="text-white/50">{t.artist}</div>}{t.notes && <div className="text-white/45 text-xs mt-0.5">{t.notes}</div>}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{t.bpm}</td>
                        <td className="py-1.5 pr-2">{t.key}</td>
                        <td className="py-1.5 pr-2">
                          {f ? (
                            <a href={f.web_view_link || "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: warn ? AMBER : G }}>
                              <FileAudio className="w-3.5 h-3.5" />
                              <span className="text-xs" style={{ fontFamily: SCENE_MONO }}>{describeWav({ sampleRate: f.sample_rate, bitDepth: f.bit_depth, channels: f.channels, durationSec: f.duration_sec })}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : <span className="text-white/30 text-xs">No file</span>}
                          {warn && <div className="text-[11px]" style={{ color: AMBER }}>{warn}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="grid gap-3 content-start text-sm">
            <div><div className="text-[10px] tracking-[0.12em] text-white/40" style={{ fontFamily: SCENE_MONO }}>CONTACT</div>
              <div className="mt-1 text-white/80 select-text">{s.contact || <span className="text-white/35">Nothing yet</span>}</div></div>
            {s.submitted_at && <div className="text-xs text-white/45" style={{ fontFamily: SCENE_MONO }}>SUBMITTED {new Date(s.submitted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase()}</div>}
            <div className="flex flex-wrap gap-2">
              {s.drive_folder_id && <a href={folderUrl(s.drive_folder_id)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#2a2a2a] text-white/80 hover:text-white text-xs font-semibold"><FolderOpen className="w-3.5 h-3.5" /> Artist folder</a>}
              <a href={`/dj/set/${s.token}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#2a2a2a] text-white/80 hover:text-white text-xs font-semibold"><ExternalLink className="w-3.5 h-3.5" /> Open their page</a>
              <button type="button" onClick={onRemove} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-white/40 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
