"use client";
import { useCallback, useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell,
  PageHeader,
  PageTabs,
  Segmented,
  Chips,
  DataTable,
  ErrorState,
  type Col,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

// Reportes por dimensión: Canal (orderType), Variantes, Extras (modificadores) y
// Combos. Cada cifra es el INGRESO ATRIBUIBLE a esa dimensión (no ventas totales:
// el subtotal ya incluye priceAdd y precios de variante; no sumar las 4 tablas).

type Dim = "canal" | "variantes" | "extras" | "combos";
const TABS: { key: Dim; label: string; endpoint: string }[] = [
  { key: "canal",     label: "Canal",     endpoint: "/api/reports/by-channel" },
  { key: "variantes", label: "Variantes", endpoint: "/api/reports/by-variant" },
  { key: "extras",    label: "Extras",    endpoint: "/api/reports/by-modifier" },
  { key: "combos",    label: "Combos",    endpoint: "/api/reports/by-combo" },
];
const PERIODS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  DELIVERY: "Domicilio", TAKEOUT: "Para llevar", DINE_IN: "En mesa", PICKUP: "Recoger",
};

export default function DimensionesPage() {
  const [tab, setTab] = useState<Dim>("canal");
  const [days, setDays] = useState<string>("30");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const t = TABS.find((x) => x.key === tab)!;
    try {
      const { data } = await api.get(`${t.endpoint}?days=${days}`);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, days]);

  useEffect(() => { load(); }, [load]);

  const dimHeader = tab === "canal" ? "Canal" : tab === "variantes" ? "Variante" : tab === "extras" ? "Extra" : "Combo";
  const countHeader = tab === "extras" ? "Veces" : tab === "canal" ? "Pedidos" : "Unidades";

  const columns: Col<any>[] = [
    {
      key: "label",
      header: dimHeader,
      render: (r) => (
        <span className="font-semibold text-tx">
          {tab === "canal" ? (CHANNEL_LABEL[r.channel] || r.channel) : tab === "variantes" ? r.variant : r.name}
        </span>
      ),
    },
    {
      key: "count",
      header: countHeader,
      align: "right",
      mono: true,
      render: (r) => (
        <span className="text-tx-mut">
          {(tab === "canal" ? r.orders : tab === "extras" ? r.count : r.units) ?? 0}
        </span>
      ),
    },
    {
      key: "revenue",
      header: "Ingreso",
      align: "right",
      mono: true,
      render: (r) => <span className="font-bold text-tx">{formatMoney(Number(r.revenue || 0))}</span>,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reportes · Dimensiones"
        title="Reportes por dimensión"
        subtitle="Ingreso atribuible por canal, variante, extra y combo"
      />
      <PageTabs set="reportes" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={TABS.map((t) => ({ value: t.key, label: t.label }))}
          value={tab}
          onChange={(k) => setTab(k)}
        />
        <Chips
          options={PERIODS}
          value={days}
          onChange={(k) => setDays(k)}
        />
      </div>

      {error ? (
        <ErrorState title="No pudimos cargar el reporte" onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_, i) => i}
          loading={loading}
          empty={{ icon: BarChart3, title: "Sin datos", hint: "No hay ventas en este período para esta dimensión." }}
        />
      )}

      <p className="mt-3 text-xs text-tx-mut">
        Cada cifra es el <strong>ingreso atribuible</strong> a esa dimensión, no las ventas totales (el subtotal ya
        incluye extras y variantes). No sumes las cuatro tablas como si fueran independientes.
      </p>
    </PageShell>
  );
}
