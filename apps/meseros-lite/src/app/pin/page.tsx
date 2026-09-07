"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Delete, LockKeyhole, RotateCcw } from "lucide-react";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";
import { APP_HOME, TAKEOUT_MODE } from "@/lib/app-mode";

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export default function PinPage() {
  const router = useRouter();
  const loginWithPin = useEmployeeSessionStore((state) => state.loginWithPin);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const configured =
    typeof window !== "undefined" &&
    Boolean(localStorage.getItem("restaurantId") && localStorage.getItem("locationId"));

  const appendDigit = (digit: string) => {
    setError("");
    setPin((current) => (current.length >= 8 ? current : `${current}${digit}`));
  };

  const submitPin = async () => {
    if (pin.length < 4) {
      setError("Ingresa el PIN del mesero.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await loginWithPin(pin);
      router.replace(APP_HOME);
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "No se pudo validar el PIN.";
      setError(
        status === 401 || status === 403
          ? "PIN incorrecto o empleado sin acceso."
          : code === "ECONNABORTED"
            ? "El servidor tardó demasiado. Intenta otra vez."
            : typeof err === "object" && err !== null && "response" in err && !(err as { response?: unknown }).response
              ? "El servidor no está disponible. La configuración se conserva."
              : message,
      );
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="pin-shell min-h-screen bg-[var(--bg)] px-5 py-5 text-[var(--text-primary)]">
      <div className="pin-layout mx-auto grid max-w-md gap-4">
        <header className="pin-header rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5 text-center">
          <LockKeyhole className="mx-auto mb-3 text-[var(--brand)]" size={42} />
          <p className="text-sm font-black uppercase tracking-wide text-[var(--brand)]">
            {TAKEOUT_MODE ? "Toki Boba · pedidos" : "Entrada de mesero"}
          </p>
          <h1 className="mt-1 text-3xl font-black text-[var(--text-primary)]">PIN de turno</h1>
          <p className="pin-description mt-2 text-base font-bold text-[var(--text-secondary)]">
            {TAKEOUT_MODE
              ? "Entra y empieza a tomar pedidos para llevar."
              : "Cada comanda queda ligada al empleado activo."}
          </p>
        </header>

        {!configured && (
          <button
            type="button"
            onClick={() => router.replace("/setup")}
            className="min-h-[72px] rounded-lg border border-[var(--brand)] bg-[var(--surface-3)] px-5 text-lg font-black text-[var(--brand)] active:scale-95 transition-all duration-150"
          >
            Configurar restaurante y sucursal
          </button>
        )}

        <div className="pin-card rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <div
            className="pin-display mb-4 flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)]"
            role="status"
            aria-live="polite"
            aria-label={`${pin.length} dígitos ingresados`}
          >
            <span className="text-4xl font-black tracking-wide text-[var(--text-primary)]" aria-hidden="true">
              {pin ? "•".repeat(pin.length) : "----"}
            </span>
          </div>

          {error && (
            <p role="alert" className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--surface-3)] p-3 text-center text-sm font-black text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="pin-grid grid grid-cols-3 gap-3">
            {digits.slice(0, 9).map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => appendDigit(digit)}
                disabled={loading}
                className="pin-key min-h-[72px] rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-3xl font-black text-[var(--text-primary)] active:scale-95 transition-all duration-150"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin((current) => current.slice(0, -1))}
              disabled={loading}
              className="pin-key flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
              aria-label="Borrar digito"
            >
              <Delete size={30} />
            </button>
            <button
              type="button"
              onClick={() => appendDigit("0")}
              disabled={loading}
              className="pin-key min-h-[72px] rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-3xl font-black text-[var(--text-primary)] active:scale-95 transition-all duration-150"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setPin("");
              }}
              disabled={loading}
              className="pin-key flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
              aria-label="Limpiar PIN"
            >
              <RotateCcw size={30} />
            </button>
          </div>

          <button
            type="button"
            onClick={submitPin}
            disabled={loading || !configured}
            className={[
              "pin-submit mt-3 min-h-[72px] w-full rounded-lg border px-5 text-xl font-black",
              "active:scale-95 transition-all duration-150",
              loading || !configured
                ? "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                : "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]",
            ].join(" ")}
          >
            {loading ? "Validando..." : TAKEOUT_MODE ? "Abrir catálogo" : "Entrar a mesas"}
          </button>
        </div>

        {configured && (
          <button
            type="button"
            onClick={() => router.replace("/setup")}
            className="pin-change flex min-h-[64px] items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 text-base font-black text-[var(--text-secondary)] active:scale-95 transition-all duration-150"
          >
            <ArrowLeft size={22} />
            Cambiar restaurante o sucursal
          </button>
        )}
      </div>
    </section>
  );
}
