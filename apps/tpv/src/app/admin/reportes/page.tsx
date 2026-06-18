'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange, Share2, ArrowUpRight, ArrowDownRight,
  TrendingUp, Receipt, ShoppingCart, RotateCcw,
} from 'lucide-react';
import api from '@/lib/api';
import { AdminScreen, AdminHeader } from '@/components/admin/AdminScreen';

type Period = '7D' | '30D' | 'AÑO';

interface Summary {
  totalRevenue: number;
  totalOrders: number;
  averageTicket: number;
  totalDiscount: number;
}

interface DayPoint { date: string; revenue: number; orders: number }
interface TopItem  { name: string; quantity: number; total: number }

const fmtMoney = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const fmtCount = (n: number) => n.toLocaleString('es-MX');

function periodToDays(p: Period) {
  return p === '7D' ? 7 : p === '30D' ? 30 : 365;
}

function dayLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit' });
}

export default function ReportesPage() {
  const [period, setPeriod] = useState<Period>('7D');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byDay, setByDay] = useState<DayPoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Arranque del fetch diferido a microtask: el setState de loading/error
    // ya no corre sincrónicamente dentro del effect (set-state-in-effect),
    // pero el orden y el comportamiento son idénticos (el microtask corre
    // antes del paint, como el propio effect pasivo).
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');

      // El backend resuelve el rango en hora de México a partir de `days`
      // (antes calculábamos from/to aquí con la zona del dispositivo).
      const days = periodToDays(period);

      Promise.all([
        api.get('/api/reports/dashboard', { params: { days } }),
        api.get('/api/reports/by-day',    { params: { days } }),
        api.get('/api/reports/top-products', { params: { period, limit: 6 } }),
      ]).then(([dash, daily, top]) => {
        if (cancelled) return;
        setSummary(dash.data);
        setByDay(daily.data || []);
        setTopItems(top.data || []);
        setLoading(false);
      }).catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || 'No pudimos cargar los reportes');
        setLoading(false);
      });
    });

    return () => { cancelled = true; };
  }, [period]);

  const { revenueDelta, orderDelta, ticketDelta, refundDelta } = useMemo(() => {
    if (byDay.length < 2) return { revenueDelta: 0, orderDelta: 0, ticketDelta: 0, refundDelta: 0 };
    const half = Math.floor(byDay.length / 2);
    const prev = byDay.slice(0, half);
    const curr = byDay.slice(half);
    const sum = (arr: DayPoint[], k: 'revenue'|'orders') => arr.reduce((s,d) => s + (d[k]||0), 0);
    const rPrev = sum(prev, 'revenue'); const rCurr = sum(curr, 'revenue');
    const oPrev = sum(prev, 'orders');  const oCurr = sum(curr, 'orders');
    const pct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : 0;
    const tPrev = oPrev > 0 ? rPrev / oPrev : 0;
    const tCurr = oCurr > 0 ? rCurr / oCurr : 0;
    return {
      revenueDelta: pct(rCurr, rPrev),
      orderDelta: pct(oCurr, oPrev),
      ticketDelta: pct(tCurr, tPrev),
      refundDelta: 0, 
    };
  }, [byDay]);

  const maxRev = Math.max(1, ...byDay.map(d => d.revenue));
  const peak   = byDay.reduce((m, d) => (d.revenue > (m?.revenue ?? -1) ? d : m), byDay[0] || null);
  const peakIdx = peak ? byDay.findIndex(d => d.date === peak.date) : -1;

  return (
    <AdminScreen maxWidth="max-w-7xl">
      <AdminHeader
        icon={TrendingUp}
        title="Reportes de Ventas"
        subtitle="Ventas, ticket promedio, órdenes y productos más vendidos."
        action={
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs bg-surface-2 border border-border shadow-sm">
              <CalendarRange size={14} style={{ color: 'var(--brand)' }} />
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}
                className="bg-transparent outline-none cursor-pointer font-bold text-tx-pri">
                <option value="7D" className="bg-surface-1">Últimos 7 días</option>
                <option value="30D" className="bg-surface-1">Últimos 30 días</option>
                <option value="AÑO" className="bg-surface-1">Este año</option>
              </select>
            </div>
            <button className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all bg-surface-2 border border-border hover:bg-surface-hover shadow-sm active:scale-95">
              <Share2 size={14} /> PDF
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all active:scale-95"
              style={{ background: 'var(--brand)', color: 'var(--brand-fg)', boxShadow: '0 8px 16px var(--brand-glow)' }}>
              Compartir
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<TrendingUp size={18} />}
          label="Ventas Totales"
          value={fmtMoney(summary?.totalRevenue ?? 0)}
          delta={revenueDelta}
          loading={loading}
          themeColor="#10b981"
        />
        <KPICard
          icon={<Receipt size={18} />}
          label="Ticket Promedio"
          value={fmtMoney(summary?.averageTicket ?? 0)}
          delta={ticketDelta}
          loading={loading}
          themeColor="#f59e0b"
        />
        <KPICard
          icon={<ShoppingCart size={18} />}
          label="Órdenes"
          value={fmtCount(summary?.totalOrders ?? 0)}
          delta={orderDelta}
          loading={loading}
          themeColor="#6366f1"
        />
        <KPICard
          icon={<RotateCcw size={18} />}
          label="Devoluciones"
          value={fmtMoney(summary?.totalDiscount ?? 0)}
          delta={refundDelta}
          inverted
          loading={loading}
          themeColor="#ef4444"
        />
      </section>

      {/* Chart + Top sellers */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 mt-6">
        {/* Chart */}
        <div className="rounded-2xl p-8 flex flex-col gap-6 min-h-[460px] bg-surface-1 border border-border shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold tracking-widest text-tx-mut uppercase">VENTAS POR DÍA</span>
              <h2 className="text-xl font-black tracking-tight">Tendencia de ingresos</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-tx-mut uppercase tracking-wider">Pico de Ventas</span>
                <span className="text-xl font-black tabular-nums" style={{ color: 'var(--brand)' }}>
                  {peak ? fmtMoney(peak.revenue) : '—'}
                </span>
              </div>
              {peak && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
                  style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand-glow)', color: 'var(--brand)' }}>
                  <ArrowUpRight size={14} />
                  <span className="text-[11px] font-semibold">
                    {dayLabel(peak.date)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bars */}
          <div className="flex-1 flex items-end gap-3 pt-6 min-h-[300px]">
            {byDay.length === 0 && !loading && (
              <div className="w-full text-center text-sm text-tx-mut italic opacity-60">
                Sin datos disponibles en este período.
              </div>
            )}
            {byDay.map((d, i) => {
              const h = (d.revenue / maxRev) * 100;
              const isPeak = i === peakIdx;
              return (
                <div key={d.date} className="flex-1 h-full flex flex-col items-center gap-2 justify-end group">
                  <div className="relative w-full flex flex-col items-center group">
                    <span className="absolute -top-7 text-[10px] font-semibold tabular-nums opacity-0 group-hover:opacity-100 transition-all transform -translate-y-1 group-hover:translate-y-0"
                      style={{ color: isPeak ? 'var(--brand)' : 'var(--text-secondary)' }}>
                      {fmtMoney(d.revenue).replace('$', '')}
                    </span>
                    <div className="w-full rounded-t-xl transition-all duration-500 ease-out shadow-sm group-hover:shadow-lg"
                      style={{
                        height: `${Math.max(h, 4)}%`,
                        background: isPeak ? 'var(--brand)' : 'var(--surface-3)',
                        opacity: isPeak ? 1 : 0.8,
                      }} />
                  </div>
                  <span className="text-[10px] font-bold text-tx-mut uppercase tracking-tighter">
                    {dayLabel(d.date).split(' ')[1]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top sellers */}
        <aside className="rounded-2xl flex flex-col overflow-hidden bg-surface-1 border border-border shadow-sm">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-surface-2/50">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold tracking-widest text-tx-mut uppercase">RANKING</span>
              <h3 className="text-base font-semibold tracking-tight">Top Productos</h3>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-xl text-[10px] font-semibold uppercase tracking-widest bg-surface-3 text-tx-sec">
              {period === '7D' ? '7 Días' : period === '30D' ? '30 Días' : 'Año'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 divide-y divide-border/30 scrollbar-hide">
            {topItems.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 opacity-40">
                 <ShoppingCart size={32} className="mb-3" />
                 <p className="text-xs font-bold">Sin ventas aún</p>
              </div>
            )}
            {topItems.map((it, idx) => {
              return (
                <div key={it.name + idx} className="flex items-center gap-4 py-4 px-2 hover:bg-surface-hover rounded-xl transition-all group">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold shadow-sm transition-transform group-hover:scale-110"
                    style={{
                      background: idx < 3 ? 'var(--brand-soft)' : 'var(--surface-2)',
                      color: idx < 3 ? 'var(--brand)' : 'var(--text-muted)',
                      border: `1px solid ${idx < 3 ? 'var(--brand-glow)' : 'var(--border)'}`,
                    }}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-tx-pri truncate">{it.name}</p>
                    <p className="text-[10px] font-bold text-tx-mut uppercase tracking-widest">
                      {fmtCount(it.quantity)} Vendidos
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--success)' }}>
                    {fmtMoney(it.total)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-5 bg-surface-2/50 border-t border-border flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold text-tx-mut uppercase tracking-widest">Total SKU</span>
              <span className="text-sm font-semibold">{topItems.length}</span>
            </div>
            <button className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md"
              style={{ background: 'var(--brand)', color: 'var(--brand-fg)' }}>
              Ver Todos →
            </button>
          </div>
        </aside>
      </section>

      {error && (
        <div className="mt-6 rounded-2xl p-4 text-xs font-bold animate-in zoom-in-95 duration-200"
          style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </AdminScreen>
  );
}

function KPICard({ icon, label, value, delta, inverted = false, loading, themeColor }:
  { icon: React.ReactNode; label: string; value: string; delta: number; inverted?: boolean; loading?: boolean; themeColor: string }) {
  const positive = inverted ? delta < 0 : delta > 0;
  const color = positive ? 'var(--success)' : delta === 0 ? 'var(--text-muted)' : 'var(--danger)';
  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4 bg-surface-1 border border-border shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-center justify-between">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm"
          style={{ background: `${themeColor}15`, color: themeColor }}>
          {icon}
        </div>
        {!loading && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold tabular-nums transition-all"
            style={{ background: `${color}15`, color }}>
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold tracking-widest text-tx-mut uppercase">
          {label}
        </span>
        <span className="text-2xl font-black tabular-nums tracking-tight text-tx-pri">
          {loading ? '—' : value}
        </span>
      </div>
    </div>
  );
}

