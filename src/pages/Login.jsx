import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      navigate("/");
    } catch (err) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
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

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-1">
          Show<span className="text-[#8CFF3D]">Pilot</span>
        </h1>
        <p className="text-white/40 text-center text-sm mb-8">Sign in to your account</p>

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
          <div className="text-right">
            <Link to="/forgot-password" className="text-xs text-white/40 hover:text-[#8CFF3D]">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]">
            {loading ? "Signing in..." : "Sign In"}
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
          Don't have an account?{" "}
          <Link to="/register" className="text-[#8CFF3D] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
