"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import TrialBanner from "@/components/TrialBanner";
import { getUser } from "@/lib/auth";
import { AccentInjector } from "@/components/AccentInjector";
import FloatingVoiceAgent from "@/components/FloatingVoiceAgent";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) router.push("/login");
  }, [router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <AccentInjector />
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          aria-hidden="true"
        />
      )}
      <div className="md:ml-56 min-h-screen flex flex-col">
        <div
          className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
          style={{ background: "var(--surf)", borderBottom: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span
            className="font-black text-sm tracking-tighter"
            style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}
          >
            MRTPV<span style={{ color: "var(--brand-primary)" }}>REST</span>
          </span>
          <div style={{ width: 40 }} aria-hidden="true" />
        </div>
        <TrialBanner />
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
      <FloatingVoiceAgent />
    </div>
  );
}
