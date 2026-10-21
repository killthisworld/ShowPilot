import React, { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { SnapshotView } from "@/components/showpilot/RecordView";
import {
  DEAL_TYPES, DEAL_STATUS, FORCE_MAJEURE_TEXT, CANCELLATION_TEXT,
  saveDeal, respondDeal, agreementSnapshot, lineupRows, fmtDate, fmtDateTime,
} from "@/lib/eventBusiness";

// The event's deal (performance agreement terms). The Venue writes and sends
// it; the Manager / Artist accepts it or asks for changes; nobody else on the
// event can see it. Saves on its own (not with the profile's SAVE button).
const G = "#8CFF3D";
const AMBER = "#FF6A00";
const labelCls = "text-[11px] tracking-[0.12em] text-white/50";
const inputCls = "w-full h-10 px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40 disabled:opacity-60";

function In({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>{label.toUpperCase()}</span>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </label>
  );
}
let areaN = 0;
function Area({ label, value, onChange, placeholder, rows = 3, extra = null }) {
  const [id] = useState(() => `deal-area-${++areaN}`);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className={`${labelCls} flex-1`} style={{ fontFamily: SCENE_MONO }}>{label.toUpperCase()}</label>
        {extra}
      </div>
      <textarea id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full px-3 py-2 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40 resize-y" />
    </div>
  );
}

export function dealTabState(deal) {
  if (!deal) return "empty";
  return deal.status === "accepted" ? "done" : "partial";
}
export function dealTabSummary(deal) {
  if (!deal) return "Fee, deposit, cancellation";
  const s = DEAL_STATUS[deal.status]?.label || "";
  return [s.charAt(0) + s.slice(1).toLowerCase(), deal.sent_at && deal.status === "sent" ? `sent ${fmtDate(deal.sent_at)}` : "", deal.responded_at ? fmtDate(deal.responded_at) : ""].filter(Boolean).join(" · ");
}

function StatusLine({ deal, color }) {
  if (!deal) return null;
  const st = DEAL_STATUS[deal.status] || DEAL_STATUS.draft;
  const c = deal.status === "accepted" ? G : deal.status === "changes_requested" ? AMBER : deal.status === "sent" ? color : "rgba(255,255,255,0.55)";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold tracking-[0.1em] px-2 py-1 rounded" style={{ fontFamily: SCENE_MONO, color: deal.status === "draft" ? "rgba(255,255,255,0.7)" : "#0d0d0d", background: deal.status === "draft" ? "#1f1f1f" : c }}>{st.label}</span>
        <span className="text-[13px] text-white/50">{deal.status === "accepted" && deal.responded_at ? `Accepted ${fmtDateTime(deal.responded_at)}` : deal.sent_at ? `Sent ${fmtDateTime(deal.sent_at)}` : `Saved ${fmtDateTime(deal.updated_at)}`}</span>
      </div>
      {deal.response_note && (
        <p className="text-[15px] rounded-[10px] px-3 py-2" style={{ color: "#fff", background: `${AMBER}14`, border: `1px solid ${AMBER}55` }}>
          <span className="text-[11px] tracking-[0.1em] text-white/55 block mb-0.5" style={{ fontFamily: SCENE_MONO }}>FROM THE ARTIST SIDE</span>
          {deal.response_note}
        </p>
      )}
    </div>
  );
}

// `compact` (inside Paperwork, job 116): no privacy note or event / lineup
// info, just the terms and the buttons.
export default function EventDeal({ gig, biz, onChanged, color = "#60A5FA", compact = false }) {
  const deal = biz?.deal || null;
  const canEdit = !!biz?.venue;
  const canRespond = !!biz?.manager && !canEdit;
  const [terms, setTerms] = useState(deal?.terms || {});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setTerms(deal?.terms || {}); }, [deal?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setTerms((t) => ({ ...t, [k]: v }));
  const dirty = JSON.stringify(terms || {}) !== JSON.stringify(deal?.terms || {});
  const preview = useMemo(() => agreementSnapshot(gig, { ...(deal || {}), terms }), [gig, deal, terms]);

  const run = async (label, fn) => {
    setBusy(label); setErr("");
    try { await fn(); await onChanged?.(); } catch (e) { console.error(e); setErr(e?.message || "Something went wrong. Try again."); }
    setBusy("");
  };

  const lineup = lineupRows(gig);
  const privacy = compact ? null : (
    <p className="flex items-center gap-1.5 text-[13px] text-white/45"><Lock className="w-3.5 h-3.5 shrink-0" /> Only the venue, the manager / artist and the event owner can see the deal. Crew can't.</p>
  );

  if (canEdit) {
    const type = terms.deal_type || "";
    return (
      <div className="flex flex-col gap-4">
        {privacy}
        <StatusLine deal={deal} color={color} />
        {!compact && <>
        <div className="flex flex-col gap-1.5">
          <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>EVENT</span>
          <p className="text-[15px] text-white/80">{[gig.event_name || gig.band_name, fmtDate(gig.date), gig.venue].filter(Boolean).join(" · ") || "Add the event name and date first"}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>SET TIMES (FROM THE ARTIST LINEUP)</span>
          {lineup.length ? (
            <div className="rounded-[10px] border border-[#242424] divide-y divide-[#1f1f1f]">
              {lineup.map(([n, t]) => <div key={n} className="flex justify-between gap-3 px-3 py-2 text-[15px]"><span>{n}</span><span className="text-white/60">{t}</span></div>)}
            </div>
          ) : <p className="text-[14px] text-white/40">No acts in the lineup yet. The manager / artist adds them under Lineup & set times.</p>}
        </div>
        </>}
        <In label="Doors" value={terms.doors} onChange={(v) => set("doors", v)} placeholder="7:00 PM" />

        <div className="flex flex-col gap-1.5">
          <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>DEAL</span>
          <div className="grid grid-cols-3 gap-1.5">
            {DEAL_TYPES.map((d) => (
              <button key={d.key} type="button" onClick={() => set("deal_type", d.key)} className="py-2.5 rounded-lg text-[14px] font-bold" style={type === d.key ? { background: color, color: "#0d0d0d" } : { border: "1px solid #2a2a2a", color: "rgba(255,255,255,0.7)" }}>{d.label}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(type === "flat" || type === "vs") && <In label="Guarantee" value={terms.guarantee} onChange={(v) => set("guarantee", v)} placeholder="$500" />}
          {(type === "door" || type === "vs") && <In label="Door split %" value={terms.door_percent} onChange={(v) => set("door_percent", v.replace(/[^0-9.]/g, ""))} placeholder="80" />}
          {(type === "door" || type === "vs") && <In label="Split after" value={terms.door_after} onChange={(v) => set("door_after", v)} placeholder="$300 house costs" />}
          <In label="Bonuses" value={terms.bonus} onChange={(v) => set("bonus", v)} placeholder="$200 at 150 tickets" />
          <In label="Merch split" value={terms.merch_split} onChange={(v) => set("merch_split", v)} placeholder="Artist keeps 100%" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <In label="Deposit" value={terms.deposit_amount} onChange={(v) => set("deposit_amount", v)} placeholder="$250" />
          <In type="date" label="Deposit due" value={terms.deposit_due} onChange={(v) => set("deposit_due", v)} />
          <In label="Balance" value={terms.balance_terms} onChange={(v) => set("balance_terms", v)} placeholder="Cash at settlement" />
          <In label="Paid by" value={terms.payment_method} onChange={(v) => set("payment_method", v)} placeholder="Venmo, check, cash" />
        </div>
        <Area label="Cancellation" value={terms.cancellation} onChange={(v) => set("cancellation", v)} placeholder="What happens if either side cancels" rows={3}
          extra={!terms.cancellation && <button type="button" onClick={() => set("cancellation", CANCELLATION_TEXT)} className="text-[12px] font-semibold text-white/60 hover:text-white">Use standard wording</button>} />
        <Area label="Weather and events nobody controls" value={terms.force_majeure} onChange={(v) => set("force_majeure", v)} placeholder="Severe weather, power failure, government order..." rows={3}
          extra={!terms.force_majeure && <button type="button" onClick={() => set("force_majeure", FORCE_MAJEURE_TEXT)} className="text-[12px] font-semibold text-white/60 hover:text-white">Use standard wording</button>} />
        <Area label="Other terms" value={terms.other_terms} onChange={(v) => set("other_terms", v)} placeholder="Radius clause, recording, comps..." rows={2} />

        {err && <p className="text-[14px] text-red-400">{err}</p>}
        <div className="flex flex-col sm:flex-row gap-2">
          {(!deal || deal.status === "draft") && (
            <button type="button" disabled={!!busy || (!dirty && !!deal)} onClick={() => run("draft", () => saveDeal(gig.id, terms, "draft"))} className="flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] bg-[#111] border border-[#2a2a2a] text-white/85 disabled:opacity-40">
              {busy === "draft" ? "SAVING..." : "SAVE DRAFT"}
            </button>
          )}
          <button type="button" disabled={!!busy || !terms.deal_type || (deal?.status === "sent" && !dirty) || (deal?.status === "accepted" && !dirty)} onClick={() => run("send", () => saveDeal(gig.id, terms, "sent"))} className="flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: color, color: "#0d0d0d" }}>
            {busy === "send" ? "SENDING..." : !deal || deal.status === "draft" ? "SEND TO ARTIST SIDE" : "SEND UPDATED DEAL"}
          </button>
        </div>
        {deal?.status === "accepted" && dirty && <p className="text-[13px] text-white/50">Sending changes to an accepted deal asks the artist side to accept again.</p>}
        {!terms.deal_type && <p className="text-[13px] text-white/45">Pick a deal type to send it.</p>}
      </div>
    );
  }

  // Manager / artist side, or the owner looking on.
  if (!deal || deal.status === "draft") {
    return (
      <div className="flex flex-col gap-3">
        {privacy}
        <p className="text-[15px] text-white/55">The venue hasn't sent the deal yet. When they do, it shows up here to accept or ask for changes.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {privacy}
      <StatusLine deal={deal} color={color} />
      <SnapshotView snapshot={compact ? { ...preview, sections: (preview.sections || []).filter((x) => !/^(event|status)$/i.test(x.heading || "")) } : preview} dense />
      {err && <p className="text-[14px] text-red-400">{err}</p>}
      {canRespond && deal.status === "sent" && (
        asking ? (
          <div className="flex flex-col gap-2">
            <Area label="What should change?" value={note} onChange={setNote} placeholder="e.g. Guarantee $600, deposit due a week earlier" rows={3} />
            <div className="flex gap-2">
              <button type="button" disabled={!!busy || !note.trim()} onClick={() => run("ask", async () => { await respondDeal(gig.id, false, note, deal.updated_at); setAsking(false); setNote(""); })} className="flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: AMBER, color: "#0d0d0d" }}>
                {busy === "ask" ? "SENDING..." : "SEND TO VENUE"}
              </button>
              <button type="button" onClick={() => setAsking(false)} className="px-4 rounded-[10px] text-[14px] font-bold text-white/55">CANCEL</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" disabled={!!busy} onClick={() => run("accept", () => respondDeal(gig.id, true, null, deal.updated_at))} className="flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] disabled:opacity-40" style={{ background: G, color: "#0d0d0d" }}>
              {busy === "accept" ? "ACCEPTING..." : "ACCEPT DEAL"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => setAsking(true)} className="flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-[0.06em] bg-[#111] border border-[#2a2a2a] text-white/85">
              ASK FOR CHANGES
            </button>
          </div>
        )
      )}
      {canRespond && deal.status === "changes_requested" && <p className="text-[14px] text-white/50">Sent to the venue. You'll see the updated deal here when they send it.</p>}
    </div>
  );
}
