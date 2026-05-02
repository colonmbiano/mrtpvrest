import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER';

export type Permission =
  | 'void_item'
  | 'void_order'
  | 'apply_discount'
  | 'comp_item'
  | 'open_cash_drawer'
  | 'process_refund'
  | 'close_register'
  | 'transfer_table';

export interface OfflineEmployee {
  id: string;
  name: string;
  role: UserRole;
  pin: string; // SHA256 hash
  isActive: boolean;
  permissions: Permission[];
  lastSync: number; // timestamp
}

interface AuthState {
  currentEmployee: OfflineEmployee | null;
  employees: OfflineEmployee[];
  setCurrentEmployee: (employee: OfflineEmployee) => void;
  logoutEmployee: () => void;
  setEmployees: (employees: OfflineEmployee[]) => void;
  hasPermission: (permission: Permission) => boolean;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentEmployee: null,
      employees: [],
      setCurrentEmployee: (employee) => set({ currentEmployee: employee }),
      logoutEmployee: () => set({ currentEmployee: null }),
      setEmployees: (employees) => set({ employees }),
      hasPermission: (permission) => {
        const current = get().currentEmployee;
        if (!current) return false;
        return current.permissions.includes(permission);
      },
    }),
    {
      name: 'tpv-auth-store',
      storage: typeof window !== 'undefined' ? localStorage : undefined,
    }
  )
);

export default useAuthStore;
