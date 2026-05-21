"use client";

import { useEffect } from "react";
import { initBackgroundSync } from "@/lib/offline";

export default function OfflineSyncInitializer() {
  useEffect(() => {
    initBackgroundSync();
  }, []);

  return null;
}
