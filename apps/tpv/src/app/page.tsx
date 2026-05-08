"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Root redirect del TPV. En Vercel el middleware corta antes; en
// Capacitor (output: export) NO hay middleware, así que el routing
// inicial vive en este client component.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const device = document.cookie.includes("tpv-device-linked=true");
    if (!device) {
      router.replace("/setup");
      return;
    }

    // El rol KDS ya no aplica al TPV — esa pantalla vive en una APK
    // independiente (apps/kds). Cualquier dispositivo que se haya
    // vinculado como KDS aquí simplemente sigue el flujo normal de POS.
    const session = document.cookie.includes("tpv-session-active=true");
    if (!session) {
      router.replace("/locked");
      return;
    }
    router.replace("/hub");
  }, [router]);

  return null;
}
