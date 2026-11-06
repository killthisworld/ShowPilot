import React, { useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

// "Rate ShowPilot" box shown after the Performer Intake form is submitted.
// Same 5 stars + comment as Settings; saves to app_ratings (source
// 'performer_intake') through submit_intake_rating, so senders who aren't
// signed in can rate too. Read the ratings in the Supabase SQL editor.
// `onRate(rating, comment)` (job 195): another form's own way to save it.
export default function IntakeRating({ token, onRate = null }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    if (!rating || sending) return;
    setSending(true);
    setErr("");
    const { error } = onRate ? await onRate(rating, comment) : await supabase.rpc("submit_intake_rating", { p_token: token, p_rating: rating, p_comment: comment });
    setSending(false);
    if (error) setErr("Couldn't send that. Try again.");
    else setSent(true);
  };

  // The thank-you (job 229): bright, softly glowing like the stars behind it.
  if (sent) {
    return (
      <div className="ir-thanks mt-8 text-center" role="status">
        <style>{`
          @keyframes ir-in { from { opacity: 0; transform: translateY(8px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
          @keyframes ir-shine { 0%, 100% { text-shadow: 0 0 10px rgba(255,255,255,0.55), 0 0 26px rgba(170,200,255,0.35); } 50% { text-shadow: 0 0 16px rgba(255,255,255,0.85), 0 0 40px rgba(170,200,255,0.55); } }
          .ir-thanks p { animation: ir-in 1.1s cubic-bezier(.2,.8,.2,1) both, ir-shine 3.6s ease-in-out 1.1s infinite; }
          .ir-thanks p + p { animation-delay: .35s, 1.45s; }
          @media (prefers-reduced-motion: reduce) { .ir-thanks p { animation: none; text-shadow: 0 0 12px rgba(255,255,255,0.6); } }
        `}</style>
        <p className="text-white text-[22px] font-semibold leading-snug">We greatly appreciate your feedback.</p>
        <p className="mt-2 text-white/90 text-[17px] leading-snug">Have a great event and God bless.</p>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div className="mt-6 text-left bg-[#111] border border-[#1f1f1f] rounded-xl p-4">
      <span className="block text-[11px] tracking-[0.14em] text-white/50 mb-2" style={{ fontFamily: SCENE_MONO }}>HOW WAS THIS FORM?</span>
      <div className="flex gap-1 mb-3" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star className="w-7 h-7" fill={n <= shown ? "#FF6A00" : "none"} stroke={n <= shown ? "#FF6A00" : "#555"} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Any feedback or comments..."
        className="w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30 resize-none focus:outline-none focus:border-[#FF6A00]/50"
      />
      <button
        type="button"
        disabled={!rating || sending}
        onClick={send}
        className="mt-2 w-full rounded-lg py-2.5 text-[11px] tracking-[0.14em] text-[#FF6A00] bg-[#FF6A00]/10 hover:bg-[#FF6A00]/20 border border-[#FF6A00]/30 disabled:opacity-40"
        style={{ fontFamily: SCENE_MONO }}
      >
        {sending ? "SENDING..." : "SUBMIT RATING"}
      </button>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  );
}
