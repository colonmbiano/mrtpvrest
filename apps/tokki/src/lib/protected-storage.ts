import { Capacitor } from "@capacitor/core";
import type { StateStorage } from "zustand/middleware";

// En Android, tanto la vinculación como el caché de PIN quedan cifrados.
// La migración borra el valor antiguo solo después de confirmar la escritura.
const pending = new Map<string, Promise<void>>();
async function nativeStore() {
  if (!Capacitor.isPluginAvailable("SecureStoragePlugin")) {
    throw new Error("Actualiza la app para guardar el acceso de forma segura.");
  }
  // El proxy de Capacitor no puede retornarse como thenable de una promesa.
  return { plugin: (await import("capacitor-secure-storage-plugin")).SecureStoragePlugin };
}

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("No se pudo abrir el almacenamiento seguro.")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

export const protectedStorage: StateStorage = {
  async getItem(key) {
    if (typeof window === "undefined") return null;
    if (!Capacitor.isNativePlatform()) return localStorage.getItem(key);
    await pending.get(key);
    const { plugin } = await nativeStore();
    const { value: keys } = await bounded(plugin.keys());
    const value = keys.includes(key) ? (await bounded(plugin.get({ key }))).value : null;
    if (value !== null) { localStorage.removeItem(key); return value; }
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      await bounded(plugin.set({ key, value: legacy }));
      localStorage.removeItem(key);
    }
    return legacy;
  },
  async setItem(key, value) {
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform()) { localStorage.setItem(key, value); return; }
    const write = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const { plugin } = await nativeStore();
      await bounded(plugin.set({ key, value }));
      localStorage.removeItem(key);
    });
    pending.set(key, write);
    try { await write; } finally { if (pending.get(key) === write) pending.delete(key); }
  },
  async removeItem(key) {
    if (typeof window === "undefined") return;
    await pending.get(key);
    if (Capacitor.isNativePlatform()) {
      const { plugin } = await nativeStore();
      // Sobrescribir permite invalidar también una clave inexistente.
      await bounded(plugin.set({ key, value: "" }));
    }
    localStorage.removeItem(key);
  },
};
