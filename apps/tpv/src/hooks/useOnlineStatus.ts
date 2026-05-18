"use client";
import { useClientValue } from "@/hooks/useClientValue";

// Suscripción ligera a navigator.onLine. Sirve para mostrar banners de
// "modo offline" y para que los wrappers de api decidan si ir directo
// a backend o caer a cola. SSR-safe vía useSyncExternalStore: arranca
// asumiendo online (lo más común) y se corrige al hidratar.
export function useOnlineStatus(): boolean {
  return useClientValue(
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
    true,
    (onStoreChange) => {
      window.addEventListener("online", onStoreChange);
      window.addEventListener("offline", onStoreChange);
      return () => {
        window.removeEventListener("online", onStoreChange);
        window.removeEventListener("offline", onStoreChange);
      };
    },
  );
}
