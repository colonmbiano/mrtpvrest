// C5: estado de cuenta mensual de comisiones del Mercadito (pedidos en efectivo).
// Lógica pura del panel SaaS: validar la respuesta, formatear y llamar al backend.

export const COMMISSION_STATUSES = ['OPEN', 'TO_ISSUE', 'ISSUED', 'PAID'] as const;
export type CommissionStatus = typeof COMMISSION_STATUSES[number];

export interface CommissionStatement {
  restaurantId: string;
  restaurantName: string | null;
  period: string;
  status: CommissionStatus;
  ordersCount: number;
  salesCents: number;
  commissionCents: number;
  pendingCount: number;
  excludedCount: number;
  cancelledCount: number;
  issuedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
}
export interface CommissionTotals { merchants: number; commissionCents: number; paidCents: number; issuedCents: number; unissuedCents: number }
export interface CommissionList { period: string; currentPeriod: string; totals: CommissionTotals; items: CommissionStatement[] }

interface CommissionApi {
  get: (url: string, config: { params: Record<string, string>; signal?: AbortSignal }) => Promise<{ data: unknown }>;
  post: (url: string, body: unknown) => Promise<{ data: unknown }>;
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function formatCents(cents: number): string {
  return money.format(cents / 100);
}
export function monthLabel(period: string): string {
  if (!PERIOD.test(period)) return period;
  return `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}
/** Los últimos `count` meses hasta `current` incluido, del más reciente al más viejo. */
export function recentPeriods(current: string, count = 12): string[] {
  if (!PERIOD.test(current)) throw new Error('INVALID_PERIOD');
  let year = Number(current.slice(0, 4)); let month = Number(current.slice(5, 7));
  const periods: string[] = [];
  for (let i = 0; i < count; i++) {
    periods.push(`${year}-${String(month).padStart(2, '0')}`);
    month--; if (month === 0) { month = 12; year--; }
  }
  return periods;
}
export function statusLabel(status: CommissionStatus): string {
  return { OPEN: 'Mes en curso', TO_ISSUE: 'Por emitir', ISSUED: 'Emitido · por cobrar', PAID: 'Pagado' }[status];
}
/** Qué acción toca a cada fila. */
export function nextAction(item: CommissionStatement): 'ISSUE' | 'PAY' | null {
  if (item.status === 'TO_ISSUE' && item.ordersCount > 0 && item.pendingCount === 0 && item.excludedCount === 0) return 'ISSUE';
  if (item.status === 'ISSUED') return 'PAY';
  return null;
}

const isCents = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isCount = isCents;
const optionalText = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.length <= 500);

export function parseCommissionList(data: unknown): CommissionList {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_COMMISSIONS_RESPONSE');
  const body = data as Record<string, unknown>;
  const totals = body.totals as Record<string, unknown> | undefined;
  if (typeof body.period !== 'string' || !PERIOD.test(body.period) || typeof body.currentPeriod !== 'string' || !PERIOD.test(body.currentPeriod)
    || !totals || typeof totals !== 'object' || !isCount(totals.merchants)
    || !['commissionCents', 'paidCents', 'issuedCents', 'unissuedCents'].every(key => isCents(totals[key]))
    || !Array.isArray(body.items) || body.items.length > 5000) throw new Error('INVALID_COMMISSIONS_RESPONSE');
  const seen = new Set<string>();
  const items = body.items.map((row: unknown): CommissionStatement => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('INVALID_COMMISSIONS_RESPONSE');
    const item = row as Record<string, unknown>;
    if (typeof item.restaurantId !== 'string' || !ID.test(item.restaurantId) || seen.has(item.restaurantId)
      || item.period !== body.period || !COMMISSION_STATUSES.includes(item.status as CommissionStatus)
      || !isCount(item.ordersCount) || !isCents(item.salesCents) || !isCents(item.commissionCents)
      || (item.commissionCents as number) > (item.salesCents as number)
      || !optionalText(item.restaurantName) || !optionalText(item.issuedAt) || !optionalText(item.paidAt)
      || !optionalText(item.paymentReference)) throw new Error('INVALID_COMMISSIONS_RESPONSE');
    seen.add(item.restaurantId);
    const count = (value: unknown) => (isCount(value) ? value : 0);
    return {
      restaurantId: item.restaurantId, restaurantName: (item.restaurantName as string | null) ?? null, period: item.period as string,
      status: item.status as CommissionStatus, ordersCount: item.ordersCount as number, salesCents: item.salesCents as number,
      commissionCents: item.commissionCents as number, pendingCount: count(item.pendingCount), excludedCount: count(item.excludedCount),
      cancelledCount: count(item.cancelledCount), issuedAt: (item.issuedAt as string | null) ?? null,
      paidAt: (item.paidAt as string | null) ?? null, paymentReference: (item.paymentReference as string | null) ?? null,
    };
  });
  return { period: body.period, currentPeriod: body.currentPeriod, items,
    totals: { merchants: totals.merchants as number, commissionCents: totals.commissionCents as number, paidCents: totals.paidCents as number,
      issuedCents: totals.issuedCents as number, unissuedCents: totals.unissuedCents as number } };
}

export async function loadCommissionList(api: CommissionApi, { period, signal }: { period?: string; signal?: AbortSignal } = {}) {
  const params: Record<string, string> = {};
  if (period !== undefined) {
    if (!PERIOD.test(period)) throw new Error('INVALID_PERIOD');
    params.period = period;
  }
  const { data } = await api.get('/api/marketplace/v1/ops/commissions', { params, signal });
  const list = parseCommissionList(data);
  if (period !== undefined && list.period !== period) throw new Error('INVALID_COMMISSIONS_RESPONSE');
  return list;
}

function merchantPath(restaurantId: string, action: 'issue' | 'pay') {
  if (!ID.test(restaurantId)) throw new Error('INVALID_MERCHANT');
  return `/api/marketplace/v1/ops/commissions/${encodeURIComponent(restaurantId)}/${action}`;
}
export async function issueStatement(api: CommissionApi, restaurantId: string, period: string) {
  if (!PERIOD.test(period)) throw new Error('INVALID_PERIOD');
  await api.post(merchantPath(restaurantId, 'issue'), { period });
}
/** Devuelve el texto de error a mostrar si la referencia o la nota no sirven; null si están bien. */
export function paymentInputError(reference: string, note: string): string | null {
  const ref = reference.trim();
  if (ref.length < 3 || ref.length > 200) return 'La referencia debe tener entre 3 y 200 caracteres.';
  if (note.trim().length > 500) return 'La nota admite máximo 500 caracteres.';
  return null;
}
export async function payStatement(api: CommissionApi, restaurantId: string, period: string, reference: string, note = '') {
  if (!PERIOD.test(period)) throw new Error('INVALID_PERIOD');
  const problem = paymentInputError(reference, note);
  if (problem) throw new Error(problem);
  await api.post(merchantPath(restaurantId, 'pay'), { period, reference: reference.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
}

export function commissionError(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } } | null)?.response;
  if (response?.status === 401 || response?.status === 403) return 'No tienes autorización para administrar comisiones.';
  const message = response?.data?.error;
  if (typeof message === 'string' && message.length > 0 && message.length <= 300 && response?.status && response.status < 500) return message;
  return 'No se pudo completar la operación de comisiones. Intenta de nuevo.';
}
