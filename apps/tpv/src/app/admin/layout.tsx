"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { Settings, Printer, Monitor, ArrowLeft, BarChart3, Users, CreditCard, ShieldCheck, ChevronRight } from "lucide-react";

const ADMIN_ROLES = ["OWNER", "ADMIN", "MANAGER"] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const employee = useAuthStore(s => s.employee);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const hydrateFromStorage = useAuthStore(s => s.hydrateFromStorage);
  const [hydrated, setHydrated] = useState(false);

  // Esperar a que Zustand hidrate desde storage antes de validar el rol.
  // Sin este gate el employee queda null en el primer render, el guard
  // dispara router.replace('/') y se forma un loop con / → /hub → /pos/order-type.
  useEffect(() => {
    if (!isAuthenticated) hydrateFromStorage();
    setHydrated(true);
  }, [isAuthenticated, hydrateFromStorage]);

  useEffect(() => {
    if (!hydrated) return;
    if (!employee) return; // todavía sin employee tras hidratar — esperar
    if (!ADMIN_ROLES.includes(employee.role as typeof ADMIN_ROLES[number])) {
      router.replace("/");
    }
  }, [hydrated, employee, router]);

  // Loader mientras hidrata o mientras llega el employee.
  if (!hydrated || !employee) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0a0a0c] text-white">
        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Verificando Credenciales...</span>
      </div>
    );
  }

  // Rol no autorizado tras hidratar — el effect ya lanzó replace; mostrar loader.
  if (!ADMIN_ROLES.includes(employee.role as typeof ADMIN_ROLES[number])) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0a0a0c] text-white">
        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Redirigiendo…</span>
      </div>
    );
  }

  const navItems = [
    { href: "/admin/reportes", label: "Analítica y Reportes", icon: BarChart3 },
    { href: "/admin/menu", label: "Catálogo de Menú", icon: Settings },
    { href: "/admin/impresoras", label: "Red e Impresión", icon: Printer },
    { href: "/admin/tickets", label: "Diseño de Tickets", icon: Monitor },
    { href: "/admin/usuarios", label: "Gestión de Personal", icon: Users },
    { href: "/admin/pagos", label: "Pagos e Impuestos", icon: CreditCard },
    { href: "/admin/seguridad", label: "Ciberseguridad", icon: ShieldCheck },
  ];

  return (
    <div className="flex h-screen w-full select-none bg-[#0a0a0c] font-sans">
      {/* SIDEBAR ADMIN WARM TECH */}
      <aside className="w-80 border-r border-white/5 flex flex-col bg-[#0a0a0c] relative z-30">
        {/* Glow sutil lateral */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden opacity-20">
           <div className="absolute top-0 -left-40 w-80 h-80 bg-amber-500/10 blur-[100px] rounded-full" />
        </div>

        <div className="relative z-10 p-10 border-b border-white/5 bg-black/20">
          <div className="flex flex-col gap-1.5">
             <span className="eyebrow text-amber-500">Configuración</span>
             <h2 className="text-2xl font-black text-white tracking-tight">Panel Central</h2>
          </div>
          <div className="mt-6 flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
             <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-[#0a0a0c] font-black text-xs">
                {employee.name.charAt(0).toUpperCase()}
             </div>
             <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate">{employee.name}</span>
                <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">{employee.role}</span>
             </div>
          </div>
        </div>

        <nav className="relative z-10 flex-1 p-6 space-y-2 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => (
            <Link 
              key={item.href}
              href={item.href} 
              className="flex items-center justify-between group px-5 py-4 rounded-2xl transition-all active:scale-95 text-zinc-500 active:bg-white/5 active:text-white"
            >
              <div className="flex items-center gap-4">
                <item.icon size={20} className="transition-colors group-active:text-amber-500" />
                <span className="font-bold text-[13px] tracking-tight">{item.label}</span>
              </div>
              <ChevronRight size={14} className="opacity-0 group-active:opacity-100 transition-opacity" />
            </Link>
          ))}
        </nav>

        <div className="relative z-10 p-8 border-t border-white/5">
          <Link 
            href="/" 
            className="flex items-center justify-center gap-3 h-14 rounded-2xl bg-[#121316] border border-white/5 text-zinc-400 font-black uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95 active:text-amber-500"
          >
            <ArrowLeft size={16} strokeWidth={3} />
            <span>Volver al TPV</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT - WARM TECH */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-full h-full pointer-events-none overflow-hidden opacity-10">
           <div className="absolute -top-60 -right-60 w-[600px] h-[600px] bg-amber-500/10 blur-[120px] rounded-full" />
        </div>
        
        <div className="relative z-10 min-h-full">
           {children}
        </div>
      </main>
    </div>
  );
}
