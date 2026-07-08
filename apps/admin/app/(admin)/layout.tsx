"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import TrialBanner from "@/components/TrialBanner";
import { getUser } from "@/lib/auth";
import { AccentInjector } from "@/components/AccentInjector";
import FloatingVoiceAgent from "@/components/FloatingVoiceAgent";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import MobileAdminChrome from "@/components/mobile/MobileAdminChrome";
import AdminTopbar from "@/components/admin/AdminTopbar";

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
      <div className="hidden md:block">
        <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      </div>
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          aria-hidden="true"
        />
      )}
      <div className="md:ml-64 min-h-screen flex flex-col">
        <MobileAdminChrome />
        <div className="hidden md:block">
          <AdminTopbar />
        </div>
        <div className="hidden md:block"><TrialBanner /></div>
        <main className="mx-auto w-full max-w-[1440px] flex-1 pb-24 md:p-8 md:pb-8">
          <div className="hidden md:block"><OnboardingChecklist /></div>
          {/* Cada pantalla controla su propio padding vía <PageShell> (ds). */}
          {children}
        </main>
      </div>
      <div className="hidden md:block">
        {!pathname?.startsWith("/admin/reportes/ia") && <FloatingVoiceAgent />}
      </div>
    </div>
  );
}
