"use client";

/**
 * AdminScreen / AdminHeader / AdminTabs / AdminCard
 * ──────────────────────────────────────────────────────────────────────────
 * Scaffold ÚNICO para todas las pantallas del Panel Central del TPV
 * (/admin/*). Nace para matar los 4 "dialectos" de diseño que convivían en
 * esta zona (Obsidiana-glow, panel pizarra #121316, zinc minimal y tokens
 * semánticos), unificando el chrome en un solo lenguaje:
 *
 *   · Fondo + texto      → var(--bg) / var(--text-primary)  (respeta modo claro)
 *   · Acento             → var(--brand) / var(--brand-glow) (respeta la paleta:
 *                          Miel / Cian / Lima de /admin/apariencia)
 *   · Tipografía         → Outfit (font-sans del TPV)
 *   · Glow ámbar         → halo top-right que recolorea con la paleta
 *   · Encabezado         → BackButton + eyebrow "Configuración" + título + sub
 *
 * Antes cada pantalla hardcodeaba #0a0a0c/#0C0C0E/#ffb84d y un eyebrow distinto
 * (white/40, zinc-500, amber-500/80). Ahora todo sale de tokens → consistente
 * y temable. NO cambia ninguna lógica: es puro chrome presentacional.
 */

import React from "react";
import BackButton from "@/components/BackButton";

type IconType = React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties; className?: string }>;

// ── Wrapper de página ───────────────────────────────────────────────────────
export function AdminScreen({
  children,
  maxWidth = "max-w-6xl",
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  /** Ancho máximo del contenido. Default max-w-6xl (consistente en toda la zona). */
  maxWidth?: string;
  className?: string;
  /** Passthrough opcional (p.ej. cerrar un picker al tocar fuera). */
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className="relative min-h-full w-full overflow-hidden font-sans p-6 md:p-10"
      style={{ background: "var(--bg)", color: "var(--text-primary)" }}
      onClick={onClick}
    >
      {/* Glow de acento — usa var(--brand-glow) para recolorear con la paleta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)" }}
      />
      <div className={`relative z-10 mx-auto ${maxWidth} ${className}`}>{children}</div>
    </div>
  );
}

// ── Encabezado de pantalla ──────────────────────────────────────────────────
export function AdminHeader({
  eyebrow = "Configuración",
  title,
  subtitle,
  icon: Icon,
  action,
  back = true,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Icono opcional a la izquierda del título (recolorea con la marca). */
  icon?: IconType;
  /** Slot de acción a la derecha (botón Guardar, etc.). */
  action?: React.ReactNode;
  back?: boolean;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {back && <BackButton ariaLabel="Volver al panel admin" />}
        <div className="min-w-0 space-y-1.5">
          <span
            className="block text-[10px] font-semibold uppercase tracking-[0.25em]"
            style={{ color: "var(--brand)" }}
          >
            {eyebrow}
          </span>
          <h1
            className="flex items-center gap-3 text-3xl font-black leading-none tracking-tight md:text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            {Icon && <Icon size={28} style={{ color: "var(--brand)" }} />}
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Tabs (pill) ─────────────────────────────────────────────────────────────
export function AdminTabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: Array<{ key: T; label: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`mb-8 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border p-1 scrollbar-hide ${className}`}
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold tracking-tight transition-all active:scale-95"
            style={
              active
                ? { background: "var(--brand)", color: "var(--brand-fg)" }
                : { color: "var(--text-secondary)", background: "transparent" }
            }
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tarjeta de superficie ───────────────────────────────────────────────────
export function AdminCard({
  children,
  className = "",
  glass = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** glass = glassmorphism (white/5 + blur); false = superficie sólida surf-1. */
  glass?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border ${glass ? "bg-white/5 backdrop-blur-md" : ""} ${className}`}
      style={{
        borderColor: "var(--border)",
        ...(glass ? {} : { background: "var(--surface-1)" }),
      }}
    >
      {children}
    </div>
  );
}
