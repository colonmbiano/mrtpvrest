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

// ─── Menu (categories + items) ─────────────────────────────────────────────

export interface CategoryDto {
  id: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  restaurantId?: string;
}

/**
 * A selectable variant of a menu item (e.g. size "Chico" / "Grande").
 * Variants are mutually exclusive; when one is selected its `price` REPLACES
 * the base item price (mirrors the pricing rule in apps/tpv).
 */
export interface MenuItemVariantDto {
  id: string;
  name: string;
  price: number;
  isAvailable?: boolean;
  sortOrder?: number;
}

/**
 * An optional, additive extra for a menu item (e.g. "Extra queso").
 * Multiple complements can be selected; each one's `price` is added to the
 * per-unit line total.
 */
export interface MenuItemComplementDto {
  id: string;
  name: string;
  price: number;
  isAvailable?: boolean;
  sortOrder?: number;
}

export interface MenuItemDto {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  imageUrl?: string | null;
  categoryId: string;
  isAvailable?: boolean;
  isPromo?: boolean;
  promoPrice?: number | null;
  isPopular?: boolean;
  /** Size/flavor picker (radio). May be empty. */
  variants?: MenuItemVariantDto[];
  /** Checkbox-style extras. May be empty. */
  complements?: MenuItemComplementDto[];
}

/** Current sale price for a menu item (handles promos transparently). */
export function effectivePrice(m: MenuItemDto): number {
  if (m.isPromo && typeof m.promoPrice === 'number') return m.promoPrice;
  return m.price;
}

/** True when the item requires the modifier modal (has any variant/complement). */
export function hasModifiers(m: MenuItemDto): boolean {
  return (
    (Array.isArray(m.variants) && m.variants.some((v) => v.isAvailable !== false)) ||
    (Array.isArray(m.complements) && m.complements.some((c) => c.isAvailable !== false))
  );
}

/**
 * Compute the per-unit price for a menu item with optional variant and
 * complements.
 *
 * Pricing rule (matches apps/tpv):
 *   base = variant.price if a variant is chosen, else effectivePrice(item)
 *   unit = base + sum(complement.price)
 */
export function computeUnitPrice(
  item: MenuItemDto,
  variant: MenuItemVariantDto | null,
  complements: MenuItemComplementDto[],
): number {
  const base = variant ? variant.price : effectivePrice(item);
  const extras = complements.reduce((s, c) => s + (c.price ?? 0), 0);
  return base + extras;
}

/**
 * Human-readable summary of selected modifiers, used both as the cart
 * line subtitle and as the `notes` payload sent to the backend. The
 * backend stores this verbatim on the OrderItem for the kitchen ticket.
 */
export function buildModifierNotes(
  variant: MenuItemVariantDto | null,
  complements: MenuItemComplementDto[],
): string {
  const parts: string[] = [];
  if (variant) parts.push(variant.name);
  for (const c of complements) parts.push(`+ ${c.name}`);
  return parts.join(', ');
}

/** GET /api/menu/categories — returns only active categories, sorted. */
export async function fetchMenuCategories(): Promise<CategoryDto[]> {
  const { data } = await api.get<CategoryDto[]>('/api/menu/categories');
  return Array.isArray(data) ? data : [];
}

/** GET /api/menu/items[?categoryId=...] — only available items for location. */
export async function fetchMenuItems(
  categoryId?: string,
): Promise<MenuItemDto[]> {
  const { data } = await api.get<MenuItemDto[]>('/api/menu/items', {
    params: categoryId ? { categoryId } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

// ─── New Order (create ticket) ─────────────────────────────────────────────

export type OrderType = 'DINE_IN' | 'TAKEOUT' | 'DELIVERY';
export type PaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'TRANSFER'
  | 'COURTESY'
  | 'PENDING';

export interface CreateTpvOrderItem {
  menuItemId: string;
  quantity: number;
  notes?: string | null;
}

export interface CreateTpvOrderPayload {
  items: CreateTpvOrderItem[];
  orderType: OrderType;
  tableNumber?: number | null;
  paymentMethod?: PaymentMethod;
  subtotal: number;
  discount?: number;
  total: number;
  customerName?: string | null;
  customerPhone?: string | null;
  status?: 'PREPARING' | 'CONFIRMED' | 'DELIVERED';
}

/**
 * POST /api/orders/tpv — create a new ticket from the mobile POS.
 *
 * The server re-reads prices from the DB per item (defense in depth) but
 * uses the client-provided subtotal/total for the order header. Requires
 * ADMIN employee token. Responds 200 with the full Order object.
 */
export async function createTpvOrder(
  payload: CreateTpvOrderPayload,
): Promise<OrderDto> {
  const { data } = await api.post<OrderDto>('/api/orders/tpv', payload);
  return data;
}

/**
 * POST /api/orders/:id/items — append a round of items to an already-open
 * ticket (same table, new order-in-the-order).
 *
 * The server re-prices each item from DB and recomputes subtotal/total on
 * the order header. Use this instead of createTpvOrder when the table
 * already has an active ticket and the mesero is taking a follow-up round
 * of drinks / postres / etc.
 *
 * Fails with:
 *   - 400 if the order is already PAID or in DELIVERED/CANCELLED state.
 *   - 403 if the order belongs to a different location than the device.
 *   - 404 if the id doesn't exist.
 */
export async function addItemsToOrder(
  orderId: string,
  items: CreateTpvOrderItem[],
): Promise<OrderDto> {
  const { data } = await api.post<OrderDto>(
    `/api/orders/${orderId}/items`,
    { items },
  );
  return data;
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
