import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import AuthShell, { AuthPanel, AuthHead, AuthField, AuthButton } from "@/components/showpilot/AuthShell";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Type the same password in both boxes.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      toast({ title: "Password updated", description: "Sign in with your new password." });
      navigate("/login");
    } catch (err) {
      toast({ title: "Couldn't update your password", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <AuthShell>
      <AuthPanel>
        <AuthHead title="Set a new password" sub="Pick something you haven't used here before." />
        <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-4">
          <AuthField label="New password" password autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder="At least 6 characters" />
          <AuthField label="Confirm new password" password autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <div className="pt-1">
            <AuthButton type="submit" disabled={loading}>{loading ? "Updating..." : "Update password"}</AuthButton>
          </div>
        </form>
      </AuthPanel>
    </AuthShell>
  );
}
