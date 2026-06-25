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
import { setToken as vaultSetToken, getTokenSync } from "@/lib/token-vault";

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 2 * 60 * 1000; // 2 minutos
// Espera máxima por el JWT cuando el PIN ya validó contra el cache local.
// Sin esto, un backend colgado (TCP abierto sin respuesta) bloquearía el
// login indefinidamente aunque la caja pueda operar offline.
const LOGIN_TIMEOUT_MS = 8000;

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
  // ── Set canónico (RBAC real · Fase 10) ──
  | "apply_discount" // aplicar descuentos/cortesías (absorbe el legacy canDiscount)
  | "cancel_items" // anular productos ya enviados a cocina
  | "reopen_table" // reabrir una cuenta ya cobrada
  | "manage_users" // crear/editar empleados
  | "open_cash_drawer" // abrir cajón / cobrar
  | "view_expected_cash" // ver el efectivo esperado en el corte (rompe el corte ciego)
  | "manage_driver_cash" // recibir/cerrar el corte de los repartidores (caja del repartidor)
  // ── Legacy (aún referenciados por UI/ tests; sin enforcement de backend) ──
  | "void_item"
  | "void_order"
  | "comp_item"
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
        // `permissions` puede venir undefined en sesiones antiguas / payloads
        // incompletos — degradar a "sin permiso" en vez de crashear.
        return Array.isArray(employee.permissions)
          ? employee.permissions.includes(permission)
          : false;
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
          // La caja valida primero contra el cache local para que el acceso no
          // dependa de Internet. Si hay red, el JWT se renueva en segundo plano.
          const pinHash = await hashPin(pin);
          const localMatch = state.employees.find(
            (employee) => employee.pin === pinHash && employee.isActive,
          );
          const isOnline = typeof navigator === "undefined" || navigator.onLine;

          if (localMatch) {
            // Activa la sesión (estado + cookies + storages). Si llega `token`,
            // lo persiste en los storages que lee el interceptor de api.ts para
            // que TODA request posterior lleve Authorization.
            const activateSession = (employee: TPVEmployee, token?: string) => {
              set({
                employee,
                ...(token ? { token } : {}),
                isAuthenticated: true,
                pinAttempts: 0,
                lockedUntil: null,
                loading: false,
              });
              if (typeof window !== "undefined") {
                document.cookie = `tpv-session-active=true; path=/; SameSite=Lax`;
                document.cookie = `tpv-role=${encodeURIComponent(employee.role)}; path=/; SameSite=Lax`;
                localStorage.setItem("currentEmployeeId", employee.id);
                localStorage.setItem("currentEmployeeName", employee.name);
                localStorage.setItem("currentEmployeeRole", employee.role);
                if (token) {
                  // token-vault: secure storage en APK con plugin; en web y
                  // APKs viejos escribe las mismas llaves legacy de siempre.
                  // La memoria del vault se actualiza síncronamente.
                  void vaultSetToken(token);
                }
              }
            };

            if (isOnline) {
              // Con red: obtenemos el JWT ANTES de activar la sesión. Si no, el
              // hub consulta /api/workspaces/me sin token → 401 "Token requerido".
              // La espera es acotada: si el backend no responde en
              // LOGIN_TIMEOUT_MS, el timeout rechaza sin `response` y caemos a
              // la sesión local validada (mismo camino que red caída / 5xx).
              try {
                const { data } = await api.post(
                  "/api/employees/login",
                  { pin },
                  { timeout: LOGIN_TIMEOUT_MS },
                );
                const token: string = data.token || data.accessToken;
                const employee: TPVEmployee = data.employee || data.user;
                if (token && employee) {
                  activateSession(employee, token);
                  return { success: true };
                }
                // Red OK pero respuesta incompleta: sesión local degradada.
                activateSession(localMatch);
                return { success: true };
              } catch (apiErr: any) {
                const status = Number(apiErr?.response?.status ?? 0);
                if (status >= 400 && status < 500) {
                  // El servidor rechaza el PIN aunque el cache lo aceptara (PIN
                  // cambiado en backend). Prevalece el servidor: no entra.
                  throw new Error(apiErr.response?.data?.error || "PIN incorrecto");
                }
                // Red caída / 5xx → operamos offline con la validación local.
                activateSession(localMatch);
                return { success: true };
              }
            }

            // Sin red: sesión local inmediata (sin token), modo offline.
            activateSession(localMatch);
            return { success: true };
          }

          // Un PIN ausente del cache puede ser de un empleado recién creado;
          // en ese caso consultamos el backend cuando esté disponible.
          if (isOnline) {
            try {
              const { data } = await api.post("/api/employees/login", { pin });
              const token: string = data.token || data.accessToken;
              const employee: TPVEmployee = data.employee || data.user;

              if (token && employee) {
                set({
                  employee,
                  token,
                  isAuthenticated: true,
                  pinAttempts: 0,
                  lockedUntil: null,
                  loading: false,
                });

                if (typeof window !== "undefined") {
                  void vaultSetToken(token);
                  document.cookie = `tpv-session-active=true; path=/; SameSite=Lax`;
                  if (employee?.role) {
                    document.cookie = `tpv-role=${encodeURIComponent(employee.role)}; path=/; SameSite=Lax`;
                  }
                  localStorage.setItem("currentEmployeeId", employee.id);
                  localStorage.setItem("currentEmployeeName", employee.name);
                  localStorage.setItem("currentEmployeeRole", employee.role);
                }

                // Hidratar nombre de restaurante + sucursal desde backend.
                // No bloquea el login: si falla, los fallback de useTPVAuth siguen.
                try {
                  const meRes = await api.get("/api/employees/me");
                  const me = meRes?.data;
                  if (me?.restaurant?.name && me?.location?.name && typeof window !== "undefined") {
                    localStorage.setItem("restaurantId", me.restaurant.id);
                    localStorage.setItem("restaurantName", me.restaurant.name);
                    localStorage.setItem("locationId", me.location.id);
                    localStorage.setItem("locationName", me.location.name);
                  }
                } catch {
                  // Sin red o backend caído — ignorar, useTPVAuth reintentará al hidratar.
                }

                return { success: true };
              }
              // Respuesta incompleta del backend — tratar como error y NO caer
              // a offline (el server respondió, sólo mal formado).
              throw new Error("Respuesta incompleta");
            } catch (apiErr: any) {
              // Un 4xx confirma que el servidor rechazó el PIN. Los 5xx son
              // indisponibilidad del backend y deben usar el cache offline;
              // de lo contrario una caída del servicio cuenta como intentos
              // fallidos y puede bloquear injustamente la terminal.
              const status = Number(apiErr?.response?.status ?? 0);
              if (status >= 400 && status < 500) {
                throw new Error(apiErr.response?.data?.error || "PIN incorrecto");
              }
              // Sin response o con 5xx → red/backend caído, intentamos offline.
            }
          }

          throw new Error("PIN incorrecto");
        } catch (_err) {
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
          // vault limpia secure storage + llaves legacy del token.
          void vaultSetToken(null);
          sessionStorage.removeItem("tpv-employee");
          localStorage.removeItem("currentEmployeeId");
          localStorage.removeItem("currentEmployeeName");
          localStorage.removeItem("currentEmployeeRole");
          localStorage.removeItem("currentEmployeePermissions");
          document.cookie = `tpv-session-active=; path=/; max-age=0; SameSite=Lax`;
          document.cookie = `tpv-role=; path=/; max-age=0; SameSite=Lax`;
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
          const token = getTokenSync();
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
      // We persist employee session and the offline cache.
      // El token NO se persiste aquí: duplicaba el JWT en claro en
      // localStorage (tpv-auth-storage). Vive en token-vault; api.ts lo
      // resuelve de ahí, no de este estado.
      partialize: (state) => ({
        employee: state.employee,
        employees: state.employees,
        isAuthenticated: state.isAuthenticated,
        pinAttempts: state.pinAttempts,
        lockedUntil: state.lockedUntil,
      }),
    }
  )
);
