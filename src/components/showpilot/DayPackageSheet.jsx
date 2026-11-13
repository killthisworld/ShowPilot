import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Check, Copy, KeyRound, ListMusic, ListOrdered, Lock, Share2, Ticket, UserRound, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { PIN_LABEL } from "@/lib/eventPdfs";

// Make and manage Day-of package links (job 320): pick the sheets, name the
// link ("Door", "Crew"), add a passcode if you like, then copy or share it.
// Links end the morning after the show; Turn off ends one now. The server
// checks who's allowed (create_day_package: the venue side, the manager /
// artist side, the owner).

const G = "#8CFF3D";
const SHEETS = [
  ["schedule", CalendarClock, "Times, address, load-in, parking", true],
  ["lineup", ListOrdered, "Acts in order with set times", true],
  ["setlist", ListMusic, "Each act's songs, big type", false],
  ["contacts", UserRound, "Names, phones and emails of everyone on the event", false],
  ["guests", Ticket, "Names and plus-ones, for the door", false],
];
const NAMES = ["Day of show", "Crew", "Door", "Security"];
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const linkFor = (code) => `${window.location.origin}/dp/${code}`;
const when = (t) => new Date(t).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function DayPackageSheet({ gig, color = G, onClose }) {
  const token = gig.share_token;
  const [links, setLinks] = useState(null);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("Day of show");
  const [pick, setPick] = useState(() => SHEETS.filter((s) => s[3]).map((s) => s[0]));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [made, setMade] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_day_packages", { p_token: token });
    if (error) { console.error(error); setLinks([]); return; }
    setLinks(Array.isArray(data) ? data : []);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { if (links && !links.some((l) => !l.revoked && new Date(l.expires_at) > new Date())) setMaking(true); }, [links]);

  const toggle = (k) => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const flash = (k) => { setCopied(k); setTimeout(() => setCopied(""), 1600); };
  const copy = async (c) => { if (await copyText(linkFor(c))) flash(c); };
  const share = async (l) => {
    const url = linkFor(l.code);
    const text = `${gig.event_name || gig.band_name || "Show"} · day-of info${l.passcode ? ` (code: ${l.passcode})` : ""}`;
    if (navigator.share) {
      try { await navigator.share({ title: text, text, url }); return; }
      catch (e) { if (e?.name === "AbortError") return; }
    }
    copy(l.code);
  };

  const make = async () => {
    if (!pick.length) { setErr("Pick at least one sheet."); return; }
    if (code.trim() && (code.trim().length < 3 || code.trim().length > 20)) { setErr("The code should be 3 to 20 characters."); return; }
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("create_day_package", { p_token: token, p_label: name.trim() || "Day of show", p_sheets: pick, p_passcode: code.trim() || null, p_expires_at: null });
    setBusy(false);
    if (error) { console.error(error); setErr(/venue and the manager/i.test(error.message || "") ? "Only the venue and the manager / artist side can make these." : "Couldn't make the link. Check your signal and try again."); return; }
    setMade({ ...data, label: name.trim() || "Day of show", passcode: code.trim() || "" });
    // The next link starts fresh: default name and sheets, no code.
    setMaking(false); setCode(""); setName("Day of show"); setPick(SHEETS.filter((x) => x[3]).map((x) => x[0]));
    load();
  };
  const turnOff = async (id) => {
    const { error } = await supabase.rpc("revoke_day_package", { p_id: id });
    if (error) { console.error(error); setErr("Couldn't turn that link off. Try again."); return; }
    if (made?.id === id) setMade(null);
    load();
  };

  const live = (links || []).filter((l) => !l.revoked && new Date(l.expires_at) > new Date());
  const btn = "h-10 px-3.5 rounded-full flex items-center gap-1.5 text-[13.5px] font-bold";
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-black/70" role="dialog" aria-modal="true" aria-label="Day-of package" onClick={onClose}>
      <div className="w-full sm:max-w-[520px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#121212] border border-[#262626] p-5 text-white" style={{ fontFamily: SCENE_FONT, paddingBottom: "max(20px, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <KeyRound className="w-5 h-5" style={{ color }} />
          <h2 className="flex-1 text-[22px] font-bold leading-none">Day-of package</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="mt-2 mb-0 text-[14px] text-white/55">A link for people who aren't on Show Pilot: door staff, security, crew, the driver. It opens the sheets you pick, always up to date, and ends the morning after the show.</p>

        {made && (
          <div className="mt-4 rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: color + "14", border: `1px solid ${color}55` }}>
            <div className="text-[14px] font-semibold flex items-center gap-2" style={{ color }}><Check className="w-4 h-4" /> "{made.label}" link is ready</div>
            <div className="text-[13px] text-white/75 break-all" style={{ fontFamily: SCENE_MONO }}>{linkFor(made.code)}</div>
            {made.passcode && <div className="text-[12.5px] text-white/60">Code: <span className="font-bold text-white">{made.passcode}</span> (send it with the link)</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => share(made)} className={`${btn} text-[#0d0d0d]`} style={{ background: color }}><Share2 className="w-4 h-4" /> Send</button>
              <button type="button" onClick={() => copy(made.code)} className={`${btn} border`} style={{ color, borderColor: color + "66" }}>{copied === made.code ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}</button>
            </div>
          </div>
        )}

        {making ? (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <div className="text-[11px] tracking-[0.12em] text-white/50 mb-1.5" style={{ fontFamily: SCENE_MONO }}>NAME</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {NAMES.map((n) => (
                  <button key={n} type="button" onClick={() => setName(n)} className="h-9 px-3 rounded-full border text-[13px] font-semibold" style={name === n ? { background: color, borderColor: color, color: "#0d0d0d" } : { borderColor: "#2e2e2e", color: "rgba(255,255,255,0.75)" }}>{n}</button>
                ))}
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Link name" className="w-full h-11 px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-[16px] outline-none focus:border-white/40" />
            </div>
            <div>
              <div className="text-[11px] tracking-[0.12em] text-white/50 mb-1.5" style={{ fontFamily: SCENE_MONO }}>WHAT'S IN IT</div>
              <div className="flex flex-col gap-1.5">
                {SHEETS.map(([k, Icon, sub]) => {
                  const on = pick.includes(k);
                  return (
                    <button key={k} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(k)}
                      className="min-h-[54px] rounded-xl border px-3 flex items-center gap-3 text-left" style={{ borderColor: on ? color + "88" : "#232323", background: on ? color + "10" : "#0b0b0b" }}>
                      <Icon className="w-[18px] h-[18px] shrink-0" style={{ color: on ? color : "rgba(255,255,255,0.45)" }} />
                      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{PIN_LABEL[k]}</span><span className="block text-[12.5px] text-white/50">{sub}</span></span>
                      <span className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0" style={on ? { background: color, borderColor: color } : { borderColor: "#444" }}>{on && <Check className="w-4 h-4 text-[#0d0d0d]" strokeWidth={3} />}</span>
                    </button>
                  );
                })}
              </div>
              {(pick.includes("contacts") || pick.includes("guests")) && <p className="m-0 mt-2 text-[12.5px] text-[#FFB547]">Phone numbers, emails and guest names will be visible to anyone with the link. A code keeps it to the people you give it to.</p>}
            </div>
            <div>
              <div className="text-[11px] tracking-[0.12em] text-white/50 mb-1.5 flex items-center gap-1.5" style={{ fontFamily: SCENE_MONO }}><Lock className="w-3 h-3" /> CODE (OPTIONAL)</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder="e.g. 4417" autoCapitalize="none" autoComplete="off" aria-label="Code (optional)" className="w-full h-11 px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-[16px] outline-none focus:border-white/40" />
            </div>
            {err && <p role="alert" className="m-0 text-[13.5px] text-red-400">{err}</p>}
            <div className="flex gap-2">
              {live.length > 0 && <button type="button" onClick={() => { setMaking(false); setErr(""); }} className="flex-1 h-12 rounded-xl bg-[#1f1f1f] text-white/80 text-[15px] font-semibold">Cancel</button>}
              <button type="button" onClick={make} disabled={busy || !pick.length} className="flex-[2] h-12 rounded-xl text-[16px] font-bold text-[#0d0d0d] disabled:opacity-40" style={{ background: color }}>{busy ? "Making…" : "Make the link"}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setMaking(true); setMade(null); }} className="mt-4 w-full h-12 rounded-xl border-[1.5px] border-dashed text-[15px] font-semibold" style={{ borderColor: color + "66", color }}>+ New link</button>
        )}

        {links === null ? null : live.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] tracking-[0.12em] text-white/50 mb-1.5" style={{ fontFamily: SCENE_MONO }}>LINKS FOR THIS EVENT</div>
            <div className="flex flex-col gap-2">
              {live.map((l) => (
                <div key={l.id} className="rounded-xl bg-[#0b0b0b] border border-[#232323] p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-[15px] font-bold truncate">{l.label}{l.has_passcode && <Lock className="inline w-3.5 h-3.5 ml-1.5 -mt-0.5 text-white/50" aria-label="Has a code" />}</span>
                    <span className="text-[11px] text-white/45 shrink-0" style={{ fontFamily: SCENE_MONO }}>{l.views ? `OPENED ${l.views}×` : "NOT OPENED YET"}</span>
                  </div>
                  <div className="text-[12.5px] text-white/55">{(l.sheets || []).map((s) => PIN_LABEL[s]).join(" · ")}</div>
                  <div className="text-[12px] text-white/40">Ends {when(l.expires_at)}</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => share(l)} className={`${btn} border`} style={{ color, borderColor: color + "66" }}><Share2 className="w-4 h-4" /> Send</button>
                    <button type="button" onClick={() => copy(l.code)} className={`${btn} border border-[#333] text-white/80`}>{copied === l.code ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}</button>
                    <button type="button" onClick={() => turnOff(l.id)} className={`${btn} text-red-400 ml-auto`}>Turn off</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
