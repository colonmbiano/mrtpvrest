/**
 * authStore.ts
 * UNIFIED Auth Store for MRTPV TPV.
 * Supports:
 * - Offline-First PIN validation (local hashing & comparison).
 * - Online fallback / sync via API.
 * - RBAC (Permissions).
 * - Rate-limiting (5 failed attempts = 2 min lockout).
 * - Persistent employee list for offline use.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import api from "@/lib/api";
import { hashPin } from "@/lib/hash";

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 2 * 60 * 1000; // 2 minutos

export type UserRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "CASHIER"
  | "WAITER"
  | "KITCHEN"
  | "COOK"
  | "DELIVERY";

export type Permission =
  | "void_item"
  | "void_order"
  | "apply_discount"
  | "comp_item"
  | "open_cash_drawer"
  | "process_refund"
  | "close_register"
  | "transfer_table";

export interface TPVEmployee {
  id: string;
  name: string;
  role: UserRole;
  pin?: string; // SHA256 hash (only for offline cache)
  isActive: boolean;
  permissions: Permission[];
  locationId?: string;
  restaurantId?: string;
  lastSync?: number;
}

// Retro-compatibility aliases
export type EmployeeRole = UserRole;
export type AuthEmployee = TPVEmployee;
export type OfflineEmployee = TPVEmployee;

interface AuthState {
  /* Session */
  employee: TPVEmployee | null;
  token: string | null;
  isAuthenticated: boolean;
  activeShift: Record<string, unknown> | null;

  /* Offline cache */
  employees: TPVEmployee[];

  /* UI / State */
  loading: boolean;
  error: string | null;

  /* Rate-limiting PIN */
  pinAttempts: number;
  lockedUntil: number | null; // timestamp ms

  /* Actions */
  loginWithPin: (
    pin: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  setEmployees: (employees: TPVEmployee[]) => void;
  hasPermission: (permission: Permission) => boolean;
  isLocked: () => boolean;
  getRemainingLockSeconds: () => number;
  setActiveShift: (shift: Record<string, unknown> | null) => void;
  refreshShift: () => Promise<void>;
  hydrateFromStorage: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      employee: null,
      token: null,
      isAuthenticated: false,
      activeShift: null,
      employees: [],
      loading: false,
      error: null,
      pinAttempts: 0,
      lockedUntil: null,

      isLocked: () => {
        const { lockedUntil } = get();
        if (!lockedUntil) return false;
        if (Date.now() >= lockedUntil) {
          set({ lockedUntil: null, pinAttempts: 0 });
          return false;
        }
        return true;
      },

      getRemainingLockSeconds: () => {
        const { lockedUntil } = get();
        if (!lockedUntil) return 0;
        return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      },

      hasPermission: (permission: Permission) => {
        const { employee } = get();
        if (!employee) return false;
        // Owners and Admins usually have all permissions
        if (employee.role === "OWNER" || employee.role === "ADMIN") return true;
        return employee.permissions.includes(permission);
      },

      loginWithPin: async (pin: string) => {
        set({ loading: true, error: null });
        const state = get();

        // 1. Check Rate-limiting
        if (state.isLocked()) {
          const secs = state.getRemainingLockSeconds();
          const msg = `Bloqueado. Intenta en ${secs}s`;
          set({ loading: false, error: msg });
          return { success: false, error: msg };
        }

        try {
          // 2. Try OFFLINE validation first
          const pinHash = await hashPin(pin);
          const offlineMatch = state.employees.find(
            (e) => e.pin === pinHash && e.isActive
          );

          if (offlineMatch) {
            // Local match found!
            set({
              employee: offlineMatch,
              isAuthenticated: true,
              pinAttempts: 0,
              lockedUntil: null,
              loading: false,
            });

            // Set cookies/localStorage for middleware and API
            if (typeof window !== "undefined") {
              document.cookie = `tpv-session-active=true; path=/; SameSite=Lax`;
              localStorage.setItem("currentEmployeeId", offlineMatch.id);
              localStorage.setItem("currentEmployeeName", offlineMatch.name);
              localStorage.setItem("currentEmployeeRole", offlineMatch.role);
            }

            return { success: true };
          }

          // 3. If no offline match, try ONLINE fallback
          try {
            const { data } = await api.post("/api/employees/login", { pin });
            const token: string = data.token || data.accessToken;
            const employee: TPVEmployee = data.employee || data.user;

            if (!token || !employee) {
              throw new Error("Respuesta incompleta");
            }

            set({
              employee,
              token,
              isAuthenticated: true,
              pinAttempts: 0,
              lockedUntil: null,
              loading: false,
            });

            if (typeof window !== "undefined") {
              sessionStorage.setItem("tpv-access-token", token);
              localStorage.setItem("accessToken", token);
              localStorage.setItem("tpv-employee-token", token);
              document.cookie = `tpv-session-active=true; path=/; SameSite=Lax`;
            }

            return { success: true };
          } catch (apiErr) {
            // Online login also failed
            throw new Error("PIN incorrecto");
          }
        } catch (err) {
          // Failure handling (increment attempts)
          const newAttempts = get().pinAttempts + 1;
          const shouldLock = newAttempts >= MAX_PIN_ATTEMPTS;
          set({
            pinAttempts: newAttempts,
            lockedUntil: shouldLock ? Date.now() + LOCKOUT_MS : null,
            loading: false,
            error: "PIN incorrecto",
          });

          const attemptsLeft = MAX_PIN_ATTEMPTS - newAttempts;
          const msg = shouldLock
            ? "Demasiados intentos fallidos. Bloqueado 2 minutos."
            : `PIN incorrecto. ${attemptsLeft > 0 ? `${attemptsLeft} intento(s) restantes.` : ""}`;
          return { success: false, error: msg };
        }
      },

      logout: () => {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("tpv-access-token");
          sessionStorage.removeItem("tpv-employee");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("tpv-employee-token");
          localStorage.removeItem("currentEmployeeId");
          localStorage.removeItem("currentEmployeeName");
          localStorage.removeItem("currentEmployeeRole");
          localStorage.removeItem("currentEmployeePermissions");
          document.cookie = `tpv-session-active=; path=/; max-age=0; SameSite=Lax`;
        }
        set({
          employee: null,
          token: null,
          isAuthenticated: false,
          activeShift: null,
          pinAttempts: 0,
          lockedUntil: null,
          error: null,
        });
      },

      setEmployees: (employees) => {
        set({ employees });
      },

      setActiveShift: (shift) => set({ activeShift: shift }),

      refreshShift: async () => {
        try {
          const { data } = await api.get("/api/shifts/active");
          set({ activeShift: data });
        } catch {
          set({ activeShift: null });
        }
      },

      hydrateFromStorage: () => {
        if (typeof window === "undefined") return;
        try {
          const token =
            sessionStorage.getItem("tpv-access-token") ||
            localStorage.getItem("accessToken");
          const empId = localStorage.getItem("currentEmployeeId");
          
          if (token || empId) {
             // Basic hydration logic - complex apps might need a profile check
             // For now, let persist handle the main state.
          }
        } catch {
          // ignore
        }
      },
    }),
    {
      name: "tpv-auth-storage",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? localStorage
          : (undefined as unknown as Storage)
      ),
      // We persist employee session and the offline cache
      partialize: (state) => ({
        employee: state.employee,
        employees: state.employees,
        isAuthenticated: state.isAuthenticated,
        token: state.token,
        pinAttempts: state.pinAttempts,
        lockedUntil: state.lockedUntil,
      }),
    }
  )
);
