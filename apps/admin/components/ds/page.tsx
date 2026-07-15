"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { TAB_SETS, type TabSetKey } from "@/lib/nav";

/* ── Shell de página ─────────────────────────────────────────────── */
export function PageShell({
  children,
  width = "default",
  className = "",
}: {
  children: ReactNode;
  width?: "default" | "wide" | "full";
  className?: string;
}) {
  const maxW = width === "full" ? "max-w-none" : width === "wide" ? "max-w-[1440px]" : "max-w-[1320px]";
  return (
    <div className={`ds-enter mx-auto w-full ${maxW} px-[18px] pb-28 pt-3 md:px-8 md:pb-12 md:pt-6 ${className}`}>
      {children}
    </div>
  );
}

/* ── Header de página (desktop; móvil usa MobileAdminChrome) ─────── */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  backHref,
  mobileActions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backHref?: string;
  /**
   * Acción(es) a mostrar en móvil, donde el título lo pone MobileAdminChrome y
   * este header está `hidden`. Es el reemplazo recomendado del bloque
   * `md:hidden` manual: colócala aquí y la pantalla obtiene su acción primaria
   * en celular sin markup aparte. Opt-in: si no se pasa, no se muestra nada
   * (las pantallas con su propio bloque móvil bespoke siguen igual).
   */
  mobileActions?: ReactNode;
}) {
  const mobile = mobileActions ?? null;
  return (
    <>
      <header className="mb-6 hidden items-end justify-between gap-4 md:flex">
        <div className="min-w-0">
          {backHref && (
            <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-tx-mut transition-colors hover:text-tx">
              <ArrowLeft size={13} /> Volver
            </Link>
          )}
          {eyebrow && (
            <div className="font-mono text-[11px] uppercase tracking-[.16em] text-primary">{eyebrow}</div>
          )}
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-.04em] text-tx-hi">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-tx-mut">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {mobile ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 md:hidden">{mobile}</div>
      ) : null}
    </>
  );
}

/* ── Tabs de hub (Reportes/Menú/Inventario/Finanzas) ─────────────── */
export function PageTabs({ set, className = "" }: { set: TabSetKey; className?: string }) {
  const pathname = usePathname();
  const tabs = TAB_SETS[set];
  return (
    <nav className={`ds-scrollbar -mx-[18px] mb-5 flex gap-1 overflow-x-auto px-[18px] md:mx-0 md:px-0 ${className}`} aria-label="Secciones">
      <div className="flex gap-1 rounded-ds-md p-1" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex min-h-9 shrink-0 items-center rounded-[9px] px-3.5 text-xs font-bold transition-colors"
              style={{
                color: active ? "var(--tx-hi)" : "var(--tx-mut)",
                background: active ? "var(--surf-1)" : "transparent",
                boxShadow: active ? "var(--shadow-sm)" : "none",
              }}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Toolbar: búsqueda + filtros + acciones sobre listas ─────────── */
export function Toolbar({
  search,
  filters,
  actions,
  className = "",
}: {
  search?: { value: string; onChange: (next: string) => void; placeholder?: string };
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2.5 ${className}`}>
      {search && (
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-dim" />
          <input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Buscar…"}
            className="h-10 w-full rounded-ds-md pl-9 pr-3 text-[13px] outline-none transition-shadow focus:shadow-[0_0_0_4px_var(--accent-soft)]"
            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
          />
        </div>
      )}
      {filters}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
