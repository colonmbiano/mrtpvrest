"use client";

import React, { useEffect } from "react";
import {
  ArrowRight,
  Bike,
  LogOut,
  Receipt,
  Settings,
  ShoppingBag,
  Table2,
  Utensils,
  Wallet,
} from "lucide-react";
import type { OrderType } from "@/components/tpv/TicketPanel";
import UserBadge from "@/components/UserBadge";

export type ExtendedOrderType = OrderType;

interface OrderTypeSelectorProps {
  onSelect: (type: ExtendedOrderType) => void;
  onClose?: () => void;
  onOpenTickets?: () => void;
  onShiftClose?: () => void;
  onConfig?: () => void;
}

type OrderTypeCard = {
  id: OrderType;
  title: string;
  description: string;
  nextStep: string;
  icon: typeof Utensils;
  accent: string;
  shortcut: string;
};

const ORDER_TYPES: OrderTypeCard[] = [
  {
    id: "DINE_IN",
    title: "Comer Aquí",
    description: "Servicio en salón con mesa, comensales y rondas.",
    nextStep: "Elegir mesa",
    icon: Utensils,
    accent: "#ff8400",
    shortcut: "1",
  },
  {
    id: "TAKEOUT",
    title: "Para Llevar",
    description: "Pedido rápido de mostrador sin mesa asignada.",
    nextStep: "Ir al menú",
    icon: ShoppingBag,
    accent: "#3b82f6",
    shortcut: "2",
  },
  {
    id: "DELIVERY",
    title: "Delivery",
    description: "Venta preparada para reparto y seguimiento.",
    nextStep: "Ir al menú",
    icon: Bike,
    accent: "#10b981",
    shortcut: "3",
  },
];

const SHORTCUTS = [
  {
    label: "Pedidos abiertos",
    description: "Retomar cuentas activas",
    icon: Receipt,
    tone: "text-amber-300 bg-amber-500/10 border-amber-500/20",
    action: "tickets" as const,
  },
  {
    label: "Corte de caja",
    description: "Cerrar y cuadrar turno",
    icon: Wallet,
    tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    action: "shift" as const,
  },
  {
    label: "Panel central",
    description: "Ajustes y operación",
    icon: Settings,
    tone: "text-orange-200 bg-[#ff8400]/15 border-[#ff8400]/30",
    action: "config" as const,
  },
];

const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({
  onSelect,
  onClose,
  onOpenTickets,
  onShiftClose,
  onConfig,
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const match = ORDER_TYPES.find((type) => type.shortcut === event.key);
      if (match) {
        event.preventDefault();
        onSelect(match.id);
        return;
      }

      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onSelect]);

  const runShortcut = (action: (typeof SHORTCUTS)[number]["action"]) => {
    if (action === "tickets") onOpenTickets?.();
    if (action === "shift") onShiftClose?.();
    if (action === "config") onConfig?.();
  };

  const enabledShortcuts = SHORTCUTS.filter((shortcut) => {
    if (shortcut.action === "tickets") return Boolean(onOpenTickets);
    if (shortcut.action === "shift") return Boolean(onShiftClose);
    if (shortcut.action === "config") return Boolean(onConfig);
    return false;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col overflow-y-auto overflow-x-hidden bg-[#0C0C0E] px-4 py-[max(1rem,env(safe-area-inset-top))] text-white sm:px-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,132,0,0.10), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 42%)",
        }}
      />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#ff8400]/25 bg-[#ff8400]/10 text-[#ffb84d]">
            <Table2 size={22} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
              Panel operativo
            </p>
            <h1 className="truncate text-lg font-black leading-tight tracking-tight sm:text-2xl">
              Nueva venta
            </h1>
          </div>
        </div>

        <div className="hidden min-w-0 sm:block">
          <UserBadge />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center py-5 sm:py-8">
        <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-xl border border-white/10 bg-white/[0.045] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-4">
            <div className="mb-3 flex items-end justify-between gap-4 px-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ffb84d]">
                  Tipo de pedido
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight sm:text-3xl">
                  ¿Cómo empieza la cuenta?
                </h2>
              </div>
              <p className="hidden max-w-[220px] text-right text-xs font-semibold leading-snug text-white/45 sm:block">
                Elige el flujo correcto antes de cargar productos.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {ORDER_TYPES.map((type) => {
                const Icon = type.icon;

                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => onSelect(type.id)}
                    className="group relative flex min-h-[168px] flex-col justify-between rounded-lg border border-white/10 bg-[#131316]/90 p-4 text-left shadow-md shadow-black/25 transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#ffb84d]/70 sm:min-h-[220px]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-lg border"
                        style={{
                          backgroundColor: `${type.accent}1f`,
                          borderColor: `${type.accent}40`,
                          color: type.accent,
                        }}
                      >
                        <Icon size={24} strokeWidth={2.5} />
                      </div>
                      <span
                        className="flex h-8 min-w-8 items-center justify-center rounded-lg border text-sm font-black"
                        style={{
                          backgroundColor: `${type.accent}14`,
                          borderColor: `${type.accent}30`,
                          color: type.accent,
                        }}
                      >
                        {type.shortcut}
                      </span>
                    </div>

                    <div className="mt-6">
                      <h3 className="text-2xl font-black leading-tight tracking-tight sm:text-3xl">
                        {type.title}
                      </h3>
                      <p className="mt-2 min-h-[44px] text-sm font-medium leading-snug text-white/55">
                        {type.description}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-white/40">
                        {type.nextStep}
                      </span>
                      <ArrowRight
                        size={18}
                        strokeWidth={3}
                        className="text-white/40 transition-transform group-active:translate-x-0.5"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="rounded-xl border border-white/10 bg-[#131316]/80 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">
                  Turno
                </p>
                <h2 className="mt-1 text-lg font-black tracking-tight">
                  Accesos rápidos
                </h2>
              </div>
              <div className="sm:hidden">
                <UserBadge expanded={false} />
              </div>
            </div>

            <div className="grid gap-2">
              {enabledShortcuts.map((shortcut) => {
                const Icon = shortcut.icon;

                return (
                  <button
                    key={shortcut.action}
                    type="button"
                    onClick={() => runShortcut(shortcut.action)}
                    className="group flex min-h-[76px] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-left transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#ffb84d]/70"
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${shortcut.tone}`}
                    >
                      <Icon size={21} strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-white">
                        {shortcut.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-white/40">
                        {shortcut.description}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      strokeWidth={3}
                      className="shrink-0 text-white/25"
                    />
                  </button>
                );
              })}
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/45 transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-red-400/70"
              >
                <LogOut size={15} strokeWidth={2.5} />
                Bloquear terminal
              </button>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default OrderTypeSelector;
