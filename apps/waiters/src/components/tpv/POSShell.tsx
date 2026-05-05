"use client";
import type { ReactNode } from "react";

export default function POSShell({
  rail,
  main,
  ticket,
}: {
  rail: ReactNode;
  main: ReactNode;
  ticket: ReactNode;
}) {
  return (
    <div
      className="h-screen w-screen overflow-hidden grid"
      style={{
        background: "var(--bg)",
        color: "var(--text-primary)",
        gridTemplateColumns: "64px 1fr 380px",
        fontFamily: "var(--font-body)",
      }}
    >
      <aside
        className="h-full overflow-y-auto scrollbar-hide"
        style={{ background: "var(--surface-1)", borderRight: "1px solid var(--border)" }}
      >
        {rail}
      </aside>

      <main className="h-full overflow-hidden flex flex-col">{main}</main>

      <aside
        className="h-full overflow-hidden flex flex-col"
        style={{ background: "var(--surface-1)", borderLeft: "1px solid var(--border)" }}
      >
        {ticket}
      </aside>
    </div>
  );
}
