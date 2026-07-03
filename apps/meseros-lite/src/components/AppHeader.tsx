"use client";

import type { ReactNode } from "react";
import { AlertCircle, RotateCw, Wifi, WifiOff } from "lucide-react";

export type ConnectionStatus = "online" | "offline" | "syncing" | "error";

const connectionCopy: Record<ConnectionStatus, string> = {
  online: "Sincronizado",
  offline: "Sin WiFi",
  syncing: "Sincronizando",
  error: "Error sync",
};

export default function AppHeader({
  title,
  subtitle,
  connectionStatus,
  rightAction,
}: {
  title: string;
  subtitle?: string;
  connectionStatus: ConnectionStatus;
  rightAction?: ReactNode;
}) {
  const Icon =
    connectionStatus === "online"
      ? Wifi
      : connectionStatus === "syncing"
        ? RotateCw
        : connectionStatus === "error"
          ? AlertCircle
          : WifiOff;
  const color =
    connectionStatus === "online"
      ? "var(--success)"
      : connectionStatus === "error"
        ? "var(--danger)"
        : "var(--warning)";

  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {subtitle && (
          <p className="truncate text-sm font-black uppercase tracking-wide text-[var(--text-secondary)]">
            {subtitle}
          </p>
        )}
        <h1 className="truncate font-display text-[28px] font-black leading-tight text-[var(--text-primary)]">
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="hidden min-h-[36px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 text-xs font-black uppercase sm:inline-flex"
          style={{ color }}
        >
          <Icon
            size={14}
            strokeWidth={2.6}
            className={connectionStatus === "syncing" ? "animate-spin" : undefined}
          />
          {connectionCopy[connectionStatus]}
        </span>
        {rightAction}
      </div>
    </header>
  );
}
