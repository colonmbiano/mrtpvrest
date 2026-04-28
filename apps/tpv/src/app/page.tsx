"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePOSStore } from "@/store/usePOSStore";
import POS_SPA from "./spa/page";

/**
 * Root Page of TPV
 * Handles the logic of redirecting to /setup if the device is not linked,
 * or rendering the main SPA if it is.
 */
export default function RootPage() {
  const router = useRouter();
  const hasHydrated = usePOSStore((s) => s._hasHydrated);
  const themeChosen = usePOSStore((s) => s.themeChosen);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;

    const restId = localStorage.getItem("restaurantId");
    const locId  = localStorage.getItem("locationId");

    if (!restId || !locId) {
      router.replace("/setup");
      return;
    }

    // Device is linked. Check if theme is set.
    if (!themeChosen) {
      router.replace("/setup?step=appearance");
      return;
    }

    setIsConfigured(true);
  }, [hasHydrated, themeChosen, router]);

  if (!hasHydrated || !isConfigured) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-4">
        <div className="text-4xl animate-bounce">🍔</div>
        <p className="text-white/40 font-syne font-bold animate-pulse">MRTPVREST · TPV</p>
      </div>
    );
  }

  // Render the main SPA directly at the root for a seamless experience
  return <POS_SPA />;
}
