"use client";
// app/(admin)/admin/page.tsx  ← dashboard principal del restaurante
// Coloca en: apps/admin/app/(admin)/admin/page.tsx

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

type Order = {
  id: string;
  orderNumber: number;
  status: "PENDING" | "PREPARING" | "READY" | "DELIVERING" | "DELIVERED" | "CANCELLED";
  type: string;
  total: number;
  createdAt: string;
  items: { name: string; quantity: number }[];
};

type DailyReport = {
  kpis: {
    sales: { today: number; yesterday: number };
    orders: { today: number; yesterday: number };
    avgTicket: { today: number; yesterday: number };
    avgPrepTime: number | null;
  };
  topProducts: { name: string; qty: number; revenue: number }[];
  byChannel: Record<string, number>;
};

const STATUS_CONFIG = {
  PENDING:    { label: "Nuevos",     color: "#3b82f6", bg: "rgba(59,130,246,.08)" },
  PREPARING:  { label: "Preparando", color: "#f59e0b", bg: "rgba(245,158,11,.08)" },
  READY:      { label: "Listos",     color: "#16a34a", bg: "rgba(22,163,74,.08)"  },
  DELIVERING: { label: "En camino",  color: "#8b5cf6", bg: "rgba(139,92,246,.08)" },
  DELIVERED:  { label: "Entregados", color: "#6b7280", bg: "rgba(107,114,128,.06)"},
  CANCELLED:  { label: "Cancelados", color: "#ef4444", bg: "rgba(239,68,68,.06)"  },
};

const ACTIVE_STATUSES = ["PENDING", "PREPARING", "READY", "DELIVERING"] as const;

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function delta(today: number, yesterday: number) {
  if (yesterday === 0) return null;
  const pct = ((today - yesterday) / yesterday) * 100;
  return { pct: Math.abs(pct).toFixed(1), up: pct >= 0 };
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("PENDING");
  const [clock, setClock] = useState("");

  // Reloj
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [ordersRes, reportRes] = await Promise.all([
        api.get("/api/orders?status=active&limit=50"),
        api.get("/api/reports/daily"),
      ]);
      setOrders(ordersRes.data?.orders ?? ordersRes.data ?? []);
      setReport(reportRes.data);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  const byStatus = ACTIVE_STATUSES.reduce((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s);
    return acc;
  }, {} as Record<string, Order[]>);

  const activeOrders = orders.filter((o) =>
    ACTIVE_STATUSES.includes(o.status as any)
  );

  async function updateStatus(orderId: string, status: string) {
    try {
      await api.put(`/api/orders/${orderId}/status`, { status });
      fetchData();
    } catch {}
  }

  const NEXT_STATUS: Record<string, string> = {
    PENDING: "PREPARING",
    PREPARING: "READY",
    READY: "DELIVERING",
    DELIVERING: "DELIVERED",
  };

  const NEXT_LABEL: Record<string, string> = {
    PENDING: "Aceptar",
    PREPARING: "Listo",
    READY: "Enviar",
    DELIVERING: "Entregado",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .adm { font-family: 'Sora', sans-serif; background: #f7f6f3; min-height: 100vh; color: #111; }

        /* TOPBAR */
        .adm-top {
          background: #fff;
          border-bottom: 0.5px solid #e2e1d9;
          padding: 0 28px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .adm-top-left { display: flex; align-items: center; gap: 16px; }
        .adm-title { font-size: 15px; font-weight: 600; letter-spacing: -0.3px; }
        .adm-clock {
          font-size: 12px;
          font-family: 'DM Mono', monospace;
          color: #888;
          background: #f7f6f3;
          padding: 3px 10px;
          border-radius: 20px;
        }
        .live-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: #16a34a;
          background: rgba(22,163,74,.08);
          padding: 3px 10px;
          border-radius: 20px;
        }
        .live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #16a34a;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .refresh-btn {
          background: none;
          border: 0.5px solid #e2e1d9;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-family: 'Sora', sans-serif;
          color: #555;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all .15s;
        }
        .refresh-btn:hover { background: #f7f6f3; }
        .refresh-btn svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; }

        /* CONTENT */
        .adm-content { padding: 24px 28px; }

        /* KPI GRID */
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .kpi {
          background: #fff;
          border: 0.5px solid #e2e1d9;
          border-radius: 12px;
          padding: 18px 20px;
          position: relative;
          overflow: hidden;
        }
        .kpi::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
        }
        .kpi.k1::before { background: #16a34a; }
        .kpi.k2::before { background: #3b82f6; }
        .kpi.k3::before { background: #f59e0b; }
        .kpi.k4::before { background: #e85d28; }
        .kpi-label { font-size: 10px; color: #888; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px; }
        .kpi-val { font-size: 26px; font-weight: 600; letter-spacing: -1px; font-family: 'DM Mono', monospace; line-height: 1; }
        .kpi-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
        .kpi-delta { font-size: 11px; font-family: 'DM Mono', monospace; }
        .up { color: #16a34a; }
        .dn { color: #ef4444; }
        .kpi-sub { font-size: 10px; color: #aaa; }

        /* MAIN GRID */
        .main-grid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }

        /* KANBAN */
        .kanban-card {
          background: #fff;
          border: 0.5px solid #e2e1d9;
          border-radius: 12px;
          overflow: hidden;
        }
        .kanban-head {
          padding: 14px 18px;
          border-bottom: 0.5px solid #e2e1d9;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .kanban-title { font-size: 13px; font-weight: 500; }
        .kanban-count {
          font-size: 11px;
          background: #f7f6f3;
          color: #888;
          padding: 2px 8px;
          border-radius: 20px;
          font-family: 'DM Mono', monospace;
        }

        /* STATUS TABS */
        .status-tabs {
          display: flex;
          gap: 4px;
          padding: 12px 16px;
          border-bottom: 0.5px solid #f0efe9;
          overflow-x: auto;
        }
        .status-tab {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          border: none;
          background: transparent;
          font-family: 'Sora', sans-serif;
          color: #888;
          transition: all .12s;
        }
        .status-tab.active {
          color: var(--tab-color);
          background: var(--tab-bg);
        }
        .tab-count {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          min-width: 16px;
          text-align: center;
        }

        /* ORDER LIST */
        .order-list { padding: 12px; min-height: 300px; }
        .order-card {
          background: #fff;
          border: 0.5px solid #e2e1d9;
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 8px;
          transition: border-color .12s;
        }
        .order-card:hover { border-color: #cccbc2; }
        .order-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .order-id { font-size: 13px; font-weight: 600; font-family: 'DM Mono', monospace; }
        .order-time { font-size: 10px; color: #aaa; font-family: 'DM Mono', monospace; }
        .order-items { font-size: 12px; color: #555; line-height: 1.5; margin-bottom: 8px; }
        .order-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .order-total { font-size: 13px; font-weight: 600; font-family: 'DM Mono', monospace; }
        .order-btn {
          padding: 5px 12px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          background: #111;
          color: #fff;
          font-family: 'Sora', sans-serif;
          transition: background .12s;
        }
        .order-btn:hover { background: #e85d28; }
        .order-type-badge {
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 4px;
          background: #f7f6f3;
          color: #888;
          font-weight: 500;
          letter-spacing: 0.3px;
        }
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 20px;
          color: #aaa;
          font-size: 13px;
          gap: 8px;
        }
        .empty-icon { font-size: 28px; opacity: 0.4; }

        /* RIGHT COLUMN */
        .right-col { display: flex; flex-direction: column; gap: 14px; }

        /* TOP PRODUCTS */
        .side-card {
          background: #fff;
          border: 0.5px solid #e2e1d9;
          border-radius: 12px;
          overflow: hidden;
        }
        .side-head {
          padding: 12px 16px;
          border-bottom: 0.5px solid #e2e1d9;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .side-title { font-size: 12px; font-weight: 500; }
        .side-sub { font-size: 10px; color: #aaa; margin-top: 1px; }
        .prod-row {
          display: flex;
          align-items: center;
          padding: 9px 16px;
          border-bottom: 0.5px solid #f7f6f3;
          gap: 10px;
        }
        .prod-row:last-child { border-bottom: none; }
        .prod-rank { font-size: 10px; font-family: 'DM Mono', monospace; color: #ccc; width: 16px; }
        .prod-name { font-size: 12px; flex: 1; color: #333; }
        .prod-bar-wrap { width: 60px; height: 3px; background: #f0efe9; border-radius: 2px; }
        .prod-bar { height: 3px; background: #111; border-radius: 2px; }
        .prod-qty { font-size: 11px; font-family: 'DM Mono', monospace; color: #888; }

        /* CHANNELS */
        .channel-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          border-bottom: 0.5px solid #f7f6f3;
          font-size: 12px;
        }
        .channel-row:last-child { border-bottom: none; }
        .channel-name { color: #555; }
        .channel-val { font-family: 'DM Mono', monospace; font-weight: 500; }

        /* SKELETON */
        .skel { background: #f0efe9; border-radius: 6px; animation: shimmer 1.2s infinite; }
        @keyframes shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .main-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="adm">
        {/* TOPBAR */}
        <div className="adm-top">
          <div className="adm-top-left">
            <div className="adm-title">Dashboard</div>
            <div className="adm-clock">{clock}</div>
            <div className="live-badge">
              <div className="live-dot" />
              En vivo
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="refresh-btn" onClick={fetchData}>
              <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Actualizar
            </button>
            <button
              className="refresh-btn"
              style={{ background: "#111", color: "#fff", borderColor: "#111" }}
              onClick={() => window.location.href = "/admin/pedidos"}
            >
              + Nuevo pedido
            </button>
          </div>
        </div>

        <div className="adm-content">
          {/* KPIs */}
          <div className="kpi-grid">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="kpi">
                  <div className="skel" style={{ height: 12, width: 80, marginBottom: 12 }} />
                  <div className="skel" style={{ height: 32, width: 120 }} />
                </div>
              ))
            ) : report ? (
              <>
                <div className="kpi k1">
                  <div className="kpi-label">Ventas hoy</div>
                  <div className="kpi-val">${report.kpis.sales.today.toLocaleString()}</div>
                  <div className="kpi-footer">
                    {(() => {
                      const d = delta(report.kpis.sales.today, report.kpis.sales.yesterday);
                      return d ? <span className={`kpi-delta ${d.up ? "up" : "dn"}`}>{d.up ? "▲" : "▼"} {d.pct}% vs ayer</span> : <span className="kpi-sub">Sin datos de ayer</span>;
                    })()}
                    <span className="kpi-sub">MXN</span>
                  </div>
                </div>
                <div className="kpi k2">
                  <div className="kpi-label">Pedidos</div>
                  <div className="kpi-val">{report.kpis.orders.today}</div>
                  <div className="kpi-footer">
                    {(() => {
                      const d = delta(report.kpis.orders.today, report.kpis.orders.yesterday);
                      return d ? <span className={`kpi-delta ${d.up ? "up" : "dn"}`}>{d.up ? "▲" : "▼"} {d.pct}% vs ayer</span> : <span className="kpi-sub">hoy</span>;
                    })()}
                    <span className="kpi-sub">{activeOrders.length} activos</span>
                  </div>
                </div>
                <div className="kpi k3">
                  <div className="kpi-label">Ticket promedio</div>
                  <div className="kpi-val">${report.kpis.avgTicket.today.toFixed(0)}</div>
                  <div className="kpi-footer">
                    {(() => {
                      const d = delta(report.kpis.avgTicket.today, report.kpis.avgTicket.yesterday);
                      return d ? <span className={`kpi-delta ${d.up ? "up" : "dn"}`}>{d.up ? "▲" : "▼"} ${Math.abs(report.kpis.avgTicket.today - report.kpis.avgTicket.yesterday).toFixed(0)}</span> : <span className="kpi-sub">MXN</span>;
                    })()}
                    <span className="kpi-sub">MXN</span>
                  </div>
                </div>
                <div className="kpi k4">
                  <div className="kpi-label">Tiempo prep.</div>
                  <div className="kpi-val">{report.kpis.avgPrepTime ?? "—"}{report.kpis.avgPrepTime ? "m" : ""}</div>
                  <div className="kpi-footer">
                    <span className="kpi-sub">promedio</span>
                    <span className="kpi-sub">min</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* MAIN GRID */}
          <div className="main-grid">
            {/* KANBAN */}
            <div className="kanban-card">
              <div className="kanban-head">
                <div className="kanban-title">Monitor de pedidos en vivo</div>
                <div className="kanban-count">{activeOrders.length} activos</div>
              </div>

              {/* STATUS TABS */}
              <div className="status-tabs">
                {ACTIVE_STATUSES.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      className={`status-tab ${activeTab === s ? "active" : ""}`}
                      style={{ "--tab-color": cfg.color, "--tab-bg": cfg.bg } as React.CSSProperties}
                      onClick={() => setActiveTab(s)}
                    >
                      {cfg.label}
                      <span className="tab-count">{byStatus[s]?.length ?? 0}</span>
                    </button>
                  );
                })}
              </div>

              {/* ORDERS */}
              <div className="order-list">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="order-card">
                      <div className="skel" style={{ height: 14, width: 80, marginBottom: 8 }} />
                      <div className="skel" style={{ height: 12, width: "100%", marginBottom: 6 }} />
                      <div className="skel" style={{ height: 12, width: "60%" }} />
                    </div>
                  ))
                ) : (byStatus[activeTab]?.length ?? 0) === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">✓</div>
                    Sin pedidos en esta categoría
                  </div>
                ) : (
                  byStatus[activeTab]?.map((order) => (
                    <div key={order.id} className="order-card">
                      <div className="order-card-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="order-id">#{order.orderNumber}</div>
                          <div className="order-type-badge">{order.type}</div>
                        </div>
                        <div className="order-time">{timeAgo(order.createdAt)}</div>
                      </div>
                      <div className="order-items">
                        {order.items.slice(0, 3).map((item, i) => (
                          <div key={i}>{item.quantity}× {item.name}</div>
                        ))}
                        {order.items.length > 3 && <div style={{ color: "#aaa" }}>+{order.items.length - 3} más</div>}
                      </div>
                      <div className="order-footer">
                        <div className="order-total">${order.total.toLocaleString()}</div>
                        {NEXT_STATUS[activeTab] && (
                          <button
                            className="order-btn"
                            onClick={() => updateStatus(order.id, NEXT_STATUS[activeTab])}
                          >
                            {NEXT_LABEL[activeTab]}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="right-col">
              {/* TOP PRODUCTS */}
              <div className="side-card">
                <div className="side-head">
                  <div>
                    <div className="side-title">Más vendidos hoy</div>
                    <div className="side-sub">Por unidades</div>
                  </div>
                </div>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="prod-row">
                      <div className="skel" style={{ height: 12, flex: 1 }} />
                    </div>
                  ))
                ) : report?.topProducts?.length ? (
                  report.topProducts.map((p, i) => {
                    const max = report.topProducts[0]?.qty ?? 1;
                    return (
                      <div key={i} className="prod-row">
                        <div className="prod-rank">{i + 1}</div>
                        <div className="prod-name">{p.name}</div>
                        <div className="prod-bar-wrap">
                          <div className="prod-bar" style={{ width: `${(p.qty / max) * 100}%` }} />
                        </div>
                        <div className="prod-qty">{p.qty}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state" style={{ padding: "24px 16px" }}>Sin datos hoy</div>
                )}
              </div>

              {/* CHANNELS */}
              <div className="side-card">
                <div className="side-head">
                  <div>
                    <div className="side-title">Canales de venta</div>
                    <div className="side-sub">Pedidos de hoy</div>
                  </div>
                </div>
                {report?.byChannel && Object.keys(report.byChannel).length > 0 ? (
                  Object.entries(report.byChannel)
                    .sort((a, b) => b[1] - a[1])
                    .map(([channel, count]) => (
                      <div key={channel} className="channel-row">
                        <div className="channel-name">{channel}</div>
                        <div className="channel-val">{count}</div>
                      </div>
                    ))
                ) : (
                  <div className="empty-state" style={{ padding: "24px 16px" }}>Sin pedidos hoy</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
