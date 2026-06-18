"use client";

import { useSyncExternalStore } from "react";

// Conectividad del dispositivo vía navigator.onLine + eventos online/offline.
// useSyncExternalStore evita setState-en-effect y el mismatch de hidratación:
// en el servidor asumimos "en línea" (snapshot true) y el cliente corrige tras
// montar. Una sola suscripción compartida por todos los consumidores.
function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
