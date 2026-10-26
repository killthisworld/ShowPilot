import React, { useState } from "react";
import { Check, ChevronDown, ChevronRight, UserPlus } from "lucide-react";
import InviteSheet from "@/components/showpilot/InviteSheet";
import { buildRunOfShow } from "@/components/showpilot/RoleWorkspace";
import { claimText } from "@/components/showpilot/TaskSheet";
import { sectionOf } from "@/lib/eventRoles";
import { SCENE_MONO } from "@/lib/sceneStyle";

// The desktop event Board when no profile is picked (job 120): the day's run
// of show, then one To do list - conflicts, requests, open tasks and empty
// profiles - most urgent first. Every row takes you to the page where it
// gets done: a request opens that profile's Requests page, a task opens its
// task box on that profile, an empty profile opens Invite, a time opens the
// Schedule or Lineup page it came from.
const G = "#8CFF3D";
const AMBER = "#FF6A00";
const lbl = "text-[11px] tracking-[0.14em] text-white/50";
const BASE = { venue: "#60A5FA", manager: "#F87171", band: "#F87171", engineer: "#8CFF3D", lighting: "#8CFF3D" };

const Pill = ({ children, style }) => (
  <span className="shrink-0 w-[84px] text-center text-[10px] font-bold tracking-[0.1em] py-[3px] rounded" style={{ fontFamily: SCENE_MONO, ...style }}>{children}</span>
);

// Profiles that share a section are one To do row (job 172): Manager and
// Artist, Audio and Lighting. Open the row to invite each one, or mark the
// ones this event won't have "Not needed".
const GROUPS = [
  { key: "venue", label: "Venue", roles: ["venue"] },
  { key: "manager", label: "Manager / Artist", roles: ["manager", "band"] },
  { key: "engineer", label: "Audio / Lighting", roles: ["engineer", "lighting"] },
];

export default function BoardOverview({ gig, nodes = [], isOwner = false, userId = null, canWork = () => false, onGo, onOpenTask, onClaim, onDone, onInvitesChanged = null, onSetNotNeeded = null, wide = false }) {
  const [busy, setBusy] = useState(null);
  const [openGroup, setOpenGroup] = useState(null);
  const node = (role) => nodes.find((n) => n.role === role);
  const roleFor = (section) => nodes.find((n) => sectionOf(n.role) === section)?.role || section;
  // The profile's own color even when nobody's on it yet (the web draws those gray).
  const colorOf = (role) => BASE[role] || node(role)?.style?.color || "#9A9A9A";
  const labelOf = (role) => node(role)?.style?.label || role;

  // ---- run of show ----
  const ros = buildRunOfShow(gig);
  const rosTarget = (r) => (r.kind === "set" || r.kind === "travel" ? ["manager", "lineup"] : ["venue", "schedule"]);

  // ---- to do ----
  const reqs = (gig.requirements || []).filter((r) => r.status === "conflict" || r.status === "requested")
    .sort((a, b) => (a.status === "conflict" ? 0 : 1) - (b.status === "conflict" ? 0 : 1));
  const tasks = (gig.tasks || []).filter((t) => t.status !== "done")
    .sort((a, b) => Number(b.claimed_by === userId) - Number(a.claimed_by === userId));
  // Profiles nobody's on: INVITE until an invite goes out, then orange
  // PENDING until someone accepts (then the row leaves).
  const groups = isOwner ? GROUPS.map((g) => {
    const members = g.roles.map(node).filter(Boolean);
    const open = members.filter((n) => !n.claimed && !n.notNeeded);
    return { ...g, members, open, pending: open.length > 0 && open.every((n) => n.invited) };
  }) : [];
  const shown = groups.filter((g) => g.open.length > 0);
  const skipped = groups.flatMap((g) => g.members.filter((n) => n.notNeeded));
  const total = reqs.length + tasks.length + shown.length;

  const act = async (e, id, fn) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(id);
    try { await fn(); } catch (err) { console.error(err); }
    setBusy(null);
  };
  const rowCls = "w-full flex items-center gap-3 px-3 py-2.5 text-left bg-[#121212] hover:bg-[#181818] transition-colors";
  const go = <span className="shrink-0 flex items-center gap-0.5 text-[11px] tracking-[0.08em] text-white/40" style={{ fontFamily: SCENE_MONO }}>OPEN <ChevronRight className="w-3.5 h-3.5" /></span>;

  // wide: the flight log is folded away (job 178), so the run of show and
  // the To do sit side by side instead of stacking.
  return (
    <div className={wide ? "grid grid-cols-2 gap-5 items-start" : "flex flex-col gap-5"}>
      <section>
        <div className={`${lbl} mb-2`} style={{ fontFamily: SCENE_MONO }}>RUN OF SHOW</div>
        {ros.length ? (
          <div className="rounded-[10px] border border-[#242424] divide-y divide-[#1f1f1f] overflow-hidden">
            {ros.map((r, i) => {
              const [role, key] = rosTarget(r);
              const c = r.kind === "curfew" ? "#F87171" : colorOf(role);
              return (
                <button key={i} type="button" onClick={() => onGo(role, key)} className="w-full grid grid-cols-[88px_10px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03]">
                  <span className="text-[13px] text-white/75" style={{ fontFamily: SCENE_MONO }}>{r.time || "—"}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                  <span className="text-[15px] truncate" style={r.kind === "curfew" ? { color: "#FCA5A5" } : undefined}>{r.label || "—"}</span>
                  <span className="text-[10px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: colorOf(role) }}>{r.kind === "set" ? "ARTIST" : labelOf(role).toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <button type="button" onClick={() => onGo("venue", "schedule")} className="w-full flex items-center gap-2 px-3 py-3 rounded-[10px] border border-dashed border-[#2a2a2a] text-left text-[14px] text-white/45 hover:text-white">
            No times yet. Add load-in, doors and curfew on the Venue's Schedule.<ChevronRight className="w-4 h-4 ml-auto" />
          </button>
        )}
      </section>

      <section>
        <div className={`${lbl} mb-2 flex items-center`} style={{ fontFamily: SCENE_MONO }}>TO DO<span className="ml-auto text-white/35">{total ? `${total} OPEN` : ""}</span></div>
        {total === 0 ? (
          <p className="px-3 py-3 rounded-[10px] border border-[#242424] text-[14px] text-white/45 flex items-center gap-2"><Check className="w-4 h-4" style={{ color: G }} /> Nothing waiting on anyone.</p>
        ) : (
          <div className="rounded-[10px] border border-[#242424] divide-y divide-[#1f1f1f] overflow-hidden">
            {reqs.map((r) => {
              const role = roleFor(r.section);
              const conflict = r.status === "conflict";
              return (
                <button key={`r-${r.id}`} type="button" onClick={() => onGo(role, "requests")} className={rowCls}>
                  <Pill style={conflict ? { background: AMBER, color: "#0d0d0d" } : { background: "#fff", color: "#0d0d0d" }}>{conflict ? "CONFLICT" : "REQUEST"}</Pill>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] truncate">{r.name}{r.value ? ` · ${r.value}` : ""}</span>
                    <span className="block text-[10.5px] tracking-[0.08em] mt-0.5" style={{ fontFamily: SCENE_MONO, color: colorOf(role) }}>{labelOf(role).toUpperCase()} · REQUESTS</span>
                  </span>
                  {go}
                </button>
              );
            })}
            {tasks.map((t) => {
              const role = roleFor(t.section);
              const work = canWork(t.section);
              const mine = !!userId && t.claimed_by === userId;
              return (
                <div key={`t-${t.id}`} role="button" tabIndex={0} onClick={() => { onGo(role); onOpenTask(t.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGo(role); onOpenTask(t.id); } }} className={`${rowCls} cursor-pointer`}>
                  <Pill style={{ background: "#3b2a12", color: "#FF9A3D", border: `1px solid ${AMBER}66` }}>TASK</Pill>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] truncate">{t.title}</span>
                    <span className="block text-[10.5px] tracking-[0.08em] mt-0.5 truncate" style={{ fontFamily: SCENE_MONO, color: colorOf(role) }}>
                      {labelOf(role).toUpperCase()} · {t.claimed_by ? (mine ? "YOURS" : `CLAIMED · ${String(claimText(t, userId) || "").toUpperCase()}`) : "OPEN"}
                    </span>
                  </span>
                  {work && !t.claimed_by && (
                    <button type="button" disabled={busy === t.id} onClick={(e) => act(e, t.id, () => onClaim(t.id))} className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] border border-[#2a2a2a] text-white/80 hover:text-white disabled:opacity-50">CLAIM</button>
                  )}
                  {work && (
                    <button type="button" disabled={busy === t.id} onClick={(e) => act(e, t.id, () => onDone(t.id))} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] disabled:opacity-50" style={{ background: G, color: "#0d0d0d" }}><Check className="w-3.5 h-3.5" /> DONE</button>
                  )}
                  {!work && go}
                </div>
              );
            })}
            {gig?.id && shown.map((g) => {
              const expanded = openGroup === g.key;
              const c = colorOf(g.roles[0]);
              const names = g.open.map((n) => labelOf(n.role)).join(" · ");
              return (
                <div key={`g-${g.key}`}>
                  <button type="button" onClick={() => setOpenGroup(expanded ? null : g.key)} aria-expanded={expanded} className={rowCls}>
                    <Pill style={g.pending ? { background: AMBER, color: "#0d0d0d" } : { background: "#2a2a2a", color: "#ddd" }}>{g.pending ? "PENDING" : "INVITE"}</Pill>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] truncate">{g.pending ? `${g.label} invite sent` : `${g.label} has nobody yet`}</span>
                      <span className="block text-[10.5px] tracking-[0.08em] mt-0.5 truncate" style={{ fontFamily: SCENE_MONO, color: g.pending ? AMBER : c }}>
                        {names.toUpperCase()}{g.pending ? " · WAITING TO ACCEPT" : g.members.length > 1 ? " · STILL NEEDED" : ""}
                      </span>
                    </span>
                    <ChevronDown className={`w-4 h-4 shrink-0 text-white/50 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded && (
                    <div className="px-3 pb-2.5 pt-1 bg-[#101010] flex flex-col gap-1.5">
                      {g.members.filter((n) => !n.claimed).map((n) => (
                        <div key={n.role} className="flex items-center gap-2 pl-[96px]">
                          <span className="flex-1 min-w-0 text-[14px] truncate" style={{ color: n.notNeeded ? "rgba(255,255,255,0.4)" : "#fff" }}>
                            {labelOf(n.role)}
                            <span className="ml-2 text-[10px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color: n.notNeeded ? "rgba(255,255,255,0.35)" : n.invited ? AMBER : colorOf(n.role) }}>
                              {n.notNeeded ? "NOT NEEDED" : n.invited ? "PENDING" : "NOBODY YET"}
                            </span>
                          </span>
                          {!n.notNeeded && (
                            <InviteSheet showId={gig.id} elevated preselect={n.invited ? null : n.role} onChanged={onInvitesChanged} trigger={
                              <button type="button" className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] border border-[#2a2a2a] text-white/85 hover:text-white">
                                <UserPlus className="w-3.5 h-3.5" /> {n.invited ? "INVITES" : "INVITE"}
                              </button>
                            } />
                          )}
                          {onSetNotNeeded && (
                            <button type="button" disabled={busy === `nn-${n.role}`} onClick={(e) => act(e, `nn-${n.role}`, () => onSetNotNeeded(n.role, !n.notNeeded))}
                              className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.06em] border border-[#2a2a2a] text-white/60 hover:text-white disabled:opacity-50">
                              {n.notNeeded ? "NEEDED AFTER ALL" : "NOT NEEDED"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {isOwner && onSetNotNeeded && skipped.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] tracking-[0.08em] text-white/40" style={{ fontFamily: SCENE_MONO }}>
            NOT NEEDED:
            {skipped.map((n) => (
              <button key={n.role} type="button" disabled={busy === `nn-${n.role}`} onClick={(e) => act(e, `nn-${n.role}`, () => onSetNotNeeded(n.role, false))}
                title={`Mark ${labelOf(n.role)} needed`} className="px-2 py-0.5 rounded-full border border-[#2a2a2a] text-white/60 hover:text-white disabled:opacity-50">
                {labelOf(n.role).toUpperCase()} · UNDO
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
