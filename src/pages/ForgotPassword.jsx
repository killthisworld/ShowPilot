import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import AuthShell, { AuthPanel, AuthHead, AuthField, AuthButton, AuthFoot } from "@/components/showpilot/AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { sendPasswordReset } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      toast({ title: "Couldn't send the reset link", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const back = (
    <AuthFoot>
      <Link to="/login" className="text-[#8CFF3D] font-semibold hover:underline">Back to sign in</Link>
    </AuthFoot>
  );

  return (
    <AuthShell>
      <AuthPanel>
        {submitted ? (
          <>
            <AuthHead title="Check your email" />
            <p className="px-6 pt-4 pb-6 text-white/70 text-base leading-snug">
              If there's an account for <span className="text-white font-semibold break-all">{email}</span>, a link to set a new password is on its way.
            </p>
          </>
        ) : (
          <>
            <AuthHead title="Reset your password" sub="We'll email you a link to set a new one." />
            <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-4">
              <AuthField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <div className="pt-1">
                <AuthButton type="submit" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</AuthButton>
              </div>
            </form>
          </>
        )}
        {back}
      </AuthPanel>
    </AuthShell>
  );
}
