"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import TrialBanner from "@/components/TrialBanner";
import { getUser } from "@/lib/auth";
import { AccentInjector } from "@/components/AccentInjector";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const user = getUser();
    if (!user) router.push("/login");
  }, [router]);

  return (
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <AccentInjector />
      <Sidebar />
      <div className="ml-56 min-h-screen flex flex-col">
        <TrialBanner />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
