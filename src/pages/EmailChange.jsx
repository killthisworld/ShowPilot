import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AuthShell, { AuthPanel, AuthHead, AuthButton } from "@/components/showpilot/AuthShell";

// Where the "confirm your new email" links land. Supabase can ask for a
// click from both the old and the new inbox; after the first one it
// redirects here with #message=..., after the last with session tokens, and
// on a bad or expired link with #error_description=.... Read the URL once,
// at load, before the auth client tidies the hash away.
const INITIAL = (() => {
  if (typeof window === "undefined") return new URLSearchParams();
  const all = new URLSearchParams(window.location.search);
  new URLSearchParams(window.location.hash.replace(/^#/, "")).forEach((v, k) => all.set(k, v));
  return all;
})();

export default function EmailChange() {
  const { user, isLoadingAuth } = useAuth();
  const navigate = useNavigate();

  const error = INITIAL.get("error_description") || INITIAL.get("error");
  const message = INITIAL.get("message");
  const pending = user?.new_email;

  let title, sub;
  if (error) {
    title = "That link didn't work";
    sub = `${error.replace(/\+/g, " ")}. Links expire after a while and only work once. Send a fresh one from Settings.`;
  } else if (message) {
    title = "One down, one to go";
    sub = "Got that confirmation. Now open the matching email in your other inbox and click its link too. Your email switches once both are clicked.";
  } else if (isLoadingAuth) {
    title = "Checking your link...";
    sub = "";
  } else if (user && !pending) {
    title = "Email changed";
    sub = `You now sign in as ${user.email}.`;
  } else if (user && pending) {
    title = "Almost there";
    sub = `Your switch to ${pending} still needs the link from your other inbox.`;
  } else {
    title = "Email confirmed";
    sub = "Sign in to Show Pilot to keep going. Use your email and password, not Google, unless Google uses the same address.";
  }

  return (
    <AuthShell>
      <AuthPanel>
        <AuthHead title={title} sub={sub} />
        <div className="px-6 pt-5 pb-6">
          <AuthButton type="button" onClick={() => navigate(user ? "/" : "/login")}>
            {user ? "Go to Show Pilot" : "Sign in"}
          </AuthButton>
        </div>
      </AuthPanel>
    </AuthShell>
  );
}
