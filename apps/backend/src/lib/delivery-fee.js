// delivery-fee.js — Cálculo autoritativo del costo de envío en el backend.
//
// Fuente ÚNICA de verdad compartida por la tienda web (store.routes.js) y el
// chatbot de WhatsApp (whatsapp-bot). Mantener el cálculo en un solo lugar
// evita que dos canales cobren envíos distintos para el mismo pedido.

// Haversine: distancia en km entre dos coordenadas.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // radio terrestre en km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Punto-en-polígono por ray casting (algoritmo par/impar). `polygon` es un
// array de vértices { lat, lng } en orden; el polígono se cierra solo. A esta
// escala (zonas de una ciudad) tratamos lat/lng como plano cartesiano — el
// error de proyección es despreciable frente al tamaño de una zona de reparto.
function pointInPolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const vi = polygon[i];
    const vj = polygon[j];
    if (!vi || !vj) continue;
    const yi = Number(vi.lat), xi = Number(vi.lng);
    const yj = Number(vj.lat), xj = Number(vj.lng);
    const intersects = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Primera zona ACTIVA (por prioridad, ya vienen ordenadas) que contiene el
// punto. Devuelve null si el punto queda fuera de todas.
function findZoneForPoint(zones, lat, lng) {
  if (!Array.isArray(zones)) return null;
  for (const z of zones) {
    if (z && z.active !== false && pointInPolygon(lat, lng, z.polygon)) return z;
  }
  return null;
}

/**
 * Calcula el costo de envío de forma autoritativa en el backend.
 * @param {object} config - RestaurantConfig. En modo ZONES se espera
 *   `config.deliveryZones` = array de zonas activas (ordenadas por prioridad),
 *   inyectado por el canal que carga la config (tienda web / bot).
 * @param {number} subtotal - subtotal del pedido (para envío gratis por monto)
 * @param {{lat:number,lng:number}|null} dest - coordenadas del cliente
 * @returns {{ fee:number, distanceKm:number|null, error:string|null, zoneId?:string, zoneName?:string }}
 */
function computeDeliveryFee(config, subtotal, dest) {
  const mode = config?.deliveryMode || 'FLAT';

  // Envío gratis por monto de compra (aplica en cualquier modo).
  const freeFrom = config?.freeDeliveryFrom;
  if (freeFrom != null && subtotal >= freeFrom) {
    return { fee: 0, distanceKm: null, error: null };
  }

  // Modo ZONES: la coordenada del cliente cae dentro de un polígono con su fee.
  if (mode === 'ZONES') {
    const zones = Array.isArray(config?.deliveryZones) ? config.deliveryZones : [];
    if (!dest || dest.lat == null || dest.lng == null) {
      // Sin coordenadas no podemos ubicar la zona: caemos a la tarifa fija como
      // mínimo razonable (mismo criterio que DISTANCE sin datos).
      return { fee: Number(config?.deliveryFee || 0), distanceKm: null, error: null };
    }
    const zone = findZoneForPoint(zones, dest.lat, dest.lng);
    if (!zone) {
      return { fee: 0, distanceKm: null, error: 'OUT_OF_RANGE' };
    }
    return { fee: Number(zone.fee || 0), distanceKm: null, error: null, zoneId: zone.id, zoneName: zone.name };
  }

  if (mode !== 'DISTANCE') {
    return { fee: Number(config?.deliveryFee || 0), distanceKm: null, error: null };
  }

  // Modo DISTANCE: requiere origen configurado y coordenadas del cliente.
  const origin = (config?.originLat != null && config?.originLng != null)
    ? { lat: config.originLat, lng: config.originLng }
    : null;
  if (!origin || !dest || dest.lat == null || dest.lng == null) {
    // Sin datos suficientes: caemos a la tarifa base como mínimo razonable.
    return { fee: Number(config?.deliveryBaseFee || config?.deliveryFee || 0), distanceKm: null, error: null };
  }

  const distanceKm = Math.round(haversineKm(origin.lat, origin.lng, dest.lat, dest.lng) * 100) / 100;

  // Fuera de cobertura.
  if (config?.deliveryMaxKm != null && distanceKm > config.deliveryMaxKm) {
    return { fee: 0, distanceKm, error: 'OUT_OF_RANGE' };
  }

  // Dentro del radio de envío gratis.
  if (config?.deliveryFreeRadiusKm != null && distanceKm <= config.deliveryFreeRadiusKm) {
    return { fee: 0, distanceKm, error: null };
  }

  const base = Number(config?.deliveryBaseFee || 0);
  const perKm = Number(config?.deliveryPerKm || 0);
  const fee = Math.round((base + perKm * distanceKm) * 100) / 100;
  return { fee, distanceKm, error: null };
}

module.exports = { haversineKm, computeDeliveryFee, pointInPolygon, findZoneForPoint };
