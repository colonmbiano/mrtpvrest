"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { Settings, Printer, Monitor, ArrowLeft, BarChart3, Users, CreditCard, ShieldCheck } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const employee = useAuthStore(s => s.employee);

  useEffect(() => {
    if (!employee || (employee.role !== "ADMIN" && employee.role !== "OWNER")) {
      router.replace("/");
    }
  }, [employee, router]);

  if (!employee || (employee.role !== "ADMIN" && employee.role !== "OWNER")) {
    return <div className="h-screen w-full flex items-center justify-center bg-[#0a0a0c]">Verificando permisos...</div>;
  }

  return (
    <div className="flex h-screen w-full font-mono select-none" style={{ backgroundColor: "#0C0C0E", color: "var(--text-primary)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
      `}</style>
      {/* SIDEBAR CONDICIONAL */}
      <aside className="w-64 border-r border-[#27272A] flex flex-col" style={{ backgroundColor: "#131316" }}>
        <div className="p-6 border-b border-[#27272A]">
          <h2 className="text-xl font-black tracking-tight" style={{ color: "var(--brand)" }}>Admin Panel</h2>
          <p className="text-xs mt-1 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{employee.name}</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin/reportes" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[#A1A1AA] hover:text-[var(--brand)]">
            <BarChart3 size={18} /> <span className="font-semibold text-sm">Reportes</span>
          </Link>
          <Link href="/admin/menu" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[#A1A1AA] hover:text-[var(--brand)]">
            <Settings size={18} /> <span className="font-semibold text-sm">Menú</span>
          </Link>
          <Link href="/admin/impresoras" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[#A1A1AA] hover:text-[var(--brand)]">
            <Printer size={18} /> <span className="font-semibold text-sm">Impresoras</span>
          </Link>
          <Link href="/admin/tickets" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[#A1A1AA] hover:text-[var(--brand)]">
            <Monitor size={18} /> <span className="font-semibold text-sm">Tickets</span>
          </Link>
          <Link href="/admin/usuarios" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[#A1A1AA] hover:text-[var(--brand)]">
            <Users size={18} /> <span className="font-semibold text-sm">Usuarios</span>
          </Link>
          <Link href="/admin/pagos" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[#A1A1AA] hover:text-[var(--brand)]">
            <CreditCard size={18} /> <span className="font-semibold text-sm">Pagos e Impuestos</span>
          </Link>
          <Link href="/admin/seguridad" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[#A1A1AA] hover:text-[var(--brand)]">
            <ShieldCheck size={18} /> <span className="font-semibold text-sm">Seguridad</span>
          </Link>
        </nav>
        <div className="p-4 border-t border-[#27272A]">
          <Link href="/" className="flex items-center gap-2 px-4 py-3 rounded-xl transition-colors text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#1A1A1E]">
            <ArrowLeft size={18} /> <span className="font-semibold text-sm">Volver al TPV</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
