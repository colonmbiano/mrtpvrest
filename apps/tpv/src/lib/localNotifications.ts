// localNotifications.ts
// Notificaciones nativas en la bandeja de Android para la tablet de caja.
// El TPV recibe los eventos de pago por socket (ver useNotifications) y aquí
// los materializa como notificación del sistema, para que el cajero las vea
// aunque el TPV esté minimizado o la pantalla en otra app.
//
// El plugin se carga por import dinámico (igual que el TCP de impresoras): así
// el build web no se rompe si el plugin no está, y en web simplemente es no-op
// (ahí ya hay sonido + notificación in-app).
import { Capacitor } from "@capacitor/core";

let pluginPromise: Promise<any | null> | null = null;
let permissionGranted: boolean | null = null;

async function loadPlugin(): Promise<any | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (!pluginPromise) {
    pluginPromise = import("@capacitor/local-notifications")
      .then((mod: any) => mod?.LocalNotifications ?? mod?.default ?? null)
      .catch(() => null);
  }
  return pluginPromise;
}

// Pide (una vez) el permiso de notificaciones. Android 13+ lo requiere en
// runtime. Idempotente: cachea el resultado. Llamar al arrancar el shell.
export async function ensureNotifPermission(): Promise<boolean> {
  const plugin = await loadPlugin();
  if (!plugin) return false;
  if (permissionGranted !== null) return permissionGranted;
  try {
    const current = await plugin.checkPermissions?.();
    if (current?.display === "granted") {
      permissionGranted = true;
      await ensureChannel(plugin);
      return true;
    }
    const req = await plugin.requestPermissions?.();
    permissionGranted = req?.display === "granted";
    if (permissionGranted) await ensureChannel(plugin);
    return permissionGranted;
  } catch {
    permissionGranted = false;
    return false;
  }
}

// Canal Android 8+. Sin un canal válido, el sistema descarta la notificación.
// importance 5 = HIGH (aparece como heads-up + sonido).
let channelReady = false;
async function ensureChannel(plugin: any): Promise<void> {
  if (channelReady || !plugin.createChannel) return;
  try {
    await plugin.createChannel({
      id: "pagos",
      name: "Pagos confirmados",
      description: "Avisos cuando se confirma el pago de un pedido",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    channelReady = true;
  } catch {
    /* si falla, fireLocalNotification cae al canal default igual */
  }
}

// Dispara una notificación inmediata en la bandeja. No lanza nunca: una
// notificación fallida jamás debe romper el flujo del TPV.
export async function fireLocalNotification(title: string, body: string): Promise<void> {
  const plugin = await loadPlugin();
  if (!plugin) return;
  try {
    const ok = await ensureNotifPermission();
    if (!ok) return;
    await plugin.schedule({
      notifications: [
        {
          // id entero único; sin `schedule.at` → se dispara de inmediato.
          id: Math.floor(Date.now() % 2147483600),
          title,
          body,
          channelId: "pagos",
          // Canal Android 8+. Si no existe, el plugin usa el default.
        },
      ],
    });
  } catch {
    /* noop — la notificación no debe romper el POS */
  }
}
