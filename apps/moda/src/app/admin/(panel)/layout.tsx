"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import AdminSidebar from "@/components/AdminSidebar";
import { isAdminAuthed } from "@/lib/admin-auth";

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
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--bd-1)] border-t-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="fixed left-0 top-0 z-30 hidden h-full lg:block">
        <AdminSidebar />
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 h-full">
            <AdminSidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header
          className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 lg:hidden"
          style={{ background: "var(--surf-1)", borderBottom: "1px solid var(--bd-1)" }}
        >
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menú"
            className="grid h-10 w-10 place-items-center rounded-xl text-[var(--tx-hi)]"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-black tracking-tight text-[var(--tx-hi)]" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>
            MODA<span className="text-[var(--brand-primary)]">+</span> Admin
          </span>
          {drawer && (
            <button type="button" onClick={() => setDrawer(false)} className="ml-auto text-[var(--tx-mut)]">
              <X size={18} />
            </button>
          )}
        </header>

        <main className="px-4 py-5 md:px-8 md:py-7">{children}</main>
      </div>
    </div>
  );
}
