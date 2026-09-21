"use client";

import { useSyncExternalStore } from "react";
import {
  getBackendAvailability,
  subscribeBackendAvailability,
  type BackendAvailability,
} from "@/lib/backend-availability";

const getServerSnapshot = (): BackendAvailability => "unknown";

export function useBackendAvailability(): BackendAvailability {
  return useSyncExternalStore(
    subscribeBackendAvailability,
    getBackendAvailability,
    getServerSnapshot,
  );
}
