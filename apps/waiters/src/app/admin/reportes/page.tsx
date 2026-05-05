'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange, Share2, ArrowUpRight, ArrowDownRight,
  TrendingUp, Receipt, ShoppingCart, RotateCcw, ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';

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
    setLoading(true);
    setError('');

    const days = periodToDays(period);
    const from = new Date(); from.setDate(from.getDate() - days + 1); from.setHours(0,0,0,0);
    const to = new Date();

    Promise.all([
      api.get('/api/reports/dashboard', { params: { from: from.toISOString(), to: to.toISOString() } }),
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

    return () => { cancelled = true; };
  }, [period]);

  // Derived: deltas vs prev period (mocked from byDay halves)
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
      refundDelta: 0, // backend no lo expone aún
    };
  }, [byDay]);

  // Chart bars
  const maxRev = Math.max(1, ...byDay.map(d => d.revenue));
  const peak   = byDay.reduce((m, d) => (d.revenue > (m?.revenue ?? -1) ? d : m), byDay[0] || null);
  const peakIdx = peak ? byDay.findIndex(d => d.date === peak.date) : -1;

  return (
    <div className="min-h-full" style={{ background: '#0C0C0E', color: '#FFFFFF', fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Topbar */}
      <header className="flex items-end justify-between gap-6 px-8 py-6" style={{ borderBottom: '1px solid #1F1F23' }}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#666' }}>
            <span>Analytics</span>
            <ChevronRight size={11} />
            <span style={{ color: '#FFFFFF' }}>Reportes de Ventas</span>
          </div>
          <h1 className="text-2xl font-bold">Reportes de Ventas</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2E' }}>
            <CalendarRange size={13} style={{ color: '#FFB84D' }} />
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}
              className="bg-transparent outline-none cursor-pointer font-semibold" style={{ color: '#FFFFFF' }}>
              <option value="7D" className="bg-zinc-900">Últimos 7 días</option>
              <option value="30D" className="bg-zinc-900">Últimos 30 días</option>
              <option value="AÑO" className="bg-zinc-900">Este año</option>
            </select>
          </div>
          <button className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold transition hover:bg-white/10"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2E' }}>
            <Share2 size={13} /> Exportar PDF
          </button>
          <button className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold text-black"
            style={{ background: '#FF8400' }}>
            Compartir reporte
          </button>
        </div>
      </header>

      {/* KPI Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-8 pt-6">
        <KPICard
          icon={<TrendingUp size={16} style={{ color: '#88D66C' }} />}
          label="Ventas Totales"
          value={fmtMoney(summary?.totalRevenue ?? 0)}
          delta={revenueDelta}
          loading={loading}
        />
        <KPICard
          icon={<Receipt size={16} style={{ color: '#FFB84D' }} />}
          label="Ticket Promedio"
          value={fmtMoney(summary?.averageTicket ?? 0)}
          delta={ticketDelta}
          loading={loading}
        />
        <KPICard
          icon={<ShoppingCart size={16} style={{ color: '#FF8400' }} />}
          label="Órdenes Completadas"
          value={fmtCount(summary?.totalOrders ?? 0)}
          delta={orderDelta}
          loading={loading}
        />
        <KPICard
          icon={<RotateCcw size={16} style={{ color: '#FF5C33' }} />}
          label="Devoluciones"
          value={fmtMoney(summary?.totalDiscount ?? 0)}
          delta={refundDelta}
          inverted
          loading={loading}
        />
      </section>

      {/* Chart + Top sellers */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 px-8 py-6">
        {/* Chart */}
        <div className="rounded-2xl p-6 flex flex-col gap-4 min-h-[420px]"
          style={{ background: '#1A1A1A', border: '1px solid #2E2E2E' }}>
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: '#666' }}>VENTAS POR DÍA</span>
              <h2 className="text-lg font-bold">Tendencia de ingresos</h2>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="flex flex-col items-end">
                <span className="text-[10px]" style={{ color: '#666' }}>Pico</span>
                <span className="text-base font-bold" style={{ color: '#88D66C' }}>
                  {peak ? fmtMoney(peak.revenue) : '—'}
                </span>
              </div>
              {peak && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{ background: '#88D66C26', border: '1px solid #88D66C40' }}>
                  <ArrowUpRight size={11} style={{ color: '#88D66C' }} />
                  <span className="text-[10px] font-bold" style={{ color: '#88D66C' }}>
                    {dayLabel(peak.date)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bars */}
          <div className="flex-1 flex items-end gap-2 pt-3 min-h-[280px]">
            {byDay.length === 0 && !loading && (
              <div className="w-full text-center text-xs" style={{ color: '#666' }}>
                Sin datos en este período.
              </div>
            )}
            {byDay.map((d, i) => {
              const h = (d.revenue / maxRev) * 100;
              const isPeak = i === peakIdx;
              return (
                <div key={d.date} className="flex-1 h-full flex flex-col items-center gap-1.5 justify-end group">
                  <span className="text-[9px] font-bold tabular-nums opacity-0 group-hover:opacity-100 transition"
                    style={{ color: isPeak ? '#88D66C' : '#FFB84D' }}>
                    {fmtMoney(d.revenue).replace('$', '')}
                  </span>
                  <div className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${Math.max(h, 2)}%`,
                      background: isPeak ? '#88D66C' : '#FF8400',
                      boxShadow: isPeak ? '0 0 16px #88D66C50' : 'none',
                    }} />
                  <span className="text-[9px]" style={{ color: '#666' }}>
                    {dayLabel(d.date).split(' ')[1]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top sellers */}
        <aside className="rounded-2xl flex flex-col overflow-hidden"
          style={{ background: '#1A1A1A', border: '1px solid #2E2E2E' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: '#666' }}>RANKING</span>
              <h3 className="text-sm font-bold">Top productos</h3>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#B8B9B6' }}>
              {period === '7D' ? '7 días' : period === '30D' ? '30 días' : 'Año'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {topItems.length === 0 && !loading && (
              <p className="text-xs text-center py-8" style={{ color: '#666' }}>
                Aún no hay ventas registradas.
              </p>
            )}
            {topItems.map((it, idx) => {
              const colors = ['#FF8400', '#88D66C', '#FFB84D', '#FFFFFF', '#FFFFFF', '#FFFFFF'];
              return (
                <div key={it.name + idx} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-white/5 transition">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold"
                    style={{
                      background: idx < 3 ? `${colors[idx]}20` : 'rgba(255,255,255,0.04)',
                      color: idx < 3 ? colors[idx] : '#B8B9B6',
                      border: `1px solid ${idx < 3 ? colors[idx] + '40' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{it.name}</p>
                    <p className="text-[10px]" style={{ color: '#B8B9B6' }}>
                      {fmtCount(it.quantity)} unidades
                    </p>
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color: '#88D66C' }}>
                    {fmtMoney(it.total)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ background: '#0C0C0E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex flex-col">
              <span className="text-[10px]" style={{ color: '#666' }}>Total productos</span>
              <span className="text-xs font-bold">{topItems.length}</span>
            </div>
            <button className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-black"
              style={{ background: '#FF8400' }}>
              Ver todo →
            </button>
          </div>
        </aside>
      </section>

      {error && (
        <div className="mx-8 mb-8 rounded-xl p-4 text-xs"
          style={{ background: '#FF5C3315', border: '1px solid #FF5C3340', color: '#FF5C33' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function KPICard({ icon, label, value, delta, inverted = false, loading }:
  { icon: React.ReactNode; label: string; value: string; delta: number; inverted?: boolean; loading?: boolean }) {
  const positive = inverted ? delta < 0 : delta > 0;
  const color = positive ? '#88D66C' : delta === 0 ? '#666' : '#FF5C33';
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3.5"
      style={{ background: '#1A1A1A', border: '1px solid #262626' }}>
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          {icon}
        </div>
        {!loading && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: `${color}20`, color }}>
            {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold tracking-wider" style={{ color: '#666' }}>
          {label.toUpperCase()}
        </span>
        <span className="text-2xl font-bold tabular-nums">
          {loading ? '—' : value}
        </span>
      </div>
    </div>
  );
}
