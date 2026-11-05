'use strict';

const { haversineKm } = require('./delivery-fee');
const MAX_MARKETPLACE_DELIVERY_KM = 5;

// Coverage is independent of the tariff (flat, distance, zones or free shipping).
function marketplaceDeliveryCoverage(rule, destination) {
  const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!rule || !valid(rule.originLat, rule.originLng)) return { error: 'DELIVERY_UNAVAILABLE' };
  if (!destination || !valid(destination.lat, destination.lng)) return { error: 'ADDRESS_NOT_FOUND' };
  const configured = Number(rule.deliveryMaxKm);
  const platformMax = Number.isFinite(rule.marketplaceMaxKm) && rule.marketplaceMaxKm >= 0.1
    ? Math.min(rule.marketplaceMaxKm, MAX_MARKETPLACE_DELIVERY_KM) : MAX_MARKETPLACE_DELIVERY_KM;
  const maxKm = rule.deliveryMaxKm != null && Number.isFinite(configured) && configured >= 0
    ? Math.min(configured, platformMax) : platformMax;
  const distanceKm = haversineKm(rule.originLat, rule.originLng, destination.lat, destination.lng);
  return { error: distanceKm > maxKm ? 'DELIVERY_OUT_OF_RANGE' : null, distanceKm };
}

module.exports = { marketplaceDeliveryCoverage, MAX_MARKETPLACE_DELIVERY_KM };
