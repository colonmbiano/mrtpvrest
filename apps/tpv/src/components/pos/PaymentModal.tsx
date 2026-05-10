"use client";
import React, { useMemo, useState } from "react";
import {
  CreditCard,
  Banknote,
  QrCode,
  Gift,
  CheckCircle2,
  Users,
  Divide,
  Minus,
  Plus,
  X,
} from "lucide-react";

/**
 * PaymentModal — Warm Tech rewrite con división de cuenta (Fase 12).
 *
 * Pestañas superiores:
 *   [ PAGO TOTAL ] | [ DIVIDIR CUENTA ]
 *
 * En PAGO TOTAL: el flujo histórico — selector de método (CASH/CARD/...)
 * + summary de items + total + Confirmar pago.
 *
 * En DIVIDIR CUENTA: dos modos:
 *   1. PARTES IGUALES → numpad +/- para definir N comensales, muestra
 *      la fracción exacta del total. Confirmar genera el método de
 *      pago igual que en TOTAL pero el caller puede etiquetar las N
 *      transacciones como split.
 *   2. POR ASIENTOS → agrupa los items del ticket por seatNumber. Items
 *      con seat null son "Compartidos" y se prorratean entre todos los
 *      asientos. Muestra el subtotal exacto por asiento.
 *
 * Confirmar pago en modo split llama onConfirm(method) igual que en
 * total — el componente padre puede leer `splitMode` via callback
 * adicional si necesita registrar split en backend (no requerido para
 * F12 básica que es solo cálculo + impresión).
 */

export interface PaymentItem {
  name: string;
  quantity: number;
  subtotal: number;
  // Fase 11/12 · seat para agrupar en split por asientos
  seatNumber?: number | null;
}

export interface PaymentTip {
  /** Porcentaje aplicado (10/15/20...). 0 = sin propina. */
  percent: number;
  /** Monto en moneda calculado a partir del subtotal. */
  amount: number;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  tableName?: string;
  total: number;
  items: PaymentItem[];
  discount?: number;
  /** Sugerencias de propina en porcentaje. Default [10,15,20]. */
  tipSuggestions?: number[];
  onConfirm: (method: string, tip?: PaymentTip) => void;
  /** Opcional · invocado en lugar de onConfirm cuando el usuario
   *  presiona Confirmar en modo split. Si no se provee, usa onConfirm. */
  onConfirmSplit?: (
    method: string,
    plan: {
      kind: "EQUAL" | "BY_SEAT";
      parts: number;
      perPart?: number;
      bySeat?: { seatNumber: number | null; subtotal: number }[];
    },
    tip?: PaymentTip,
  ) => void;
}

type Tab = "TOTAL" | "SPLIT";
type SplitMode = "EQUAL" | "BY_SEAT";

const METHODS = [
  { id: "CASH",     icon: Banknote,   label: "Efectivo" },
  { id: "CARD",     icon: CreditCard, label: "Tarjeta" },
  { id: "TRANSFER", icon: QrCode,     label: "Transfer" },
  { id: "COURTESY", icon: Gift,       label: "Cortesía" },
] as const;

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  orderNumber,
  tableName,
  total,
  items,
  discount = 0,
  tipSuggestions,
  onConfirm,
  onConfirmSplit,
}) => {
  const [tab, setTab] = useState<Tab>("TOTAL");
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [method, setMethod] = useState<string>("CARD");
  const [tipPercent, setTipPercent] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<number>(total);
  const [equalParts, setEqualParts] = useState<number>(2);

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.subtotal, 0),
    [items]
  );
  const calcDiscount = subtotal - total;
  const displayDiscount = discount > 0
    ? discount
    : calcDiscount > 0
      ? calcDiscount
      : 0;

  // Sugerencias de propina — fallback al default del backend (10/15/20).
  const tipSuggested = tipSuggestions && tipSuggestions.length > 0
    ? tipSuggestions
    : [10, 15, 20];

  const tipAmount = total * (tipPercent / 100);
  const grandTotal = total + tipAmount;

  // Re-sync cashReceived al total (incluyendo propina) cuando cambia.
  React.useEffect(() => {
    if (isOpen) setCashReceived(grandTotal);
  }, [isOpen, grandTotal]);

  // Reset propina al abrir.
  React.useEffect(() => {
    if (isOpen) setTipPercent(0);
  }, [isOpen]);

  // FASE 12 · grouping por asiento. Items sin seat → "Compartidos" que
  // se prorratean entre los asientos detectados. Si no hay ningún seat
  // asignado, "Compartidos" queda como una sola línea (que sería el
  // total entero — el split por asientos no aporta info).
  const seatBuckets = useMemo(() => {
    const seats = new Map<number, { subtotal: number; lines: PaymentItem[] }>();
    let sharedSubtotal = 0;
    const sharedLines: PaymentItem[] = [];

    for (const it of items) {
      if (typeof it.seatNumber === "number") {
        const bucket = seats.get(it.seatNumber) || { subtotal: 0, lines: [] };
        bucket.subtotal += it.subtotal;
        bucket.lines.push(it);
        seats.set(it.seatNumber, bucket);
      } else {
        sharedSubtotal += it.subtotal;
        sharedLines.push(it);
      }
    }

    const ordered = Array.from(seats.entries())
      .sort(([a], [b]) => a - b)
      .map(([seatNumber, b]) => ({
        seatNumber,
        subtotal: b.subtotal,
        lines: b.lines,
      }));

    // Prorrateo de compartidos entre los asientos identificados. Si no
    // hay seats, mantenemos compartidos como única línea.
    if (ordered.length > 0 && sharedSubtotal > 0) {
      const sharePerSeat = sharedSubtotal / ordered.length;
      for (const seat of ordered) {
        seat.subtotal += sharePerSeat;
      }
    }

    return {
      seats: ordered,
      shared: { subtotal: sharedSubtotal, lines: sharedLines },
      hasSeats: ordered.length > 0,
    };
  }, [items]);

  if (!isOpen) return null;

  const change = Math.max(0, cashReceived - grandTotal);

  // Ajustes de partes iguales (clamp 1-20).
  const incParts = () => setEqualParts((n) => Math.min(20, n + 1));
  const decParts = () => setEqualParts((n) => Math.max(1, n - 1));
  const perPart = grandTotal / Math.max(1, equalParts);

  const cashSuggestions = useMemo(
    () =>
      Array.from(
        new Set([
          grandTotal,
          Math.ceil(grandTotal / 50) * 50,
          Math.ceil(grandTotal / 100) * 100,
          Math.ceil(grandTotal / 100) * 100 + 100,
          200,
          500,
          1000,
        ])
      )
        .filter((v) => v >= grandTotal)
        .sort((a, b) => a - b)
        .slice(0, 8),
    [grandTotal]
  );

  const tipPayload: PaymentTip | undefined = tipPercent > 0
    ? { percent: tipPercent, amount: tipAmount }
    : undefined;

  const handleConfirm = () => {
    if (tab === "TOTAL") {
      onConfirm(method, tipPayload);
      return;
    }
    // SPLIT
    if (onConfirmSplit) {
      if (splitMode === "EQUAL") {
        onConfirmSplit(
          method,
          { kind: "EQUAL", parts: equalParts, perPart },
          tipPayload,
        );
      } else {
        onConfirmSplit(
          method,
          {
            kind: "BY_SEAT",
            parts:
              seatBuckets.seats.length +
              (seatBuckets.shared.subtotal > 0 && !seatBuckets.hasSeats ? 1 : 0),
            bySeat: [
              ...seatBuckets.seats.map((s) => ({
                seatNumber: s.seatNumber,
                subtotal: s.subtotal,
              })),
              ...(seatBuckets.shared.subtotal > 0 && !seatBuckets.hasSeats
                ? [{ seatNumber: null, subtotal: seatBuckets.shared.subtotal }]
                : []),
            ],
          },
          tipPayload,
        );
      }
    } else {
      onConfirm(method, tipPayload);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-5xl h-[88vh] max-h-[760px] bg-[#0C0C0E] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* GLOWS */}
        <div
          aria-hidden
          className="absolute pointer-events-none -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(255,184,77,0.25) 0%, transparent 70%)",
          }}
        />

        {/* HEADER + TABS */}
        <div className="relative z-10 px-7 sm:px-10 pt-7 sm:pt-9 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d] uppercase">
                Orden #{orderNumber}
                {tableName ? ` · Mesa ${tableName}` : ""}
              </span>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white truncate">
                Procesar pago
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {/* TABS */}
          <div className="flex items-center gap-2 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit">
            <TabButton
              active={tab === "TOTAL"}
              onClick={() => setTab("TOTAL")}
              icon={<CheckCircle2 size={14} />}
              label="Pago total"
            />
            <TabButton
              active={tab === "SPLIT"}
              onClick={() => setTab("SPLIT")}
              icon={<Divide size={14} />}
              label="Dividir cuenta"
            />
          </div>
        </div>

        {/* BODY */}
        <div className="relative z-10 flex-1 min-h-0 flex overflow-hidden">
          {/* LEFT */}
          <div className="flex-1 min-w-0 p-7 sm:p-9 overflow-y-auto scrollbar-hide">
            {tab === "TOTAL" ? (
              <TotalView
                method={method}
                onMethodChange={setMethod}
                cashReceived={cashReceived}
                onCashChange={setCashReceived}
                cashSuggestions={cashSuggestions}
                total={grandTotal}
                change={change}
                tipSuggestions={tipSuggested}
                tipPercent={tipPercent}
                tipAmount={tipAmount}
                onTipChange={setTipPercent}
                baseTotal={total}
              />
            ) : (
              <SplitView
                mode={splitMode}
                onModeChange={setSplitMode}
                total={grandTotal}
                equalParts={equalParts}
                onIncParts={incParts}
                onDecParts={decParts}
                perPart={perPart}
                seatBuckets={seatBuckets}
                method={method}
                onMethodChange={setMethod}
                tipSuggestions={tipSuggested}
                tipPercent={tipPercent}
                tipAmount={tipAmount}
                onTipChange={setTipPercent}
                baseTotal={total}
              />
            )}
          </div>

          {/* RIGHT — summary */}
          <aside className="hidden md:flex w-[340px] shrink-0 bg-white/[0.03] border-l border-white/5 p-7 flex-col">
            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6">
              <div>
                <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                  Resumen del pedido
                </span>
                <div className="mt-3 space-y-2">
                  {items.map((it, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-baseline gap-3"
                    >
                      <span className="text-[13px] font-bold text-white/80 truncate flex-1 min-w-0">
                        <span className="text-[#ffb84d] mr-2 tabular-nums">
                          {it.quantity}×
                        </span>
                        {it.name}
                        {typeof it.seatNumber === "number" && (
                          <span className="text-[10px] text-white/40 ml-1.5 font-bold uppercase tracking-widest">
                            · S{it.seatNumber}
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] font-bold tabular-nums text-white/80 shrink-0">
                        ${it.subtotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-white/5">
                <div className="flex justify-between items-baseline text-white/50 text-[12px] font-bold">
                  <span>Subtotal</span>
                  <span className="tabular-nums">${subtotal.toFixed(2)}</span>
                </div>
                {displayDiscount > 0 && (
                  <div className="flex justify-between items-baseline text-[#88D66C] text-[12px] font-bold">
                    <span>Descuento</span>
                    <span className="tabular-nums">
                      − ${displayDiscount.toFixed(2)}
                    </span>
                  </div>
                )}
                {tipPercent > 0 && (
                  <div className="flex justify-between items-baseline text-[#ffb84d] text-[12px] font-bold">
                    <span>Propina ({tipPercent}%)</span>
                    <span className="tabular-nums">
                      + ${tipAmount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-5 border-t border-white/5 flex items-baseline justify-between">
              <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                Total
              </span>
              <span className="tabular-nums text-4xl font-black text-white tracking-tight">
                ${grandTotal.toFixed(2)}
              </span>
            </div>
          </aside>
        </div>

        {/* FOOTER · CTA */}
        <div className="relative z-10 p-5 sm:p-7 border-t border-white/5 bg-[#0C0C0E] flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[64px] h-16 rounded-2xl bg-white/5 border border-white/10 text-white/70 font-black uppercase tracking-[0.2em] text-[11px] active:scale-95 active:text-white transition-transform"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-[2] min-h-[64px] h-16 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] font-black uppercase tracking-[0.2em] text-[11px] flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,184,77,0.3)]"
          >
            <CheckCircle2 size={20} strokeWidth={2.5} />
            {tab === "SPLIT"
              ? splitMode === "EQUAL"
                ? `Cobrar ${equalParts} parte${equalParts === 1 ? "" : "s"}`
                : `Cobrar por asientos`
              : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;

// ─── SUBCOMPONENTES ───────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] h-11 px-5 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-2 active:scale-95 transition-all ${
        active
          ? "bg-[#ffb84d] text-[#0C0C0E] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
          : "bg-transparent text-white/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MethodGrid({
  method,
  onChange,
}: {
  method: string;
  onChange: (m: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {METHODS.map((m) => {
        const Icon = m.icon;
        const isSelected = method === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`min-h-[88px] h-24 rounded-3xl flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform border-2 ${
              isSelected
                ? "bg-[#ffb84d]/10 border-[#ffb84d] text-[#ffb84d] shadow-[0_5px_20px_rgba(255,184,77,0.15)]"
                : "bg-white/5 border-white/10 text-white/60"
            }`}
          >
            <Icon size={24} strokeWidth={2} />
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TotalView({
  method,
  onMethodChange,
  cashReceived,
  onCashChange,
  cashSuggestions,
  total,
  change,
  tipSuggestions,
  tipPercent,
  tipAmount,
  onTipChange,
  baseTotal,
}: {
  method: string;
  onMethodChange: (m: string) => void;
  cashReceived: number;
  onCashChange: (n: number) => void;
  cashSuggestions: number[];
  total: number;
  change: number;
  tipSuggestions: number[];
  tipPercent: number;
  tipAmount: number;
  onTipChange: (pct: number) => void;
  baseTotal: number;
}) {
  return (
    <div className="space-y-7">
      <TipPicker
        suggestions={tipSuggestions}
        selected={tipPercent}
        amount={tipAmount}
        baseTotal={baseTotal}
        onChange={onTipChange}
      />

      <MethodGrid method={method} onChange={onMethodChange} />

      <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
        {method === "CASH" && (
          <div className="space-y-6">
            <div className="flex justify-between items-end gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                  Monto recibido
                </span>
                <div className="text-5xl font-black tabular-nums text-white leading-none">
                  ${cashReceived.toFixed(2)}
                </div>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d] uppercase">
                  Cambio
                </span>
                <div className="text-3xl font-black tabular-nums text-[#ffb84d] leading-none">
                  ${change.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {cashSuggestions.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onCashChange(val)}
                  className={`min-h-[56px] h-14 rounded-2xl border tabular-nums font-black active:scale-95 transition-transform ${
                    cashReceived === val
                      ? "bg-[#ffb84d] border-[#ffb84d] text-[#0C0C0E] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
                      : "bg-white/5 border-white/10 text-white"
                  }`}
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>
        )}

        {method === "CARD" && (
          <div className="flex flex-col items-center justify-center gap-6 py-10 text-center">
            <div className="w-20 h-20 rounded-3xl bg-[#ffb84d]/10 border border-[#ffb84d]/30 flex items-center justify-center text-[#ffb84d] animate-pulse">
              <CreditCard size={42} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white tracking-tight">
                Esperando terminal...
              </h3>
              <p className="text-[10px] text-white/50 font-bold uppercase tracking-[0.2em]">
                Cobrar al confirmar — el TPV procesa por separado
              </p>
            </div>
          </div>
        )}

        {method === "TRANSFER" && (
          <div className="flex items-center justify-center gap-8 py-6">
            <div className="w-40 h-40 bg-white p-4 rounded-3xl shadow-2xl flex items-center justify-center shrink-0">
              <QrCode size={140} className="text-black" />
            </div>
            <div className="space-y-2 max-w-xs">
              <h3 className="text-xl font-black leading-tight text-white tracking-tight">
                Escanea para pagar
              </h3>
              <p className="text-[12px] text-white/50 leading-relaxed font-medium">
                Muestra este código al cliente. Confirma el pago una vez
                procesado.
              </p>
            </div>
          </div>
        )}

        {method === "COURTESY" && (
          <div className="flex flex-col items-center justify-center gap-5 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-[#ffb84d]/10 flex items-center justify-center text-[#ffb84d]">
              <Gift size={36} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white tracking-tight">
                Marcado como cortesía
              </h3>
              <p className="text-[12px] text-white/50 max-w-xs mx-auto font-medium leading-relaxed">
                Se requiere autorización de gerente para cerrar órdenes sin
                cobro.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="md:hidden flex justify-between items-baseline pt-2 border-t border-white/5">
        <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
          Total
        </span>
        <span className="tabular-nums text-3xl font-black text-white">
          ${total.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function SplitView({
  mode,
  onModeChange,
  total,
  equalParts,
  onIncParts,
  onDecParts,
  perPart,
  seatBuckets,
  method,
  onMethodChange,
  tipSuggestions,
  tipPercent,
  tipAmount,
  onTipChange,
  baseTotal,
}: {
  mode: SplitMode;
  onModeChange: (m: SplitMode) => void;
  total: number;
  equalParts: number;
  onIncParts: () => void;
  onDecParts: () => void;
  perPart: number;
  seatBuckets: {
    seats: { seatNumber: number; subtotal: number; lines: PaymentItem[] }[];
    shared: { subtotal: number; lines: PaymentItem[] };
    hasSeats: boolean;
  };
  method: string;
  onMethodChange: (m: string) => void;
  tipSuggestions: number[];
  tipPercent: number;
  tipAmount: number;
  onTipChange: (pct: number) => void;
  baseTotal: number;
}) {
  return (
    <div className="space-y-6">
      <TipPicker
        suggestions={tipSuggestions}
        selected={tipPercent}
        amount={tipAmount}
        baseTotal={baseTotal}
        onChange={onTipChange}
      />

      {/* SUB-TABS */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 border border-white/10 rounded-2xl">
        <button
          type="button"
          onClick={() => onModeChange("EQUAL")}
          className={`min-h-[44px] h-11 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all ${
            mode === "EQUAL"
              ? "bg-[#ffb84d] text-[#0C0C0E] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
              : "bg-transparent text-white/60"
          }`}
        >
          <Users size={14} />
          Partes iguales
        </button>
        <button
          type="button"
          onClick={() => onModeChange("BY_SEAT")}
          className={`min-h-[44px] h-11 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all ${
            mode === "BY_SEAT"
              ? "bg-[#ffb84d] text-[#0C0C0E] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
              : "bg-transparent text-white/60"
          }`}
        >
          <Divide size={14} />
          Por asientos
        </button>
      </div>

      {mode === "EQUAL" && (
        <EqualSplit
          total={total}
          parts={equalParts}
          perPart={perPart}
          onInc={onIncParts}
          onDec={onDecParts}
        />
      )}

      {mode === "BY_SEAT" && <SeatSplit total={total} seatBuckets={seatBuckets} />}

      {/* Método de pago para los N tickets */}
      <div>
        <p className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase mb-3">
          Método (aplicado a cada parte)
        </p>
        <MethodGrid method={method} onChange={onMethodChange} />
      </div>
    </div>
  );
}

function EqualSplit({
  total,
  parts,
  perPart,
  onInc,
  onDec,
}: {
  total: number;
  parts: number;
  perPart: number;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <div className="rounded-3xl bg-white/5 border border-white/10 p-7 space-y-7">
      <div className="flex flex-col items-center text-center gap-2">
        <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
          Comensales
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onDec}
            disabled={parts <= 1}
            aria-label="Restar comensal"
            className="w-16 h-16 min-h-[64px] rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
          >
            <Minus size={22} />
          </button>
          <span className="tabular-nums text-7xl font-black text-white leading-none w-28 text-center">
            {parts}
          </span>
          <button
            type="button"
            onClick={onInc}
            disabled={parts >= 20}
            aria-label="Sumar comensal"
            className="w-16 h-16 min-h-[64px] rounded-2xl bg-[#ffb84d]/15 border border-[#ffb84d]/40 text-[#ffb84d] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
          >
            <Plus size={22} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between p-5 rounded-2xl bg-[#ffb84d]/10 border border-[#ffb84d]/30">
        <div>
          <div className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d] uppercase">
            Cada parte paga
          </div>
          <div className="text-[10px] font-bold text-white/40 mt-1 tabular-nums">
            ${total.toFixed(2)} ÷ {parts}
          </div>
        </div>
        <div className="tabular-nums text-4xl font-black text-[#ffb84d] tracking-tight">
          ${perPart.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

function SeatSplit({
  total,
  seatBuckets,
}: {
  total: number;
  seatBuckets: {
    seats: { seatNumber: number; subtotal: number; lines: PaymentItem[] }[];
    shared: { subtotal: number; lines: PaymentItem[] };
    hasSeats: boolean;
  };
}) {
  if (!seatBuckets.hasSeats) {
    return (
      <div className="rounded-3xl bg-white/5 border border-white/10 p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 text-white/40 flex items-center justify-center mx-auto">
          <Users size={24} />
        </div>
        <h4 className="text-[13px] font-black text-white tracking-tight uppercase">
          Sin asientos asignados
        </h4>
        <p className="text-[11px] font-medium text-white/50 leading-relaxed max-w-xs mx-auto">
          Asigna un asiento a cada producto desde la comanda para dividir
          la cuenta automáticamente. Los items compartidos se prorratean
          entre los asientos detectados.
        </p>
      </div>
    );
  }

  const sharePerSeat =
    seatBuckets.shared.subtotal > 0
      ? seatBuckets.shared.subtotal / seatBuckets.seats.length
      : 0;

  return (
    <div className="space-y-3">
      {seatBuckets.seats.map((seat) => (
        <div
          key={seat.seatNumber}
          className="rounded-3xl bg-white/5 border border-white/10 p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffb84d]/15 border border-[#ffb84d]/30 text-[#ffb84d] flex items-center justify-center font-black tabular-nums text-[15px]">
                {seat.seatNumber}
              </div>
              <span className="text-[12px] font-black uppercase tracking-[0.2em] text-white">
                Asiento {seat.seatNumber}
              </span>
            </div>
            <div className="tabular-nums text-2xl font-black text-white">
              ${seat.subtotal.toFixed(2)}
            </div>
          </div>
          <div className="space-y-1.5 pl-13">
            {seat.lines.map((l, i) => (
              <div
                key={i}
                className="flex justify-between items-baseline text-[11px] font-bold text-white/60"
              >
                <span className="truncate flex-1 min-w-0">
                  <span className="text-[#ffb84d] mr-1.5 tabular-nums">
                    {l.quantity}×
                  </span>
                  {l.name}
                </span>
                <span className="tabular-nums shrink-0">
                  ${l.subtotal.toFixed(2)}
                </span>
              </div>
            ))}
            {sharePerSeat > 0 && (
              <div className="flex justify-between items-baseline text-[11px] font-bold text-[#88D66C] pt-1 border-t border-white/5 mt-1.5">
                <span>+ parte compartida</span>
                <span className="tabular-nums">${sharePerSeat.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
        <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
          Suma de asientos
        </span>
        <span className="tabular-nums text-[15px] font-black text-white">
          ${total.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function TipPicker({
  suggestions,
  selected,
  amount,
  baseTotal,
  onChange,
}: {
  suggestions: number[];
  selected: number;
  amount: number;
  baseTotal: number;
  onChange: (pct: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
          Propina (opcional)
        </span>
        {selected > 0 && (
          <span className="text-[11px] font-black text-[#ffb84d] tabular-nums">
            +${amount.toFixed(2)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`min-h-[56px] h-14 rounded-2xl border font-black tabular-nums text-[11px] uppercase tracking-widest active:scale-95 transition-transform ${
            selected === 0
              ? "bg-white/15 border-white/30 text-white"
              : "bg-white/5 border-white/10 text-white/60"
          }`}
        >
          Sin propina
        </button>
        {suggestions.map((pct) => {
          const tip = baseTotal * (pct / 100);
          const active = selected === pct;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => onChange(active ? 0 : pct)}
              className={`min-h-[56px] h-14 rounded-2xl border flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform ${
                active
                  ? "bg-[#ffb84d] border-[#ffb84d] text-[#0C0C0E] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
                  : "bg-white/5 border-white/10 text-white"
              }`}
            >
              <span className="font-black text-[14px]">{pct}%</span>
              <span
                className={`text-[10px] tabular-nums ${
                  active ? "text-[#0C0C0E]/80" : "text-white/40"
                }`}
              >
                +${tip.toFixed(0)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
