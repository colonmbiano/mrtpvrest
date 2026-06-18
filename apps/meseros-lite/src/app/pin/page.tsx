"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Delete, LockKeyhole, RotateCcw } from "lucide-react";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";

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
      router.replace("/mesas");
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "No se pudo validar el PIN.";
      setError(message);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="min-h-screen bg-[var(--bg)] px-5 py-5 text-[var(--text-primary)]">
      <div className="mx-auto grid max-w-md gap-4">
        <header className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5 text-center">
          <LockKeyhole className="mx-auto mb-3 text-[var(--brand)]" size={42} />
          <p className="text-sm font-black uppercase tracking-wide text-[var(--brand)]">
            Entrada de mesero
          </p>
          <h1 className="mt-1 text-3xl font-black text-[var(--text-primary)]">PIN de turno</h1>
          <p className="mt-2 text-base font-bold text-[var(--text-secondary)]">
            Cada comanda queda ligada al empleado activo.
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

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <div className="mb-4 flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <span className="text-4xl font-black tracking-wide text-[var(--text-primary)]">
              {pin ? "•".repeat(pin.length) : "----"}
            </span>
          </div>

          {error && (
            <p className="mb-4 rounded-lg border border-[var(--brand)] bg-[var(--surface-3)] p-3 text-center text-sm font-black text-[var(--brand)]">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            {digits.slice(0, 9).map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => appendDigit(digit)}
                disabled={loading}
                className="min-h-[72px] rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-3xl font-black text-[var(--text-primary)] active:scale-95 transition-all duration-150"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin((current) => current.slice(0, -1))}
              disabled={loading}
              className="flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
              aria-label="Borrar digito"
            >
              <Delete size={30} />
            </button>
            <button
              type="button"
              onClick={() => appendDigit("0")}
              disabled={loading}
              className="min-h-[72px] rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-3xl font-black text-[var(--text-primary)] active:scale-95 transition-all duration-150"
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
              className="flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
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
              "mt-3 min-h-[72px] w-full rounded-lg border px-5 text-xl font-black",
              "active:scale-95 transition-all duration-150",
              loading || !configured
                ? "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                : "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]",
            ].join(" ")}
          >
            {loading ? "Validando..." : "Entrar a mesas"}
          </button>
        </div>

        {configured && (
          <button
            type="button"
            onClick={() => router.replace("/setup")}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 text-base font-black text-[var(--text-secondary)] active:scale-95 transition-all duration-150"
          >
            <ArrowLeft size={22} />
            Cambiar restaurante o sucursal
          </button>
        )}
      </div>
    </section>
  );
}
