"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupGuard } from "@/components/SetupGuard";

export default function IdlePage() {
  return (
    <SetupGuard>
      <IdleInner />
    </SetupGuard>
  );
}

function IdleInner() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState("");
  const [locationName, setLocationName] = useState("");

  useEffect(() => {
    setRestaurantName(localStorage.getItem("kiosk-restaurant-name") || "");
    setLocationName(localStorage.getItem("kiosk-location-name") || "");
    sessionStorage.removeItem("kiosk-cart");
  }, []);

  function start() { router.push("/order-type"); }

  return (
    <div
      onClick={start}
      style={{
        position: "fixed", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 32, cursor: "pointer",
        background: "radial-gradient(circle at center, var(--surf) 0%, var(--bg) 70%)",
      }}
    >
      <div
        style={{
          width: 140, height: 140, borderRadius: 40,
          background: "var(--brand-primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--bg)", fontSize: 64, fontWeight: 900,
          fontFamily: "var(--font-display)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {(restaurantName[0] || "K").toUpperCase()}
      </div>
      <div style={{ textAlign: "center", maxWidth: "80%" }}>
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}>
          {restaurantName || "Kiosko"}
        </div>
        {locationName && (
          <div style={{ fontSize: 18, color: "var(--muted)", marginTop: 8, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".1em" }}>
            {locationName}
          </div>
        )}
      </div>
      <div
        className="kiosk-pulse"
        style={{
          marginTop: 40,
          padding: "20px 48px",
          border: "3px dashed var(--brand-primary)",
          borderRadius: 999,
          color: "var(--brand-primary)",
          fontSize: 28, fontWeight: 800,
          textTransform: "uppercase", letterSpacing: ".08em",
        }}
      >
        Toca para ordenar
      </div>
    </div>
  );
}
