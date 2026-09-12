import { canPerform } from "../lib/access";
import { useAuthStore } from "../store/authStore";
import api from "../lib/api";
import { getToken, setToken } from "../lib/token-vault";

jest.mock("../lib/token-vault", () => ({ getToken: jest.fn(), setToken: jest.fn(), initTokenVault: jest.fn() }));
jest.mock("../lib/protected-storage", () => ({ protectedStorage: {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
} }));
jest.mock("../lib/hash", () => ({ hashPin: jest.fn(async (pin) => `hash-${pin}`) }));

const employee = (role, permissions = []) => ({ id: "e1", role, name: "Prueba", isActive: true, permissions });
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  useAuthStore.getState().logout();
  useAuthStore.setState({ employees: [] });
  getToken.mockResolvedValue(null);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

test.each(["WAITER", "KITCHEN", "COOK", "DELIVERY"])("%s no cobra aunque tenga un permiso residual", (role) => {
  expect(canPerform(employee(role, ["open_cash_drawer"]), "pay")).toBe(false);
});
test("cajero requiere permiso de cobro y no administra", () => {
  expect(canPerform(employee("CASHIER"), "pay")).toBe(false);
  expect(canPerform(employee("CASHIER", ["open_cash_drawer"]), "pay")).toBe(true);
  for (const action of ["settings", "printers", "relink"]) expect(canPerform(employee("CASHIER"), action)).toBe(false);
});
test("administradores activos administran; inactivos no", () => {
  for (const role of ["ADMIN", "OWNER"]) for (const action of ["pay", "settings", "printers", "relink"]) {
    expect(canPerform(employee(role), action)).toBe(true);
    expect(canPerform({ ...employee(role), isActive: false }, action)).toBe(false);
  }
});
test("mesero puede enviar pedidos pendientes", () => {
  expect(canPerform(employee("WAITER"), "send")).toBe(true);
  expect(canPerform(null, "send")).toBe(false);
});

test("401 elimina sesión, rol y token sin perder vinculación", async () => {
  useAuthStore.setState({ employee: employee("ADMIN"), isAuthenticated: true, token: "expired" });
  localStorage.setItem("locationId", "loc1");
  localStorage.setItem("deviceToken", "device-fixture");
  localStorage.setItem("currentEmployeeRole", "ADMIN");
  document.cookie = "tpv-role=ADMIN; path=/";
  document.cookie = "tpv-session-active=true; path=/";
  getToken.mockResolvedValue("expired");
  await expect(api.get("/api/orders", { adapter: async (config) => {
    throw { config, response: { status: 401 } };
  } })).rejects.toBeDefined();
  expect(useAuthStore.getState().employee).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(setToken).toHaveBeenCalledWith(null);
  expect(localStorage.getItem("currentEmployeeRole")).toBeNull();
  expect(document.cookie).not.toContain("tpv-role=");
  expect(localStorage.getItem("locationId")).toBe("loc1");
  expect(localStorage.getItem("deviceToken")).toBe("device-fixture");
  await useAuthStore.persist.rehydrate();
  expect(useAuthStore.getState().employee).toBeNull();
});

test("401 de un login incorrecto no cierra otra sesión", async () => {
  useAuthStore.setState({ employee: employee("CASHIER"), isAuthenticated: true });
  await expect(api.post("/api/employees/login", {}, { adapter: async (config) => {
    throw { config, response: { status: 401 } };
  } })).rejects.toBeDefined();
  expect(useAuthStore.getState().employee?.role).toBe("CASHIER");
});

test("login offline de otro empleado elimina el JWT anterior", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  useAuthStore.setState({ employee: employee("ADMIN"), token: "admin-token", employees: [
    { ...employee("WAITER"), id: "e2", offlinePin: "hash-1234" },
  ] });
  expect((await useAuthStore.getState().loginWithPin("1234")).success).toBe(true);
  expect(useAuthStore.getState().employee.id).toBe("e2");
  expect(useAuthStore.getState().token).toBeNull();
  expect(setToken).toHaveBeenLastCalledWith(null);
});

test("sesión persistida conserva rol y permisos pero no JWT", async () => {
  useAuthStore.setState({ employee: employee("CASHIER", ["open_cash_drawer"]), isAuthenticated: true, token: "secret" });
  const persisted = localStorage.getItem("tpv-auth-storage");
  expect(persisted).not.toContain("secret");
  await useAuthStore.persist.rehydrate();
  expect(canPerform(useAuthStore.getState().employee, "pay")).toBe(true);
  expect(canPerform(useAuthStore.getState().employee, "settings")).toBe(false);
});
