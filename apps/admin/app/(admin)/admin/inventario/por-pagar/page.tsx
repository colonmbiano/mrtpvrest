"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Receipt, ShoppingCart, CalendarClock,
  AlertTriangle, Banknote, CreditCard, ArrowLeftRight, CheckCircle2, Factory, Repeat,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Toolbar, Card, Button, StatTile,
  EmptyState, Skeleton, Pill, IconBadge, Modal, Field, Input, useToast,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

// /admin/inventario/por-pagar · Cuentas por pagar con saldos, pagos parciales,
// vencimientos, estado de cuenta por proveedor y acceso a recurrentes.

interface Supplier { id: string; name: string }
interface Category { id: string; name: string; icon: string; color: string | null }
interface Payable {
  kind: "EXPENSE" | "PURCHASE";
  id: string;
  concept: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  dueDate: string | null;
  supplier: Supplier | null;
  category: Category | null;
  occurredAt: string;
  settleUrl: string;
}
interface PayablesResp { items: Payable[]; total: number; count: number }

type Method = "CASH_DRAWER" | "CORPORATE_CARD" | "TRANSFER";
const METHODS: { value: Method; label: string; icon: typeof Banknote; color: string }[] = [
  { value: "CASH_DRAWER", label: "Efectivo de caja", icon: Banknote, color: "var(--warn)" },
  { value: "TRANSFER", label: "Transferencia", icon: ArrowLeftRight, color: "var(--brand-primary)" },
  { value: "CORPORATE_CARD", label: "Tarjeta corporativa", icon: CreditCard, color: "var(--info)" },
];

const mny = (n: number) => formatMoney(n, false);
function startOfToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); }
function fmtDay(iso: string | null) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" });
}
const isOverdue = (p: Payable) => !!p.dueDate && new Date(p.dueDate).getTime() < startOfToday();
const dueSoon = (p: Payable) => !!p.dueDate && !isOverdue(p) && new Date(p.dueDate).getTime() < startOfToday() + 7 * 86400000;

export default function PorPagarPage() {
  const toast = useToast();
  const [data, setData] = useState<PayablesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Pago
  const [target, setTarget] = useState<Payable | null>(null);
  const [method, setMethod] = useState<Method>("CASH_DRAWER");
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // Estado de cuenta
  const [stmtSupplier, setStmtSupplier] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PayablesResp>("/api/payables");
      setData(data);
    } catch {
      setData({ items: [], total: 0, count: 0 });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const overdue = useMemo(() => {
    const items = data?.items ?? [];
    const o = items.filter(isOverdue);
    const s = items.filter(dueSoon);
    return {
      overdueCount: o.length, overdueTotal: o.reduce((a, b) => a + b.remaining, 0),
      soonCount: s.length, soonTotal: s.reduce((a, b) => a + b.remaining, 0),
    };
  }, [data]);

  function openPay(p: Payable) {
    setTarget(p);
    setMethod("CASH_DRAWER");
    setPayAmount(String(p.remaining));
  }

  async function confirmPay() {
    if (!target) return;
    const raw = Number(payAmount);
    if (!Number.isFinite(raw) || raw <= 0) return;
    // Nunca enviar más que el saldo (el backend igual lo capa, pero evitamos
    // confundir al cajero con un "pago" mayor al adeudo).
    const amt = Math.min(raw, target.remaining);
    setSaving(true);
    try {
      await api.post(target.settleUrl, { paymentMethod: method, amount: amt });
      setTarget(null);
      await load();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "No se pudo registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  async function generateRecurring() {
    setGenerating(true);
    try {
      const { data } = await api.post<{ generated: number }>("/api/payables/recurring/run", {});
      await load();
      if (data.generated > 0) toast.success(`Se generaron ${data.generated} cuenta(s) por pagar.`);
      else toast.info("No hay recurrentes vencidos por generar.");
    } catch {
      toast.error("No se pudieron generar los recurrentes.");
    } finally {
      setGenerating(false);
    }
  }

  const items = data?.items ?? [];
  const payAmt = Number(payAmount) || 0;
  const isAbono = !!target && payAmt > 0 && payAmt < target.remaining - 0.005;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Finanzas · Por pagar"
        title="Cuentas por pagar"
        subtitle="Deudas pendientes de pago a proveedores"
      />
      <PageTabs set="finanzas" />

      <Toolbar
        actions={
          <Button variant="secondary" icon={Repeat} onClick={generateRecurring} loading={generating}>
            Generar recurrentes
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-ds-lg" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={Wallet} value={mny(data?.total ?? 0)} label="Total por pagar" />
            <StatTile icon={Receipt} value={data?.count ?? 0} label="Cuentas pendientes" />
            <StatTile icon={AlertTriangle} value={mny(overdue.overdueTotal)} label={`Vencidas · ${overdue.overdueCount}`} />
            <StatTile icon={CalendarClock} value={mny(overdue.soonTotal)} label={`Por vencer 7d · ${overdue.soonCount}`} />
          </div>

          {items.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Todo al corriente" hint="No hay gastos ni compras pendientes de pago." />
          ) : (
            <Card className="overflow-hidden">
              {items.map((it, idx) => {
                const od = isOverdue(it);
                const soon = dueSoon(it);
                const hasAbono = it.paidAmount > 0.005;
                const Icon = it.kind === "PURCHASE" ? ShoppingCart : Receipt;
                return (
                  <div key={`${it.kind}-${it.id}`} className="flex items-center gap-3 px-3.5 py-3"
                    style={idx === items.length - 1 ? {} : { borderBottom: "1px solid var(--bd-1)" }}>
                    <IconBadge icon={Icon} tone={it.kind === "PURCHASE" ? "info" : "ac"} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold text-tx-hi">{it.concept}</span>
                        {od && <Pill tone="err">Vencida</Pill>}
                        {soon && <Pill tone="warn">Por vencer</Pill>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-tx-mut">
                        {it.supplier ? (
                          <button type="button" onClick={() => setStmtSupplier(it.supplier)} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                            <Factory size={11} /> {it.supplier.name}
                          </button>
                        ) : (<><Factory size={11} /> Sin proveedor</>)}
                        <span className="text-tx-dim">·</span>
                        <CalendarClock size={11} />
                        <span className={od ? "font-semibold" : ""} style={od ? { color: "var(--err)" } : undefined}>{fmtDay(it.dueDate)}</span>
                      </div>
                      {hasAbono && (
                        <div className="mt-1 text-[10.5px] text-tx-dim">abonado {mny(it.paidAmount)} de {mny(it.amount)}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm font-bold tabular-nums text-tx-hi">{mny(it.remaining)}</div>
                      {hasAbono && <div className="text-[10px] text-tx-dim">restante</div>}
                    </div>
                    <Button variant="primary" size="sm" onClick={() => openPay(it)}>Pagar</Button>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* ── Modal de pago (total o abono) ───────────────────────────────── */}
      {target && (
        <Modal
          open
          onClose={() => setTarget(null)}
          size="sm"
          title={isAbono ? "Abonar a deuda" : "Liquidar deuda"}
          subtitle={`${target.concept} · ${target.supplier?.name || "Sin proveedor"}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTarget(null)}>Cancelar</Button>
              <Button type="button" disabled={payAmt <= 0} loading={saving} onClick={confirmPay}>
                {saving ? "Pagando…" : isAbono ? `Abonar ${mny(payAmt)}` : "Confirmar pago"}
              </Button>
            </>
          }
        >
          <div className="mb-4 rounded-ds-md p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <div className="mb-2 flex items-center justify-between text-[11px] text-tx-mut">
              <span>Saldo pendiente</span><span className="font-mono font-bold text-tx-hi">{mny(target.remaining)}</span>
            </div>
            <Field label="Monto a pagar" className="mb-0">
              <div className="flex items-center gap-2">
                <Input type="number" step="0.01" min="0" max={target.remaining} value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)} autoFocus className="flex-1" />
                <Button variant="secondary" size="sm" onClick={() => setPayAmount(String(target.remaining))}>Todo</Button>
              </div>
            </Field>
            {isAbono && <p className="mt-2 text-[11px]" style={{ color: "var(--warn)" }}>Abono parcial — quedará {mny(target.remaining - payAmt)} pendiente.</p>}
          </div>

          <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Método de pago</div>
          <div className="flex flex-col gap-2">
            {METHODS.map((m) => {
              const Icon = m.icon; const active = method === m.value;
              return (
                <button key={m.value} type="button" onClick={() => setMethod(m.value)}
                  className="flex min-h-12 items-center gap-3 rounded-ds-md px-4 text-sm font-bold"
                  style={{ background: active ? "var(--accent-soft)" : "var(--surf-2)", border: `1.5px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`, color: "var(--tx)" }}>
                  <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "var(--surf-3)", color: m.color }}><Icon size={15} /></span>
                  {m.label}
                  {active && <CheckCircle2 size={16} className="ml-auto" style={{ color: "var(--brand-primary)" }} />}
                </button>
              );
            })}
          </div>
          {method === "CASH_DRAWER" && <p className="mt-3 text-[11px] text-tx-mut">Saldrá del efectivo del turno abierto y entrará al corte de hoy.</p>}
        </Modal>
      )}

      {stmtSupplier && <SupplierStatement supplier={stmtSupplier} onClose={() => setStmtSupplier(null)} />}
    </PageShell>
  );
}

// ── Estado de cuenta por proveedor (modal) ──────────────────────────────────
interface StmtItem { kind: string; id: string; concept: string; amount: number; paidAmount: number; remaining: number; status: string; dueDate: string | null; date: string; settledAt: string | null }
function SupplierStatement({ supplier, onClose }: { supplier: { id: string; name: string }; onClose: () => void }) {
  const [data, setData] = useState<{ pendingTotal: number; items: StmtItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    api.get(`/api/payables/supplier/${supplier.id}`).then((r) => { if (on) setData(r.data); }).catch(() => { if (on) setData({ pendingTotal: 0, items: [] }); }).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [supplier.id]);

  return (
    <Modal open onClose={onClose} size="md" title={supplier.name} subtitle="Estado de cuenta"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <div className="mb-4 rounded-ds-md p-4 text-center" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
        <p className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Le debes</p>
        <p className="font-display text-3xl font-extrabold tabular-nums text-tx-hi">{mny(data?.pendingTotal ?? 0)}</p>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-ds-md" />)}</div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={Receipt} title="Sin movimientos" />
      ) : (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {data!.items.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="flex items-center justify-between gap-3 rounded-ds-md px-3 py-2" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-tx">{it.concept}</p>
                <p className="text-[10.5px] text-tx-mut">{fmtDay(it.date)} · {it.status === "PENDING" ? "pendiente" : "pagado"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-right">
                <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: it.status === "PENDING" ? "var(--warn)" : "var(--ok)" }}>
                  {mny(it.status === "PENDING" ? it.remaining : it.amount)}
                </span>
                {it.status === "PENDING" ? <Pill tone="warn">Debe</Pill> : <Pill tone="ok">Pagado</Pill>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
