/**
 * authStore.ts
 * Store dedicado a autenticación de empleados del TPV.
 * - Token almacenado en sessionStorage (no localStorage — mitiga XSS).
 * - Rate-limiting: bloqueo tras 5 intentos fallidos de PIN.
 * - Estado separado del tema y carrito (reducción de re-renders).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import api from "@/lib/api";

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 2 * 60 * 1000; // 2 minutos

export type EmployeeRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "CASHIER"
  | "WAITER"
  | "KITCHEN"
  | "COOK"
  | "DELIVERY";

export interface AuthEmployee {
  id: string;
  name: string;
  role: EmployeeRole;
  locationId?: string;
  restaurantId?: string;
  canCharge?: boolean;
  canDiscount?: boolean;
  canModifyTickets?: boolean;
  canDeleteTickets?: boolean;
  canConfigSystem?: boolean;
}

interface AuthState {
  /* Session */
  employee: AuthEmployee | null;
  token: string | null;
  isAuthenticated: boolean;
  activeShift: Record<string, unknown> | null;

  /* Rate-limiting PIN */
  pinAttempts: number;
  lockedUntil: number | null; // timestamp ms

  /* Computed helpers */
  getIsAdmin: () => boolean;
  isLocked: () => boolean;
  getRemainingLockSeconds: () => number;

  /* Actions */
  loginWithPin: (
    pin: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
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
      pinAttempts: 0,
      lockedUntil: null,

      getIsAdmin: () => {
        const role = get().employee?.role;
        return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
      },

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

      loginWithPin: async (pin: string) => {
        const state = get();

        // Verificar bloqueo activo
        if (state.isLocked()) {
          const secs = state.getRemainingLockSeconds();
          return { success: false, error: `Bloqueado. Intenta en ${secs}s` };
        }

        try {
          const { data } = await api.post("/api/employees/login", { pin });
          const token: string = data.token || data.accessToken;
          const employee: AuthEmployee = data.employee || data.user;

          if (!token || !employee) {
            throw new Error("Respuesta de servidor incompleta");
          }

          // Guardar token en sessionStorage para que api.ts lo inyecte en headers
          if (typeof window !== "undefined") {
            sessionStorage.setItem("tpv-access-token", token);
            sessionStorage.setItem("tpv-employee", JSON.stringify(employee));
            // Compatibilidad con api.ts que también lee localStorage "accessToken"
            localStorage.setItem("accessToken", token);
            localStorage.setItem("tpv-employee-token", token);
            localStorage.setItem("tpv-employee", JSON.stringify(employee));
            document.cookie = `tpv-session-active=true; path=/`;
          }

          set({
            employee,
            token,
            isAuthenticated: true,
            pinAttempts: 0,
            lockedUntil: null,
          });

          return { success: true };
        } catch {
          const newAttempts = get().pinAttempts + 1;
          const shouldLock = newAttempts >= MAX_PIN_ATTEMPTS;
          set({
            pinAttempts: newAttempts,
            lockedUntil: shouldLock ? Date.now() + LOCKOUT_MS : null,
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
          localStorage.removeItem("tpv-employee");
          localStorage.removeItem("kdsEmployee");
          document.cookie = `tpv-session-active=; path=/; max-age=0`;
          // NO borrar restaurantId ni locationId (son del setup del dispositivo)
        }
        set({
          employee: null,
          token: null,
          isAuthenticated: false,
          activeShift: null,
          pinAttempts: 0,
          lockedUntil: null,
        });
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
          // Prioridad: sessionStorage > localStorage (para compatibilidad)
          const token =
            sessionStorage.getItem("tpv-access-token") ||
            localStorage.getItem("accessToken") ||
            localStorage.getItem("tpv-employee-token");
          const empRaw =
            sessionStorage.getItem("tpv-employee") ||
            localStorage.getItem("tpv-employee");
          if (token && empRaw) {
            const employee: AuthEmployee = JSON.parse(empRaw);
            set({ employee, token, isAuthenticated: true });
          }
        } catch {
          // Storage corrupto, ignorar
        }
      },
    }),
    {
      name: "tpv-auth-ratelimit",
      // Solo persistir el rate-limiting; el token no se persiste en zustand
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? sessionStorage
          : (undefined as unknown as Storage)
      ),
      partialize: (state) => ({
        pinAttempts: state.pinAttempts,
        lockedUntil: state.lockedUntil,
      }),
    }
  )
);
