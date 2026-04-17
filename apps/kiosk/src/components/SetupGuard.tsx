"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const rid = typeof window !== "undefined" ? localStorage.getItem("kiosk-restaurant-id") : null;
    if (!rid) {
      router.replace("/setup");
    } else {
      setOk(true);
    }
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}
