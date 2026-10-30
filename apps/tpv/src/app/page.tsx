"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { getTenantIds } from "@/lib/tenant";

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const hasDeviceCookie = document.cookie.includes("tpv-device-linked=true");
    const { restaurantId, locationId } = getTenantIds();
    const hasStorageTenant = restaurantId && locationId;
    const deviceLinked = hasDeviceCookie || hasStorageTenant;

    if (!deviceLinked) {
      router.replace("/setup");
      return;
    }

    if (!isAuthenticated) {
      router.replace("/locked");
      return;
    }
    router.replace("/hub");
  }, [isAuthenticated, router]);

  return null;
}
