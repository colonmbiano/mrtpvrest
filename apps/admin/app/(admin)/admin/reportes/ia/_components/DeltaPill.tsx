"use client";
import type { ReactNode } from "react";

/* Pastilla de variación (↑/↓ x.x%) con tono ok/err — usada en KPIs y tabla. */
export function DeltaPill({ up, children }: { up: boolean; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold"
      style={{
        color: up ? "var(--ok)" : "var(--err)",
        background: up ? "var(--ok-soft)" : "var(--err-soft)",
      }}
    >
      {children}
    </span>
  );
}
