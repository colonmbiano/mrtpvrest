"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair,
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Bike,
  CheckCircle2,
  Circle,
  Coins,
  Globe,
  Merge,
  LayoutGrid,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Phone,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Table2,
  Users,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";
import type { OrderType } from "@/components/tpv/TicketPanel";
import { ORDER_TYPE_ACTION, ORDER_TYPE_BADGE, ORDER_TYPE_SHORT } from "@/lib/orderTypes";
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
  /** Solo modo "Cobradas": método de pago crudo para el chip de la fila. */
  paymentMethod?: string | null;
}

// Etiqueta legible del método de pago (chip de la fila en modo "Cobradas").
const PAY_METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transfer.",
  ONLINE: "En línea",
  MIXED: "Mixto",
};
const payMethodLabel = (m?: string | null): string =>
  m ? PAY_METHOD_LABEL[m] || m : "Pagado";

// Color "web" de la app (índigo), reutilizado del badge de pedidos web.
const WEB_ACCENT = "#5e6ad2";

interface OrderTypeSelectorProps {
  onSelect: (type: ExtendedOrderType) => void;
  onClose?: () => void;
  /** "Editar" — entra a la cuenta en el menú para agregar productos. */
  onOpenAccount?: (id: string) => void;
  /** "Imprimir" — manda la cuenta a la impresora CASHIER, directo. */
  onReprintAccount?: (id: string) => void;
  /** "Cobrar" — abre el pago de esa cuenta, directo. */
  onChargeAccount?: (id: string) => void;
  /** Oculta el botón "Cobrar" (modo préstamo / meseros). */
  hideMoney?: boolean;
  onShiftClose?: () => void;
  onExpenses?: () => void;
  onConfig?: () => void;
  /** Abre la captura de pedidos de WhatsApp (/pos/whatsapp). */
  onWhatsapp?: () => void;
  /** Navegación: ir al catálogo de ventas (/pos/menu). */
  onSales?: () => void;
  /** Navegación: ir al panel de sucursal / hub. */
  onHub?: () => void;
  /** Abre el panel de pedidos web (tienda en línea / WhatsApp). */
  onWebOrders?: () => void;
  /** Abre el panel de repartidores en vivo. */
  onDrivers?: () => void;
  /** Abre el panel de notificaciones. */
  onNotifs?: () => void;
  /** Abre el cajón completo de tickets (juntar / asignar repartidor / cocina /
   *  multiselección + Abiertas/Cobradas). Si se pasa, se muestra el botón
   *  "Gestionar tickets" en la sección de cuentas. */
  onManageTickets?: () => void;
  /** Abre el modal de configuración (tema / modo / bloquear terminal). */
  onConfigMenu?: () => void;
  /** "Cambiar empleado" — cierra sesión y manda al PIN (1 toque). */
  onSwitchEmployee?: () => void;
  /** Habilita seleccionar varias cuentas para juntarlas / asignar repartidor
   *  directamente en esta pantalla (sin abrir un cajón aparte). */
  canMerge?: boolean;
  /** Junta las cuentas seleccionadas: la PRIMERA es la cuenta final; el resto
   *  se cierra tras mover sus productos. */
  onMergeOrders?: (target: OpenAccount, sources: OpenAccount[]) => Promise<void>;
  /** Asigna el repartidor elegido a TODAS las cuentas seleccionadas. */
  onAssignDriver?: (accounts: OpenAccount[], driverId: string) => Promise<void>;
  /** Repartidores activos para el selector de asignación. */
  drivers?: { id: string; name: string; isAvailable?: boolean }[];
  /** Logo del tenant (de la config del recibo). Si existe, reemplaza el icono
   *  del header; si no, se muestra el icono por defecto. */
  logoUrl?: string | null;
  /** Badge: pedidos web PENDING por aceptar. */
  webOrdersCount?: number;
  /** Badge: notificaciones sin leer. */
  unreadNotifs?: number;
  /** Pestaña activa de la lista: "open" = cuentas abiertas (default),
   *  "paid" = tickets cobrados del último mes (solo lectura: reimprimir). */
  mode?: "open" | "paid";
  /** Cambia de pestaña Abiertas/Cobradas. Si no se pasa, no se muestra el toggle. */
  onModeChange?: (mode: "open" | "paid") => void;
  /** "Reimprimir recibo" de un ticket cobrado (impresión directa, sin navegar). */
  onReprintPaid?: (id: string) => void;
  /** Spinner en la lista mientras se cargan los cobrados y no hay cache. */
  paidLoading?: boolean;
  /** Cuentas en curso (mesa, llevar, domicilio) — o cobradas en modo "paid". */
  openAccounts?: OpenAccount[];
  /**
   * Tipos de orden que la sucursal acepta (subset de DINE_IN / TAKEOUT /
   * DELIVERY) según su TpvRemoteConfig. Un bar, por ejemplo, suele recibir
   * solo ["DINE_IN"] y aquí ocultamos las tarjetas de Para Llevar y Delivery.
   * Si se omite, se muestran todos los tipos (comportamiento legacy).
   */
  allowedTypes?: OrderType[];
}

// Moto para Delivery — lucide no trae motocicleta, así que la dibujamos aquí
// con el mismo estilo (stroke currentColor, mismas props que un icono lucide).
function Moto({ size = 24, strokeWidth = 2, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="5" cy="16" r="3.4" />
      <circle cx="19" cy="16" r="3.4" />
      <path d="M8.4 16h7.2" />
      <path d="M5 16 8 9.5h5l2.6 6.5" />
      <path d="M13 9.5 15 6.5h3" />
      <path d="M8 9.5h5" />
    </svg>
  );
}

type OrderTypeCard = {
  id: OrderType;
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  accent: string;
  shortcut: string;
};

const ORDER_TYPES: OrderTypeCard[] = [
  { id: "DINE_IN",  title: ORDER_TYPE_ACTION.DINE_IN,  icon: Armchair,    accent: "#34C988", shortcut: "1" },
  { id: "TAKEOUT",  title: ORDER_TYPE_ACTION.TAKEOUT,  icon: ShoppingBag, accent: "#3b82f6", shortcut: "2" },
  { id: "DELIVERY", title: ORDER_TYPE_ACTION.DELIVERY, icon: Moto,        accent: "#F97316", shortcut: "3" },
];

// Metadatos por tipo para las filas de cuentas abiertas (badge + icono + tono).
const TYPE_META: Record<OrderType, { label: string; icon: typeof Utensils; accent: string }> = {
  DINE_IN:  { label: ORDER_TYPE_BADGE.DINE_IN,  icon: Utensils,    accent: "#E0A22A" },
  TAKEOUT:  { label: ORDER_TYPE_BADGE.TAKEOUT,  icon: ShoppingBag, accent: "#3b82f6" },
  DELIVERY: { label: ORDER_TYPE_BADGE.DELIVERY, icon: Bike,        accent: "#10b981" },
};

// Punto de estado por estado de la orden.
const STATUS_DOT: Record<string, string> = {
  PAID:       "#88D66C",
  READY:      "#88D66C",
  PREPARING:  "#E0A22A",
  CONFIRMED:  "#E0A22A",
  ON_THE_WAY: "#5e6ad2",
};
const dotFor = (status: string) => STATUS_DOT[status] ?? "rgba(255,255,255,0.5)";

// Filtros de la lista de cuentas.
const FILTERS: { key: "ALL" | OrderType; label: string }[] = [
  { key: "ALL",      label: "Todas" },
  { key: "DINE_IN",  label: ORDER_TYPE_SHORT.DINE_IN },
  { key: "TAKEOUT",  label: ORDER_TYPE_SHORT.TAKEOUT },
  { key: "DELIVERY", label: ORDER_TYPE_SHORT.DELIVERY },
];

// Accesos del menú desplegable (esquina del header). Combina navegación
// (catálogo / sucursal), paneles en vivo (pedidos web, repartidores,
// notificaciones) y los accesos operativos. Replica el rol del TopNavDropdown
// del catálogo para que la pantalla principal también navegue y gestione.
const SHORTCUTS = [
  { label: "Ir a ventas",      icon: ShoppingCart,     action: "sales"     as const },
  { label: "Abiertos",         icon: Receipt,          action: "tickets"   as const },
  { label: "Pedidos web",      icon: Globe,            action: "weborders" as const },
  { label: "Repartidores",     icon: Bike,             action: "drivers"   as const },
  { label: "Sucursal",         icon: LayoutGrid,       action: "hub"       as const },
  { label: "Corte de caja",    icon: Wallet,           action: "shift"     as const },
  { label: "Gastos y compras", icon: Coins,            action: "expenses"  as const },
  { label: "Apariencia",       icon: SlidersHorizontal, action: "settings" as const },
  { label: "Panel central",    icon: Settings,         action: "config"    as const },
  { label: "Cambiar empleado", icon: ArrowLeftRight,   action: "switch"    as const },
];

// Hora exacta (HH:MM) + fecha corta (es-MX) para la columna de hora.
const formatClock = (iso?: string): { time: string; date: string } => {
  if (!iso) return { time: "--:--", date: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { time: "--:--", date: "" };
  return {
    time: d.toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }),
    date: d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short" }),
  };
};

const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({
  onSelect,
  onClose,
  onOpenAccount,
  onReprintAccount,
  onChargeAccount,
  hideMoney = false,
  onShiftClose,
  onExpenses,
  onConfig,
  onWhatsapp,
  onSales,
  onHub,
  onWebOrders,
  onDrivers,
  onNotifs,
  onManageTickets,
  onConfigMenu,
  onSwitchEmployee,
  canMerge = false,
  onMergeOrders,
  onAssignDriver,
  drivers = [],
  logoUrl,
  webOrdersCount = 0,
  unreadNotifs = 0,
  mode = "open",
  onModeChange,
  onReprintPaid,
  paidLoading = false,
  openAccounts = [],
  allowedTypes,
}) => {
  const paidMode = mode === "paid";
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | OrderType>("ALL");
  const menuRef = useRef<HTMLDivElement>(null);

  // Selección múltiple para juntar cuentas / asignar repartidor SIN abrir un
  // cajón aparte (todo en esta pantalla principal). La PRIMERA seleccionada es
  // la "cuenta final" del merge; el resto se cierra tras mover sus productos.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);

  const canSelect = !paidMode && (canMerge || Boolean(onAssignDriver));

  const selectedAccounts = useMemo(
    () =>
      selectedIds
        .map((id) => openAccounts.find((a) => a.id === id))
        .filter((a): a is OpenAccount => Boolean(a)),
    [selectedIds, openAccounts],
  );
  const selectedTotal = useMemo(
    () => selectedAccounts.reduce((sum, a) => sum + a.total, 0),
    [selectedAccounts],
  );
  const targetAccount = selectedAccounts[0];

  const resetSelection = () => {
    setSelectMode(false);
    setSelectedIds([]);
    setShowMergeConfirm(false);
    setShowDriverPicker(false);
    setAssigningDriverId(null);
  };

  const toggleSelectMode = () => {
    if (selectMode) resetSelection();
    else setSelectMode(true);
  };

  const toggleAccount = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const confirmMerge = async () => {
    const [destination, ...sources] = selectedAccounts;
    if (!onMergeOrders || !destination || sources.length === 0) return;
    setIsMerging(true);
    try {
      await onMergeOrders(destination, sources);
      resetSelection();
    } catch {
      // El caller muestra el error y refresca las cuentas.
    } finally {
      setIsMerging(false);
    }
  };

  const assignDriverToSelected = async (driverId: string) => {
    if (!onAssignDriver || selectedAccounts.length === 0) return;
    setAssigningDriverId(driverId);
    try {
      await onAssignDriver(selectedAccounts, driverId);
      resetSelection();
    } catch {
      setAssigningDriverId(null);
    }
  };

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

      // No robar las teclas cuando el usuario está escribiendo en un campo
      // (p. ej. el monto en el modal de gastos): el atajo "1" abría Mesa.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

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
    if (action === "weborders") onWebOrders?.();
    if (action === "drivers") onDrivers?.();
    if (action === "sales") onSales?.();
    if (action === "hub") onHub?.();
    if (action === "shift") onShiftClose?.();
    if (action === "expenses") onExpenses?.();
    if (action === "settings") onConfigMenu?.();
    if (action === "config") onConfig?.();
    if (action === "tickets") {
      // "Abiertos" trae a esta pantalla (ya estamos aquí) y entra al modo
      // selección para juntar / asignar repartidor in-situ. Si el rol no puede
      // seleccionar, cae al cajón completo (fallback).
      if (canSelect) setSelectMode(true);
      else onManageTickets?.();
    }
    if (action === "switch") onSwitchEmployee?.();
  };

  const enabledShortcuts = SHORTCUTS.filter((shortcut) => {
    if (shortcut.action === "weborders") return Boolean(onWebOrders);
    if (shortcut.action === "drivers") return Boolean(onDrivers);
    if (shortcut.action === "sales") return Boolean(onSales);
    if (shortcut.action === "hub") return Boolean(onHub);
    if (shortcut.action === "shift") return Boolean(onShiftClose);
    if (shortcut.action === "expenses") return Boolean(onExpenses);
    if (shortcut.action === "settings") return Boolean(onConfigMenu);
    if (shortcut.action === "config") return Boolean(onConfig);
    if (shortcut.action === "tickets") return canSelect || Boolean(onManageTickets);
    if (shortcut.action === "switch") return Boolean(onSwitchEmployee);
    return false;
  });

  // Badge numérico por acceso (pedidos web pendientes).
  const badgeFor = (action: (typeof SHORTCUTS)[number]["action"]): number => {
    if (action === "weborders") return webOrdersCount;
    return 0;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col overflow-hidden bg-[var(--bg)] px-3 py-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-5"
      style={{ fontFamily: "var(--font-body)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-glow), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 42%)",
        }}
      />

      {/* HEADER — título + usuario + menú desplegable (esquina) */}
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {onNotifs && (
            <button
              type="button"
              onClick={() => onNotifs?.()}
              aria-label="Notificaciones"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] transition-all active:scale-95 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              <Bell size={18} />
              {unreadNotifs > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[9px] font-semibold text-[var(--brand-fg)]">
                  {unreadNotifs > 99 ? "99+" : unreadNotifs}
                </span>
              )}
            </button>
          )}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <Table2 size={20} strokeWidth={2.5} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
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
              className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] transition-all active:scale-95 hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              <Menu size={20} />
              {/* Punto de aviso: hay pedidos web por aceptar (las notificaciones
                  tienen su propio botón de campana en la esquina izquierda). */}
              {webOrdersCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[9px] font-semibold text-[var(--brand-fg)]">
                  {webOrdersCount > 99 ? "99+" : webOrdersCount}
                </span>
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 origin-top-right rounded-2xl border border-white/10 bg-[var(--surface-1)] p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="sm:hidden border-b border-white/5 px-2 pb-2 mb-1">
                  <UserBadge expanded={false} />
                </div>
                {enabledShortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;
                  const badge = badgeFor(shortcut.action);
                  return (
                    <button
                      key={shortcut.action}
                      type="button"
                      onClick={() => runShortcut(shortcut.action)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-zinc-300 transition-all hover:bg-white/5 hover:text-white active:scale-[0.98]"
                    >
                      <Icon size={18} />
                      <span className="flex-1 text-left text-sm font-bold">{shortcut.label}</span>
                      {badge > 0 && (
                        <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-semibold text-[var(--brand-fg)]">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
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
      <main className="relative z-10 mt-3 flex min-h-0 flex-1 flex-col gap-3 landscape:flex-row">
        {/* CUENTAS ABIERTAS */}
        <section className="flex min-h-0 flex-[2.2] landscape:flex-[7] landscape:order-2 flex-col rounded-xl border border-white/10 bg-white/[0.035] p-3 backdrop-blur-md">
          <div className="mb-2 flex shrink-0 flex-col gap-2">
            {/* TOGGLE Abiertas / Cobradas */}
            {onModeChange && (
              <div className="flex gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
                {([
                  { key: "open" as const, label: "Abiertas" },
                  { key: "paid" as const, label: "Cobradas" },
                ]).map((m) => {
                  const active = mode === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => { resetSelection(); onModeChange(m.key); }}
                      className={`flex-1 rounded-lg py-2 text-[11px] font-semibold uppercase tracking-[0.15em] transition-all active:scale-95 ${
                        active
                          ? m.key === "paid"
                            ? "bg-[#88D66C] text-[#0c0c0e]"
                            : "bg-[var(--brand)] text-[var(--brand-fg)]"
                          : "text-white/55"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: paidMode ? "#88D66C" : "var(--brand)" }}
              >
                {paidMode
                  ? `Cobradas · último mes · ${openAccounts.length}`
                  : `Cuentas abiertas · ${openAccounts.length}`}
              </p>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all active:scale-95 ${
                        active
                          ? "bg-[var(--brand)] text-[var(--brand-fg)]"
                          : "border border-white/10 bg-white/5 text-white/55"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selección múltiple EN ESTA pantalla: juntar cuentas / asignar
                repartidor sin abrir un cajón aparte. */}
            {canSelect && (
              <button
                type="button"
                onClick={toggleSelectMode}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-transform active:scale-95 ${
                  selectMode
                    ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]"
                    : "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                }`}
              >
                <ListChecks size={15} strokeWidth={2.5} />
                {selectMode
                  ? `Cancelar selección${selectedAccounts.length ? ` · ${selectedAccounts.length}` : ""}`
                  : "Seleccionar · juntar / repartidor"}
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
            {paidMode && paidLoading && openAccounts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center opacity-50">
                <Loader2 size={36} className="animate-spin text-white/40" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Cargando cobrados…
                </p>
              </div>
            ) : visibleAccounts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center opacity-40">
                <Receipt size={40} className="text-white/30" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {paidMode
                    ? openAccounts.length === 0
                      ? "Sin tickets cobrados este mes"
                      : "Sin cobrados de este tipo"
                    : openAccounts.length === 0
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
                  const isSelected = selectMode && selectedIds.includes(acc.id);
                  const selIndex = selectedIds.indexOf(acc.id);
                  return (
                    <div
                      key={acc.id}
                      role={selectMode ? "button" : undefined}
                      tabIndex={selectMode ? 0 : undefined}
                      aria-pressed={selectMode ? isSelected : undefined}
                      onClick={selectMode ? () => toggleAccount(acc.id) : undefined}
                      aria-label={`Cuenta de ${title} por $${acc.total.toFixed(2)}${acc.isWeb ? " (pedido web)" : ""}`}
                      className={`relative flex flex-col gap-1.5 border-b border-white/[0.06] py-2 pl-3 pr-2 text-left transition-colors last:border-0 ${selectMode ? "cursor-pointer" : ""}`}
                      style={
                        isSelected
                          ? { boxShadow: "inset 0 0 0 1px var(--brand)", backgroundColor: "var(--brand-soft)", borderRadius: 12 }
                          : acc.isWeb
                            ? { boxShadow: `inset 3px 0 0 ${WEB_ACCENT}`, backgroundColor: `${WEB_ACCENT}0d` }
                            : undefined
                      }
                    >
                    <div className="flex items-center gap-3">
                      {selectMode ? (
                        isSelected ? (
                          <CheckCircle2 size={20} className="shrink-0 text-[var(--brand)]" strokeWidth={2.5} />
                        ) : (
                          <Circle size={20} className="shrink-0 text-white/30" />
                        )
                      ) : (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: dotFor(acc.status) }}
                          aria-hidden
                        />
                      )}
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
                          <span className="truncate text-[15px] font-semibold leading-tight text-white">
                            {title}
                          </span>
                          {isSelected && canMerge && (
                            <span className="shrink-0 text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
                              {selIndex === 0 ? "Cuenta final" : "Se juntará"}
                            </span>
                          )}
                          {acc.isWeb && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[8px] font-semibold tracking-[0.1em]"
                              style={{ backgroundColor: `${WEB_ACCENT}26`, color: "#aab2f0" }}
                            >
                              <Globe size={9} strokeWidth={3} />
                              WEB
                            </span>
                          )}
                          <span
                            className="shrink-0 rounded px-1.5 py-px text-[8px] font-semibold tracking-[0.1em]"
                            style={{ backgroundColor: `${meta.accent}1f`, color: meta.accent }}
                          >
                            {meta.label}
                          </span>
                          <span className="shrink-0 text-[9px] font-semibold tabular-nums text-white/30">
                            #{acc.orderNumber}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-white/40">
                          {paidMode ? (
                            <span className="inline-flex items-center gap-1 text-[#88D66C]">
                              <Wallet size={11} className="shrink-0" />
                              {payMethodLabel(acc.paymentMethod)}
                            </span>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>

                      {/* COLUMNA DE HORA */}
                      <div className="w-[58px] shrink-0 border-l border-white/[0.07] pl-2.5 text-right">
                        <div className="text-[13px] font-semibold tabular-nums text-white/75">
                          {clock.time}
                        </div>
                        {clock.date && (
                          <div className="text-[8px] font-bold text-white/30">{clock.date}</div>
                        )}
                      </div>

                      <span className="w-[74px] shrink-0 text-right text-[15px] font-semibold tabular-nums text-white">
                        ${acc.total.toFixed(2)}
                      </span>
                    </div>

                    {/* Acciones por cuenta. En "Cobradas" (solo lectura) un único
                        botón reimprime el recibo; en "Abiertas" están Editar /
                        Imprimir / Cobrar ("Cobrar" se oculta con hideMoney). En
                        modo selección se ocultan (la fila es un toggle). */}
                    {!selectMode && (paidMode ? (
                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          aria-label={`Reimprimir recibo de ${title}`}
                          onClick={() => onReprintPaid?.(acc.id)}
                          className="flex-1 h-10 rounded-xl bg-[#88D66C]/12 border border-[#88D66C]/30 text-[#88D66C] text-[11px] font-semibold uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-transform active:scale-95"
                        >
                          <Receipt size={15} strokeWidth={2.5} /> Reimprimir recibo
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          aria-label={`Editar cuenta de ${title}`}
                          onClick={() => onOpenAccount?.(acc.id)}
                          className="flex-1 h-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] text-[11px] font-semibold uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-transform active:scale-95"
                        >
                          <Pencil size={15} strokeWidth={2.5} /> Editar
                        </button>
                        <button
                          type="button"
                          aria-label={`Imprimir cuenta de ${title}`}
                          onClick={() => onReprintAccount?.(acc.id)}
                          className="flex-1 h-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] text-[11px] font-semibold uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-transform active:scale-95"
                        >
                          <Receipt size={15} strokeWidth={2.5} /> Imprimir
                        </button>
                        {!hideMoney && (
                          <button
                            type="button"
                            aria-label={`Cobrar cuenta de ${title}`}
                            onClick={() => onChargeAccount?.(acc.id)}
                            className="flex-[1.3] h-10 rounded-xl bg-[#88d66c] text-[#0C0C0E] text-[11px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-transform active:scale-95"
                          >
                            <Zap size={15} strokeWidth={2.8} /> Cobrar
                          </button>
                        )}
                      </div>
                    ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* BARRA DE ACCIONES DE SELECCIÓN — juntar / asignar repartidor */}
          {selectMode && (
            <div className="mt-2 shrink-0 rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
                  {selectedAccounts.length} seleccionada{selectedAccounts.length === 1 ? "" : "s"}
                </span>
                <span className="text-base font-semibold tabular-nums text-white">
                  ${selectedTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {Boolean(onAssignDriver) && (
                  <button
                    type="button"
                    disabled={selectedAccounts.length < 1}
                    onClick={() => setShowDriverPicker(true)}
                    className="flex-1 min-h-[48px] h-12 rounded-xl bg-blue-400/15 border border-blue-400/40 text-blue-200 text-[11px] font-semibold uppercase tracking-[0.1em] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
                  >
                    <Bike size={16} strokeWidth={2.5} />
                    Repartidor
                  </button>
                )}
                {canMerge && (
                  <button
                    type="button"
                    disabled={selectedAccounts.length < 2}
                    onClick={() => setShowMergeConfirm(true)}
                    className="flex-1 min-h-[48px] h-12 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] text-[11px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
                  >
                    <Merge size={16} strokeWidth={2.5} />
                    Juntar {selectedAccounts.length || ""}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* TIPO DE PEDIDO */}
        <aside className="flex flex-col gap-2.5 landscape:flex-[3] landscape:order-1">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
            Iniciar venta
          </p>
          <div className="grid flex-1 grid-cols-3 gap-2.5 landscape:grid-cols-1">
            {visibleTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onSelect(type.id)}
                  className="group relative flex min-h-[120px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border p-5 text-center transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                  style={{ backgroundColor: `${type.accent}14`, borderColor: `${type.accent}55` }}
                >
                  {/* Atajo de teclado, discreto en la esquina */}
                  <span className="absolute right-3 top-2.5 text-[11px] font-semibold text-white/25">
                    {type.shortcut}
                  </span>
                  <span
                    className="flex h-[68px] w-[68px] items-center justify-center rounded-2xl border"
                    style={{
                      backgroundColor: `${type.accent}29`,
                      borderColor: `${type.accent}59`,
                      color: type.accent,
                    }}
                  >
                    <Icon size={36} strokeWidth={2.4} />
                  </span>
                  <h3 className="text-2xl font-black leading-tight tracking-tight">
                    {type.title}
                  </h3>
                </button>
              );
            })}
          </div>

          {/* Captura de pedidos de WhatsApp — entrada secundaria al pie del
              panel. Acento verde para reconocerla de un vistazo. */}
          {onWhatsapp && (
            <button
              type="button"
              onClick={onWhatsapp}
              aria-label="Capturar pedido de WhatsApp"
              className="group flex shrink-0 items-center gap-3 rounded-2xl border bg-[var(--surface-1)] p-4 text-left transition-colors active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
              style={{ borderColor: "#25D3663a" }}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                style={{ backgroundColor: "#25D3661f", borderColor: "#25D36640", color: "#25D366" }}
              >
                <MessageCircle size={22} strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold leading-tight tracking-tight">Pedidos WhatsApp</h3>
                <p className="text-[10px] font-bold text-white/40">Capturar pedido del chat</p>
              </div>
              <ArrowRight
                strokeWidth={3}
                className="h-4 w-4 shrink-0 text-white/30 transition-transform group-active:translate-x-0.5"
              />
            </button>
          )}
        </aside>
      </main>

      {/* CONFIRMAR UNIÓN (juntar cuentas) */}
      {showMergeConfirm && targetAccount && selectedAccounts.length >= 2 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={() => !isMerging && setShowMergeConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[var(--surface-1)] p-5 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]">
              <Merge size={21} />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Confirmar unión</p>
            <h3 className="mt-1 text-xl font-black text-white">Juntar {selectedAccounts.length} cuentas</h3>
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-white/55">
              La cuenta final será #{targetAccount.orderNumber} de{" "}
              <span className="text-white">{targetAccount.customerName}</span>. Las otras{" "}
              {selectedAccounts.length - 1} se cerrarán tras mover sus productos.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Nuevo total</span>
              <span className="text-xl font-black tabular-nums text-white">${selectedTotal.toFixed(2)}</span>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={isMerging}
                onClick={() => setShowMergeConfirm(false)}
                className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65 disabled:opacity-40"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isMerging}
                onClick={confirmMerge}
                className="flex h-12 flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] text-[11px] font-black uppercase tracking-[0.12em] text-[var(--brand-fg)] transition-transform active:scale-95 disabled:opacity-60"
              >
                {isMerging ? (<><Loader2 size={16} className="animate-spin" />Juntando</>) : (<><Merge size={16} />Confirmar</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ELEGIR REPARTIDOR */}
      {showDriverPicker && selectedAccounts.length >= 1 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={() => !assigningDriverId && setShowDriverPicker(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[var(--surface-1)] p-5 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-400/15 text-blue-300">
              <Bike size={21} />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Enviar a repartidor</p>
            <h3 className="mt-1 text-xl font-black text-white">
              {selectedAccounts.length} ticket{selectedAccounts.length === 1 ? "" : "s"} seleccionado{selectedAccounts.length === 1 ? "" : "s"}
            </h3>
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-white/55">
              El repartidor que elijas recibirá {selectedAccounts.length === 1 ? "este pedido" : "estos pedidos"} y pasarán a{" "}
              <span className="text-white">En camino</span>.
            </p>
            <div className="mt-4 grid max-h-[42vh] grid-cols-2 gap-2 overflow-y-auto scrollbar-hide">
              {drivers.length === 0 ? (
                <p className="col-span-2 py-6 text-center text-[12px] font-bold text-[var(--warning)]">
                  No hay repartidores activos.
                </p>
              ) : (
                drivers.map((d) => {
                  const busy = assigningDriverId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={Boolean(assigningDriverId)}
                      onClick={() => assignDriverToSelected(d.id)}
                      className="flex min-h-[56px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                    >
                      {busy ? (
                        <Loader2 size={16} className="shrink-0 animate-spin text-blue-300" />
                      ) : (
                        <Bike size={15} className="shrink-0 text-blue-300" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{d.name}</span>
                        {d.isAvailable === false && (
                          <span className="block text-[9px] font-bold uppercase tracking-widest text-[var(--warning)]">Ocupado</span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <button
              type="button"
              disabled={Boolean(assigningDriverId)}
              onClick={() => setShowDriverPicker(false)}
              className="mt-4 h-12 w-full rounded-2xl border border-white/10 bg-white/5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderTypeSelector;
