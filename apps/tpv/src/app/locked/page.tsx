"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import NumpadPIN from "@/components/NumpadPIN";
import VersionTag from "@/components/VersionTag";
import { useAuthStore } from "@/store/authStore";
import { initBackgroundSync } from "@/lib/offline";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import api from "@/lib/api";

const ROLE_LABEL: Record<string, string> = {
  POS: "Caja",
  WAITER: "Comandera",
  KDS: "Cocina",
};

export default function LockedPage() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [terminalName, setTerminalName] = useState<string>("Terminal");
  const [terminalKind, setTerminalKind] = useState<string>("CAJA");
  const [locationName, setLocationName] = useState<string>("Sucursal");
  const loginWithPin = useAuthStore((state) => state.loginWithPin);

  useEffect(() => {
    const checkDevice = () => {
      const deviceLinked = document.cookie.includes("tpv-device-linked=true");
      const sessionActive = document.cookie.includes("tpv-session-active=true");

      if (!deviceLinked) {
        router.replace("/setup");
        return;
      }

      if (sessionActive) {
        router.replace("/hub");
      }
    };

    checkDevice();
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const cached = localStorage.getItem("deviceName");
      const deviceRole = localStorage.getItem("deviceRole") || "POS";
      const fallback = ROLE_LABEL[deviceRole] || "Terminal";

      setTerminalKind(deviceRole === "WAITER" ? "COMANDERA" : "CAJA");
      setTerminalName(cached || fallback);
      setLocationName(
        localStorage.getItem("locationName") ||
          localStorage.getItem("activeWorkspaceName") ||
          "Sucursal",
      );

      const token = localStorage.getItem("deviceToken");
      if (!token) return;

      api
        .post("/api/devices/identity", { deviceToken: token })
        .then(({ data }) => {
          if (cancelled) return;
          if (data?.name) {
            localStorage.setItem("deviceName", data.name);
            setTerminalName(data.name);
          }
          if (data?.type) {
            setTerminalKind(data.type === "WAITER" ? "COMANDERA" : data.type);
          }
        })
        .catch(() => {
          /* Keep cached identity when the terminal is offline. */
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePINSubmit = async (pin: string) => {
    if (pin.length !== 4) return;

    setIsValidating(true);
    setError("");

    try {
      const res = await loginWithPin(pin);

      if (!res.success) {
        setError(res.error || "PIN incorrecto");
        setIsValidating(false);
        return;
      }

      initBackgroundSync();
      router.replace("/hub");
    } catch (err) {
      console.error("PIN validation error:", err);
      setError("Error al validar PIN");
      setIsValidating(false);
    }
  };

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden bg-[var(--bg)]"
      style={{ fontFamily: "var(--font-body)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-glow), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 42%)",
        }}
      />

      <div className="fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md sm:flex">
        <MapPin size={15} className="text-[var(--brand)]" strokeWidth={2.5} />
        <span className="max-w-[220px] truncate text-[11px] font-black uppercase tracking-[0.18em] text-white/55">
          {locationName}
        </span>
      </div>

      <div className="fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex max-w-[calc(100vw-1.5rem-env(safe-area-inset-left)-env(safe-area-inset-right))] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            isOnline ? "bg-emerald-400" : "bg-red-400"
          }`}
          style={{
            boxShadow: isOnline
              ? "0 0 8px rgba(52,211,153,0.55)"
              : "0 0 8px rgba(248,113,113,0.55)",
          }}
        />
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
          {isOnline ? "Online" : "Offline"}
        </span>
        <span className="text-white/20">|</span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--brand)]">
          {terminalKind}
        </span>
        <span className="min-w-0 truncate text-[11px] font-black text-white">
          {terminalName}
        </span>
      </div>

      <div
        className="relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(3.25rem,calc(env(safe-area-inset-top)+2.75rem))] sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))]"
      >
      <main className="flex max-h-full min-h-0 w-full max-w-[360px] flex-col items-center gap-6 overflow-y-auto scrollbar-hide px-2 text-center landscape:gap-4">
        {/* HEADER — avatar redondo + nombre de terminal + indicación (mockup BLOQUEO) */}
        <div className="flex flex-col items-center gap-3 landscape:gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand)] font-display text-2xl font-bold text-[var(--brand-fg)] landscape:h-14 landscape:w-14">
            {terminalName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
              {terminalName}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Ingresa tu PIN para continuar
            </p>
          </div>
        </div>

        {/* NUMPAD (puntos del PIN + teclado) */}
        <NumpadPIN
          onSubmit={handlePINSubmit}
          disabled={isValidating}
          autoSubmit
          onChange={(value) => {
            if (value && error) setError("");
          }}
        />

        {/* ERROR / VALIDANDO */}
        {(error || isValidating) && (
          <div className="w-full">
            {error && (
              <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
                <p className="text-sm font-bold text-[var(--danger)]">{error}</p>
              </div>
            )}
            {isValidating && (
              <div className="flex flex-col items-center justify-center">
                <div
                  className="h-6 w-6 animate-spin rounded-full border-4"
                  style={{
                    borderColor: "var(--brand-soft)",
                    borderTopColor: "var(--brand)",
                  }}
                />
                <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Validando PIN
                </p>
              </div>
            )}
          </div>
        )}
      </main>
      </div>

      <VersionTag className="fixed bottom-[max(0.6rem,env(safe-area-inset-bottom))] right-[max(0.85rem,env(safe-area-inset-right))] z-20 text-[10px] font-black uppercase tracking-[0.22em] text-white/25" />
    </div>
  );
}
