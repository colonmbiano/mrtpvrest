"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// En Vercel: el middleware intercepta "/" antes de llegar acá.
// En Capacitor (output: export): no hay middleware, así que el redirect
// debe ser client-side. Por eso esta página es un client component.
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const device = document.cookie.includes("tpv-device-linked=true");
    const session = document.cookie.includes("tpv-session-active=true");
    if (!device) router.replace("/setup");
    else if (!session) router.replace("/locked");
    else router.replace("/hub");
  }, [router]);

  return null;
}
