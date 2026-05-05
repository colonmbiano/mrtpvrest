"use client";

import React, { useMemo, useState } from "react";
import {
  Plus, Minus, Trash2, Percent, ReceiptText, CreditCard,
  Tag, ShoppingBag,
} from "lucide-react";
import { useTicketStore } from "@/store/ticketStore";

const fmt = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const TYPE_ICON: Record<string, string> = {
  DINE_IN: "🪑",
  TAKEOUT: "🥡",
  DELIVERY: "🛵",
};

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Comer aquí",
  TAKEOUT: "Para llevar",
  DELIVERY: "A domicilio",
};

export default function OrderPanel() {
  const ticket = useTicketStore((s) => s.getActiveTicket());
  const changeItemQty = useTicketStore((s) => s.changeItemQty);
  const removeItem = useTicketStore((s) => s.removeItem);
  const clearActiveItems = useTicketStore((s) => s.clearActiveItems);
  const updateTicket = useTicketStore((s) => s.updateTicket);

  const [tipPct, setTipPct] = useState<number>(0);
  const [, setShowActions] = useState(false);

  const subtotal = useMemo(
    () => ticket.items.reduce((s, it) => s + it.subtotal * it.quantity, 0),
    [ticket.items]
  );

  const discountAmount = useMemo(() => {
    if (!ticket.discount) return 0;
    return ticket.discountType === "percent"
      ? subtotal * (ticket.discount / 100)
      : Math.min(ticket.discount, subtotal);
  }, [ticket.discount, ticket.discountType, subtotal]);

  const subAfterDiscount = subtotal - discountAmount;
  const tax = subAfterDiscount * 0.16; // IVA 16% (México)
  const tip = subAfterDiscount * (tipPct / 100);
  const total = subAfterDiscount + tax + tip;

  const orderId = String(ticket.id).slice(-3).padStart(3, "0");
  const isEmpty = ticket.items.length === 0;

  return (
    <aside
      className="flex flex-col h-full"
      style={{ background: "#0F0F11", borderLeft: "1px solid #27272A", color: "#FFFFFF", fontFamily: "JetBrains Mono, monospace" }}
    >
      {/* HEADER */}
      <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #27272A" }}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>ORDEN</span>
            <span className="text-base font-bold tabular-nums">#{orderId}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "#B8B9B6" }}>
            <span>{TYPE_ICON[ticket.type] || "🪑"}</span>
            <span>{TYPE_LABEL[ticket.type] || "Comer aquí"}</span>
            {ticket.tableName && <span>· {ticket.tableName}</span>}
          </div>
        </div>
        <button
          onClick={() => clearActiveItems()}
          disabled={isEmpty}
          aria-label="Limpiar orden"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:bg-white/10 disabled:opacity-40"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Trash2 size={14} style={{ color: "#FF5C33" }} />
        </button>
      </header>

      {/* CUSTOMER STRIP */}
      <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid #1F1F23", background: "#0C0C0E" }}>
        <input
          type="text"
          value={ticket.name}
          onChange={(e) => updateTicket({ name: e.target.value })}
          placeholder="Nombre del cliente (opcional)"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-600"
        />
      </div>

      {/* ITEMS LIST */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <ShoppingBag size={26} style={{ color: "#666" }} />
            </div>
            <p className="text-sm font-bold" style={{ color: "#B8B9B6" }}>Orden vacía</p>
            <p className="text-[11px]" style={{ color: "#666" }}>
              Toca productos del catálogo para añadirlos a la cuenta.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {ticket.items.map((it, idx) => (
              <li
                key={`${it.menuItemId}-${idx}`}
                className="flex items-start gap-2.5 rounded-xl p-2.5"
                style={{ background: "#1A1A1A", border: "1px solid #27272A" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-bold truncate">{it.name}</span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: "#88D66C" }}>
                      {fmt(it.subtotal * it.quantity)}
                    </span>
                  </div>
                  {it.variantName && (
                    <p className="text-[10px]" style={{ color: "#B8B9B6" }}>{it.variantName}</p>
                  )}
                  {it.modifiers && it.modifiers.length > 0 && (
                    <p className="text-[10px] truncate" style={{ color: "#B8B9B6" }}>
                      {it.modifiers.map((m) => m.name).join(" · ")}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="inline-flex items-center gap-1 rounded-full px-1 py-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <button
                        onClick={() => (it.quantity > 1 ? changeItemQty(idx, -1) : removeItem(idx))}
                        aria-label="Reducir"
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="text-xs font-bold tabular-nums w-5 text-center">{it.quantity}</span>
                      <button
                        onClick={() => changeItemQty(idx, 1)}
                        aria-label="Aumentar"
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10"
                        style={{ color: "#FF8400" }}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(idx)}
                      aria-label="Quitar"
                      className="text-[10px] hover:underline"
                      style={{ color: "#FF5C33" }}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* QUICK ACTIONS */}
      {!isEmpty && (
        <div className="px-5 py-2 grid grid-cols-3 gap-2" style={{ borderTop: "1px solid #27272A" }}>
          <ActionPill icon={<Percent size={11} />} label="Descuento"
            active={ticket.discount > 0}
            onClick={() => {
              const raw = window.prompt("Descuento (%) — 0 para limpiar", String(ticket.discount || 0));
              if (raw === null) return;
              const v = Math.max(0, Math.min(100, Number(raw) || 0));
              updateTicket({ discount: v, discountType: "percent" });
            }} />
          <ActionPill icon={<Tag size={11} />} label={`Propina ${tipPct ? tipPct + "%" : ""}`}
            active={tipPct > 0}
            onClick={() => setTipPct(tipPct === 0 ? 10 : tipPct === 10 ? 15 : tipPct === 15 ? 20 : 0)} />
          <ActionPill icon={<ReceiptText size={11} />} label="Notas"
            onClick={() => setShowActions((v) => !v)} />
        </div>
      )}

      {/* TOTALS */}
      <footer className="flex flex-col gap-2 px-5 pt-3 pb-5" style={{ borderTop: "1px solid #27272A", background: "#0C0C0E" }}>
        <Row label="Subtotal" value={fmt(subtotal)} muted />
        {ticket.discount > 0 && (
          <Row
            label={`Descuento ${ticket.discountType === "percent" ? `(${ticket.discount}%)` : ""}`}
            value={`-${fmt(discountAmount)}`}
            color="#FFB84D"
          />
        )}
        <Row label="IVA (16%)" value={fmt(tax)} muted />
        {tip > 0 && <Row label={`Propina (${tipPct}%)`} value={fmt(tip)} color="#88D66C" />}
        <div className="h-px my-1" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold" style={{ color: "#B8B9B6" }}>TOTAL</span>
          <span className="text-3xl font-bold tabular-nums" style={{ color: "#FFFFFF" }}>{fmt(total)}</span>
        </div>

        <button
          disabled={isEmpty}
          onClick={() => {
            // TODO: ruta /pos/checkout no existe aún, por ahora alert
            window.alert(`Cobrar ${fmt(total)} — pendiente integrar checkout`);
          }}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: isEmpty ? "rgba(255,255,255,0.04)" : "#FF8400",
            color: isEmpty ? "#666" : "#0C0C0E",
            boxShadow: isEmpty ? "none" : "0 8px 18px rgba(255,132,0,0.35)",
          }}
        >
          <CreditCard size={16} />
          Cobrar
        </button>
      </footer>
    </aside>
  );
}

function Row({ label, value, muted, color }: { label: string; value: string; muted?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span style={{ color: muted ? "#B8B9B6" : "#FFFFFF" }}>{label}</span>
      <span className="font-bold tabular-nums" style={{ color: color || (muted ? "#FFFFFF" : "#FFFFFF") }}>{value}</span>
    </div>
  );
}

function ActionPill({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-full py-2 text-[10px] font-bold transition"
      style={{
        background: active ? "rgba(255,132,0,0.18)" : "rgba(255,255,255,0.04)",
        color: active ? "#FF8400" : "#B8B9B6",
        border: `1px solid ${active ? "rgba(255,132,0,0.4)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
