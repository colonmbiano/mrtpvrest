// Lógica de envío compartida entre el checkout legacy (StorefrontClient) y el
// checkout de los temas modernos (StoreCheckout). Espeja computeDeliveryFee del
// backend para mostrar una vista previa; el backend recalcula la verdad al cobrar.

export type DeliveryConfig = {
  mode: 'FLAT' | 'DISTANCE';
  flatFee: number;
  freeFrom: number | null;
  baseFee: number;
  perKm: number;
  freeRadiusKm: number | null;
  maxKm: number | null;
  origin: { lat: number; lng: number } | null;
};

export type DeliveryPreview = {
  fee: number;
  distanceKm: number | null;
  outOfRange: boolean;
  ready: boolean; // false → falta la ubicación del cliente para calcular el costo
};

// Distancia en km en línea recta (haversine).
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeDeliveryPreview(
  delivery: DeliveryConfig | undefined | null,
  total: number,
  coords: { lat: number; lng: number } | null
): DeliveryPreview {
  if (!delivery) return { fee: 0, distanceKm: null, outOfRange: false, ready: true };

  // Envío gratis por monto de compra.
  if (delivery.freeFrom != null && total >= delivery.freeFrom) {
    return { fee: 0, distanceKm: null, outOfRange: false, ready: true };
  }

  if (delivery.mode !== 'DISTANCE') {
    return { fee: delivery.flatFee || 0, distanceKm: null, outOfRange: false, ready: true };
  }

  // Modo distancia: necesitamos origen y coordenadas del cliente.
  if (!delivery.origin || !coords) {
    return { fee: delivery.baseFee || 0, distanceKm: null, outOfRange: false, ready: false };
  }

  const distanceKm = Math.round(haversineKm(delivery.origin.lat, delivery.origin.lng, coords.lat, coords.lng) * 100) / 100;
  if (delivery.maxKm != null && distanceKm > delivery.maxKm) {
    return { fee: 0, distanceKm, outOfRange: true, ready: true };
  }
  if (delivery.freeRadiusKm != null && distanceKm <= delivery.freeRadiusKm) {
    return { fee: 0, distanceKm, outOfRange: false, ready: true };
  }
  const fee = Math.round(((delivery.baseFee || 0) + (delivery.perKm || 0) * distanceKm) * 100) / 100;
  return { fee, distanceKm, outOfRange: false, ready: true };
}
