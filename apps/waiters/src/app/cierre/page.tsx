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

  // Restore draft
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
  const roleLabel = employee?.role === 'CASHIER' ? 'Cajero' :
                    employee?.role === 'MANAGER' ? 'Gerente' :
                    employee?.role === 'ADMIN' ? 'Admin' : (employee?.role || 'Empleado');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0C0C0E', color: '#FFFFFF', fontFamily: 'JetBrains Mono, monospace' }}>
      {/* HEADER */}
      <header className="flex items-center justify-between px-8 py-4" style={{ background: '#1A1A1A', borderBottom: '1px solid #2E2E2E' }}>
        <div className="flex items-center gap-3.5">
          <button onClick={() => router.back()} className="w-10 h-10 rounded-[10px] flex items-center justify-center hover:bg-white/10 transition"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span style={{ color: '#B8B9B6' }}>Caja Principal</span>
              <ChevronRight size={11} style={{ color: '#666' }} />
              <span className="font-semibold">Cierre de Turno</span>
            </div>
            <h1 className="text-lg font-bold">Cierre de Turno · Corte Ciego</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-black" style={{ background: '#FF8400' }}>
              {userInitial}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold leading-none">{employee?.name || 'Empleado'}</span>
              <span className="text-[9px] mt-0.5" style={{ color: '#B8B9B6' }}>{roleLabel} · Caja Principal</span>
            </div>
          </div>
          {shift && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <AlarmClock size={14} style={{ color: '#FFB84D' }} />
              <span className="text-xs font-semibold">
                Turno: {new Date(shift.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} → {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {elapsed(shift.openedAt)}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 p-8 overflow-auto">
        {/* LEFT: form */}
        <div className="flex flex-col gap-4.5">
          {/* Form card */}
          <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: '#1A1A1A', border: '1px solid #2E2E2E' }}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-base font-bold">Declaración de Efectivo</h2>
                <p className="text-xs" style={{ color: '#B8B9B6' }}>
                  Cuenta el efectivo en tu caja y captura las cantidades por denominación.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: '#FFB84D26', border: '1px solid #FFB84D60' }}>
                <ShieldAlert size={11} style={{ color: '#FFB84D' }} />
                <span className="text-[10px] font-bold" style={{ color: '#FFB84D' }}>CORTE CIEGO</span>
              </div>
            </div>

            {/* BILLETES */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Banknote size={14} style={{ color: '#88D66C' }} />
                <span className="text-[11px] font-bold tracking-wider" style={{ color: '#B8B9B6' }}>BILLETES</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {BILLS.map((d) => (
                  <DenomRow key={d}
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
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Coins size={14} style={{ color: '#FFB84D' }} />
                <span className="text-[11px] font-bold tracking-wider" style={{ color: '#B8B9B6' }}>MONEDAS</span>
              </div>
              <div className="grid grid-cols-5 gap-2.5">
                {COINS.map((d) => (
                  <DenomRow key={d}
                    label={d < 1 ? `$${d.toFixed(2)}` : `$${d}`}
                    color="#FFB84D"
                    value={coinCount[d] || ''}
                    onChange={(v) => setCoinCount({ ...coinCount, [d]: v })}
                    subtotal={(Number(coinCount[d]) || 0) * d}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* Notes */}
          <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: '#1A1A1A', border: '1px solid #2E2E2E' }}>
            <label className="text-[11px] font-bold tracking-wider" style={{ color: '#B8B9B6' }}>
              NOTAS / OBSERVACIONES
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Faltó cambio en moneda de $2 al iniciar el turno…"
              rows={3}
              className="rounded-[10px] px-3 py-2.5 text-xs resize-none outline-none focus:border-orange-500/60 transition"
              style={{ background: '#0C0C0E', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* RIGHT: summary panel */}
        <aside className="flex flex-col rounded-2xl overflow-hidden" style={{ background: '#1A1A1A', border: '1px solid #2E2E2E' }}>
          {/* Head */}
          <div className="flex flex-col gap-1.5 px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: '#666' }}>RESUMEN DEL CORTE</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm" style={{ color: '#B8B9B6' }}>Total Declarado</span>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold" style={{ color: '#88D66C' }}>{fmtMoney(totalDeclared)}</span>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex flex-col gap-3.5 px-5 py-4 overflow-auto">
            <div className="flex flex-col gap-2">
              <Row label="Billetes" value={fmtMoney(totalBills)} />
              <Row label="Monedas" value={fmtMoney(totalCoins)} />
            </div>

            <div className="h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: '#666' }}>INFORMATIVO · NO SE SUMA</span>
              <SummaryCard icon={<CreditCard size={14} style={{ color: '#FF8400' }} />}
                label="Tarjeta" value={fmtMoney(shift?.totalCard ?? 0)} />
              <SummaryCard icon={<Wifi size={14} style={{ color: '#0EA5E9' }} />}
                label="Transferencia" value={fmtMoney(shift?.totalTransfer ?? 0)} />
            </div>

            {/* Info banner */}
            <div className="rounded-xl p-3.5 flex items-start gap-2.5"
              style={{ background: '#FFB84D14', border: '1px solid #FFB84D40' }}>
              <ShieldAlert size={16} style={{ color: '#FFB84D', flexShrink: 0 }} />
              <p className="text-[11px] leading-relaxed" style={{ color: '#FCD34D' }}>
                Una vez confirmes, no podrás modificar la declaración. La conciliación la verá el supervisor.
              </p>
            </div>

            {error && (
              <div className="rounded-xl p-3 text-[11px]" style={{ background: '#FF5C3315', border: '1px solid #FF5C3340', color: '#FF5C33' }}>
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-2.5 px-5 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={onSubmit} disabled={!shift || submitting || totalDeclared <= 0}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-full py-4 text-sm font-bold text-black transition disabled:opacity-50"
              style={{ background: '#FF8400' }}>
              <Lock size={16} />
              {submitting ? 'Cerrando…' : 'Confirmar y Cerrar Turno'}
            </button>
            <button onClick={onSaveDraft}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full py-2.5 text-xs"
              style={{ color: '#B8B9B6' }}>
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
    <div className="flex flex-col gap-1.5 rounded-xl p-2.5" style={{ background: '#0C0C0E', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold px-2 py-0.5 rounded text-black" style={{ background: color }}>{label}</span>
        <span className="text-[10px]" style={{ color: '#666' }}>×</span>
      </div>
      <input type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-transparent text-base font-bold text-white outline-none"
        style={{ fontFamily: 'inherit' }} />
      <span className="text-[10px] font-semibold tabular-nums" style={{ color: subtotal > 0 ? '#88D66C' : '#666' }}>
        {subtotal > 0 ? fmtMoney(subtotal) : '—'}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: '#B8B9B6' }}>{label}</span>
      <span className="text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl flex items-center gap-3 p-3.5" style={{ background: '#0C0C0E', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-bold tracking-wider" style={{ color: '#666' }}>{label.toUpperCase()}</p>
        <p className="text-sm font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
