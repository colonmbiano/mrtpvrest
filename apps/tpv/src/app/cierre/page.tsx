'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, AlarmClock, Banknote, Coins,
  ShieldAlert, Lock, CreditCard, Wifi,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const BILLS = [1000, 500, 200, 100, 50, 20];
const COINS = [10, 5, 2, 1, 0.5];

interface Shift {
  id: string;
  openedAt: string;
  openingFloat: number;
  blindClose: boolean;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalSales: number;
  expectedCash: number | null;
}

const fmtMoney = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

function elapsed(opened: string) {
  const ms = Date.now() - new Date(opened).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function CierreTurno() {
  const router = useRouter();
  const employee = useAuthStore((s) => s.employee);
  const [shift, setShift] = useState<Shift | null>(null);
  const [billCount, setBillCount] = useState<Record<number, string>>({});
  const [coinCount, setCoinCount] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  const totalBills = useMemo(
    () => BILLS.reduce((s, d) => s + (Number(billCount[d]) || 0) * d, 0),
    [billCount]
  );
  const totalCoins = useMemo(
    () => COINS.reduce((s, d) => s + (Number(coinCount[d]) || 0) * d, 0),
    [coinCount]
  );
  const totalDeclared = totalBills + totalCoins;

  const onSubmit = async () => {
    if (!shift) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/api/shifts/${shift.id}/close`, {
        closingFloat: totalDeclared,
        notes: notes.trim() || null,
      });
      router.replace('/hub');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No pudimos cerrar el turno');
      setSubmitting(false);
    }
  };

  const onSaveDraft = () => {
    if (shift) {
      localStorage.setItem(`cierre-draft-${shift.id}`, JSON.stringify({ billCount, coinCount, notes }));
    }
    router.replace('/hub');
  };

  useEffect(() => {
    if (!shift) return;
    const raw = localStorage.getItem(`cierre-draft-${shift.id}`);
    if (raw) {
      try {
        const d = JSON.parse(raw);
        setBillCount(d.billCount || {});
        setCoinCount(d.coinCount || {});
        setNotes(d.notes || '');
      } catch {}
    }
  }, [shift]);

  const userInitial = (employee?.name || 'U').charAt(0).toUpperCase();
  const roleLabel =
    employee?.role === 'CASHIER' ? 'Cajero' :
    employee?.role === 'MANAGER' ? 'Gerente' :
    employee?.role === 'ADMIN' ? 'Admin' : (employee?.role || 'Empleado');

  return (
    <div
      className="relative min-h-screen flex flex-col bg-[#0a0a0c] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient Warm Tech glows */}
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
      <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 p-6 md:p-8 overflow-auto">
        {/* LEFT: form */}
        <div className="flex flex-col gap-5">
          <div className="rounded-3xl p-6 md:p-8 flex flex-col gap-5 bg-white/5 backdrop-blur-md border border-white/10">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col">
                <h2 className="text-base font-black text-white">Declaración de Efectivo</h2>
                <p className="text-xs font-medium text-white/55">
                  Cuenta el efectivo en tu caja y captura las cantidades por denominación.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ffb84d]/15 border border-[#ffb84d]/40">
                <ShieldAlert size={11} className="text-[#ffb84d]" />
                <span className="text-[10px] font-black tracking-widest text-[#ffb84d]">CORTE CIEGO</span>
              </div>
            </div>

            {/* BILLETES */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Banknote size={14} className="text-emerald-400" />
                <span className="text-[11px] font-black tracking-[0.2em] text-white/55">BILLETES</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {BILLS.map((d) => (
                  <DenomRow
                    key={d}
                    label={`$${d.toLocaleString()}`}
                    color="#88D66C"
                    value={billCount[d] || ''}
                    onChange={(v) => setBillCount({ ...billCount, [d]: v })}
                    subtotal={(Number(billCount[d]) || 0) * d}
                  />
                ))}
              </div>
            </section>

            {/* MONEDAS */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Coins size={14} className="text-[#ffb84d]" />
                <span className="text-[11px] font-black tracking-[0.2em] text-white/55">MONEDAS</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {COINS.map((d) => (
                  <DenomRow
                    key={d}
                    label={d < 1 ? `$${d.toFixed(2)}` : `$${d}`}
                    color="#ffb84d"
                    value={coinCount[d] || ''}
                    onChange={(v) => setCoinCount({ ...coinCount, [d]: v })}
                    subtotal={(Number(coinCount[d]) || 0) * d}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* Notes */}
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

        {/* RIGHT: summary panel */}
        <aside className="flex flex-col rounded-3xl overflow-hidden bg-white/5 backdrop-blur-md border border-white/10 sticky top-4 self-start">
          {/* Head */}
          <div className="flex flex-col gap-1.5 px-6 py-6 border-b border-white/10">
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40">RESUMEN DEL CORTE</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-white/55">Total Declarado</span>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-emerald-400 tracking-tight tabular-nums">
                  {fmtMoney(totalDeclared)}
                </span>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex flex-col gap-4 px-6 py-5 overflow-auto">
            <div className="flex flex-col gap-2">
              <Row label="Billetes" value={fmtMoney(totalBills)} />
              <Row label="Monedas" value={fmtMoney(totalCoins)} />
            </div>

            <div className="h-px bg-white/10" />

            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-black tracking-[0.2em] text-white/40">
                INFORMATIVO · NO SE SUMA
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
            </div>

            {/* Info banner */}
            <div className="rounded-2xl p-4 flex items-start gap-2.5 bg-[#ffb84d]/8 border border-[#ffb84d]/30">
              <ShieldAlert size={16} className="text-[#ffb84d] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] font-medium leading-relaxed text-amber-100">
                Una vez confirmes, no podrás modificar la declaración. La conciliación la verá el supervisor.
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

          {/* Footer */}
          <div className="flex flex-col gap-2.5 px-5 py-5 border-t border-white/10">
            <button
              onClick={onSubmit}
              disabled={!shift || submitting || totalDeclared <= 0}
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
    </div>
  );
}

function DenomRow({ label, color, value, onChange, subtotal }:
  { label: string; color: string; value: string; onChange: (v: string) => void; subtotal: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl p-3 bg-white/5 border border-white/10">
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-black px-2 py-0.5 rounded text-[#0a0a0c]"
          style={{ background: color }}
        >
          {label}
        </span>
        <span className="text-[10px] text-white/30">×</span>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-transparent text-lg font-black text-white outline-none tabular-nums"
        style={{ fontFamily: 'inherit' }}
      />
      <span
        className="text-[10px] font-bold tabular-nums"
        style={{ color: subtotal > 0 ? '#88D66C' : 'rgba(255,255,255,0.3)' }}
      >
        {subtotal > 0 ? `$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-white/55">{label}</span>
      <span className="text-xs font-black tabular-nums text-white">{value}</span>
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
