import React, { cloneElement, useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Check, Copy, Share2, X, UserPlus, Link2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { shareLink } from "@/lib/share";
import useIsDesktop from "@/hooks/useIsDesktop";
import { isProfileOpen } from "@/lib/hiddenProfiles";

const G = "#8CFF3D";

// Who can be invited, in the profile-color (rainbow) order: red, yellow,
// green, blue, violet. Colors + icons come from accountTypeStyle so the
// pads match the Pilot header, the progress bar and the event web.
const ROLE_ORDER = ["band", "manager", "venue", "engineer", "lighting", "promoter", "booking_agent"];
const ROLES = ROLE_ORDER.map((value) => ({ value, ...ACCOUNT_TYPE_STYLES[value] }));
const roleOf = (v) => ROLES.find((r) => r.value === v) || { value: v, label: v, color: "#9A9A9A", icon: UserPlus };

// Every invited role lands on one home section (unlocked for them). The
// owner can also hand them edit access to other sections, per invite.
const SECTIONS = [
  { value: "venue", label: "Venue", color: ACCOUNT_TYPE_STYLES.venue.color },
  { value: "promoter", label: "Promoter", color: ACCOUNT_TYPE_STYLES.promoter.color },
  { value: "booking_agent", label: "Booking Agent", color: ACCOUNT_TYPE_STYLES.booking_agent.color },
  { value: "manager", label: "Manager / Artist", color: ACCOUNT_TYPE_STYLES.manager.color },
  { value: "engineer", label: "Audio / Lighting", color: ACCOUNT_TYPE_STYLES.engineer.color },
];
const ROLE_HOME_SECTION = {
  venue: "venue", promoter: "promoter", booking_agent: "booking_agent",
  manager: "manager", band: "manager", engineer: "engineer", lighting: "engineer",
};

const inviteUrl = (token) => `${window.location.origin}/gig/shared?invite=${token}`;
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

function Label({ children, className = "" }) {
  return <div className={`text-[11.5px] tracking-[0.14em] text-white/55 ${className}`} style={{ fontFamily: SCENE_MONO }}>{children}</div>;
}

// "Invite profiles & users": pick roles (each in its profile color), name
// them, optionally hand over extra sections, generate. New links copy
// themselves; everyone already invited sits in "On this event" with
// joined / waiting, copy-again and cancel. Phone = bottom sheet, desktop
// = two-column pop-up like Fan page settings.
// `elevated` lifts it above full-screen overlays (Gig Web over Home, z-60).
export default function InviteSheet({ showId, trigger, elevated = false }) {
  const { toast } = useToast();
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [labels, setLabels] = useState({});
  const [granted, setGranted] = useState({}); // role -> extra sections
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState(null); // null = loading
  const [fresh, setFresh] = useState([]); // ids generated this visit
  const [copied, setCopied] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);

  const load = useCallback(async () => {
    if (!showId) return;
    const { data, error: e } = await supabase
      .from("gig_invites")
      .select("id, invite_token, invited_role, label, status, accepted_at, created_at, granted_sections")
      .eq("show_id", showId)
      .order("created_at", { ascending: false });
    setInvites(e ? [] : data || []);
  }, [showId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const close = () => {
    setOpen(false);
    setSelected([]); setLabels({}); setGranted({}); setFresh([]);
    setError(""); setConfirmCancel(null); setInvites(null);
  };
  const openSheet = () => {
    if (!showId) {
      toast({ title: "Nothing to share", description: "Fill in and save the event before inviting anyone." });
      return;
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open || !desktop) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRole = (v) => setSelected((p) => (p.includes(v) ? p.filter((r) => r !== v) : [...p, v]));
  const toggleSection = (role, s) => setGranted((p) => {
    const cur = p[role] || [];
    return { ...p, [role]: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] };
  });

  const copy = async (url, key) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
      return true;
    } catch { return false; }
  };

  const generate = async () => {
    if (!selected.length || !showId) return;
    setGenerating(true); setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = selected.map((role) => ({
        show_id: showId,
        invited_role: role,
        label: labels[role]?.trim() || null,
        created_by: user.id,
        granted_sections: granted[role] || [],
      }));
      const { data, error: e } = await supabase.from("gig_invites").insert(rows).select();
      if (e) throw e;
      const made = data || [];
      setInvites((p) => [...made, ...(p || [])]);
      setFresh((p) => [...made.map((i) => i.id), ...p]);
      setSelected([]); setLabels({}); setGranted({});
      // One link: put it straight on the clipboard so it's ready to paste.
      if (made.length === 1 && (await copy(inviteUrl(made[0].invite_token), made[0].id))) {
        toast({ title: "Invite link copied", description: `${roleOf(made[0].invited_role).label}${made[0].label ? ` · ${made[0].label}` : ""}: paste it to send.` });
      }
    } catch (e) {
      console.error(e);
      setError("Couldn't make the links. Check your connection and try again.");
    }
    setGenerating(false);
  };

  const cancelInvite = async (inv) => {
    const { error: e } = await supabase.from("gig_invites").delete().eq("id", inv.id);
    setConfirmCancel(null);
    if (e) { toast({ title: "Couldn't cancel that invite" }); return; }
    setInvites((p) => (p || []).filter((i) => i.id !== inv.id));
    setFresh((p) => p.filter((id) => id !== inv.id));
  };

  const freshInvites = (invites || []).filter((i) => fresh.includes(i.id));
  const copyAllNew = async () => {
    const text = freshInvites.map((i) => `${roleOf(i.invited_role).label}${i.label ? ` (${i.label})` : ""}: ${inviteUrl(i.invite_token)}`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied("all"); setTimeout(() => setCopied(null), 1600); } catch { /* ignore */ }
  };

  const counts = {};
  for (const i of invites || []) {
    const c = (counts[i.invited_role] ||= { joined: 0, waiting: 0 });
    if (i.status === "accepted") c.joined++; else c.waiting++;
  }
  const joinedTotal = (invites || []).filter((i) => i.status === "accepted").length;
  const waitingTotal = (invites || []).length - joinedTotal;

  // ---------- pieces ----------
  const rolePads = (
    <div className={`grid ${desktop ? "grid-cols-2" : "grid-cols-2"} gap-2`}>
      {ROLES.filter((r) => isProfileOpen(r.value)).map((r) => {
        const on = selected.includes(r.value);
        const Icon = r.icon;
        const c = counts[r.value];
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => toggleRole(r.value)}
            aria-pressed={on}
            className="relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
            style={{
              background: on ? r.color + "1f" : "#141414",
              border: `1.5px solid ${on ? r.color : "#262626"}`,
            }}
          >
            <span className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center" style={{ background: on ? r.color : r.color + "1a" }}>
              <Icon className="w-4 h-4" style={{ color: on ? "#0d0d0d" : r.color }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block ${desktop ? "text-[16px] truncate" : "text-[15px]"} font-semibold leading-tight`} style={{ color: on ? r.color : "#fff" }}>{r.label}</span>
              {c && (
                <span className="block text-[11px] tracking-[0.06em] leading-tight mt-0.5 text-white/45" style={{ fontFamily: SCENE_MONO }}>
                  {[c.joined && `${c.joined} JOINED`, c.waiting && `${c.waiting} ${desktop ? "WAITING" : "WAIT"}`].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            {on && <Check className="w-4 h-4 shrink-0" style={{ color: r.color }} />}
          </button>
        );
      })}
    </div>
  );

  const setupCards = selected.length > 0 && (
    <div className="mt-4 space-y-2.5">
      {selected.map((role) => {
        const r = roleOf(role);
        const home = ROLE_HOME_SECTION[role];
        const homeLabel = SECTIONS.find((s) => s.value === home)?.label;
        const picked = granted[role] || [];
        return (
          <div key={role} className="rounded-xl p-3" style={{ background: "#121212", border: `1px solid ${r.color}55`, borderLeft: `3px solid ${r.color}` }}>
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold" style={{ color: r.color }}>{r.label}</span>
              <span className="text-[12px] text-white/45">fills in {homeLabel}</span>
            </div>
            <input
              value={labels[role] || ""}
              onChange={(e) => setLabels((p) => ({ ...p, [role]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
              placeholder="Name (optional), e.g. Joe's Bar or a person"
              className="mt-2 w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[16px] text-white placeholder:text-white/30 outline-none focus:border-white/40"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-white/45 mr-0.5">Also edits:</span>
              {SECTIONS.filter((s) => s.value !== home && isProfileOpen(s.value)).map((s) => {
                const on = picked.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleSection(role, s.value)}
                    aria-pressed={on}
                    className="text-[13px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                    style={on
                      ? { background: s.color, color: "#0d0d0d", border: `1px solid ${s.color}` }
                      : { color: s.color, border: `1px solid ${s.color}55`, background: "transparent" }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const generateBtn = (
    <>
      {error && <p className="mb-2 text-[14px] text-red-400">{error}</p>}
      <button
        type="button"
        onClick={generate}
        disabled={!selected.length || generating}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] text-base font-bold tracking-[0.06em] transition-opacity disabled:opacity-35"
        style={{ background: G, color: "#0d0d0d" }}
      >
        <Link2 className="w-4 h-4" />
        {generating ? "MAKING LINKS..." : selected.length > 1 ? `MAKE ${selected.length} INVITE LINKS` : "MAKE INVITE LINK"}
      </button>
    </>
  );

  const inviteRow = (inv) => {
    const r = roleOf(inv.invited_role);
    const Icon = r.icon;
    const joined = inv.status === "accepted";
    const isNew = fresh.includes(inv.id);
    const url = inviteUrl(inv.invite_token);
    const extra = (inv.granted_sections || []).map((s) => SECTIONS.find((x) => x.value === s)).filter(Boolean);
    return (
      <div
        key={inv.id}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
        style={{ background: isNew ? r.color + "12" : "#121212", border: `1px solid ${isNew ? r.color + "88" : "#222"}`, borderLeft: `3px solid ${r.color}` }}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: r.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[15px] font-semibold text-white truncate">{inv.label || r.label}</span>
            {inv.label && <span className="text-[12px] shrink-0" style={{ color: r.color }}>{r.label}</span>}
            {isNew && <span className="text-[10px] font-bold tracking-[0.1em] px-1.5 py-[1px] rounded shrink-0" style={{ background: r.color, color: "#0d0d0d", fontFamily: SCENE_MONO }}>NEW</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] tracking-[0.04em]" style={{ fontFamily: SCENE_MONO }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: joined ? r.color : "transparent", border: `1.5px solid ${r.color}` }} />
            <span className="text-white/55">{joined ? `JOINED ${shortDate(inv.accepted_at).toUpperCase()}` : "LINK NOT USED YET"}</span>
            {extra.length > 0 && (
              <span className="flex items-center gap-1 ml-1">
                <span className="text-white/35">+</span>
                {extra.map((s) => <span key={s.value} title={`Also edits ${s.label}`} className="w-2 h-2 rounded-full" style={{ background: s.color }} />)}
              </span>
            )}
          </div>
        </div>
        {!joined && (confirmCancel === inv.id ? (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => cancelInvite(inv)} className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold tracking-[0.06em] bg-red-500/15 text-red-400 border border-red-500/40">CANCEL LINK</button>
            <button type="button" onClick={() => setConfirmCancel(null)} className="px-2 py-1.5 rounded-lg text-[12px] font-bold tracking-[0.06em] text-white/55">KEEP</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => copy(url, inv.id)}
              title="Copy link"
              className="h-9 px-2.5 flex items-center gap-1 rounded-lg text-[12px] font-bold tracking-[0.06em]"
              style={copied === inv.id ? { background: r.color, color: "#0d0d0d" } : { background: r.color + "1a", color: r.color, border: `1px solid ${r.color}55` }}
            >
              {copied === inv.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {desktop && (copied === inv.id ? "COPIED" : "COPY")}
            </button>
            {typeof navigator !== "undefined" && navigator.share && (
              <button type="button" onClick={() => shareLink({ url, title: `${r.label} invite` })} title="Share" className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-white/60 hover:text-white">
                <Share2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={() => setConfirmCancel(inv.id)} title="Cancel this link" className="w-9 h-9 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const roster = (
    <div>
      <div className="flex items-center gap-2">
        <Label className="flex-1">ON THIS EVENT</Label>
        {invites && invites.length > 0 && (
          <span className="text-[11.5px] tracking-[0.08em] text-white/55" style={{ fontFamily: SCENE_MONO }}>
            {joinedTotal} JOINED · {waitingTotal} WAITING
          </span>
        )}
      </div>
      {freshInvites.length > 1 && (
        <button
          type="button"
          onClick={copyAllNew}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-bold tracking-[0.06em]"
          style={copied === "all" ? { background: G, color: "#0d0d0d" } : { background: "rgba(140,255,61,0.1)", border: "1px solid rgba(140,255,61,0.4)", color: G }}
        >
          {copied === "all" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied === "all" ? "COPIED" : `COPY ALL ${freshInvites.length} NEW LINKS`}
        </button>
      )}
      <div className="mt-2 space-y-1.5">
        {invites === null && <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>}
        {invites && invites.length === 0 && (
          <p className="py-4 text-[14px] leading-relaxed text-white/45">Nobody's been invited yet. Pick who you're bringing in and make their link. Each link opens their own section of this event.</p>
        )}
        {invites && invites.map(inviteRow)}
      </div>
    </div>
  );

  const header = (
    <div className="flex items-center gap-2.5">
      <UserPlus className="w-5 h-5 shrink-0" style={{ color: G }} />
      <span className="text-2xl font-bold flex-1 text-white">Invite profiles & users</span>
      <button type="button" onClick={close} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
    </div>
  );

  const triggerEl = trigger ? cloneElement(trigger, {
    onClick: (e) => { trigger.props.onClick?.(e); openSheet(); },
  }) : null;

  if (desktop) {
    return (
      <>
        {triggerEl}
        {open && (
          <div className={`fixed inset-0 ${elevated ? "z-[85]" : "z-[70]"} flex items-center justify-center p-4`} style={{ fontFamily: SCENE_FONT }}>
            <div className="absolute inset-0 bg-black/65" onClick={close} />
            <div role="dialog" aria-modal="true" aria-label="Invite profiles and users" className="relative w-full max-w-[1000px] h-[min(88vh,720px)] flex flex-col bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="px-6 pt-4 pb-3 border-b border-[#1c1c1c]">
                {header}
                <p className="mt-1 text-[14px] font-medium leading-tight text-white/50">Pick who you're bringing in. Each gets their own link that unlocks their section of this event.</p>
              </div>
              <div className="flex-1 min-h-0 grid grid-cols-[1fr_440px]">
                <div className="min-h-0 flex flex-col px-6 pb-5">
                  <div className="flex-1 min-h-0 overflow-y-auto pt-4">
                    <Label className="mb-2">WHO ARE YOU BRINGING IN</Label>
                    {rolePads}
                    {setupCards}
                  </div>
                  <div className="pt-3">{generateBtn}</div>
                </div>
                <div className="min-h-0 overflow-y-auto border-l border-[#1c1c1c] bg-[#0a0a0a] px-5 py-4">{roster}</div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {triggerEl}
      <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <SheetContent
          side="bottom"
          overlayClassName={elevated ? "z-[79]" : undefined}
          className={`bg-[#0d0d0d] border-[#222] rounded-t-2xl max-h-[88vh] overflow-y-auto p-0 [&>button:last-child]:hidden ${elevated ? "z-[80]" : ""}`}
          style={{ fontFamily: SCENE_FONT }}
        >
          <div className="p-5 max-w-lg mx-auto">
            {header}
            <p className="mt-1 mb-4 text-[14px] font-medium leading-tight text-white/50">Each person gets their own link that unlocks their section of this event.</p>
            <Label className="mb-2">WHO ARE YOU BRINGING IN</Label>
            {rolePads}
            {setupCards}
            <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-3 mt-1 bg-[#0d0d0d]/95 backdrop-blur">{generateBtn}</div>
            <div className="mt-3">{roster}</div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
