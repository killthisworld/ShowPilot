import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Phone, Loader2, X, Check, MessageCircle, Pause } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { DJ_COLOR } from "@/lib/djTools";
import { listRequests, replyToRequest } from "@/lib/djKit";

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const HOLD = "#FB923C";
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

// Date requests from the press kit (jobs 459, 465): Bookings > Requests.
// Accept: the night becomes one of the DJ's gigs and the promoter gets a
// confirmation email. Decline: the DJ writes why, and it's emailed to them.
// Hold is an answer too (job 466): the promoter gets the DJ's note, the night
// shows orange on the press kit calendar, and they talk details in Chats >
// In progress before the DJ confirms or declines.
export default function DjDateRequests({ onBooked, onCount }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState("");
  const [answering, setAnswering] = useState(null); // { r, action }

  const load = () => listRequests().then((r) => { setList(r); onCount?.(r.filter((x) => x.status === "new").length); });
  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answered = (r, action, res) => {
    setAnswering(null);
    const next = action === "hold" ? (list || []).map((x) => (x.id === r.id ? { ...x, status: "hold" } : x)) : (list || []).filter((x) => x.id !== r.id);
    setList(next);
    onCount?.(next.filter((x) => x.status === "new").length);
    const reach = res?.emailed ? `${r.name} got an email${action === "decline" ? "" : " with a link to chat with you"}.` : r.phone ? `No email on this request: text ${r.name} at ${r.phone}.` : "";
    toast({ title: action === "accept" ? "Booked: it's on your Gigs" : action === "hold" ? "On hold: chat in Chats › In progress" : "Declined", description: reach });
    if (action === "accept") onBooked?.();
  };

  if (list === null) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>;
  if (!list.length) {
    return (
      <div className="py-12 px-4 flex flex-col items-center gap-2 text-center">
        <p className="m-0 text-[16px] font-semibold">No requests right now</p>
        <p className="m-0 max-w-[360px] text-[14px] text-white/55">When a promoter taps an open night on your press kit, it lands here to accept or decline.</p>
        <Link to="/dj/profile" className="mt-2 min-h-[40px] px-4 rounded-full border text-[14px] font-semibold flex items-center no-underline" style={{ borderColor: `${DJ_COLOR}88`, color: DJ_COLOR }}>Share your press kit</Link>
      </div>
    );
  }
  return (
    <section className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
      {list.map((r) => {
        const dt = new Date(`${r.date}T00:00:00`);
        const where = [r.venue, r.city].filter(Boolean).join(", ");
        const isHold = r.status === "hold";
        return (
          <article key={r.id} className="rounded-xl bg-[#101116] border overflow-hidden flex" style={{ borderColor: isHold ? `${HOLD}88` : `${DJ_COLOR}55` }}>
            <div className="w-[58px] shrink-0 flex flex-col items-center justify-center border-r border-dashed border-white/15 text-[10px] tracking-[0.1em] leading-tight" style={{ ...mono, color: isHold ? HOLD : DJ_COLOR }}>
              {MON[dt.getMonth()]}<span className="text-[22px] text-white tracking-normal" style={cond}>{dt.getDate()}</span>
              {isHold && <span className="mt-0.5 text-[9px]">HOLD</span>}
            </div>
            <div className="min-w-0 flex-1 p-3 flex flex-col gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold truncate">{r.event_name || "A night"}{where ? <span className="text-white/60 font-normal"> · {where}</span> : null}</div>
                <div className="text-[13px] text-white/60 truncate">from {r.name}{r.set_time ? ` · ${r.set_time}` : ""}</div>
                {r.message && <p className="m-0 mt-1 text-[13.5px] text-white/75 line-clamp-3">{r.message}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" disabled={busy === r.id} onClick={() => setAnswering({ r, action: "accept" })} className="min-h-[38px] px-4 rounded-full text-[13.5px] font-bold flex items-center gap-1.5" style={{ background: DJ_COLOR, color: "#000" }}>
                  <Check className="w-4 h-4" />Accept
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => setAnswering({ r, action: "decline" })} className="min-h-[38px] px-3.5 rounded-full border border-white/20 text-[13.5px] font-semibold hover:bg-white/5">Decline</button>
                {isHold ? (
                  <button type="button" onClick={() => navigate(`/?view=chats&thread=${r.id}`)} className="min-h-[38px] px-3 rounded-full border text-[13.5px] font-semibold flex items-center gap-1.5" style={{ borderColor: `${HOLD}99`, color: HOLD }}>
                    <MessageCircle className="w-4 h-4" />Chat
                  </button>
                ) : (
                  <button type="button" disabled={busy === r.id} onClick={() => setAnswering({ r, action: "hold" })} className="min-h-[38px] px-3 rounded-full border text-[13.5px] font-semibold flex items-center gap-1.5" style={{ borderColor: `${HOLD}99`, color: HOLD }}>
                    <Pause className="w-3.5 h-3.5" />Hold
                  </button>
                )}
                <span className="flex-1" />
                {r.email && <a href={`mailto:${r.email}`} aria-label={`Email ${r.name}`} className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/80 hover:text-white"><Mail className="w-4 h-4" /></a>}
                {r.phone && <a href={`tel:${r.phone}`} aria-label={`Call ${r.name}`} className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/80 hover:text-white"><Phone className="w-4 h-4" /></a>}
              </div>
            </div>
          </article>
        );
      })}
      {answering && <ReplySheet {...answering} onClose={() => setAnswering(null)} onDone={answered} />}
    </section>
  );
}

// The note that goes to the promoter: pre-written, the DJ edits it.
export function ReplySheet({ r, action, onClose, onDone }) {
  const accept = action === "accept";
  const hold = action === "hold";
  const when = longDate(r.date);
  const first = (r.name || "").split(/\s+/)[0] || "there";
  const [msg, setMsg] = useState(accept
    ? `Hi ${first}, I'm confirmed for ${r.event_name || "your night"} on ${when}. Looking forward to it!`
    : hold
      ? `Hi ${first}, I'm holding ${when} for you. Let's go over the details here before I confirm.`
      : `Hi ${first}, thanks for reaching out about ${when}. Unfortunately I can't make it that night.`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const send = async () => {
    if (!accept && !msg.trim()) { setError("Write a short message for them."); return; }
    setSending(true); setError("");
    try { const res = await replyToRequest(r.id, action, msg); onDone(r, action, res); }
    catch (e) { setError(e.message); setSending(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/75" style={{ fontFamily: "Inter, system-ui, sans-serif" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={accept ? "Accept the booking" : hold ? "Put the date on hold" : "Decline the request"} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-[520px] rounded-t-2xl sm:rounded-2xl bg-[#111216] border border-[#2a2a2a] p-5 flex flex-col gap-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.18em]" style={{ ...mono, color: accept ? DJ_COLOR : hold ? HOLD : "rgba(255,255,255,0.65)" }}>{accept ? "ACCEPT" : hold ? "HOLD" : "DECLINE"} · {when.toUpperCase()}</div>
            <div className="text-[22px] leading-tight truncate" style={cond}>{r.event_name || "A night"}{r.venue ? ` · ${r.venue}` : ""}</div>
            <div className="text-[13px] text-white/55 truncate">{r.email ? `Goes to ${r.name} at ${r.email}` : `${r.name} left no email${r.phone ? `: text ${r.phone}` : ""}`}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 -mt-1 shrink-0 rounded-xl flex items-center justify-center text-white/70 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] tracking-[0.16em] text-white/65" style={mono}>{accept ? "YOUR NOTE (OPTIONAL)" : hold ? "YOUR NOTE" : "WHY YOU'RE DECLINING"}</span>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} className="w-full px-3 py-2.5 rounded-xl bg-[#0d0e14] border border-white/20 text-[15px] leading-relaxed text-white outline-none focus:border-[#FDE047] resize-y" />
        </label>
        {accept && <p className="m-0 text-[13px] text-white/55">The night goes on your Gigs and shows green on your press kit calendar. You can keep chatting in Chats › Confirmed.</p>}
        {hold && <p className="m-0 text-[13px] text-white/55">The night shows orange on your press kit calendar. Your note starts a chat with {r.name} (Chats › In progress), and they get a link to it by email.</p>}
        {error && <p className="m-0 text-[14px] text-[#F87171]" role="alert">{error}</p>}
        <button type="button" onClick={send} disabled={sending} className="min-h-[48px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold disabled:opacity-60" style={accept ? { background: DJ_COLOR, color: "#000" } : hold ? { background: HOLD, color: "#000" } : { background: "#fff", color: "#000" }}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : accept ? <Check className="w-4 h-4" /> : hold ? <Pause className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
          {accept ? "Confirm booking" : hold ? "Hold the date" : r.email ? "Send and decline" : "Decline"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
