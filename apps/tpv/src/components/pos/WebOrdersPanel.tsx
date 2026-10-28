"use client";
import React, { useMemo } from "react";
import {
  X,
  Globe,
  Clock,
  ShoppingBag,
  Check,
  Eye,
  MapPin,
  Phone,
  Loader2,
  CreditCard,
  Wallet,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// Shape reducido de un pedido web que consume el panel. Lo arma el layout a
// partir de openOrders filtrado por source ONLINE/STORE.
export interface WebOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  /** Valor crudo del backend: DINE_IN / TAKEOUT / DELIVERY. */
  orderType: string;
  status: string;
  total: number;
  /** ISO string del backend. */
  createdAt: string;
  itemsCount: number;
  address?: string | null;
  /** PENDING | PAID — define si ya entró el dinero (pago en línea) o falta cobrar. */
  paymentStatus?: string | null;
  /** CASH | CARD | TRANSFER | ONLINE … — para distinguir pago en línea de contra entrega. */
  paymentMethod?: string | null;
  /** true si el efectivo ya entró a caja (contra entrega cobrado). */
  cashCollected?: boolean;
  /** Nombre de la mesa en pedidos DINE_IN. */
  tableName?: string | null;
  /** Pedido de mesa por QR que la caja aún no confirma (no está en cocina). */
  awaitingTableConfirmation?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orders: WebOrder[];
  /** Abre el detalle completo (modal existente) del pedido. */
  onShowDetail: (id: string) => void;
  /** Acepta el pedido: PENDING → CONFIRMED. */
  onAccept: (id: string) => void;
  /** Id del pedido que se está aceptando ahora (bloquea su botón). */
  acceptingId?: string | null;
  /** Rechaza un pedido de mesa por confirmar: PENDING → CANCELLED. */
  onReject?: (id: string) => void;
  /** Id del pedido que se está rechazando ahora (bloquea su botón). */
  rejectingId?: string | null;
  /** Oculta importes (modo préstamo de caja). */
  hideMoney?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Mesa",
  TAKEOUT: "Llevar",
  DELIVERY: "Domicilio",
};

const TYPE_TONE: Record<string, string> = {
  DINE_IN: "bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--brand)]",
  TAKEOUT: "bg-white/8 text-white/70 border-white/15",
  DELIVERY: "bg-sky-400/15 text-sky-300 border-sky-400/25",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Nuevo",
  CONFIRMED: "Aceptado",
  PREPARING: "En cocina",
  READY: "Listo",
  ON_THE_WAY: "En camino",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

const money = (n: number) =>
  `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function WebOrdersPanel({
  isOpen,
  onClose,
  orders,
  onShowDetail,
  onAccept,
  acceptingId,
  onReject,
  rejectingId,
  hideMoney,
}: Props) {
  // Separa pendientes (requieren que el cajero los acepte) del resto en curso.
  const { pending, inProgress } = useMemo(() => {
    const pending: WebOrder[] = [];
    const inProgress: WebOrder[] = [];
    for (const o of orders) {
      if (o.status === "PENDING") pending.push(o);
      else inProgress.push(o);
    }
    return { pending, inProgress };
  }, [orders]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex justify-end"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* PANEL */}
      <aside className="relative w-full max-w-[560px] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out overflow-hidden bg-[var(--bg)] text-white border-l border-white/10">
        {/* Glows */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 700,
            height: 700,
            top: -150,
            right: -250,
            background:
              "radial-gradient(circle, rgba(94,106,210,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            width: 700,
            height: 700,
            bottom: -150,
            left: -250,
            background:
              "radial-gradient(circle, rgba(136,214,108,0.10) 0%, transparent 70%)",
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-5 border-b border-white/5 flex items-center gap-4 shrink-0 bg-white/5 backdrop-blur-md">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#5e6ad2]/15 text-[#8b97f0] border border-[#5e6ad2]/30 shrink-0">
            <Globe size={22} />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
              Pedidos web
            </span>
            <span className="text-[16px] font-semibold text-white truncate leading-none">
              {pending.length > 0
                ? `${pending.length} nuevo${pending.length === 1 ? "" : "s"} por aceptar`
                : `${orders.length} en curso`}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* LISTA */}
        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide p-4 space-y-5">
          {orders.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-20 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10">
                <Globe size={28} className="text-white/30" />
              </div>
              <div>
                <p className="text-sm font-bold text-white/70">
                  Sin pedidos web
                </p>
                <p className="text-[11px] mt-1 text-white/40">
                  Los pedidos de la tienda en línea aparecerán aquí.
                </p>
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <Section title="Nuevos · requieren aceptar" accent="#5e6ad2">
              {pending.map((o) => (
                <WebOrderCard
                  key={o.id}
                  order={o}
                  hideMoney={hideMoney}
                  accepting={acceptingId === o.id}
                  onAccept={() => onAccept(o.id)}
                  rejecting={rejectingId === o.id}
                  onReject={onReject ? () => onReject(o.id) : undefined}
                  onShowDetail={() => onShowDetail(o.id)}
                />
              ))}
            </Section>
          )}

          {inProgress.length > 0 && (
            <Section title="En curso" accent="#88D66C">
              {inProgress.map((o) => (
                <WebOrderCard
                  key={o.id}
                  order={o}
                  hideMoney={hideMoney}
                  onShowDetail={() => onShowDetail(o.id)}
                />
              ))}
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: accent }}
        />
        <span className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function WebOrderCard({
  order,
  hideMoney,
  accepting,
  onAccept,
  rejecting,
  onReject,
  onShowDetail,
}: {
  order: WebOrder;
  hideMoney?: boolean;
  accepting?: boolean;
  onAccept?: () => void;
  rejecting?: boolean;
  onReject?: () => void;
  onShowDetail: () => void;
}) {
  const isPending = order.status === "PENDING";
  // Pedido de mesa por QR sin confirmar: no está en cocina ni ocupa la mesa
  // hasta que el cajero revise que de verdad hay clientes sentados.
  const awaitingTable = isPending && order.awaitingTableConfirmation === true;
  const busy = accepting || rejecting;
  const typeKey = (order.orderType || "").toUpperCase();
  const typeTone = TYPE_TONE[typeKey] || TYPE_TONE.TAKEOUT;
  const baseTypeLabel = TYPE_LABEL[typeKey] || order.orderType || "Pedido";
  // Las mesas suelen llamarse "Mesa 7"; solo un número suelto lleva el prefijo.
  const typeLabel =
    typeKey === "DINE_IN" && order.tableName
      ? /^\d+$/.test(order.tableName)
        ? `${baseTypeLabel} ${order.tableName}`
        : order.tableName
      : baseTypeLabel;

  // ¿Ya entró el dinero? PAID = pagado en línea (o efectivo ya cobrado).
  // PENDING = falta cobrar (contra entrega / pago en línea no completado).
  const paid = order.paymentStatus === "PAID" || order.cashCollected === true;
  const methodKey = String(order.paymentMethod || "").toUpperCase();
  const onlineMethod = methodKey === "CARD" || methodKey === "ONLINE";
  const paidLabel = paid ? (onlineMethod ? "Pagado en línea" : "Pagado") : "Por cobrar";

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        awaitingTable
          ? "bg-amber-400/8 border-amber-400/40"
          : isPending
            ? "bg-[#5e6ad2]/8 border-[#5e6ad2]/30"
            : "bg-white/[0.03] border-white/8"
      }`}
    >
      {/* Encabezado: cliente + total */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white truncate leading-tight">
            {order.customerName}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${typeTone}`}
            >
              {typeLabel}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${
                paid
                  ? "bg-[#88D66C]/15 text-[#88D66C] border-[#88D66C]/35"
                  : "bg-amber-400/15 text-amber-300 border-amber-400/40"
              }`}
            >
              {paid ? <CreditCard size={11} /> : <Wallet size={11} />}
              {paidLabel}
            </span>
            {awaitingTable && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border inline-flex items-center gap-1 bg-amber-400/15 text-amber-300 border-amber-400/40">
                <AlertTriangle size={11} /> Confirma la mesa
              </span>
            )}
            <span className="text-[11px] font-bold text-white/40">
              {order.orderNumber}
            </span>
          </div>
        </div>
        {!hideMoney && (
          <span className="text-[16px] font-black text-[#88D66C] shrink-0 tabular-nums">
            {money(order.total)}
          </span>
        )}
      </div>

      {/* Meta: items · tiempo · dirección · teléfono */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[11px] text-white/45 font-semibold">
        <span className="flex items-center gap-1">
          <ShoppingBag size={12} /> {order.itemsCount} item
          {order.itemsCount === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} /> {timeAgo(order.createdAt)}
        </span>
        {!isPending && STATUS_LABEL[order.status] && (
          <span className="text-[var(--brand)] font-bold">
            {STATUS_LABEL[order.status]}
          </span>
        )}
      </div>
      {order.address && (
        <p className="flex items-center gap-1 mt-1.5 text-[11px] text-white/45 font-semibold truncate">
          <MapPin size={12} className="shrink-0" /> {order.address}
        </p>
      )}
      {order.customerPhone && (
        <p className="flex items-center gap-1 mt-1 text-[11px] text-white/45 font-semibold">
          <Phone size={12} className="shrink-0" /> {order.customerPhone}
        </p>
      )}
      {awaitingTable && (
        <p className="mt-2 text-[11px] font-semibold text-amber-200/90 leading-snug">
          Pedido por QR. Revisa que haya clientes en la mesa antes de aceptar; al
          aceptarlo entra a cocina.
        </p>
      )}

      {/* Acciones */}
      <div className="flex gap-2 mt-3.5">
        <button
          onClick={onShowDetail}
          className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-[13px] font-bold text-white/80 active:scale-95 transition-all hover:bg-white/10"
        >
          <Eye size={16} /> Ver detalle
        </button>
        {awaitingTable && onReject && (
          <button
            onClick={onReject}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center justify-center gap-2 text-[13px] font-bold active:scale-95 transition-all disabled:opacity-60"
          >
            {rejecting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <XCircle size={16} />
            )}
            {rejecting ? "Rechazando…" : "Rechazar"}
          </button>
        )}
        {isPending && onAccept && (
          <button
            onClick={onAccept}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-[#88D66C] text-[#0C0C0E] flex items-center justify-center gap-2 text-[13px] font-black active:scale-95 transition-all disabled:opacity-60"
          >
            {accepting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} strokeWidth={3} />
            )}
            {accepting ? "Aceptando…" : "Aceptar"}
          </button>
        )}
      </div>
    </div>
  );
}
