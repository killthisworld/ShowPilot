import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Eye, EyeOff } from "lucide-react";

const ROLE_GROUPS = [
  {
    label: "Event Hosts",
    roles: [
      { value: "venue", label: "Venue" },
      { value: "promoter", label: "Promoter" },
    ],
  },
  {
    label: "Artist Side",
    roles: [
      { value: "booking_agent", label: "Booking Agent" },
      { value: "manager", label: "Manager" },
      { value: "band", label: "Band / Act Manager" },
    ],
  },
  {
    label: "Technical Production",
    roles: [
      { value: "engineer", label: "Audio Engineer" },
      { value: "lighting", label: "Lighting Tech" },
    ],
  },
];

export default function Register() {
  const [accountType, setAccountType] = useState("engineer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
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
      toast({ title: "Sign up failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      toast({ title: "Google sign-in failed", description: err.message, variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
          <p className="text-white/50 text-sm mb-6">
            We sent a confirmation link to <span className="text-white">{email}</span>. Click it to activate your account, then come back and sign in.
          </p>
          <Link to="/login" className="text-[#8CFF3D] hover:underline text-sm font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-1">
          Show<span className="text-[#8CFF3D]">Pilot</span>
        </h1>
        <p className="text-white/40 text-center text-sm mb-8">Create your account</p>

        <div className="mb-6 space-y-4">
          <Label className="text-white/50 text-xs block">I am a...</Label>
          {ROLE_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-white/30 text-[10px] uppercase tracking-widest font-semibold mb-1.5">{group.label}</p>
              <div className="grid grid-cols-2 gap-2">
                {group.roles.map((role) => (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setAccountType(role.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      accountType === role.value
                        ? "border-[#8CFF3D] bg-[#8CFF3D]/10 text-[#8CFF3D] font-medium"
                        : "border-[#2a2a2a] text-white/60 hover:border-[#3a3a3a] hover:text-white/80"
                    }`}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-white/50 text-xs">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 bg-[#161616] border-[#2a2a2a] text-white"
            />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Password</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-[#161616] border-[#2a2a2a] text-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-white/50 text-xs">Confirm Password</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="bg-[#161616] border-[#2a2a2a] text-white pr-10"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]">
            {loading ? "Creating account..." : "Sign Up"}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-[#222]" />
          <span className="text-xs text-white/30">or</span>
          <div className="h-px flex-1 bg-[#222]" />
        </div>

        <Button onClick={handleGoogle} variant="outline" className="w-full border-[#2a2a2a] text-white hover:bg-[#161616]">
          Continue with Google
        </Button>

        <p className="text-center text-sm text-white/40 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-[#8CFF3D] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
