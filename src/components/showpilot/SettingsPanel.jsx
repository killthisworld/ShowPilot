import React from "react";
import { User, LogOut, Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import EventTypeColors from "@/components/showpilot/EventTypeColors";

// The body of the Settings drawer, in the same console language as the
// homes: a profile readout card, mono field labels, bank-style navigation
// buttons, and a bright SAVE bank. Shared by the tech and non-tech drawers
// so the two never drift apart - each passes in its own state and handlers.
const label = "block text-[9px] tracking-[0.14em] text-white/45 mb-1";
const input = "w-full h-10 rounded-lg bg-[#111] border border-[#1f1f1f] px-3 text-[13px] text-white outline-none focus:border-[#8CFF3D]/60";

export default function SettingsPanel({
  prefs, setPrefs, user, accountStyle, onPhoto,
  navItems, onSave, saving,
  canRate, daysSinceRating, rating, setRating, ratingComment, setRatingComment, ratingSubmitting, onSubmitRating,
  onSignOut, onColorsSaved,
}) {
  const color = accountStyle.color;
  const AccIcon = accountStyle.icon;
  return (
    <div className="p-5" style={{ fontFamily: SCENE_FONT }}>
      <h2 className="text-[10px] tracking-[0.2em] text-white/40 mb-3" style={{ fontFamily: SCENE_MONO }}>SETTINGS</h2>

      {/* Profile readout */}
      <div className="rounded-xl border p-3 mb-4 flex items-center gap-3" style={{ background: `linear-gradient(90deg, ${color}26, #111 75%)`, borderColor: color + "55" }}>
        <label className="relative shrink-0 cursor-pointer group" title="Change photo">
          <span className="block w-14 h-14 rounded-full bg-[#1a1a1a] overflow-hidden flex items-center justify-center" style={{ boxShadow: `0 0 0 2px ${color}, 0 0 14px ${color}55` }}>
            {prefs.profile_photo_url ? <img src={prefs.profile_photo_url} alt="" className="w-full h-full object-cover" /> : <User className="w-7 h-7 text-white/30" />}
          </span>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] tracking-[0.1em] px-1.5 py-px rounded bg-[#0d0d0d] border border-[#2a2a2a] text-white/70 group-hover:text-white" style={{ fontFamily: SCENE_MONO }}>EDIT</span>
          <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        </label>
        <div className="min-w-0">
          <p className="text-white text-xl font-semibold leading-tight truncate tracking-wide">{prefs.display_name || "Your name"}</p>
          <span className="inline-flex items-center gap-1 mt-1 text-[9px] tracking-[0.1em] px-[6px] py-[2px] rounded-[3px]" style={{ fontFamily: SCENE_MONO, color, background: color + "1f" }}>
            <AccIcon className="w-3 h-3" /> {accountStyle.label.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div>
          <span className={label} style={{ fontFamily: SCENE_MONO }}>DISPLAY NAME</span>
          <input value={prefs.display_name || ""} onChange={(e) => setPrefs({ ...prefs, display_name: e.target.value })} className={input} />
        </div>
        <div>
          <span className={label} style={{ fontFamily: SCENE_MONO }}>EMAIL</span>
          <input value={user?.email || ""} readOnly className={input + " text-white/45"} style={{ fontFamily: SCENE_MONO, fontSize: 12 }} />
        </div>
      </div>

      {/* Navigation banks */}
      <div className="space-y-2 mb-4">
        {navItems.map(({ icon: Icon, label: text, sub, color: c, onClick }) => (
          <button
            key={text}
            type="button"
            onClick={onClick}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:brightness-125"
            style={{ background: c + "1A", border: `1px solid ${c}55` }}
          >
            <Icon className="w-4 h-4 shrink-0" style={{ color: c }} />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: c }}>{text.toUpperCase()}</span>
              {sub && <span className="block text-white/40 text-[10px] leading-snug">{sub}</span>}
            </span>
          </button>
        ))}
      </div>

      <EventTypeColors preferences={prefs} onSaved={onColorsSaved} />

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-lg py-2.5 text-[12px] font-semibold tracking-[0.14em] text-[#0d0d0d] bg-[#8CFF3D] hover:bg-[#9dff5c] disabled:opacity-50 transition-colors"
        style={{ fontFamily: SCENE_MONO, boxShadow: "0 0 14px #8CFF3D44" }}
      >
        {saving ? "SAVING..." : "SAVE SETTINGS"}
      </button>

      {/* Rating */}
      <div className="border-t border-[#1f1f1f] mt-5 pt-4">
        <span className={label} style={{ fontFamily: SCENE_MONO }}>RATE SHOWPILOT</span>
        {canRate ? (
          <>
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} className="transition-transform hover:scale-110">
                  <Star className="w-6 h-6" fill={n <= rating ? "#F59E0B" : "none"} stroke={n <= rating ? "#F59E0B" : "#555"} />
                </button>
              ))}
            </div>
            <Textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Any feedback or comments..."
              className="bg-[#111] border-[#1f1f1f] text-white text-sm min-h-[70px] resize-none"
            />
            <button
              type="button"
              disabled={rating === 0 || ratingSubmitting}
              onClick={onSubmitRating}
              className="mt-2 w-full rounded-lg py-2 text-[11px] tracking-[0.14em] text-[#F59E0B] bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30 disabled:opacity-40"
              style={{ fontFamily: SCENE_MONO }}
            >
              {ratingSubmitting ? "SENDING..." : "SUBMIT RATING"}
            </button>
          </>
        ) : (
          <p className="text-xs text-white/30 py-1">
            Thanks for your feedback! You can rate again in {Math.ceil(7 - daysSinceRating)} day{Math.ceil(7 - daysSinceRating) !== 1 ? "s" : ""}.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-[11px] tracking-[0.14em] text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-400/30 transition-colors"
        style={{ fontFamily: SCENE_MONO }}
      >
        <LogOut className="w-4 h-4" /> SIGN OUT
      </button>
    </div>
  );
}
