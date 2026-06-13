"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bike,
  ChevronRight,
  Clock,
  Coins,
  Globe,
  LogOut,
  Menu,
  Phone,
  Receipt,
  Settings,
  ShoppingBag,
  Table2,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import type { OrderType } from "@/components/tpv/TicketPanel";
import UserBadge from "@/components/UserBadge";

export type ExtendedOrderType = OrderType;

/**
 * Cuenta abierta lista para retomarse desde la pantalla de inicio.
 * El `id` permite que el caller resuelva la orden cruda y entre directo
 * (set ticket + activeOrder + navegar al menú).
 */
export interface OpenAccount {
  id: string;
  orderNumber: string;
  /** Nombre del cliente o etiqueta del ticket; en DINE_IN se usa la mesa. */
  customerName: string;
  /** Tipo crudo del enum (DINE_IN / TAKEOUT / DELIVERY). */
  rawType: OrderType;
  /** Nombre de la mesa (solo DINE_IN). */
  tableName: string | null;
  /** Teléfono del cliente (TAKEOUT / DELIVERY). */
  phone: string | null;
  numberOfGuests: number | null;
  itemsCount: number;
  total: number;
  status: string;
  createdAt?: string;
  driver?: string | null;
  /** Pedido originado en la tienda web / WhatsApp — se distingue en color. */
  isWeb?: boolean;
}

// Color "web" de la app (índigo), reutilizado del badge de pedidos web.
const WEB_ACCENT = "#5e6ad2";

interface OrderTypeSelectorProps {
  onSelect: (type: ExtendedOrderType) => void;
  onClose?: () => void;
  /** Tap sobre una cuenta abierta → entrar directo a ella. */
  onOpenAccount?: (id: string) => void;
  onShiftClose?: () => void;
  onExpenses?: () => void;
  onConfig?: () => void;
  /** Cuentas en curso (mesa, llevar, domicilio). */
  openAccounts?: OpenAccount[];
  /**
   * Tipos de orden que la sucursal acepta (subset de DINE_IN / TAKEOUT /
   * DELIVERY) según su TpvRemoteConfig. Un bar, por ejemplo, suele recibir
   * solo ["DINE_IN"] y aquí ocultamos las tarjetas de Para Llevar y Delivery.
   * Si se omite, se muestran todos los tipos (comportamiento legacy).
   */
  allowedTypes?: OrderType[];
}

type OrderTypeCard = {
  id: OrderType;
  title: string;
  icon: typeof Utensils;
  accent: string;
  shortcut: string;
};

const ORDER_TYPES: OrderTypeCard[] = [
  { id: "DINE_IN",  title: "Comer Aquí",  icon: Utensils,    accent: "#ff8400", shortcut: "1" },
  { id: "TAKEOUT",  title: "Para Llevar", icon: ShoppingBag, accent: "#3b82f6", shortcut: "2" },
  { id: "DELIVERY", title: "Delivery",    icon: Bike,        accent: "#10b981", shortcut: "3" },
];

// Metadatos por tipo para las filas de cuentas abiertas (badge + icono + tono).
const TYPE_META: Record<OrderType, { label: string; icon: typeof Utensils; accent: string }> = {
  DINE_IN:  { label: "MESA",      icon: Utensils,    accent: "#ffb84d" },
  TAKEOUT:  { label: "LLEVAR",    icon: ShoppingBag, accent: "#3b82f6" },
  DELIVERY: { label: "DOMICILIO", icon: Bike,        accent: "#10b981" },
};

// Punto de estado por estado de la orden.
const STATUS_DOT: Record<string, string> = {
  READY:      "#88D66C",
  PREPARING:  "#ffb84d",
  CONFIRMED:  "#ffb84d",
  ON_THE_WAY: "#5e6ad2",
};
const dotFor = (status: string) => STATUS_DOT[status] ?? "rgba(255,255,255,0.5)";

// Filtros de la lista de cuentas.
const FILTERS: { key: "ALL" | OrderType; label: string }[] = [
  { key: "ALL",      label: "Todas" },
  { key: "DINE_IN",  label: "Mesa" },
  { key: "TAKEOUT",  label: "Llevar" },
  { key: "DELIVERY", label: "Domicilio" },
];

// Accesos rápidos del menú desplegable (esquina del header).
const SHORTCUTS = [
  { label: "Corte de caja",    icon: Wallet,   action: "shift"    as const },
  { label: "Gastos y compras", icon: Coins,    action: "expenses" as const },
  { label: "Panel central",    icon: Settings, action: "config"   as const },
];

// Hora exacta (HH:MM) + fecha corta (es-MX) para la columna de hora.
const formatClock = (iso?: string): { time: string; date: string } => {
  if (!iso) return { time: "--:--", date: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { time: "--:--", date: "" };
  return {
    time: d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }),
    date: d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
  };
};

const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({
  onSelect,
  onClose,
  onOpenAccount,
  onShiftClose,
  onExpenses,
  onConfig,
  openAccounts = [],
  allowedTypes,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | OrderType>("ALL");
  const menuRef = useRef<HTMLDivElement>(null);

  // Filtra las tarjetas a los tipos que la sucursal acepta. Si no se pasa
  // `allowedTypes` (o viene vacío) mostramos todos.
  const visibleTypes = useMemo(
    () =>
      allowedTypes && allowedTypes.length > 0
        ? ORDER_TYPES.filter((type) => allowedTypes.includes(type.id))
        : ORDER_TYPES,
    [allowedTypes],
  );

  const visibleAccounts = useMemo(
    () =>
      filter === "ALL"
        ? openAccounts
        : openAccounts.filter((a) => a.rawType === filter),
    [openAccounts, filter],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const match = visibleTypes.find((type) => type.shortcut === event.key);
      if (match) {
        event.preventDefault();
        onSelect(match.id);
        return;
      }

      if (event.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        if (onClose) {
          event.preventDefault();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onSelect, visibleTypes, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const runShortcut = (action: (typeof SHORTCUTS)[number]["action"]) => {
    setMenuOpen(false);
    if (action === "shift") onShiftClose?.();
    if (action === "expenses") onExpenses?.();
    if (action === "config") onConfig?.();
  };

  const enabledShortcuts = SHORTCUTS.filter((shortcut) => {
    if (shortcut.action === "shift") return Boolean(onShiftClose);
    if (shortcut.action === "expenses") return Boolean(onExpenses);
    if (shortcut.action === "config") return Boolean(onConfig);
    return false;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col overflow-hidden bg-[#0C0C0E] px-3 py-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-5"
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

      {/* HEADER — título + usuario + menú desplegable (esquina) */}
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#ff8400]/25 bg-[#ff8400]/10 text-[#ffb84d]">
            <Table2 size={20} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">
              Panel operativo
            </p>
            <h1 className="truncate text-lg font-black leading-tight tracking-tight">
              Nueva venta
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <UserBadge />
          </div>

          {/* MENÚ DESPLEGABLE — accesos rápidos + bloquear terminal */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menú"
              aria-expanded={menuOpen}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#6b5641] bg-[#1e1b18] text-[#f8e8d0] transition-all active:scale-95 hover:border-[#ff8400]/60 hover:text-[#ffb84d]"
            >
              <Menu size={20} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 origin-top-right rounded-2xl border border-white/10 bg-[#121316] p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="sm:hidden border-b border-white/5 px-2 pb-2 mb-1">
                  <UserBadge expanded={false} />
                </div>
                {enabledShortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <button
                      key={shortcut.action}
                      type="button"
                      onClick={() => runShortcut(shortcut.action)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-zinc-300 transition-all hover:bg-white/5 hover:text-white active:scale-[0.98]"
                    >
                      <Icon size={18} />
                      <span className="text-sm font-bold">{shortcut.label}</span>
                    </button>
                  );
                })}
                {onClose && (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onClose(); }}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-white/5 px-3 py-3 text-red-400/90 transition-all hover:bg-red-500/5 hover:text-red-400 active:scale-[0.98]"
                  >
                    <LogOut size={18} />
                    <span className="text-sm font-bold">Bloquear terminal</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* CUERPO — cuentas abiertas (izq) + tipo de pedido (der) */}
      <main className="relative z-10 mt-3 flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* CUENTAS ABIERTAS */}
        <section className="flex min-h-0 flex-[2.2] flex-col rounded-xl border border-white/10 bg-white/[0.035] p-3 backdrop-blur-md">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ffb84d]">
              Cuentas abiertas · {openAccounts.length}
            </p>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-all active:scale-95 ${
                      active
                        ? "bg-[#ffb84d] text-[#0c0c0e]"
                        : "border border-white/10 bg-white/5 text-white/55"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
            {visibleAccounts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center opacity-40">
                <Receipt size={40} className="text-white/30" />
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">
                  {openAccounts.length === 0
                    ? "No hay cuentas abiertas"
                    : "Sin cuentas de este tipo"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {visibleAccounts.map((acc) => {
                  const meta = TYPE_META[acc.rawType] ?? TYPE_META.TAKEOUT;
                  const Icon = meta.icon;
                  const clock = formatClock(acc.createdAt);
                  const title =
                    acc.rawType === "DINE_IN"
                      ? acc.tableName || acc.customerName
                      : acc.customerName;
                  // Los pedidos web se distinguen con acento índigo (icono + barra
                  // lateral + badge WEB) para detectarlos de un vistazo.
                  const iconAccent = acc.isWeb ? WEB_ACCENT : meta.accent;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => onOpenAccount?.(acc.id)}
                      aria-label={`Abrir cuenta de ${title} por $${acc.total.toFixed(2)}${acc.isWeb ? " (pedido web)" : ""}`}
                      className="group relative flex items-center gap-3 border-b border-white/[0.06] py-2.5 pl-3 pr-2 text-left transition-colors last:border-0 hover:bg-white/[0.03] active:scale-[0.995]"
                      style={
                        acc.isWeb
                          ? { boxShadow: `inset 3px 0 0 ${WEB_ACCENT}`, backgroundColor: `${WEB_ACCENT}0d` }
                          : undefined
                      }
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: dotFor(acc.status) }}
                        aria-hidden
                      />
                      <span
                        className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border"
                        style={{
                          backgroundColor: `${iconAccent}1f`,
                          borderColor: `${iconAccent}4d`,
                          color: iconAccent,
                        }}
                      >
                        <Icon size={17} strokeWidth={2.5} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-black leading-tight text-white">
                            {title}
                          </span>
                          {acc.isWeb && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[8px] font-black tracking-[0.1em]"
                              style={{ backgroundColor: `${WEB_ACCENT}26`, color: "#aab2f0" }}
                            >
                              <Globe size={9} strokeWidth={3} />
                              WEB
                            </span>
                          )}
                          <span
                            className="shrink-0 rounded px-1.5 py-px text-[8px] font-black tracking-[0.1em]"
                            style={{ backgroundColor: `${meta.accent}1f`, color: meta.accent }}
                          >
                            {meta.label}
                          </span>
                          <span className="shrink-0 text-[9px] font-black tabular-nums text-white/30">
                            #{acc.orderNumber}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-white/40">
                          {acc.rawType === "DINE_IN" ? (
                            (acc.numberOfGuests ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Users size={11} className="shrink-0" />
                                {acc.numberOfGuests} pax
                              </span>
                            )
                          ) : acc.phone ? (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Phone size={11} className="shrink-0" />
                              {acc.phone}
                            </span>
                          ) : null}
                          {acc.itemsCount > 0 && (
                            <>
                              {((acc.rawType === "DINE_IN" && (acc.numberOfGuests ?? 0) > 0) ||
                                (acc.rawType !== "DINE_IN" && acc.phone)) && (
                                <span className="text-white/20">·</span>
                              )}
                              <span className="tabular-nums">{acc.itemsCount} art.</span>
                            </>
                          )}
                          {acc.driver && (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="inline-flex items-center gap-1 truncate text-blue-300">
                                <Bike size={11} className="shrink-0" />
                                <span className="truncate">{acc.driver}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* COLUMNA DE HORA */}
                      <div className="w-[58px] shrink-0 border-l border-white/[0.07] pl-2.5 text-right">
                        <div className="text-[13px] font-black tabular-nums text-white/75">
                          {clock.time}
                        </div>
                        {clock.date && (
                          <div className="text-[8px] font-bold text-white/30">{clock.date}</div>
                        )}
                      </div>

                      <span className="w-[74px] shrink-0 text-right text-[15px] font-black tabular-nums text-white">
                        ${acc.total.toFixed(2)}
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-white/35" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* TIPO DE PEDIDO */}
        <aside className="flex shrink-0 flex-col gap-2.5 lg:w-[260px]">
          <p className="px-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#ffb84d]">
            Iniciar venta
          </p>
          <div className="grid flex-1 grid-cols-3 gap-2.5 lg:grid-cols-1">
            {visibleTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onSelect(type.id)}
                  className="group relative flex flex-1 flex-col justify-center gap-2 rounded-xl border border-white/10 bg-[#131316] p-4 text-left transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#ffb84d]/70"
                  style={{ borderColor: `${type.accent}3a` }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-lg border"
                      style={{
                        backgroundColor: `${type.accent}1f`,
                        borderColor: `${type.accent}40`,
                        color: type.accent,
                      }}
                    >
                      <Icon size={22} strokeWidth={2.5} />
                    </span>
                    <span className="text-[10px] font-black text-white/30">{type.shortcut}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-black leading-tight tracking-tight lg:text-lg">
                      {type.title}
                    </h3>
                    <ArrowRight
                      strokeWidth={3}
                      className="h-4 w-4 shrink-0 text-white/30 transition-transform group-active:translate-x-0.5"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default OrderTypeSelector;
