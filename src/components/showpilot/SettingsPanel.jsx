import React, { useEffect, useRef, useState } from "react";
import { User, LogOut, Star, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import EventTypeColors from "@/components/showpilot/EventTypeColors";
import AccountSwitcher from "@/components/showpilot/AccountSwitcher";

// The body of the Settings drawer, in the same console language as the
// homes: a profile readout card, mono field labels, bank-style navigation
// buttons, and a bright SAVE bank. Shared by the tech and non-tech drawers
// so the two never drift apart - each passes in its own state and handlers.
const label = "block text-[9px] tracking-[0.14em] text-white/45 mb-1";
const input = "w-full h-10 rounded-lg bg-[#111] border border-[#1f1f1f] px-3 text-[13px] text-white outline-none focus:border-[#8CFF3D]/60";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const smallBtn = "shrink-0 h-10 px-3 rounded-lg text-[10px] tracking-[0.14em] border transition-colors disabled:opacity-40";
const mono12 = { fontFamily: SCENE_MONO, fontSize: 12 };

function hasPasswordLogin(user) {
  const providers = user?.app_metadata?.providers || [user?.app_metadata?.provider].filter(Boolean);
  return providers.includes("email") || (user?.identities || []).some((i) => i.provider === "email");
}

function FormButtons({ busy, disabled, submitLabel, busyLabel, onCancel }) {
  return (
    <div className="flex gap-2">
      <button
        type="submit"
        disabled={busy || disabled}
        className={smallBtn + " flex-1 text-[#0d0d0d] bg-[#8CFF3D] border-[#8CFF3D] hover:bg-[#9dff5c] font-semibold"}
        style={{ fontFamily: SCENE_MONO }}
      >
        {busy ? busyLabel : submitLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className={smallBtn + " text-white/50 border-[#2a2a2a] bg-[#111] hover:text-white"}
        style={{ fontFamily: SCENE_MONO }}
      >
        CANCEL
      </button>
    </div>
  );
}

// New email: Supabase emails a confirm link and nothing switches until it's
// clicked, so a typo can't lock anyone out.
function EmailForm({ current, onSent, onCancel }) {
  const { updateEmail } = useAuth();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const next = value.trim().toLowerCase();
    setError("");
    if (!EMAIL_RE.test(next)) { setError("Enter a valid email address."); return; }
    if (next === current.toLowerCase()) { setError("That's already your email."); return; }
    setBusy(true);
    try {
      await updateEmail(next);
      onSent(next);
    } catch (err) {
      const msg = err?.message || "";
      setError(/already|registered|exists/i.test(msg)
        ? "Another Show Pilot account already uses that email."
        : msg || "Couldn't change the email. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <span className={label} style={{ fontFamily: SCENE_MONO }}>NEW EMAIL</span>
      <input type="email" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="New email address" className={input} style={mono12} />
      <FormButtons busy={busy} disabled={!value.trim()} submitLabel="SEND CONFIRM LINK" busyLabel="SENDING..." onCancel={onCancel} />
      <p className="text-white/40 text-[10px] leading-snug">
        We'll email a confirm link to the new address. Your login stays {current || "the same"} until you click it.
      </p>
      {error && <p className="text-red-400 text-[11px]">{error}</p>}
    </form>
  );
}

// New password. Accounts with a password must enter the current one;
// Google-only accounts can set a first password.
function PasswordForm({ hasPassword, onSaved, onCancel }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (hasPassword && !current) { setError("Enter your current password."); return; }
    if (next.length < 6) { setError("New password needs at least 6 characters."); return; }
    if (next !== confirm) { setError("The new passwords don't match."); return; }
    if (hasPassword && next === current) { setError("That's the same as your current password."); return; }
    setBusy(true);
    try {
      await changePassword(hasPassword ? current : null, next);
      onSaved();
    } catch (err) {
      setError(err?.message || "Couldn't change the password. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <span className={label} style={{ fontFamily: SCENE_MONO }}>{hasPassword ? "NEW PASSWORD" : "SET A PASSWORD"}</span>
      {!hasPassword && (
        <p className="text-white/40 text-[10px] leading-snug">You sign in with Google. A password lets you sign in with your email too.</p>
      )}
      {hasPassword && (
        <input type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className={input} style={mono12} />
      )}
      <input type="password" autoComplete="new-password" autoFocus={!hasPassword} value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (6+ characters)" className={input} style={mono12} />
      <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="New password again" className={input} style={mono12} />
      <FormButtons busy={busy} disabled={!next || !confirm || (hasPassword && !current)} submitLabel={hasPassword ? "UPDATE PASSWORD" : "SET PASSWORD"} busyLabel="SAVING..." onCancel={onCancel} />
      {hasPassword && (
        <a href="/forgot-password" className="block text-white/40 hover:text-white/70 text-[10px] underline underline-offset-2">
          Forgot your current password?
        </a>
      )}
      {error && <p className="text-red-400 text-[11px]">{error}</p>}
    </form>
  );
}

// The EMAIL row. Its CHANGE button opens a small menu: Email or Password.
// Picking one opens that form under the row.
function LoginDetails({ user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | "email" | "password"
  const [sentTo, setSentTo] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [hasPassword, setHasPassword] = useState(() => hasPasswordLogin(user));
  const menuRef = useRef(null);

  const current = user?.email || "";
  const pending = sentTo || user?.new_email || "";

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  const pick = (m) => { setMenuOpen(false); setMode(m); setPwSaved(false); };
  const item = "w-full text-left px-3 py-2.5 text-[11px] tracking-[0.12em] text-white/80 hover:bg-[#8CFF3D]/10 hover:text-white";

  return (
    <div>
      <span className={label} style={{ fontFamily: SCENE_MONO }}>EMAIL</span>
      <div className="flex gap-2">
        <input value={current} readOnly className={input + " text-white/45"} style={mono12} />
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={!!mode}
            onClick={() => setMenuOpen((o) => !o)}
            className={smallBtn + " inline-flex items-center gap-1 text-white/70 border-[#2a2a2a] bg-[#111] hover:text-white hover:border-[#8CFF3D]/60"}
            style={{ fontFamily: SCENE_MONO }}
          >
            CHANGE <ChevronDown className={"w-3 h-3 transition-transform " + (menuOpen ? "rotate-180" : "")} />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-[#2a2a2a] bg-[#141414] overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.6)]" style={{ fontFamily: SCENE_MONO }}>
              <button type="button" role="menuitem" className={item} onClick={() => pick("email")}>EMAIL</button>
              <button type="button" role="menuitem" className={item + " border-t border-[#1f1f1f]"} onClick={() => pick("password")}>
                {hasPassword ? "PASSWORD" : "SET A PASSWORD"}
              </button>
            </div>
          )}
        </div>
      </div>

      {mode === "email" && (
        <EmailForm current={current} onCancel={() => setMode(null)} onSent={(addr) => { setSentTo(addr); setMode(null); }} />
      )}
      {mode === "password" && (
        <PasswordForm hasPassword={hasPassword} onCancel={() => setMode(null)} onSaved={() => { setHasPassword(true); setPwSaved(true); setMode(null); }} />
      )}

      {!mode && pending && pending.toLowerCase() !== current.toLowerCase() && (
        <p className="mt-1.5 text-[11px] leading-snug text-[#8CFF3D]/80">
          Confirm link sent to <span style={{ fontFamily: SCENE_MONO }}>{pending}</span>. Click it to finish switching. Check your current inbox too, in case it asks you to confirm there as well.
        </p>
      )}
      {!mode && pwSaved && (
        <p className="mt-1.5 text-[11px] text-[#8CFF3D]/80">Password updated. Use the new one next time you sign in.</p>
      )}
    </div>
  );
}

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

      <AccountSwitcher currentUserId={user?.id} />

      <div className="space-y-3 mb-4">
        <div>
          <span className={label} style={{ fontFamily: SCENE_MONO }}>DISPLAY NAME</span>
          <input value={prefs.display_name || ""} onChange={(e) => setPrefs({ ...prefs, display_name: e.target.value })} className={input} />
        </div>
        <LoginDetails user={user} />
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
