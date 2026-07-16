'use client';

// Auth de cliente final del storefront (correo + contraseña). El token JWT se
// guarda por tienda en localStorage. Sin cuentas multi-marca: cada tienda tiene
// su propio espacio de clientes.
import { getApiUrl } from './config';

const API = getApiUrl();

export type Customer = { id: string; name: string; email: string; phone: string | null };
export type AuthState = { token: string; customer: Customer };

const key = (slug: string) => `wagba:auth:${slug}`;

export function getAuth(slug: string): AuthState | null {
  try {
    const raw = localStorage.getItem(key(slug));
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch { return null; }
}

export function setAuth(slug: string, state: AuthState) {
  try { localStorage.setItem(key(slug), JSON.stringify(state)); } catch {}
}

export function clearAuth(slug: string) {
  try { localStorage.removeItem(key(slug)); } catch {}
}

export function authHeader(slug: string): Record<string, string> {
  const a = getAuth(slug);
  return a?.token ? { Authorization: `Bearer ${a.token}` } : {};
}

async function post(path: string, slug: string, body: any) {
  const res = await fetch(`${API}/api/store/${path}?r=${encodeURIComponent(slug)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Error');
  return data;
}

async function get(path: string, slug: string) {
  const res = await fetch(`${API}/api/store/${path}?r=${encodeURIComponent(slug)}`, {
    headers: { ...authHeader(slug) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Error');
  return data;
}

export async function registerCustomer(slug: string, body: { name: string; email: string; password: string; phone?: string }) {
  const data = await post('customer/register', slug, body);
  setAuth(slug, { token: data.token, customer: data.customer });
  return data.customer as Customer;
}

export async function loginCustomer(slug: string, email: string, password: string) {
  const data = await post('customer/login', slug, { email, password });
  setAuth(slug, { token: data.token, customer: data.customer });
  return data.customer as Customer;
}

export type LoyaltyInfo = {
  points: number; tier: string; totalEarned: number; qrCode: string | null;
  valuePesos: number; pointsValuePesos: number; pointsPerTen: number;
  transactions: { type: string; points: number; description: string; createdAt: string }[];
};

export type CustomerOrderItem = {
  menuItemId: string; name: string; price: number; quantity: number;
  notes: string | null;
  modifiers: { modifierId: string | null; name: string }[];
};

export type CustomerOrder = {
  id: string; orderNumber: string; status: string; orderType: string; total: number;
  paymentStatus: string; pointsEarned: number; createdAt: string;
  // Contacto/entrega del pedido → "Volver a pedir" los reusa como datos guardados.
  customerName: string | null; customerPhone: string | null;
  deliveryAddress: string | null; deliveryLat: number | null; deliveryLng: number | null;
  items: CustomerOrderItem[];
};

export const fetchMyOrders = (slug: string) => get('customer/orders', slug) as Promise<CustomerOrder[]>;
export const fetchMyLoyalty = (slug: string) => get('customer/loyalty', slug) as Promise<LoyaltyInfo>;
