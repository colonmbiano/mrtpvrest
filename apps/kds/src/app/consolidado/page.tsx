"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { buildProductionSummary, SummaryItem } from "@/lib/production-summary";

// Consolidado de producción por estación: "12 Papas, 8 Burgers pendientes".
// Fase 1: 100% cliente (deriva de los pedidos polleados de una estación). El
// desglose de combos por componente queda para Fase 2 (el payload de
// /orders/:station no trae los componentes del combo). Autocontenida.

const STATIONS = ["KITCHEN", "GRILL", "FRYER", "BAR"];
const STATION_LABEL: Record<string, string> = {
  KITCHEN: "Cocina", GRILL: "Plancha", FRYER: "Freidora", BAR: "Barra/Bebidas",
};

export default function ConsolidadoPage() {
  const [station, setStation] = useState<string>(STATIONS[0]);
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSummary = useCallback(async (st: string) => {
    try {
      const { data } = await api.get(`/api/kds/orders/${st}`);
      setSummary(buildProductionSummary(Array.isArray(data) ? data : []));
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo cargar el consolidado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary(station);
    const t = setInterval(() => fetchSummary(station), 12_000);
    return () => clearInterval(t);
  }, [station, fetchSummary]);

  const totalPending = summary.reduce((s, i) => s + i.qtyPending, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d10", color: "#e7e9ee", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>📊 Consolidado de producción</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATIONS.map((st) => (
            <button
              key={st}
              onClick={() => setStation(st)}
              style={{
                background: station === st ? "#1f8f5f" : "#1b2330",
                color: station === st ? "#fff" : "#9fb3c8",
                border: `1px solid ${station === st ? "#1f8f5f" : "#2a3542"}`,
                borderRadius: 10, padding: "8px 14px", fontWeight: 700,
              }}
            >
              {STATION_LABEL[st] || st}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "#f87171", fontWeight: 700 }}>{error}</p>}
      {loading ? (
        <p style={{ color: "#7c8aa0" }}>Cargando…</p>
      ) : summary.length === 0 ? (
        <p style={{ color: "#7c8aa0" }}>Nada pendiente en {STATION_LABEL[station] || station}.</p>
      ) : (
        <>
          <p style={{ color: "#7c8aa0", marginBottom: 10, fontSize: 13 }}>{totalPending} piezas pendientes</p>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {summary.map((s) => (
              <div key={s.menuItemId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#11161d", border: "1px solid #232c38", borderRadius: 14, padding: "14px 16px" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
                <span style={{ fontWeight: 900, fontSize: 26, color: "#34d399" }}>{s.qtyPending}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
