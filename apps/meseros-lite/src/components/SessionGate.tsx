"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import BottomNavigation from "@/components/BottomNavigation";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";

const publicRoutes = ["/setup", "/pin"];

export default function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isAuthenticated = useEmployeeSessionStore((state) => state.isAuthenticated);
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  useEffect(() => {
    setReady(true);
  }, []);

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
    return <main className="h-screen bg-[#0a0a0c]" />;
  }

  return (
    <>
      <main className="h-screen overflow-y-auto pb-24">{children}</main>
      {!isPublicRoute && <BottomNavigation />}
    </>
  );
}
