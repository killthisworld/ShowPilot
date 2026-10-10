import React, { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Ticket, FileSignature, Music, Headphones, Briefcase, Lightbulb, ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import AuthShell, { AuthPanel, AuthHead, AuthField, AuthButton, AuthGoogle, AuthFoot } from "@/components/showpilot/AuthShell";

// Colors come from accountTypeStyle so a role looks the same here as it
// does everywhere else in the app. "band" is shown as Artist.
const ROLE_GROUPS = [
  {
    label: "Event hosts",
    roles: [
      { value: "venue", label: "Venue", icon: MapPin },
      { value: "promoter", label: "Promoter", icon: Ticket },
    ],
  },
  {
    label: "Artist side",
    roles: [
      { value: "band", label: "Artist", icon: Music },
      { value: "manager", label: "Manager", icon: Briefcase },
      { value: "booking_agent", label: "Booking Agent", icon: FileSignature },
    ],
  },
  {
    label: "Technical production",
    roles: [
      { value: "engineer", label: "Audio Engineer", icon: Headphones },
      { value: "lighting", label: "Lighting Tech", icon: Lightbulb },
    ],
  },
];
const ROLES = ROLE_GROUPS.flatMap((g) => g.roles);
const roleColor = (value) => ACCOUNT_TYPE_STYLES[value]?.color || "#8CFF3D";

export default function Register() {
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const role = ROLES.find((r) => r.value === accountType);
  const color = role ? roleColor(role.value) : "#8CFF3D";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Type the same password in both boxes.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirect");
      const fullRedirect = redirectTo ? `${window.location.origin}${redirectTo}` : undefined;
      await signUp(email, password, fullRedirect, accountType);
      setSubmitted(true);
    } catch (err) {
      toast({ title: "Couldn't create your account", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      toast({ title: "Google sign-in didn't work", description: err.message, variant: "destructive" });
    }
  };

  if (submitted) return <BoardingPass email={email} role={role} color={color} />;

  if (step === 1) {
    return (
      <AuthShell width={780} compact>
        <AuthPanel>
          <AuthHead step="STEP 1 OF 2" title="What do you do?" sub="Pick the one that fits. Show Pilot sets itself up around your work." />
          <div className="px-6 pt-4 pb-5 space-y-4">
            {ROLE_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[11px] tracking-[0.14em] text-white/40 mb-2" style={{ fontFamily: SCENE_MONO }}>{group.label.toUpperCase()}</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {group.roles.map((r) => {
                    const c = roleColor(r.value);
                    const on = accountType === r.value;
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setAccountType(r.value)}
                        onDoubleClick={() => { setAccountType(r.value); setStep(2); }}
                        className="text-left rounded-lg px-3 py-2.5 flex items-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        style={{
                          background: on ? c + "24" : "#0d0d0d",
                          border: `1.5px solid ${on ? c : "#262626"}`,
                          boxShadow: on ? `0 0 18px ${c}40` : "none",
                        }}
                      >
                        <span className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: c + (on ? "33" : "1a") }}>
                          <Icon className="w-[18px] h-[18px]" style={{ color: c }} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-lg font-bold leading-tight" style={{ color: on ? "#fff" : "rgba(255,255,255,0.85)" }}>{r.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="pt-1">
              <AuthButton type="button" color={color} disabled={!role} onClick={() => setStep(2)}>
                {role ? `Continue as ${role.label}` : "Pick what you do"}
              </AuthButton>
            </div>
          </div>
          <AuthFoot>
            Already have an account? <Link to="/login" className="text-[#8CFF3D] font-semibold hover:underline">Sign in</Link>
          </AuthFoot>
        </AuthPanel>
      </AuthShell>
    );
  }

  const Icon = role?.icon;
  return (
    <AuthShell>
      <AuthPanel>
        <AuthHead
          step="STEP 2 OF 2"
          title="Create your account"
          aside={
            <button
              type="button"
              onClick={() => setStep(1)}
              className="shrink-0 mt-0.5 flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-md text-sm font-semibold transition-colors hover:brightness-125"
              style={{ color, background: color + "1f", border: `1px solid ${color}55` }}
              title="Change what you do"
            >
              <ChevronLeft className="w-4 h-4" />
              {Icon && <Icon className="w-4 h-4" />}
              {role?.label}
            </button>
          }
        />
        <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-4">
          <AuthField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <AuthField label="Password" password autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 6 characters" />
          <AuthField label="Confirm password" password autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <div className="pt-1">
            <AuthButton type="submit" color={color} disabled={loading}>{loading ? "Creating account..." : "Create account"}</AuthButton>
          </div>
          <AuthGoogle onClick={handleGoogle} />
        </form>
        <AuthFoot>
          Already have an account? <Link to="/login" className="text-[#8CFF3D] font-semibold hover:underline">Sign in</Link>
        </AuthFoot>
      </AuthPanel>
    </AuthShell>
  );
}

// After sign-up: the "check your email" step, as a boarding pass with a
// tear-off stub. The role's color runs along the top.
function BoardingPass({ email, role, color }) {
  const Icon = role?.icon;
  const cell = (k, v, c) => (
    <div className="min-w-0">
      <div className="text-[10px] tracking-[0.14em] text-white/40" style={{ fontFamily: SCENE_MONO }}>{k}</div>
      <div className="text-lg font-bold leading-tight mt-0.5 truncate" style={{ color: c || "#fff" }}>{v}</div>
    </div>
  );
  // Half-circle cut-outs where the stub tears off.
  const notch = "absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black";
  return (
    <AuthShell width={460}>
      <div className="rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#121212]" style={{ boxShadow: `0 24px 60px rgba(0,0,0,0.7), 0 0 40px ${color}22` }}>
        <div className="h-1.5" style={{ background: color }} />
        <div className="px-6 pt-5 pb-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-white text-[30px] font-bold tracking-wide leading-none">Boarding pass</h2>
            {Icon && (
              <span className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: color + "26" }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 mt-5">
            <div className="col-span-2">{cell("PASSENGER", email)}</div>
            {cell("ROLE", role?.label || "Pilot", color)}
            {cell("STATUS", "Confirm email", "#F59E0B")}
          </div>
        </div>

        <div className="relative h-6">
          <span className={`${notch} -left-3 border-r border-[#2a2a2a]`} />
          <span className={`${notch} -right-3 border-l border-[#2a2a2a]`} />
          <div className="absolute left-5 right-5 top-1/2 border-t-2 border-dashed border-[#2f2f2f]" />
        </div>

        <div className="px-6 pt-3 pb-6">
          <p className="text-white/75 text-base leading-snug">
            We sent a link to <span className="text-white font-semibold break-all">{email}</span>. Open it to confirm your account, then sign in.
          </p>
          <div
            aria-hidden="true"
            className="h-10 mt-4 rounded-sm opacity-70"
            style={{ background: "repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 4px, #fff 4px 5px, transparent 5px 9px, #fff 9px 12px, transparent 12px 14px)" }}
          />
          <Link
            to="/login"
            className="mt-5 w-full h-12 rounded-lg text-lg font-bold tracking-wide text-[#0d0d0d] flex items-center justify-center hover:brightness-110 transition-[filter]"
            style={{ background: color, boxShadow: `0 0 18px ${color}44` }}
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
