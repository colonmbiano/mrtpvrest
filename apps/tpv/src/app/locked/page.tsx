"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, MapPin, MonitorCheck } from "lucide-react";
import NumpadPIN from "@/components/NumpadPIN";
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
      className="relative min-h-[100dvh] w-full overflow-y-auto overflow-x-hidden bg-[#0C0C0E]"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,184,77,0.12), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 42%)",
        }}
      />

      <div className="fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md sm:flex">
        <MapPin size={15} className="text-[#ffb84d]" strokeWidth={2.5} />
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
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] text-[#ffb84d]">
          {terminalKind}
        </span>
        <span className="min-w-0 truncate text-[11px] font-black text-white">
          {terminalName}
        </span>
      </div>

      <div
        className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(5rem,calc(env(safe-area-inset-top)+4.5rem))] sm:pt-[max(5rem,calc(env(safe-area-inset-top)+4rem))]"
      >
      <main className="grid w-full max-w-[980px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.045] shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-md lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)] landscape:grid-cols-[minmax(0,0.9fr)_minmax(340px,1fr)]">
        <section className="flex flex-col justify-between gap-8 border-b border-white/10 p-5 sm:p-7 lg:border-b-0 lg:border-r lg:p-8 landscape:border-b-0 landscape:border-r landscape:p-6">
          <div>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-[#ffb84d]/25 bg-[#ffb84d]/10 text-[#ffb84d]">
              <LockKeyhole size={24} strokeWidth={2.5} />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ffb84d]">
              Acceso de empleado
            </p>
            <h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-black leading-[0.95] tracking-tight text-white">
              {terminalName}
            </h1>
            <p className="mt-4 max-w-md text-sm font-semibold leading-relaxed text-white/55">
              Ingresa el PIN de 4 dígitos para continuar con la venta.
            </p>
          </div>

          <div className="grid gap-2 text-xs font-bold text-white/45">
            <div className="flex min-h-[44px] items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3">
              <MonitorCheck size={17} className="text-emerald-300" />
              <span className="min-w-0 truncate">
                Terminal vinculada a {locationName}
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center p-5 sm:p-7 landscape:p-5">
          <NumpadPIN
            onSubmit={handlePINSubmit}
            disabled={isValidating}
            onChange={(value) => {
              if (value && error) setError("");
            }}
          />

          <div className="min-h-[76px]">
            {error && (
              <div className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-center">
                <p className="text-sm font-bold text-red-300">{error}</p>
              </div>
            )}

            {isValidating && (
              <div className="mt-4 flex flex-col items-center justify-center text-center">
                <div
                  className="h-6 w-6 animate-spin rounded-full border-4"
                  style={{
                    borderColor: "rgba(255,184,77,0.2)",
                    borderTopColor: "#ffb84d",
                  }}
                />
                <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">
                  Validando PIN
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
      </div>
    </div>
  );
}
