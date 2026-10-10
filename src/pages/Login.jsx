import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import AuthShell, { AuthPanel, AuthHead, AuthField, AuthButton, AuthGoogle, AuthFoot } from "@/components/showpilot/AuthShell";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      const params = new URLSearchParams(window.location.search);
      let redirectTo = params.get("redirect");
      if (!redirectTo) {
        try { redirectTo = sessionStorage.getItem("post_auth_redirect"); } catch {}
      }
      try { sessionStorage.removeItem("post_auth_redirect"); } catch {}
      navigate(redirectTo || "/");
    } catch (err) {
      toast({ title: "Couldn't sign you in", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirect");
      await signInWithGoogle(redirectTo);
    } catch (err) {
      toast({ title: "Google sign-in didn't work", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AuthShell>
      <AuthPanel>
        <AuthHead title="Welcome back" sub="Sign in to get to your shows." />
        <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-4">
          <AuthField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <AuthField
            label="Password"
            password
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            labelAside={<Link to="/forgot-password" className="text-sm text-white/45 hover:text-[#8CFF3D]">Forgot password?</Link>}
          />
          <div className="pt-1">
            <AuthButton type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</AuthButton>
          </div>
          <AuthGoogle onClick={handleGoogle} />
        </form>
        <AuthFoot>
          New to Show Pilot? <Link to="/register" className="text-[#8CFF3D] font-semibold hover:underline">Create an account</Link>
        </AuthFoot>
      </AuthPanel>
    </AuthShell>
  );
}
