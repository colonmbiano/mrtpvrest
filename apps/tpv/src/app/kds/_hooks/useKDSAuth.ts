"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EMPLOYEE_TOKEN_KEY, EMPLOYEE_DATA_KEY } from "../_lib/kds";

type Employee = { name?: string; role?: string; [k: string]: unknown };

export type KDSAuthState = {
  employee: Employee | null;
  authReady: boolean;
  authError: string;
  logout: () => void;
};

export function useKDSAuth(): KDSAuthState {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) || localStorage.getItem("accessToken");
    const restId = localStorage.getItem("restaurantId");
    const locId = localStorage.getItem("locationId");
    if (!restId || !locId) {
      router.replace("/setup");
      return;
    }

    const empRaw = localStorage.getItem("kdsEmployee") || localStorage.getItem(EMPLOYEE_DATA_KEY);
    if (!token || !empRaw) {
      setAuthError("Esta pantalla necesita una sesion de cocina activa. Vuelve al TPV y desbloquea con el PIN.");
      return;
    }

    try {
      const parsed = JSON.parse(empRaw) as Employee;
      // KITCHEN y COOK comparten esta pantalla — ambos roles preparan comanda.
      if (parsed?.role && parsed.role !== "KITCHEN" && parsed.role !== "COOK") {
        setAuthError("La sesion activa no corresponde a cocina.");
        return;
      }
      localStorage.setItem("accessToken", token);
      localStorage.setItem("kdsEmployee", JSON.stringify(parsed));
      setEmployee(parsed);
      setAuthReady(true);
    } catch {
      setAuthError("No pudimos recuperar la sesion del empleado de cocina.");
    }
  }, [router]);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
    localStorage.removeItem(EMPLOYEE_DATA_KEY);
    localStorage.removeItem("kdsEmployee");
    router.replace("/");
  }

  return { employee, authReady, authError, logout };
}
