import { Capacitor } from "@capacitor/core";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { protectedStorage } from "../lib/protected-storage";
import { __resetTokenVaultForTests, initTokenVault, getToken, setToken } from "../lib/token-vault";

jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: jest.fn(), isPluginAvailable: jest.fn() } }));
jest.mock("capacitor-secure-storage-plugin", () => ({ SecureStoragePlugin: {
  keys: jest.fn(), get: jest.fn(), set: jest.fn(), remove: jest.fn(),
} }));
const native = new Map();
beforeEach(() => {
  jest.clearAllMocks(); native.clear(); localStorage.clear(); sessionStorage.clear(); __resetTokenVaultForTests();
  Capacitor.isNativePlatform.mockReturnValue(true); Capacitor.isPluginAvailable.mockReturnValue(true);
  SecureStoragePlugin.keys.mockImplementation(async () => ({ value: [...native.keys()] }));
  SecureStoragePlugin.get.mockImplementation(async ({ key }) => ({ value: native.get(key) }));
  SecureStoragePlugin.set.mockImplementation(async ({ key, value }) => { native.set(key, value); return { value: true }; });
});
test.each(["deviceToken", "tpv-auth-storage"])("migra %s y elimina la copia sin cifrar", async (key) => {
  localStorage.setItem(key, "fixture");
  expect(await protectedStorage.getItem(key)).toBe("fixture");
  expect(native.get(key)).toBe("fixture");
  expect(localStorage.getItem(key)).toBeNull();
});
test("un error de cifrado no borra la única copia durante la migración", async () => {
  localStorage.setItem("deviceToken", "fixture");
  SecureStoragePlugin.set.mockRejectedValueOnce(new Error("write failed"));
  await expect(protectedStorage.getItem("deviceToken")).rejects.toThrow("write failed");
  expect(localStorage.getItem("deviceToken")).toBe("fixture");
});
test("en Android no se crean credenciales nuevas sin cifrado", async () => {
  SecureStoragePlugin.set.mockRejectedValueOnce(new Error("write failed"));
  await expect(protectedStorage.setItem("deviceToken", "new")).rejects.toThrow();
  expect(localStorage.getItem("deviceToken")).toBeNull();
});
test("migra JWT legacy al almacén nativo y elimina copias", async () => {
  localStorage.setItem("accessToken", "legacy");
  await initTokenVault();
  expect(await getToken()).toBe("legacy");
  expect(native.get("tpv-jwt")).toBe("legacy");
  expect(localStorage.getItem("accessToken")).toBeNull();
});
test("logout durante hidratación no recupera un JWT anterior", async () => {
  native.set("tpv-jwt", "old");
  let release;
  SecureStoragePlugin.get.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const loading = initTokenVault();
  while (!release) await Promise.resolve();
  const logout = setToken(null);
  release({ value: "old" });
  await Promise.all([loading, logout]);
  expect(await getToken()).toBeNull();
  expect(native.get("tpv-jwt")).toBe("");
});
test("cambio rápido de empleado conserva el token más reciente", async () => {
  await Promise.all([setToken("first"), setToken("second")]);
  expect(await getToken()).toBe("second");
  expect(native.get("tpv-jwt")).toBe("second");
  expect(localStorage.getItem("accessToken")).toBeNull();
});
