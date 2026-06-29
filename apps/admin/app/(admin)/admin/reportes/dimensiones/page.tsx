"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { WtScreen, PageHeader, WtCard, SectionTabs, EmptyState, money } from "@/components/warmtech";
import { BarChart3 } from "lucide-react";

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
  { key: "7", label: "7 días" },
  { key: "30", label: "30 días" },
  { key: "90", label: "90 días" },
];

const CHANNEL_LABEL: Record<string, string> = {
  DELIVERY: "Domicilio", TAKEOUT: "Para llevar", DINE_IN: "En mesa", PICKUP: "Recoger",
};

export default function DimensionesPage() {
  const [tab, setTab] = useState<Dim>("canal");
  const [days, setDays] = useState("30");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const t = TABS.find((x) => x.key === tab)!;
    try {
      const { data } = await api.get(`${t.endpoint}?days=${days}`);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, days]);

  useEffect(() => { load(); }, [load]);

  return (
    <WtScreen>
      <PageHeader title="Reportes por dimensión" subtitle="Ingreso atribuible por canal, variante, extra y combo" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTabs
          tabs={TABS.map((t) => ({ value: t.key, label: t.label }))}
          value={tab}
          onChange={(k) => setTab(k)}
        />
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setDays(p.key)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold"
              style={days === p.key
                ? { background: "var(--brand-primary)", color: "#fff" }
                : { background: "var(--surf-2)", color: "var(--tx-mut)", border: "1px solid var(--bd-1)" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <WtCard className="p-0 overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-sm text-tx-mut">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="Sin datos" hint="No hay ventas en este período para esta dimensión." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--bd-1)" }}>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                  {tab === "canal" ? "Canal" : tab === "variantes" ? "Variante" : tab === "extras" ? "Extra" : "Combo"}
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                  {tab === "extras" ? "Veces" : tab === "canal" ? "Pedidos" : "Unidades"}
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const label = tab === "canal" ? (CHANNEL_LABEL[r.channel] || r.channel)
                  : tab === "variantes" ? r.variant
                  : r.name;
                const count = tab === "canal" ? r.orders : tab === "extras" ? r.count : r.units;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                    <td className="px-4 py-2.5 font-semibold text-tx">{label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-tx-mut">{count ?? 0}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-tx">{money(Number(r.revenue || 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </WtCard>

      <p className="mt-3 text-xs text-tx-mut">
        Cada cifra es el <strong>ingreso atribuible</strong> a esa dimensión, no las ventas totales (el subtotal ya
        incluye extras y variantes). No sumes las cuatro tablas como si fueran independientes.
      </p>
    </WtScreen>
  );
}
