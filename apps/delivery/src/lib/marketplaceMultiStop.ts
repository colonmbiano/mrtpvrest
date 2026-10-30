/** Isolated staging pilot; never sends real orders or payment instructions. */
import api from './api';
const URL = '/api/marketplace/dispatch/couriers';

export interface MultiOffer {
  offerId: string; tripId: string; source: 'SHARED'; pickupCount: number;
  payoutAmount: number; currency: 'MXN'; expiresAt: string;
}
export interface MultiStop {
  taskId: string; merchantId: string; storeName: string;
  pickupAddress: string; status: 'PENDING' | 'PICKED_UP' | 'DELIVERED';
}
export interface MultiTrip {
  id: string; status: 'ASSIGNED' | 'DELIVERED'; version: number;
  currency: 'MXN'; payoutAmount: number; pickupCount: number; pickedCount: number;
  deliveryAddress: string | null; stops: MultiStop[];
}
export const MULTISTOP_PILOT_ENABLED = process.env.NEXT_PUBLIC_MULTISTOP_PILOT === 'true';

function requirePilot() {
  if (!MULTISTOP_PILOT_ENABLED) throw new Error('Piloto multi-comercio deshabilitado');
}
export async function fetchMultiOffers(): Promise<MultiOffer[]> {
  requirePilot();
  const { data } = await api.get(URL + '/me/multi-offers');
  if (!Array.isArray(data?.offers)) throw new Error('Respuesta de ofertas inválida');
  return data.offers.filter((offer: MultiOffer) =>
    offer && typeof offer.offerId === 'string' && typeof offer.tripId === 'string'
    && offer.currency === 'MXN' && offer.source === 'SHARED'
    && Number.isInteger(offer.pickupCount) && offer.pickupCount >= 2
    && Number.isFinite(offer.payoutAmount) && offer.payoutAmount > 0
    && Number.isFinite(Date.parse(offer.expiresAt)) && Date.parse(offer.expiresAt) > Date.now());
}
export async function fetchMultiTrips(): Promise<MultiTrip[]> {
  requirePilot();
  const { data } = await api.get(URL + '/me/multi-trips');
  if (!Array.isArray(data?.trips)) throw new Error('Respuesta de rutas inválida');
  return data.trips.filter((trip: MultiTrip) =>
    trip && typeof trip.id === 'string' && Number.isInteger(trip.version)
    && Array.isArray(trip.stops) && trip.stops.length >= 2);
}
export async function acceptMultiOffer(offerId: string): Promise<MultiTrip> {
  requirePilot();
  if (!offerId) throw new Error('Oferta inválida');
  const { data } = await api.post(URL + '/multi-offers/' + encodeURIComponent(offerId) + '/accept', {});
  if (data?.success !== true || !data.trip?.id) throw new Error('Asignación no confirmada');
  return data.trip;
}
export async function pickupMultiStop(trip: MultiTrip, taskId: string, pin: string): Promise<MultiTrip> {
  requirePilot();
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Introduce el PIN de recogida de 4 a 6 dígitos.');
  const { data } = await api.post(URL + '/multi-trips/' + encodeURIComponent(trip.id)
    + '/stops/' + encodeURIComponent(taskId) + '/pickup',
  { pickupPin: pin, expectedVersion: trip.version });
  if (data?.success !== true || !data.trip?.id) throw new Error('El servidor no confirmó la recogida');
  return data.trip;
}
export async function deliverMultiTrip(trip: MultiTrip, pin: string): Promise<MultiTrip> {
  requirePilot();
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Introduce el PIN de entrega de 4 a 6 dígitos.');
  const { data } = await api.post(URL + '/multi-trips/' + encodeURIComponent(trip.id)
    + '/deliver', { deliveryPin: pin, expectedVersion: trip.version });
  if (data?.success !== true || data.trip?.status !== 'DELIVERED') throw new Error('Entrega sin confirmar');
  return data.trip;
}
