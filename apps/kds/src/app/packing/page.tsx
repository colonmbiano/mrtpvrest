"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

// Vista de EMPAQUE: pedidos en estado PACKING + checklist de verificación. Al
// completar los 5 checks el backend avanza la orden a READY. Reusa el token del
// KDS (localStorage), así que el operador debe haber entrado por la pantalla
// principal antes. Autocontenida para no tocar el KdsScreen.

type Check = { key: string; checked: boolean };
type PackItem = { id: string; name: string; quantity: number; notes?: string | null };
type PackOrder = {
  id: string;
  orderNumber: number;
  orderType: string;
  customerName?: string | null;
  deliveryAddress?: string | null;
  paymentStatus?: string | null;
  items: PackItem[];
  checks: Check[];
};

const CHECK_LABEL: Record<string, string> = {
  DRINKS_COMPLETE: "Bebidas completas",
  SAUCES_PACKED: "Salsas aparte",
  TICKET_PRINTED: "Ticket impreso",
  ADDRESS_CONFIRMED: "Dirección confirmada",
  PAYMENT_CONFIRMED: "Pago confirmado",
};

export default function PackingPage() {
  const [orders, setOrders] = useState<PackOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get<PackOrder[]>("/api/kds/packing/orders");
      setOrders(Array.isArray(data) ? data : []);
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo cargar empaque");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 10_000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  async function toggleCheck(orderId: string, checkKey: string, next: boolean) {
    // Optimista.
    setOrders((prev) => prev.map((o) =>
      o.id === orderId ? { ...o, checks: o.checks.map((c) => c.key === checkKey ? { ...c, checked: next } : c) } : o));
    try {
      const { data } = await api.put(`/api/kds/packing/${orderId}/check`, { checkKey, checked: next });
      if (data?.advanced) {
        // La orden salió de empaque (pasó a READY): quitarla de la lista.
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      }
    } catch {
      fetchOrders(); // revertir desde el server
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d10", color: "#e7e9ee", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>📦 Empaque</h1>
        <button onClick={fetchOrders} style={{ background: "#1b2330", color: "#9fb3c8", border: "1px solid #2a3542", borderRadius: 10, padding: "8px 14px", fontWeight: 700 }}>
          Actualizar
        </button>
      </div>

      {error && <p style={{ color: "#f87171", fontWeight: 700 }}>{error}</p>}
      {loading ? (
        <p style={{ color: "#7c8aa0" }}>Cargando…</p>
      ) : orders.length === 0 ? (
        <p style={{ color: "#7c8aa0" }}>No hay pedidos en empaque.</p>
      ) : (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {orders.map((o) => (
            <div key={o.id} style={{ background: "#11161d", border: "1px solid #232c38", borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 18 }}>#{o.orderNumber}</span>
                <span style={{ fontSize: 12, color: "#7c8aa0" }}>{o.orderType}{o.customerName ? ` · ${o.customerName}` : ""}</span>
              </div>
              {o.deliveryAddress && <p style={{ fontSize: 12, color: "#9fb3c8", marginBottom: 8 }}>{o.deliveryAddress}</p>}
              <div style={{ fontSize: 13, color: "#c7d0db", marginBottom: 10 }}>
                {o.items.map((it) => (
                  <div key={it.id}>{it.quantity}× {it.name}</div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {o.checks.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => toggleCheck(o.id, c.key, !c.checked)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                      background: c.checked ? "#103024" : "#161d26",
                      border: `1px solid ${c.checked ? "#1f8f5f" : "#2a3542"}`,
                      borderRadius: 10, padding: "10px 12px", color: c.checked ? "#34d399" : "#c7d0db", fontWeight: 700,
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: c.checked ? "#1f8f5f" : "transparent", border: `2px solid ${c.checked ? "#1f8f5f" : "#3a4757"}`, color: "#fff", fontSize: 12,
                    }}>{c.checked ? "✓" : ""}</span>
                    {CHECK_LABEL[c.key] || c.key}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
