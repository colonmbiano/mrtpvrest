// Avisos push de los pedidos de la cuenta del comprador del marketplace. El navegador
// se suscribe con la llave pública VAPID del backend y la suscripción queda en la
// cuenta (PUT /api/marketplace/v1/push, con el token de comprador). El aviso lo
// muestra el service worker de producción (worker/index.js vía next-pwa); sin
// service worker (desarrollo) los avisos no están disponibles.
import { getBuyerToken } from './marketplaceAccount';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'on' | 'off';
export type PushResult = { ok: true } | { ok: false; message: string };

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(wait = true): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  try {
    const now = await navigator.serviceWorker.getRegistration();
    // Recién registrado aún instala (precarga); suscribirse pide el worker activo.
    if (!wait || (now && !now.installing && !now.waiting)) return now ?? null;
    if (!now && process.env.NEXT_PUBLIC_PWA_ENABLED !== 'true') return null;
    // En la primera visita ServiceWorkerRegister lo registra al terminar de cargar.
    return await Promise.race([navigator.serviceWorker.ready, new Promise<null>((done) => setTimeout(() => done(null), 15000))]);
  } catch { return null; }
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const reg = await registration();
  if (!reg) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

// La llave VAPID viene en base64url; PushManager la pide en bytes.
function vapidBytes(key: string): Uint8Array {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function authed(apiUrl: string, fetchImpl: FetchLike, method: 'PUT' | 'DELETE', body: unknown): Promise<PushResult> {
  const token = await getBuyerToken({ apiUrl, fetchImpl });
  if (!token) return { ok: false, message: 'Inicia sesión para activar los avisos.' };
  try {
    const res = await fetchImpl(`${apiUrl}/api/marketplace/v1/push`, {
      method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: res.status >= 500 ? 'Los avisos no están disponibles en este momento.' : 'No pudimos guardar tus avisos.' };
  } catch {
    return { ok: false, message: 'No pudimos conectar. Intenta de nuevo.' };
  }
}

export async function enablePush(apiUrl: string | null, fetchImpl: FetchLike = fetch): Promise<PushResult> {
  if (!apiUrl) return { ok: false, message: 'Los avisos no están disponibles en este entorno.' };
  if (!supported()) return { ok: false, message: 'Este navegador no admite avisos.' };
  const reg = await registration();
  if (!reg) return { ok: false, message: 'Los avisos funcionan en la app publicada o instalada.' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, message: 'Permite las notificaciones en tu navegador para recibir avisos.' };
  const token = await getBuyerToken({ apiUrl, fetchImpl });
  if (!token) return { ok: false, message: 'Inicia sesión para activar los avisos.' };
  let key: string | null = null;
  try {
    const res = await fetchImpl(`${apiUrl}/api/notifications/vapid-public-key`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => null) as { key?: unknown } | null;
    key = typeof json?.key === 'string' && json.key ? json.key : null;
  } catch { key = null; }
  if (!key) return { ok: false, message: 'Los avisos no están disponibles en este momento.' };
  let sub: PushSubscription;
  try {
    sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(key) as BufferSource });
  } catch {
    return { ok: false, message: 'No pudimos activar los avisos en este navegador.' };
  }
  return authed(apiUrl, fetchImpl, 'PUT', { subscription: sub.toJSON() });
}

// Al apagar o cerrar sesión: este navegador deja de recibir los avisos de la cuenta.
export async function disablePush(apiUrl: string | null, fetchImpl: FetchLike = fetch): Promise<PushResult> {
  // Sin service worker registrado no hay suscripción que dar de baja: no se espera.
  const reg = await registration(false);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!sub) return { ok: true };
  const result = apiUrl ? await authed(apiUrl, fetchImpl, 'DELETE', { endpoint: sub.endpoint }) : { ok: true as const };
  await sub.unsubscribe().catch(() => false);
  return result;
}
