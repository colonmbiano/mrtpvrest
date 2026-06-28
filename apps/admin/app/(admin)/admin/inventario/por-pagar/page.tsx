"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, Wallet, Receipt, ShoppingCart, CalendarClock,
  AlertTriangle, Banknote, CreditCard, ArrowLeftRight, X, CheckCircle2, Factory,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, StatTile, PrimaryBtn,
  EmptyState, Pill, IconBadge, money,
} from "@/components/warmtech";

// /admin/inventario/por-pagar · Cuentas por pagar.
// Lista deudas PENDIENTES (gastos + compras) de GET /api/payables y las liquida
// vía POST /api/expenses|purchases/:id/settle. Liquidar es lo que recién golpea
// la caja del día en que se paga.

interface Supplier { id: string; name: string }
interface Category { id: string; name: string; icon: string; color: string | null }
interface Payable {
  kind: "EXPENSE" | "PURCHASE";
  id: string;
  concept: string;
  amount: number;
  dueDate: string | null;
  supplier: Supplier | null;
  category: Category | null;
  occurredAt: string;
  settleUrl: string;
}
interface PayablesResp {
  items: Payable[];
  total: number;
  count: number;
  bySupplier: { supplier: Supplier | null; total: number; count: number }[];
}

type Method = "CASH_DRAWER" | "CORPORATE_CARD" | "TRANSFER";

const METHODS: { value: Method; label: string; icon: typeof Banknote; color: string }[] = [
  { value: "CASH_DRAWER", label: "Efectivo de caja", icon: Banknote, color: "var(--warn)" },
  { value: "TRANSFER", label: "Transferencia", icon: ArrowLeftRight, color: "var(--brand-primary)" },
  { value: "CORPORATE_CARD", label: "Tarjeta corporativa", icon: CreditCard, color: "var(--info)" },
];

function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

function fmtDay(iso: string | null) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric",
  });
}

export default function PorPagarPage() {
  const [data, setData] = useState<PayablesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Payable | null>(null);
  const [method, setMethod] = useState<Method>("CASH_DRAWER");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PayablesResp>("/api/payables");
      setData(data);
    } catch {
      setData({ items: [], total: 0, count: 0, bySupplier: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overdue = useMemo(() => {
    if (!data) return { count: 0, total: 0 };
    const t = startOfToday();
    return data.items.reduce(
      (acc, it) => {
        if (it.dueDate && new Date(it.dueDate).getTime() < t) {
          acc.count += 1;
          acc.total += Number(it.amount) || 0;
        }
        return acc;
      },
      { count: 0, total: 0 },
    );
  }, [data]);

  function openPay(p: Payable) {
    setTarget(p);
    setMethod("CASH_DRAWER");
  }

  async function confirmPay() {
    if (!target) return;
    setSaving(true);
    try {
      await api.post(target.settleUrl, { paymentMethod: method });
      setTarget(null);
      await load();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || "No se pudo liquidar.");
    } finally {
      setSaving(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Finanzas · Inventario"
        title="Cuentas por pagar"
        subtitle="Deudas pendientes de pago a proveedores"
      />

      <div className="mb-4 md:hidden">
        <a
          href="/admin/inventario"
          className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-tx-mut"
        >
          <ChevronLeft size={15} /> Inventario
        </a>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile icon={Wallet} value={money(data?.total ?? 0)} label="Total por pagar" />
            <StatTile icon={Receipt} value={data?.count ?? 0} label="Cuentas pendientes" />
            <StatTile icon={AlertTriangle} value={money(overdue.total)} label={`Vencidas · ${overdue.count}`} />
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Todo al corriente"
              hint="No hay gastos ni compras pendientes de pago."
            />
          ) : (
            <WtCard className="overflow-hidden">
              {items.map((it, idx) => {
                const isOverdue = !!it.dueDate && new Date(it.dueDate).getTime() < startOfToday();
                const Icon = it.kind === "PURCHASE" ? ShoppingCart : Receipt;
                return (
                  <div
                    key={`${it.kind}-${it.id}`}
                    className="flex items-center gap-3 px-3.5 py-3"
                    style={idx === items.length - 1 ? {} : { borderBottom: "1px solid var(--bd-1)" }}
                  >
                    <IconBadge icon={Icon} tone={it.kind === "PURCHASE" ? "info" : "ac"} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold text-tx-hi">{it.concept}</span>
                        {isOverdue && <Pill tone="err">Vencida</Pill>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-tx-mut">
                        <Factory size={11} />
                        <span className="truncate">{it.supplier?.name || "Sin proveedor"}</span>
                        <span className="text-tx-dim">·</span>
                        <CalendarClock size={11} />
                        <span className={isOverdue ? "font-semibold text-[color:var(--err)]" : ""}>
                          {fmtDay(it.dueDate)}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-tx-hi">
                      {money(it.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openPay(it)}
                      className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-white transition-transform active:scale-[.98]"
                      style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}
                    >
                      Pagar
                    </button>
                  </div>
                );
              })}
            </WtCard>
          )}
        </div>
      )}

      {/* ── Modal de liquidación ─────────────────────────────────────────── */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,.78)" }}>
          <WtCard className="my-4 w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-extrabold text-tx-hi">Liquidar deuda</h2>
                <p className="mt-0.5 truncate text-[11px] text-tx-mut">
                  {target.concept} · {target.supplier?.name || "Sin proveedor"}
                </p>
              </div>
              <button onClick={() => setTarget(null)} aria-label="Cerrar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-tx-mut" style={{ background: "var(--surf-2)" }}>
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-2xl p-4 text-center" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <p className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Monto a pagar</p>
              <p className="font-display text-3xl font-extrabold tabular-nums text-tx-hi">{money(target.amount)}</p>
            </div>

            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Método de pago</div>
            <div className="flex flex-col gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold"
                    style={{
                      background: active ? "var(--iris-soft)" : "var(--surf-2)",
                      border: `1.5px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                      color: "var(--tx)",
                    }}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "var(--surf-3)", color: m.color }}>
                      <Icon size={15} />
                    </span>
                    {m.label}
                    {active && <CheckCircle2 size={16} className="ml-auto text-[color:var(--brand-primary)]" />}
                  </button>
                );
              })}
            </div>

            {method === "CASH_DRAWER" && (
              <p className="mt-3 text-[11px] text-tx-mut">
                Saldrá del efectivo del turno abierto y aparecerá como gasto en el corte de hoy.
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <PrimaryBtn ghost onClick={() => setTarget(null)}>Cancelar</PrimaryBtn>
              <PrimaryBtn type="button" disabled={saving} onClick={confirmPay}>
                {saving ? "Pagando…" : "Confirmar pago"}
              </PrimaryBtn>
            </div>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}
