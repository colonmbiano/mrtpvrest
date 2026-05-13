"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

// Una sola vez por carga del kiosko: registramos sesión OPEN al backend.
// Idempotente con flag en sessionStorage para no spamear en cada render.
function registerSessionOpen() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem("kiosk-session-opened") === "1") return;
  api.post("/api/store/kiosk/session", { event: "OPEN" }).catch(() => null);
  sessionStorage.setItem("kiosk-session-opened", "1");
}

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const rid = typeof window !== "undefined" ? localStorage.getItem("kiosk-restaurant-id") : null;
    if (!rid) {
      router.replace("/setup");
      return;
    }
    // Aplicar branding del restaurante: accentColor a la CSS var
    // --brand-primary que todos los estilos consumen.
    const accent = localStorage.getItem("kiosk-accent-color");
    if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
      document.documentElement.style.setProperty("--brand-primary", accent);
    }
    registerSessionOpen();
    setOk(true);
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}
