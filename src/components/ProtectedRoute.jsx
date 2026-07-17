import React from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

// Renders the nested routes if logged in, otherwise renders `unauthenticatedElement`
// (e.g. a redirect to /login) passed in from App.jsx.
export default function ProtectedRoute({ unauthenticatedElement }) {
  const { user, isLoadingAuth } = useAuth();

  if (isLoadingAuth) return null; // App.jsx already shows a spinner during this phase

  if (!user) {
    return unauthenticatedElement;
  }

  return <Outlet />;
}
