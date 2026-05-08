"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { Settings, Printer, Monitor, ArrowLeft, BarChart3, Users, CreditCard, ShieldCheck, Grid3x3, Palette, Layers } from "lucide-react";

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
    // setHydrated en effect — necesario porque hydrateFromStorage es síncrono
    // pero queremos que el guard espere al siguiente render. Único caso donde
    // el set-state-in-effect es deliberado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    { href: "/admin",            label: "Inicio",                icon: BarChart3 },
    { href: "/admin/reportes",   label: "Reportes",              icon: BarChart3 },
    { href: "/admin/menu",       label: "Menú",                  icon: Settings },
    { href: "/admin/mesas",      label: "Mesas",                 icon: Grid3x3 },
    { href: "/admin/impresoras", label: "Impresoras",            icon: Printer },
    { href: "/admin/grupos-impresoras", label: "Grupos",         icon: Layers },
    { href: "/admin/tickets",    label: "Tickets",               icon: Monitor },
    { href: "/admin/usuarios",   label: "Personal",              icon: Users },
    { href: "/admin/pagos",      label: "Pagos",                 icon: CreditCard },
    { href: "/admin/apariencia", label: "Apariencia",            icon: Palette },
    { href: "/admin/seguridad",  label: "Seguridad",             icon: ShieldCheck },
  ];

  return (
    <div className="flex h-screen w-full select-none bg-[#0a0a0c] font-sans">
      {/* SIDEBAR ADMIN — solo iconos en columna delgada para no tapar
          modales en tablets pequeñas. Drawer mobile en <md (botón hamburguesa
          flotante). */}
      <aside className="hidden md:flex w-20 border-r border-white/5 flex-col items-center py-6 gap-2 bg-[#0a0a0c] relative z-30 shrink-0">
        {/* Avatar/badge admin */}
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500 font-black text-sm border border-amber-500/30 mb-2"
             title={`${employee.name} · ${employee.role}`}>
          {employee.name.charAt(0).toUpperCase()}
        </div>
        <div className="w-8 h-px bg-white/5 mb-2" />

        <nav className="flex-1 flex flex-col items-center gap-2 overflow-y-auto scrollbar-hide w-full px-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 text-zinc-500 active:bg-white/5 active:text-amber-500 hover:text-white"
            >
              <item.icon size={20} />
            </Link>
          ))}
        </nav>

        <div className="w-8 h-px bg-white/5 my-2" />
        <Link
          href="/"
          title="Volver al TPV"
          aria-label="Volver al TPV"
          className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 active:scale-90 active:text-amber-500 transition-all"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
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
