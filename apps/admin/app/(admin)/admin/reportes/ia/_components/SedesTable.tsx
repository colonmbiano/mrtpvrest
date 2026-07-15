"use client";
import { MapPin } from "lucide-react";
import { DataTable, Pill, ProgressBar, TONE_FG, type Col } from "@/components/ds";
import { formatMoney, formatNumber } from "@/lib/format";
import { DeltaPill } from "./DeltaPill";
import type { SedeRow } from "./types";

/* Desempeño por sede (GET /api/dashboard/sales-by-location).
   La barra de "vs Mes ant." es proporcional a las ventas de la mejor sede. */
export function SedesTable({ sedes, loading }: { sedes: SedeRow[]; loading: boolean }) {
  const maxSales = Math.max(1, ...sedes.map((s) => s.sales));

  const columns: Col<SedeRow>[] = [
    {
      key: "name",
      header: "Sede",
      render: (s) => {
        const up = s.delta >= 0;
        const alert = s.delta <= -10;
        return (
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: alert ? TONE_FG.warn : up ? TONE_FG.ok : TONE_FG.ac }}
            />
            <span className="font-semibold text-tx-hi">{s.name}</span>
            {alert && <Pill tone="warn">ATENCIÓN</Pill>}
          </div>
        );
      },
    },
    {
      key: "sales",
      header: "Ventas",
      render: (s) => <span className="font-mono font-semibold text-tx-hi">{formatMoney(s.sales ?? 0, false)}</span>,
    },
    {
      key: "delta",
      header: "vs Mes ant.",
      width: "200px",
      hideBelowMd: true,
      render: (s) => {
        const up = s.delta >= 0;
        const pct = Math.min(100, Math.round((s.sales / maxSales) * 100));
        return (
          <div className="flex min-w-[180px] items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <ProgressBar pct={pct} tone={up ? "ok" : "err"} height={4} />
            </div>
            <DeltaPill up={up}>
              {up ? "↑" : "↓"} {Math.abs(Number(s.delta ?? 0)).toFixed(1)}%
            </DeltaPill>
          </div>
        );
      },
    },
    {
      key: "orders",
      header: "Pedidos",
      hideBelowMd: true,
      render: (s) => <span className="font-mono font-semibold text-tx-hi">{formatNumber(s.orders ?? 0)}</span>,
    },
    {
      key: "avgTicket",
      header: "Ticket prom.",
      hideBelowMd: true,
      render: (s) => (
        <span className="font-mono font-semibold text-tx-hi">${(s.avgTicket ?? 0).toLocaleString("es-MX")}</span>
      ),
    },
    {
      key: "margin",
      header: "Margen",
      hideBelowMd: true,
      render: () => <span className="font-mono font-semibold text-tx-mut">—</span>,
    },
  ];

  return (
    <DataTable<SedeRow>
      columns={columns}
      rows={sedes}
      rowKey={(s) => s.id}
      loading={loading}
      empty={{ icon: MapPin, title: "Sin pedidos en este período", hint: "Cuando haya ventas, verás aquí el desempeño por sede." }}
    />
  );
}
