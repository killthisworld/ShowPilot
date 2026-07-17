import React from "react";

// Base44 used this when a logged-in user existed in auth but not in the app's
// own user table. With Supabase, our database trigger (see schema.sql) auto-creates
// a matching `profiles` row on signup, so this state should rarely occur.
// Kept as a fallback in case that trigger ever fails.
export default function UserNotRegisteredError() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-white mb-2">Account Setup Issue</h1>
      <p className="text-white/50 max-w-sm">
        We couldn't find your profile. Please try signing out and back in, or contact support if this continues.
      </p>
    </div>
  );
}
