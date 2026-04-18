import axios, { AxiosInstance } from 'axios';
import { getItem, StorageKeys } from './storage';

export const API_BASE_URL = 'https://api.mrtpvrest.com';

/**
 * Shared axios instance pointed at the mrtpvrest API.
 *
 * An interceptor pulls the current accessToken from SecureStore on every
 * request, so callers don't have to thread the token manually. If there is
 * no token yet (e.g. during login itself), the Authorization header is
 * simply omitted.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  // Prefer the employee session token once the employee has clocked in;
  // otherwise fall back to the device's accessToken (admin pairing token).
  const [employeeToken, accessToken, locationId, restaurantId] = await Promise.all([
    getItem(StorageKeys.employeeToken),
    getItem(StorageKeys.accessToken),
    getItem(StorageKeys.locationId),
    getItem(StorageKeys.restaurantId),
  ]);
  const token = employeeToken ?? accessToken;

  config.headers = config.headers ?? {};
  const headers = config.headers as Record<string, string>;
  if (token) headers.Authorization = `Bearer ${token}`;
  // Backend tenant middleware reads both headers to scope multi-tenant queries.
  if (restaurantId) headers['x-restaurant-id'] = restaurantId;
  if (locationId) headers['x-location-id'] = locationId;

  return config;
});

/**
 * Shape of a single location entry returned by GET /api/auth/my-locations.
 * We only depend on the fields we actually render; extra fields pass through.
 */
export interface LocationDto {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  isActive?: boolean;
}

export async function fetchMyLocations(): Promise<LocationDto[]> {
  const { data } = await api.get('/api/auth/my-locations');
  // Accept either a raw array or a wrapper { locations: [...] }.
  if (Array.isArray(data)) return data as LocationDto[];
  if (Array.isArray(data?.locations)) return data.locations as LocationDto[];
  if (Array.isArray(data?.data)) return data.data as LocationDto[];
  return [];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    restaurantId: string;
    restaurantSlug: string;
    [k: string]: unknown;
  };
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/api/auth/login', {
    email,
    password,
  });
  return data;
}

export interface EmployeeDto {
  id: string;
  name: string;
  role: string;
  photo?: string | null;
  locationId: string;
  [k: string]: unknown;
}

export interface EmployeeLoginResponse {
  employee: EmployeeDto;
  token: string;
}

/**
 * POST /api/employees/login — verifies a PIN against the currently-paired
 * location. The x-location-id header is injected automatically by the
 * request interceptor. Throws on 401 (wrong PIN) or network errors.
 */
export async function employeePinLogin(
  pin: string,
): Promise<EmployeeLoginResponse> {
  const { data } = await api.post<EmployeeLoginResponse>(
    '/api/employees/login',
    { pin },
  );
  return data;
}

// ─── Orders (tickets) ──────────────────────────────────────────────────────

/** Order status values used by the backend (`OrderStatus` enum). */
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

/**
 * Shape of a single line item inside an Order.
 * Matches the OrderItem model + the `menuItem` relation the backend includes
 * on both GET /api/orders/admin and GET /api/orders/:id.
 */
export interface OrderItemDto {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes?: string | null;
  menuItem?: { name?: string; categoryId?: string | null } | null;
}

/** Minimal Order shape we depend on. Extra fields pass through. */
export interface OrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderType: string; // 'DINE_IN' | 'TAKEOUT' | 'DELIVERY' | ...
  source: string; // 'TPV' | 'WAITER' | 'ONLINE' | 'KIOSK' | ...
  tableNumber: number | null;
  customerName: string | null;
  total: number;
  subtotal: number;
  discount?: number;
  paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  cashCollected?: boolean;
  notes?: string | null;
  createdAt: string;
  items?: OrderItemDto[];
  [k: string]: unknown;
}

/**
 * Orders we consider "active" — i.e. still in the kitchen/floor workflow.
 * Mirrors the filter used by apps/tpv.
 */
export const INACTIVE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'DELIVERED',
  'CANCELLED',
]);

export function isActiveOrder(o: Pick<OrderDto, 'status'>): boolean {
  return !INACTIVE_STATUSES.has(o.status);
}

/**
 * GET /api/orders/admin — returns up to 200 orders for the paired location,
 * most recent first. Requires an ADMIN/SUPER_ADMIN employee token.
 *
 * The server does NOT pre-filter by status (it returns everything for the
 * location), so we filter client-side via `isActiveOrder`.
 */
export async function fetchActiveOrders(): Promise<OrderDto[]> {
  const { data } = await api.get<OrderDto[]>('/api/orders/admin');
  if (!Array.isArray(data)) return [];
  return data.filter(isActiveOrder);
}

/**
 * PUT /api/orders/:id/confirm-cash — marks an order as paid in cash:
 *   cashCollected = true, cashCollectedAt = now(),
 *   paymentStatus = 'PAID', paidAt = now().
 *
 * Only requires a valid authenticated token (no ADMIN gate). This is the
 * canonical "cobrar" flow mirrored from apps/tpv.
 */
export async function confirmCashPayment(
  orderId: string,
  collectedBy = 'MOBILE_TPV',
): Promise<OrderDto> {
  const { data } = await api.put<OrderDto>(
    `/api/orders/${orderId}/confirm-cash`,
    { collectedBy },
  );
  return data;
}
