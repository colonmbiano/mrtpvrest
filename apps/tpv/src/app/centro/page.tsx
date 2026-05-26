"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /centro → /centro/resumen (default tab). No render — solo redirige.
export default function CentroIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/centro/resumen");
  }, [router]);
  return null;
}
