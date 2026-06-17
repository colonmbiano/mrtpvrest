"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, MapPin, MonitorCheck } from "lucide-react";
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
      <main className="flex max-h-full min-h-0 w-full max-w-[420px] flex-col items-center gap-4 overflow-y-auto scrollbar-hide rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-center shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-5 sm:p-7 landscape:gap-3 landscape:p-4">
        {/* HEADER centrado */}
        <div className="flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] landscape:mb-2 landscape:h-10 landscape:w-10">
            <LockKeyhole size={26} strokeWidth={2.5} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--brand)]">
            Acceso de empleado
          </p>
          <h1 className="mt-1 text-[clamp(1.4rem,5vw,2.4rem)] font-black leading-tight tracking-tight text-white">
            {terminalName}
          </h1>
          <p className="mt-1.5 max-w-xs text-xs font-semibold leading-relaxed text-white/55 sm:text-sm landscape:hidden">
            Ingresa el PIN de 4 dígitos para continuar con la venta.
          </p>
        </div>

        {/* NUMPAD (incluye los puntos del PIN + N/4) */}
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
              <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-3">
                <p className="text-sm font-bold text-red-300">{error}</p>
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
                <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">
                  Validando PIN
                </p>
              </div>
            )}
          </div>
        )}

        {/* TERMINAL VINCULADA */}
        <div className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-xs font-bold text-white/45 landscape:hidden">
          <MonitorCheck size={16} className="text-emerald-300" />
          <span className="min-w-0 truncate">Terminal vinculada a {locationName}</span>
        </div>
      </main>
      </div>

      <VersionTag className="fixed bottom-[max(0.6rem,env(safe-area-inset-bottom))] right-[max(0.85rem,env(safe-area-inset-right))] z-20 text-[10px] font-black uppercase tracking-[0.22em] text-white/25" />
    </div>
  );
}
