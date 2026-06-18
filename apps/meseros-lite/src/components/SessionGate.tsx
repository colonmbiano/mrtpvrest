"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import BottomNavigation from "@/components/BottomNavigation";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";

const publicRoutes = ["/setup", "/pin"];

// Detecta el montaje en cliente sin setState-en-effect: el snapshot del
// servidor es false y el del cliente true, así que `ready` pasa a true tras
// la hidratación. Evita el mismatch SSR de la sesión persistida en localStorage.
const subscribeNoop = () => () => {};

export default function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const isAuthenticated = useEmployeeSessionStore((state) => state.isAuthenticated);
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  useEffect(() => {
    if (!ready || isPublicRoute) return;

    const hasEmployeeToken =
      typeof window !== "undefined" &&
      Boolean(localStorage.getItem("tpv-employee-token") && localStorage.getItem("currentEmployeeId"));

    if (!isAuthenticated && !hasEmployeeToken) {
      router.replace("/pin");
    }
  }, [isAuthenticated, isPublicRoute, ready, router]);

  if (!ready) {
    return <main className="h-screen bg-[var(--bg)]" />;
  }

  return (
    <>
      <main className="h-screen overflow-y-auto pb-24">{children}</main>
      {!isPublicRoute && <BottomNavigation />}
    </>
  );
}
