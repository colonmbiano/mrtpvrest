"use client";
import { useEffect, useState } from "react";

// Suscripción ligera a navigator.onLine. Sirve para mostrar banners de
// "modo offline" y para que los wrappers de api decidan si ir directo
// a backend o caer a cola. SSR-safe: arranca asumiendo online (lo más
// común) y se corrige al hidratar.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
