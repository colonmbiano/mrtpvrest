"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import { isAdminAuthed } from "@/lib/admin-auth";
import { DrawerContext } from "@/components/admin/atoms";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!isAdminAuthed()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--bd-1)] border-t-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <DrawerContext.Provider value={{ open: () => setDrawer(true) }}>
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="fixed left-0 top-0 z-30 hidden h-full lg:block">
          <AdminSidebar />
        </div>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
            <div className="absolute left-0 top-0 h-full">
              <AdminSidebar onNavigate={() => setDrawer(false)} />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Cerrar menú" className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-lg text-[#94a3b8]">
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <main className="px-4 py-5 md:px-7 md:py-7 lg:pl-[296px] lg:pr-7">{children}</main>
      </div>
    </DrawerContext.Provider>
  );
}
