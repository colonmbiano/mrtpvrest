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
  /** Oculta importes (modo préstamo de caja). */
  hideMoney?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Mesa",
  TAKEOUT: "Llevar",
  DELIVERY: "Domicilio",
};

const TYPE_TONE: Record<string, string> = {
  DINE_IN: "bg-[#ffb84d]/15 text-[#ffb84d] border-[#ffb84d]/25",
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
      <aside className="relative w-full max-w-[560px] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out overflow-hidden bg-[#0C0C0E] text-white border-l border-white/10">
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
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Pedidos web
            </span>
            <span className="text-[16px] font-black text-white truncate leading-none">
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
        <span className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">
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
  onShowDetail,
}: {
  order: WebOrder;
  hideMoney?: boolean;
  accepting?: boolean;
  onAccept?: () => void;
  onShowDetail: () => void;
}) {
  const isPending = order.status === "PENDING";
  const typeKey = (order.orderType || "").toUpperCase();
  const typeTone = TYPE_TONE[typeKey] || TYPE_TONE.TAKEOUT;
  const typeLabel = TYPE_LABEL[typeKey] || order.orderType || "Pedido";

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        isPending
          ? "bg-[#5e6ad2]/8 border-[#5e6ad2]/30"
          : "bg-white/[0.03] border-white/8"
      }`}
    >
      {/* Encabezado: cliente + total */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-black text-white truncate leading-tight">
            {order.customerName}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${typeTone}`}
            >
              {typeLabel}
            </span>
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
          <span className="text-[#ffb84d] font-bold">
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

      {/* Acciones */}
      <div className="flex gap-2 mt-3.5">
        <button
          onClick={onShowDetail}
          className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-[13px] font-bold text-white/80 active:scale-95 transition-all hover:bg-white/10"
        >
          <Eye size={16} /> Ver detalle
        </button>
        {isPending && onAccept && (
          <button
            onClick={onAccept}
            disabled={accepting}
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
