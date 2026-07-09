"use client";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, Toggle } from "@/components/ds";

/* Etiqueta de campo/grupo (mono, uppercase) — reutilizada por las secciones. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">{children}</div>;
}

/* Tarjeta de sección con encabezado (icono + título + subtítulo). */
export function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-5 md:p-6 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon size={16} className="shrink-0 text-tx-mid" />}
        <div className="min-w-0">
          <p className="font-display text-base font-extrabold text-tx-hi">{title}</p>
          {subtitle && <p className="mt-0.5 text-[12px] text-tx-mut">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

/* Tarjeta con interruptor a la derecha + contenido expandible opcional. */
export function ToggleCard({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  label,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon size={16} className="shrink-0 text-tx-mid" />
            <p className="font-display text-base font-extrabold text-tx-hi">{title}</p>
          </div>
          <p className="mt-1 text-[12px] text-tx-mut">{description}</p>
        </div>
        <Toggle checked={checked} onChange={onChange} label={label} />
      </div>
      {children}
    </Card>
  );
}
