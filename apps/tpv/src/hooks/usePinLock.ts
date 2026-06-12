/**
 * usePinLock.ts
 * Hook reutilizable para la pantalla de bloqueo por PIN.
 * Integra el authStore para rate-limiting y estado de lock.
 */
"use client";
import { useState, useCallback, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 6;

export function usePinLock() {
  const router = useRouter();

  const loginWithPin          = useAuthStore((s) => s.loginWithPin);
  const logout                = useAuthStore((s) => s.logout);
  const isLocked              = useAuthStore((s) => s.isLocked);
  const getRemainingLockSecs  = useAuthStore((s) => s.getRemainingLockSeconds);
  const refreshShift          = useAuthStore((s) => s.refreshShift);
  const hydrateFromStorage    = useAuthStore((s) => s.hydrateFromStorage);
  const employee              = useAuthStore((s) => s.employee);
  const isAuthenticated       = useAuthStore((s) => s.isAuthenticated);

  const [pinInput, setPinInput]       = useState("");
  const [pinError, setPinError]       = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);

  // Hidratar sesión guardada al montar
  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  // Countdown cuando está bloqueado. El set inicial se difiere a microtask
  // (ver impresoras) para no caer en set-state-in-effect; el tick por
  // setInterval ya es asíncrono y no estaba afectado.
  useEffect(() => {
    if (!isLocked()) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setLockCountdown(getRemainingLockSecs()); });
    const interval = setInterval(() => {
      const secs = getRemainingLockSecs();
      setLockCountdown(secs);
      if (secs <= 0) clearInterval(interval);
    }, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isLocked, getRemainingLockSecs]);

  const appendDigit = useCallback(
    (digit: string) => {
      if (isVerifying || isLocked()) return;
      setPinError("");
      setPinInput((prev) =>
        prev.length >= PIN_MAX_LENGTH ? prev : prev + digit
      );
    },
    [isVerifying, isLocked]
  );

  const backspace = useCallback(() => {
    if (isVerifying) return;
    setPinError("");
    setPinInput((prev) => prev.slice(0, -1));
  }, [isVerifying]);

  const clearPin = useCallback(() => {
    if (isVerifying) return;
    setPinError("");
    setPinInput("");
  }, [isVerifying]);

  const submitPin = useCallback(async () => {
    if (pinInput.length < PIN_MIN_LENGTH) {
      setPinError(`Ingresa al menos ${PIN_MIN_LENGTH} dígitos`);
      return;
    }
    if (isLocked()) {
      setPinError(`Bloqueado. Espera ${lockCountdown}s`);
      return;
    }

    setIsVerifying(true);
    setPinError("");

    const { success, error } = await loginWithPin(pinInput);

    if (success && employee) {
      setPinInput("");
      // Redirigir según rol
      if (employee.role === "WAITER") {
        router.replace("/meseros");
        return;
      }
      if (employee.role === "KITCHEN" || employee.role === "COOK") {
        // El KDS vive en una APK aparte (apps/kds). El cocinero no debe
        // estar autenticado en el TPV — limpiamos sesión y avisamos.
        if (typeof window !== "undefined") {
          const { setToken } = await import("@/lib/token-vault");
          void setToken(null);
        }
        return;
      }
      // OWNER / ADMIN / MANAGER / CASHIER → dashboard TPV
      await refreshShift();
    } else {
      setPinError(error ?? "PIN incorrecto");
      setPinInput("");
    }

    setIsVerifying(false);
  }, [
    pinInput,
    isLocked,
    lockCountdown,
    loginWithPin,
    employee,
    router,
    refreshShift,
  ]);

  const handleLogout = useCallback(() => {
    logout();
    setPinInput("");
    setPinError("");
  }, [logout]);

  return {
    pinInput,
    pinError,
    isVerifying,
    isLocked: isLocked(),
    lockCountdown,
    isAuthenticated,
    employee,
    appendDigit,
    backspace,
    clearPin,
    submitPin,
    handleLogout,
  };
}
