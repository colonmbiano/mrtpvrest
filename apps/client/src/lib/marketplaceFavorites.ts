// Tiendas favoritas del comprador del marketplace (API v1, con el token de la cuenta).
// Sin sesión no se pide nada: la tienda manda a entrar. La URL y el fetch se inyectan.
import { getBuyerToken } from './marketplaceAccount';
import type { V1Failure } from './marketplaceV1Checkout';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type Options = { apiUrl: string | null; fetchImpl?: FetchLike };

export type FavoriteStore = { slug: string; name: string; logo: string | null; open: boolean; addedAt: string };

function failure(reason: V1Failure['reason'], message: string): V1Failure {
  return { ok: false, reason, message };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function parseFavorite(value: unknown): FavoriteStore | null {
  if (!isRecord(value) || typeof value.slug !== 'string' || !value.slug || typeof value.name !== 'string') return null;
  return { slug: value.slug, name: value.name, logo: typeof value.logo === 'string' ? value.logo : null,
    open: value.open === true, addedAt: typeof value.addedAt === 'string' ? value.addedAt : '' };
}

async function request(path: string, method: 'GET' | 'PUT' | 'DELETE', { apiUrl, fetchImpl = fetch }: Options):
  Promise<{ ok: true; status: number; json: unknown } | V1Failure> {
  if (!apiUrl) return failure('config', 'Los favoritos no están disponibles en este entorno.');
  const token = await getBuyerToken({ apiUrl, fetchImpl });
  if (!token) return failure('rejected', 'Inicia sesión para guardar tus tiendas favoritas.');
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}/api/marketplace/v1/favorites${path}`, {
      method, cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return failure('unavailable', 'No pudimos conectar. Intenta de nuevo.');
  }
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status >= 500) return failure('unavailable', 'Los favoritos no están disponibles en este momento.');
  if (!res.ok) return failure('rejected', isRecord(json) && typeof json.error === 'string' ? json.error : 'No pudimos guardar el cambio.');
  return { ok: true, status: res.status, json };
}

export async function listFavorites(options: Options): Promise<FavoriteStore[] | V1Failure> {
  const result = await request('', 'GET', options);
  if (!result.ok) return result;
  if (!isRecord(result.json) || !Array.isArray(result.json.merchants)) return failure('unavailable', 'Respuesta de favoritos fuera de contrato.');
  return result.json.merchants.map(parseFavorite).filter((f): f is FavoriteStore => f !== null);
}

export async function setFavorite(slug: string, favorite: boolean, options: Options): Promise<true | V1Failure> {
  const result = await request(`/${encodeURIComponent(slug)}`, favorite ? 'PUT' : 'DELETE', options);
  return result.ok ? true : result;
}
