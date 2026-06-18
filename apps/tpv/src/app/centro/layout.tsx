"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  BarChart3, ChefHat, Network, AlertTriangle, TrendingUp,
  ArrowLeft, LogOut, AlertCircle, Trash2, ShoppingCart,
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useHydrated } from "@/hooks/useClientValue";

const FINANCE_ROLES = ["OWNER", "ADMIN"] as const;

type ModuleStatus = "loading" | "ok" | "missing" | "denied" | "error";

const TABS = [
  { href: "/centro/resumen",     label: "Resumen",     Icon: BarChart3 },
  { href: "/centro/platos",      label: "Platos",      Icon: ChefHat },
  { href: "/centro/ingenieria",  label: "Ingeniería",  Icon: Network },
  { href: "/centro/variance",    label: "Variance",    Icon: AlertTriangle },
  { href: "/centro/costos",      label: "Costos",      Icon: TrendingUp },
  { href: "/centro/mermas",      label: "Mermas",      Icon: Trash2 },
  { href: "/centro/sugerencias", label: "Sugerencias", Icon: ShoppingCart },
] as const;

export default function CentroLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const employee = useAuthStore((s) => s.employee);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateFromStorage = useAuthStore((s) => s.hydrateFromStorage);
  const logout = useAuthStore((s) => s.logout);
  const hydrated = useHydrated();

  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>("loading");

  useEffect(() => {
    if (!isAuthenticated) hydrateFromStorage();
  }, [isAuthenticated, hydrateFromStorage]);

  const roleAllowed = useMemo(
    () => Boolean(employee && FINANCE_ROLES.includes(employee.role as typeof FINANCE_ROLES[number])),
    [employee],
  );

  // Validar acceso al módulo FINANCE via /api/modules. Si no está habilitado,
  // mostramos paywall propio sin redirigir — el usuario puede saber qué pasa.
  useEffect(() => {
    if (!hydrated) return;
    if (!employee) return;
    if (!roleAllowed) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/modules");
        if (cancelled) return;
        const finance = (data?.modules ?? []).find((m: any) => m.key === "FINANCE");
        if (!finance) {
          setModuleStatus("missing");
          return;
        }
        if (!finance.allowedByPlan) {
          setModuleStatus("missing"); // plan no incluye FINANCE
          return;
        }
        if (!finance.toggledOn && !finance.enabled) {
          setModuleStatus("denied"); // plan lo permite pero el tenant no lo activó
          return;
        }
        setModuleStatus("ok");
      } catch {
        if (!cancelled) setModuleStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [hydrated, employee, roleAllowed]);

  // Loaders y guards visuales — mantenemos estilo del /admin layout.
  if (!hydrated || !employee) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[var(--bg)] text-white">
        <div className="w-12 h-12 border-4 border-[var(--brand-soft)] border-t-[var(--brand)] rounded-full animate-spin mb-4" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Verificando credenciales…
        </span>
      </div>
    );
  }

  if (!roleAllowed) {
    return (
      <Forbidden
        title="Sólo administradores"
        message="El Centro Financiero está restringido a roles OWNER y ADMIN."
        ctaHref="/hub"
      />
    );
  }

  if (moduleStatus === "loading") {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[var(--bg)] text-white">
        <div className="w-12 h-12 border-4 border-[var(--brand-soft)] border-t-[var(--brand)] rounded-full animate-spin mb-4" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Verificando módulo…
        </span>
      </div>
    );
  }

  if (moduleStatus === "missing") {
    return (
      <Forbidden
        title="Módulo FINANCE no incluido"
        message="Tu plan actual no incluye el Centro Financiero. Actualiza a PRO o UNLIMITED para activar food cost en tiempo real, menu engineering, variance y más."
        ctaHref="/hub"
      />
    );
  }

  if (moduleStatus === "denied") {
    return (
      <Forbidden
        title="Módulo FINANCE desactivado"
        message="El Centro Financiero está disponible en tu plan pero no está activado. Pídele al OWNER que lo habilite desde Ajustes → Módulos."
        ctaHref="/hub"
      />
    );
  }

  if (moduleStatus === "error") {
    return (
      <Forbidden
        title="No pudimos verificar el módulo"
        message="Revisa tu conexión y vuelve a intentar."
        ctaHref="/hub"
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full select-none font-sans bg-[var(--bg)] text-[var(--text)]">
      {/* Top header — minimalista, con back al hub + avatar */}
      <header
        className="flex items-center justify-between px-4 md:px-6 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/hub")}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all"
            aria-label="Volver al hub"
          >
            <ArrowLeft size={18} className="text-white/70" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--brand-soft)] border border-[var(--brand)]">
              <BarChart3 size={16} className="text-[var(--brand)]" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                Centro
              </span>
              <span className="text-sm font-bold text-white">Financiero</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-[11px] font-bold text-white">{employee.name}</span>
            <span className="text-[9px] font-semibold tracking-[0.14em] text-white/40 uppercase">
              {employee.role}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { logout(); router.replace("/locked"); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} className="text-white/55" />
          </button>
        </div>
      </header>

      {/* Sub-tabs (pills horizontales scrolleables) */}
      <nav
        className="flex gap-1.5 px-3 md:px-6 py-3 border-b overflow-x-auto shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || (href === "/centro/resumen" && pathname === "/centro");
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-bold transition-all ${
                active
                  ? "text-[var(--brand-fg)] bg-[var(--brand)] shadow-[0_10px_30px_var(--brand-glow)]"
                  : "text-white/70 bg-white/5 border border-white/10 hover:bg-white/10"
              }`}
            >
              <Icon size={13} strokeWidth={active ? 2.8 : 2.2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-auto px-4 md:px-6 py-5">{children}</main>
    </div>
  );
}

function Forbidden({ title, message, ctaHref }: { title: string; message: string; ctaHref: string }) {
  return (
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[var(--bg)] text-white px-6">
      <div className="max-w-md text-center flex flex-col items-center gap-5">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[var(--brand-soft)] border border-[var(--brand)]">
          <AlertCircle size={26} className="text-[var(--brand)]" />
        </div>
        <div>
          <h2 className="text-xl font-black mb-2">{title}</h2>
          <p className="text-sm text-white/60 leading-relaxed">{message}</p>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black text-[var(--brand-fg)] bg-[var(--brand)] active:scale-95 transition-all"
        >
          <ArrowLeft size={14} strokeWidth={3} /> Volver
        </Link>
      </div>
    </div>
  );
}
