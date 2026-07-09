"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight, Wallet, Receipt, AlertTriangle, CheckCircle2, RotateCw, Factory, Globe,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Toolbar, Card, Button, StatTile,
  EmptyState, Skeleton, Pill, IconBadge, useToast,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

// /admin/finanzas/conciliacion · Conciliación de transferencias (SPEI).
// Lista TODAS las transferencias PAID sin verificar del restaurante y permite
// palomearlas contra el banco. Consume /api/driver-cash/transfers/pending.

const ALERT_DAYS = 2; // umbral para marcar una transferencia como "vieja"

interface Item {
  id: string; orderNumber: string; total: number; customerName: string | null;
  driverName: string | null; paidAt: string | null; createdAt: string; ageDays: number;
}
interface Resp { items: Item[]; count: number; total: number; oldestDays: number }

const mny = (n: number) => formatMoney(n, false);
const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const ageLabel = (d: number) => (d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`);

export default function ConciliacionPage() {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Resp>("/api/driver-cash/transfers/pending");
      setData(data);
    } catch {
      setData({ items: [], count: 0, total: 0, oldestDays: 0 });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function verify(it: Item) {
    if (busy.has(it.id)) return;
    setBusy((p) => new Set(p).add(it.id));
    // Optimista: quita la fila al instante.
    setData((d) => d ? { ...d, items: d.items.filter((x) => x.id !== it.id), count: d.count - 1, total: d.total - it.total } : d);
    try {
      await api.patch(`/api/driver-cash/transfers/${it.id}/verify`, { verified: true });
      toast.success(`Transferencia #${it.orderNumber} verificada.`);
    } catch {
      toast.error("No se pudo verificar. Recargando…");
      await load();
    } finally {
      setBusy((p) => { const n = new Set(p); n.delete(it.id); return n; });
    }
  }

  const items = data?.items ?? [];
  const alertCount = items.filter((i) => i.ageDays >= ALERT_DAYS).length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Finanzas · Caja"
        title="Conciliación de transferencias"
        subtitle="SPEI cobrados por cotejar contra el banco"
      />
      <PageTabs set="finanzas" />

      <Toolbar
        actions={
          <Button variant="secondary" icon={RotateCw} onClick={load} loading={loading}>
            Actualizar
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-ds-lg" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile icon={Wallet} value={mny(data?.total ?? 0)} label="Total por conciliar" />
            <StatTile icon={Receipt} value={data?.count ?? 0} label="Transferencias" />
            <StatTile icon={AlertTriangle} value={data?.oldestDays ? ageLabel(data.oldestDays) : "—"} label="La más vieja" />
          </div>

          {alertCount > 0 && (
            <div className="flex items-center gap-3 rounded-ds-lg p-4" style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)" }}>
              <AlertTriangle size={20} className="shrink-0" style={{ color: "var(--warn)" }} />
              <p className="text-sm font-bold" style={{ color: "var(--warn)" }}>
                {alertCount} transferencia{alertCount !== 1 ? "s" : ""} lleva{alertCount !== 1 ? "n" : ""} {ALERT_DAYS}+ días sin verificar — cotéjalas contra tu banco.
              </p>
            </div>
          )}

          {items.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Todo conciliado" hint="No hay transferencias pendientes de verificar." />
          ) : (
            <Card className="overflow-hidden">
              {items.map((it, idx) => {
                const old = it.ageDays >= ALERT_DAYS;
                return (
                  <div key={it.id} className="flex items-center gap-3 px-3.5 py-3"
                    style={idx === items.length - 1 ? {} : { borderBottom: "1px solid var(--bd-1)" }}>
                    <IconBadge icon={ArrowLeftRight} tone={old ? "warn" : "info"} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold text-tx-hi">#{it.orderNumber} · {it.customerName || "Cliente"}</span>
                        {old && <Pill tone="warn">{ageLabel(it.ageDays)}</Pill>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-tx-mut">
                        {it.driverName ? <><Factory size={11} /> {it.driverName}</> : <><Globe size={11} /> Tienda online</>}
                        <span className="text-tx-dim">·</span>
                        {fmtDay(it.paidAt || it.createdAt)}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-tx-hi">{mny(it.total)}</span>
                    <Button variant="primary" size="sm" icon={CheckCircle2}
                      onClick={() => verify(it)} disabled={busy.has(it.id)} loading={busy.has(it.id)}>
                      Verificar
                    </Button>
                  </div>
                );
              })}
            </Card>
          )}
          <p className="text-[11px] text-tx-dim">
            Solo aparecen transferencias ya marcadas como pagadas. Las dejadas &quot;pendientes de cobro&quot; no entran aquí hasta confirmarse.
          </p>
        </div>
      )}
    </PageShell>
  );
}
