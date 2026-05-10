"use client";
import React, { useEffect, useMemo, useState } from "react";
import { X, ArrowRight, Users } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface OpenOrderLite {
  id: string;
  orderNumber: string;
  total: number;
  customerName?: string | null;
  table?: { id: string; name: string } | null;
  tableNumber?: number | null;
  itemsCount?: number;
}

interface MergeTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Orden origen (la que se va a vaciar/cerrar). */
  source: OpenOrderLite;
  /** Tras éxito, se invoca con la orden destino actualizada. */
  onSuccess: (mergedTargetId: string) => void;
}

/**
 * MergeTableModal — Permite mover/fusionar una cuenta abierta a otra.
 *
 * El backend acepta dos endpoints idénticos:
 *   POST /api/orders/:id/transfer-to/:targetId  → "mover"
 *   POST /api/orders/:id/merge/:targetId        → "fusionar"
 *
 * Lógicamente son lo mismo: items de origen pasan a destino y origen
 * queda CANCELLED (con nota de auditoría). La diferencia es semántica
 * para el cajero — usamos /merge si la mesa destino ya tiene cuenta
 * activa (típico al juntar dos mesas) y /transfer-to si está libre.
 */
export default function MergeTableModal({
  isOpen,
  onClose,
  source,
  onSuccess,
}: MergeTableModalProps) {
  const [openOrders, setOpenOrders] = useState<OpenOrderLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pickedTargetId, setPickedTargetId] = useState<string | null>(null);

  const ACTIVE = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OPEN"];

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/api/orders/admin");
        const list = (Array.isArray(data) ? data : [])
          .filter((o: any) => ACTIVE.includes(o.status) && o.id !== source.id)
          .map((o: any) => ({
            id: o.id as string,
            orderNumber: o.orderNumber || `#${String(o.id).slice(-6).toUpperCase()}`,
            total: Number(o.total ?? 0),
            customerName: o.customerName ?? o.user?.name ?? null,
            table: o.table ?? null,
            tableNumber: o.tableNumber ?? null,
            itemsCount: Array.isArray(o.items) ? o.items.length : 0,
          }));
        if (!cancelled) setOpenOrders(list);
      } catch {
        if (!cancelled) setOpenOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, source.id]);

  const target = useMemo(
    () => openOrders.find((o) => o.id === pickedTargetId) ?? null,
    [openOrders, pickedTargetId],
  );

  if (!isOpen) return null;

  async function execute(action: "transfer" | "merge") {
    if (!pickedTargetId) {
      toast.error("Selecciona la orden destino");
      return;
    }
    setSubmitting(true);
    const url =
      action === "merge"
        ? `/api/orders/${source.id}/merge/${pickedTargetId}`
        : `/api/orders/${source.id}/transfer-to/${pickedTargetId}`;
    try {
      await api.post(url);
      toast.success(
        action === "merge"
          ? `Cuentas fusionadas en ${target?.orderNumber}`
          : `Cuenta movida a ${target?.orderNumber}`,
      );
      onSuccess(pickedTargetId);
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error || err?.message || "Error al consolidar",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const sourceLabel = source.table?.name || (source.tableNumber != null ? `Mesa ${source.tableNumber}` : source.orderNumber);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-[#0C0C0E] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center gap-3 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-[#ffb84d]/15 border border-[#ffb84d]/30 text-[#ffb84d] flex items-center justify-center">
            <Users size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Mover / fusionar cuenta
            </span>
            <h3 className="text-lg font-black text-white truncate">
              {sourceLabel} · #{source.orderNumber}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-hide">
          <p className="text-[11px] font-bold text-white/50 leading-relaxed">
            Selecciona la orden destino. Todos los productos de
            <span className="text-white"> {sourceLabel}</span> se moverán y
            esta cuenta quedará cerrada (con bitácora de auditoría).
          </p>

          {loading ? (
            <div className="text-center py-8 text-white/40 text-[12px]">Cargando...</div>
          ) : openOrders.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-[12px] font-bold uppercase tracking-widest">
              No hay otras cuentas abiertas
            </div>
          ) : (
            openOrders.map((o) => {
              const label = o.table?.name || (o.tableNumber != null ? `Mesa ${o.tableNumber}` : "Sin mesa");
              const isPicked = pickedTargetId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPickedTargetId(o.id)}
                  className={`w-full p-4 rounded-2xl border flex items-center gap-3 transition-transform active:scale-[0.99] ${
                    isPicked
                      ? "bg-[#ffb84d]/10 border-[#ffb84d] text-white"
                      : "bg-white/5 border-white/10 text-white/80"
                  }`}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] font-black truncate">
                      {label} <span className="text-[#ffb84d]">· #{o.orderNumber}</span>
                    </div>
                    <div className="text-[11px] font-bold text-white/50 truncate">
                      {(o.customerName || "Público general")} · {o.itemsCount ?? 0} item
                      {(o.itemsCount ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="tabular-nums text-[14px] font-black">
                    ${o.total.toFixed(2)}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="p-5 border-t border-white/5 bg-white/[0.02] flex flex-col gap-2 shrink-0">
          <button
            type="button"
            disabled={!pickedTargetId || submitting}
            onClick={() => execute("merge")}
            className="w-full min-h-[56px] h-14 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] font-black uppercase tracking-[0.15em] text-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,184,77,0.3)] disabled:opacity-30 disabled:active:scale-100"
          >
            <ArrowRight size={16} strokeWidth={2.5} />
            {submitting ? "Procesando..." : "Fusionar / mover cuenta"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] h-11 rounded-2xl text-white/50 font-black uppercase tracking-[0.15em] text-[11px] active:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
