"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SetupGuard } from "@/components/SetupGuard";
import { IconCheck } from "@/components/Icon";
import api from "@/lib/api";

export default function SuccessPage() {
  return <SetupGuard><Inner /></SetupGuard>;
}

// Mapeo de status del backend → display amigable + color
const STATUS_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  PENDING:    { label: "Recibida",   color: "#a78bfa", icon: "📥" },
  CONFIRMED:  { label: "Confirmada", color: "#22d3ee", icon: "✓" },
  PREPARING:  { label: "Preparando", color: "#fbbf24", icon: "🍳" },
  READY:      { label: "¡Lista!",    color: "#10b981", icon: "🔔" },
  DELIVERED:  { label: "Entregada",  color: "#10b981", icon: "✓" },
  CANCELLED:  { label: "Cancelada",  color: "#ef4444", icon: "✗" },
};

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderNumber = params.get("n") || "";
  const orderType   = params.get("t") || "";
  const meta        = params.get("m") || "";
  const payment     = params.get("p") || "cash";

  // Auto-reset solo cuando la orden esté READY o tras 60s (lo que pase primero).
  const [remaining, setRemaining] = useState(60);
  const [status, setStatus] = useState<string>("PENDING");
  const [estimatedMin, setEstimatedMin] = useState<number | null>(null);

  useEffect(() => {
    sessionStorage.removeItem("kiosk-cart");

    // Polling cada 4s del status. Cuando llega READY, deja de pollear.
    const poll = async () => {
      if (!orderNumber) return;
      try {
        const { data } = await api.get<{ status?: string; estimatedMinutes?: number | null }>(
          `/api/store/orders/by-number/${encodeURIComponent(orderNumber)}`,
        );
        if (data?.status) setStatus(data.status);
        if (typeof data?.estimatedMinutes === "number") setEstimatedMin(data.estimatedMinutes);
      } catch {
        /* silent — el endpoint puede no existir o estar caído; el contador igual avanza */
      }
    };
    poll();
    const pollIv = setInterval(poll, 4000);

    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick);
          clearInterval(pollIv);
          router.replace("/");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { clearInterval(tick); clearInterval(pollIv); };
  }, [router, orderNumber]);

  const statusInfo = STATUS_DISPLAY[status] || STATUS_DISPLAY.PENDING;

  const message = orderType === "dine_in"
    ? (payment === "card"
        ? `Tu orden llegará a la mesa ${meta}.`
        : `Tu orden llegará a la mesa ${meta}. Pasa por caja a pagar.`)
    : (payment === "card"
        ? `Pasa por tu comida cuando escuches "${decodeURIComponent(meta)}".`
        : `Pasa por caja a pagar y recoge tu comida cuando escuches "${decodeURIComponent(meta)}".`);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 28 }}>
      <div style={{ width: 160, height: 160, borderRadius: "50%", background: "color-mix(in srgb, #10b981 15%, transparent)", border: "4px solid #10b981", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
        <IconCheck size={96} />
      </div>
      <div style={{ fontSize: 20, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: ".1em", textTransform: "uppercase" }}>
        Orden
      </div>
      <div style={{ fontSize: 64, fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)", letterSpacing: ".02em" }}>
        {orderNumber || "—"}
      </div>
      <div style={{ fontSize: 22, color: "var(--text)", textAlign: "center", maxWidth: 720, lineHeight: 1.4 }}>
        {message}
      </div>

      {/* Status badge en vivo */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 24px", borderRadius: 999,
          background: `color-mix(in srgb, ${statusInfo.color} 12%, transparent)`,
          border: `2px solid ${statusInfo.color}`,
          color: statusInfo.color,
          fontFamily: "var(--font-mono)", fontWeight: 800,
          fontSize: 18, textTransform: "uppercase", letterSpacing: ".08em",
          transition: "all .3s ease",
        }}
      >
        <span style={{ fontSize: 28 }}>{statusInfo.icon}</span>
        <span>{statusInfo.label}</span>
        {status === "PREPARING" && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusInfo.color, animation: "pulse 1.4s ease-in-out infinite" }} />
        )}
        {estimatedMin != null && (status === "CONFIRMED" || status === "PREPARING") && (
          <span style={{ fontSize: 14, opacity: 0.8 }}>· ~{estimatedMin} min</span>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 14, color: "var(--brand-primary)", fontFamily: "var(--font-mono)" }}>
        Volviendo al inicio en {remaining}s…
      </div>
      <button
        onClick={() => router.replace("/")}
        style={{
          marginTop: 12,
          padding: "14px 36px",
          background: "transparent", color: "var(--brand-primary)",
          border: "2px solid var(--brand-primary)", borderRadius: 999,
          fontSize: 16, fontWeight: 800, cursor: "pointer",
          textTransform: "uppercase", letterSpacing: ".08em",
        }}
      >
        Nueva orden
      </button>
    </div>
  );
}
