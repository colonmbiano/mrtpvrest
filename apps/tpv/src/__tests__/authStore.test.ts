/**
 * authStore.test.ts
 * Pruebas unitarias para el authStore del TPV (offline-first).
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import { renderHook, act } from "@testing-library/react";
import { useAuthStore, type TPVEmployee } from "@/store/authStore";

// Mock de api
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

// Mock de hashPin para evitar dependencia de crypto.subtle en jsdom
jest.mock("@/lib/hash", () => ({
  hashPin: jest.fn(async (pin: string) => `hash-${pin}`),
}));

import api from "@/lib/api";
const mockApi = api as jest.Mocked<typeof api>;

// Mock de sessionStorage y localStorage
const mockSessionStorage: Record<string, string> = {};
const mockLocalStorage: Record<string, string> = {};

Object.defineProperty(window, "sessionStorage", {
  value: {
    getItem: (k: string) => mockSessionStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockSessionStorage[k] = v; },
    removeItem: (k: string) => { delete mockSessionStorage[k]; },
    clear: () => Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]),
  },
});

Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (k: string) => mockLocalStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockLocalStorage[k] = v; },
    removeItem: (k: string) => { delete mockLocalStorage[k]; },
    clear: () => Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]),
  },
});

describe("useAuthStore (offline-first)", () => {
  beforeEach(() => {
    // Resetear store
    useAuthStore.setState({
      employee: null,
      token: null,
      isAuthenticated: false,
      activeShift: null,
      employees: [],
      loading: false,
      error: null,
      pinAttempts: 0,
      lockedUntil: null,
    });
    Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]);
    Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
    jest.clearAllMocks();
  });

  describe("loginWithPin (online fallback)", () => {
    it("debe autenticar via API cuando no hay match offline", async () => {
      const mockEmployee: TPVEmployee = {
        id: "emp-1",
        name: "Juan",
        role: "CASHIER",
        isActive: true,
        permissions: [],
      };
      mockApi.post.mockResolvedValueOnce({
        data: { token: "tok-abc", employee: mockEmployee },
      } as never);

      const { result } = renderHook(() => useAuthStore());
      let res: { success: boolean; error?: string };

      await act(async () => {
        res = await result.current.loginWithPin("1234");
      });

      expect(res!.success).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.employee).toEqual(mockEmployee);
      expect(result.current.token).toBe("tok-abc");
      expect(result.current.pinAttempts).toBe(0);
      expect(mockApi.post).toHaveBeenCalledWith("/api/employees/login", { pin: "1234" });
    });

    it("debe contar intentos fallidos y bloquear tras 5", async () => {
      mockApi.post.mockRejectedValue(new Error("401 Unauthorized"));

      const { result } = renderHook(() => useAuthStore());

      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.loginWithPin("0000");
        });
      }

      expect(result.current.pinAttempts).toBe(5);
      expect(result.current.lockedUntil).not.toBeNull();
      expect(result.current.isLocked()).toBe(true);

      // Siguiente intento debe rechazarse localmente
      let res: { success: boolean; error?: string };
      await act(async () => {
        res = await result.current.loginWithPin("1234");
      });
      expect(res!.success).toBe(false);
      expect(res!.error).toMatch(/Bloqueado/);
      // No debe haber llamado a la API en el intento bloqueado
      expect(mockApi.post).toHaveBeenCalledTimes(5);
    });

    it("debe resetear intentos tras login exitoso", async () => {
      const mockEmployee: TPVEmployee = {
        id: "emp-1",
        name: "Ana",
        role: "ADMIN",
        isActive: true,
        permissions: [],
      };
      // Primero un intento fallido
      mockApi.post.mockRejectedValueOnce(new Error("401"));
      const { result } = renderHook(() => useAuthStore());
      await act(async () => { await result.current.loginWithPin("0000"); });
      expect(result.current.pinAttempts).toBe(1);

      // Luego login exitoso
      mockApi.post.mockResolvedValueOnce({
        data: { token: "tok-xyz", employee: mockEmployee },
      } as never);
      await act(async () => { await result.current.loginWithPin("9876"); });
      expect(result.current.pinAttempts).toBe(0);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe("loginWithPin (offline-first)", () => {
    it("debe autenticar offline si el PIN match en cache local (sin tocar API)", async () => {
      const localEmployee: TPVEmployee = {
        id: "emp-local-1",
        name: "Local Cashier",
        role: "CASHIER",
        pin: "hash-1234", // matches mocked hashPin("1234")
        isActive: true,
        permissions: ["void_item"],
      };
      useAuthStore.setState({ employees: [localEmployee] });

      const { result } = renderHook(() => useAuthStore());
      let res: { success: boolean; error?: string };
      await act(async () => {
        res = await result.current.loginWithPin("1234");
      });

      expect(res!.success).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.employee).toEqual(localEmployee);
      expect(mockApi.post).not.toHaveBeenCalled();
    });

    it("NO debe autenticar offline si el empleado está inactivo", async () => {
      const localEmployee: TPVEmployee = {
        id: "emp-inactive",
        name: "Disabled",
        role: "CASHIER",
        pin: "hash-1234",
        isActive: false,
        permissions: [],
      };
      useAuthStore.setState({ employees: [localEmployee] });
      mockApi.post.mockRejectedValueOnce(new Error("401"));

      const { result } = renderHook(() => useAuthStore());
      await act(async () => {
        await result.current.loginWithPin("1234");
      });

      // Cae al fallback online (que falla)
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockApi.post).toHaveBeenCalled();
    });
  });

  describe("hasPermission", () => {
    it("ADMIN tiene todas las permissions", () => {
      useAuthStore.setState({
        employee: {
          id: "e1",
          name: "Admin",
          role: "ADMIN",
          isActive: true,
          permissions: [],
        },
      });
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.hasPermission("void_item")).toBe(true);
      expect(result.current.hasPermission("close_register")).toBe(true);
    });

    it("CASHIER solo tiene las permissions explícitas", () => {
      useAuthStore.setState({
        employee: {
          id: "e1",
          name: "Cashier",
          role: "CASHIER",
          isActive: true,
          permissions: ["void_item"],
        },
      });
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.hasPermission("void_item")).toBe(true);
      expect(result.current.hasPermission("close_register")).toBe(false);
    });

    it("retorna false si no hay employee", () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.hasPermission("void_item")).toBe(false);
    });
  });

  describe("logout", () => {
    it("debe limpiar sesión completamente", async () => {
      useAuthStore.setState({
        employee: { id: "e1", name: "Test", role: "CASHIER", isActive: true, permissions: [] },
        token: "tok-123",
        isAuthenticated: true,
        activeShift: { id: "s1" },
      });
      mockSessionStorage["tpv-access-token"] = "tok-123";
      mockLocalStorage["accessToken"] = "tok-123";

      const { result } = renderHook(() => useAuthStore());
      act(() => { result.current.logout(); });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.employee).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.activeShift).toBeNull();
      expect(mockSessionStorage["tpv-access-token"]).toBeUndefined();
      expect(mockLocalStorage["accessToken"]).toBeUndefined();
    });

    it("NO debe borrar restaurantId ni locationId", async () => {
      mockLocalStorage["restaurantId"] = "rest-1";
      mockLocalStorage["locationId"] = "loc-1";
      useAuthStore.setState({ isAuthenticated: true, token: "t" });

      const { result } = renderHook(() => useAuthStore());
      act(() => { result.current.logout(); });

      expect(mockLocalStorage["restaurantId"]).toBe("rest-1");
      expect(mockLocalStorage["locationId"]).toBe("loc-1");
    });
  });

  describe("isLocked / getRemainingLockSeconds", () => {
    it("NO está bloqueado cuando lockedUntil es null", () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.isLocked()).toBe(false);
      expect(result.current.getRemainingLockSeconds()).toBe(0);
    });

    it("está bloqueado cuando lockedUntil es en el futuro", () => {
      useAuthStore.setState({ lockedUntil: Date.now() + 60_000 });
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.isLocked()).toBe(true);
      expect(result.current.getRemainingLockSeconds()).toBeGreaterThan(0);
    });

    it("auto-desbloquea cuando lockedUntil ya pasó", () => {
      act(() => {
        useAuthStore.setState({ lockedUntil: Date.now() - 1000, pinAttempts: 5 });
      });
      const { result } = renderHook(() => useAuthStore());

      let locked;
      act(() => {
        locked = result.current.isLocked();
      });

      expect(locked).toBe(false);
      expect(result.current.pinAttempts).toBe(0);
    });
  });
});
