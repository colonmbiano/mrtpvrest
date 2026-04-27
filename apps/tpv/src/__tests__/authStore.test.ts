/**
 * authStore.test.ts
 * Pruebas unitarias para el authStore del TPV.
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import { renderHook, act } from "@testing-library/react";
import { useAuthStore } from "@/store/authStore";

// Mock de api
jest.mock("@/lib/api", () => ({
  post: jest.fn(),
  get: jest.fn(),
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

describe("useAuthStore", () => {
  beforeEach(() => {
    // Resetear store
    useAuthStore.setState({
      employee: null,
      token: null,
      isAuthenticated: false,
      activeShift: null,
      pinAttempts: 0,
      lockedUntil: null,
    });
    Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]);
    Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
    jest.clearAllMocks();
  });

  describe("loginWithPin", () => {
    it("debe autenticar con PIN correcto", async () => {
      const mockEmployee = { id: "emp-1", name: "Juan", role: "CASHIER" as const };
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
      const mockEmployee = { id: "emp-1", name: "Ana", role: "ADMIN" as const };
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

  describe("logout", () => {
    it("debe limpiar sesión completamente", async () => {
      useAuthStore.setState({
        employee: { id: "e1", name: "Test", role: "CASHIER" },
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
