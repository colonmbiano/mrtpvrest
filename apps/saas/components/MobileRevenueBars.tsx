"use client";

// Revenue por plan — SOLO móvil (en desktop se usa MrrChart). Datos REALES:
// MRR actual por plan (suma de priceSnapshot de suscripciones activas),
// proveniente de /api/saas/mrr → byPlan. Usa variables de tema (claro/oscuro).

interface PlanMrr { count: number; mrr: number; displayName?: string }

const COLORS = ["var(--orange)", "var(--blue)", "var(--green)", "var(--amber)", "var(--text3)"];

export default function MobileRevenueBars({ byPlan = {} }: { byPlan?: Record<string, PlanMrr> }) {
  const entries = Object.entries(byPlan)
    .map(([key, v]) => ({ label: v.displayName || key, mrr: v.mrr || 0, count: v.count || 0 }))
    .filter((e) => e.mrr > 0)
    .sort((a, b) => b.mrr - a.mrr);

  const max = entries.length ? entries[0].mrr : 0;

  return (
    <div
      className="md:hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 13,
        padding: 16,
        marginTop: 16,
      }}
    >
      <h3 style={{
        fontSize: 10, fontWeight: 800, textTransform: "uppercase",
        letterSpacing: "1.5px", color: "var(--text3)", marginBottom: 16,
      }}>
        Revenue por plan
      </h3>

      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text3)", padding: "8px 0" }}>
          Sin suscripciones activas todavía.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {entries.map((item, i) => (
            <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>
                  {item.label}
                  <span style={{ color: "var(--text3)", fontWeight: 500 }}> · {item.count}</span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  ${Math.round(item.mrr).toLocaleString("en-US")}
                </span>
              </div>
              <div style={{ height: 8, background: "var(--surface3)", borderRadius: 999, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 999,
                    width: `${max > 0 ? Math.max(4, Math.round((item.mrr / max) * 100)) : 0}%`,
                    background: COLORS[i % COLORS.length],
                    transition: "width 1s ease",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
