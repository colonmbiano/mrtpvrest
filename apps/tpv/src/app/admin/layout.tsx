"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { Settings, Printer, Monitor, ArrowLeft } from "lucide-react";

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
    <div className="flex h-screen w-full" style={{ backgroundColor: "#0a0a0c", color: "#f8fafc", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
      `}</style>
      {/* SIDEBAR CONDICIONAL */}
      <aside className="w-64 border-r border-[#2d2d30] flex flex-col" style={{ backgroundColor: "#141417" }}>
        <div className="p-6 border-b border-[#2d2d30]">
          <h2 className="text-xl font-black tracking-tight" style={{ color: "#ffb84d" }}>Admin Panel</h2>
          <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest">{employee.name}</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin/menu" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[#ffb84d]/10 text-gray-300 hover:text-[#ffb84d]">
            <Settings size={18} /> <span className="font-semibold text-sm">Menú</span>
          </Link>
          <Link href="/admin/impresoras" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[#ffb84d]/10 text-gray-300 hover:text-[#ffb84d]">
            <Printer size={18} /> <span className="font-semibold text-sm">Impresoras</span>
          </Link>
          <Link href="/admin/tickets" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[#ffb84d]/10 text-gray-300 hover:text-[#ffb84d]">
            <Monitor size={18} /> <span className="font-semibold text-sm">Tickets</span>
          </Link>
        </nav>
        <div className="p-4 border-t border-[#2d2d30]">
          <Link href="/" className="flex items-center gap-2 px-4 py-3 rounded-xl transition-colors text-gray-400 hover:text-white hover:bg-[#2d2d30]">
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
