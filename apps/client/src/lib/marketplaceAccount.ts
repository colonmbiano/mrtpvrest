// Cuenta global del comprador en el marketplace (app del cliente).
// Habla con /api/marketplace/identity del backend. La sesión vive en una cookie
// HttpOnly del host de la API (__Host-mrtpv_market): la tienda y la API son del
// mismo sitio (*.mrtpvrest.com), así que basta credentials: 'include'. La tienda
// nunca ve la sesión; solo recibe el token de comprador corto de /token, que
// guarda en memoria (nunca en localStorage) y manda a las APIs v1 como Bearer.
// La URL de la API y el fetch se inyectan para probarlo sin red.
import { getMarketplaceApiUrl, isMarketplaceAccountsEnabled } from './config';

export type AccountProfile = { role: string; status: string };
export type MarketplaceAccount = { id: string; name: string; email: string; emailVerified: boolean; profiles: AccountProfile[] };
export type AccountFailure = { ok: false; kind: 'config' | 'unavailable' | 'rejected'; code?: string; message: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

// Mensajes por código del backend. Los de registro y recuperación son genéricos a
// propósito: el servidor no revela si un correo existe.
const MESSAGES: Record<string, string> = {
  TERMS_ACCEPTANCE_REQUIRED: 'Acepta el aviso de privacidad y los términos para continuar.',
  INVALID_SIGNUP: 'Revisa tus datos: nombre, correo, teléfono de 10 dígitos, localidad y una contraseña de 12 a 128 caracteres.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos, o tu correo aún no está verificado.',
  INVALID_EMAIL: 'Escribe un correo electrónico válido.',
  INVALID_TOKEN: 'El enlace ya se usó o venció. Pide uno nuevo.',
  UNAUTHENTICATED: 'Tu sesión terminó. Vuelve a entrar.',
  CAPTCHA_REQUIRED: 'Completa la verificación de seguridad e inténtalo de nuevo.',
  ORIGIN_FORBIDDEN: 'Abre el marketplace desde su dirección oficial para continuar.',
  RATE_LIMIT: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  BUYER_PROFILE_REQUIRED: 'Tu cuenta no tiene perfil de cliente.',
  IDENTITY_UNAVAILABLE: 'Las cuentas no están disponibles en este momento. Inténtalo más tarde.',
};

function failure(kind: AccountFailure['kind'], message: string, code?: string): AccountFailure {
  return code ? { ok: false, kind, code, message } : { ok: false, kind, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAccountFailure(value: unknown): value is AccountFailure {
  return isRecord(value) && value.ok === false && typeof value.message === 'string';
}

function parseAccount(value: unknown): MarketplaceAccount | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.email !== 'string') return null;
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.filter((p): p is AccountProfile => isRecord(p) && typeof p.role === 'string' && typeof p.status === 'string')
    : [];
  return { id: value.id, name: typeof value.name === 'string' ? value.name : '', email: value.email,
    emailVerified: value.emailVerified === true, profiles };
}

async function identityRequest(path: string, init: { method: 'GET' | 'POST'; body?: unknown },
  { apiUrl = getMarketplaceApiUrl(), fetchImpl = fetch }: { apiUrl?: string | null; fetchImpl?: FetchLike } = {},
): Promise<{ ok: true; status: number; json: unknown } | AccountFailure> {
  if (!apiUrl) return failure('config', 'Las cuentas no están disponibles en este entorno.');
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}/api/marketplace/identity${path}`, {
      method: init.method,
      cache: 'no-store',
      // La cookie de sesión es del host de la API: sin esto el navegador no la manda.
      credentials: 'include',
      headers: { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return failure('unavailable', 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, json };
  const code = isRecord(json) && typeof json.code === 'string' ? json.code
    : isRecord(json) && typeof json.error === 'string' ? json.error : undefined;
  if (res.status >= 500) return failure('unavailable', MESSAGES.IDENTITY_UNAVAILABLE, code);
  return failure('rejected', (code && MESSAGES[code]) || 'No pudimos completar la solicitud.', code);
}

type Options = { apiUrl?: string | null; fetchImpl?: FetchLike };

export type SignupInput = { fullName: string; email: string; phone: string; city: string; password: string; termsAccepted: boolean; turnstileToken?: string };

// Respuesta genérica a propósito (202): no confirma si el correo ya tenía cuenta.
export async function registerBuyer(input: SignupInput, options?: Options): Promise<true | AccountFailure> {
  const result = await identityRequest('/register', { method: 'POST', body: { role: 'BUYER', ...input } }, options);
  return result.ok ? true : result;
}

export type CourierSignupInput = SignupInput & { vehicle: string; network: string };

// Registro real de repartidor independiente (rol COURIER). Igual que el comprador:
// respuesta genérica (202) y verificación por correo; la plataforma aprueba el perfil.
export async function registerCourier(input: CourierSignupInput, options?: Options): Promise<true | AccountFailure> {
  const result = await identityRequest('/register', { method: 'POST', body: { role: 'COURIER', ...input } }, options);
  return result.ok ? true : result;
}

export async function verifyEmail(token: string, options?: Options): Promise<true | AccountFailure> {
  if (!isLinkToken(token)) return failure('rejected', MESSAGES.INVALID_TOKEN, 'INVALID_TOKEN');
  const result = await identityRequest('/verify-email', { method: 'POST', body: { token } }, options);
  return result.ok ? true : result;
}

export async function resendVerification(email: string, turnstileToken: string | undefined, options?: Options): Promise<true | AccountFailure> {
  const result = await identityRequest('/resend-verification', { method: 'POST', body: { email, turnstileToken } }, options);
  return result.ok ? true : result;
}

export async function login(email: string, password: string, options?: Options): Promise<MarketplaceAccount | AccountFailure> {
  const result = await identityRequest('/login', { method: 'POST', body: { email, password } }, options);
  if (!result.ok) return result;
  clearBuyerToken();
  const account = isRecord(result.json) ? parseAccount(result.json.account) : null;
  return account ?? failure('unavailable', 'Respuesta de la cuenta fuera de contrato.');
}

// null = sin sesión (o vencida). Un error de red se distingue de "sin sesión".
export async function fetchCurrentAccount(options?: Options): Promise<MarketplaceAccount | null | AccountFailure> {
  const result = await identityRequest('/me', { method: 'GET' }, options);
  if (!result.ok) return result.code === 'UNAUTHENTICATED' ? null : result;
  const account = isRecord(result.json) ? parseAccount(result.json.account) : null;
  return account ?? failure('unavailable', 'Respuesta de la cuenta fuera de contrato.');
}

export async function logout(options?: Options): Promise<true | AccountFailure> {
  clearBuyerToken();
  const result = await identityRequest('/logout', { method: 'POST' }, options);
  return result.ok ? true : result;
}

export async function forgotPassword(email: string, turnstileToken: string | undefined, options?: Options): Promise<true | AccountFailure> {
  const result = await identityRequest('/password/forgot', { method: 'POST', body: { email, turnstileToken } }, options);
  return result.ok ? true : result;
}

export async function resetPassword(token: string, password: string, options?: Options): Promise<true | AccountFailure> {
  if (!isLinkToken(token)) return failure('rejected', MESSAGES.INVALID_TOKEN, 'INVALID_TOKEN');
  const result = await identityRequest('/password/reset', { method: 'POST', body: { token, password } }, options);
  clearBuyerToken();
  return result.ok ? true : result;
}

// Los correos enlazan a /registro/verificar#token=… y /registro/restablecer#token=…:
// el fragmento nunca llega a un servidor ni a sus logs.
export function isLinkToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function readLinkToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return isLinkToken(token) ? token : null;
}

export function checkPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Usa al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `Usa como máximo ${PASSWORD_MAX} caracteres.`;
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return null;
}

// Solo rutas internas: ?next= nunca lleva a otro sitio.
export function safeNextPath(value: unknown, fallback = '/cuenta'): string {
  return typeof value === 'string' && /^\/(?!\/)[^\\\s]*$/.test(value) ? value : fallback;
}

// ── Token de comprador ──────────────────────────────────────────────────────
// Dura 15 minutos; se renueva un minuto antes. Sin sesión se recuerda un rato
// para no preguntar en cada llamada del checkout.
let cached: { token: string; expiresAt: number } | null = null;
let anonymousUntil = 0;
let inflight: Promise<string | null> | null = null;

export function clearBuyerToken(): void {
  cached = null;
  anonymousUntil = 0;
}

export async function getBuyerToken({ apiUrl = getMarketplaceApiUrl(), fetchImpl = fetch, now = Date.now }:
  Options & { now?: () => number } = {}): Promise<string | null> {
  if (!isMarketplaceAccountsEnabled() || !apiUrl) return null;
  if (cached && cached.expiresAt - now() > 60_000) return cached.token;
  if (anonymousUntil > now()) return null;
  inflight ??= (async () => {
    const result = await identityRequest('/token', { method: 'POST' }, { apiUrl, fetchImpl });
    if (result.ok && isRecord(result.json) && typeof result.json.token === 'string'
      && typeof result.json.expiresIn === 'number' && result.json.expiresIn > 0) {
      cached = { token: result.json.token, expiresAt: now() + result.json.expiresIn * 1000 };
      return cached.token;
    }
    cached = null;
    // Sin sesión o sin perfil de cliente: se compra como invitado.
    if (!result.ok && result.kind === 'rejected') anonymousUntil = now() + 60_000;
    return null;
  })().finally(() => { inflight = null; });
  return inflight;
}
