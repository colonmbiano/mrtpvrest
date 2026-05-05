"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export function useTPVAuth() {
  const router = useRouter();
  const auth = useAuthStore();
  const [restaurantName, setRestaurantName] = useState("MRTPVREST");
  const [locationName, setLocationName] = useState("");

  useEffect(() => {
    // Verificar si el dispositivo está vinculado
    const restId = localStorage.getItem("restaurantId");
    const locId = localStorage.getItem("locationId");
    
    if (!restId || !locId) {
      router.replace("/setup");
      return;
    }

    setRestaurantName(localStorage.getItem("restaurantName") || "MRTPVREST");
    setLocationName(localStorage.getItem("locationName") || "Sucursal");

    // Intentar hidratar sesión desde storage si no está autenticado en estado
    if (!auth.isAuthenticated) {
      auth.hydrateFromStorage();
    }
  }, [router, auth.isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirección por roles especiales tras autenticación.
  // NOTA: Solo redirigimos a WAITER y KITCHEN porque acceden a aplicaciones
  // completamente distintas. CASHIER/ADMIN/MANAGER/OWNER permanecen en el POS
  // donde estén — el redirect en cada layout causaría un loop infinito.
  const prevAuthRef = useRef(false);
  useEffect(() => {
    if (auth.isAuthenticated && auth.employee && !prevAuthRef.current) {
      prevAuthRef.current = true;
      const role = auth.employee.role;
      if (role === "WAITER") {
        router.push("/meseros");
      } else if (role === "KITCHEN" || role === "COOK") {
        router.push("/kds");
      }
      // CASHIER, OWNER, ADMIN, MANAGER → no redirigimos, ya están en el POS
    } else if (!auth.isAuthenticated) {
      prevAuthRef.current = false;
    }
  }, [auth.isAuthenticated, auth.employee, router]);

  const loginWithPin = async (pin: string) => {
    const res = await auth.loginWithPin(pin);
    if (!res.success) {
      throw new Error(res.error || "Error de autenticación");
    }
    return res;
  };

  return {
    isLocked: !auth.isAuthenticated,
    currentEmployee: auth.employee,
    restaurantName,
    locationName,
    isVerifying: false, // El store maneja la carga internamente si fuera necesario, o podemos añadir estado local
    error: "", // Se maneja en el componente llamando a loginWithPin
    loginWithPin,
    logout: auth.logout,
    lockedUntil: auth.lockedUntil,
    isRateLimited: auth.isLocked()
  };
}
