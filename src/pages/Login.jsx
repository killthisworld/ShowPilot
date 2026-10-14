import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { savedAccounts, switchToAccount } from "@/lib/accounts";
import AuthShell, { AuthPanel, AuthHead, AuthField, AuthButton, AuthGoogle, AuthFoot } from "@/components/showpilot/AuthShell";

export default function Login() {
  // ?add=1: signing in to a second account from the account switcher.
  // ?email=: that account's address, pre-filled (e.g. its saved sign-in
  // expired and it needs the password again).
  const query = new URLSearchParams(window.location.search);
  const adding = query.get("add") === "1";
  const [email, setEmail] = useState(query.get("email") || "");
  const others = adding ? savedAccounts() : [];
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Already signed in (e.g. landed here through browser back): go on to
  // the app instead of showing a sign-in form that looks like a sign-out.
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let redirectTo = new URLSearchParams(window.location.search).get("redirect");
    if (!redirectTo) {
      try { redirectTo = sessionStorage.getItem("post_auth_redirect"); } catch {}
    }
    try { sessionStorage.removeItem("post_auth_redirect"); } catch {}
    navigate(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/", { replace: true });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Replace, so back from the next screen never lands on Sign in. (The
      // signed-in check above usually gets there first.)
      if (window.location.pathname === "/login") navigate(redirectTo || "/", { replace: true });
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
        {adding
          ? <AuthHead title="Add another account" sub="Sign in to your other account. Switch between them any time from Settings." />
          : <AuthHead title="Welcome back" sub="Sign in to get to your shows." />}
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
        {others.length > 0 && (
          <div className="px-6 pb-4 -mt-2 text-center">
            <button type="button" onClick={() => switchToAccount(others[0].id)} className="text-sm text-white/55 hover:text-white">
              Cancel and go back to {others[0].name || others[0].email}
            </button>
          </div>
        )}
        <AuthFoot>
          New to Show Pilot? <Link to="/register" className="text-[#8CFF3D] font-semibold hover:underline">Create an account</Link>
        </AuthFoot>
      </AuthPanel>
    </AuthShell>
  );
}
