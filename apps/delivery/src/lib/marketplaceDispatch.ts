'use strict';

/**
 * apps/delivery/src/lib/marketplaceDispatch.ts
 *
 * Cliente de despacho híbrido para la app de repartidores MRTPVREST.
 * Permite a los repartidores conectarse a la red compartida del marketplace,
 * recibir ofertas de múltiples tiendas, aceptar pedidos con CAS atómico y
 * validar la recolección y entrega con PIN de 4 a 6 dígitos.
 */

import api from './api';
import { useOfflineStore } from '../store/useOfflineStore';

const DISPATCH_URL = '/api/marketplace/dispatch/couriers';

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function canQueue(error: any): boolean {
  return !error?.response && (isOffline() || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error?.code));
}

function queuedPin(type: 'CONFIRM_PICKUP_PIN' | 'CONFIRM_DELIVERY_PIN', data: any) {
  const queueId = useOfflineStore.getState().addToQueue({ type, data });
  // A queued PIN has NOT been verified; never return success or advance order state.
  return { success: false, queued: true, queueId, error: 'Sin conexion: PIN pendiente de validacion.' };
}

export interface MarketplaceOffer {
  offerId: string;
  taskId: string;
  payoutAmount: number;
  currency: string;
  source: 'OWN' | 'SHARED';
  expiresAt: number; // Unix ms; datos disponibles en el contrato real del backend.
}

export interface PresencePayload {
  courierId: string;
  isOnline: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number;
  acceptingShared: boolean;
}

export interface AcceptOfferResult {
  ok?: boolean;
  success?: boolean;
  taskId: string;
  orderId?: string;
  assignment?: { id: string; courierId: string; source: string };
}

export interface PinConfirmResult {
  ok: boolean;
  status: string;
  orderStatusUpdate: string;
}

// Renovación de presencia: 55 s después de la última muestra aceptada (el
// despacho descarta GPS de más de 90 s). Si ya pasó ese tiempo —p. ej. al volver
// Internet tras un corte— toca de inmediato; un reloj que retrocede no la alarga.
export const PRESENCE_REFRESH_MS = 55000;
export function presenceRefreshDelay(lastSampleAt: number | null | undefined, now: number): number {
  if (typeof lastSampleAt !== 'number' || !Number.isFinite(lastSampleAt)) return 0;
  return Math.min(PRESENCE_REFRESH_MS, Math.max(0, PRESENCE_REFRESH_MS - (now - lastSampleAt)));
}

/**
 * Actualiza la presencia, disponibilidad y ubicación GPS del repartidor en el despachador.
 */
export async function updateCourierPresence(
  payload: PresencePayload,
  opts: { authToken?: string } = {},
): Promise<{ ok: boolean }> {
  if (!payload.courierId?.trim() || typeof payload.isOnline !== 'boolean'
    || typeof payload.acceptingShared !== 'boolean'
    || (payload.isOnline && (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)
      || (payload.lat as number) < -90 || (payload.lat as number) > 90
      || (payload.lng as number) < -180 || (payload.lng as number) > 180))
    || (payload.accuracy !== undefined && (!Number.isFinite(payload.accuracy) || payload.accuracy < 0))) {
    throw new Error('INVALID_PRESENCE');
  }
  // Exact contract: no customer name or obsolete isShared/name properties.
  const dataPayload = { courierId: payload.courierId, isOnline: payload.isOnline,
    acceptingShared: payload.acceptingShared,
    ...(payload.isOnline ? { lat: payload.lat, lng: payload.lng } : {}),
    ...(payload.accuracy !== undefined ? { accuracy: payload.accuracy } : {}) };
  // Al cerrar sesión el token ya salió del almacenamiento cuando axios arma la
  // petición (el interceptor corre después): por eso se puede pasar explícito.
  const config = opts.authToken ? { headers: { Authorization: `Bearer ${opts.authToken}` } } : undefined;
  const { data } = await api.post(`${DISPATCH_URL}/me/presence`, dataPayload, config);
  return { ...data, ok: data.ok === true || data.success === true };
}

/**
 * Consulta las ofertas activas disponibles para el repartidor en la red de marketplace.
 */
export async function getMarketplaceOffers(courierId: string): Promise<MarketplaceOffer[]> {
  const { data } = await api.get(`${DISPATCH_URL}/me/offers`, {
    params: { courierId },
  });
  const offers = Array.isArray(data) ? data : data?.offers;
  if (!Array.isArray(offers)) throw new Error('INVALID_OFFERS_RESPONSE');
  const now = Date.now();
  return offers.map((offer: any) => ({
    offerId: offer?.offerId || offer?.id,
    taskId: offer?.taskId,
    payoutAmount: offer?.payoutAmount,
    currency: offer?.currency,
    source: offer?.source,
    expiresAt: typeof offer?.expiresAt === 'number' ? offer.expiresAt : Date.parse(offer?.expiresAt),
  })).filter((offer: MarketplaceOffer) =>
    typeof offer.offerId === 'string' && offer.offerId.length > 0
    && typeof offer.taskId === 'string' && offer.taskId.length > 0
    && Number.isFinite(offer.payoutAmount) && offer.payoutAmount >= 0
    && offer.currency === 'MXN'
    && (offer.source === 'OWN' || offer.source === 'SHARED')
    && Number.isFinite(offer.expiresAt) && offer.expiresAt > now);
}

/**
 * Intenta aceptar una oferta de entrega mediante bloqueo atómico CAS (Compare-And-Swap).
 * Si otro repartidor gana la oferta simultáneamente, el backend responde 409 Conflict.
 */
export async function acceptMarketplaceOffer(
  courierId: string,
  offerId: string
): Promise<{ success: boolean; data?: AcceptOfferResult; error?: string; isConflict?: boolean }> {
  try {
    const { data } = await api.post(`${DISPATCH_URL}/offers/${encodeURIComponent(offerId)}/accept`, { courierId });
    return { success: data.ok === true || data.success === true, data };
  } catch (err: any) {
    if (err?.response?.status === 409) {
      return {
        success: false,
        isConflict: true,
        error: 'Esta orden ya fue tomada por otro repartidor en la red.',
      };
    }
    if (err?.response?.status === 410) {
      return {
        success: false,
        error: 'La oferta ha expirado.',
      };
    }
    return {
      success: false,
      error: err?.response?.data?.message || err?.message || 'Error al aceptar la oferta.',
    };
  }
}

/**
 * Confirma la recolección en el comercio mediante PIN de 4 a 6 dígitos proporcionado por la tienda.
 * Invariante de seguridad: Order.status pasa a 'ON_THE_WAY' solo si el PIN es verificado.
 */
export async function confirmPickupPin(
  courierId: string,
  taskId: string,
  pickupPin: string
): Promise<{ success: boolean; data?: PinConfirmResult; error?: string; queued?: boolean; queueId?: string }> {
  if (typeof pickupPin !== 'string' || !/^\d{4,6}$/.test(pickupPin.trim())) {
    return { success: false, error: 'El PIN de recolección debe ser de 4 a 6 dígitos.' };
  }
  const payload = { courierId, taskId, pickupPin: pickupPin.trim() };
  if (isOffline()) return queuedPin('CONFIRM_PICKUP_PIN', payload);
  try {
    const { data } = await api.post(`${DISPATCH_URL}/tasks/${encodeURIComponent(taskId)}/pickup`, payload);
    return { success: data.ok === true || data.success === true, data };
  } catch (err: any) {
    if (canQueue(err)) return queuedPin('CONFIRM_PICKUP_PIN', payload);
    const msg = err?.response?.data?.message || err?.message;
    return {
      success: false,
      error: err?.response?.status === 401 || err?.response?.data?.errorCode === 'INVALID_PIN'
        ? 'PIN de recolección incorrecto.' : msg || 'Error al validar recolección.',
    };
  }
}

/**
 * Confirma la entrega al cliente final mediante PIN de 4 a 6 dígitos proporcionado por el comprador.
 * Invariante de seguridad: Order.status pasa a 'DELIVERED' y se desbloquea la liquidación contable.
 */
export async function confirmDeliveryPin(
  courierId: string,
  taskId: string,
  deliveryPin: string,
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD_ONLINE' = 'CARD_ONLINE',
  cashCollected: boolean = false
): Promise<{ success: boolean; data?: PinConfirmResult; error?: string; queued?: boolean; queueId?: string }> {
  if (typeof deliveryPin !== 'string' || !/^\d{4,6}$/.test(deliveryPin.trim())) {
    return { success: false, error: 'El PIN de entrega debe ser de 4 a 6 dígitos.' };
  }
  const payload = { courierId, taskId, deliveryPin: deliveryPin.trim(), paymentMethod, cashCollected };
  if (isOffline()) return queuedPin('CONFIRM_DELIVERY_PIN', payload);
  try {
    const { data } = await api.post(`${DISPATCH_URL}/tasks/${encodeURIComponent(taskId)}/deliver`, payload);
    return { success: data.ok === true || data.success === true, data };
  } catch (err: any) {
    if (canQueue(err)) return queuedPin('CONFIRM_DELIVERY_PIN', payload);
    const msg = err?.response?.data?.message || err?.message;
    return {
      success: false,
      error: err?.response?.status === 401 || err?.response?.data?.errorCode === 'INVALID_PIN'
        ? 'PIN de entrega incorrecto.' : msg || 'Error al validar entrega.',
    };
  }
}
