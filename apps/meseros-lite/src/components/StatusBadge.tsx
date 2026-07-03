"use client";

import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle,
  ChefHat,
  Clock,
  Sparkles,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

export type OperationalStatus =
  | "free"
  | "open"
  | "kitchen"
  | "ready"
  | "served"
  | "cleaning"
  | "urgent"
  | "offline"
  | "error";

const statusConfig: Record<
  OperationalStatus,
  { color: string; soft: string; border: string; icon: LucideIcon }
> = {
  free: {
    color: "var(--success)",
    soft: "rgba(54, 214, 139, 0.12)",
    border: "rgba(54, 214, 139, 0.32)",
    icon: CheckCircle,
  },
  open: {
    color: "var(--warning)",
    soft: "rgba(246, 178, 59, 0.13)",
    border: "rgba(246, 178, 59, 0.34)",
    icon: Clock,
  },
  kitchen: {
    color: "var(--info)",
    soft: "rgba(56, 189, 248, 0.13)",
    border: "rgba(56, 189, 248, 0.34)",
    icon: ChefHat,
  },
  ready: {
    color: "var(--ready)",
    soft: "rgba(167, 139, 250, 0.14)",
    border: "rgba(167, 139, 250, 0.36)",
    icon: Bell,
  },
  served: {
    color: "var(--success)",
    soft: "rgba(54, 214, 139, 0.12)",
    border: "rgba(54, 214, 139, 0.32)",
    icon: Check,
  },
  cleaning: {
    color: "var(--cleaning)",
    soft: "rgba(148, 163, 184, 0.14)",
    border: "rgba(148, 163, 184, 0.34)",
    icon: Sparkles,
  },
  urgent: {
    color: "var(--danger)",
    soft: "rgba(239, 68, 68, 0.13)",
    border: "rgba(239, 68, 68, 0.34)",
    icon: AlertTriangle,
  },
  offline: {
    color: "var(--warning)",
    soft: "rgba(246, 178, 59, 0.13)",
    border: "rgba(246, 178, 59, 0.34)",
    icon: WifiOff,
  },
  error: {
    color: "var(--danger)",
    soft: "rgba(239, 68, 68, 0.13)",
    border: "rgba(239, 68, 68, 0.34)",
    icon: AlertCircle,
  },
};

export default function StatusBadge({
  status,
  label,
  className = "",
}: {
  status: OperationalStatus;
  label: string;
  className?: string;
}) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={[
        "inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase leading-none",
        className,
      ].join(" ")}
      style={{
        backgroundColor: config.soft,
        borderColor: config.border,
        color: config.color,
      }}
    >
      <Icon size={14} strokeWidth={2.7} aria-hidden="true" />
      {label}
    </span>
  );
}
