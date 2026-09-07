"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import BottomNavigation from "@/components/BottomNavigation";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";
import { APP_HOME, TAKEOUT_MODE } from "@/lib/app-mode";

const publicRoutes = ["/setup", "/pin"];

export default function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isAuthenticated = useEmployeeSessionStore((state) => state.isAuthenticated);
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isWaiterOnlyRoute = pathname === "/mesas" || pathname.startsWith("/mesas/") || pathname === "/cuenta";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && TAKEOUT_MODE && isWaiterOnlyRoute) {
      router.replace(APP_HOME);
      return;
    }
    if (!ready || isPublicRoute) return;

    const hasEmployeeToken =
      typeof window !== "undefined" &&
      Boolean(sessionStorage.getItem("tpv-access-token") && localStorage.getItem("currentEmployeeId"));

    if (!isAuthenticated && !hasEmployeeToken) {
      router.replace("/pin");
    }
  }, [isAuthenticated, isPublicRoute, isWaiterOnlyRoute, ready, router]);

  if ((!ready && !isPublicRoute) || (TAKEOUT_MODE && isWaiterOnlyRoute)) {
    return <main className="h-screen bg-[var(--bg)]" />;
  }

  return (
    <>
      <main className="h-screen overflow-y-auto pb-24">{children}</main>
      {!isPublicRoute && <BottomNavigation />}
    </>
  );
}
