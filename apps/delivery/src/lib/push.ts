// push.ts — suscripción Web Push del repartidor.
// Tras el login por PIN se pide permiso de notificaciones y se registra la
// suscripción en el backend con userId = `driver:<employeeId>` (así
// sendPushToDriver lo encuentra). Solo aplica en la PWA/navegador: el WebView
// de Capacitor (APK) no soporta Web Push — ahí haría falta FCM nativo.
import api from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export async function ensureDriverPushSubscription(driverId: string): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
    // El APK no registra SW (OTA) → sin Web Push ahí.
    if ((window as any).Capacitor?.isNativePlatform?.()) return false;

    // Pedir permiso (idealmente dentro del gesto de login). 'denied' es final.
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data } = await api.get('/api/notifications/vapid-public-key');
      if (!data?.key) return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key) as BufferSource,
      });
    }

    // Upsert por endpoint: re-loguearse o cambiar de repartidor en el mismo
    // celular re-apunta la suscripción al driver actual.
    await api.post('/api/notifications/subscribe', {
      subscription: sub.toJSON(),
      userId: `driver:${driverId}`,
    });
    return true;
  } catch (e) {
    console.warn('[push] No se pudo suscribir a notificaciones:', e);
    return false;
  }
}
