import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DeliveryState {
  driver: any | null;
  orders: any[];
  history: any[];
  isOnline: boolean;
  
  setDriver: (driver: any) => void;
  setOrders: (orders: any[]) => void;
  setHistory: (history: any[]) => void;
  setIsOnline: (status: boolean) => void;
  logout: () => void;
}

export const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set) => ({
      driver: null,
      orders: [],
      history: [],
      isOnline: true,

      setDriver: (driver) => set({ driver }),
      setOrders: (orders) => set({ orders }),
      setHistory: (history) => set({ history }),
      setIsOnline: (isOnline) => set({ isOnline }),
      logout: () => set({ driver: null, orders: [], history: [] }),
    }),
    {
      name: 'delivery-app-storage',
    }
  )
);
