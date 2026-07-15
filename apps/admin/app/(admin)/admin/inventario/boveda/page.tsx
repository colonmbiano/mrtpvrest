"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Vault, ArrowDownLeft, ArrowUpRight, ShoppingCart, Banknote, CreditCard,
  CalendarRange, AlertTriangle,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, Button, StatTile,
  EmptyState, Skeleton, Pill, Modal, Field, Input, Segmented, Textarea, useToast,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

// /admin/inventario/boveda · Bóveda: el dinero que ya salió de la caja.
//
// Dos bolsas independientes: efectivo (billetes guardados) y digital (banco).
// El efectivo entra al cerrar turno; lo cobrado con tarjeta y transferencia
// entra a la bolsa digital. De ahí salen las compras que se hacen en tiendas
// días después. El corte del cajero nunca se entera.
// Ver apps/backend/src/lib/vault.js.

type MovementType = "DEPOSIT" | "WITHDRAWAL";
type Channel = "CASH" | "DIGITAL";
type Source = "SHIFT_CLOSE" | "SHIFT_OPEN" | "MANUAL" | "EXPENSE" | "PURCHASE" | "SETTLEMENT";

interface Movement {
  id: string;
  type: MovementType;
  channel: Channel;
  source: Source;
  amount: number;
  balanceAfter: number;
  description: string;
  notes: string | null;
  createdByName: string | null;
  occurredAt: string;
}
interface VaultResp {
  balanceCash: number;
  balanceDigital: number;
  movements: Movement[];
  updatedAt: string | null;
}

interface Bag { deposits: number; withdrawals: number; purchases: number; expenses: number; net: number }
interface Week {
  weekStart: string;
  weekEnd: string;
  cash: Bag;
  digital: Bag;
  spent: number;
  movements: number;
}
interface WeeklyResp { balanceCash: number; balanceDigital: number; weeks: Week[] }

const SOURCE_LABEL: Record<Source, string> = {
  SHIFT_CLOSE: "Cierre de caja",
  SHIFT_OPEN: "Fondo de caja",
  MANUAL: "Manual",
  EXPENSE: "Gasto",
  PURCHASE: "Compra",
  SETTLEMENT: "Liquidación",
};

const CHANNEL_LABEL: Record<Channel, string> = { CASH: "Efectivo", DIGITAL: "Digital" };

const mny = (n: number) => formatMoney(n, false);

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short" });
}
function fmtDayTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function BovedaPage() {
  const toast = useToast();
  const [vault, setVault] = useState<VaultResp | null>(null);
  const [weekly, setWeekly] = useState<WeeklyResp | null>(null);
  const [loading, setLoading] = useState(true);

  // Qué bolsa se está mirando en la tabla semanal y en la lista.
  const [view, setView] = useState<"ALL" | Channel>("ALL");

  // Movimiento manual
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MovementType>("DEPOSIT");
  const [channel, setChannel] = useState<Channel>("CASH");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, w] = await Promise.all([
        api.get<VaultResp>("/api/vault?limit=100"),
        api.get<WeeklyResp>("/api/vault/weekly?weeks=8"),
      ]);
      setVault(v.data);
      setWeekly(w.data);
    } catch {
      setVault({ balanceCash: 0, balanceDigital: 0, movements: [], updatedAt: null });
      setWeekly({ balanceCash: 0, balanceDigital: 0, weeks: [] });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const thisWeek = weekly?.weeks?.[0] ?? null;

  const spentThisWeek = useMemo(() => {
    if (!thisWeek) return 0;
    if (view === "CASH") return thisWeek.cash.purchases + thisWeek.cash.expenses;
    if (view === "DIGITAL") return thisWeek.digital.purchases + thisWeek.digital.expenses;
    return thisWeek.cash.purchases + thisWeek.cash.expenses + thisWeek.digital.purchases + thisWeek.digital.expenses;
  }, [thisWeek, view]);

  const movements = useMemo(() => {
    const list = vault?.movements ?? [];
    return view === "ALL" ? list : list.filter((m) => m.channel === view);
  }, [vault, view]);

  async function submitMovement() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Monto inválido");
    if (!description.trim()) return toast.error("Describe el movimiento");

    setSaving(true);
    try {
      await api.post("/api/vault/movements", {
        type,
        channel,
        amount: amt,
        description: description.trim(),
        notes: notes.trim() || null,
      });
      toast.success(type === "DEPOSIT" ? "Depósito registrado" : "Retiro registrado");
      setOpen(false);
      setAmount(""); setDescription(""); setNotes(""); setType("DEPOSIT"); setChannel("CASH");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  const cash = vault?.balanceCash ?? 0;
  const digital = vault?.balanceDigital ?? 0;
  const negative = [cash < 0 && "efectivo", digital < 0 && "digital"].filter(Boolean) as string[];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Inventario"
        title="Bóveda"
        subtitle="El dinero del negocio que ya salió de la caja. De aquí salen las compras que haces en tiendas."
        backHref="/admin/inventario"
        actions={<Button icon={Banknote} onClick={() => setOpen(true)}>Depósito o retiro</Button>}
        mobileActions={<Button full icon={Banknote} onClick={() => setOpen(true)}>Depósito o retiro</Button>}
      />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* Un saldo negativo no es un error de cálculo: significa que se pagó
              con dinero que nunca se registró como depósito. */}
          {negative.length > 0 && (
            <Card className="mb-4 flex items-start gap-3 p-4" style={{ borderColor: "var(--warn)" }}>
              <AlertTriangle size={18} style={{ color: "var(--warn)" }} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-bold text-tx-hi">
                  El saldo {negative.join(" y ")} está en negativo
                </div>
                <p className="mt-1 text-[12.5px] text-tx-mut">
                  Se pagó más de lo que entró a esa bolsa. Falta capturar un depósito, o se usó dinero
                  de otra parte. Regístralo con “Depósito o retiro”.
                </p>
              </div>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <StatTile icon={Banknote} value={mny(cash)} label="Efectivo acumulado" />
            <StatTile icon={CreditCard} value={mny(digital)} label="Saldo digital (banco)" />
            <StatTile icon={Vault} value={mny(cash + digital)} label="Total en bóveda" />
            <StatTile icon={ShoppingCart} value={mny(spentThisWeek)} label="Gastado esta semana" />
          </div>

          {/* ── Corte semanal ── */}
          <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <CalendarRange size={15} className="text-tx-mut" />
              <span className="text-sm font-bold text-tx-hi">Corte semanal</span>
              <Pill tone="neutral">últimas 8 semanas</Pill>
            </div>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "ALL" as const, label: "Ambas" },
                { value: "CASH" as const, label: "Efectivo" },
                { value: "DIGITAL" as const, label: "Digital" },
              ]}
            />
          </div>

          {(weekly?.weeks?.length ?? 0) === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Sin movimientos todavía"
              hint="Al cerrar el primer turno, el efectivo contado y los cobros digitales entrarán a la bóveda."
            />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--bd-1)" }}>
                    <Th>Semana</Th>
                    <Th align="right">Entradas</Th>
                    <Th align="right">Salidas</Th>
                    <Th align="right">Compras</Th>
                    <Th align="right">Gastos</Th>
                    <Th align="right">Neto</Th>
                  </tr>
                </thead>
                <tbody>
                  {weekly!.weeks.map((w) => {
                    // "Ambas" suma las dos bolsas; si no, se lee solo la elegida.
                    const bag: Bag = view === "CASH" ? w.cash
                      : view === "DIGITAL" ? w.digital
                      : {
                          deposits: w.cash.deposits + w.digital.deposits,
                          withdrawals: w.cash.withdrawals + w.digital.withdrawals,
                          purchases: w.cash.purchases + w.digital.purchases,
                          expenses: w.cash.expenses + w.digital.expenses,
                          net: w.cash.net + w.digital.net,
                        };
                    return (
                      <tr key={w.weekStart} className="border-b last:border-0" style={{ borderColor: "var(--bd-1)" }}>
                        <Td>
                          <span className="font-semibold text-tx-hi">{fmtDay(w.weekStart)}</span>
                          <span className="text-tx-mut"> – {fmtDay(w.weekEnd)}</span>
                        </Td>
                        <Td align="right" mono style={{ color: "var(--ok)" }}>{bag.deposits > 0 ? mny(bag.deposits) : "—"}</Td>
                        <Td align="right" mono style={{ color: "var(--err)" }}>{bag.withdrawals > 0 ? mny(bag.withdrawals) : "—"}</Td>
                        <Td align="right" mono>{bag.purchases > 0 ? mny(bag.purchases) : "—"}</Td>
                        <Td align="right" mono>{bag.expenses > 0 ? mny(bag.expenses) : "—"}</Td>
                        <Td align="right" mono style={{ color: bag.net < 0 ? "var(--err)" : "var(--tx-hi)" }}>
                          {mny(bag.net)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* ── Movimientos ── */}
          <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-sm font-bold text-tx-hi">Movimientos</span>
            <span className="text-[12px] text-tx-mut">{movements.length} más recientes</span>
          </div>

          {movements.length === 0 ? (
            <EmptyState icon={Vault} title="Sin movimientos" hint="Aún no hay entradas ni salidas registradas en esta bolsa." />
          ) : (
            <div className="space-y-2">
              {movements.map((m) => {
                const isIn = m.type === "DEPOSIT";
                const ChannelIcon = m.channel === "CASH" ? Banknote : CreditCard;
                return (
                  <Card key={m.id} className="flex items-center gap-3 p-3.5">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-ds-md"
                      style={{ background: isIn ? "var(--ok-soft)" : "var(--err-soft)", color: isIn ? "var(--ok)" : "var(--err)" }}
                    >
                      {isIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-tx-hi">{m.description}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-tx-mut">
                        <span className="inline-flex items-center gap-1">
                          <ChannelIcon size={11} /> {CHANNEL_LABEL[m.channel]}
                        </span>
                        <Pill tone="neutral">{SOURCE_LABEL[m.source]}</Pill>
                        <span>{fmtDayTime(m.occurredAt)}</span>
                        {m.createdByName && <span>· {m.createdByName}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[14px] font-bold" style={{ color: isIn ? "var(--ok)" : "var(--err)" }}>
                        {isIn ? "+" : "−"}{mny(m.amount)}
                      </div>
                      <div className="font-mono text-[11px] text-tx-mut">saldo {mny(m.balanceAfter)}</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Movimiento manual"
        subtitle="Dinero que entra o sale de la bóveda sin pasar por un turno ni una compra."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submitMovement} loading={saving} disabled={saving}>
              {type === "DEPOSIT" ? "Depositar" : "Retirar"}
            </Button>
          </>
        }
      >
        <Field label="Tipo">
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: "DEPOSIT" as const, label: "Depósito" },
              { value: "WITHDRAWAL" as const, label: "Retiro" },
            ]}
          />
        </Field>
        <Field label="Bolsa" hint="El efectivo y el saldo del banco se llevan por separado.">
          <Segmented
            value={channel}
            onChange={setChannel}
            options={[
              { value: "CASH" as const, label: "Efectivo" },
              { value: "DIGITAL" as const, label: "Digital" },
            ]}
          />
        </Field>
        <Field label="Monto" required>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="0.00"
          />
        </Field>
        <Field label="Descripción" required hint="Ej. “Depósito del dueño”, “Retiro al banco”.">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿De qué es este movimiento?" />
        </Field>
        <Field label="Notas">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
        {type === "WITHDRAWAL" && (
          <p className="text-[12px] text-tx-mut">
            Un retiro solo baja el saldo de la bóveda. No afecta el corte de ningún turno.
          </p>
        )}
      </Modal>
    </PageShell>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-3 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut ${align === "right" ? "text-right" : ""}`}>
      {children}
    </th>
  );
}
function Td({
  children, align = "left", mono = false, style,
}: {
  children: React.ReactNode; align?: "left" | "right"; mono?: boolean; style?: React.CSSProperties;
}) {
  return (
    <td
      className={`px-4 py-3 text-[13px] ${align === "right" ? "text-right" : ""} ${mono ? "font-mono tabular-nums" : ""}`}
      style={style}
    >
      {children}
    </td>
  );
}
