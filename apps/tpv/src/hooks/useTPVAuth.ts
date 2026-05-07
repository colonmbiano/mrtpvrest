"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

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

    const cachedRest = localStorage.getItem("restaurantName");
    const cachedLoc = localStorage.getItem("locationName");
    setRestaurantName(cachedRest || "MRTPVREST");
    setLocationName(cachedLoc || "Sucursal");

    // Backfill desde backend si la cache está vacía o trae fallback genérico
    // y tenemos token para autenticar la petición.
    const hasToken = Boolean(
      sessionStorage.getItem("tpv-access-token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("tpv-employee-token")
    );
    const needsBackfill =
      !cachedRest || !cachedLoc ||
      cachedRest === "MRTPVREST" || cachedLoc === "Sucursal";

    if (hasToken && needsBackfill) {
      api.get("/api/employees/me")
        .then(({ data }) => {
          if (data?.restaurant?.name && data?.location?.name) {
            localStorage.setItem("restaurantId", data.restaurant.id);
            localStorage.setItem("restaurantName", data.restaurant.name);
            localStorage.setItem("locationId", data.location.id);
            localStorage.setItem("locationName", data.location.name);
            setRestaurantName(data.restaurant.name);
            setLocationName(data.location.name);
          }
        })
        .catch(() => {
          // Sin red o sesión inválida — mantener fallback.
        });
    }

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
