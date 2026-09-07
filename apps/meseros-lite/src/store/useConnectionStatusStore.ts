"use client";

import { create } from "zustand";

export type ServerReachability = "unknown" | "available" | "unavailable";

interface ConnectionStatusState {
  serverReachability: ServerReachability;
  lastServerContactAt: number | null;
  markServerAvailable: () => void;
  markServerUnavailable: () => void;
}

export const useConnectionStatusStore = create<ConnectionStatusState>()((set) => ({
  serverReachability: "unknown",
  lastServerContactAt: null,
  markServerAvailable: () =>
    set({ serverReachability: "available", lastServerContactAt: Date.now() }),
  markServerUnavailable: () => set({ serverReachability: "unavailable" }),
}));
