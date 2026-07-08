"use client";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { Button } from "./button";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-ds-sm bg-surf-2 ${className}`} />;
}

export function LoadingCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-ds-lg" />
      ))}
    </div>
  );
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-tx-mut">{label}</div>
      <Skeleton className="mb-2 h-10" />
      <Skeleton className="mb-2 h-10" />
      <Skeleton className="h-10" />
    </Card>
  );
}

export function ErrorState({
  title = "No pudimos cargar la información",
  hint = "Revisa tu conexión e inténtalo de nuevo.",
  onRetry,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="p-6 text-center">
      <div className="font-display text-lg font-extrabold text-tx-hi">{title}</div>
      <p className="mx-auto mt-2 max-w-sm text-sm text-tx-mut">{hint}</p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button onClick={onRetry}>Reintentar</Button>
        </div>
      )}
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-ds-lg text-tx-mut" style={{ background: "var(--surf-2)" }}>
          <Icon size={24} strokeWidth={1.8} />
        </span>
      )}
      <div className="font-display text-base font-extrabold text-tx-hi">{title}</div>
      {hint && <p className="mx-auto mt-1.5 max-w-xs text-sm text-tx-mut">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
