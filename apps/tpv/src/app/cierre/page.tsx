'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, AlarmClock, ShieldAlert, Lock,
  CreditCard, Wifi, Wallet, Plus, Bike, Receipt, ShoppingBag,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import PurchasesExpensesModal from '@/components/pos/PurchasesExpensesModal';

interface ShiftExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  createdAt: string;
}

interface Shift {
  id: string;
  openedAt: string;
  openingFloat: number;
  blindClose: boolean;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalSales: number;
  totalExpenses: number;
  expectedCash: number | null;
  expenses?: ShiftExpense[];
}

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

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
  const employee = useAuthStore((s) => s.employee);
  const [shift, setShift] = useState<Shift | null>(null);
  const [countedTotal, setCountedTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showExpenses, setShowExpenses] = useState(false);

  const loadShift = async () => {
    try {
      const { data } = await api.get('/api/shifts/current');
      if (!data || !data.id) {
        setError('No hay un turno abierto en esta caja');
        return;
      }
      setShift(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No pudimos cargar el turno');
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
      } catch (err: any) {
        if (!cancelled) setError(err?.response?.data?.error || 'No pudimos cargar el turno');
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

  const counted = Number(countedTotal);
  const countedValid = countedTotal.trim() !== '' && Number.isFinite(counted) && counted >= 0;

  const onSubmit = async () => {
    if (!shift || !countedValid) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/api/shifts/${shift.id}/close`, {
        closingFloat: counted,
        notes: notes.trim() || null,
      });
      localStorage.removeItem(`cierre-draft-${shift.id}`);
      router.replace('/hub');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No pudimos cerrar el turno');
      setSubmitting(false);
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

  return (
    <div
      className="relative h-[100dvh] flex flex-col bg-[#0a0a0c] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -left-60 w-[700px] h-[700px] rounded-full blur-[120px] opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(255,184,77,0.14) 0%, transparent 70%)' }}
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
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-[#0a0a0c] bg-[#ffb84d]">
              {userInitial}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold leading-none text-white">{employee?.name || 'Empleado'}</span>
              <span className="text-[9px] mt-0.5 text-white/55">{roleLabel} · Caja Principal</span>
            </div>
          </div>
          {shift && (
            <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
              <AlarmClock size={14} className="text-[#ffb84d]" />
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
                <h2 className="text-base font-black text-white">Total en caja</h2>
                <p className="text-xs font-medium text-white/55">
                  Cuenta todo el efectivo de la caja y captura el total que se queda.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ffb84d]/15 border border-[#ffb84d]/40">
                <ShieldAlert size={11} className="text-[#ffb84d]" />
                <span className="text-[10px] font-black tracking-widest text-[#ffb84d]">CORTE CIEGO</span>
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
                className="w-full h-24 rounded-3xl bg-[#0a0a0c]/60 border border-white/10 pl-14 pr-6 text-5xl font-black text-emerald-400 outline-none tabular-nums focus:border-emerald-400/40 transition-colors"
                style={{ fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* GASTOS Y COMPRAS DEL TURNO */}
          <div className="rounded-3xl p-6 flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Receipt size={15} className="text-[#ffb84d]" />
                <span className="text-[11px] font-black tracking-[0.2em] text-white/55">GASTOS Y COMPRAS DEL TURNO</span>
              </div>
              <button
                onClick={() => setShowExpenses(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ffb84d]/15 border border-[#ffb84d]/30 text-[#ffb84d] text-[11px] font-black active:scale-95 transition-transform"
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
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${driver ? 'bg-sky-400/10 border border-sky-400/20' : 'bg-[#ffb84d]/10 border border-[#ffb84d]/20'}`}>
                        {driver ? <Bike size={16} className="text-sky-300" /> : <Wallet size={16} className="text-[#ffb84d]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{e.description}</p>
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/35">
                          {(e.category || 'OTRO').replace(/_/g, ' ')}
                          {driver && <span className="text-sky-300"> · repartidor</span>}
                        </p>
                      </div>
                      <span className="text-sm font-black tabular-nums text-[#ff8a5c] shrink-0">
                        −{fmtMoney(e.amount)}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10">
                  <span className="text-[11px] font-black tracking-[0.15em] text-white/40">TOTAL GASTOS</span>
                  <span className="text-base font-black tabular-nums text-[#ff8a5c]">−{fmtMoney(totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>

          {/* NOTAS */}
          <div className="rounded-3xl p-5 flex flex-col gap-2 bg-white/5 backdrop-blur-md border border-white/10">
            <label className="text-[11px] font-black tracking-[0.2em] text-white/55">
              NOTAS / OBSERVACIONES
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Faltó cambio en moneda de $2 al iniciar el turno…"
              rows={3}
              className="rounded-2xl px-4 py-3 text-sm font-medium resize-none outline-none bg-[#0a0a0c]/60 text-white border border-white/10 focus:border-[#ffb84d]/40 transition-colors"
              style={{ fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {/* RIGHT: confirmación */}
        <aside className="flex flex-col rounded-3xl overflow-hidden bg-white/5 backdrop-blur-md border border-white/10 sticky top-4 self-start">
          <div className="flex flex-col gap-1.5 px-6 py-6 border-b border-white/10">
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40">RESUMEN DEL CORTE</span>
            <span className="text-sm font-medium text-white/55">Total que se queda en caja</span>
            <span className="text-4xl font-black text-emerald-400 tracking-tight tabular-nums">
              {fmtMoney(counted || 0)}
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-4 px-6 py-5 overflow-auto">
            <span className="text-[10px] font-black tracking-[0.2em] text-white/40">
              INFORMATIVO · NO SE SUMA AL EFECTIVO
            </span>
            <SummaryCard
              icon={<CreditCard size={14} className="text-[#ffb84d]" />}
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
              value={`−${fmtMoney(totalExpenses)}`}
            />

            <div className="rounded-2xl p-4 flex items-start gap-2.5 bg-[#ffb84d]/8 border border-[#ffb84d]/30">
              <ShieldAlert size={16} className="text-[#ffb84d] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] font-medium leading-relaxed text-amber-100">
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
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl py-4 min-h-[56px] text-sm font-black tracking-tight text-[#0a0a0c] bg-[#ffb84d] active:scale-95 transition-transform disabled:opacity-40 shadow-[0_15px_40px_rgba(255,184,77,0.25)]"
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
        <p className="text-[10px] font-black tracking-[0.18em] text-white/40">{label.toUpperCase()}</p>
        <p className="text-sm font-black text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}
