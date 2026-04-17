"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SetupGuard } from "@/components/SetupGuard";
import { IconCheck } from "@/components/Icon";

export default function SuccessPage() {
  return <SetupGuard><Inner /></SetupGuard>;
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderNumber = params.get("n") || "";
  const orderType   = params.get("t") || "";
  const meta        = params.get("m") || "";
  const payment     = params.get("p") || "cash";

  const [remaining, setRemaining] = useState(10);

  useEffect(() => {
    sessionStorage.removeItem("kiosk-cart");
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick);
          router.replace("/");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router]);

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
