"use client";
import { useCallback, useEffect, useState } from "react";
import { Wallet, Users, HandCoins, Plus, Ban } from "lucide-react";
import api from "@/lib/api";
import {
  Card, SectionLabel, Segmented, Input, Select, Button, Pill,
  StatTile, EmptyState, LoadingCards, useToast, useConfirm,
} from "@/components/ds";
import { ROLE_LABEL, CHARGE_TYPE_LABEL, fmtDate, mxn } from "./shared";

export function CuentasPanel({ locationId }: { locationId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [balance, setBalance] = useState<any>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState("ADVANCE");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = locationId ? { locationId } : {};
    try {
      const [b, c] = await Promise.all([
        api.get("/api/payroll/charges/balance", { params }),
        api.get("/api/payroll/charges", { params: { ...params, status: "PENDING", limit: 100 } }),
      ]);
      setBalance(b.data);
      setCharges(Array.isArray(c.data) ? c.data : []);
    } catch {
      toast.error("No pudimos cargar las cuentas");
    } finally {
      setLoading(false);
    }
  }, [locationId, toast]);
  useEffect(() => { load(); }, [load]);

  const addCharge = async () => {
    const amt = Number(amount);
    if (!empId || !Number.isFinite(amt) || amt === 0) { toast.error("Elige empleado y un monto válido"); return; }
    setSaving(true);
    try {
      await api.post("/api/payroll/charges", { employeeId: empId, type, amount: amt, note: note || undefined });
      setAmount(""); setNote("");
      toast.success("Movimiento registrado");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  };

  const cancelCharge = async (id: string) => {
    if (!(await confirm({ title: "¿Anular este cargo pendiente?", danger: true, confirmLabel: "Anular" }))) return;
    try {
      await api.post(`/api/payroll/charges/${id}/cancel`, {});
      toast.success("Cargo anulado");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo anular");
    }
  };

  if (loading) return <LoadingCards count={4} />;

  const employees: any[] = balance?.employees || [];
  const withBalance = employees.filter((e) => Math.abs(Number(e.pending)) > 0.001);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Wallet} value={mxn(balance?.totalPending || 0)} label="Saldo pendiente total" />
        <StatTile icon={Users} value={withBalance.length} label="Empleados con saldo" />
        <StatTile icon={HandCoins} value={charges.length} label="Cargos pendientes" />
      </div>

      {/* Alta de anticipo / ajuste manual */}
      <Card className="p-4 md:p-5">
        <SectionLabel>Registrar anticipo o ajuste</SectionLabel>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] text-tx-mut">Empleado</span>
            <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">Selecciona…</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>{e.name}</option>
              ))}
            </Select>
          </label>
          <div className="w-52">
            <span className="mb-1 block text-[11px] text-tx-mut">Tipo</span>
            <Segmented
              options={[{ value: "ADVANCE", label: "Anticipo" }, { value: "ADJUSTMENT", label: "Ajuste" }]}
              value={type}
              onChange={(v) => setType(v)}
            />
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] text-tx-mut">Monto</span>
            <Input
              type="number" step="0.01" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              className="w-32 text-right"
            />
          </label>
          <label className="block min-w-[160px] flex-1">
            <span className="mb-1 block text-[11px] text-tx-mut">Nota (opcional)</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo…" />
          </label>
          <Button icon={Plus} disabled={saving} onClick={addCharge}>
            {saving ? "…" : "Registrar"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-tx-mut">
          El saldo pendiente se descuenta automáticamente del neto de la raya y se liquida al marcarla pagada.
          “Ajuste” admite monto negativo (saldo a favor del empleado).
        </p>
      </Card>

      {/* Saldo por empleado */}
      <div>
        <SectionLabel>Saldo por empleado</SectionLabel>
        {withBalance.length === 0 ? (
          <EmptyState icon={HandCoins} title="Sin saldos pendientes" hint="Los consumos a cuenta del TPV y los anticipos aparecen aquí hasta que se liquidan en la raya." />
        ) : (
          <div className="space-y-2">
            {withBalance.map((e) => (
              <Card key={e.employeeId} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-tx">{e.name}</div>
                  <div className="mt-0.5 text-[11px] text-tx-mut">{ROLE_LABEL[e.role] || e.role}</div>
                </div>
                <div className="w-28 text-right font-display text-lg font-extrabold" style={{ color: Number(e.pending) < 0 ? "var(--ok)" : "var(--tx-hi)" }}>
                  {mxn(e.pending)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Cargos pendientes */}
      <div>
        <SectionLabel>Cargos pendientes</SectionLabel>
        {charges.length === 0 ? (
          <EmptyState icon={Wallet} title="Sin cargos pendientes" hint="Aún no hay consumos ni anticipos por descontar." />
        ) : (
          <div className="space-y-2">
            {charges.map((c) => (
              <Card key={c.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-tx">{c.employeeName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-tx-mut">
                    <Pill tone="neutral">{CHARGE_TYPE_LABEL[c.type] || c.type}</Pill>
                    <span>{fmtDate(c.createdAt)}</span>
                    {c.order?.orderNumber && <span>· Orden #{c.order.orderNumber}</span>}
                    {c.note && <span className="truncate">· {c.note}</span>}
                  </div>
                </div>
                <div className="w-24 text-right font-display text-base font-extrabold tabular-nums text-tx-hi">{mxn(c.amount)}</div>
                <Button variant="danger" icon={Ban} onClick={() => cancelCharge(c.id)}>Anular</Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
