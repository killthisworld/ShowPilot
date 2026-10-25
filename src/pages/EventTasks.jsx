import React, { useCallback, useEffect, useMemo, useState } from "react";
import { eventTitle } from "@/lib/eventTitle";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ClipboardList, Plus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useGoBack } from "@/lib/navHistory";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { dueInfo, SECTION_FOR_TYPE } from "@/lib/needsMe";
import { usePreferences } from "@/hooks/usePreferences";
import BottomTabs from "@/components/showpilot/BottomTabs";

// An event's tasks on their own page (/gig/tasks?token=...), opened from the
// task button on a console strip. One column per profile, each in that
// profile's color, with your own profile's column first. Anyone with the
// event can read them; the owner adds them; the person a task is for claims
// it and marks it done. The database decides who's allowed (same calls as
// the tasks box, TasksPopup.jsx).

const SECTIONS = [
  { value: "venue", label: "VENUE", long: "Venue", color: "#60A5FA" },
  { value: "manager", label: "MANAGER / ARTIST", long: "Manager / Artist", color: "#EF4444" },
  { value: "engineer", label: "AUDIO / LIGHTING", long: "Audio / Lighting", color: "#8CFF3D" },
];
const ROLE_TO_SECTION = { venue: "venue", manager: "manager", band: "manager", engineer: "engineer", lighting: "engineer" };

export default function EventTasks() {
  const goBack = useGoBack();
  const token = new URLSearchParams(window.location.search).get("token");
  const { preferences } = usePreferences();
  const [loading, setLoading] = useState(true);
  const [gig, setGig] = useState(null);
  const [perms, setPerms] = useState(null);
  const [userId, setUserId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [addSection, setAddSection] = useState(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    const [g, p, u] = await Promise.all([
      supabase.rpc("get_shared_gig", { p_token: token }),
      supabase.rpc("get_gig_section_permissions", { p_token: token }),
      supabase.auth.getUser(),
    ]);
    setGig(g.data || null);
    setPerms(p.data || null);
    setUserId(u.data?.user?.id || null);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // Your profile's section(s) on this event: your own type's section if you
  // own it, plus any role you hold or section you were granted.
  const mySections = useMemo(() => {
    const set = new Set();
    if (perms?.is_owner && preferences?.account_type) {
      const s = SECTION_FOR_TYPE[preferences.account_type];
      if (s) set.add(s);
    }
    (perms?.my_roles || []).forEach((r) => ROLE_TO_SECTION[r] && set.add(ROLE_TO_SECTION[r]));
    (perms?.granted_sections || []).forEach((s) => ROLE_TO_SECTION[s] && set.add(ROLE_TO_SECTION[s]));
    return set;
  }, [perms, preferences?.account_type]);

  const columns = useMemo(() => {
    const ordered = [...SECTIONS].sort((a, b) => Number(mySections.has(b.value)) - Number(mySections.has(a.value)));
    return ordered;
  }, [mySections]);

  const tasks = gig?.tasks || [];
  const openCount = (sec) => tasks.filter((t) => t.status !== "done" && (!sec || t.section === sec)).length;

  const run = async (id, rpc, args) => {
    setBusy(id); setError("");
    const { error: e } = await supabase.rpc(rpc, { p_token: token, p_task_id: id, ...args });
    if (e) setError(e.message?.replace(/^.*?: /, "") || "That didn't go through.");
    await load();
    setBusy(null);
  };
  const add = async () => {
    const sec = addSection || [...mySections][0] || "venue";
    if (!title.trim()) return;
    setBusy("add"); setError("");
    const { error: e } = await supabase.rpc("add_gig_task", { p_token: token, p_section: sec, p_title: title.trim() });
    if (e) setError("Couldn't add that task.");
    else { setTitle(""); setAdding(false); await load(); }
    setBusy(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
        <BottomTabs railOnly />
      </div>
    );
  }
  if (!gig) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <p className="text-white/50 text-lg">Event not found</p>
        <BottomTabs railOnly />
      </div>
    );
  }

  const eventTitle = eventTitle(gig);
  const dateLabel = gig.date ? new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "";
  const eyebrow = ["TASKS", dateLabel, (gig.venue || "").toUpperCase()].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen lg:h-screen bg-[#0d0d0d] text-[#f2f2f2] flex flex-col lg:overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="shrink-0 border-b border-[#1a1a1a] px-4 lg:px-6 py-3 lg:py-0 lg:h-[76px] flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => goBack(`/gig/web?token=${token}`)} aria-label="Back" className="w-10 h-10 rounded-[10px] bg-[#111] border border-[#262626] flex items-center justify-center text-white/75 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1 lg:flex-none">
          <div className="text-[11px] tracking-[0.12em] text-white/50 truncate" style={{ fontFamily: SCENE_MONO }}>{eyebrow}</div>
          <h1 className="text-[22px] lg:text-[26px] font-bold leading-tight truncate">{eventTitle}</h1>
        </div>
        <div className="w-full lg:w-auto lg:ml-auto flex flex-wrap items-center gap-2">
          {perms?.is_owner && (
            <button type="button" onClick={() => setAdding(true)} className="h-9 lg:h-10 px-3.5 rounded-[10px] flex items-center gap-1.5 text-[14px] font-bold text-[#0d0d0d]" style={{ background: "#8CFF3D" }}>
              <Plus className="w-4 h-4" /> Add task
            </button>
          )}
          <Link to={`/gig/web?token=${token}`} className="h-9 lg:h-10 px-3.5 rounded-[10px] flex items-center text-[14px] font-semibold bg-[#1a1a1a] border border-[#333] text-white/85 hover:text-white">Open web</Link>
        </div>
      </div>

      {error && <p className="mx-4 lg:mx-6 mt-3 text-[13px] text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</p>}

      {adding && (
        <div className="mx-4 lg:mx-6 mt-3 rounded-xl border border-[#2a2a2a] bg-[#141414] p-3 flex flex-wrap items-center gap-2.5">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(false); }} placeholder="What needs doing?"
            className="flex-1 min-w-[220px] h-10 bg-[#0d0d0d] border border-[#262626] rounded-lg px-3 text-white text-[15px] placeholder:text-white/30 outline-none focus:border-white/30" />
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => {
              const sel = (addSection || [...mySections][0] || "venue") === s.value;
              return (
                <button key={s.value} type="button" onClick={() => setAddSection(s.value)} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-full border"
                  style={sel ? { color: s.color, background: s.color + "22", borderColor: s.color + "66" } : { color: "rgba(255,255,255,0.5)", borderColor: "#262626" }}>{s.long}</button>
              );
            })}
          </div>
          <button type="button" onClick={() => { setAdding(false); setTitle(""); }} className="px-3 py-1.5 text-[13px] text-white/55">Cancel</button>
          <button type="button" onClick={add} disabled={!title.trim() || busy === "add"} className="px-4 h-9 rounded-lg text-[13px] font-bold text-[#0d0d0d] disabled:opacity-50" style={{ background: "#8CFF3D" }}>{busy === "add" ? "Adding..." : "Add"}</button>
        </div>
      )}

      <div className={`flex-1 min-h-0 grid gap-3.5 px-4 lg:px-5 py-4 grid-cols-1 ${columns.length > 1 ? "lg:grid-cols-3" : "lg:grid-cols-1 lg:max-w-3xl"}`}>
        {columns.map((col) => {
          const mine = mySections.has(col.value);
          const list = tasks.filter((t) => t.section === col.value && t.status !== "done");
          return (
            <section key={col.value} aria-label={col.long} className="min-h-0 flex flex-col rounded-xl bg-[#121212] overflow-hidden" style={{ border: `1px solid ${mine ? col.color + "88" : "#222"}` }}>
              <div className="h-[52px] shrink-0 flex items-center gap-2.5 px-3.5 border-b border-[#222]" style={{ background: col.color + "14" }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                <h2 className="text-[19px] font-bold tracking-[0.06em]" style={{ fontFamily: SCENE_FONT, color: col.color }}>{col.label}</h2>
                {mine && <span className="text-[10px] tracking-[0.1em] px-1.5 py-0.5 rounded text-[#0d0d0d]" style={{ fontFamily: SCENE_MONO, background: col.color }}>YOURS</span>}
                <span className="ml-auto text-[12px] text-white/60" style={{ fontFamily: SCENE_MONO }}>{openCount(col.value)} open</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
                {list.length === 0 && (
                  <div className="py-6 text-center">
                    <div className="mx-auto w-10 h-10 rounded-full border border-[#2a2a2a] flex items-center justify-center" style={{ color: col.color }}><ClipboardList className="w-5 h-5" /></div>
                    <p className="mt-2.5 text-[14px] text-white/55">No tasks for this profile.</p>
                  </div>
                )}
                {list.map((t) => {
                  const isDone = t.status === "done";
                  const yoursClaim = userId && t.claimed_by === userId;
                  const due = dueInfo(t.due_date);
                  const expanded = openId === t.id;
                  return (
                    <div key={t.id} className="rounded-[9px] bg-[#181818] border border-[#262626]" style={{ borderLeft: `4px solid ${col.color}`, opacity: isDone ? 0.55 : 1 }}>
                      <button type="button" onClick={() => setOpenId(expanded ? null : t.id)} aria-expanded={expanded} className="w-full text-left px-3 py-2.5 flex items-start gap-2.5">
                        <span className="mt-0.5 w-5 h-5 rounded-md shrink-0 flex items-center justify-center" style={{ border: `2px solid ${col.color}`, background: isDone ? col.color : "transparent" }}>
                          {isDone && <Check className="w-3.5 h-3.5 text-[#0d0d0d]" strokeWidth={3} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-semibold leading-snug" style={{ textDecoration: isDone ? "line-through" : "none" }}>{t.title}</span>
                          <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] tracking-[0.04em]" style={{ fontFamily: SCENE_MONO }}>
                            <span style={{ color: !isDone && due?.urgent ? "#FF6A00" : "#c6c6c6" }}>{isDone ? "DONE" : due ? due.label : "NO DUE DATE"}</span>
                            <span className="text-white/50">{t.claimed_by ? (yoursClaim ? "YOU" : (t.claimed_by_name || "CLAIMED").toUpperCase()) : "NOT CLAIMED"}</span>
                          </span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 pl-[42px] space-y-2.5">
                          {t.details && <p className="text-[14px] text-white/70 leading-snug whitespace-pre-wrap">{t.details}</p>}
                          {!isDone ? (
                            <div className="flex gap-2">
                              {!t.claimed_by && (
                                <button type="button" disabled={busy === t.id} onClick={() => run(t.id, "claim_gig_task", { p_claim: true })} className="flex-1 h-9 rounded-lg text-[13px] font-bold border border-[#333] text-white/85 disabled:opacity-60">Claim</button>
                              )}
                              {yoursClaim && (
                                <button type="button" disabled={busy === t.id} onClick={() => run(t.id, "claim_gig_task", { p_claim: false })} className="flex-1 h-9 rounded-lg text-[13px] font-bold border border-[#333] text-white/65 disabled:opacity-60">Let go</button>
                              )}
                              <button type="button" disabled={busy === t.id} onClick={() => run(t.id, "set_gig_task_status", { p_done: true })} className="flex-1 h-9 rounded-lg text-[13px] font-bold text-[#0d0d0d] disabled:opacity-60 flex items-center justify-center gap-1" style={{ background: col.color }}>
                                <Check className="w-4 h-4" /> Done
                              </button>
                            </div>
                          ) : (
                            <button type="button" disabled={busy === t.id} onClick={() => run(t.id, "set_gig_task_status", { p_done: false })} className="w-full h-9 rounded-lg text-[13px] font-bold border border-[#333] text-white/70 disabled:opacity-60">Reopen</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <BottomTabs railOnly />
    </div>
  );
}
