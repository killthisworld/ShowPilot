import React, { useEffect, useState } from "react";
import { Check, Copy, Mail, MessageSquare, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

// The venue asks a tech if they're free for a booked event (job 246, step 4).
// Pick Audio or Lighting, then someone you've worked with or someone new.
// Makes a short link (/t/CODE) that shows them the rundown and I'm in /
// Can't make it; sent by text or email from your phone, or copied.
const GREEN = "#8CFF3D";
const BLUE = "#60A5FA";
const MONO = "'JetBrains Mono', monospace";
const label = "block text-[11px] tracking-[0.12em] text-white/55 mb-1.5";
const input = "w-full min-h-[46px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";

export default function AskTechSheet({ showId, title, date, onClose, onAsked }) {
  const [role, setRole] = useState("engineer");
  const [past, setPast] = useState([]);
  const [who, setWho] = useState(null); // user_id, or "new"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState(null); // { code, to_name, to_email, to_phone }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setWho(null);
    supabase.rpc("list_my_past_techs", { p_role: role }).then(({ data, error: e }) => {
      if (e) console.error(e);
      const list = Array.isArray(data) ? data : [];
      setPast(list);
      if (!list.length) setWho("new");
    });
  }, [role]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ready = who && (who !== "new" || (name.trim() && (email.trim() || phone.trim())));
  const ask = async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error: e } = await supabase.rpc("ask_booking_tech", {
        p_show: showId, p_role: role, p_user: who === "new" ? null : who,
        p_name: who === "new" ? name.trim() : "", p_email: who === "new" ? email.trim() : "", p_phone: who === "new" ? phone.trim() : "",
      });
      if (e) throw e;
      setMade(data);
      onAsked?.(data);
    } catch (e) {
      console.error(e);
      setError("Couldn't make the ask. Try again.");
    }
    setBusy(false);
  };

  const url = made ? `${window.location.origin}/t/${made.code}` : "";
  const msg = made ? `Are you free for ${title || "a show"}${date ? ` on ${new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}? Here's the rundown: ${url}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };
  const roleWord = role === "lighting" ? "lighting tech" : "audio engineer";

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Ask a tech" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[440px] max-h-[92dvh] overflow-y-auto bg-[#141414] border border-[#2a2a2a] rounded-t-[20px] sm:rounded-[20px] p-5 flex flex-col gap-4 text-white">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-[11px] tracking-[0.14em]" style={{ fontFamily: MONO, color: BLUE }}>ASK A TECH</span>
            <h2 className="text-[26px] font-bold leading-none mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{title || "This event"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 -mt-2 rounded-full flex items-center justify-center text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {made ? (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] text-white/80">Ask made for <span className="font-bold text-white">{made.to_name || `your ${roleWord}`}</span>. Send them the link. They'll see the event and who's playing, and answer in one tap.</p>
            <div className="rounded-[10px] bg-[#0b0b0b] border border-[#2a2a2a] px-3 py-2.5 text-[14px] text-white/80 break-all" style={{ fontFamily: MONO }}>{url.replace(/^https?:\/\//, "")}</div>
            <div className="grid grid-cols-3 gap-2">
              <a href={`sms:${made.to_phone || ""}?&body=${encodeURIComponent(msg)}`} className="min-h-[52px] rounded-[12px] border border-[#333] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold"><MessageSquare className="w-4 h-4" />Text</a>
              <a href={`mailto:${made.to_email || ""}?subject=${encodeURIComponent(`Are you free? ${title || ""}`.trim())}&body=${encodeURIComponent(msg)}`} className="min-h-[52px] rounded-[12px] border border-[#333] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold"><Mail className="w-4 h-4" />Email</a>
              <button type="button" onClick={copy} className="min-h-[52px] rounded-[12px] border border-[#333] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold">{copied ? <Check className="w-4 h-4" style={{ color: GREEN }} /> : <Copy className="w-4 h-4" />}{copied ? "Copied" : "Copy"}</button>
            </div>
            <button type="button" onClick={onClose} className="min-h-[48px] rounded-[12px] font-bold text-[15px]" style={{ background: BLUE, color: "#0d0d0d" }}>Done</button>
          </div>
        ) : (
          <>
            <div>
              <span className={label} style={{ fontFamily: MONO }}>WHO FOR</span>
              <div className="grid grid-cols-2 gap-2">
                {[["engineer", "Audio"], ["lighting", "Lighting"]].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={role === k} onClick={() => setRole(k)} className="min-h-[46px] rounded-[12px] text-[15px] font-bold border"
                    style={role === k ? { borderColor: GREEN, background: `${GREEN}1a`, color: GREEN } : { borderColor: "#333", color: "rgba(255,255,255,0.7)" }}>{l}</button>
                ))}
              </div>
            </div>

            {past.length > 0 && (
              <div>
                <span className={label} style={{ fontFamily: MONO }}>YOU'VE WORKED WITH</span>
                <div className="flex flex-col gap-1.5">
                  {past.map((t) => (
                    <button key={t.user_id} type="button" aria-pressed={who === t.user_id} onClick={() => setWho(t.user_id)} className="min-h-[54px] px-3 rounded-[12px] border flex items-center gap-3 text-left"
                      style={who === t.user_id ? { borderColor: GREEN, background: `${GREEN}12` } : { borderColor: "#2a2a2a", background: "#101010" }}>
                      <span className="w-9 h-9 rounded-full shrink-0 overflow-hidden border-2" style={{ borderColor: GREEN, background: "#1a2614" }}>{t.photo && <img src={t.photo} alt="" className="w-full h-full object-cover" />}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold truncate">{t.name || "Tech"}</span>
                        <span className="block text-[12px] text-white/55">{t.shows} show{t.shows === 1 ? "" : "s"} at yours</span>
                      </span>
                    </button>
                  ))}
                  <button type="button" aria-pressed={who === "new"} onClick={() => setWho("new")} className="min-h-[48px] px-3 rounded-[12px] border text-[14.5px] font-semibold text-left"
                    style={who === "new" ? { borderColor: GREEN, color: GREEN } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.75)" }}>Someone new</button>
                </div>
              </div>
            )}

            {who === "new" && (
              <div className="flex flex-col gap-3">
                <label><span className={label} style={{ fontFamily: MONO }}>NAME</span><input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={`Their name`} /></label>
                <label><span className={label} style={{ fontFamily: MONO }}>PHONE</span><input className={input} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="To text them the link" /></label>
                <label><span className={label} style={{ fontFamily: MONO }}>EMAIL</span><input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Or email it" /></label>
                <p className="text-[12.5px] text-white/50 -mt-1">A phone or an email, so you can send them the link.</p>
              </div>
            )}

            {error && <p className="text-center text-[14px] text-red-400">{error}</p>}
            <button type="button" disabled={!ready || busy} onClick={ask} className="min-h-[52px] rounded-[12px] font-bold text-[16px] disabled:opacity-50" style={{ background: BLUE, color: "#0d0d0d" }}>
              {busy ? "Making the ask…" : `Ask if they're free`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
