"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Bike,
  Delete,
  Tag,
  Printer,
  UserRound,
  Percent,
  Search,
  Layers,
} from "lucide-react";
import api from "@/lib/api";
import DiscountModal from "@/components/pos/DiscountModal";

/**
 * PaymentModal — diseño operativo rewrite con división de cuenta (Fase 12).
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

/** Datos del cobro "a cuenta de empleado" (método EMPLOYEE_ACCOUNT). */
export interface EmployeeAccountPayload {
  employeeId: string;
  /** Descuento de empleado (%). null = usar el configurado server-side. */
  discountPct: number | null;
}

/** Un renglón de cobro mixto (split-tender): cuánto entra por cada método. */
export interface PaymentTender {
  method: string;
  amount: number;
}

interface EmployeeLite {
  id: string;
  name: string;
  role?: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  tableName?: string;
  total: number;
  items: PaymentItem[];
  discount?: number;
  requiresDiscountOverride?: boolean;
  onApplyDiscount?: (
    type: "percent" | "fixed",
    value: number,
  ) => void | Promise<void>;
  /** Sugerencias de propina en porcentaje. Default [10,15,20]. */
  tipSuggestions?: number[];
  /** Tipo de orden — necesario para gatear la asignación de repartidor
   *  cuando es DELIVERY (BUG-24). */
  orderType?: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  onConfirm: (
    method: string,
    tip?: PaymentTip,
    driverId?: string | null,
    printReceipt?: boolean,
    account?: EmployeeAccountPayload | null,
    /** Cobro mixto: desglose por método. Presente solo cuando method='MIXED'. */
    payments?: PaymentTender[],
  ) => void | Promise<void>;
  /** Habilita el método "Empleado" (consumo a cuenta). Off por defecto: se
   *  enciende cuando el tenant tiene el módulo de nómina activo. */
  employeeAccountEnabled?: boolean;
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
    driverId?: string | null,
  ) => void | Promise<void>;
  /** Muestra el toggle fijo "Imprimir ticket" en el footer (solo en la
   *  pantalla de cobro principal; el cobro desde el drawer no imprime). */
  showReceiptToggle?: boolean;
  /** Cierre del cobro tras la pantalla de confirmación (botón "Finalizar").
   *  Aquí el padre limpia el contexto y navega a inicio. Si no se pasa, la
   *  pantalla de confirmación no se muestra y se cae al flujo histórico
   *  (onConfirm cierra/navega por su cuenta). */
  onFinish?: () => void;
  /** Imprime el recibo YA PAGADO de la orden recién cobrada (botón "Imprimir
   *  ticket" de la pantalla de confirmación). Recibe el método usado. */
  onPrintReceipt?: (method: string) => void | Promise<void>;
}

interface DriverLite {
  id: string;
  name: string;
  isAvailable?: boolean;
  isActive?: boolean;
}

type Tab = "TOTAL" | "SPLIT";
type SplitMode = "EQUAL" | "BY_SEAT";

const METHODS = [
  { id: "CASH",     icon: Banknote,   label: "Efectivo" },
  { id: "CARD",     icon: CreditCard, label: "Tarjeta" },
  { id: "TRANSFER", icon: QrCode,     label: "Transfer" },
  { id: "COURTESY", icon: Gift,       label: "Cortesía" },
] as const;

// Método extra "a cuenta de empleado" — se agrega solo cuando el tenant tiene
// la nómina activa (employeeAccountEnabled). No es un tender de caja: cierra la
// orden sin efectivo y genera un cargo que se descuenta de la raya.
const EMPLOYEE_METHOD = { id: "EMPLOYEE_ACCOUNT", icon: UserRound, label: "Empleado" } as const;

// Método "Mixto" (cobro dividido por método: efectivo + tarjeta en la misma
// cuenta). Solo aparece en PAGO TOTAL — en DIVIDIR CUENTA el método aplica igual
// a cada parte, así que no tiene sentido. Los métodos que se reparten en el panel.
const MIXED_METHOD = { id: "MIXED", icon: Layers, label: "Mixto" } as const;
const MIXED_TENDER_METHODS = [
  { id: "CASH",     icon: Banknote,   label: "Efectivo" },
  { id: "CARD",     icon: CreditCard, label: "Tarjeta" },
  { id: "TRANSFER", icon: QrCode,     label: "Transfer" },
] as const;

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  orderNumber,
  tableName,
  total,
  items,
  discount = 0,
  requiresDiscountOverride = false,
  onApplyDiscount,
  tipSuggestions,
  orderType,
  onConfirm,
  onConfirmSplit,
  showReceiptToggle = false,
  employeeAccountEnabled = false,
  onFinish,
  onPrintReceipt,
}) => {
  const [tab, setTab] = useState<Tab>("TOTAL");
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  // Default CASH: efectivo es el método más frecuente en piso; abrir en
  // tarjeta obligaba un tap extra en cada cobro (gap vs Loyverse).
  const [method, setMethod] = useState<string>("CASH");
  const [tipPercent, setTipPercent] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<number>(total);
  // Buffer de tecleo manual del efectivo recibido. "" = usando el monto
  // sugerido/auto (= grandTotal). Se resetea junto con cashReceived.
  const [cashEntry, setCashEntry] = useState<string>("");
  const [equalParts, setEqualParts] = useState<number>(2);
  // Cobro mixto: monto tecleado por método (string para edición libre). "" = 0.
  const [mixedAmounts, setMixedAmounts] = useState<Record<string, string>>({});
  const isMixed = method === "MIXED";
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountSaving, setDiscountSaving] = useState(false);

  // BUG-24: asignación de repartidor inline cuando es DELIVERY.
  // Cargamos la lista de repartidores activos cuando el modal abre con
  // type=DELIVERY; el cajero debe elegir uno antes de confirmar el cobro.
  const [drivers, setDrivers] = useState<DriverLite[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driversLoading, setDriversLoading] = useState(false);
  const isDelivery = orderType === "DELIVERY";

  useEffect(() => {
    if (!isOpen || !isDelivery) return;
    let cancelled = false;
    // Arranque diferido (ver impresoras): el setDriversLoading(true) ya no
    // corre sincrónicamente en el effect (set-state-in-effect).
    queueMicrotask(() => {
      if (cancelled) return;
      setDriversLoading(true);
      api.get<DriverLite[]>("/api/delivery")
        .then(({ data }) => {
          if (cancelled) return;
          const active = (Array.isArray(data) ? data : []).filter(
            (d) => d.isActive !== false,
          );
          setDrivers(active);
          // Auto-seleccionar único disponible para ahorrar un tap.
          if (active.length === 1) setDriverId(active[0]!.id);
        })
        .catch(() => { if (!cancelled) setDrivers([]); })
        .finally(() => { if (!cancelled) setDriversLoading(false); });
    });
    return () => { cancelled = true; };
  }, [isOpen, isDelivery]);

  // Reset driver al cerrar. Render-phase (ver CategoryModal): equivalente
  // al efecto pero sin set-state-in-effect.
  const [prevOpenDriver, setPrevOpenDriver] = useState(isOpen);
  if (prevOpenDriver !== isOpen) {
    setPrevOpenDriver(isOpen);
    if (!isOpen) setDriverId(null);
  }

  // ── Cobro "a cuenta de empleado" (método EMPLOYEE_ACCOUNT) ──────────────────
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [accountEmployeeId, setAccountEmployeeId] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  // Descuento de empleado (%) tecleado por el cajero. "" = usar el configurado
  // server-side (perfil del empleado o default del negocio).
  const [accountDiscount, setAccountDiscount] = useState("");
  const isEmployeeAccount = method === "EMPLOYEE_ACCOUNT";

  // Carga diferida de empleados activos al elegir el método "Empleado".
  useEffect(() => {
    if (!isOpen || !isEmployeeAccount || employees.length > 0 || employeesLoading) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setEmployeesLoading(true);
      api.get<any[]>("/api/employees/sync")
        .then(({ data }) => {
          if (cancelled) return;
          const list = (Array.isArray(data) ? data : [])
            .filter((e) => e && e.isActive !== false)
            .map((e) => ({ id: String(e.id), name: e.name, role: e.role }));
          setEmployees(list);
        })
        .catch(() => { if (!cancelled) setEmployees([]); })
        .finally(() => { if (!cancelled) setEmployeesLoading(false); });
    });
    return () => { cancelled = true; };
  }, [isOpen, isEmployeeAccount, employees.length, employeesLoading]);

  // Reset del estado de cuenta de empleado al cerrar (render-phase, ver patrón).
  const [prevOpenAcct, setPrevOpenAcct] = useState(isOpen);
  if (prevOpenAcct !== isOpen) {
    setPrevOpenAcct(isOpen);
    if (!isOpen) {
      setAccountEmployeeId(null);
      setAccountSearch("");
      setAccountDiscount("");
    }
  }

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
  // Render-phase (ver CategoryModal): equivalente al efecto pero sin
  // set-state-in-effect.
  const [prevCashKey, setPrevCashKey] = useState({ isOpen, grandTotal });
  if (prevCashKey.isOpen !== isOpen || prevCashKey.grandTotal !== grandTotal) {
    setPrevCashKey({ isOpen, grandTotal });
    if (isOpen) {
      setCashReceived(grandTotal);
      setCashEntry("");
    }
  }

  // Reset propina + panel mixto al abrir. Render-phase (ver CategoryModal).
  const [prevOpenTip, setPrevOpenTip] = useState(isOpen);
  if (prevOpenTip !== isOpen) {
    setPrevOpenTip(isOpen);
    if (isOpen) {
      setTipPercent(0);
      setMixedAmounts({});
    }
  }

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

  // BUG-14 (real): este useMemo DEBE quedar antes del early `return null`
  // para no violar Rules of Hooks. Si va después, en el segundo render
  // (isOpen=true) se llaman más hooks que en el primero (isOpen=false) y
  // React lanza Minified Error #310 → COBRAR crashea el WebView en
  // Capacitor.
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

  // Imprimir el ticket de cuenta al cobrar es OPCIONAL y se decide aquí, con un
  // botón fijo en la pantalla de cobro (default apagado: no imprime solo).
  // Debe quedar antes del early `return null` para no violar Rules of Hooks
  // (mismo motivo que cashSuggestions arriba).
  const [printReceipt, setPrintReceipt] = useState(false);

  // Anti multi-tap: el botón Confirmar se bloquea desde el primer tap hasta
  // que el cobro/creación de orden resuelva. La idempotencia del backend NO
  // atrapa el burst (cada tap genera un clientOrderId nuevo), así que la
  // primera línea de defensa es no disparar N requests. Usamos un ref además
  // del estado: el ref se actualiza síncrono, así un segundo tap en el mismo
  // tick (antes de que React re-renderice con submitting=true) también se
  // descarta — el solo `disabled`/estado deja pasar el doble-tap rapidísimo
  // por el closure obsoleto del handler.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Pantalla de confirmación post-cobro (solo pestaña "Pago total"). Cuando
  // queda seteada mostramos el "cambio a dar" + botones Imprimir/Finalizar en
  // lugar del formulario. null = seguimos en el formulario de cobro. Debe
  // declararse antes del early `return null` (Rules of Hooks).
  const [paid, setPaid] = useState<
    | { method: string; received: number; change: number; total: number }
    | null
  >(null);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [receiptPrinted, setReceiptPrinted] = useState(false);

  // Reset al abrir (render-phase, ver CategoryModal). El `finally` de
  // handleConfirm también lo limpia; esto cubre cualquier reapertura del
  // mismo componente montado (SidebarTicket no desmonta el modal).
  const [prevOpenSubmit, setPrevOpenSubmit] = useState(isOpen);
  if (prevOpenSubmit !== isOpen) {
    setPrevOpenSubmit(isOpen);
    if (isOpen) {
      setSubmitting(false);
      // Reabrir para una orden nueva → volver al formulario de cobro.
      setPaid(null);
      setPrintingReceipt(false);
      setReceiptPrinted(false);
    }
  }

  // El espejo en ref del flag submitting se limpia al reabrir, pero FUERA del
  // render (escribir un ref en render rompe bajo doble-render/StrictMode).
  // Corre tras el paint; no hay carrera porque no se puede tap Confirmar antes
  // de que el modal pinte. handleConfirm() lo vuelve a poner true síncrono.
  useEffect(() => {
    if (isOpen) submittingRef.current = false;
  }, [isOpen]);

  if (!isOpen) return null;

  const change = Math.max(0, cashReceived - grandTotal);

  // Ajustes de partes iguales (clamp 1-20).
  const incParts = () => setEqualParts((n) => Math.min(20, n + 1));
  const decParts = () => setEqualParts((n) => Math.max(1, n - 1));
  const perPart = grandTotal / Math.max(1, equalParts);

  const tipPayload: PaymentTip | undefined = tipPercent > 0
    ? { percent: tipPercent, amount: tipAmount }
    : undefined;

  // Payload del cobro a cuenta de empleado (solo cuando aplica y hay empleado).
  const accountPayload: EmployeeAccountPayload | null =
    isEmployeeAccount && accountEmployeeId
      ? {
          employeeId: accountEmployeeId,
          discountPct: accountDiscount.trim() === "" ? null : Number(accountDiscount),
        }
      : null;

  // ── Cobro mixto: desglose y validación de cuadre ────────────────────────────
  // El cobro mixto reparte el TOTAL A COBRAR (grandTotal = total + propina) entre
  // los métodos. Cada renglón es el monto APLICADO a la cuenta (no el efectivo
  // recibido); el cambio del efectivo se muestra aparte. La suma debe cuadrar con
  // grandTotal (± 1 centavo) para poder confirmar — el servidor re-valida igual.
  const mixedTenders: PaymentTender[] = MIXED_TENDER_METHODS
    .map((m) => ({ method: m.id, amount: Number(mixedAmounts[m.id]) || 0 }))
    .filter((t) => t.amount > 0);
  const mixedSum = mixedTenders.reduce((s, t) => s + t.amount, 0);
  const mixedRemaining = grandTotal - mixedSum;
  const mixedOk = Math.abs(mixedRemaining) < 0.01 && mixedTenders.length > 0;
  // Payload de pagos para onConfirm — solo cuando el método es Mixto y cuadra.
  const paymentsPayload: PaymentTender[] | undefined =
    isMixed && mixedOk
      ? mixedTenders.map((t) => ({ method: t.method, amount: Math.round(t.amount * 100) / 100 }))
      : undefined;

  // Gate de confirmación: DELIVERY exige repartidor; "Empleado" exige empleado;
  // "Mixto" exige que los renglones cuadren con el total.
  const canConfirm =
    (!isDelivery || Boolean(driverId)) &&
    (!isEmployeeAccount || Boolean(accountEmployeeId)) &&
    (!isMixed || mixedOk) &&
    !discountSaving;

  const handleConfirm = async () => {
    // Guarda anti doble-tap: el ref se evalúa síncrono (a prueba de closures
    // obsoletos); el `await` mantiene el botón deshabilitado durante todo el
    // request y el `finally` lo re-habilita si el cobro falló (para reintentar).
    if (!canConfirm || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (tab === "TOTAL") {
        await onConfirm(
          method,
          tipPayload,
          driverId,
          printReceipt,
          accountPayload,
          paymentsPayload,
        );
        // Éxito. SOLO el efectivo muestra la pantalla de confirmación (cambio a
        // dar + Imprimir/Finalizar), que es donde importa el cambio. Tarjeta,
        // transferencia, mixto, cortesía y cuenta de empleado cierran directo
        // (comportamiento histórico) para no meter un tap extra. El cierre real
        // —limpiar contexto + volver a inicio— lo hace onFinish (finishPayment).
        if (onFinish && method === "CASH") {
          setPaid({ method, received: cashReceived, change, total: grandTotal });
        } else {
          onFinish?.();
        }
        return;
      }
      // SPLIT
      if (onConfirmSplit) {
        if (splitMode === "EQUAL") {
          await onConfirmSplit(
            method,
            { kind: "EQUAL", parts: equalParts, perPart },
            tipPayload,
            driverId,
          );
        } else {
          await onConfirmSplit(
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
            driverId,
          );
        }
      } else {
        await onConfirm(method, tipPayload, driverId, printReceipt);
      }
    } catch {
      // El cobro falló (el padre ya notificó el error). No avanzamos a la
      // pantalla de confirmación: el finally re-habilita para reintentar.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Botón "Imprimir ticket" de la pantalla de confirmación. Best-effort: no
  // bloquea el cierre y refleja el estado (imprimiendo / impreso) en el botón.
  const handlePrintReceipt = async () => {
    if (!onPrintReceipt || !paid || printingReceipt) return;
    setPrintingReceipt(true);
    try {
      await onPrintReceipt(paid.method);
      setReceiptPrinted(true);
    } catch {
      // El padre ya notifica; permitimos reintentar dejando receiptPrinted en false.
    } finally {
      setPrintingReceipt(false);
    }
  };

  const handleApplyDiscount = async (
    type: "percent" | "fixed",
    value: number,
  ) => {
    if (!onApplyDiscount) return;
    setDiscountSaving(true);
    try {
      await onApplyDiscount(type, value);
    } catch {
      // El caller muestra el error; mantenemos abierto el modal de pago.
    } finally {
      setDiscountSaving(false);
    }
  };

  // ── PANTALLA DE CONFIRMACIÓN (post-cobro) ─────────────────────────────────
  // Tras un cobro exitoso en "Pago total": el cambio a dar en grande + botones
  // Imprimir ticket / Finalizar. El cajero ve de un golpe cuánto devolver.
  if (paid) {
    const methodLabels: Record<string, string> = {
      CASH: "Efectivo",
      CARD: "Tarjeta",
      TRANSFER: "Transferencia",
      COURTESY: "Cortesía",
      MIXED: "Mixto",
      EMPLOYEE_ACCOUNT: "A cuenta de empleado",
    };
    const isCashPaid = paid.method === "CASH";
    const finish = onFinish ?? onClose;
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-0 lg:p-6"
        style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" aria-hidden />
        <div className="relative w-full h-full max-w-none rounded-none border-0 lg:w-full lg:max-w-lg lg:h-auto lg:rounded-[2.5rem] lg:border bg-[var(--bg)] border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
          <div
            aria-hidden
            className="absolute pointer-events-none -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]"
            style={{ background: "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)" }}
          />

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 pt-12 pb-8 text-center">
            <div className="w-16 h-16 rounded-3xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center mb-5">
              <CheckCircle2 size={34} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
              Orden #{orderNumber}
              {tableName ? ` · Mesa ${tableName}` : ""}
            </span>
            <h2 className="text-2xl font-black tracking-tight text-white mt-1">
              Cobro registrado
            </h2>

            {isCashPaid ? (
              <div className="mt-8 w-full rounded-3xl bg-white/5 border border-white/10 p-7">
                <span className="text-[11px] font-semibold tracking-[0.25em] text-[var(--brand)] uppercase">
                  Cambio a dar
                </span>
                <div className="text-6xl sm:text-7xl font-black tabular-nums text-[var(--brand)] leading-none mt-2">
                  ${paid.change.toFixed(2)}
                </div>
                <div className="flex items-center justify-between gap-4 mt-6 pt-5 border-t border-white/10 text-left">
                  <div>
                    <div className="text-[9px] font-semibold tracking-[0.2em] text-white/40 uppercase">
                      Total
                    </div>
                    <div className="text-lg font-black tabular-nums text-white">
                      ${paid.total.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-semibold tracking-[0.2em] text-white/40 uppercase">
                      Recibido
                    </div>
                    <div className="text-lg font-black tabular-nums text-white">
                      ${paid.received.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 w-full rounded-3xl bg-white/5 border border-white/10 p-7">
                <span className="text-[11px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                  Total cobrado
                </span>
                <div className="text-5xl sm:text-6xl font-black tabular-nums text-white leading-none mt-2">
                  ${paid.total.toFixed(2)}
                </div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)] mt-4">
                  {methodLabels[paid.method] ?? paid.method}
                </div>
              </div>
            )}
          </div>

          <div className="relative z-10 p-5 sm:p-7 border-t border-white/5 bg-[var(--bg)] flex flex-col gap-3 shrink-0">
            {onPrintReceipt && (
              <button
                type="button"
                onClick={handlePrintReceipt}
                disabled={printingReceipt}
                className={`min-h-[56px] w-full rounded-2xl border flex items-center justify-center gap-2.5 font-semibold uppercase tracking-[0.14em] text-[11px] active:scale-[0.98] transition-all disabled:opacity-50 ${
                  receiptPrinted
                    ? "bg-[#88d66c]/15 border-[#88d66c]/50 text-[#88d66c]"
                    : "bg-white/5 border-white/10 text-white/70"
                }`}
              >
                <Printer size={18} strokeWidth={2.5} />
                {printingReceipt
                  ? "Imprimiendo…"
                  : receiptPrinted
                    ? "Ticket impreso · imprimir de nuevo"
                    : "Imprimir ticket"}
              </button>
            )}
            <button
              type="button"
              onClick={finish}
              className="min-h-[64px] h-16 w-full rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.14em] text-[11px] flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-[0_10px_30px_var(--brand-glow)]"
            >
              <CheckCircle2 size={20} strokeWidth={2.5} />
              Finalizar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 lg:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* BUG-28: backdrop NO cierra el modal. El cobro suele tener varios
          ajustes (método, propina, repartidor, efectivo recibido) y un tap
          accidental fuera perdía todo el progreso. La salida explícita es
          por la X o por Confirmar. */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        aria-hidden
      />

      <div className="relative w-full h-full max-w-none rounded-none border-0 lg:w-full lg:max-w-5xl lg:h-[88vh] lg:max-h-[760px] lg:rounded-[2.5rem] lg:border bg-[var(--bg)] border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* GLOWS */}
        <div
          aria-hidden
          className="absolute pointer-events-none -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)",
          }}
        />

        {/* HEADER + TABS */}
        <div className="relative z-10 px-7 sm:px-10 pt-7 sm:pt-9 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.25em] text-[var(--brand)] uppercase">
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
              onClick={() => {
                // "Mixto" no aplica a Dividir cuenta (el método va por parte).
                // Sin esto, el método quedaría en MIXED sin renglones y el corte
                // no contaría la venta. Caemos a Efectivo al cambiar de pestaña.
                if (method === "MIXED") setMethod("CASH");
                setTab("SPLIT");
              }}
              icon={<Divide size={14} />}
              label="Dividir cuenta"
            />
          </div>
        </div>

        {/* BODY */}
        <div className="relative z-10 flex-1 min-h-0 flex overflow-hidden">
          {/* LEFT */}
          <div className="flex-1 min-w-0 p-7 sm:p-9 overflow-y-auto scrollbar-hide">
            {onApplyDiscount && (
              <section className="mb-6 rounded-3xl bg-white/5 border border-white/10 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-[#88D66C]/10 border border-[#88D66C]/25 text-[#88D66C] flex items-center justify-center shrink-0">
                      <Tag size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                        Descuento final
                      </h3>
                      <p className="text-xs font-medium text-white/45 mt-1">
                        {displayDiscount > 0
                          ? `Aplicado: $${displayDiscount.toFixed(2)}`
                          : "Opcional, antes de confirmar el cobro"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDiscount(true)}
                    disabled={discountSaving}
                    className="min-h-[48px] px-5 rounded-2xl bg-[#88D66C]/10 border border-[#88D66C]/30 text-[#88D66C] text-[10px] font-semibold uppercase tracking-[0.15em] active:scale-95 transition-transform disabled:opacity-40"
                  >
                    {discountSaving
                      ? "Guardando..."
                      : displayDiscount > 0
                        ? "Editar"
                        : "Aplicar"}
                  </button>
                </div>
              </section>
            )}
            {/* BUG-24: sección Asignar Repartidor — solo DELIVERY.
                Aparece arriba del TotalView/SplitView para que el cajero
                la atienda antes que método de pago/propina. El botón
                Confirmar queda disabled hasta que haya driverId. */}
            {isDelivery && (
              <section className="mb-6 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bike size={16} className="text-[var(--brand)]" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                      Asignar repartidor
                    </h3>
                  </div>
                  {driverId && (
                    <span className="text-[10px] font-semibold tracking-widest uppercase text-emerald-400">
                      Listo
                    </span>
                  )}
                </div>
                {driversLoading ? (
                  <p className="text-xs font-medium text-white/40 py-2 animate-pulse">
                    Cargando repartidores…
                  </p>
                ) : drivers.length === 0 ? (
                  <div className="py-2 flex flex-col gap-2">
                    <p className="text-xs font-medium text-[var(--warning)]">
                      No hay repartidores activos.
                    </p>
                    <button 
                      type="button"
                      onClick={() => {
                        setDriversLoading(true);
                        api.get<DriverLite[]>("/api/delivery")
                          .then(({ data }) => setDrivers((Array.isArray(data) ? data : []).filter(d => d.isActive !== false)))
                          .catch(() => setDrivers([]))
                          .finally(() => setDriversLoading(false));
                      }}
                      className="text-[10px] font-semibold uppercase tracking-widest text-[var(--brand)] hover:underline w-fit"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {drivers.map((d) => {
                      const active = driverId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDriverId(d.id)}
                          className={`min-h-[56px] px-3 py-2 rounded-xl border text-left transition-all active:scale-95 ${
                            active
                              ? "bg-[var(--brand-soft)] border-[var(--brand)] text-white"
                              : "bg-white/[0.03] border-white/10 text-white/75"
                          }`}
                        >
                          <span className="block text-sm font-semibold truncate">
                            {d.name}
                          </span>
                          {d.isAvailable === false && (
                            <span className="block text-[9px] font-bold text-[var(--warning)] uppercase tracking-widest">
                              Ocupado
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {tab === "TOTAL" ? (
              <TotalView
                method={method}
                onMethodChange={setMethod}
                cashReceived={cashReceived}
                onCashChange={setCashReceived}
                cashEntry={cashEntry}
                onCashEntryChange={setCashEntry}
                cashSuggestions={cashSuggestions}
                total={grandTotal}
                change={change}
                tipSuggestions={tipSuggested}
                tipPercent={tipPercent}
                tipAmount={tipAmount}
                onTipChange={setTipPercent}
                baseTotal={total}
                employeeAccountEnabled={employeeAccountEnabled}
                employees={employees}
                employeesLoading={employeesLoading}
                accountEmployeeId={accountEmployeeId}
                onSelectEmployee={setAccountEmployeeId}
                accountSearch={accountSearch}
                onAccountSearchChange={setAccountSearch}
                accountDiscount={accountDiscount}
                onAccountDiscountChange={setAccountDiscount}
                subtotal={subtotal}
                allowMixed={!isDelivery}
                mixedAmounts={mixedAmounts}
                onMixedAmountChange={(id, val) =>
                  setMixedAmounts((prev) => ({ ...prev, [id]: val }))
                }
                mixedSum={mixedSum}
                mixedRemaining={mixedRemaining}
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
                <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                  Resumen del pedido
                </span>
                {/* BUG-22: nombres largos quedaban truncados en el resumen
                    (ARRACHERA HOUSE HAMBURG...). Usamos break-words + tooltip
                    nativo con el nombre completo para no perder información. */}
                <div className="mt-3 space-y-2">
                  {items.map((it, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-baseline gap-3"
                    >
                      <span
                        className="text-[13px] font-bold text-white/80 flex-1 min-w-0 break-words leading-snug"
                        title={it.name}
                      >
                        <span className="text-[var(--brand)] mr-2 tabular-nums">
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
                  <div className="flex justify-between items-baseline text-[var(--brand)] text-[12px] font-bold">
                    <span>Propina ({tipPercent}%)</span>
                    <span className="tabular-nums">
                      + ${tipAmount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-5 border-t border-white/5 flex items-baseline justify-between">
              <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                Total
              </span>
              <span className="tabular-nums text-4xl font-black text-white tracking-tight">
                ${grandTotal.toFixed(2)}
              </span>
            </div>
          </aside>
        </div>

        {/* FOOTER · CTA */}
        <div className="relative z-10 p-5 sm:p-7 border-t border-white/5 bg-[var(--bg)] flex flex-col gap-3 shrink-0">
          {/* Toggle fijo: decidir si se imprime el ticket de cuenta al cobrar.
              Default apagado (no imprime). El cajero lo enciende si el cliente
              quiere su ticket. La comanda de cocina no depende de esto. */}
          {showReceiptToggle && (
            <button
              type="button"
              onClick={() => setPrintReceipt((v) => !v)}
              aria-pressed={printReceipt}
              className={`min-h-[52px] w-full rounded-2xl border flex items-center justify-center gap-2.5 font-semibold uppercase tracking-[0.14em] text-[11px] active:scale-[0.98] transition-all ${
                printReceipt
                  ? "bg-[#88d66c]/15 border-[#88d66c]/50 text-[#88d66c]"
                  : "bg-white/5 border-white/10 text-white/45"
              }`}
            >
              <Printer size={18} strokeWidth={2.5} />
              {printReceipt ? "Sí imprimir ticket" : "Imprimir ticket: NO"}
            </button>
          )}

          <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 min-h-[64px] h-16 rounded-2xl bg-white/5 border border-white/10 text-white/70 font-semibold uppercase tracking-[0.14em] text-[11px] active:scale-95 active:text-white transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            title={
              discountSaving
                ? "Espera a que se guarde el descuento"
                : !canConfirm
                  ? "Selecciona un repartidor antes de cobrar"
                  : undefined
            }
            className="flex-[2] min-h-[64px] h-16 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.14em] text-[11px] flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-[0_10px_30px_var(--brand-glow)] disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
          >
            <CheckCircle2 size={20} strokeWidth={2.5} />
            {submitting
              ? "Procesando..."
              : tab === "SPLIT"
                ? splitMode === "EQUAL"
                  ? `Cobrar ${equalParts} parte${equalParts === 1 ? "" : "s"}`
                  : `Cobrar por asientos`
                : "Confirmar pago"}
          </button>
          </div>
        </div>
      </div>

      {onApplyDiscount && (
        <DiscountModal
          isOpen={showDiscount}
          onClose={() => setShowDiscount(false)}
          subtotal={subtotal}
          requiresOverride={requiresDiscountOverride}
          initialType="fixed"
          initialValue={displayDiscount}
          onApply={(type, value) => {
            void handleApplyDiscount(type, value);
          }}
        />
      )}
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
      className={`min-h-[44px] h-11 px-5 rounded-xl text-[11px] font-semibold uppercase tracking-[0.14em] flex items-center gap-2 active:scale-95 transition-all ${
        active
          ? "bg-[var(--brand)] text-[var(--brand-fg)] shadow-[0_5px_20px_var(--brand-glow)]"
          : "bg-transparent text-white/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CashKey({
  children,
  onClick,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="min-h-[56px] h-14 rounded-2xl bg-white/5 border border-white/10 text-white text-2xl font-black tabular-nums flex items-center justify-center active:scale-95 active:bg-white/10 transition-transform"
    >
      {children}
    </button>
  );
}

function MethodGrid({
  method,
  onChange,
  allowEmployee = false,
  allowMixed = false,
}: {
  method: string;
  onChange: (m: string) => void;
  allowEmployee?: boolean;
  allowMixed?: boolean;
}) {
  const list = [
    ...METHODS,
    ...(allowMixed ? [MIXED_METHOD] : []),
    ...(allowEmployee ? [EMPLOYEE_METHOD] : []),
  ];
  // 4 base + opcionales (mixto/empleado): rejilla flexible para no apretar.
  const cols = list.length >= 6 ? "grid-cols-3 sm:grid-cols-6"
    : list.length === 5 ? "grid-cols-3 sm:grid-cols-5"
    : "grid-cols-4";
  return (
    <div className={`grid gap-3 ${cols}`}>
      {list.map((m) => {
        const Icon = m.icon;
        const isSelected = method === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`min-h-[88px] h-24 rounded-3xl flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform border-2 ${
              isSelected
                ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)] shadow-[0_5px_20px_var(--brand-glow)]"
                : "bg-white/5 border-white/10 text-white/60"
            }`}
          >
            <Icon size={24} strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em]">
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EmployeeAccountPanel({
  employees,
  loading,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  discount,
  onDiscountChange,
  subtotal,
}: {
  employees: EmployeeLite[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  discount: string;
  onDiscountChange: (s: string) => void;
  subtotal: number;
}) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? employees.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.role || "").toLowerCase().includes(q),
      )
    : employees;
  const pct =
    discount.trim() === ""
      ? null
      : Math.min(Math.max(Number(discount) || 0, 0), 100);
  const discountAmount = pct != null ? subtotal * (pct / 100) : 0;
  const previewTotal = Math.max(0, subtotal - discountAmount);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center shrink-0">
          <UserRound size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-black text-white tracking-tight">
            A cuenta de empleado
          </h3>
          <p className="text-[11px] text-white/45 font-medium">
            Se descuenta de su raya. No entra a caja.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
        />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar empleado…"
          className="w-full min-h-[48px] pl-10 pr-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 outline-none focus:border-[var(--brand)]"
        />
      </div>

      {loading ? (
        <p className="text-xs font-medium text-white/40 py-3 animate-pulse text-center">
          Cargando empleados…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-xs font-medium text-white/40 py-3 text-center">
          Sin empleados
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto scrollbar-hide">
          {filtered.map((e) => {
            const active = selectedId === e.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onSelect(e.id)}
                className={`min-h-[56px] px-3 py-2 rounded-xl border text-left transition-all active:scale-95 ${
                  active
                    ? "bg-[var(--brand-soft)] border-[var(--brand)] text-white"
                    : "bg-white/[0.03] border-white/10 text-white/75"
                }`}
              >
                <span className="block text-sm font-semibold truncate">
                  {e.name}
                </span>
                {e.role && (
                  <span className="block text-[9px] font-bold uppercase tracking-widest text-white/40">
                    {e.role}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Percent size={15} className="text-[var(--brand)] shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
              Descuento empleado
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <input
              value={discount}
              onChange={(e) =>
                onDiscountChange(e.target.value.replace(/[^0-9.]/g, ""))
              }
              inputMode="decimal"
              placeholder="auto"
              className="w-20 text-right min-h-[44px] px-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm tabular-nums outline-none focus:border-[var(--brand)] placeholder:text-white/30"
            />
            <span className="text-white/40 text-sm font-bold">%</span>
          </div>
        </div>
        <p className="text-[10px] text-white/35 font-medium leading-relaxed">
          Vacío = usa el descuento configurado del empleado. El total final lo
          calcula el servidor.
        </p>
        {pct != null && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/45">
              Total aprox.
            </span>
            <span className="tabular-nums text-xl font-black text-[var(--brand)]">
              ${previewTotal.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function MixedPanel({
  total,
  amounts,
  onChange,
  sum,
  remaining,
}: {
  total: number;
  amounts: Record<string, string>;
  onChange: (methodId: string, value: string) => void;
  sum: number;
  remaining: number;
}) {
  const ok = Math.abs(remaining) < 0.01 && sum > 0;
  const over = remaining < -0.005;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center shrink-0">
          <Layers size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-black text-white tracking-tight">
            Cobro mixto
          </h3>
          <p className="text-[11px] text-white/45 font-medium">
            Reparte el total entre métodos (efectivo + tarjeta…).
          </p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="text-[9px] font-semibold tracking-[0.2em] text-white/40 uppercase">
            A cobrar
          </div>
          <div className="tabular-nums text-xl font-black text-white leading-none">
            ${total.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {MIXED_TENDER_METHODS.map((m) => {
          const Icon = m.icon;
          const raw = amounts[m.id] ?? "";
          // "Resto" rellena este método con lo que falta para cuadrar.
          const fillRest = () => {
            const next = (Number(raw) || 0) + remaining;
            onChange(m.id, next > 0 ? (Math.round(next * 100) / 100).toString() : "");
          };
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-3"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/70 flex items-center justify-center shrink-0">
                <Icon size={18} />
              </div>
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70 w-20 shrink-0">
                {m.label}
              </span>
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <span className="text-white/40 text-lg font-bold">$</span>
                <input
                  value={raw}
                  onChange={(e) => onChange(m.id, e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full min-h-[48px] px-2 rounded-xl bg-white/5 border border-white/10 text-white text-xl font-black tabular-nums outline-none focus:border-[var(--brand)] placeholder:text-white/25"
                />
              </div>
              <button
                type="button"
                onClick={fillRest}
                disabled={Math.abs(remaining) < 0.01}
                className="min-h-[40px] px-3 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)]/40 text-[var(--brand)] text-[10px] font-semibold uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-30 shrink-0"
              >
                Resto
              </button>
            </div>
          );
        })}
      </div>

      {/* Estado del cuadre */}
      <div
        className={`flex items-center justify-between p-4 rounded-2xl border ${
          ok
            ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
            : over
              ? "bg-[var(--warning)]/10 border-[var(--warning)]/40 text-[var(--warning)]"
              : "bg-white/5 border-white/10 text-white/70"
        }`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em]">
          {ok ? "Cuadra ✓" : over ? "Sobra" : "Falta"}
        </span>
        <span className="tabular-nums text-2xl font-black">
          {ok ? `$${sum.toFixed(2)}` : `$${Math.abs(remaining).toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}

function TotalView({
  method,
  onMethodChange,
  cashReceived,
  onCashChange,
  cashEntry,
  onCashEntryChange,
  cashSuggestions,
  total,
  change,
  tipSuggestions,
  tipPercent,
  tipAmount,
  onTipChange,
  baseTotal,
  employeeAccountEnabled,
  employees,
  employeesLoading,
  accountEmployeeId,
  onSelectEmployee,
  accountSearch,
  onAccountSearchChange,
  accountDiscount,
  onAccountDiscountChange,
  subtotal,
  allowMixed,
  mixedAmounts,
  onMixedAmountChange,
  mixedSum,
  mixedRemaining,
}: {
  method: string;
  onMethodChange: (m: string) => void;
  cashReceived: number;
  onCashChange: (n: number) => void;
  cashEntry: string;
  onCashEntryChange: (s: string) => void;
  cashSuggestions: number[];
  total: number;
  change: number;
  tipSuggestions: number[];
  tipPercent: number;
  tipAmount: number;
  onTipChange: (pct: number) => void;
  baseTotal: number;
  employeeAccountEnabled: boolean;
  employees: EmployeeLite[];
  employeesLoading: boolean;
  accountEmployeeId: string | null;
  onSelectEmployee: (id: string) => void;
  accountSearch: string;
  onAccountSearchChange: (s: string) => void;
  accountDiscount: string;
  onAccountDiscountChange: (s: string) => void;
  subtotal: number;
  allowMixed: boolean;
  mixedAmounts: Record<string, string>;
  onMixedAmountChange: (methodId: string, value: string) => void;
  mixedSum: number;
  mixedRemaining: number;
}) {
  // Tecleo manual del efectivo recibido. El buffer cashEntry vive en el
  // padre (se resetea con cashReceived). Tipear reemplaza el monto auto.
  const pushCash = (next: string) => {
    onCashEntryChange(next);
    onCashChange(next === "" ? total : Number(next) || 0);
  };
  const pressDigit = (d: string) => {
    const base = cashEntry === "" ? "" : cashEntry;
    const next = base + d;
    // Cap defensivo: 7 enteros + 2 decimales.
    if (next.replace(".", "").length > 9) return;
    pushCash(next);
  };
  const pressDot = () => {
    if (cashEntry.includes(".")) return;
    pushCash(cashEntry === "" ? "0." : cashEntry + ".");
  };
  const pressBackspace = () => pushCash(cashEntry.slice(0, -1));
  const clearCash = () => pushCash("");
  return (
    <div className="space-y-7">
      <TipPicker
        suggestions={tipSuggestions}
        selected={tipPercent}
        amount={tipAmount}
        baseTotal={baseTotal}
        onChange={onTipChange}
      />

      <MethodGrid method={method} onChange={onMethodChange} allowEmployee={employeeAccountEnabled} allowMixed={allowMixed} />

      <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
        {method === "MIXED" && (
          <MixedPanel
            total={total}
            amounts={mixedAmounts}
            onChange={onMixedAmountChange}
            sum={mixedSum}
            remaining={mixedRemaining}
          />
        )}

        {method === "EMPLOYEE_ACCOUNT" && (
          <EmployeeAccountPanel
            employees={employees}
            loading={employeesLoading}
            selectedId={accountEmployeeId}
            onSelect={onSelectEmployee}
            search={accountSearch}
            onSearchChange={onAccountSearchChange}
            discount={accountDiscount}
            onDiscountChange={onAccountDiscountChange}
            subtotal={subtotal}
          />
        )}

        {method === "CASH" && (
          <div className="space-y-6">
            <div className="flex justify-between items-end gap-4">
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                  Monto recibido
                </span>
                <div className="text-5xl font-black tabular-nums text-white leading-none truncate">
                  ${cashEntry !== "" ? cashEntry : cashReceived.toFixed(2)}
                </div>
              </div>
              <div className="space-y-1 text-right shrink-0">
                <span className="text-[10px] font-semibold tracking-[0.25em] text-[var(--brand)] uppercase">
                  Cambio
                </span>
                <div className="text-3xl font-black tabular-nums text-[var(--brand)] leading-none">
                  ${change.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Denominaciones sugeridas (exacto + redondeos) */}
            <div className="grid grid-cols-4 gap-2">
              {cashSuggestions.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    onCashEntryChange(String(val));
                    onCashChange(val);
                  }}
                  className={`min-h-[56px] h-14 rounded-2xl border tabular-nums font-black active:scale-95 transition-transform ${
                    cashReceived === val
                      ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)] shadow-[0_5px_20px_var(--brand-glow)]"
                      : "bg-white/5 border-white/10 text-white"
                  }`}
                >
                  ${val}
                </button>
              ))}
            </div>

            {/* Numpad — teclear el monto exacto recibido. Resuelve el caso
                en que el cliente paga un monto fuera de las sugerencias. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                  O teclea el monto
                </span>
                <button
                  type="button"
                  onClick={clearCash}
                  className="text-[10px] font-semibold uppercase tracking-widest text-white/40 hover:text-white/70 active:scale-95 transition px-2 py-1"
                >
                  Limpiar
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <CashKey key={d} onClick={() => pressDigit(d)}>
                    {d}
                  </CashKey>
                ))}
                <CashKey onClick={pressDot}>.</CashKey>
                <CashKey onClick={() => pressDigit("0")}>0</CashKey>
                <CashKey onClick={pressBackspace} aria-label="Borrar">
                  <Delete size={22} strokeWidth={2.2} />
                </CashKey>
              </div>
            </div>
          </div>
        )}

        {method === "CARD" && (
          <div className="flex flex-col items-center justify-center gap-6 py-10 text-center">
            <div className="w-20 h-20 rounded-3xl bg-[var(--brand-soft)] border border-[var(--brand)] flex items-center justify-center text-[var(--brand)] animate-pulse">
              <CreditCard size={42} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white tracking-tight">
                Esperando terminal...
              </h3>
              <p className="text-[10px] text-white/50 font-bold uppercase tracking-[0.14em]">
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
            <div className="w-16 h-16 rounded-full bg-[var(--brand-soft)] flex items-center justify-center text-[var(--brand)]">
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
        <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
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
          className={`min-h-[44px] h-11 rounded-xl text-[11px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all ${
            mode === "EQUAL"
              ? "bg-[var(--brand)] text-[var(--brand-fg)] shadow-[0_5px_20px_var(--brand-glow)]"
              : "bg-transparent text-white/60"
          }`}
        >
          <Users size={14} />
          Partes iguales
        </button>
        <button
          type="button"
          onClick={() => onModeChange("BY_SEAT")}
          className={`min-h-[44px] h-11 rounded-xl text-[11px] font-semibold uppercase tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all ${
            mode === "BY_SEAT"
              ? "bg-[var(--brand)] text-[var(--brand-fg)] shadow-[0_5px_20px_var(--brand-glow)]"
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
        <p className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase mb-3">
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
        <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
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
            className="w-16 h-16 min-h-[64px] rounded-2xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
          >
            <Plus size={22} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between p-5 rounded-2xl bg-[var(--brand-soft)] border border-[var(--brand)]">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.25em] text-[var(--brand)] uppercase">
            Cada parte paga
          </div>
          <div className="text-[10px] font-bold text-white/40 mt-1 tabular-nums">
            ${total.toFixed(2)} ÷ {parts}
          </div>
        </div>
        <div className="tabular-nums text-4xl font-black text-[var(--brand)] tracking-tight">
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
        <h4 className="text-[13px] font-semibold text-white tracking-tight uppercase">
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
              <div className="w-10 h-10 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center font-semibold tabular-nums text-[15px]">
                {seat.seatNumber}
              </div>
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white">
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
                  <span className="text-[var(--brand)] mr-1.5 tabular-nums">
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
        <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
          Suma de asientos
        </span>
        <span className="tabular-nums text-[15px] font-semibold text-white">
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
        <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
          Propina (opcional)
        </span>
        {selected > 0 && (
          <span className="text-[11px] font-semibold text-[var(--brand)] tabular-nums">
            +${amount.toFixed(2)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`min-h-[56px] h-14 rounded-2xl border font-semibold tabular-nums text-[11px] uppercase tracking-widest active:scale-95 transition-transform ${
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
                  ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)] shadow-[0_5px_20px_var(--brand-glow)]"
                  : "bg-white/5 border-white/10 text-white"
              }`}
            >
              <span className="font-semibold text-[14px]">{pct}%</span>
              <span
                className={`text-[10px] tabular-nums ${
                  active ? "text-[var(--brand-fg)]" : "text-white/40"
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
