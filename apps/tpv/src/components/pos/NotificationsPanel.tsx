"use client";
import React, { useRef, useEffect } from "react";
import {
  X, Bell, ShoppingBag, Monitor, ChefHat,
  Truck, CreditCard, RefreshCw, Trash2,
} from "lucide-react";
import { useNotifStore, type Notification, type NotifType } from "@/hooks/useNotifications";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const TYPE_CONFIG: Record<
  NotifType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  order_new:       { icon: ShoppingBag, color: "#5e6ad2", bg: "rgba(94,106,210,0.12)" },
  order_kiosk:     { icon: Monitor,     color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  order_ready:     { icon: ChefHat,     color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  order_delivered: { icon: Truck,       color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  order_paid:      { icon: CreditCard,  color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  order_updated:   { icon: RefreshCw,   color: "#8a8f98", bg: "rgba(138,143,152,0.12)" },
};

// ─── Componente principal ─────────────────────────────────────────────────────

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Coordenadas de anclaje del botón campana para posicionar el panel */
  anchorRef?: React.RefObject<HTMLButtonElement>;
}

export default function NotificationsPanel({
  isOpen,
  onClose,
}: NotificationsPanelProps) {
  const { notifications, unreadCount, markAllRead, markRead, clear } =
    useNotifStore();

  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Marcar como leídas al abrir
  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      const t = setTimeout(markAllRead, 1500);
      return () => clearTimeout(t);
    }
  }, [isOpen, unreadCount, markAllRead]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay invisible para cerrar al hacer clic fuera */}
      <div className="fixed inset-0 z-[140]" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed z-[150] flex flex-col"
        style={{
          top: 72,
          left: 88, // justo a la derecha del sidebar (80px)
          width: 380,
          maxHeight: "calc(100dvh - 96px)",
          background: "var(--surface-1)",
          border: "1px solid var(--border-strong)",
          borderRadius: 20,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "slideDownFade 0.18s ease",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              <Bell size={18} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                Notificaciones
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {unreadCount > 0
                  ? `${unreadCount} sin leer`
                  : notifications.length === 0
                  ? "Sin notificaciones"
                  : "Todo al día ✓"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <button
                onClick={clear}
                title="Limpiar todo"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {notifications.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col p-3 gap-1.5">
              {notifications.map((n) => (
                <NotifItem
                  key={n.id}
                  notif={n}
                  onRead={() => markRead(n.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideDownFade {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </>
  );
}

// ─── NotifItem ────────────────────────────────────────────────────────────────

function NotifItem({ notif, onRead }: { notif: Notification; onRead: () => void }) {
  const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.order_updated;
  const Icon = cfg.icon;

  return (
    <li
      onClick={onRead}
      className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all"
      style={{
        background: notif.read ? "transparent" : "var(--surface-2)",
        border: `1px solid ${notif.read ? "transparent" : "var(--border)"}`,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = notif.read
          ? "transparent"
          : "var(--surface-2)";
      }}
    >
      {/* Ícono */}
      <div
        className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center mt-0.5"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={16} />
      </div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-[13px] font-semibold leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {notif.title}
          </p>
          <span
            className="text-[10px] shrink-0 mt-0.5 tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {timeAgo(notif.createdAt)}
          </span>
        </div>
        <p
          className="text-[11px] mt-0.5 leading-snug line-clamp-2"
          style={{ color: "var(--text-muted)" }}
        >
          {notif.body}
        </p>
        {/* Punto de no leído */}
        {!notif.read && (
          <div
            className="mt-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--brand)" }}
          />
        )}
      </div>
    </li>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-4 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--surface-2)" }}
      >
        <Bell size={28} style={{ color: "var(--text-muted)" }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          Sin notificaciones
        </p>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          Los pedidos en línea, entregas y<br />cambios de estado aparecerán aquí.
        </p>
      </div>
    </div>
  );
}
