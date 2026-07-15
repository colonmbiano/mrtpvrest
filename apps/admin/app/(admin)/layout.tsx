"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import TrialBanner from "@/components/TrialBanner";
import { getUser } from "@/lib/auth";
import { AccentInjector } from "@/components/AccentInjector";
import FloatingVoiceAgent from "@/components/FloatingVoiceAgent";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import MobileAdminChrome from "@/components/mobile/MobileAdminChrome";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { ToastProvider, ConfirmProvider } from "@/components/ds";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const user = getUser();
    if (!user) router.push("/login");
  }, [router]);

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <AccentInjector />
      <div className="hidden md:block">
        <Sidebar />
      </div>
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
    </ConfirmProvider>
    </ToastProvider>
  );
}
