"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useHydrated } from "@/hooks/useClientValue";
import Link from "next/link";
import { Printer, Monitor, MonitorPlay, ArrowLeft, BarChart3, Users, CreditCard, ShieldCheck, Grid3x3, Layers, BookOpen, LogOut, TrendingUp, Scissors, SlidersHorizontal } from "lucide-react";
import api from "@/lib/api";

const ADMIN_ROLES = ["OWNER", "ADMIN", "MANAGER"] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const employee = useAuthStore(s => s.employee);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const hydrateFromStorage = useAuthStore(s => s.hydrateFromStorage);
  const logout = useAuthStore(s => s.logout);
  const hydrated = useHydrated();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [financeEnabled, setFinanceEnabled] = useState(false);

  // Verificar módulo FINANCE para decidir si mostramos el atajo a /centro.
  // Si falla, simplemente no mostramos — el TPV admin sigue funcionando.
  useEffect(() => {
    if (!hydrated || !employee) return;
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get("/api/modules");
        if (cancel) return;
        const fin = (data?.modules ?? []).find((m: any) => m.key === "FINANCE");
        setFinanceEnabled(Boolean(fin?.enabled && fin?.allowedByPlan));
      } catch {
        // silent — el módulo no se muestra pero el resto del admin sí
      }
    })();
    return () => { cancel = true; };
  }, [hydrated, employee]);

  // Esperar a que Zustand hidrate desde storage antes de validar el rol.
  // Sin este gate el employee queda null en el primer render, el guard
  // dispara router.replace('/') y se forma un loop con / → /hub → /pos/order-type.
  useEffect(() => {
    if (!isAuthenticated) hydrateFromStorage();
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
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[var(--bg)] text-white">
        <div className="w-12 h-12 border-4 border-[var(--brand-soft)] border-t-[var(--brand)] rounded-full animate-spin mb-4" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Verificando Credenciales...</span>
      </div>
    );
  }

  // Rol no autorizado tras hidratar — el effect ya lanzó replace; mostrar loader.
  if (!ADMIN_ROLES.includes(employee.role as typeof ADMIN_ROLES[number])) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[var(--bg)] text-white">
        <div className="w-12 h-12 border-4 border-[var(--brand-soft)] border-t-[var(--brand)] rounded-full animate-spin mb-4" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Redirigiendo…</span>
      </div>
    );
  }

  const navItems = [
    { href: "/admin",            label: "Inicio",                icon: BarChart3 },
    { href: "/admin/reportes",   label: "Reportes",              icon: BarChart3 },
    { href: "/admin/cortes",     label: "Cortes",                icon: Scissors },
    // Centro financiero (módulo FINANCE) — solo se muestra si el plan lo
    // incluye Y el tenant lo tiene activado. Cae fuera del /admin route group
    // a propósito porque tiene su propio layout (sub-tabs internas).
    ...(financeEnabled ? [{ href: "/centro", label: "Centro $", icon: TrendingUp }] : []),
    { href: "/admin/menu",       label: "Menú",                  icon: BookOpen },
    { href: "/admin/mesas",      label: "Mesas",                 icon: Grid3x3 },
    { href: "/admin/impresoras", label: "Impresoras",            icon: Printer },
    { href: "/admin/grupos-impresoras", label: "Grupos",         icon: Layers },
    { href: "/admin/tickets",    label: "Tickets",               icon: Monitor },
    { href: "/admin/usuarios",   label: "Personal",              icon: Users },
    { href: "/admin/pagos",      label: "Pagos",                 icon: CreditCard },
    { href: "/admin/apariencia", label: "General",               icon: SlidersHorizontal },
    { href: "/admin/pantalla",   label: "Pantalla",              icon: MonitorPlay },
    { href: "/admin/seguridad",  label: "Seguridad",             icon: ShieldCheck },
  ];

  return (
    <div
      className="flex h-[100dvh] w-full select-none font-sans"
      style={{ background: "var(--bg)" }}
    >
      {/* SIDEBAR ADMIN — solo iconos en columna delgada para no tapar
          modales en tablets pequeñas. Drawer mobile en <md (botón hamburguesa
          flotante). Uses --bg directamente para que respete data-mode="light". */}
      <aside
        className="hidden md:flex w-20 flex-col items-center py-6 gap-2 relative z-30 shrink-0"
        style={{
          background: "var(--bg)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Avatar/badge admin · click → dropdown con nombre/rol/logout */}
        <div className="relative mb-2">
          <button
            type="button"
            onClick={() => setAvatarOpen((v) => !v)}
            aria-label="Abrir menú de usuario"
            aria-expanded={avatarOpen}
            className="w-12 h-12 rounded-2xl bg-iris-soft flex items-center justify-center text-iris-500 font-black text-sm border border-iris-glow active:scale-95 transition-all hover:border-iris-500"
            title={`${employee.name} · ${employee.role}`}
          >
            {employee.name.charAt(0).toUpperCase()}
          </button>
          {avatarOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar menú de usuario"
                onClick={() => setAvatarOpen(false)}
                className="fixed inset-0 z-40 bg-transparent cursor-default"
              />
              <div className="absolute left-full top-0 ml-3 w-64 rounded-2xl bg-[#141417] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.5)] p-4 z-50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-iris-soft flex items-center justify-center text-iris-500 font-black border border-iris-glow shrink-0">
                    {employee.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{employee.name}</p>
                    <p className="text-[10px] font-black tracking-[0.25em] text-iris-500 uppercase">
                      {employee.role}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarOpen(false);
                    logout();
                    router.replace("/locked");
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-[0.2em] active:scale-95 transition-all"
                >
                  <LogOut size={14} strokeWidth={2.5} />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
        <div className="w-8 h-px bg-white/5 mb-2" />

        <nav className="flex-1 flex flex-col items-center gap-2 overflow-y-auto scrollbar-hide w-full px-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              title={item.label}
              aria-label={item.label}
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 text-zinc-500 active:bg-white/5 active:text-iris-500 hover:text-white"
            >
              <item.icon size={20} />
            </Link>
          ))}
        </nav>

        <div className="w-8 h-px bg-white/5 my-2" />
        <Link
          href="/"
          prefetch={false}
          title="Volver al TPV"
          aria-label="Volver al TPV"
          className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 active:scale-90 active:text-iris-500 transition-all"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
      </aside>

      {/* MAIN CONTENT - DISEÑO OPERATIVO */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-full h-full pointer-events-none overflow-hidden opacity-10">
           <div className="absolute -top-60 -right-60 w-[600px] h-[600px] bg-iris-soft blur-[120px] rounded-full" />
        </div>

        <div className="relative z-10 min-h-full">
           {children}
        </div>
      </main>
    </div>
  );
}
