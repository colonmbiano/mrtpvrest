"use client";
import { ChevronLeft, Download, Calculator, Check, Wallet, Trash2 } from "lucide-react";
import { Card, Pill, Button } from "@/components/ds";
import { STATUS_META, ROLE_LABEL, PAY_TYPE_LABEL, fmtDate, mxn } from "./shared";
import type { Tone } from "@/components/ds";

export function PeriodDetail({
  period, busy, onBack, onApprove, onPay, onRecompute, onDelete, onExport,
}: {
  period: any; busy: boolean; onBack: () => void;
  onApprove: () => void; onPay: (m: string) => void; onRecompute: () => void; onDelete: () => void; onExport: () => void;
}) {
  const sm = STATUS_META[period.status] || { label: period.status, tone: "neutral" as Tone };
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-primary">
        <ChevronLeft size={14} /> Volver al historial
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="font-display text-2xl font-extrabold text-tx-hi">{fmtDate(period.periodFrom)} — {fmtDate(period.periodTo)}</div>
          <div className="mt-1 flex items-center gap-2">
            <Pill tone={sm.tone}>{sm.label}</Pill>
            <span className="text-sm text-tx-mut">{period.items?.length ?? 0} empleados · <b className="text-tx-hi">{mxn(period.totalNet)}</b></span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} onClick={onExport}>CSV</Button>
          {period.status === "DRAFT" && <Button variant="secondary" icon={Calculator} onClick={onRecompute} disabled={busy}>Recalcular</Button>}
          {period.status === "DRAFT" && <Button icon={Check} onClick={onApprove} disabled={busy}>Aprobar</Button>}
          {period.status !== "PAID" && <Button icon={Wallet} onClick={() => onPay("CASH")} disabled={busy}>Marcar pagada</Button>}
          {period.status !== "PAID" && <Button variant="danger" icon={Trash2} onClick={onDelete} disabled={busy}>Borrar</Button>}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="ds-scrollbar overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-tx-dim" style={{ borderBottom: "1px solid var(--bd-1)" }}>
                <th className="px-4 py-3 font-semibold">Empleado</th>
                <th className="px-3 py-3 font-semibold">Esquema</th>
                <th className="px-3 py-3 text-right font-semibold">Días</th>
                <th className="px-3 py-3 text-right font-semibold">Tarifa</th>
                <th className="px-3 py-3 text-right font-semibold">Bruto</th>
                <th className="px-4 py-3 text-right font-semibold">Neto</th>
              </tr>
            </thead>
            <tbody>
              {(period.items || []).map((it: any) => (
                <tr key={it.id} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-tx">{it.employeeName}</div>
                    <div className="text-[11px] text-tx-mut">{ROLE_LABEL[it.role] || it.role}{it.payMethod ? ` · ${it.payMethod === "CASH" ? "Efectivo" : "Transferencia"}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 text-tx-mut">{PAY_TYPE_LABEL[it.payType] || it.payType}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-tx">{it.daysWorked}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-tx-mut">{mxn(it.rate)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-tx-mut">{mxn(it.gross)}</td>
                  <td className="px-4 py-3 text-right font-display font-extrabold tabular-nums text-tx-hi">{mxn(it.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
