import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useOfflineStore } from './useOfflineStore';

export const PRESENCE_TTL_MS = 90_000;

export interface CourierPresence {
  lat: number;
  lng: number;
  observedAt: number;
  expiresAt: number;
}

interface DeliveryState {
  driver: any | null;
  orders: any[];
  history: any[];
  isOnline: boolean;
  isShared: boolean;
  presence: CourierPresence | null;
  
  setDriver: (driver: any) => void;
  setOrders: (orders: any[]) => void;
  setHistory: (history: any[]) => void;
  setIsOnline: (status: boolean) => void;
  setIsShared: (status: boolean) => void;
  setPresence: (position: { lat: number; lng: number }, observedAt?: number) => boolean;
  getPresence: (now?: number) => CourierPresence | null;
  clearPresence: () => void;
  logout: () => void;
}

export const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set, get) => ({
      driver: null,
      orders: [],
      history: [],
      isOnline: false,
      isShared: false,
      presence: null,

      setDriver: (driver) => {
        if (get().driver?.id !== driver?.id) {
          useOfflineStore.getState().clearPinActions();
          set({ driver, orders: [], history: [], isOnline: false, isShared: false, presence: null });
        } else set({ driver });
      },
      setOrders: (orders) => set({ orders }),
      setHistory: (history) => set({ history }),
      setIsOnline: (isOnline) => set(isOnline ? { isOnline } : { isOnline, presence: null }),
      setIsShared: (isShared) => set({ isShared }),
      setPresence: ({ lat, lng }, observedAt = Date.now()) => {
        const now = Date.now();
        if (!get().driver || !get().isOnline || !Number.isFinite(lat) || !Number.isFinite(lng)
          || lat < -90 || lat > 90 || lng < -180 || lng > 180
          || !Number.isFinite(observedAt) || observedAt > now || observedAt + PRESENCE_TTL_MS <= now) return false;
        if (get().presence && observedAt < get().presence!.observedAt) return false;
        set({ presence: { lat, lng, observedAt, expiresAt: observedAt + PRESENCE_TTL_MS } });
        return true;
      },
      getPresence: (now = Date.now()) => {
        const { isOnline, presence } = get();
        return isOnline && presence && now >= presence.observedAt && now < presence.expiresAt ? presence : null;
      },
      clearPresence: () => set({ presence: null }),
      logout: () => {
        useOfflineStore.getState().clearPinActions();
        set({ driver: null, orders: [], history: [], isOnline: false, isShared: false, presence: null });
      },
    }),
    {
      name: 'delivery-app-storage',
      version: 1,
      migrate: (state) => state as DeliveryState,
      partialize: ({ driver, orders, history, isShared }) => ({ driver, orders, history, isShared }),
      merge: (saved, current) => {
        const state = (saved || {}) as Partial<DeliveryState>;
        return { ...current, driver: state.driver ?? null,
          orders: Array.isArray(state.orders) ? state.orders : [],
          history: Array.isArray(state.history) ? state.history : [],
          isShared: state.isShared === true, isOnline: false, presence: null };
      },
    }
  )
);
