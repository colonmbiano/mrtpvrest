"use client";
import React from "react";

// Layout independiente para rutas /super/* del admin.
// No comparte sidebar con (admin) ni middleware tenant — es panel SuperAdmin.
export default function SuperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "#0a0a0c",
        color: "white",
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
