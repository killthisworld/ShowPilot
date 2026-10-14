import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { rememberSession, signOutCurrent } from "@/lib/accounts";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Check for an existing session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) rememberSession(session);
      setUser(session?.user || null);
      setIsLoadingAuth(false);
    });

    // Listen for login/logout events anywhere in the app
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Keep this account's saved session current for the account switcher.
      if (session) rememberSession(session);
      setUser(session?.user || null);
      setIsLoadingAuth(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signInWithGoogle = async (redirectPath) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectPath ? `${window.location.origin}${redirectPath}` : window.location.origin },
    });
    if (error) throw error;
  };

  const signUp = async (email, password, redirectTo, accountType) => {
    const options = {};
    if (redirectTo) options.emailRedirectTo = redirectTo;
    if (accountType) options.data = { account_type: accountType };
    const { data, error } = await supabase.auth.signUp({ email, password, options: Object.keys(options).length ? options : undefined });
    if (error) throw error;
    return data;
  };

  // Signs out the current account only; another account still signed in on
  // this device takes over (see lib/accounts.js).
  const signOut = async () => {
    await signOutCurrent();
  };

  const sendPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  // Starts an email change. Supabase emails a confirm link to the new
  // address; the account switches over only once that link is clicked.
  // Until then the old email keeps working and user.new_email holds the
  // pending address.
  const updateEmail = async (newEmail) => {
    const { data, error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/email-change` },
    );
    if (error) throw error;
    if (data?.user) setUser(data.user);
    return data;
  };

  // Changes the password from Settings. When the account already has a
  // password, the current one is checked first (by signing in with it), so
  // someone at an unlocked device can't change it, and the fresh sign-in
  // also satisfies Supabase's "recent login" rule for password changes.
  // Google-only accounts pass no current password and simply set one.
  const changePassword = async (currentPassword, newPassword) => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) throw new Error("You're signed out. Sign in again and retry.");
    if (currentPassword) {
      const { error } = await supabase.auth.signInWithPassword({ email: u.email, password: currentPassword });
      if (error) throw new Error("Your current password isn't right.");
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      if (/different from the old/i.test(error.message)) throw new Error("Pick a password you haven't used here before.");
      throw error;
    }
  };

  const navigateToLogin = () => { window.location.href = "/login"; };

  const value = {
    user,
    isLoadingAuth,
    isLoadingPublicSettings: false, // Base44 had a separate "public settings" load step; not needed with Supabase
    authError,
    setAuthError,
    navigateToLogin,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    sendPasswordReset,
    updatePassword,
    updateEmail,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
