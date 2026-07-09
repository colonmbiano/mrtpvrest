"use client";
import { ROLE_LABEL, PAY_TYPE_LABEL, mxn } from "./shared";

export function PreviewTable({ items }: { items: any[] }) {
  return (
    <div className="ds-scrollbar overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-tx-dim" style={{ borderBottom: "1px solid var(--bd-1)" }}>
            <th className="px-4 py-3 font-semibold">Empleado</th>
            <th className="px-3 py-3 font-semibold">Esquema</th>
            <th className="px-3 py-3 text-right font-semibold">Días</th>
            <th className="px-3 py-3 text-right font-semibold">Tarifa</th>
            <th className="px-4 py-3 text-right font-semibold">Neto</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.employeeId} style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <td className="px-4 py-3">
                <div className="font-semibold text-tx">{it.employeeName}</div>
                <div className="text-[11px] text-tx-mut">
                  {ROLE_LABEL[it.role] || it.role}
                  {it.needsProfile && <span className="ml-1" style={{ color: "var(--warn)" }}>· sin tarifa</span>}
                </div>
              </td>
              <td className="px-3 py-3 text-tx-mut">{PAY_TYPE_LABEL[it.payType] || it.payType}</td>
              <td className="px-3 py-3 text-right tabular-nums text-tx">{it.daysWorked}</td>
              <td className="px-3 py-3 text-right tabular-nums text-tx-mut">{mxn(it.rate)}</td>
              <td className="px-4 py-3 text-right font-display font-extrabold tabular-nums text-tx-hi">{mxn(it.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
