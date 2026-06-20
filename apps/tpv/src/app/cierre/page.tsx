'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, AlarmClock, ShieldAlert, Lock,
  CreditCard, Wifi, Wallet, Plus, Bike, Receipt, ShoppingBag,
  Printer, Eye, Check, X,
} from 'lucide-react';
import api from '@/lib/api';
import { shiftActionQueued } from '@/lib/offline';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuthStore } from '@/store/authStore';
import PurchasesExpensesModal from '@/components/pos/PurchasesExpensesModal';
import { usePrinters, useReceiptIdentity, useFullTicketConfig } from '@/hooks/usePrinters';
import { printShiftCloseTicket, type ShiftCloseTicketInput } from '@/lib/printer-tcp';

interface ShiftExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  createdAt: string;
}

interface ShiftCashIn {
  id: string;
  description: string;
  amount: number;
  category: string;
  createdAt: string;
}

interface Shift {
  id: string;
  openedAt: string;
  closedAt?: string | null;
  employeeName?: string | null;
  openingFloat: number;
  blindClose: boolean;
  closingFloat?: number | null;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalCourtesy?: number;
  totalSales: number;
  totalExpenses: number;
  totalCashIn?: number;
  ordersCount?: number;
  expectedCash: number | null;
  notes?: string | null;
  expenses?: ShiftExpense[];
  cashIns?: ShiftCashIn[];
  // Cuántos meseros/staff quedaron cerrados (clock-out) junto con la caja.
  staffClockedOut?: number;
  // Cuántos repartidores recibieron su corte automático al cerrar la caja.
  driversCut?: number;
  // Turno reconstruido localmente porque no había red para leer /current
  // (totales desconocidos). Permite cerrar offline; se reconcilia al sincronizar.
  _offline?: boolean;
}

// Turno mínimo local para permitir el cierre sin red. Los totales reales los
// computa el servidor al sincronizar el cierre (lee las órdenes de la BD).
function buildOfflineShift(): Shift {
  return {
    id: '', openedAt: new Date().toISOString(), openingFloat: 0, blindClose: false,
    totalCash: 0, totalCard: 0, totalTransfer: 0, totalCourtesy: 0, totalSales: 0,
    totalExpenses: 0, totalCashIn: 0, ordersCount: 0, expectedCash: null,
    expenses: [], cashIns: [], _offline: true,
  };
}

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

// Monto con signo negativo SOLO si hay algo que restar (evita "−$0.00").
const fmtNeg = (n: number) => (Number(n) > 0 ? `−${fmtMoney(n)}` : fmtMoney(n));

function elapsed(opened: string) {
  const ms = Date.now() - new Date(opened).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// Un gasto del repartidor se reconoce porque el backend lo etiqueta con
// category REPARTIDOR o el concepto empieza con "Repartidor".
const isDriverExpense = (e: ShiftExpense) =>
  e.category === 'REPARTIDOR' || /^repartidor/i.test(e.description || '');

export default function CierreTurno() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const employee = useAuthStore((s) => s.employee);
  const { printers } = usePrinters();
  const { businessName } = useReceiptIdentity();
  const { config: ticketConfig } = useFullTicketConfig();
  const [shift, setShift] = useState<Shift | null>(null);
  const [countedTotal, setCountedTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showExpenses, setShowExpenses] = useState(false);
  const [showCashIn, setShowCashIn] = useState(false);

  // Post-cierre: el turno ya cerrado (respuesta del backend) + estado de impresión.
  const [closedShift, setClosedShift] = useState<Shift | null>(null);
  const [printMsg, setPrintMsg] = useState('');
  // Revelado del arqueo en corte ciego (tras validar PIN de admin).
  const [revealed, setRevealed] = useState<{ expectedCash: number; variance: number } | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  // Arma el payload del ticket de cierre a partir del turno cerrado.
  const buildTicketInput = (s: Shift, reveal: boolean, isReprint = false): ShiftCloseTicketInput => ({
    shiftId: s.id,
    businessName: businessName || ticketConfig?.businessName || null,
    openedAt: s.openedAt,
    closedAt: s.closedAt ?? new Date().toISOString(),
    cashierName: s.employeeName ?? null,
    closedByName: employee?.name ?? null,
    openingFloat: Number(s.openingFloat || 0),
    totalCash: Number(s.totalCash || 0),
    totalCard: Number(s.totalCard || 0),
    totalTransfer: Number(s.totalTransfer || 0),
    totalCourtesy: Number(s.totalCourtesy || 0),
    totalExpenses: Number(s.totalExpenses || 0),
    totalCashIn: Number(s.totalCashIn || 0),
    totalSales: Number(s.totalSales || 0),
    ordersCount: Number(s.ordersCount || 0),
    closingFloat: Number(s.closingFloat ?? 0),
    // En ciego, expectedCash llega null; al revelar usamos el valor del endpoint.
    expectedCash: reveal ? (revealed?.expectedCash ?? s.expectedCash) : s.expectedCash,
    expenses: (s.expenses ?? []).map((e) => ({
      description: e.description, amount: Number(e.amount || 0), category: e.category,
    })),
    cashIns: (s.cashIns ?? []).map((c) => ({
      description: c.description, amount: Number(c.amount || 0), category: c.category,
    })),
    notes: s.notes ?? null,
    blindClose: s.blindClose,
    reveal,
    isReprint,
    fontFamily: ticketConfig?.fontFamily,
    fontSize: ticketConfig?.fontSize,
    lineSpacing: ticketConfig?.lineSpacing,
    lineWeight: ticketConfig?.lineWeight,
    paperWidth: ticketConfig?.paperWidth,
  });

  const printTicket = async (s: Shift, reveal: boolean, isReprint = false) => {
    setPrintMsg('Imprimiendo corte…');
    try {
      const res = await printShiftCloseTicket(printers, buildTicketInput(s, reveal, isReprint));
      if (res.ok > 0) {
        setPrintMsg('Ticket de corte impreso.');
      } else {
        const why = res.failed[0]?.error || 'sin impresora de caja';
        setPrintMsg(`No se pudo imprimir el corte (${why}).`);
      }
    } catch (err: any) {
      setPrintMsg(`No se pudo imprimir el corte (${err?.message || 'error'}).`);
    }
  };

  // Si /current falla por red pero el cache dice que hay turno abierto,
  // reconstruimos un turno local mínimo para poder cerrar offline.
  const offlineShiftFallback = (): boolean => {
    const open = typeof window !== 'undefined' && localStorage.getItem('tpv-shift-open') === 'true';
    if (open) { setShift(buildOfflineShift()); return true; }
    return false;
  };

  const loadShift = async () => {
    try {
      const { data } = await api.get('/api/shifts/current');
      if (!data || !data.id) {
        setError('No hay un turno abierto en esta caja');
        return;
      }
      setShift(data);
    } catch {
      // Offline: permitir el cierre con un turno local; si ni siquiera hay
      // turno abierto en cache, sí mostramos el error.
      if (!offlineShiftFallback()) setError('No pudimos cargar el turno');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/shifts/current');
        if (cancelled) return;
        if (!data || !data.id) {
          setError('No hay un turno abierto en esta caja');
          return;
        }
        setShift(data);
      } catch {
        if (!cancelled && !offlineShiftFallback()) setError('No pudimos cargar el turno');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Carga del borrador (solo total + notas; ya no hay denominaciones).
  useEffect(() => {
    if (!shift) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const raw = localStorage.getItem(`cierre-draft-${shift.id}`);
      if (raw) {
        try {
          const d = JSON.parse(raw);
          if (typeof d.countedTotal === 'string') setCountedTotal(d.countedTotal);
          if (typeof d.notes === 'string') setNotes(d.notes);
        } catch {}
      }
    });
    return () => { cancelled = true; };
  }, [shift]);

  const expenses = shift?.expenses ?? [];
  const totalExpenses = useMemo(
    () => (shift?.totalExpenses ?? expenses.reduce((s, e) => s + Number(e.amount || 0), 0)),
    [shift?.totalExpenses, expenses],
  );

  const cashIns = shift?.cashIns ?? [];
  const totalCashIn = useMemo(
    () => cashIns.reduce((s, c) => s + Number(c.amount || 0), 0),
    [cashIns],
  );

  // Registra un ingreso de efectivo (vía cola: online entra directo, offline se
  // encola contra el turno abierto y se reconcilia al sincronizar el cierre).
  const addCashIn = async (description: string, amount: number, category: string) => {
    if (!shift) return;
    const res = await shiftActionQueued(
      'shift-cashin', 'cash-ins', { description, amount, category }, shift.id || undefined,
    );
    if (!res.ok) { alert(res.error || 'No se pudo registrar el ingreso'); return; }
    // Optimista: lo agregamos al turno local (offline no podemos releer /current).
    const entry: ShiftCashIn = res.data ?? {
      id: '', description, amount, category, createdAt: new Date().toISOString(),
    };
    setShift((s) => (s ? { ...s, cashIns: [entry, ...(s.cashIns ?? [])] } : s));
  };

  const counted = Number(countedTotal);
  const countedValid = countedTotal.trim() !== '' && Number.isFinite(counted) && counted >= 0;

  const onSubmit = async () => {
    if (!shift || !countedValid) return;
    setSubmitting(true);
    setError('');
    try {
      // Vía cola con fallback de despliegue: online cierra y devuelve el corte;
      // offline lo encola contra el turno abierto (gate de orden garantiza que
      // el corte server-side corra DESPUÉS de las órdenes encoladas).
      const res = await shiftActionQueued<Shift>(
        'shift-close', 'close',
        { closingFloat: counted, notes: notes.trim() || null },
        shift.id || undefined,
      );

      if (!res.ok) {
        setError(res.error || 'No pudimos cerrar el turno');
        setSubmitting(false);
        return;
      }

      if (shift.id) localStorage.removeItem(`cierre-draft-${shift.id}`);
      // Ya no hay turno abierto en la caja: dejamos el cache en false para que,
      // al volver al /hub (botón "Listo"), redirija a /pos/shift/open.
      localStorage.setItem('tpv-shift-open', 'false');

      if (res.data) {
        // Online: usamos el corte real del backend.
        const closedWithCount: Shift = { ...res.data, closingFloat: res.data.closingFloat ?? counted };
        setClosedShift(closedWithCount);
        // En corte ciego sale sin desfase (reveal=false); el supervisor lo revela con su PIN.
        void printTicket(closedWithCount, !closedWithCount.blindClose);
      } else {
        // Offline (encolado): no hay corte del servidor. Imprimimos un ticket
        // PENDIENTE con lo contado; el corte definitivo y el reveal quedan para
        // después de reconectar (reimpresión).
        const pending: Shift = {
          ...shift,
          closingFloat: counted,
          closedAt: new Date().toISOString(),
          notes: [notes.trim(), 'CORTE PENDIENTE DE SINCRONIZAR'].filter(Boolean).join(' · '),
        };
        setClosedShift(pending);
        void printTicket(pending, false);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No pudimos cerrar el turno');
      setSubmitting(false);
    }
  };

  // Revelar el arqueo de un corte ciego con PIN de admin, y reimprimir completo.
  const onRevealPin = async (pin: string) => {
    if (!closedShift) return;
    // El reveal valida el PIN y lee el snapshot en el servidor: requiere red.
    if (!isOnline) throw new Error('Necesitas conexión para revelar el arqueo');
    try {
      const { data } = await api.post(`/api/shifts/${closedShift.id}/reveal`, { pin });
      const rev = { expectedCash: Number(data.expectedCash || 0), variance: Number(data.variance || 0) };
      setRevealed(rev);
      setShowPinModal(false);
      // Reimprime el corte ya con el desfase visible.
      const merged: Shift = { ...closedShift, expectedCash: rev.expectedCash };
      await printTicket(merged, true, true);
    } catch (err: any) {
      throw new Error(err?.response?.data?.error || 'PIN incorrecto');
    }
  };

  const onSaveDraft = () => {
    if (shift) {
      localStorage.setItem(`cierre-draft-${shift.id}`, JSON.stringify({ countedTotal, notes }));
    }
    router.replace('/hub');
  };

  const userInitial = (employee?.name || 'U').charAt(0).toUpperCase();
  const roleLabel =
    employee?.role === 'CASHIER' ? 'Cajero' :
    employee?.role === 'MANAGER' ? 'Gerente' :
    employee?.role === 'ADMIN' ? 'Admin' : (employee?.role || 'Empleado');

  // ── PANTALLA POST-CIERRE ────────────────────────────────────────────────
  // Tras cerrar: resumen + ticket impreso. En corte ciego el desfase queda
  // oculto hasta que un supervisor lo revele con su PIN.
  if (closedShift) {
    const cs = closedShift;
    const showArqueo = !cs.blindClose || !!revealed;
    const expected = revealed?.expectedCash ?? cs.expectedCash ?? null;
    const variance =
      revealed?.variance ??
      (expected != null ? Number(cs.closingFloat || 0) - expected : null);

    return (
      <div
        className="relative h-[100dvh] flex flex-col items-center justify-center bg-[var(--bg)] text-white overflow-auto p-6"
        style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
      >
        <div className="w-full max-w-md flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-emerald-400/15 border border-emerald-400/40">
              <Check size={30} className="text-emerald-400" strokeWidth={3} />
            </div>
            <h1 className="text-2xl font-black tracking-tight">Turno cerrado</h1>
            <p className="text-sm text-white/55">{printMsg || 'Generando ticket de corte…'}</p>
            {typeof cs.staffClockedOut === 'number' && cs.staffClockedOut > 0 && (
              <p className="text-xs font-bold text-emerald-300/80">
                {cs.staffClockedOut} {cs.staffClockedOut === 1 ? 'mesero cerrado' : 'meseros cerrados'} con la caja
              </p>
            )}
            {typeof cs.driversCut === 'number' && cs.driversCut > 0 && (
              <p className="text-xs font-bold text-emerald-300/80">
                {cs.driversCut} {cs.driversCut === 1 ? 'repartidor cortado' : 'repartidores cortados'} con la caja
              </p>
            )}
          </div>

          <div className="rounded-3xl p-6 flex flex-col gap-3 bg-white/5 backdrop-blur-md border border-white/10">
            <Line label="Ventas totales" value={fmtMoney(cs.totalSales || 0)} strong />
            <Line label="Efectivo" value={fmtMoney(cs.totalCash || 0)} />
            <Line label="Tarjeta" value={fmtMoney(cs.totalCard || 0)} />
            <Line label="Transferencia" value={fmtMoney(cs.totalTransfer || 0)} />
            {Number(cs.totalCourtesy || 0) > 0 && (
              <Line label="Cortesía" value={fmtMoney(cs.totalCourtesy || 0)} />
            )}
            {Number(cs.totalCashIn || 0) > 0 && (
              <Line label="Ingresos de efectivo" value={`+${fmtMoney(cs.totalCashIn || 0)}`} />
            )}
            <Line label="Gastos" value={fmtNeg(cs.totalExpenses || 0)} />
            <div className="border-t border-white/10 my-1" />
            <Line label="Efectivo contado" value={fmtMoney(cs.closingFloat || 0)} strong />

            {showArqueo && expected != null ? (
              <>
                <Line label="Esperado en caja" value={fmtMoney(expected)} />
                <div
                  className="mt-1 rounded-2xl p-4 flex items-center justify-between"
                  style={{
                    background:
                      (variance ?? 0) === 0 ? 'rgba(136,214,108,0.12)'
                      : (variance ?? 0) > 0 ? 'rgba(136,214,108,0.12)'
                      : 'rgba(255,92,51,0.10)',
                    border:
                      (variance ?? 0) < 0 ? '1px solid rgba(255,92,51,0.35)'
                      : '1px solid rgba(136,214,108,0.35)',
                  }}
                >
                  <span className="text-xs font-semibold tracking-widest text-white/70">
                    {(variance ?? 0) === 0 ? 'CAJA CUADRADA' : (variance ?? 0) > 0 ? 'SOBRANTE' : 'FALTANTE'}
                  </span>
                  <span
                    className="text-xl font-black tabular-nums"
                    style={{ color: (variance ?? 0) < 0 ? '#FF5C33' : '#88D66C' }}
                  >
                    {fmtMoney(variance ?? 0)}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-1 rounded-2xl p-4 flex items-start gap-2.5 bg-[var(--brand-soft)] border border-[var(--brand)]">
                <ShieldAlert size={16} className="text-[var(--brand)] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium leading-relaxed text-[var(--text-primary)]">
                  Corte ciego: el desfase queda oculto. Un supervisor puede revelarlo con su PIN.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => printTicket(cs, showArqueo, true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 min-h-[52px] text-sm font-semibold text-white bg-white/8 border border-white/15 active:scale-95 transition-transform"
            >
              <Printer size={16} /> Reimprimir corte
            </button>

            {cs.blindClose && !revealed && (
              <button
                onClick={() => setShowPinModal(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 min-h-[52px] text-sm font-black text-[var(--brand-fg)] bg-[var(--brand)] active:scale-95 transition-transform"
              >
                <Eye size={16} /> Ver desfase (PIN admin)
              </button>
            )}

            <button
              onClick={() => router.replace('/hub')}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 min-h-[52px] text-sm font-semibold text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 active:scale-95 transition-transform"
            >
              Listo
            </button>
          </div>
        </div>

        {showPinModal && (
          <PinModal onClose={() => setShowPinModal(false)} onSubmit={onRevealPin} />
        )}
      </div>
    );
  }

  return (
    <div
      className="relative h-[100dvh] flex flex-col bg-[var(--bg)] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -left-60 w-[700px] h-[700px] rounded-full blur-[120px] opacity-50"
        style={{ background: 'radial-gradient(circle, var(--brand-soft) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[400px] -right-40 w-[700px] h-[700px] rounded-full blur-[120px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(136,214,108,0.10) 0%, transparent 70%)' }}
      />

      {/* HEADER */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-8 py-4 bg-white/5 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => router.back()}
            className="w-11 h-11 min-h-[44px] rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
            aria-label="Atrás"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className="text-white/55">Caja Principal</span>
              <ChevronRight size={11} className="text-white/30" />
              <span className="font-bold text-white">Cierre de Turno</span>
            </div>
            <h1 className="text-lg font-black text-white tracking-tight">
              Cierre de Turno · Corte Ciego
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-[var(--brand-fg)] bg-[var(--brand)]">
              {userInitial}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold leading-none text-white">{employee?.name || 'Empleado'}</span>
              <span className="text-[9px] mt-0.5 text-white/55">{roleLabel} · Caja Principal</span>
            </div>
          </div>
          {shift && (
            <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
              <AlarmClock size={14} className="text-[var(--brand)]" />
              <span className="text-xs font-bold text-white">
                {new Date(shift.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} → {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {elapsed(shift.openedAt)}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* CONTENT */}
      <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 p-6 md:p-8 overflow-auto">
        {/* LEFT */}
        <div className="flex flex-col gap-5">
          {/* TOTAL EN CAJA */}
          <div className="rounded-3xl p-6 md:p-8 flex flex-col gap-5 bg-white/5 backdrop-blur-md border border-white/10">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-white">Total en caja</h2>
                <p className="text-xs font-medium text-white/55">
                  Cuenta todo el efectivo de la caja y captura el total que se queda.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--brand-soft)] border border-[var(--brand)]">
                <ShieldAlert size={11} className="text-[var(--brand)]" />
                <span className="text-[10px] font-semibold tracking-widest text-[var(--brand)]">CORTE CIEGO</span>
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-emerald-400">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={countedTotal}
                onChange={(e) => setCountedTotal(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full h-24 rounded-3xl bg-[var(--bg)] border border-white/10 pl-14 pr-6 text-5xl font-black text-emerald-400 outline-none tabular-nums focus:border-emerald-400/40 transition-colors"
                style={{ fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* GASTOS Y COMPRAS DEL TURNO */}
          <div className="rounded-3xl p-6 flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Receipt size={15} className="text-[var(--brand)]" />
                <span className="text-[11px] font-semibold tracking-[0.14em] text-white/55">GASTOS Y COMPRAS DEL TURNO</span>
              </div>
              <button
                onClick={() => setShowExpenses(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] text-[11px] font-semibold active:scale-95 transition-transform"
              >
                <Plus size={14} strokeWidth={3} /> Registrar
              </button>
            </div>

            {expenses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                <ShoppingBag size={24} className="mx-auto text-white/25" />
                <p className="mt-2 text-[12px] text-white/40">
                  Sin gastos ni compras en este turno.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {expenses.map((e) => {
                  const driver = isDriverExpense(e);
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded-2xl p-3 bg-white/5 border border-white/10"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${driver ? 'bg-sky-400/10 border border-sky-400/20' : 'bg-[var(--brand-soft)] border border-[var(--brand)]'}`}>
                        {driver ? <Bike size={16} className="text-sky-300" /> : <Wallet size={16} className="text-[var(--brand)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{e.description}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                          {(e.category || 'OTRO').replace(/_/g, ' ')}
                          {driver && <span className="text-sky-300"> · repartidor</span>}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-[#ff8a5c] shrink-0">
                        {fmtNeg(e.amount)}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10">
                  <span className="text-[11px] font-semibold tracking-[0.15em] text-white/40">TOTAL GASTOS</span>
                  <span className="text-base font-semibold tabular-nums text-[#ff8a5c]">{fmtNeg(totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>

          {/* INGRESOS DE EFECTIVO DEL TURNO (cambio/feria a la gaveta) */}
          <div className="rounded-3xl p-6 flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wallet size={15} className="text-emerald-400" />
                <span className="text-[11px] font-semibold tracking-[0.14em] text-white/55">INGRESOS DE EFECTIVO</span>
              </div>
              <button
                onClick={() => setShowCashIn(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-400/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-semibold active:scale-95 transition-transform"
              >
                <Plus size={14} strokeWidth={3} /> Ingresar
              </button>
            </div>

            {cashIns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                <Wallet size={24} className="mx-auto text-white/25" />
                <p className="mt-2 text-[12px] text-white/40">
                  Sin ingresos de efectivo en este turno.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {cashIns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-2xl p-3 bg-white/5 border border-white/10"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-400/10 border border-emerald-400/20">
                      <Wallet size={16} className="text-emerald-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{c.description}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                        {(c.category || 'CAMBIO').replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-emerald-300 shrink-0">
                      +{fmtMoney(c.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10">
                  <span className="text-[11px] font-semibold tracking-[0.15em] text-white/40">TOTAL INGRESOS</span>
                  <span className="text-base font-semibold tabular-nums text-emerald-300">+{fmtMoney(totalCashIn)}</span>
                </div>
              </div>
            )}
          </div>

          {/* NOTAS */}
          <div className="rounded-3xl p-5 flex flex-col gap-2 bg-white/5 backdrop-blur-md border border-white/10">
            <label className="text-[11px] font-semibold tracking-[0.14em] text-white/55">
              NOTAS / OBSERVACIONES
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Faltó cambio en moneda de $2 al iniciar el turno…"
              rows={3}
              className="rounded-2xl px-4 py-3 text-sm font-medium resize-none outline-none bg-[var(--bg)] text-white border border-white/10 focus:border-[var(--brand)] transition-colors"
              style={{ fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {/* RIGHT: confirmación */}
        <aside className="flex flex-col rounded-3xl overflow-hidden bg-white/5 backdrop-blur-md border border-white/10 sticky top-4 self-start">
          <div className="flex flex-col gap-1.5 px-6 py-6 border-b border-white/10">
            <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40">RESUMEN DEL CORTE</span>
            <span className="text-sm font-medium text-white/55">Total que se queda en caja</span>
            <span className="text-4xl font-black text-emerald-400 tracking-tight tabular-nums">
              {fmtMoney(counted || 0)}
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-4 px-6 py-5 overflow-auto">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-white/40">
              INFORMATIVO · NO SE SUMA AL EFECTIVO
            </span>
            <SummaryCard
              icon={<CreditCard size={14} className="text-[var(--brand)]" />}
              label="Tarjeta"
              value={fmtMoney(shift?.totalCard ?? 0)}
            />
            <SummaryCard
              icon={<Wifi size={14} className="text-sky-400" />}
              label="Transferencia"
              value={fmtMoney(shift?.totalTransfer ?? 0)}
            />
            <SummaryCard
              icon={<Receipt size={14} className="text-[#ff8a5c]" />}
              label="Gastos del turno"
              value={fmtNeg(totalExpenses)}
            />
            {totalCashIn > 0 && (
              <SummaryCard
                icon={<Wallet size={14} className="text-emerald-400" />}
                label="Ingresos de efectivo"
                value={`+${fmtMoney(totalCashIn)}`}
              />
            )}

            <div className="rounded-2xl p-4 flex items-start gap-2.5 bg-[var(--brand-soft)] border border-[var(--brand)]">
              <ShieldAlert size={16} className="text-[var(--brand)] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] font-medium leading-relaxed text-[var(--text-primary)]">
                Corte ciego: declaras el total sin ver el esperado. La conciliación la verá el supervisor.
              </p>
            </div>

            {error && (
              <div
                className="rounded-2xl p-3 text-[11px] font-semibold"
                style={{ background: 'rgba(255,92,51,0.08)', border: '1px solid rgba(255,92,51,0.25)', color: '#FF5C33' }}
              >
                {error}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5 px-5 py-5 border-t border-white/10">
            <button
              onClick={onSubmit}
              disabled={!shift || submitting || !countedValid}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl py-4 min-h-[56px] text-sm font-black tracking-tight text-[var(--brand-fg)] bg-[var(--brand)] active:scale-95 transition-transform disabled:opacity-40 shadow-[0_15px_40px_var(--brand-glow)]"
            >
              <Lock size={16} strokeWidth={3} />
              {submitting ? 'Cerrando…' : 'Confirmar y Cerrar Turno'}
            </button>
            <button
              onClick={onSaveDraft}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 min-h-[48px] text-xs font-bold text-white/55 active:scale-95 transition-transform"
            >
              Guardar borrador y salir
            </button>
          </div>
        </aside>
      </div>

      {/* Modal de gastos/compras — al cerrar, refrescamos el turno para que
          los nuevos movimientos aparezcan en el corte. */}
      <PurchasesExpensesModal
        isOpen={showExpenses}
        onClose={() => { setShowExpenses(false); loadShift(); }}
      />

      {showCashIn && (
        <CashInModal
          onClose={() => setShowCashIn(false)}
          onSubmit={addCashIn}
        />
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl flex items-center gap-3 p-3.5 bg-white/5 border border-white/10">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/5">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-white/40">{label.toUpperCase()}</p>
        <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${strong ? 'font-semibold text-white' : 'font-medium text-white/60'}`}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-base font-semibold text-white' : 'text-sm font-bold text-white/85'}`}>{value}</span>
    </div>
  );
}

// Modal de PIN para revelar el arqueo de un corte ciego (supervisor/admin).
function PinModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!pin.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onSubmit(pin.trim());
    } catch (e: any) {
      setErr(e?.message || 'PIN incorrecto');
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-4 bg-[var(--surface-1)] border border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">PIN de administrador</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-white/55">Ingresa el PIN de un supervisor para ver e imprimir el desfase.</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="••••"
          className="w-full h-14 rounded-2xl bg-[var(--bg)] border border-white/10 px-4 text-2xl font-black text-center tracking-[0.4em] text-white outline-none focus:border-[var(--brand)]"
        />
        {err && (
          <p className="text-[11px] font-semibold text-center" style={{ color: '#FF5C33' }}>{err}</p>
        )}
        <button
          onClick={submit}
          disabled={!pin.trim() || busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 min-h-[52px] text-sm font-black text-[var(--brand-fg)] bg-[var(--brand)] active:scale-95 transition-transform disabled:opacity-40"
        >
          <Eye size={16} /> {busy ? 'Validando…' : 'Revelar desfase'}
        </button>
      </div>
    </div>
  );
}

// Modal para registrar un ingreso de efectivo a la caja (cambio/feria que el
// cajero mete a la gaveta y que no proviene de una venta).
const CASH_IN_CATEGORIES = [
  { value: 'CHANGE', label: '🪙 Cambio / feria' },
  { value: 'DEPOSIT', label: '💵 Depósito a caja' },
  { value: 'OTHER', label: '📦 Otro' },
];

function CashInModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (description: string, amount: number, category: string) => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('CHANGE');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const amt = Number(amount);
    if (!description.trim()) { setErr('Ingresa una descripción'); return; }
    if (!Number.isFinite(amt) || amt <= 0) { setErr('Monto inválido'); return; }
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await onSubmit(description.trim(), amt, category);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'No se pudo registrar');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-4 bg-[var(--surface-1)] border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center">
              <Wallet size={16} className="text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold">Ingresar efectivo</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-white/55">Efectivo o cambio que metes a la gaveta. Suma al esperado del corte.</p>

        <input
          type="text"
          autoFocus
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (ej. Cambio para caja)"
          className="w-full h-12 rounded-2xl bg-[var(--bg)] border border-white/10 px-4 text-sm font-medium text-white outline-none focus:border-emerald-400/40"
        />

        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 font-semibold">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="0.00"
            className="w-full h-12 rounded-2xl bg-[var(--bg)] border border-white/10 pl-9 pr-4 text-lg font-black text-emerald-400 outline-none tabular-nums focus:border-emerald-400/40"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {CASH_IN_CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`h-12 rounded-2xl border text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  active ? 'bg-emerald-400/15 border-emerald-400/50 text-emerald-300' : 'bg-white/5 border-white/10 text-white/60'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {err && (
          <p className="text-[11px] font-semibold text-center" style={{ color: '#FF5C33' }}>{err}</p>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 min-h-[52px] text-sm font-black text-[var(--brand-fg)] bg-emerald-400 active:scale-95 transition-transform disabled:opacity-40"
        >
          <Plus size={16} strokeWidth={3} /> {busy ? 'Guardando…' : 'Registrar ingreso'}
        </button>
      </div>
    </div>
  );
}
