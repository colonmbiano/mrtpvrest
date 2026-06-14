"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Scissors, Wallet, Bike, ChevronDown, ChevronRight, RefreshCw,
  WifiOff, Database, ScrollText, TrendingUp, TrendingDown,
} from "lucide-react";
import api from "@/lib/api";
import { getTenantIds } from "@/lib/tenant";
import { AdminScreen, AdminHeader, AdminTabs, AdminCard } from "@/components/admin/AdminScreen";

/* ── Tipos (espejo de GET /api/shifts y /api/driver-cash/cuts) ── */
interface ShiftExpense { id: string; description: string; amount: number; category: string }
interface ShiftCashIn { id: string; description: string; amount: number; category: string }
interface CashShift {
  id: string; employeeName: string | null; openedAt: string; closedAt: string | null; isOpen: boolean;
  openingFloat: number; closingFloat: number | null; expectedCash: number | null; blindClose: boolean;
  totalCash: number; totalCard: number; totalTransfer: number; totalCourtesy: number; totalTips: number;
  totalSales: number; totalExpenses: number; totalCashIn: number; ordersCount: number; notes: string | null;
  expenses: ShiftExpense[]; cashIns: ShiftCashIn[];
}
interface DriverCut {
  id: string; driverName: string; totalFloat: number; totalIncome: number; totalExpense: number;
  totalReturn: number; balance: number; movements: number; notes: string | null; createdAt: string;
}
type Row =
  | { kind: "shift"; id: string; date: string; who: string; balance: number; data: CashShift }
  | { kind: "driver"; id: string; date: string; who: string; balance: number; data: DriverCut };
type Filter = "ALL" | "shift" | "driver";

/* ── Helpers ── */
const fmtMoney = (n: number) =>
  (n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const cacheKey = (rid: string | null) => `tpv-cortes-cache-${rid || "default"}`;
function timeAgo(ts: number | null) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export default function CortesPage() {
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [cuts, setCuts] = useState<DriverCut[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [offline, setOffline] = useState(false);
  const [cacheTs, setCacheTs] = useState<number | null>(null);

  const load = useCallback(() => {
    const { restaurantId } = getTenantIds();
    const key = cacheKey(restaurantId);
    Promise.all([api.get("/api/shifts"), api.get("/api/driver-cash/cuts")])
      .then(([s, c]) => {
        const sd: CashShift[] = Array.isArray(s.data) ? s.data : [];
        const cd: DriverCut[] = Array.isArray(c.data) ? c.data : [];
        setShifts(sd); setCuts(cd);
        setOffline(false); setFromCache(false); setError("");
        const ts = Date.now(); setCacheTs(ts);
        // Respaldo local: persistimos el último corte conocido para verlo sin red.
        try { localStorage.setItem(key, JSON.stringify({ shifts: sd, cuts: cd, ts })); } catch { /* storage lleno/no disp */ }
      })
      .catch((e) => {
        // Sin red: si hay respaldo local ya hidratado, lo mantenemos y avisamos.
        let hasCache = false;
        try { hasCache = !!localStorage.getItem(key); } catch { hasCache = false; }
        if (hasCache) setOffline(true);
        else setError(e?.response?.data?.error || "No pudimos cargar los cortes y no hay respaldo local.");
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  // Hidratar desde respaldo local primero (instantáneo / offline), luego refrescar.
  useEffect(() => {
    const { restaurantId } = getTenantIds();
    try {
      const raw = localStorage.getItem(cacheKey(restaurantId));
      if (raw) {
        const p = JSON.parse(raw);
        setShifts(Array.isArray(p.shifts) ? p.shifts : []);
        setCuts(Array.isArray(p.cuts) ? p.cuts : []);
        setCacheTs(p.ts || null);
        setFromCache(true);
        setLoading(false);
      }
    } catch { /* respaldo corrupto — se ignora */ }
    load();
  }, [load]);

  function refresh() { setRefreshing(true); load(); }
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const rows = useMemo<Row[]>(() => {
    const sRows: Row[] = shifts.map((s) => ({
      kind: "shift", id: "s_" + s.id, date: s.closedAt || s.openedAt, who: s.employeeName || "Cajero",
      balance: s.closingFloat ?? s.expectedCash ?? 0, data: s,
    }));
    const dRows: Row[] = cuts.map((c) => ({
      kind: "driver", id: "d_" + c.id, date: c.createdAt, who: c.driverName, balance: c.balance, data: c,
    }));
    let all = [...sRows, ...dRows];
    if (filter !== "ALL") all = all.filter((r) => r.kind === filter);
    return all.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [shifts, cuts, filter]);

  const kpi = useMemo(() => {
    const sRows = rows.filter((r) => r.kind === "shift") as Extract<Row, { kind: "shift" }>[];
    const dRows = rows.filter((r) => r.kind === "driver") as Extract<Row, { kind: "driver" }>[];
    let faltante = 0, sobrante = 0;
    for (const r of sRows) {
      const s = r.data;
      if (!s.isOpen && s.closingFloat != null && s.expectedCash != null) {
        const diff = s.closingFloat - s.expectedCash;
        if (diff < 0) faltante += diff; else sobrante += diff;
      }
    }
    return {
      count: rows.length,
      ventasCaja: sRows.reduce((a, r) => a + (r.data.totalSales || 0), 0),
      entregadoRep: dRows.reduce((a, r) => a + (r.data.balance || 0), 0),
      faltante, sobrante,
    };
  }, [rows]);

  return (
    <AdminScreen maxWidth="max-w-7xl">
      <AdminHeader
        icon={Scissors}
        title="Cortes de Caja"
        subtitle="Cortes de turno (cajero) y de repartidores, en un solo lugar."
        action={
          <div className="flex items-center gap-3">
            {(offline || fromCache) && (
              <span
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[11px] font-black uppercase tracking-wider"
                style={{
                  background: offline ? "var(--danger-soft)" : "var(--surface-2)",
                  color: offline ? "var(--danger)" : "var(--text-secondary)",
                  border: `1px solid ${offline ? "var(--danger)" : "var(--border)"}`,
                }}
                title={cacheTs ? `Respaldo local · ${timeAgo(cacheTs)}` : "Respaldo local"}
              >
                {offline ? <WifiOff size={13} /> : <Database size={13} />}
                {offline ? "Sin red · local" : "Local"} {cacheTs && <span className="opacity-70">· {timeAgo(cacheTs)}</span>}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
              style={{ background: "var(--brand)", color: "var(--brand-fg)", boxShadow: "0 8px 16px var(--brand-glow)" }}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Actualizar
            </button>
          </div>
        }
      />

      {/* Filtro por tipo */}
      <AdminTabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { key: "ALL", label: "Todos", icon: <ScrollText size={15} /> },
          { key: "shift", label: "Caja", icon: <Wallet size={15} /> },
          { key: "driver", label: "Repartidores", icon: <Bike size={15} /> },
        ]}
      />

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Kpi icon={<ScrollText size={18} />} label="Cortes" value={String(kpi.count)} accent="#6366f1" />
        <Kpi icon={<Wallet size={18} />} label="Ventas en caja" value={fmtMoney(kpi.ventasCaja)} accent="#10b981" />
        <Kpi icon={<Bike size={18} />} label="Entregado repartidores" value={fmtMoney(kpi.entregadoRep)} accent="#f59e0b" />
        <Kpi
          icon={kpi.faltante < 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
          label="Faltantes / Sobrantes"
          value={`${fmtMoney(kpi.faltante)} / ${fmtMoney(kpi.sobrante)}`}
          accent={kpi.faltante < 0 ? "#ef4444" : "#10b981"}
        />
      </section>

      {error && (
        <div className="mb-6 rounded-2xl p-4 text-xs font-bold"
          style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {/* Lista de cortes */}
      {loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 opacity-60">
          <RefreshCw size={28} className="animate-spin mb-3" style={{ color: "var(--brand)" }} />
          <span className="text-xs font-black uppercase tracking-widest text-tx-mut">Cargando cortes…</span>
        </div>
      ) : rows.length === 0 ? (
        <AdminCard className="py-16 flex flex-col items-center text-center">
          <ScrollText size={36} className="mb-3 opacity-40" />
          <p className="text-base font-black">Sin cortes</p>
          <p className="text-xs text-tx-mut mt-1">No hay cortes para este filtro en esta sucursal.</p>
        </AdminCard>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <CorteCard key={r.id} row={r} open={expanded.has(r.id)} onToggle={() => toggle(r.id)} />
          ))}
        </div>
      )}
    </AdminScreen>
  );
}

/* ── KPI tile ── */
function Kpi({ icon, label, value, accent }: { icon: ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl p-4 bg-surf-1 border border-border shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}1A`, border: `1px solid ${accent}40`, color: accent }}>
          {icon}
        </span>
      </div>
      <div className="text-xl font-black tabular-nums tracking-tight leading-none">{value}</div>
      <div className="text-[10px] font-black uppercase tracking-widest text-tx-mut">{label}</div>
    </div>
  );
}

/* ── Tarjeta de corte (cajero o repartidor) — toque cómodo en tablet ── */
function CorteCard({ row, open, onToggle }: { row: Row; open: boolean; onToggle: () => void }) {
  const isShift = row.kind === "shift";
  const accent = isShift ? "#6366f1" : "#f59e0b";
  return (
    <AdminCard glass={false} className="overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-5 min-h-[76px] text-left active:scale-[0.997] transition-transform">
        <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}1A`, border: `1px solid ${accent}40`, color: accent }}>
          {isShift ? <Wallet size={22} /> : <Bike size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-tight truncate">{row.who}</span>
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ background: `${accent}1A`, color: accent }}>{isShift ? "Caja" : "Repartidor"}</span>
            {isShift && (row.data as CashShift).isOpen && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
                style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>Abierto</span>
            )}
          </div>
          <div className="text-xs font-medium text-tx-mut mt-0.5">{fmtDateTime(row.date)}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-black tabular-nums leading-none">{fmtMoney(row.balance)}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-tx-mut mt-1">{isShift ? "En caja" : "Entregado"}</div>
        </div>
        {open
          ? <ChevronDown size={20} className="text-tx-mut flex-shrink-0" />
          : <ChevronRight size={20} className="text-tx-mut flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border">
          {isShift ? <ShiftDetail s={row.data as CashShift} /> : <DriverDetail c={row.data as DriverCut} />}
        </div>
      )}
    </AdminCard>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "ok" | "err" }) {
  return (
    <div className="rounded-xl p-3 bg-surf-2 border border-border">
      <div className="text-[9px] font-black uppercase tracking-widest text-tx-mut mb-1">{label}</div>
      <div className="text-base font-black tabular-nums"
        style={{ color: tone === "err" ? "var(--danger)" : tone === "ok" ? "var(--success)" : "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function ShiftDetail({ s }: { s: CashShift }) {
  const diff = (!s.isOpen && s.closingFloat != null && s.expectedCash != null) ? s.closingFloat - s.expectedCash : null;
  return (
    <div className="pt-5 flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Cell label="Ventas" value={fmtMoney(s.totalSales)} />
        <Cell label="Efectivo" value={fmtMoney(s.totalCash)} />
        <Cell label="Tarjeta" value={fmtMoney(s.totalCard)} />
        <Cell label="Transferencia" value={fmtMoney(s.totalTransfer)} />
        <Cell label="Fondo inicial" value={fmtMoney(s.openingFloat)} />
        <Cell label="Ingresos a caja" value={fmtMoney(s.totalCashIn)} />
        <Cell label="Gastos" value={fmtMoney(s.totalExpenses)} />
        <Cell label="Pedidos" value={String(s.ordersCount)} />
        <Cell label="Efectivo esperado" value={s.expectedCash != null ? fmtMoney(s.expectedCash) : "—"} />
        <Cell label="Efectivo contado" value={s.closingFloat != null ? fmtMoney(s.closingFloat) : "—"} />
        {diff != null && <Cell label={diff < 0 ? "Faltante" : "Sobrante"} value={fmtMoney(diff)} tone={diff < 0 ? "err" : "ok"} />}
      </div>

      {s.expenses.length > 0 && (
        <Detail title={`Gastos del turno (${s.expenses.length})`} items={s.expenses} />
      )}
      {s.cashIns.length > 0 && (
        <Detail title={`Ingresos de efectivo (${s.cashIns.length})`} items={s.cashIns} />
      )}
      {s.notes && <NoteBox>{s.notes}</NoteBox>}
    </div>
  );
}

function DriverDetail({ c }: { c: DriverCut }) {
  return (
    <div className="pt-5 flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <Cell label="Fondo de cambio" value={fmtMoney(c.totalFloat)} />
        <Cell label="Cobrado" value={fmtMoney(c.totalIncome)} />
        <Cell label="Gastos" value={fmtMoney(c.totalExpense)} />
        <Cell label="Devoluciones" value={fmtMoney(c.totalReturn)} />
        <Cell label="Balance entregado" value={fmtMoney(c.balance)} tone="ok" />
        <Cell label="Movimientos" value={String(c.movements)} />
      </div>
      {c.notes && <NoteBox>{c.notes}</NoteBox>}
    </div>
  );
}

function Detail({ title, items }: { title: string; items: Array<{ id: string; description: string; amount: number; category: string }> }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-tx-mut mb-2">{title}</div>
      <div className="rounded-xl bg-surf-2 border border-border divide-y divide-border/40">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-tx-sec truncate">{it.description || "—"}</span>
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-surf-3 text-tx-mut flex-shrink-0">{it.category}</span>
            </div>
            <span className="text-sm font-black tabular-nums flex-shrink-0">{fmtMoney(it.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoteBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surf-2 border border-border px-4 py-3 text-sm text-tx-sec">
      <span className="text-tx-mut">Nota: </span>{children}
    </div>
  );
}
