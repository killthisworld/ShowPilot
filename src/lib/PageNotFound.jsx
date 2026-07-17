import React from "react";
import { Link } from "react-router-dom";

export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold text-white mb-2">404</h1>
      <p className="text-white/50 mb-6">This page doesn't exist.</p>
      <Link to="/" className="text-[#8CFF3D] hover:underline text-sm font-medium">
        Back to Home
      </Link>
    </div>
  );
}
