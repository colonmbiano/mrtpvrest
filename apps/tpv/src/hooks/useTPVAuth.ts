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
    let cancelled = false;
    // Cuerpo diferido a microtask (ver impresoras): el setRestaurantName/
    // setLocationName síncrono ya no corre dentro del effect
    // (set-state-in-effect). Comportamiento idéntico.
    queueMicrotask(() => {
      if (cancelled) return;

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

      // Backfill desde backend si la cache está vacía o trae fallback
      // genérico y tenemos token para autenticar la petición.
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
            if (cancelled) return;
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

      // Hidratar sesión desde storage si no está autenticado en estado
      if (!auth.isAuthenticated) {
        auth.hydrateFromStorage();
      }
    });
    return () => { cancelled = true; };
  }, [router, auth.isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirección por roles especiales tras autenticación.
  //
  // FASE 6 · MODO "PRÉSTAMO DE CAJA":
  // El WAITER solo se redirige a /meseros si la tablet fue configurada
  // como dispositivo MESERO en /setup. Cuando es CAJA (tablet principal)
  // el mesero entra al layout /pos como préstamo — toma órdenes pero las
  // funciones de dinero (cobrar, cajón) quedan ocultas vía useLoanMode.
  const prevAuthRef = useRef(false);
  useEffect(() => {
    if (auth.isAuthenticated && auth.employee && !prevAuthRef.current) {
      prevAuthRef.current = true;
      const role = auth.employee.role;
      if (role === "WAITER") {
        // setup guarda deviceRole = 'WAITER' (tablet de mesero) o 'POS'
        // (caja principal). Si la tablet es de mesero, redirigimos como
        // antes. Si es POS o no está marcada, dejamos al mesero entrar al
        // /pos en modo préstamo y el layout oculta funciones de dinero.
        const deviceRole =
          typeof window !== "undefined"
            ? localStorage.getItem("deviceRole")
            : null;
        const isWaiterDevice = deviceRole === "WAITER";
        if (isWaiterDevice) {
          router.push("/meseros");
        }
      }
      // KITCHEN/COOK ya no redirigen a /kds — esa pantalla vive en la APK
      // independiente apps/kds. Si un cocinero pone su PIN en el TPV se
      // queda en el flujo POS sin pantalla específica.
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
