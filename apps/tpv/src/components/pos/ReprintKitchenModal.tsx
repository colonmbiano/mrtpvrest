"use client";
import React, { useMemo, useState } from "react";
import { X, ChefHat, Printer, CheckSquare, Square, AlertTriangle } from "lucide-react";
import {
  printKitchenTickets,
  type PrinterRecord,
  type TicketItem,
  type KitchenTicketConfig,
  type ComboPart,
} from "@/lib/printer-tcp";
import { toast } from "sonner";

export interface ReprintCandidateItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  /** Desglose de combo/promo para la comanda (sub-línea entre paréntesis). */
  kitchenDetail?: string | null;
  /** Partes de combo para explotar por estación al reimprimir. */
  comboParts?: ComboPart[] | null;
  printerGroupIds?: string[];
  modifiers?: { name: string; priceAdd?: number }[];
  seatNumber?: number | null;
}

interface ReprintKitchenModalProps {
  isOpen: boolean;
  onClose: () => void;
  printers: PrinterRecord[];
  orderNumber: string;
  orderType?: string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  items: ReprintCandidateItem[];
  config?: KitchenTicketConfig | null;
}

const ReprintKitchenModal: React.FC<ReprintKitchenModalProps> = ({
  isOpen,
  onClose,
  printers,
  orderNumber,
  orderType,
  tableNumber,
  customerName,
  items,
  config,
}) => {
  // Por defecto todos los items vienen seleccionados — el caso común es
  // "perdí la comanda, vuélvanla a sacar entera". Si el usuario quiere
  // parcial los va deseleccionando.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.map((it) => it.id))
  );
  const [submitting, setSubmitting] = useState(false);

  // Re-sync cuando cambian los items (cambio de orden o nuevo open).
  // Render-phase (ver CategoryModal): equivalente al efecto pero sin
  // set-state-in-effect.
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setSelected(new Set(items.map((it) => it.id)));
  }

  const allSelected = useMemo(
    () => items.length > 0 && selected.size === items.length,
    [items, selected]
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((it) => it.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos un item");
      return;
    }
    setSubmitting(true);
    try {
      const chosen = items.filter((it) => selected.has(it.id));
      const ticketItems: TicketItem[] = chosen.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        price: 0, // cocina no muestra precios
        notes: it.notes || null,
        kitchenDetail: it.kitchenDetail || null,
        comboParts: it.comboParts ?? null,
        modifiers: it.modifiers || [],
        printerGroupIds: it.printerGroupIds || [],
        seatNumber: it.seatNumber ?? null,
      }));

      const isPartial = selected.size < items.length;
      const res = await printKitchenTickets(printers, {
        orderNumber,
        orderType: orderType || null,
        tableNumber: tableNumber || null,
        customerName: customerName || null,
        items: ticketItems,
        isReprint: true,
        isPartial,
        config: config ?? undefined,
      });

      if (res.ok > 0 && res.failed.length === 0) {
        toast.success(
          `Reimpresión ${isPartial ? "parcial" : "total"} en ${res.ok} estación${
            res.ok > 1 ? "es" : ""
          }`
        );
        onClose();
      } else if (res.ok > 0) {
        toast.warning(`Comanda: ${res.ok} ok / ${res.failed.length} fallaron`);
        onClose();
      } else {
        toast.error(
          "No se pudo imprimir: " +
            (res.failed[0]?.error || "sin impresoras KITCHEN/BAR activas")
        );
      }
    } catch (err: any) {
      toast.error("Error al reimprimir: " + (err?.message || "fallo desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[520px] max-h-[88vh] flex flex-col bg-[var(--bg)] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Glow */}
        <div
          aria-hidden
          className="absolute pointer-events-none -top-24 -right-24 w-72 h-72 rounded-full opacity-30 blur-[80px]"
          style={{
            background:
              "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)",
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-5 border-b border-white/5 bg-white/5 backdrop-blur-md flex items-center gap-4 shrink-0">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)] shrink-0">
            <ChefHat size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
              Reimprimir comanda
            </span>
            <div className="flex items-baseline gap-2">
              <h3 className="text-[18px] font-black text-white truncate leading-none">
                #{orderNumber}
              </h3>
              {tableNumber && (
                <span className="text-[11px] font-bold text-[var(--brand)] uppercase tracking-wider">
                  · Mesa {tableNumber}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        {/* WARNING BANNER */}
        <div className="relative z-10 p-3 bg-[var(--brand-soft)] border-b border-[var(--brand)] flex items-center gap-3 shrink-0">
          <AlertTriangle size={16} className="text-[var(--brand)] shrink-0" />
          <span className="text-[11px] font-bold text-[var(--brand)] leading-relaxed">
            Cocina recibirá ticket marcado como
            <span className="mono mx-1 px-1.5 py-0.5 bg-[var(--brand-soft)] rounded text-[10px]">
              *** REIMPRESION ***
            </span>
            para no preparar dos veces.
          </span>
        </div>

        {/* SELECT ALL */}
        <div className="relative z-10 px-5 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 text-white active:scale-95 transition-transform"
          >
            {allSelected ? (
              <CheckSquare size={18} className="text-[var(--brand)]" />
            ) : (
              <Square size={18} className="text-white/40" />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              {allSelected ? "Quitar todos" : "Seleccionar todos"}
            </span>
          </button>
          <span className="text-[11px] font-bold text-white/50 tabular-nums">
            {selected.size} / {items.length}
          </span>
        </div>

        {/* ITEMS LIST */}
        <div className="relative z-10 flex-1 overflow-y-auto p-3 scrollbar-hide">
          {items.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-[12px] font-bold uppercase tracking-widest">
              Sin items para reimprimir
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => {
                const isOn = selected.has(it.id);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => toggleOne(it.id)}
                      className={`w-full min-h-[64px] p-3 rounded-2xl border-2 flex items-center gap-3 active:scale-[0.99] transition-all text-left ${
                        isOn
                          ? "bg-[var(--brand-soft)] border-[var(--brand)]"
                          : "bg-white/[0.03] border-white/10"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          isOn
                            ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)]"
                            : "bg-white/5 border-white/10 text-white/40"
                        }`}
                      >
                        {isOn ? <CheckSquare size={16} /> : <Square size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-white truncate">
                          <span className="text-[var(--brand)] mr-2">
                            {it.quantity}×
                          </span>
                          {it.name}
                        </div>
                        {it.notes && (
                          <div className="text-[11px] font-medium text-white/50 italic truncate mt-0.5">
                            ✎ {it.notes}
                          </div>
                        )}
                        {it.modifiers && it.modifiers.length > 0 && (
                          <div className="text-[10px] font-bold text-white/40 truncate mt-0.5">
                            {it.modifiers.map((m) => m.name).join(" · ")}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* CTA */}
        <div className="relative z-10 p-4 border-t border-white/5 bg-[var(--bg)] shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            disabled={submitting || selected.size === 0}
            className="w-full min-h-[64px] h-16 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.1em] text-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_var(--brand-glow)] disabled:opacity-50 disabled:active:scale-100"
          >
            <Printer size={16} strokeWidth={2.5} />
            {submitting
              ? "Imprimiendo..."
              : selected.size === items.length
              ? "Reimprimir comanda completa"
              : `Reimprimir ${selected.size} item${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReprintKitchenModal;
